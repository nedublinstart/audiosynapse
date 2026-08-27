"use client";

import { BookOpen, MessageSquare, Mic, Upload } from "lucide-react";

const STEPS = [
  {
    icon: Mic,
    title: "Загрузите аудио",
    text: "mp3, wav, m4a, ogg и другие форматы — запись лекции или семинара.",
  },
  {
    icon: Upload,
    title: "Добавьте слайды (необязательно)",
    text: "PDF или DOCX обогатят конспект схемами и списками.",
  },
  {
    icon: BookOpen,
    title: "Получите развёрнутый конспект",
    text: "Структурированные тезисы, простые объяснения и вопросы для самопроверки.",
  },
  {
    icon: MessageSquare,
    title: "Спросите в чате",
    text: "ИИ отвечает только по материалам этой лекции — без галлюцинаций.",
  },
] as const;

export function QuickStartGuide() {
  return (
    <div className="mx-auto max-w-lg py-8 sm:py-12">
      <p className="mb-6 text-center text-sm font-medium" style={{ color: "var(--fg)" }}>
        Как это работает
      </p>
      <ol className="space-y-4">
        {STEPS.map((step, i) => (
          <li key={step.title} className="flex gap-3 rounded-[12px] p-3" style={{ background: "var(--bg-soft)" }}>
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] text-sm font-semibold"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {i + 1}
            </span>
            <div className="min-w-0">
              <div className="mb-0.5 flex items-center gap-2 text-sm font-medium">
                <step.icon size={14} style={{ color: "var(--accent)" }} />
                {step.title}
              </div>
              <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                {step.text}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
