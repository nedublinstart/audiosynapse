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

Откроется http://127.0.0.1:3000  
API: http://127.0.0.1:8787 (порт **не** 8000 — на Windows 11 он часто заблокирован, WinError 10013)

Стоп: `Ctrl+C` или `npm run stop`

Или кнопки: `SETUP.bat` → `START.bat` → `STOP.bat` (см. `START_HERE.txt`).  
Если что-то падает на Windows — открой `FIX_WINDOWS.txt`.

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

## AI (G4F)

По умолчанию: модель `gemini-3.6-flash`, провайдеры `Gemini → DeepSeek → Cerebras → Pollinations → OpenaiChat`.
Сильнее модели — через `G4F_API_KEY` / cookies в `~/.g4f/cookies`.

## Переменные окружения

| Переменная | Описание |
|---|---|
| `G4F_MODEL` | Основная модель (`gemini-3.6-flash`) |
| `G4F_FALLBACK_MODELS` | Fallback-модели |
| `G4F_PROVIDERS` | Цепочка провайдеров |
| `G4F_API_KEY` | Ключ auth-провайдеров (опционально) |
| `SECRET_KEY` | JWT secret |
| `NEXT_PUBLIC_API_URL` | Пусто = same-origin `/api` proxy |
