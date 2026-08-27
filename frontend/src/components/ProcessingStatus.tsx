"use client";

import { CheckCircle2, Circle, Loader2 } from "lucide-react";

const PIPELINE_STEPS = [
  { id: "queued", label: "Подготовка", hint: "Проверяем файл и ставим в очередь" },
  { id: "transcribing", label: "Расшифровка речи", hint: "Whisper medium · русский + EN-термины · полное покрытие" },
  { id: "analyzing", label: "Анализ содержания", hint: "Достаём все темы и определения без урезания" },
  { id: "generating_notes", label: "Сборка конспекта", hint: "Максимально полный учебный текст, без воды" },
  { id: "finalizing", label: "Финализация", hint: "Сохраняем результат" },
] as const;

function stepIndex(stage: string | null | undefined): number {
  if (!stage || stage === "uploading") return -1;
  const idx = PIPELINE_STEPS.findIndex((s) => s.id === stage);
  return idx >= 0 ? idx : 0;
}

type Props = {
  stage?: string | null;
  progress?: number;
  message?: string | null;
  audioSizeBytes?: number | null;
};

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

export function ProcessingStatus({ stage, progress = 0, message, audioSizeBytes }: Props) {
  const activeIdx = stepIndex(stage);
  const pct = Math.max(0, Math.min(100, progress));

  return (
    <div className="mx-auto w-full max-w-lg py-8 sm:py-12">
      <div className="mb-6 text-center">
        <Loader2
          size={28}
          className="mx-auto mb-3 animate-spin"
          style={{ color: "var(--processing)" }}
        />
        <p className="text-base font-medium" style={{ color: "var(--fg)" }}>
          Обрабатываем лекцию
        </p>
        <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          {message || "Это займёт 1–4 минуты в зависимости от длины записи."}
        </p>
        {audioSizeBytes ? (
          <p className="mt-1 text-xs" style={{ color: "var(--fg-muted)" }}>
            Аудио: {formatSize(audioSizeBytes)}
          </p>
        ) : null}
      </div>

      <div
        className="progress-track mb-6 h-2.5 overflow-hidden rounded-full"
        style={{ background: "var(--bg-soft)" }}
      >
        <div
          className="progress-fill h-full rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.max(3, pct)}%`,
            background:
              "linear-gradient(90deg, var(--processing), color-mix(in srgb, var(--accent) 80%, var(--processing)))",
          }}
        />
      </div>
      <p className="mb-5 text-center text-xs font-medium tabular-nums" style={{ color: "var(--processing)" }}>
        {pct}%
      </p>

      <ol className="space-y-2">
        {PIPELINE_STEPS.map((step, index) => {
          const done = activeIdx > index || (stage === "done" && index <= PIPELINE_STEPS.length);
          const current = activeIdx === index;
          return (
            <li
              key={step.id}
              className="flex items-start gap-3 rounded-[10px] px-3 py-2.5 transition-all duration-300"
              style={{
                background: current
                  ? "color-mix(in srgb, var(--processing) 12%, var(--bg-soft))"
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
                <div
                  className="text-sm font-medium"
                  style={{ color: done || current ? "var(--fg)" : "var(--fg-muted)" }}
                >
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
