import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    ASSEMBLYAI_API_KEY: str = os.getenv("ASSEMBLYAI_API_KEY", "")
    DEEPGRAM_API_KEY: str = os.getenv("DEEPGRAM_API_KEY", "")
    OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    GROQ_API_KEY: str = os.getenv("GROQ_API_KEY", "")

    TRANSCRIPTION_PROVIDER: str = os.getenv("TRANSCRIPTION_PROVIDER", "auto")
    LLM_PROVIDER: str = os.getenv("LLM_PROVIDER", "groq")
    GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
    GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")
    AUTH_SECRET: str = os.getenv("AUTH_SECRET", "change-this-local-dev-secret")
    DATABASE_URL: str = os.getenv("DATABASE_URL") or os.getenv("POSTGRES_URL") or os.getenv("POSTGRES_PRISMA_URL") or os.getenv("POSTGRES_URL_NON_POOLING") or ""

config = Config()

def update_keys(new_keys: dict):
    for key, val in new_keys.items():
        if hasattr(config, key) and val is not None:
            setattr(config, key, val)
            os.environ[key] = str(val)
    return {
        "has_assemblyai": bool(config.ASSEMBLYAI_API_KEY),
        "has_deepgram": bool(config.DEEPGRAM_API_KEY),
        "has_openai": bool(config.OPENAI_API_KEY),
        "has_gemini": bool(config.GEMINI_API_KEY),
        "has_groq": bool(config.GROQ_API_KEY),
        "has_google_client_id": bool(config.GOOGLE_CLIENT_ID),
        "has_google_client_secret": bool(config.GOOGLE_CLIENT_SECRET),
        "has_database_url": bool(config.DATABASE_URL),
    }

def get_key_status():
    return {
        "has_assemblyai": bool(config.ASSEMBLYAI_API_KEY),
        "has_deepgram": bool(config.DEEPGRAM_API_KEY),
        "has_openai": bool(config.OPENAI_API_KEY),
        "has_gemini": bool(config.GEMINI_API_KEY),
        "has_groq": bool(config.GROQ_API_KEY),
        "transcription_provider": config.TRANSCRIPTION_PROVIDER,
        "llm_provider": config.LLM_PROVIDER,
        "has_google_client_id": bool(config.GOOGLE_CLIENT_ID),
        "has_google_client_secret": bool(config.GOOGLE_CLIENT_SECRET),
        "has_database_url": bool(config.DATABASE_URL),
        "database_type": "postgres" if config.DATABASE_URL else "sqlite"
    }