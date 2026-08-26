"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const STEPS = [
  { id: "transcribe", label: "Расшифровываем аудио", hint: "Локальный Whisper или облачная модель" },
  { id: "analyze", label: "Извлекаем темы и термины", hint: "Ничего не урезаем — только структурируем" },
  { id: "notes", label: "Собираем развёрнутый конспект", hint: "Cornell + Фейнман + Bloom" },
] as const;

export function ProcessingStatus() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = window.setInterval(() => {
      setActive((prev) => (prev + 1) % STEPS.length);
    }, 4500);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className="mx-auto w-full max-w-md py-10 sm:py-14">
      <div className="mb-6 text-center">
        <Loader2
          size={28}
          className="mx-auto mb-3 animate-spin"
          style={{ color: "var(--processing)" }}
        />
        <p className="text-base font-medium" style={{ color: "var(--fg)" }}>
          Лекция обрабатывается
        </p>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          Обычно 1–3 минуты. Можно оставить вкладку открытой — конспект появится сам.
        </p>
      </div>
      <ol className="space-y-3">
        {STEPS.map((step, index) => {
          const done = index < active;
          const current = index === active;
          return (
            <li
              key={step.id}
              className="flex items-start gap-3 rounded-[10px] px-3 py-2.5 transition-colors duration-500"
              style={{
                background: current
                  ? "color-mix(in srgb, var(--processing) 10%, var(--bg-soft))"
                  : "transparent",
              }}
            >
              {done ? (
                <CheckCircle2 size={18} className="mt-0.5 shrink-0" style={{ color: "var(--ready)" }} />
              ) : current ? (
                <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin" style={{ color: "var(--processing)" }} />
              ) : (
                <Circle size={18} className="mt-0.5 shrink-0" style={{ color: "var(--fg-muted)" }} />
              )}
              <div>
                <div className="text-sm font-medium" style={{ color: current ? "var(--fg)" : "var(--fg-muted)" }}>
                  {step.label}
                </div>
                {current ? (
                  <div className="mt-0.5 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                    {step.hint}
                  </div>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
