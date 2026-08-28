import { ApiError, isNetworkError, networkErrorVariant } from "@/lib/api";
import type { PlaceholderVariant } from "@/components/StatePlaceholder";

export function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return fallback;
}

export function chatSendErrorMessage(err: unknown): string {
  if (isNetworkError(err)) {
    if (networkErrorVariant(err) === "timeout") {
      return "Ответ занял слишком много времени. Сформулируйте вопрос короче или повторите через минуту.";
    }
    return "Сервер не ответил. Убедитесь, что запущен npm run dev, и отправьте вопрос снова.";
  }
  return errorMessage(err, "Не удалось отправить сообщение в чат");
}

export function placeholderForError(err: unknown): PlaceholderVariant {
  if (isNetworkError(err)) {
    return networkErrorVariant(err) === "timeout" ? "timeout" : "network";
  }
  if (err instanceof ApiError) {
    if (err.status === 404) return "not-found";
    if (err.status === 401) return "auth-failed";
    if (err.status >= 500) return "server";
  }
  return "load-failed";
}
