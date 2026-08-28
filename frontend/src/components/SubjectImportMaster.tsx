"use client";

import { useState } from "react";
import { CalendarDays, Sparkles, Wand2, X } from "lucide-react";
import { api, isNetworkError, type Subject, type SubjectImportItem } from "@/lib/api";
import { InlineAlert } from "@/components/InlineAlert";
import { StatePlaceholder } from "@/components/StatePlaceholder";
import { formatScheduleSlot } from "@/lib/schedule";
import { errorMessage } from "@/lib/placeholders";

type Props = {
  onCancel: () => void;
  onImported: (subjects: Subject[]) => void;
  withSchedule?: boolean;
};

export function SubjectImportMaster({ onCancel, onImported, withSchedule = false }: Props) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<SubjectImportItem[] | null>(null);
  const [importEmpty, setImportEmpty] = useState(false);
  const [engine, setEngine] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastError, setLastError] = useState<unknown>(null);

  async function onPreview() {
    if (!text.trim()) {
      setError(
        withSchedule
          ? "Вставьте расписание на семестр"
          : "Вставьте список предметов или кусок расписания",
      );
      setImportEmpty(false);
      return;
    }
    setBusy(true);
    setError("");
    setLastError(null);
    setImportEmpty(false);
    try {
      const res = await api.previewSubjectImport(text.trim(), withSchedule);
      if (!res.items.length) {
        setImportEmpty(true);
        setItems(null);
        return;
      }
      setItems(res.items);
      setEngine(res.engine);
    } catch (err) {
      setLastError(err);
      setError(errorMessage(err, "Не удалось разобрать текст"));
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
    setLastError(null);
    try {
      const created = await api.confirmSubjectImport(items);
      onImported(created);
    } catch (err) {
      setLastError(err);
      setError(errorMessage(err, "Не удалось создать предметы"));
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

  const placeholder = withSchedule
    ? `Пн 10:00-11:30 Философия ауд. 301\nСр 10:00-11:30 Философия\nПн 12:00-13:30 Математический анализ\n\nМожно вставить расписание целиком — ИИ разберёт дни и время`
    : `Философия\nАлгебра\nИстория России\n\nили кусок расписания — только названия предметов`;

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
            {withSchedule ? <CalendarDays size={16} /> : <Wand2 size={16} />}
          </span>
          <div>
            <p className="text-sm font-medium">
              {withSchedule ? "Импорт расписания на семестр" : "Импорт предметов"}
            </p>
            <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
              {withSchedule
                ? "Дни недели, время и аудитории сохранятся для каждого предмета."
                : "Только названия — без слотов расписания."}
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
            {!text.trim() && !importEmpty && !error ? (
              <StatePlaceholder
                inline
                compact
                variant={withSchedule ? "empty-import" : "empty-import"}
                title={withSchedule ? "Вставьте расписание" : undefined}
                message={
                  withSchedule
                    ? "Скопируйте расписание из деканата или LMS — понедельник, время, предмет."
                    : undefined
                }
              />
            ) : null}
            <div>
              <label className="label">Текст</label>
              <textarea
                className="input min-h-[9rem] resize-y font-mono text-[0.85rem] leading-relaxed"
                placeholder={placeholder}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setImportEmpty(false);
                }}
              />
            </div>
            {importEmpty ? (
              <StatePlaceholder
                compact
                inline
                variant="import-empty"
                onRetry={() => void onPreview()}
              />
            ) : null}
            {error ? (
              <InlineAlert
                error={error}
                err={lastError ?? undefined}
                networkStub
                onRetry={
                  lastError && isNetworkError(lastError) ? () => void onPreview() : undefined
                }
              />
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
              Найдено {items.length}. Снимите галочки с лишнего
              {withSchedule ? " — расписание сохранится" : ""}
              {engine ? ` · ${engine === "ai" ? "ИИ" : "быстрый разбор"}` : ""}.
            </p>
            <ul className="space-y-2">
              {items.map((item, i) => (
                <li key={`${item.name}-${i}`}>
                  <label
                    className="flex cursor-pointer items-start gap-3 rounded-[12px] border px-3 py-2.5"
                    style={{
                      borderColor: item.selected
                        ? "color-mix(in srgb, var(--accent) 35%, var(--border))"
                        : "var(--border)",
                      background: item.selected ? "color-mix(in srgb, var(--accent-soft) 45%, transparent)" : "transparent",
                    }}
                  >
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 accent-[var(--accent)]"
                      checked={item.selected}
                      onChange={() => toggle(i)}
                    />
                    <span
                      className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ background: item.color || "var(--accent)" }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{item.name}</span>
                      {item.description ? (
                        <span className="block truncate text-xs" style={{ color: "var(--fg-muted)" }}>
                          {item.description}
                        </span>
                      ) : null}
                      {item.schedule?.length ? (
                        <ul className="mt-1.5 space-y-0.5 text-xs" style={{ color: "var(--fg-muted)" }}>
                          {item.schedule.map((slot, si) => (
                            <li key={`${item.name}-slot-${si}`}>{formatScheduleSlot(slot)}</li>
                          ))}
                        </ul>
                      ) : null}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error ? (
              <InlineAlert
                error={error}
                err={lastError ?? undefined}
                networkStub
                onRetry={
                  lastError && isNetworkError(lastError) ? () => void onConfirm() : undefined
                }
              />
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
              <button
                type="button"
                className="btn-ghost sm:!w-auto"
                disabled={busy}
                onClick={() => {
                  setItems(null);
                  setError("");
                  setImportEmpty(false);
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
