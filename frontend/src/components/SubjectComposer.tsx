"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Layers, X } from "lucide-react";
import { api, isNetworkError, type Subject } from "@/lib/api";
import { InlineAlert } from "@/components/InlineAlert";
import { errorMessage } from "@/lib/placeholders";

const COLORS = [
  "#1f7a75",
  "#3d6a8a",
  "#6b7280",
  "#8a6828",
  "#5c6b7a",
  "#2f6b5a",
  "#4a5560",
  "#1c5a6e",
];

const NAME_HINTS = [
  "Философия",
  "Математический анализ",
  "История России",
  "Программирование",
  "Английский язык",
];

type Props = {
  onCancel: () => void;
  onCreated: (subject: Subject) => void;
};

/** One-screen subject create — no schedule, no wizard. */
export function SubjectComposer({ onCancel, onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastError, setLastError] = useState<unknown>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите название предмета");
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    setLastError(null);
    try {
      const subject = await api.createSubject({
        name: trimmed,
        description: description.trim() || undefined,
        color,
        schedule: [],
      });
      onCreated(subject);
    } catch (err) {
      setLastError(err);
      setError(errorMessage(err, "Не удалось создать предмет"));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    await submitCreate();
  }

  return (
    <div className="panel mb-6 overflow-hidden p-0">
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-start gap-2.5">
          <span
            className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-[10px]"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Layers size={16} />
          </span>
          <div>
            <p className="text-sm font-medium">Новый предмет</p>
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              Название → лекции → конспект. Расписание не нужно.
            </p>
          </div>
        </div>
        <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={onCancel} aria-label="Закрыть">
          <X size={16} />
        </button>
      </div>

      <form onSubmit={onSubmit} className="grid gap-4 p-4 sm:p-5">
        <div>
          <label className="label">Название</label>
          <input
            ref={nameRef}
            className="input"
            required
            placeholder="Например: Философия"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={255}
          />
          <div className="mt-2 flex flex-wrap gap-1.5">
            {NAME_HINTS.map((hint) => (
              <button
                key={hint}
                type="button"
                className="pressable rounded-full px-2.5 py-1 text-xs"
                style={{
                  background: name === hint ? "var(--accent-soft)" : "var(--bg-soft)",
                  color: name === hint ? "var(--accent)" : "var(--fg-muted)",
                  border: `1px solid ${name === hint ? "color-mix(in srgb, var(--accent) 35%, var(--border))" : "var(--border)"}`,
                }}
                onClick={() => {
                  setName(hint);
                  nameRef.current?.focus();
                }}
              >
                {hint}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">Заметка</label>
          <input
            className="input"
            placeholder="Необязательно — преподаватель, группа…"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div>
          <label className="label">Цвет</label>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Цвет ${c}`}
                aria-pressed={color === c}
                className="color-swatch h-8 w-8 rounded-full"
                style={{
                  background: c,
                  boxShadow:
                    color === c
                      ? `0 0 0 2px var(--bg-elevated), 0 0 0 4px ${c}`
                      : "0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent)",
                }}
                onClick={() => setColor(c)}
              />
            ))}
          </div>
        </div>
        {error ? (
          <InlineAlert
            error={error}
            err={lastError ?? undefined}
            networkStub
            onRetry={
              lastError && isNetworkError(lastError) ? () => void submitCreate() : undefined
            }
          />
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost sm:!w-auto" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="btn-primary sm:!w-auto" disabled={busy}>
            {busy ? "Создаём…" : "Создать и добавить лекции"}
          </button>
        </div>
      </form>
    </div>
  );
}
