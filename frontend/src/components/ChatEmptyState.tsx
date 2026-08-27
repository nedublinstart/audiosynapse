"use client";

import { StatePlaceholder } from "@/components/StatePlaceholder";

const HINTS = [
  "Главные термины простыми словами",
  "Что было самое важное?",
  "Вопросы для экзамена",
] as const;

export function ChatEmptyState({ onHint }: { onHint: (text: string) => void }) {
  return (
    <div className="space-y-4">
      <StatePlaceholder inline compact variant="empty-chat" />
      <div className="flex flex-wrap justify-center gap-2">
        {HINTS.map((hint) => (
          <button
            key={hint}
            type="button"
            className="pressable rounded-full px-3 py-1.5 text-xs"
            style={{
              background: "var(--bg-soft)",
              color: "var(--fg-muted)",
              border: "1px solid var(--border)",
            }}
            onClick={() => onHint(hint)}
          >
            {hint}
          </button>
        ))}
      </div>
    </div>
  );
}
