import json
import requests
from typing import List, Dict, Any
from backend.config import config

def extract_insights(transcripts: List[Dict[str, Any]], speaker_stats: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Uses LLMs (Groq / Gemini / OpenAI) to extract executive summaries, decisions, action items, open questions, and per-speaker sentiment.
    """
    # 1. Prioritize Groq LLM (groq/compound-mini) for ultra-fast, intelligent JSON extraction
    if config.GROQ_API_KEY:
        try:
            return _extract_insights_groq(transcripts, speaker_stats)
        except Exception as e:
            print(f"[LLMService] Groq extraction failed: {e}. Falling back...")

    # 2. Try Gemini API (gemini-2.5-flash)
    if config.GEMINI_API_KEY:
        try:
            return _extract_insights_gemini(transcripts, speaker_stats)
        except Exception as e:
            print(f"[LLMService] Gemini extraction failed: {e}. Falling back...")

    # 3. Try OpenAI API
    if config.OPENAI_API_KEY:
        try:
            return _extract_insights_openai(transcripts, speaker_stats)
        except Exception as e:
            print(f"[LLMService] OpenAI extraction failed: {e}. Falling back...")

    # 4. Smart Heuristic Engine (Fallback)
    return _extract_insights_heuristic(transcripts, speaker_stats)


def _extract_insights_groq(transcripts: List[Dict[str, Any]], speaker_stats: List[Dict[str, Any]]) -> Dict[str, Any]:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config.GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    transcript_text = "\n".join([f"[{t['speaker']} at {t['start_time']}s]: {t['text']}" for t in transcripts])
    
    prompt = f"""You are an executive AI assistant. Analyze this meeting transcript and output JSON:

{transcript_text}

JSON format:
{{
  "summary": "2-3 sentence executive summary of key discussions and deliverables",
  "topic_chapters": [
    {{"timestamp_sec": 0, "formatted_time": "0:00", "title": "Topic Title", "part": "Part 1", "description": "Key discussion breakdown"}}
  ],
  "decisions": [
    {{"text": "Decision description", "speaker": "Speaker Name", "timestamp": "0s"}}
  ],
  "action_items": [
    {{"task": "Task description", "owner": "Assigned Speaker or Team", "priority": "high/medium/low"}}
  ],
  "speaker_sentiments": [
    {{"speaker": "Speaker Name", "sentiment": "Positive", "score": 0.88, "tone_summary": "Tone summary"}}
  ]
}}
"""
    payload = {
        "model": "compound-beta-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.3
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=40)
    if resp.status_code != 200:
        raise Exception(f"Groq status {resp.status_code}: {resp.text}")
        
    content = resp.json()["choices"][0]["message"]["content"]
    cleaned = content.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _extract_insights_gemini(transcripts: List[Dict[str, Any]], speaker_stats: List[Dict[str, Any]]) -> Dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={config.GEMINI_API_KEY}"
    
    transcript_text = "\n".join([f"[{t['speaker']} at {t['start_time']}s]: {t['text']}" for t in transcripts])
    
    prompt = f"""Analyze this meeting transcript and return ONLY JSON:
{transcript_text}

Format:
{{
  "summary": "Executive summary",
  "topic_chapters": [{{"timestamp_sec": 0, "formatted_time": "0:00", "title": "Topic", "part": "Part 1", "description": "Description"}}],
  "decisions": [{{"text": "Decision", "speaker": "Speaker", "timestamp": "0s"}}],
  "action_items": [{{"task": "Task", "owner": "Owner", "priority": "high/medium/low"}}],
  "speaker_sentiments": [{{"speaker": "Speaker", "sentiment": "Positive", "score": 0.9, "tone_summary": "Tone"}}]
}}
"""
    resp = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=40)
    if resp.status_code != 200:
        raise Exception(f"Gemini API error: {resp.text}")
        
    raw_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
    cleaned = raw_text.replace("```json", "").replace("```", "").strip()
    return json.loads(cleaned)


def _extract_insights_openai(transcripts: List[Dict[str, Any]], speaker_stats: List[Dict[str, Any]]) -> Dict[str, Any]:
    url = "https://api.openai.com/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config.OPENAI_API_KEY}",
        "Content-Type": "application/json"
    }
    transcript_text = "\n".join([f"[{t['speaker']} at {t['start_time']}s]: {t['text']}" for t in transcripts])
    
    prompt = f"Analyze meeting: {transcript_text}. Return JSON with keys: summary, topic_chapters, decisions, action_items."
    payload = {
        "model": "gpt-4o-mini",
        "messages": [{"role": "user", "content": prompt}],
        "response_format": {"type": "json_object"}
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=40)
    if resp.status_code != 200:
        raise Exception(f"OpenAI error: {resp.text}")
    return json.loads(resp.json()["choices"][0]["message"]["content"])


def generate_followup_email(meeting_title: str, insights: Dict[str, Any], transcripts: List[Dict[str, Any]], tone: str = "formal") -> str:
    if config.GROQ_API_KEY:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}", "Content-Type": "application/json"}
            prompt = f"Draft a professional follow-up email in a {tone} tone for the meeting '{meeting_title}' using these insights:\n{json.dumps(insights)}"
            resp = requests.post(url, headers=headers, json={"model": "compound-beta-mini", "messages": [{"role": "user", "content": prompt}]}, timeout=30)
            if resp.status_code == 200:
                return resp.json()["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"[LLMService] Groq email error: {e}")

    # Fallback template email
    decisions_text = "\n".join([f"• {d['text'] if isinstance(d, dict) else d}" for d in insights.get("decisions", [])]) or "• No major decisions logged."
    actions = insights.get("action_items", [])
    actions_text = "\n".join([f"• [{a.get('owner', 'Team')}] {a.get('task', a.get('text', ''))}" for a in actions if isinstance(a, dict)]) or "• No action items logged."

    return f"""Subject: Meeting Follow-Up & Action Items: {meeting_title}

Hi Team,

Thank you for your active participation in today's discussion on {meeting_title}.

Executive Summary:
{insights.get('summary', 'The team convened to review project objectives, technical decisions, and upcoming milestones.')}

Key Decisions Made:
{decisions_text}

Action Items & Task Ownership:
{actions_text}

Best regards,
Meeting Coordinator
"""


def _extract_insights_heuristic(transcripts: List[Dict[str, Any]], speaker_stats: List[Dict[str, Any]]) -> Dict[str, Any]:
    decisions = []
    action_items = []
    
    for t in transcripts:
        text_lower = t.get("text", "").lower()
        if "decid" in text_lower or "agree" in text_lower or "confirm" in text_lower or "plan" in text_lower:
            decisions.append({"text": t.get("text", ""), "speaker": t.get("speaker", "Speaker"), "timestamp": f"{int(t.get('start_time', 0))}s"})
        if "will" in text_lower or "action" in text_lower or "i'll" in text_lower or "task" in text_lower or "need" in text_lower:
            action_items.append({"task": t.get("text", ""), "owner": t.get("speaker", "Speaker"), "priority": "high"})

    # Dynamically generate chapters based on real transcript turns
    topic_chapters = []
    if transcripts:
        import math
        chunk_size = max(1, len(transcripts) // 3)
        num_chunks = math.ceil(len(transcripts) / chunk_size)
        for i in range(min(3, num_chunks)):
            slice_items = transcripts[i * chunk_size : (i + 1) * chunk_size]
            if not slice_items:
                continue
            st_sec = int(slice_items[0].get("start_time", 0))
            mins = st_sec // 60
            secs = st_sec % 60
            f_time = f"{mins}:{secs:02d}"
            
            snippet = " ".join([s.get("text", "") for s in slice_items])[:120]
            title_text = slice_items[0].get("text", "").split()[:4]
            title_str = " ".join(title_text) if title_text else f"Part {i+1} Discussion"
            
            topic_chapters.append({
                "timestamp_sec": st_sec,
                "formatted_time": f_time,
                "title": title_str,
                "part": f"Part {i + 1}",
                "description": snippet
            })

    # Summary computed directly from real spoken text
    if transcripts:
        combined_text = " ".join([t.get("text", "") for t in transcripts[:5]])
        summary_text = f"Live meeting recording analysis: {combined_text[:280]}"
    else:
        summary_text = "The participants convened to discuss agenda objectives and assign action items."

    return {
        "summary": summary_text,
        "topic_chapters": topic_chapters,
        "decisions": decisions,
        "action_items": action_items,
        "speaker_sentiments": []
    }

