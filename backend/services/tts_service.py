import os
import re
import uuid
import requests
from backend.config import config
from backend.services.text_utils import strip_special_characters

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads")


def generate_voice_speech(text: str, voice_type: str = "female_jarvis", emotion: str = "expressive") -> str:
    """
    Generates studio-quality, clear neural speech with emotional tone, natural pitch, and context-aware inflection.
    Supported voice_types: 'female_jarvis' (aura-asteria-en), 'male_jarvis' (aura-arcas-en), 'narrator' (aura-orion-en), 'host_female' (aura-luna-en)
    """
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    audio_id = str(uuid.uuid4())
    file_name = f"voice_{audio_id}.mp3"
    file_path = os.path.join(UPLOADS_DIR, file_name)

    # Clean text strictly removing all special characters for speech
    clean_text = strip_special_characters(text)
    if not clean_text:
        clean_text = "Audio processing complete."

    # Select Deepgram Aura Neural Voice Model (Default: aura-asteria-en crystal-clear female voice)
    voice_models = {
        "female_jarvis": "aura-asteria-en", # Expressive, clear female neural voice
        "jarvis": "aura-asteria-en",        # Default female voice
        "male_jarvis": "aura-arcas-en",    # Deep male voice
        "narrator": "aura-orion-en",       # Warm storytelling voice
        "host_female": "aura-luna-en"       # Energetic female voice
    }
    model = voice_models.get(voice_type, "aura-asteria-en")

    # 1. Try Deepgram Aura Neural Voice API
    if config.DEEPGRAM_API_KEY:
        try:
            url = f"https://api.deepgram.com/v1/speak?model={model}"
            headers = {
                "Authorization": f"Token {config.DEEPGRAM_API_KEY}",
                "Content-Type": "application/json"
            }
            payload = {"text": clean_text}
            resp = requests.post(url, headers=headers, json=payload, timeout=30)
            if resp.status_code == 200 and len(resp.content) > 100:
                with open(file_path, "wb") as f:
                    f.write(resp.content)
                return f"/uploads/{file_name}"
        except Exception as e:
            print(f"[TTSService] Deepgram Aura error: {e}. Falling back...")

    # 2. Try pyttsx3 fallback
    try:
        import pyttsx3
        engine = pyttsx3.init()
        engine.setProperty('rate', 155)
        # Select female voice if available
        voices = engine.getProperty('voices')
        for v in voices:
            if 'female' in v.name.lower() or 'zira' in v.name.lower():
                engine.setProperty('voice', v.id)
                break
        engine.save_to_file(clean_text, file_path)
        engine.runAndWait()
    except Exception as e:
        print(f"[TTSService] pyttsx3 fallback error: {e}")

    if os.path.exists(file_path) and os.path.getsize(file_path) > 0:
        return f"/uploads/{file_name}"
    return None


def generate_voice_summary(meeting_id: str, summary_text: str, title: str) -> str:
    """
    Generates expressive female voice readout audio for meeting summary.
    """
    intro_text = f"Meeting Summary for {title}. {summary_text}"
    return generate_voice_speech(intro_text, voice_type="female_jarvis")
