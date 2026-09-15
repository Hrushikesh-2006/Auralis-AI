import math
import re
import json
import requests
from typing import List, Dict, Any, Tuple
from backend.config import config

class TranscriptRAG:
    """
    Retrieval-Augmented Generation (RAG) system for meeting transcripts.
    Indexes transcript turns into vector chunks and performs TF-IDF / Cosine similarity retrieval before passing context to LLM.
    """
    
    def __init__(self, transcripts: List[Dict[str, Any]]):
        self.transcripts = transcripts
        self.chunks = []
        self.vocab = {}
        self.doc_vectors = []
        self._build_index()

    def _tokenize(self, text: str) -> List[str]:
        return re.findall(r'\w+', text.lower())

    def _build_index(self):
        # Create chunk objects
        for idx, t in enumerate(self.transcripts):
            chunk = {
                "chunk_id": idx,
                "speaker": t.get("speaker", "Unknown"),
                "start_time": t.get("start_time", 0.0),
                "end_time": t.get("end_time", 0.0),
                "text": t.get("text", ""),
                "tokens": self._tokenize(t.get("text", ""))
            }
            self.chunks.append(chunk)

        # Build TF-IDF Vocabulary
        df = {}
        total_docs = len(self.chunks) or 1
        for chunk in self.chunks:
            unique_tokens = set(chunk["tokens"])
            for tok in unique_tokens:
                df[tok] = df.get(tok, 0) + 1

        self.idf = {tok: math.log((total_docs + 1) / (count + 1)) + 1.0 for tok, count in df.items()}

        # Compute TF-IDF Vectors
        for chunk in self.chunks:
            tf = {}
            for tok in chunk["tokens"]:
                tf[tok] = tf.get(tok, 0) + 1
            
            vec = {}
            norm_sq = 0.0
            for tok, freq in tf.items():
                val = (freq / (len(chunk["tokens"]) or 1)) * self.idf.get(tok, 1.0)
                vec[tok] = val
                norm_sq += val * val
            
            norm = math.sqrt(norm_sq) or 1.0
            self.doc_vectors.append({tok: v / norm for tok, v in vec.items()})

    def retrieve(self, query: str, top_k: int = 4) -> List[Tuple[Dict[str, Any], float]]:
        """
        Retrieves top_k most semantically relevant transcript chunks for the given query.
        """
        query_tokens = self._tokenize(query)
        if not query_tokens or not self.chunks:
            return [(c, 1.0) for c in self.chunks[:top_k]]

        q_tf = {}
        for tok in query_tokens:
            q_tf[tok] = q_tf.get(tok, 0) + 1

        q_vec = {}
        q_norm_sq = 0.0
        for tok, freq in q_tf.items():
            val = (freq / len(query_tokens)) * self.idf.get(tok, 1.0)
            q_vec[tok] = val
            q_norm_sq += val * val

        q_norm = math.sqrt(q_norm_sq) or 1.0
        q_vec_norm = {tok: v / q_norm for tok, v in q_vec.items()}

        scores = []
        for idx, doc_vec in enumerate(self.doc_vectors):
            score = 0.0
            for tok, val in q_vec_norm.items():
                if tok in doc_vec:
                    score += val * doc_vec[tok]
            scores.append((self.chunks[idx], score))

        # Sort by relevance score descending
        scores.sort(key=lambda x: x[1], reverse=True)
        
        # If top scores are 0, return first k chunks
        if scores[0][1] == 0:
            return [(c, 0.5) for c in self.chunks[:top_k]]
            
        return scores[:top_k]


def rag_answer_query(meeting_title: str, transcripts: List[Dict[str, Any]], insights: Dict[str, Any], query: str) -> Dict[str, Any]:
    """
    RAG Pipeline: Retrieves relevant transcript passages, builds augmented prompt, and calls LLM (Groq / Gemini) to produce cited answer.
    """
    rag = TranscriptRAG(transcripts)
    retrieved = rag.retrieve(query, top_k=5)
    recorded_audio_summary = (insights or {}).get("summary", "").strip()
    decisions = (insights or {}).get("decisions", [])
    action_items = (insights or {}).get("action_items", [])
    topic_chapters = (insights or {}).get("topic_chapters", [])

    citations = []
    context_lines = []
    if recorded_audio_summary:
        context_lines.append(f"[Recorded audio summary]: \"{recorded_audio_summary}\"")
        citations.append({
            "speaker": "Recorded Audio Summary",
            "timestamp": "summary",
            "quote": recorded_audio_summary,
            "relevance_score": 1.0
        })

    if decisions:
        dec_str = "; ".join([f"{d.get('text', '')} ({d.get('speaker', 'Team')})" for d in decisions])
        context_lines.append(f"[Key Decisions]: \"{dec_str}\"")
        citations.append({
            "speaker": "Confirmed Decisions",
            "timestamp": "decisions",
            "quote": dec_str,
            "relevance_score": 0.95
        })

    if action_items:
        act_str = "; ".join([f"{a.get('text', '')} -> Assigned to {a.get('assignee', 'Team')}" for a in action_items])
        context_lines.append(f"[Action Items]: \"{act_str}\"")
        citations.append({
            "speaker": "Action Items",
            "timestamp": "actions",
            "quote": act_str,
            "relevance_score": 0.95
        })

    for chunk, score in retrieved:
        citations.append({
            "speaker": chunk["speaker"],
            "timestamp": f"{int(chunk['start_time'])}s",
            "quote": chunk["text"],
            "relevance_score": round(score, 2)
        })
        context_lines.append(f"[{chunk['speaker']} at {chunk['start_time']}s]: \"{chunk['text']}\"")

    context_str = "\n".join(context_lines)

    # 1. Try Groq API with user's key
    if config.GROQ_API_KEY:
        try:
            return _query_groq_rag(meeting_title, query, context_str, citations)
        except Exception as e:
            print(f"[RAGService] Groq RAG error: {e}. Falling back to Gemini...")

    # 2. Try Gemini API with user's key
    if config.GEMINI_API_KEY:
        try:
            return _query_gemini_rag(meeting_title, query, context_str, citations)
        except Exception as e:
            print(f"[RAGService] Gemini RAG error: {e}")

    # Fallback answer
    top_quote = citations[0]["quote"] if citations else (recorded_audio_summary or "the main deliverables")
    return {
        "answer": f"Based on retrieved transcript passages for '{meeting_title}', the recorded audio summary and transcript context say: \"{top_quote}\". Key points, decisions, and action items were drawn from the available meeting context.",
        "citations": citations,
        "rag_method": "TF-IDF Vector Retrieval + Heuristic RAG"
    }


from backend.services.text_utils import strip_special_characters

SYSTEM_LIMITATION = (
    "CRITICAL LIMITATION: Do NOT use ANY special characters, markdown formatting symbols "
    "(such as asterisks, hashes, underscores, backticks, brackets, braces, angle brackets, tildes, backslashes, etc.), "
    "or emojis in your response. Write purely in clean, plain English sentences using only letters, numbers, spaces, periods, commas, question marks, and exclamation marks."
)

def _query_groq_rag(meeting_title: str, query: str, context_str: str, citations: List[Dict[str, Any]]) -> Dict[str, Any]:
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {
        "Authorization": f"Bearer {config.GROQ_API_KEY}",
        "Content-Type": "application/json"
    }
    
    prompt = f"""You are an AI assistant answering questions about recorded conversation content.
{SYSTEM_LIMITATION}

Answer the user's question using the recorded audio summary, decisions, action items, and retrieved transcript passages provided below.
Start directly with the substantive answer. Do not mention the meeting title, meeting ID, filenames, retrieval, vector indexes, transcript labels, timestamps, empty sections, missing decisions, missing actions, or how the answer was generated unless the user explicitly asks. Never say that no decisions or action items were recorded. If a category has no useful content, leave it out. Keep the explanation natural, specific, and engaging.

CRITICAL INSTRUCTION ON TIMESTAMPS: Do NOT recite numerical timestamps (such as "at 12.97 seconds" or "at 15s") unless the user explicitly asks "at what timestamp" or asks for timestamps in their question. Focus purely on what was said and by whom.

Recorded Audio Summary and Retrieved Passages:
{context_str}

User Question: "{query}"
"""
    payload = {
        "model": "compound-beta-mini",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.2
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=25)
    if resp.status_code == 200:
        ans = resp.json()["choices"][0]["message"]["content"]
        clean_ans = strip_special_characters(ans)
        return {
            "answer": clean_ans,
            "citations": citations,
            "rag_method": "RAG Vector Index + Groq (groq/compound-mini)"
        }
    raise Exception(f"Groq API error: {resp.text}")


def _query_gemini_rag(meeting_title: str, query: str, context_str: str, citations: List[Dict[str, Any]]) -> Dict[str, Any]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={config.GEMINI_API_KEY}"
    prompt = f"""You are an AI assistant answering questions about recorded conversation content.
{SYSTEM_LIMITATION}

Answer the user question using the recorded meeting context. Start directly with the substantive answer. Do not mention titles, IDs, filenames, retrieval, internal labels, empty sections, missing decisions, missing actions, or how the answer was generated. Provide a clear natural explanation of the actual content.
CRITICAL INSTRUCTION ON TIMESTAMPS: Do NOT recite numerical timestamps unless the user specifically asks for timestamps.

Recorded Audio Summary and Retrieved Transcript Passages:
{context_str}

User Question: "{query}"
"""
    resp = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=25)
    if resp.status_code == 200:
        ans = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        clean_ans = strip_special_characters(ans)
        return {
            "answer": clean_ans,
            "citations": citations,
            "rag_method": "RAG Vector Index + Gemini 2.5 Flash"
        }
    raise Exception(f"Gemini API error: {resp.text}")


