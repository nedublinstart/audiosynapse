# Synapse

Интеллектуальный помощник для конспектирования лекций.

Превращает аудиолекции и доп. материалы (PDF/DOCX/слайды) в конспекты по гибридной методике:
**Cornell + Feynman + Bloom**, с маркировкой источников и контекстным ИИ-чатом по лекции.

## Стек

- **Frontend:** Next.js 15, React, Tailwind, Markdown + KaTeX, Dark Mode
- **Backend:** FastAPI, SQLAlchemy, SQLite (MVP; легко заменить на PostgreSQL)
- **AI:** [GPT4Free / g4f](https://github.com/xtekky/gpt4free) — OpenAI-compatible client с цепочкой провайдеров (`RetryProvider`)

## Быстрый старт

### Backend

```bash
cd backend
python3 -m pip install -r requirements.txt
cp .env.example .env
# при необходимости: G4F_MODEL, G4F_PROVIDERS, G4F_API_KEY
PYTHONPATH=. python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=' > .env.local
npm run dev
```

Откройте http://localhost:3000

> Next.js проксирует `/api/*` на FastAPI (`API_PROXY_TARGET`, по умолчанию `http://127.0.0.1:8000`).

## AI (G4F)

Генерация конспектов, обогащение и чат идут через `g4f.client.Client`:

```python
from g4f.client import Client

client = Client()
response = client.chat.completions.create(
    model="gemini-3.1-pro",
    messages=[{"role": "user", "content": "..."}],
    web_search=False,
)
```

По умолчанию провайдеры: `Gemini → DeepSeek → Cerebras → Pollinations → OpenaiChat`.
Модели: `gemini-3.6-flash` (без логина), fallback `gemini-3.1-pro`, `gpt-4o-mini`, `gpt-4o`.

Для более сильных моделей задайте cookies/`G4F_API_KEY` (см. [g4f docs](https://g4f.dev/docs)).

## MVP

- Регистрация / авторизация (JWT)
- Структура Семестр → Предмет → Лекция + расписание
- Статусы лекции: Ожидает аудио / В обработке / Готова / Требует уточнения
- Загрузка аудио → транскрибация (G4F multimodal / stub) → конспект Synapse Core
- Обогащение PDF/DOCX, чат + режим «Экзамен»
- Экспорт Markdown / печать в PDF

## Переменные окружения

| Переменная | Где | Описание |
|---|---|---|
| `G4F_MODEL` | backend | Основная модель (по умолчанию `gemini-3.6-flash`) |
| `G4F_FALLBACK_MODELS` | backend | Список fallback-моделей через запятую |
| `G4F_PROVIDERS` | backend | Цепочка провайдеров g4f через запятую |
| `G4F_API_KEY` | backend | Ключ для auth-провайдеров (опционально) |
| `G4F_PROXY` | backend | HTTP-прокси (опционально) |
| `SECRET_KEY` | backend | JWT secret |
| `DATABASE_URL` | backend | По умолчанию SQLite в `backend/data/synapse.db` |
| `NEXT_PUBLIC_API_URL` | frontend | Пусто = same-origin `/api` proxy |
