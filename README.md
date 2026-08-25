# Synapse

Интеллектуальный помощник для конспектирования лекций.

Превращает аудиолекции и доп. материалы (PDF/DOCX/слайды) в конспекты по гибридной методике:
**Cornell + Feynman + Bloom**, с маркировкой источников и контекстным ИИ-чатом по лекции.

## Стек

- **Frontend:** Next.js 15, React, Tailwind, Markdown + KaTeX, Dark Mode
- **Backend:** FastAPI, SQLAlchemy, SQLite (MVP; легко заменить на PostgreSQL)
- **AI:** Google Gemini (опционально). Без ключа работает демо-режим Synapse Core

## Быстрый старт

### Backend

```bash
cd backend
python3 -m pip install -r requirements.txt
# опционально:
# echo 'GEMINI_API_KEY=your_key' > .env
PYTHONPATH=. python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API docs: http://localhost:8000/docs

### Frontend

```bash
cd frontend
npm install
# Same-origin /api proxy to backend (recommended):
echo 'NEXT_PUBLIC_API_URL=' > .env.local
npm run dev
```

Откройте http://localhost:3000

> Next.js проксирует `/api/*` на FastAPI (`API_PROXY_TARGET`, по умолчанию `http://127.0.0.1:8000`).

## MVP (Этап 1–3 каркас)

- Регистрация / авторизация (JWT)
- Структура Семестр → Предмет → Лекция + расписание
- Статусы лекции: Ожидает аудио / В обработке / Готова / Требует уточнения
- Загрузка аудио (.mp3, .wav, .m4a, .ogg) → транскрибация → конспект
- Жёстко зафиксированный промпт Synapse Core в `backend/app/prompts/synapse_core.py`
- Обогащение конспекта PDF/DOCX без потери смысла аудио
- Чат по лекции + режим «Экзамен»
- Экспорт Markdown / печать в PDF

## Переменные окружения

| Переменная | Где | Описание |
|---|---|---|
| `GEMINI_API_KEY` | backend `.env` | Ключ Google AI для реальной транскрибации/генерации |
| `GEMINI_MODEL` | backend | По умолчанию `gemini-2.0-flash` |
| `SECRET_KEY` | backend | JWT secret |
| `DATABASE_URL` | backend | По умолчанию SQLite в `backend/data/synapse.db` |
| `NEXT_PUBLIC_API_URL` | frontend | URL API, по умолчанию `http://localhost:8000` |
