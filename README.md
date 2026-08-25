# Synapse

Интеллектуальный помощник для конспектирования лекций.

Превращает аудиолекции и доп. материалы (PDF/DOCX/слайды) в конспекты по гибридной методике:
**Cornell + Feynman + Bloom**, с маркировкой источников и контекстным ИИ-чатом по лекции.

## Windows — самый простой способ

В папке проекта открой **cmd** (в проводнике в адресной строке набери `cmd` + Enter) и выполни:

```bat
npm run setup
npm run dev
```

Браузер откроется сам. Порты подбираются автоматически:

- сайт — `3000` (или `3001`/`3002`, если занят)
- API — `8787` (**не** 8000: на Windows 11 он часто заблокирован, WinError 10013)

Стоп: `Ctrl+C` или `npm run stop`  
Диагностика: `npm run doctor` (окружение) и `npm run ai-check` (доступные ИИ)

Или кнопки: `SETUP.bat` → `START.bat` → `DOCTOR.bat` → `STOP.bat` (см. `START_HERE.txt`).  
Разбор конкретных ошибок — `FIX_WINDOWS.txt`.

## Стек

- **Frontend:** Next.js 15, React, Tailwind, Markdown + KaTeX, Dark Mode
- **Backend:** FastAPI, SQLAlchemy, SQLite (MVP)
- **AI:** [GPT4Free / g4f](https://github.com/xtekky/gpt4free)

## Ручной запуск

### Backend

```bash
cd backend
python3 -m pip install -r requirements.txt
cp -n .env.example .env
PYTHONPATH=. python3 -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8787
```

### Frontend

```bash
cd frontend
npm install
echo 'NEXT_PUBLIC_API_URL=' > .env.local
API_PROXY_TARGET=http://127.0.0.1:8787 npm run dev
```

Откройте http://localhost:3000

## AI

Движок ИИ выбирается автоматически, в таком порядке:

1. **Свой OpenAI-совместимый endpoint** — если заданы `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL`.
   Подходит OpenRouter, Groq, DeepSeek, Together, локальная Ollama/LM Studio.
2. **Бесплатные провайдеры GPT4Free** — Synapse перебирает ~14 провайдеров, каждого
   с его собственной моделью, и запоминает первый рабочий на 10 минут.
3. **Локальный режим** — если недоступно всё, конспект и ответы собираются из текста
   материалов, интерфейс не ломается.

Проверить, что работает из твоей сети: `npm run ai-check`

### Распознавание речи

Локально через [faster-whisper](https://github.com/SYSTRAN/faster-whisper) — интернет не нужен,
таймкоды `[MM:SS]` расставляются автоматически. Модель (`WHISPER_MODEL`, по умолчанию `base`)
скачивается при первой расшифровке. Альтернатива — `AI_TRANSCRIBE_MODEL` через свой endpoint
(например `whisper-large-v3` на Groq).

## Переменные окружения

| Переменная | Описание |
|---|---|
| `AI_BASE_URL` | OpenAI-совместимый endpoint (напр. `https://openrouter.ai/api/v1`) |
| `AI_API_KEY` | Ключ этого endpoint |
| `AI_MODEL` | Модель для чата и конспектов |
| `AI_TRANSCRIBE_MODEL` | Модель распознавания речи через API (напр. `whisper-large-v3`) |
| `AI_TIMEOUT_SECONDS` | Таймаут одной попытки, по умолчанию 45 |
| `AI_MAX_ATTEMPTS` | Сколько бесплатных провайдеров пробовать, по умолчанию 8 |
| `AI_DISABLE_G4F` | `true` — использовать только свой endpoint |
| `WHISPER_MODEL` | Локальная модель STT: `tiny`/`base`/`small`/`medium` |
| `G4F_PROVIDERS` | Закрепить конкретных провайдеров (по умолчанию пусто = авто) |
| `SECRET_KEY` | JWT secret |
| `NEXT_PUBLIC_API_URL` | Пусто = same-origin `/api` proxy |

Диагностика: `npm run doctor`, `npm run ai-check`, эндпоинт `GET /api/ai/diagnose`.
