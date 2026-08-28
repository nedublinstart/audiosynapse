/** Chat client limits — keep in sync with backend ChatRequest / settings. */

export const CHAT_MAX_MESSAGE_CHARS = 2000;

const GREETING_RE =
  /^(?:привет|здравствуй|здравствуйте|hi|hello|hey|йо|ку|добрый\s+(?:день|вечер|утро))[\s!?.]*$/i;

export function isChatGreeting(text: string): boolean {
  const t = text.trim();
  return t.length > 0 && t.length < 48 && GREETING_RE.test(t);
}

export function lectureHasChatContext(lecture: {
  notes_markdown?: string | null;
  transcript?: string | null;
  materials?: unknown[];
}): boolean {
  return Boolean(
    lecture.notes_markdown?.trim() ||
      lecture.transcript?.trim() ||
      (lecture.materials && lecture.materials.length > 0),
  );
}

export function canSendChatMessage(
  lecture: {
    status: string;
    notes_markdown?: string | null;
    transcript?: string | null;
    materials?: unknown[];
  },
  text: string,
): { ok: true } | { ok: false; reason: string } {
  if (lecture.status === "processing") {
    return { ok: false, reason: "Лекция обрабатывается — дождитесь конспекта" };
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return { ok: false, reason: "Введите сообщение" };
  }
  if (trimmed.length > CHAT_MAX_MESSAGE_CHARS) {
    return { ok: false, reason: `Максимум ${CHAT_MAX_MESSAGE_CHARS} символов` };
  }
  if (!isChatGreeting(trimmed) && !lectureHasChatContext(lecture)) {
    return {
      ok: false,
      reason: "Сначала загрузите аудио или PDF — чат отвечает только по материалам лекции",
    };
  }
  return { ok: true };
}
