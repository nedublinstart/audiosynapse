"use client";

import { Plus, Trash2 } from "lucide-react";
import { emptySlot, WEEKDAYS, type ScheduleSlotDraft } from "@/lib/schedule";

type Props = {
  slots: ScheduleSlotDraft[];
  onChange: (slots: ScheduleSlotDraft[]) => void;
  compact?: boolean;
};

/** Weekly semester schedule — days + time pairs. */
export function ScheduleEditor({ slots, onChange, compact }: Props) {
  function update(index: number, patch: Partial<ScheduleSlotDraft>) {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  function remove(index: number) {
    onChange(slots.filter((_, i) => i !== index));
  }

  function add() {
    onChange([...slots, emptySlot()]);
  }

  return (
    <div className="space-y-3">
      {!compact ? (
        <p className="text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
          Пары на весь семестр — укажите день недели и время. Можно несколько слотов на предмет.
        </p>
      ) : null}
      {slots.map((slot, index) => (
        <div
          key={`slot-${index}`}
          className="grid gap-2 rounded-[12px] border p-3 sm:grid-cols-[auto_1fr_1fr_1fr_auto]"
          style={{ borderColor: "var(--border)", background: "var(--bg-soft)" }}
        >
          <div>
            <label className="label">День</label>
            <select
              className="input !min-h-10"
              value={slot.weekday}
              onChange={(e) => update(index, { weekday: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.short} — {d.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Начало</label>
            <input
              type="time"
              className="input !min-h-10"
              value={slot.start_time}
              onChange={(e) => update(index, { start_time: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Конец</label>
            <input
              type="time"
              className="input !min-h-10"
              value={slot.end_time}
              onChange={(e) => update(index, { end_time: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">Аудитория</label>
            <input
              className="input !min-h-10"
              placeholder="Необязательно"
              value={slot.location ?? ""}
              onChange={(e) => update(index, { location: e.target.value.trim() || null })}
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-ghost !min-h-10 !px-2"
              aria-label="Удалить слот"
              onClick={() => remove(index)}
              disabled={slots.length <= 1}
            >
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      ))}
      <button type="button" className="btn-outline !min-h-9 sm:!w-auto" onClick={add}>
        <Plus size={16} /> Добавить пару
      </button>
    </div>
  );
}
