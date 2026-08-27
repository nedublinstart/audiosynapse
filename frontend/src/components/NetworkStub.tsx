"use client";

import { CloudOff, RefreshCw, WifiOff } from "lucide-react";

type Variant = "network" | "empty" | "timeout";

const COPY: Record<Variant, { title: string; defaultMessage: string }> = {
  network: {
    title: "Нет связи с сервером",
    defaultMessage: "Проверьте интернет и попробуйте снова. Данные на устройстве не потеряны.",
  },
  timeout: {
    title: "Ответ занял слишком много времени",
    defaultMessage: "Соединение медленное — повторите запрос через несколько секунд.",
  },
  empty: {
    title: "Пока пусто",
    defaultMessage: "Здесь появится содержимое, когда данные загрузятся.",
  },
};

export function NetworkStub({
  variant = "network",
  title,
  message,
  onRetry,
  compact,
}: {
  variant?: Variant;
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  const meta = COPY[variant];
  const Icon = variant === "empty" ? CloudOff : WifiOff;

  return (
    <div
      className={`network-stub panel animate-text-in flex flex-col items-center text-center ${
        compact ? "px-4 py-8" : "px-6 py-10 sm:py-12"
      }`}
    >
      <div
        className="mb-4 flex h-12 w-12 items-center justify-center rounded-[14px]"
        style={{ background: "var(--bg-soft)", color: "var(--fg-muted)" }}
      >
        <Icon size={22} />
      </div>
      <p className="mb-1 text-base font-medium" style={{ color: "var(--fg)" }}>
        {title ?? meta.title}
      </p>
      <p className="max-w-sm text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        {message ?? meta.defaultMessage}
      </p>
      {onRetry ? (
        <button type="button" className="btn-outline mt-5 sm:!w-auto" onClick={onRetry}>
          <RefreshCw size={16} /> Повторить
        </button>
      ) : null}
    </div>
  );
}
