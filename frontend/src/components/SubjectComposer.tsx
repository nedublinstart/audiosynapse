"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api, type Subject } from "@/lib/api";

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
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Введите название предмета");
      nameRef.current?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const subject = await api.createSubject({
        name: trimmed,
        description: description.trim() || undefined,
        color,
        schedule: [],
      });
      onCreated(subject);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать предмет");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel mb-6 overflow-hidden p-0">
      <div
        className="flex items-center justify-between gap-3 border-b px-4 py-3 sm:px-5"
        style={{ borderColor: "var(--border)" }}
      >
        <div>
          <p className="text-sm font-medium">Новый предмет</p>
          <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
            Только название — расписание не нужно
          </p>
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
                className="h-8 w-8 rounded-full transition-transform duration-300 hover:scale-110"
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
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            {error}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" className="btn-ghost sm:!w-auto" onClick={onCancel} disabled={busy}>
            Отмена
          </button>
          <button type="submit" className="btn-primary sm:!w-auto" disabled={busy}>
            {busy ? "Создаём…" : "Создать предмет"}
          </button>
        </div>
      </form>
    </div>
  );
}
