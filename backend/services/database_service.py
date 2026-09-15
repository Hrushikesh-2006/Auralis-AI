import sqlite3
import json
import os
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "meetings.db")

def get_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    cursor = conn.cursor()
    
    # Meetings table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS meetings (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        duration_seconds REAL DEFAULT 0,
        audio_url TEXT,
        speaker_count INTEGER DEFAULT 0,
        talk_time_stats TEXT, -- JSON string
        summary TEXT,
        topic_chapters_json TEXT DEFAULT '[]', -- JSON array of topic chapters
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Migration: add topic_chapters_json column if missing
    try:
        cursor.execute("ALTER TABLE meetings ADD COLUMN topic_chapters_json TEXT DEFAULT '[]'")
    except Exception:
        pass  # Column already exists

    # Transcripts table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS transcripts (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        speaker TEXT NOT NULL,
        text TEXT NOT NULL,
        start_time REAL NOT NULL,
        end_time REAL NOT NULL,
        sentiment TEXT DEFAULT 'neutral',
        FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
    );
    """)

    # Insights table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS insights (
        id TEXT PRIMARY KEY,
        meeting_id TEXT NOT NULL,
        category TEXT NOT NULL, -- 'decision', 'action_item', 'question'
        text TEXT NOT NULL,
        owner TEXT,
        priority TEXT DEFAULT 'medium',
        timestamp TEXT,
        FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
    );
    """)

    # Podcasts / Audiobooks table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS podcasts (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        style TEXT DEFAULT 'podcast',
        summary TEXT,
        duration_seconds REAL DEFAULT 0,
        audio_url TEXT NOT NULL,
        script_json TEXT, -- JSON array of dialogue turns
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)


    # Authenticated users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_sub TEXT UNIQUE NOT NULL,
        email TEXT NOT NULL,
        email_verified INTEGER DEFAULT 0,
        name TEXT,
        given_name TEXT,
        family_name TEXT,
        picture TEXT,
        locale TEXT,
        hosted_domain TEXT,
        last_login TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)
    # Schedules table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        scheduled_time TEXT NOT NULL,
        description TEXT,
        status TEXT DEFAULT 'upcoming',
        remind_before_minutes INTEGER DEFAULT 1,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    """)

    # Migration: add remind_before_minutes column if missing (for existing DBs)
    try:
        cursor.execute("ALTER TABLE schedules ADD COLUMN remind_before_minutes INTEGER DEFAULT 1")
    except Exception:
        pass  # Column already exists

    conn.commit()
    conn.close()



def save_meeting(
    title: str,
    duration_seconds: float,
    audio_url: str,
    transcripts: List[Dict[str, Any]],
    insights: Dict[str, Any],
    speaker_stats: List[Dict[str, Any]],
    summary: str = ""
) -> str:
    meeting_id = str(uuid.uuid4())
    now_str = datetime.now().isoformat()
    speaker_count = len(speaker_stats)
    
    conn = get_db()
    cursor = conn.cursor()
    
    topic_chapters = insights.get("topic_chapters", [])
    topic_chapters_json = json.dumps(topic_chapters)

    cursor.execute("""
    INSERT INTO meetings (id, title, date, duration_seconds, audio_url, speaker_count, talk_time_stats, summary, topic_chapters_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    """, (meeting_id, title, now_str, duration_seconds, audio_url, speaker_count, json.dumps(speaker_stats), summary, topic_chapters_json))
    
    # Insert transcripts
    for item in transcripts:
        cursor.execute("""
        INSERT INTO transcripts (id, meeting_id, speaker, text, start_time, end_time, sentiment)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            str(uuid.uuid4()),
            meeting_id,
            item.get("speaker", "Speaker 1"),
            item.get("text", ""),
            float(item.get("start_time", 0.0)),
            float(item.get("end_time", 0.0)),
            item.get("sentiment", "neutral")
        ))
        
    # Insert insights
    decisions = insights.get("decisions", [])
    for d in decisions:
        cursor.execute("""
        INSERT INTO insights (id, meeting_id, category, text, owner, priority, timestamp)
        VALUES (?, ?, 'decision', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), meeting_id, d.get("text", d) if isinstance(d, dict) else str(d), d.get("speaker", "") if isinstance(d, dict) else "", "medium", d.get("timestamp", "") if isinstance(d, dict) else ""))
        
    action_items = insights.get("action_items", [])
    for a in action_items:
        cursor.execute("""
        INSERT INTO insights (id, meeting_id, category, text, owner, priority, timestamp)
        VALUES (?, ?, 'action_item', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), meeting_id, a.get("task", a.get("text", "")) if isinstance(a, dict) else str(a), a.get("owner", "Unassigned") if isinstance(a, dict) else "Unassigned", a.get("priority", "medium") if isinstance(a, dict) else "medium", ""))

    questions = insights.get("open_questions", [])
    for q in questions:
        cursor.execute("""
        INSERT INTO insights (id, meeting_id, category, text, owner, priority, timestamp)
        VALUES (?, ?, 'question', ?, ?, ?, ?)
        """, (str(uuid.uuid4()), meeting_id, q.get("text", q) if isinstance(q, dict) else str(q), "", "low", ""))

    conn.commit()
    conn.close()
    return meeting_id

def get_all_meetings() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM meetings ORDER BY created_at DESC")
    rows = cursor.fetchall()
    
    result = []
    for r in rows:
        m = dict(r)
        m["talk_time_stats"] = json.loads(m["talk_time_stats"]) if m["talk_time_stats"] else []
        result.append(m)
    conn.close()
    return result

def get_meeting_details(meeting_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM meetings WHERE id = ?", (meeting_id,))
    meeting_row = cursor.fetchone()
    if not meeting_row:
        conn.close()
        return None
        
    meeting = dict(meeting_row)
    meeting["talk_time_stats"] = json.loads(meeting["talk_time_stats"]) if meeting["talk_time_stats"] else []
    topic_chapters = json.loads(meeting.pop("topic_chapters_json", "[]") or "[]")
    
    cursor.execute("SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC", (meeting_id,))
    transcripts = [dict(r) for r in cursor.fetchall()]
    
    cursor.execute("SELECT * FROM insights WHERE meeting_id = ?", (meeting_id,))
    insights_rows = [dict(r) for r in cursor.fetchall()]
    
    decisions = [r for r in insights_rows if r["category"] == "decision"]
    action_items = [r for r in insights_rows if r["category"] == "action_item"]
    
    conn.close()
    
    return {
        "meeting": meeting,
        "transcripts": transcripts,
        "insights": {
            "decisions": decisions,
            "action_items": action_items,
            "topic_chapters": topic_chapters
        }
    }

def search_meetings(query: str) -> List[Dict[str, Any]]:
    if not query.strip():
        return get_all_meetings()
        
    conn = get_db()
    cursor = conn.cursor()
    q = f"%{query.lower()}%"
    
    cursor.execute("""
    SELECT DISTINCT m.* FROM meetings m
    LEFT JOIN transcripts t ON m.id = t.meeting_id
    LEFT JOIN insights i ON m.id = i.meeting_id
    WHERE LOWER(m.title) LIKE ? 
       OR LOWER(t.text) LIKE ? 
       OR LOWER(t.speaker) LIKE ? 
       OR LOWER(i.text) LIKE ?
    ORDER BY m.created_at DESC
    """, (q, q, q, q))
    
    rows = cursor.fetchall()
    result = []
    for r in rows:
        m = dict(r)
        m["talk_time_stats"] = json.loads(m["talk_time_stats"]) if m["talk_time_stats"] else []
        result.append(m)
    conn.close()
    return result


def save_podcast(podcast_data: Dict[str, Any]) -> str:
    podcast_id = podcast_data.get("id", str(uuid.uuid4()))
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO podcasts (id, title, style, summary, duration_seconds, audio_url, script_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    """, (
        podcast_id,
        podcast_data.get("title", "Untitled Audio Book"),
        podcast_data.get("style", "podcast"),
        podcast_data.get("summary", ""),
        float(podcast_data.get("duration_seconds", 0.0)),
        podcast_data.get("audio_url", ""),
        json.dumps(podcast_data.get("script", []))
    ))
    conn.commit()
    conn.close()
    return podcast_id


def get_all_podcasts() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM podcasts ORDER BY created_at DESC")
    rows = cursor.fetchall()
    result = []
    for r in rows:
        p = dict(r)
        p["script"] = json.loads(p["script_json"]) if p.get("script_json") else []
        result.append(p)
    conn.close()
    return result


def get_podcast_details(podcast_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM podcasts WHERE id = ?", (podcast_id,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    p = dict(row)
    p["script"] = json.loads(p["script_json"]) if p.get("script_json") else []
    return p



# --- User Auth Persistence ---

def upsert_google_user(profile: Dict[str, Any]) -> Dict[str, Any]:
    google_sub = str(profile.get("sub") or "").strip()
    email = str(profile.get("email") or "").strip().lower()
    if not google_sub or not email:
        raise ValueError("Google profile must include sub and email")

    now_str = datetime.now().isoformat()
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE google_sub = ?", (google_sub,))
    existing = cursor.fetchone()

    values = {
        "google_sub": google_sub,
        "email": email,
        "email_verified": 1 if str(profile.get("email_verified", "")).lower() in {"true", "1"} or profile.get("email_verified") is True else 0,
        "name": profile.get("name", ""),
        "given_name": profile.get("given_name", ""),
        "family_name": profile.get("family_name", ""),
        "picture": profile.get("picture", ""),
        "locale": profile.get("locale", ""),
        "hosted_domain": profile.get("hd", ""),
        "last_login": now_str,
    }

    if existing:
        user_id = existing["id"]
        cursor.execute("""
        UPDATE users
        SET email = ?, email_verified = ?, name = ?, given_name = ?, family_name = ?, picture = ?, locale = ?, hosted_domain = ?, last_login = ?
        WHERE id = ?
        """, (
            values["email"], values["email_verified"], values["name"], values["given_name"],
            values["family_name"], values["picture"], values["locale"], values["hosted_domain"],
            values["last_login"], user_id
        ))
    else:
        user_id = str(uuid.uuid4())
        cursor.execute("""
        INSERT INTO users (id, google_sub, email, email_verified, name, given_name, family_name, picture, locale, hosted_domain, last_login)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            user_id, values["google_sub"], values["email"], values["email_verified"], values["name"],
            values["given_name"], values["family_name"], values["picture"], values["locale"],
            values["hosted_domain"], values["last_login"]
        ))

    conn.commit()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return _public_user(dict(row))


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM users WHERE id = ?", (user_id,))
    row = cursor.fetchone()
    conn.close()
    return _public_user(dict(row)) if row else None


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": user.get("id"),
        "email": user.get("email"),
        "email_verified": bool(user.get("email_verified")),
        "name": user.get("name"),
        "given_name": user.get("given_name"),
        "family_name": user.get("family_name"),
        "picture": user.get("picture"),
        "locale": user.get("locale"),
        "hosted_domain": user.get("hosted_domain"),
        "last_login": user.get("last_login"),
        "created_at": user.get("created_at"),
    }

# --- Schedules CRUD ---

def save_schedule(title: str, scheduled_time: str, description: str = "", remind_before_minutes: int = 1) -> Dict[str, Any]:
    schedule_id = str(uuid.uuid4())
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("""
    INSERT INTO schedules (id, title, scheduled_time, description, status, remind_before_minutes)
    VALUES (?, ?, ?, ?, 'upcoming', ?)
    """, (schedule_id, title, scheduled_time, description, remind_before_minutes))
    conn.commit()
    conn.close()
    return {
        "id": schedule_id,
        "title": title,
        "scheduled_time": scheduled_time,
        "description": description,
        "status": "upcoming",
        "remind_before_minutes": remind_before_minutes
    }


def get_all_schedules() -> List[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM schedules ORDER BY scheduled_time ASC")
    rows = cursor.fetchall()
    result = [dict(r) for r in rows]
    conn.close()
    return result


def update_schedule_status(schedule_id: str, status: str) -> Optional[Dict[str, Any]]:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("UPDATE schedules SET status = ? WHERE id = ?", (status, schedule_id))
    conn.commit()
    
    cursor.execute("SELECT * FROM schedules WHERE id = ?", (schedule_id,))
    row = cursor.fetchone()
    conn.close()
    return dict(row) if row else None


def delete_schedule(schedule_id: str) -> bool:
    conn = get_db()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM schedules WHERE id = ?", (schedule_id,))
    conn.commit()
    conn.close()
    return True


# Initialize table on import
init_db()

