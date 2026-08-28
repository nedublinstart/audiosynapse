"use client";

import { RefreshCw } from "lucide-react";
import { TextReveal } from "@/components/TextReveal";
import { isNetworkError, networkErrorVariant } from "@/lib/api";
import { StatePlaceholder } from "@/components/StatePlaceholder";
import { placeholderForError } from "@/lib/placeholders";

export function InlineAlert({
  error,
  err,
  onRetry,
  networkStub,
}: {
  error: string;
  err?: unknown;
  onRetry?: () => void;
  networkStub?: boolean;
}) {
  if (networkStub && err && isNetworkError(err)) {
    return (
      <div className="mb-4">
        <StatePlaceholder
          compact
          variant={networkErrorVariant(err)}
          message={error}
          onRetry={onRetry}
        />
      </div>
    );
  }

  return (
    <TextReveal contentKey={error}>
      <div
        className="flex flex-col gap-2 rounded-[10px] px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
        style={{
          background: "color-mix(in srgb, var(--danger) 10%, var(--bg-soft))",
          color: "var(--danger)",
        }}
      >
        <p className="text-sm leading-relaxed">{error}</p>
        {onRetry ? (
          <button type="button" className="btn-outline !min-h-9 shrink-0 !px-3 text-sm" onClick={onRetry}>
            <RefreshCw size={14} /> Повторить
          </button>
        ) : null}
      </div>
    </TextReveal>
  );
}

export function ErrorPanel({
  error,
  err,
  onRetry,
  compact,
}: {
  error?: string;
  err?: unknown;
  onRetry?: () => void;
  compact?: boolean;
}) {
  if (!err && !error) return null;

  const variant = err ? placeholderForError(err) : "load-failed";
  const message = error ?? (err instanceof Error ? err.message : undefined);

  return (
    <StatePlaceholder
      compact={compact}
      variant={variant}
      message={message}
      onRetry={onRetry}
    />
  );
}
