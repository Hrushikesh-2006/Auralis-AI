import os
import json
import uuid
import sqlite3
from datetime import datetime
from typing import List, Dict, Any, Optional

from backend.config import config

# Check for PostgreSQL database connection string
DATABASE_URL = (
    os.getenv("DATABASE_URL")
    or os.getenv("POSTGRES_URL")
    or os.getenv("POSTGRES_PRISMA_URL")
    or os.getenv("POSTGRES_URL_NON_POOLING")
    or config.DATABASE_URL
    or ""
).strip()

IS_POSTGRES = bool(DATABASE_URL)

if IS_POSTGRES:
    # Ensure postgresql:// schema
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    try:
        import psycopg2
        from psycopg2.extras import RealDictCursor
    except ImportError:
        print("[DatabaseService] Warning: psycopg2-binary not installed. Falling back to SQLite.")
        IS_POSTGRES = False

if not IS_POSTGRES:
    if os.environ.get("VERCEL") == "1":
        DB_PATH = "/tmp/data/meetings.db"
    else:
        DB_PATH = os.path.join(os.path.dirname(os.path.dirname(__file__)), "data", "meetings.db")


def get_db_connection():
    """
    Returns a live connection to PostgreSQL or SQLite.
    """
    if IS_POSTGRES:
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)
        conn.autocommit = False
        return conn
    else:
        os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def _format_sql(query: str) -> str:
    """
    Converts '?' placeholders to '%s' when executing against PostgreSQL.
    """
    if IS_POSTGRES:
        return query.replace("?", "%s")
    return query


def _dict_row(row) -> Dict[str, Any]:
    if row is None:
        return None
    if isinstance(row, dict):
        return dict(row)
    return {k: row[k] for k in row.keys()}


def init_db():
    """
    Initializes all database tables in PostgreSQL or SQLite.
    """
    conn = get_db_connection()
    cursor = conn.cursor()

    try:
        if IS_POSTGRES:
            # PostgreSQL Tables
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                duration_seconds DOUBLE PRECISION DEFAULT 0,
                audio_url TEXT,
                speaker_count INTEGER DEFAULT 0,
                talk_time_stats TEXT,
                summary TEXT,
                topic_chapters_json TEXT DEFAULT '[]',
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS transcripts (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL REFERENCES meetings (id) ON DELETE CASCADE,
                speaker TEXT NOT NULL,
                text TEXT NOT NULL,
                start_time DOUBLE PRECISION NOT NULL,
                end_time DOUBLE PRECISION NOT NULL,
                sentiment TEXT DEFAULT 'neutral'
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS insights (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL REFERENCES meetings (id) ON DELETE CASCADE,
                category TEXT NOT NULL,
                text TEXT NOT NULL,
                owner TEXT,
                priority TEXT DEFAULT 'medium',
                timestamp TEXT
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS podcasts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                style TEXT DEFAULT 'podcast',
                summary TEXT,
                duration_seconds DOUBLE PRECISION DEFAULT 0,
                audio_url TEXT NOT NULL,
                script_json TEXT,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """)

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
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS schedules (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                scheduled_time TEXT NOT NULL,
                description TEXT,
                status TEXT DEFAULT 'upcoming',
                remind_before_minutes INTEGER DEFAULT 1,
                created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
            );
            """)

        else:
            # SQLite Tables
            cursor.execute("""
            CREATE TABLE IF NOT EXISTS meetings (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                date TEXT NOT NULL,
                duration_seconds REAL DEFAULT 0,
                audio_url TEXT,
                speaker_count INTEGER DEFAULT 0,
                talk_time_stats TEXT,
                summary TEXT,
                topic_chapters_json TEXT DEFAULT '[]',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

            try:
                cursor.execute("ALTER TABLE meetings ADD COLUMN topic_chapters_json TEXT DEFAULT '[]'")
            except Exception:
                pass

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

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS insights (
                id TEXT PRIMARY KEY,
                meeting_id TEXT NOT NULL,
                category TEXT NOT NULL,
                text TEXT NOT NULL,
                owner TEXT,
                priority TEXT DEFAULT 'medium',
                timestamp TEXT,
                FOREIGN KEY (meeting_id) REFERENCES meetings (id) ON DELETE CASCADE
            );
            """)

            cursor.execute("""
            CREATE TABLE IF NOT EXISTS podcasts (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                style TEXT DEFAULT 'podcast',
                summary TEXT,
                duration_seconds REAL DEFAULT 0,
                audio_url TEXT NOT NULL,
                script_json TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            """)

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

            try:
                cursor.execute("ALTER TABLE schedules ADD COLUMN remind_before_minutes INTEGER DEFAULT 1")
            except Exception:
                pass

        conn.commit()
    finally:
        cursor.close()
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
    
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        topic_chapters = insights.get("topic_chapters", [])
        topic_chapters_json = json.dumps(topic_chapters)

        cursor.execute(_format_sql("""
        INSERT INTO meetings (id, title, date, duration_seconds, audio_url, speaker_count, talk_time_stats, summary, topic_chapters_json)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """), (meeting_id, title, now_str, duration_seconds, audio_url, speaker_count, json.dumps(speaker_stats), summary, topic_chapters_json))
        
        # Insert transcripts
        for item in transcripts:
            cursor.execute(_format_sql("""
            INSERT INTO transcripts (id, meeting_id, speaker, text, start_time, end_time, sentiment)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """), (
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
            cursor.execute(_format_sql("""
            INSERT INTO insights (id, meeting_id, category, text, owner, priority, timestamp)
            VALUES (?, ?, 'decision', ?, ?, ?, ?)
            """), (str(uuid.uuid4()), meeting_id, d.get("text", d) if isinstance(d, dict) else str(d), d.get("speaker", "") if isinstance(d, dict) else "", "medium", d.get("timestamp", "") if isinstance(d, dict) else ""))
            
        action_items = insights.get("action_items", [])
        for a in action_items:
            cursor.execute(_format_sql("""
            INSERT INTO insights (id, meeting_id, category, text, owner, priority, timestamp)
            VALUES (?, ?, 'action_item', ?, ?, ?, ?)
            """), (str(uuid.uuid4()), meeting_id, a.get("task", a.get("text", "")) if isinstance(a, dict) else str(a), a.get("owner", "Unassigned") if isinstance(a, dict) else "Unassigned", a.get("priority", "medium") if isinstance(a, dict) else "medium", ""))

        questions = insights.get("open_questions", [])
        for q in questions:
            cursor.execute(_format_sql("""
            INSERT INTO insights (id, meeting_id, category, text, owner, priority, timestamp)
            VALUES (?, ?, 'question', ?, ?, ?, ?)
            """), (str(uuid.uuid4()), meeting_id, q.get("text", q) if isinstance(q, dict) else str(q), "", "low", ""))

        conn.commit()
    finally:
        cursor.close()
        conn.close()

    return meeting_id


def get_all_meetings() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM meetings ORDER BY date DESC, created_at DESC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            m = _dict_row(r)
            if isinstance(m.get("talk_time_stats"), str):
                try:
                    m["talk_time_stats"] = json.loads(m["talk_time_stats"])
                except Exception:
                    m["talk_time_stats"] = []
            elif not m.get("talk_time_stats"):
                m["talk_time_stats"] = []
            result.append(m)
        return result
    finally:
        cursor.close()
        conn.close()


def get_meeting_details(meeting_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    
    try:
        cursor.execute(_format_sql("SELECT * FROM meetings WHERE id = ?"), (meeting_id,))
        meeting_row = cursor.fetchone()
        if not meeting_row:
            return None
            
        meeting = _dict_row(meeting_row)
        if isinstance(meeting.get("talk_time_stats"), str):
            try:
                meeting["talk_time_stats"] = json.loads(meeting["talk_time_stats"])
            except Exception:
                meeting["talk_time_stats"] = []
        elif not meeting.get("talk_time_stats"):
            meeting["talk_time_stats"] = []

        topic_chapters_raw = meeting.pop("topic_chapters_json", "[]") or "[]"
        if isinstance(topic_chapters_raw, str):
            try:
                topic_chapters = json.loads(topic_chapters_raw)
            except Exception:
                topic_chapters = []
        else:
            topic_chapters = topic_chapters_raw or []
        
        cursor.execute(_format_sql("SELECT * FROM transcripts WHERE meeting_id = ? ORDER BY start_time ASC"), (meeting_id,))
        transcripts = [_dict_row(r) for r in cursor.fetchall()]
        
        cursor.execute(_format_sql("SELECT * FROM insights WHERE meeting_id = ?"), (meeting_id,))
        insights_rows = [_dict_row(r) for r in cursor.fetchall()]
        
        decisions = [r for r in insights_rows if r["category"] == "decision"]
        action_items = [r for r in insights_rows if r["category"] == "action_item"]
        
        return {
            "meeting": meeting,
            "transcripts": transcripts,
            "insights": {
                "decisions": decisions,
                "action_items": action_items,
                "topic_chapters": topic_chapters
            }
        }
    finally:
        cursor.close()
        conn.close()


def search_meetings(query: str) -> List[Dict[str, Any]]:
    if not query.strip():
        return get_all_meetings()
        
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        q = f"%{query.lower()}%"
        cursor.execute(_format_sql("""
        SELECT DISTINCT m.* FROM meetings m
        LEFT JOIN transcripts t ON m.id = t.meeting_id
        LEFT JOIN insights i ON m.id = i.meeting_id
        WHERE LOWER(m.title) LIKE ? 
           OR LOWER(t.text) LIKE ? 
           OR LOWER(t.speaker) LIKE ? 
           OR LOWER(i.text) LIKE ?
        ORDER BY m.date DESC, m.created_at DESC
        """), (q, q, q, q))
        
        rows = cursor.fetchall()
        result = []
        for r in rows:
            m = _dict_row(r)
            if isinstance(m.get("talk_time_stats"), str):
                try:
                    m["talk_time_stats"] = json.loads(m["talk_time_stats"])
                except Exception:
                    m["talk_time_stats"] = []
            elif not m.get("talk_time_stats"):
                m["talk_time_stats"] = []
            result.append(m)
        return result
    finally:
        cursor.close()
        conn.close()


def save_podcast(podcast_data: Dict[str, Any]) -> str:
    podcast_id = podcast_data.get("id", str(uuid.uuid4()))
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(_format_sql("""
        INSERT INTO podcasts (id, title, style, summary, duration_seconds, audio_url, script_json)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """), (
            podcast_id,
            podcast_data.get("title", "Untitled Audio Book"),
            podcast_data.get("style", "podcast"),
            podcast_data.get("summary", ""),
            float(podcast_data.get("duration_seconds", 0.0)),
            podcast_data.get("audio_url", ""),
            json.dumps(podcast_data.get("script", []))
        ))
        conn.commit()
    finally:
        cursor.close()
        conn.close()
    return podcast_id


def get_all_podcasts() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM podcasts ORDER BY created_at DESC")
        rows = cursor.fetchall()
        result = []
        for r in rows:
            p = _dict_row(r)
            if isinstance(p.get("script_json"), str):
                try:
                    p["script"] = json.loads(p["script_json"])
                except Exception:
                    p["script"] = []
            elif not p.get("script"):
                p["script"] = []
            result.append(p)
        return result
    finally:
        cursor.close()
        conn.close()


def get_podcast_details(podcast_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(_format_sql("SELECT * FROM podcasts WHERE id = ?"), (podcast_id,))
        row = cursor.fetchone()
        if not row:
            return None
        p = _dict_row(row)
        if isinstance(p.get("script_json"), str):
            try:
                p["script"] = json.loads(p["script_json"])
            except Exception:
                p["script"] = []
        elif not p.get("script"):
            p["script"] = []
        return p
    finally:
        cursor.close()
        conn.close()


# --- User Auth Persistence ---

def upsert_google_user(profile: Dict[str, Any]) -> Dict[str, Any]:
    google_sub = str(profile.get("sub") or profile.get("id") or "").strip()
    email = str(profile.get("email") or "").strip().lower()
    if not google_sub or not email:
        raise ValueError("Google profile must include sub and email")

    now_str = datetime.now().isoformat()
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(_format_sql("SELECT * FROM users WHERE google_sub = ?"), (google_sub,))
        existing = cursor.fetchone()

        values = {
            "google_sub": google_sub,
            "email": email,
            "email_verified": 1 if str(profile.get("email_verified", "")).lower() in {"true", "1"} or profile.get("email_verified") is True else 0,
            "name": profile.get("name", "") or profile.get("given_name", ""),
            "given_name": profile.get("given_name", ""),
            "family_name": profile.get("family_name", ""),
            "picture": profile.get("picture", ""),
            "locale": profile.get("locale", ""),
            "hosted_domain": profile.get("hd", ""),
            "last_login": now_str,
        }

        if existing:
            user_id = _dict_row(existing)["id"]
            cursor.execute(_format_sql("""
            UPDATE users
            SET email = ?, email_verified = ?, name = ?, given_name = ?, family_name = ?, picture = ?, locale = ?, hosted_domain = ?, last_login = ?
            WHERE id = ?
            """), (
                values["email"], values["email_verified"], values["name"], values["given_name"],
                values["family_name"], values["picture"], values["locale"], values["hosted_domain"],
                values["last_login"], user_id
            ))
        else:
            user_id = str(uuid.uuid4())
            cursor.execute(_format_sql("""
            INSERT INTO users (id, google_sub, email, email_verified, name, given_name, family_name, picture, locale, hosted_domain, last_login)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """), (
                user_id, values["google_sub"], values["email"], values["email_verified"], values["name"],
                values["given_name"], values["family_name"], values["picture"], values["locale"],
                values["hosted_domain"], values["last_login"]
            ))

        conn.commit()
        cursor.execute(_format_sql("SELECT * FROM users WHERE id = ?"), (user_id,))
        row = cursor.fetchone()
        return _public_user(_dict_row(row))
    finally:
        cursor.close()
        conn.close()


def get_user_by_id(user_id: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(_format_sql("SELECT * FROM users WHERE id = ?"), (user_id,))
        row = cursor.fetchone()
        return _public_user(_dict_row(row)) if row else None
    finally:
        cursor.close()
        conn.close()


def _public_user(user: Dict[str, Any]) -> Dict[str, Any]:
    if not user:
        return {}
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
        "created_at": str(user.get("created_at") or ""),
    }


# --- Schedules CRUD ---

def save_schedule(title: str, scheduled_time: str, description: str = "", remind_before_minutes: int = 1) -> Dict[str, Any]:
    schedule_id = str(uuid.uuid4())
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(_format_sql("""
        INSERT INTO schedules (id, title, scheduled_time, description, status, remind_before_minutes)
        VALUES (?, ?, ?, ?, 'upcoming', ?)
        """), (schedule_id, title, scheduled_time, description, remind_before_minutes))
        conn.commit()
        return {
            "id": schedule_id,
            "title": title,
            "scheduled_time": scheduled_time,
            "description": description,
            "status": "upcoming",
            "remind_before_minutes": remind_before_minutes
        }
    finally:
        cursor.close()
        conn.close()


def get_all_schedules() -> List[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT * FROM schedules ORDER BY scheduled_time ASC")
        rows = cursor.fetchall()
        return [_dict_row(r) for r in rows]
    finally:
        cursor.close()
        conn.close()


def update_schedule_status(schedule_id: str, status: str) -> Optional[Dict[str, Any]]:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(_format_sql("UPDATE schedules SET status = ? WHERE id = ?"), (status, schedule_id))
        conn.commit()
        
        cursor.execute(_format_sql("SELECT * FROM schedules WHERE id = ?"), (schedule_id,))
        row = cursor.fetchone()
        return _dict_row(row) if row else None
    finally:
        cursor.close()
        conn.close()


def delete_schedule(schedule_id: str) -> bool:
    conn = get_db_connection()
    cursor = conn.cursor()
    try:
        cursor.execute(_format_sql("DELETE FROM schedules WHERE id = ?"), (schedule_id,))
        conn.commit()
        return True
    finally:
        cursor.close()
        conn.close()


# Initialize tables on module load
try:
    init_db()
except Exception as e:
    print(f"[DatabaseService] Table initialization warning: {e}")
