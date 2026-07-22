import os

AI_API_KEY = os.getenv("AI_API_KEY", "")
AI_BASE_URL = os.getenv("AI_BASE_URL", "https://polza.ai/api/v1")

# Уровни «скорость/качество»: пользователь видит только уровень и цену,
# конкретные модели задаются здесь (формат polza.ai: provider/model).
AI_MODEL_FAST = os.getenv("AI_MODEL_FAST", "google/gemini-2.5-flash")
AI_MODEL_BALANCED = os.getenv("AI_MODEL_BALANCED", "openai/gpt-5-mini")
AI_MODEL_QUALITY = os.getenv("AI_MODEL_QUALITY", "anthropic/claude-sonnet-4.6")

QUALITY_MODELS = {
    "fast": AI_MODEL_FAST,
    "balanced": AI_MODEL_BALANCED,
    "quality": AI_MODEL_QUALITY,
}

MAX_FILES = 5
MAX_FILE_BYTES = 15 * 1024 * 1024
MAX_CONTEXT_CHARS = 60_000
JOB_TTL_SECONDS = 3600
PRICING_CACHE_SECONDS = 3600
