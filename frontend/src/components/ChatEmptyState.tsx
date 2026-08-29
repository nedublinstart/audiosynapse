"use client";

import { Bot, GraduationCap, Sparkles } from "lucide-react";
import { StatePlaceholder } from "@/components/StatePlaceholder";

const HINTS = [
  "Объясни главную тему простыми словами",
  "Какие 3 термина нужно запомнить?",
  "Что было самое важное на лекции?",
  "Приведи пример из материала",
  "Вопросы для экзамена",
  "Что я мог не понять?",
] as const;

export function ChatEmptyState({
  onHint,
  hasContext,
  examMode,
}: {
  onHint: (text: string) => void;
  hasContext?: boolean;
  examMode?: boolean;
}) {
  return (
    <div className="space-y-4">
      <div
        className="mx-auto flex max-w-sm flex-col items-center rounded-[14px] border px-4 py-5 text-center"
        style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}
      >
        <span
          className="mb-3 flex h-10 w-10 items-center justify-center rounded-[12px]"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {examMode ? <GraduationCap size={18} /> : <Bot size={18} />}
        </span>
        <p className="text-sm font-medium">
          {examMode ? "Режим экзамена" : "Synapse по этой лекции"}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          {hasContext
            ? "Ответы только по конспекту, транскрипту и материалам — без выдумок."
            : "Сначала загрузите аудио или PDF — тогда чат сможет отвечать по материалам."}
        </p>
      </div>
      {hasContext ? (
        <div className="flex flex-wrap justify-center gap-2">
          {HINTS.map((hint) => (
            <button
              key={hint}
              type="button"
              className="pressable flex items-center gap-1 rounded-full px-3 py-1.5 text-xs"
              style={{
                background: "var(--bg-soft)",
                color: "var(--fg-muted)",
                border: "1px solid var(--border)",
              }}
              onClick={() => onHint(hint)}
            >
              <Sparkles size={11} style={{ color: "var(--accent)" }} />
              {hint}
            </button>
          ))}
        </div>
      ) : (
        <StatePlaceholder inline compact variant="empty-chat" />
      )}
    </div>
  );
}
