"use client";

import { useState } from "react";
import { Sparkles, Wand2, X } from "lucide-react";
import { api, type Subject, type SubjectImportItem } from "@/lib/api";

type Props = {
  onCancel: () => void;
  onImported: (subjects: Subject[]) => void;
};

/**
 * Light AI import master — paste a list / timetable text,
 * review names, create subjects without schedule.
 */
export function SubjectImportMaster({ onCancel, onImported }: Props) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<SubjectImportItem[] | null>(null);
  const [engine, setEngine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function onPreview() {
    if (!text.trim()) {
      setError("Вставьте список предметов или кусок расписания");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await api.previewSubjectImport(text.trim());
      if (!res.items.length) {
        setError("Не нашли предметы в тексте — попробуйте по одному названию на строку");
        setItems(null);
        return;
      }
      setItems(res.items);
      setEngine(res.engine);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось разобрать текст");
    } finally {
      setBusy(false);
    }
  }

  async function onConfirm() {
    if (!items?.length) return;
    const selected = items.filter((i) => i.selected);
    if (!selected.length) {
      setError("Отметьте хотя бы один предмет");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const created = await api.confirmSubjectImport(items);
      onImported(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось создать предметы");
    } finally {
      setBusy(false);
    }
  }

  function toggle(index: number) {
    setItems((prev) =>
      prev
        ? prev.map((item, i) => (i === index ? { ...item, selected: !item.selected } : item))
        : prev,
    );
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
            <Wand2 size={16} />
          </span>
          <div>
            <p className="text-sm font-medium">Импорт предметов</p>
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              Вставьте список или расписание — время и слоты ИИ отбросит
            </p>
          </div>
        </div>
        <button type="button" className="btn-ghost !min-h-9 !px-2" onClick={onCancel} aria-label="Закрыть">
          <X size={16} />
        </button>
      </div>

      <div className="grid gap-4 p-4 sm:p-5">
        {!items ? (
          <>
            <div>
              <label className="label">Текст</label>
              <textarea
                className="input min-h-[9rem] resize-y font-mono text-[0.85rem] leading-relaxed"
                placeholder={`Философия\nАлгебра\nИстория России\n\nили кусок расписания — дни и время можно не чистить`}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
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
              <button type="button" className="btn-primary sm:!w-auto" disabled={busy} onClick={() => void onPreview()}>
                <Sparkles size={16} />
                {busy ? "Разбираем…" : "Разобрать через ИИ"}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              Найдено {items.length}. Снимите галочки с лишнего — создадим без расписания
              {engine ? ` · ${engine === "ai" ? "ИИ" : "быстрый разбор"}` : ""}.
            </p>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={`${item.name}-${i}`}>
                  <label
                    className="flex cursor-pointer items-center gap-3 rounded-[12px] border px-3 py-2.5"
                    style={{
                      borderColor: item.selected
                        ? "color-mix(in srgb, var(--accent) 35%, var(--border))"
                        : "var(--border)",
                      background: item.selected ? "color-mix(in srgb, var(--accent-soft) 45%, transparent)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--accent)]"
                      checked={item.selected}
                      onChange={() => toggle(i)}
                    />
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: item.color || "var(--accent)" }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      {item.description ? (
                        <span className="block truncate text-xs" style={{ color: "var(--fg-muted)" }}>
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error ? (
              <p className="text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                className="btn-ghost sm:!w-auto"
                disabled={busy}
                onClick={() => {
                  setItems(null);
                  setError("");
                }}
              >
                Назад к тексту
              </button>
              <button type="button" className="btn-primary sm:!w-auto" disabled={busy} onClick={() => void onConfirm()}>
                {busy ? "Создаём…" : `Создать (${items.filter((i) => i.selected).length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
