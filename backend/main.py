import os
import shutil
import uuid
from typing import Optional
from fastapi import FastAPI, UploadFile, File, Form, Query, HTTPException, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from backend.config import config, update_keys, get_key_status
from backend.services.transcription_service import transcribe_and_diarize
from backend.services.llm_service import extract_insights, generate_followup_email
from backend.services.database_service import (
    save_meeting,
    get_all_meetings,
    get_meeting_details,
    search_meetings
)

app = FastAPI(title="Meeting Insights Dashboard API", version="1.0.0")

# Enable CORS for Vite frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Uploads directory
if os.environ.get("VERCEL") == "1":
    UPLOADS_DIR = os.path.join("/tmp", "uploads")
else:
    UPLOADS_DIR = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(UPLOADS_DIR, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOADS_DIR), name="uploads")


class KeysModel(BaseModel):
    GEMINI_API_KEY: Optional[str] = None
    OPENAI_API_KEY: Optional[str] = None
    DEEPGRAM_API_KEY: Optional[str] = None
    ASSEMBLYAI_API_KEY: Optional[str] = None
    GROQ_API_KEY: Optional[str] = None
    TRANSCRIPTION_PROVIDER: Optional[str] = None
    LLM_PROVIDER: Optional[str] = None
    GOOGLE_CLIENT_ID: Optional[str] = None
    DATABASE_URL: Optional[str] = None


class GoogleLoginModel(BaseModel):
    credential: Optional[str] = None
    access_token: Optional[str] = None
    client_id: Optional[str] = None


class EmailRequestModel(BaseModel):
    tone: str = "formal"


class ChatRequestModel(BaseModel):
    query: str
    start_time: Optional[float] = 0.0
    end_time: Optional[float] = None


@app.get("/api/health")
def health_check():
    return {"status": "healthy", "service": "Meeting Insights Dashboard API"}


@app.get("/api/auth/config")
def get_auth_config():
    return {
        "google_client_id": config.GOOGLE_CLIENT_ID,
        "enabled": bool(config.GOOGLE_CLIENT_ID),
        "database_type": "postgres" if config.DATABASE_URL else "sqlite"
    }


@app.post("/api/auth/google")
def google_login(body: GoogleLoginModel):
    from backend.services.auth_service import sign_in_with_google
    result = sign_in_with_google(
        credential=body.credential,
        access_token=body.access_token,
        client_id=body.client_id
    )
    return {"status": "success", "data": result}


@app.post("/api/auth/demo")
def demo_auth_login():
    from backend.services.auth_service import demo_login
    result = demo_login()
    return {"status": "success", "data": result}


@app.get("/api/auth/me")
def auth_me(authorization: Optional[str] = Header(None)):
    from backend.services.auth_service import get_current_user_from_header
    user = get_current_user_from_header(authorization)
    return {"status": "success", "data": {"user": user}}
@app.get("/api/config")
def get_config():
    return get_key_status()


@app.post("/api/config")
def set_config(keys: KeysModel):
    updated = update_keys(keys.dict(exclude_unset=True))
    return {"status": "success", "keys_status": updated}


@app.post("/api/process-audio")
async def process_audio(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None)
):
    """
    Accepts uploaded audio or recorded audio blob, transcribes & diarizes it, extracts insights, and stores meeting record.
    """
    ext = os.path.splitext(file.filename)[1] or ".wav"
    file_id = str(uuid.uuid4())
    saved_filename = f"{file_id}{ext}"
    saved_path = os.path.join(UPLOADS_DIR, saved_filename)
    
    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    meeting_title = title or file.filename.replace(ext, "").replace("_", " ").title()
    audio_url = f"/uploads/{saved_filename}"

    # 1. Transcribe & Speaker Diarization
    transcripts, speaker_stats, duration_seconds = transcribe_and_diarize(saved_path, filename=file.filename)

    # 2. Extract LLM Insights & Per-Speaker Sentiment
    insights = extract_insights(transcripts, speaker_stats)

    # 3. Store in SQLite
    meeting_id = save_meeting(
        title=meeting_title,
        duration_seconds=duration_seconds,
        audio_url=audio_url,
        transcripts=transcripts,
        insights=insights,
        speaker_stats=speaker_stats,
        summary=insights.get("summary", "")
    )

    # Return full processed detail
    full_record = get_meeting_details(meeting_id)
    return {
        "status": "success",
        "meeting_id": meeting_id,
        "data": full_record
    }


@app.get("/api/meetings")
def list_meetings(q: Optional[str] = Query(None)):
    if q:
        return search_meetings(q)
    return get_all_meetings()


@app.get("/api/meetings/{meeting_id}")
def get_meeting(meeting_id: str):
    details = get_meeting_details(meeting_id)
    if not details:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return details


@app.post("/api/meetings/{meeting_id}/email")
def draft_email(meeting_id: str, body: EmailRequestModel):
    details = get_meeting_details(meeting_id)
    if not details:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    meeting_title = details["meeting"]["title"]
    insights = details["insights"]
    transcripts = details["transcripts"]
    
    email_text = generate_followup_email(meeting_title, insights, transcripts, tone=body.tone)
    return {"status": "success", "email_body": email_text}


@app.post("/api/meetings/{meeting_id}/chat")
def meeting_copilot_chat(meeting_id: str, body: ChatRequestModel):
    details = get_meeting_details(meeting_id)
    if not details:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    from backend.services.rag_service import rag_answer_query
    
    rag_insights = dict(details.get("insights") or {})
    rag_insights["summary"] = details.get("meeting", {}).get("summary", "")

    rag_result = rag_answer_query(
        meeting_title=details["meeting"]["title"],
        transcripts=details["transcripts"],
        insights=rag_insights,
        query=body.query
    )

    from backend.services.tts_service import generate_voice_speech
    answer_text = rag_result.get("answer", "")
    rag_result["voice_audio_url"] = generate_voice_speech(answer_text, voice_type="female_jarvis")

    return {"status": "success", "data": rag_result}


@app.post("/api/meetings/{meeting_id}/voice-summary")
def get_voice_summary(meeting_id: str):
    details = get_meeting_details(meeting_id)
    if not details:
        raise HTTPException(status_code=404, detail="Meeting not found")
        
    from backend.services.tts_service import generate_voice_summary
    
    meeting_title = details["meeting"]["title"]
    summary_text = details["meeting"].get("summary") or "The team confirmed key architectural choices and assigned deliverable tasks."
    
    audio_url = generate_voice_summary(meeting_id, summary_text, meeting_title)
    return {
        "status": "success",
        "voice_audio_url": audio_url,
        "summary_text": summary_text
    }


# --- PDF Audio Book & 2-Host AI Podcast Endpoints ---

@app.post("/api/podcasts/process-pdf")
async def process_pdf_podcast(
    file: UploadFile = File(...),
    style: str = Form("podcast")
):
    """
    Accepts an uploaded PDF book, extracts text, generates an engaging 2-host podcast script using LLMs, renders Python TTS voice audio, and saves to database.
    """
    ext = os.path.splitext(file.filename)[1] or ".pdf"
    file_id = str(uuid.uuid4())
    saved_filename = f"book_{file_id}{ext}"
    saved_path = os.path.join(UPLOADS_DIR, saved_filename)

    with open(saved_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    from backend.services.pdf_podcast_service import generate_podcast_from_pdf
    from backend.services.database_service import save_podcast, get_podcast_details

    podcast_data = generate_podcast_from_pdf(saved_path, file.filename, style=style)
    podcast_id = save_podcast(podcast_data)
    
    full_detail = get_podcast_details(podcast_id)
    return {
        "status": "success",
        "podcast_id": podcast_id,
        "data": full_detail
    }


@app.get("/api/podcasts")
def list_podcasts():
    from backend.services.database_service import get_all_podcasts
    return get_all_podcasts()


@app.get("/api/podcasts/{podcast_id}")
def get_podcast(podcast_id: str):
    from backend.services.database_service import get_podcast_details
    details = get_podcast_details(podcast_id)
    if not details:
        raise HTTPException(status_code=404, detail="Podcast not found")
    return details


# --- Jarvis Voice Wake-Word & Real-time Thinking AI Endpoint ---

class JarvisQueryModel(BaseModel):
    query: str
    active_meeting_id: Optional[str] = None


class ScheduleCreateModel(BaseModel):
    title: Optional[str] = "Untitled Meeting"
    scheduled_time: Optional[str] = None
    description: Optional[str] = ""
    remind_before_minutes: Optional[int] = 1


class ScheduleStatusModel(BaseModel):
    status: Optional[str] = "upcoming"


class SpeakReminderModel(BaseModel):
    title: Optional[str] = "Meeting"
    scheduled_time: Optional[str] = None
    reminder_type: Optional[str] = "auto" # "1min", "started", or "custom"


@app.post("/api/jarvis/think")
def jarvis_think(body: JarvisQueryModel):
    from backend.services.jarvis_service import jarvis_think_and_reply
    from backend.services.tts_service import generate_voice_speech

    result = jarvis_think_and_reply(body.query or "Hello", body.active_meeting_id)
    answer_text = result.get("answer", "")
    
    # Generate Deepgram Aura Deep-Bass Neural Voice Audio
    voice_url = generate_voice_speech(answer_text, voice_type="jarvis")
    result["voice_audio_url"] = voice_url
    
    return {"status": "success", "data": result}


# --- Meeting Schedules & Spoken Voice Reminder Endpoints ---

@app.get("/api/schedules")
def list_schedules():
    from backend.services.database_service import get_all_schedules
    return get_all_schedules()


@app.post("/api/schedules")
def create_schedule(body: ScheduleCreateModel):
    from backend.services.database_service import save_schedule
    from datetime import datetime
    sch_time = body.scheduled_time or datetime.now().isoformat()
    sch_title = body.title or "Untitled Meeting"
    remind_before = max(1, body.remind_before_minutes or 1)
    new_sch = save_schedule(sch_title, sch_time, body.description or "", remind_before)
    return {"status": "success", "data": new_sch}


@app.patch("/api/schedules/{schedule_id}/status")
def patch_schedule_status(schedule_id: str, body: ScheduleStatusModel):
    from backend.services.database_service import update_schedule_status
    updated = update_schedule_status(schedule_id, body.status)
    if not updated:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return {"status": "success", "data": updated}


@app.delete("/api/schedules/{schedule_id}")
def remove_schedule(schedule_id: str):
    from backend.services.database_service import delete_schedule
    delete_schedule(schedule_id)
    return {"status": "success"}


@app.post("/api/schedules/speak-reminder")
def speak_schedule_reminder(body: SpeakReminderModel):
    from backend.services.tts_service import generate_voice_speech
    from backend.services.text_utils import strip_special_characters
    from datetime import datetime

    title = strip_special_characters(body.title or "Meeting")
    rem_type = body.reminder_type or "auto"
    sch_time_str = body.scheduled_time

    formatted_time = ""
    time_diff_minutes = 0

    if sch_time_str:
        try:
            sch_dt = datetime.fromisoformat(sch_time_str.replace("Z", "+00:00"))
            formatted_time = sch_dt.strftime("%I:%M %p")
            now_dt = datetime.now()
            time_diff_sec = (sch_dt.replace(tzinfo=None) - now_dt).total_seconds()
            time_diff_minutes = max(0, round(time_diff_sec / 60))
        except Exception:
            formatted_time = sch_time_str

    if rem_type == "reminder":
        if time_diff_minutes >= 60:
            hr = round(time_diff_minutes / 60, 1)
            hr_label = f"{int(hr)} hour" if hr == int(hr) else f"{hr} hours"
            prompt = f"Reminder: Your scheduled meeting {title} will start in {hr_label}."
        elif time_diff_minutes > 1:
            prompt = f"Reminder: Your scheduled meeting {title} will start in {time_diff_minutes} minutes."
        elif time_diff_minutes == 1:
            prompt = f"Reminder: Your scheduled meeting {title} will start in 1 minute."
        else:
            prompt = f"Reminder: Your scheduled meeting {title} is starting very soon."
    elif rem_type == "started":
        prompt = f"Attention: Your scheduled meeting {title} is starting now."
    elif sch_time_str and time_diff_minutes > 1:
        prompt = f"Reminder: Your meeting {title} is scheduled for {formatted_time}, which is in {time_diff_minutes} minutes."
    elif sch_time_str and time_diff_minutes == 1:
        prompt = f"Reminder: Your meeting {title} is scheduled for {formatted_time} and starts in 1 minute."
    elif sch_time_str and time_diff_minutes <= 0:
        prompt = f"Attention: Your meeting {title} was scheduled for {formatted_time} and is starting now."
    else:
        prompt = f"Attention: Your scheduled meeting {title} will start now."

    prompt = strip_special_characters(prompt)
    voice_url = generate_voice_speech(prompt, voice_type="jarvis")
    return {"status": "success", "voice_audio_url": voice_url, "text": prompt}







