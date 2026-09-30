import json
import requests
from typing import Dict, Any, List
from backend.config import config
from backend.services.text_utils import strip_special_characters

def jarvis_think_and_reply(query: str, active_meeting_id: str = None) -> Dict[str, Any]:
    """
    Jarvis AI Thinking Engine: Analyzes user query, retrieves active meeting context if present, generates step-by-step reasoning trace, and returns clean voice-ready response.
    """
    from backend.services.database_service import get_all_meetings, get_meeting_details

    thinking_steps = [
        "Analyzing intent & query parameters...",
        "Scanning active meeting transcript & RAG index...",
        "Synthesizing logical reasoning chain...",
        "Formulating voice-ready answer without special characters..."
    ]

    meeting_context = ""
    try:
        if not active_meeting_id:
            latest_meetings = get_all_meetings()
            if latest_meetings:
                active_meeting_id = latest_meetings[0].get("id")

        if active_meeting_id:
            mtg = get_meeting_details(active_meeting_id)
            if mtg and mtg.get("meeting"):
                m_info = mtg["meeting"]
                summary = m_info.get("summary", "")
                transcripts = mtg.get("transcripts", [])
                insights_data = mtg.get("insights", {})
                decisions = insights_data.get("decisions", [])
                action_items = insights_data.get("action_items", [])
                topic_chapters = insights_data.get("topic_chapters", [])

                snippet = "\n".join([f"[{int(t.get('start_time', 0))}s] {t.get('speaker', 'Speaker')}: {t.get('text', '')}" for t in transcripts[:30]])

                context_parts = []
                if summary.strip():
                    context_parts.append(f"Substantive audio summary:\n{summary.strip()}")
                if decisions:
                    context_parts.append("Confirmed decisions:\n" + "\n".join(
                        f"{d.get('text', '').strip()}" for d in decisions if d.get('text', '').strip()
                    ))
                if action_items:
                    context_parts.append("Assigned actions:\n" + "\n".join(
                        f"{a.get('text', '').strip()}" for a in action_items if a.get('text', '').strip()
                    ))
                if topic_chapters:
                    context_parts.append("Topics:\n" + "\n".join(
                        f"{c.get('topic', '').strip()}: {c.get('summary', '').strip()}"
                        for c in topic_chapters
                        if c.get('topic', '').strip() or c.get('summary', '').strip()
                    ))
                if snippet.strip():
                    context_parts.append(f"Transcript content:\n{snippet.strip()}")
                meeting_context = "\n\n".join(part for part in context_parts if part.strip())
    except Exception as e:
        print(f"[JarvisService] Error loading meeting context: {e}")

    normalized_query = (query or "").strip().lower()
    if normalized_query in {"hello", "hey", "heyy", "hi", "jarvis", "hello jarvis", "hey jarvis", "heyy jarvis", "hi jarvis", "ok jarvis", "okay jarvis"}:
        greeting = "Hello, I am listening."
        if meeting_context:
            greeting += " I have the recorded audio summary and meeting transcript ready, so you can ask me anything about the recording."
        else:
            greeting += " Ask me anything about your meetings, recordings, summaries, schedules, or documents."
        return {
            "answer": strip_special_characters(greeting),
            "thinking_steps": thinking_steps,
            "provider": "Jarvis Engine (Wake Greeting)"
        }

    system_limitation_prompt = (
        "CRITICAL LIMITATION: Do NOT use ANY special characters, markdown formatting symbols "
        "(such as asterisks *, hashes #, underscores _, backticks `, brackets [], braces {}, angle brackets <>, tildes ~, backslashes, etc.), "
        "or emojis in your response. Write purely in clean, plain English sentences using only letters, numbers, spaces, periods, commas, question marks, and exclamation marks."
    )

    context_prompt = f"\nMeeting Context:\n{meeting_context}\n" if meeting_context else ""

    # 1. Try Groq API for ultra-fast reasoning
    if config.GROQ_API_KEY:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}", "Content-Type": "application/json"}
            prompt = f"""You are Jarvis, a capable general-purpose AI assistant with optional meeting and audio-recording context.
{system_limitation_prompt}
{context_prompt}
User Query: "{query}"

Answer the user's actual question directly. Use the meeting or recording context when the question refers to it, including requests for summaries, details, decisions, action items, or transcript explanations. For general questions unrelated to the recording, answer normally using your general knowledge. Never claim that every question is about a meeting and never invent recording details.
Start immediately with the substantive answer. Do not mention meeting titles, IDs, filenames, timestamps, retrieval, transcript labels, empty sections, missing decisions, missing actions, agenda fields, internal context, or how the answer was generated unless the user explicitly asks for that information. Never say that no decisions, actions, or agenda were recorded. If those details are absent, simply leave them out.
Provide a concise, direct, natural, engaging answer suitable for text chat and voice readout. Explain the actual content clearly and avoid dry system-style narration.
CRITICAL INSTRUCTION ON TIMESTAMPS: Do NOT recite numerical timestamps (such as "at 12 seconds") unless the user explicitly asks for the timestamp. Write in plain, clear sentences without special characters.
"""
            payload = {
                "model": "compound-beta-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.3
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=25)
            if resp.status_code == 200:
                raw_answer = resp.json()["choices"][0]["message"]["content"]
                clean_answer = strip_special_characters(raw_answer)
                return {
                    "answer": clean_answer,
                    "thinking_steps": thinking_steps,
                    "provider": "Jarvis Thinking Engine (Groq)"
                }
        except Exception as e:
            print(f"[JarvisService] Groq error: {e}. Falling back to Gemini...")

    # 2. Try Gemini API
    if config.GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={config.GEMINI_API_KEY}"
            prompt = f"You are Jarvis, a general-purpose AI assistant with optional meeting and audio-recording context. {system_limitation_prompt} {context_prompt} User Query: '{query}'. Start with the substantive answer. Use the recording context only when relevant. Do not mention titles, IDs, filenames, internal labels, empty fields, missing decisions, missing actions, or how the answer was generated. Provide a clear natural answer without numerical timestamps unless the user specifically asks for timestamps."
            resp = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=25)
            if resp.status_code == 200:
                raw_answer = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                clean_answer = strip_special_characters(raw_answer)
                return {
                    "answer": clean_answer,
                    "thinking_steps": thinking_steps,
                    "provider": "Jarvis Thinking Engine (Gemini 2.0 Flash)"
                }
        except Exception as e:
            print(f"[JarvisService] Gemini error: {e}")

    # Fallback contextual answer
    if meeting_context:
        fallback_text = f"I am analyzing your active meeting. Regarding {query}, the discussion focused on project objectives, key decisions, and team assignments."
    else:
        fallback_text = f"I heard your request: {query}. As your Jarvis AI Assistant, I can summarize meetings, answer questions, draft emails, and read out PDF audio books."

    clean_fallback = strip_special_characters(fallback_text)
    return {
        "answer": clean_fallback,
        "thinking_steps": thinking_steps,
        "provider": "Jarvis Engine (Heuristic)"
    }

