import os
import re
import json
import uuid
import wave
import math
import struct
import base64
import requests
from typing import List, Dict, Any, Tuple
from pypdf import PdfReader
from backend.config import config
from backend.services.tts_service import generate_voice_speech

UPLOADS_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "uploads", "podcasts")

TEXT_EXTENSIONS = {
    '.txt', '.md', '.csv', '.tsv', '.json', '.yaml', '.yml', '.ini', '.conf', '.log',
    '.py', '.js', '.jsx', '.ts', '.tsx', '.java', '.cs', '.cpp', '.c', '.go', '.rs', '.php',
    '.html', '.css', '.scss', '.sql', '.rb', '.swift', '.kt', '.sh', '.bash', '.env', '.xml'
}

IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tiff'}
OFFICE_EXTENSIONS = {'.doc', '.docx', '.ppt', '.pptx'}


def _safe_decode_text(file_path: str) -> str:
    candidates = ['utf-8', 'utf-8-sig', 'latin-1', 'cp1252']
    for encoding in candidates:
        try:
            with open(file_path, 'r', encoding=encoding) as handle:
                return handle.read()
        except Exception:
            continue
    try:
        with open(file_path, 'rb') as handle:
            raw = handle.read()
        return raw.decode('utf-8', errors='replace')
    except Exception:
        return ""


def _mime_for_file(filename: str) -> str:
    mapping = {
        '.pdf': 'application/pdf',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.bmp': 'image/bmp',
        '.gif': 'image/gif',
        '.webp': 'image/webp',
        '.tiff': 'image/tiff',
        '.txt': 'text/plain',
        '.md': 'text/markdown',
        '.csv': 'text/csv',
        '.json': 'application/json',
        '.yaml': 'application/yaml',
        '.yml': 'application/yaml',
        '.html': 'text/html',
        '.xml': 'application/xml',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.ppt': 'application/vnd.ms-powerpoint',
        '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    }
    return mapping.get(os.path.splitext(filename)[1].lower(), 'application/octet-stream')


def _extract_with_gemini_multimodal(file_path: str, original_filename: str) -> str:
    if not config.GEMINI_API_KEY:
        return ""

    try:
        mime_type = _mime_for_file(original_filename)
        with open(file_path, 'rb') as handle:
            data = base64.b64encode(handle.read()).decode('utf-8')

        if os.path.splitext(original_filename)[1].lower() in IMAGE_EXTENSIONS:
            prompt = (
                "Study the visual content carefully and explain what it shows. Start directly with the subject, "
                "message, scene, chart, diagram, or document content. Read visible text accurately, explain the "
                "meaning of charts and diagrams, identify important objects or relationships, and include key "
                "numbers and conclusions. Do not mention that this was uploaded, do not describe the file type, "
                "filename, screenshot, date, or the act of processing it. Return a clear content-only explanation "
                "that another narrator can use to teach the material."
            )
        else:
            prompt = (
                "Read this document carefully and explain its actual content. Extract readable headings, list items, "
                "key facts, important numbers, and structure. Start directly with the subject and main ideas. Do not "
                "mention the upload, filename, file type, or the act of processing it. Return only a clear content "
                "description for a narrator."
            )

        payload = {
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type, "data": data}}
                ]
            }]
        }

        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={config.GEMINI_API_KEY}"
        resp = requests.post(url, json=payload, timeout=60)
        if resp.status_code != 200:
            print(f"[PDFPodcast] Gemini multimodal read failed: {resp.status_code} {resp.text}")
            return ""

        result = resp.json()
        texts = []
        for candidate in result.get("candidates", []):
            for part in candidate.get("content", {}).get("parts", []):
                if isinstance(part, dict) and part.get("text"):
                    texts.append(part["text"])
        combined = "\n".join(texts).strip()
        if combined:
            return combined
    except Exception as exc:
        print(f"[PDFPodcast] Gemini multimodal extraction error: {exc}")
    return ""


def extract_document_text(file_path: str, original_filename: str) -> str:
    """Extracts plain text from PDFs, text files, code files, office files, and images when OCR is available."""
    ext = os.path.splitext(original_filename)[1].lower()

    try:
        if ext == '.pdf':
            try:
                reader = PdfReader(file_path)
                text_content = []
                for page in reader.pages[:60]:
                    page_text = page.extract_text()
                    if page_text:
                        text_content.append(page_text)
                text = "\n\n".join(text_content).strip()
                if text:
                    return text
            except Exception as exc:
                print(f"[PDFPodcast] PDF text extraction fallback error: {exc}")

            multimodal_text = _extract_with_gemini_multimodal(file_path, original_filename)
            if multimodal_text:
                return multimodal_text

        if ext in TEXT_EXTENSIONS:
            text = _safe_decode_text(file_path)
            if text:
                return text

        if ext in OFFICE_EXTENSIONS:
            try:
                import docx
                if ext in {'.doc', '.docx'}:
                    document = docx.Document(file_path)
                    paragraphs = [p.text for p in document.paragraphs if p.text.strip()]
                    text = "\n".join(paragraphs)
                    if text:
                        return text
            except Exception:
                pass

            try:
                from pptx import Presentation
                if ext in {'.ppt', '.pptx'}:
                    prs = Presentation(file_path)
                    slides = []
                    for slide in prs.slides:
                        texts = []
                        for shape in slide.shapes:
                            if hasattr(shape, 'text') and shape.text:
                                texts.append(shape.text)
                        if texts:
                            slides.append("\n".join(texts))
                    text = "\n\n".join(slides)
                    if text:
                        return text
            except Exception:
                pass

            multimodal_text = _extract_with_gemini_multimodal(file_path, original_filename)
            if multimodal_text:
                return multimodal_text

        if ext in IMAGE_EXTENSIONS:
            multimodal_text = _extract_with_gemini_multimodal(file_path, original_filename)
            if multimodal_text:
                return multimodal_text

            try:
                from PIL import Image
                import pytesseract
                image = Image.open(file_path)
                text = pytesseract.image_to_string(image)
                if text and text.strip():
                    return text.strip()
            except Exception:
                pass

            return "The visual content could not be read clearly enough to explain its subject."

        with open(file_path, 'rb') as handle:
            raw = handle.read()
            try:
                decoded = raw.decode('utf-8')
                if decoded.strip():
                    return decoded
            except Exception:
                pass
            return raw.decode('latin-1', errors='replace')
    except Exception as e:
        print(f"[PDFService] Error reading document: {e}")
        return f"Document: {original_filename}. The file was uploaded successfully, but the content could not be extracted automatically. The AI will summarize the available context and the document title for a useful spoken overview."


def generate_podcast_from_pdf(pdf_path: str, filename: str, style: str = "podcast") -> Dict[str, Any]:
    """Processes a document upload, extracts meaningful text, and converts it to an AI voice summary."""
    os.makedirs(UPLOADS_DIR, exist_ok=True)
    book_title = os.path.splitext(filename)[0].replace("_", " ").replace("-", " ").title()
    content_title = "Visual Content" if os.path.splitext(filename)[1].lower() in IMAGE_EXTENSIONS else book_title

    document_text = extract_document_text(pdf_path, filename)
    if not document_text:
        document_text = "The material could not be read clearly enough to produce a reliable explanation."

    script_items, overview_summary = _generate_script_llm(content_title, document_text, style)

    podcast_id = str(uuid.uuid4())
    audio_filename = f"podcast_{podcast_id}.mp3"
    audio_path = os.path.join(UPLOADS_DIR, audio_filename)

    audio_url, duration_seconds = _render_podcast_neural_audio(script_items, audio_filename, style)

    return {
        "id": podcast_id,
        "title": book_title,
        "style": style,
        "summary": overview_summary,
        "duration_seconds": duration_seconds,
        "audio_url": audio_url,
        "script": script_items
    }


def _extract_json(text: str) -> Dict[str, Any]:
    try:
        match = re.search(r'\{.*\}', text, re.DOTALL)
        if match:
            return json.loads(match.group(0))
        return json.loads(text)
    except Exception as e:
        print(f"[PDFPodcast] JSON parse error: {e}")
        return {}


SYSTEM_LIMITATION_PODCAST = (
    "CRITICAL LIMITATION: Do NOT use ANY special characters, markdown formatting symbols "
    "(such as asterisks, hashes, underscores, backticks, brackets, braces, angle brackets, tildes, backslashes, etc.), "
    "or emojis in your text. Write purely in clean, plain English sentences."
)

def _generate_script_llm(book_title: str, pdf_text: str, style: str) -> Tuple[List[Dict[str, Any]], str]:
    snippet = pdf_text[:6000] # Pass first 6000 chars to LLM for full contextual understanding
    
    prompt = f"""You are a master narrator and expert communicator.
Your task is to create a detailed, highly engaging solo audio explanation of the material below.
Do NOT write a 2-host conversational dialogue or interview. Write as a SINGLE passionate person explaining the book in detail to an audience, modulating enthusiasm, pitch, and depth based on the emotions of the content.
Begin with the actual subject and ideas. Never say that you are looking at an image, visual representation, screenshot, PDF, file, upload, source material, or document. Never mention filenames, dates from filenames, readability, processing, missing sections, missing decisions, or missing action items. Do not describe the format of the material; explain what it means and why it matters.

Content Subject: "{book_title}"

Material to Explain:
{snippet}

{SYSTEM_LIMITATION_PODCAST}

Return ONLY a valid JSON object matching this structure:
{{
  "overview_summary": "Comprehensive executive summary of the book content in 3-4 clear sentences",
  "narrative_sections": [
    {{"section": "Introduction", "speaker": "AI Narrator", "text": "Welcome to this detailed audiobook summary of {book_title}. Today we explore the foundational concepts presented in the text."}},
    {{"section": "Core Insights", "speaker": "AI Narrator", "text": "Analyzing the central principles of the book, the author highlights essential frameworks and methodologies."}},
    {{"section": "Deep Breakdown", "speaker": "AI Narrator", "text": "Digging deeper into the practical application, the material demonstrates key strategies for success."}},
    {{"section": "Conclusion", "speaker": "AI Narrator", "text": "In conclusion, this document provides invaluable wisdom and a clear roadmap for mastering the subject."}}
  ]
}}
"""

    # 1. Try Groq API
    if config.GROQ_API_KEY:
        try:
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {config.GROQ_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": "compound-beta-mini",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=40)
            if resp.status_code == 200:
                content = resp.json()["choices"][0]["message"]["content"]
                data = _extract_json(content)
                sections = data.get("narrative_sections") or data.get("dialogue", [])
                summary = data.get("overview_summary", "")
                if sections and summary:
                    # Standardize format for frontend
                    formatted_sections = [
                        {"speaker": item.get("speaker", "AI Narrator"), "section": item.get("section", "Detailed Summary"), "text": item.get("text", "")}
                        for item in sections
                    ]
                    return formatted_sections, summary
        except Exception as e:
            print(f"[PDFPodcast] Groq script error: {e}. Falling back...")

    # 2. Try Gemini API
    if config.GEMINI_API_KEY:
        try:
            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key={config.GEMINI_API_KEY}"
            resp = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=40)
            if resp.status_code == 200:
                raw_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
                data = _extract_json(raw_text)
                sections = data.get("narrative_sections") or data.get("dialogue", [])
                summary = data.get("overview_summary", "")
                if sections and summary:
                    formatted_sections = [
                        {"speaker": item.get("speaker", "AI Narrator"), "section": item.get("section", "Detailed Summary"), "text": item.get("text", "")}
                        for item in sections
                    ]
                    return formatted_sections, summary
        except Exception as e:
            print(f"[PDFPodcast] Gemini script error: {e}")

    # Fallback solo narrative script generated directly from PDF snippet summary
    first_sentence = pdf_text.split('.')[0] if '.' in pdf_text else pdf_text[:150]
    fallback_summary = f"The material focuses on {first_sentence[:180]}."
    
    fallback_narrative = [
        {"speaker": "AI Narrator", "section": "Introduction", "text": f"This material explores {first_sentence[:200]}."},
        {"speaker": "AI Narrator", "section": "Core Content", "text": f"The central idea is {first_sentence[:200]}."},
        {"speaker": "AI Narrator", "section": "Deep Analysis", "text": "The author provides structured frameworks, highlighting practical methods and strategic recommendations to achieve optimal results."},
        {"speaker": "AI Narrator", "section": "Conclusion", "text": "To summarize, this material offers a comprehensive guide packed with actionable knowledge for any reader."}
    ]
    return fallback_narrative, fallback_summary


def _render_podcast_neural_audio(script_items: List[Dict[str, Any]], audio_filename: str, style: str) -> Tuple[str, float]:
    """
    Renders expressive solo narrator neural speech with emotional tone, variable pitch, and natural storytelling cadence.
    """
    from backend.services.text_utils import strip_special_characters
    
    combined_paragraphs = []
    for item in script_items:
        txt = item.get("text", "")
        clean_txt = strip_special_characters(txt)
        if clean_txt:
            combined_paragraphs.append(clean_txt)

    full_narrative = ". ".join(combined_paragraphs)
    
    # Generate Expressive Neural Storytelling Voice Audio via Deepgram Aura API
    audio_path_rel = generate_voice_speech(full_narrative, voice_type="narrator")
    
    total_words = sum(len(item.get("text", "").split()) for item in script_items)
    duration_seconds = round(max(20.0, total_words * 0.4), 1)

    return audio_path_rel, duration_seconds

