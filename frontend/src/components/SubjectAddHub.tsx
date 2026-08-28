"use client";

import { CalendarDays, Layers, Plus, Sparkles, Wand2 } from "lucide-react";

type Mode = "none" | "create" | "import" | "schedule";

type Props = {
  mode: Mode;
  onModeChange: (mode: Exclude<Mode, "none">) => void;
  compact?: boolean;
};

export function SubjectAddHub({ mode, onModeChange, compact }: Props) {
  if (mode !== "none") return null;

  if (compact) {
    return (
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-outline !min-h-10 shrink-0 !px-3 sm:!w-auto"
          onClick={() => onModeChange("schedule")}
        >
          <CalendarDays size={16} />
          <span className="hidden sm:inline">Расписание</span>
        </button>
        <button
          type="button"
          className="btn-outline !min-h-10 shrink-0 !px-3 sm:!w-auto"
          onClick={() => onModeChange("import")}
        >
          <Wand2 size={16} />
          <span className="hidden sm:inline">Импорт</span>
        </button>
        <button
          type="button"
          className="btn-primary !min-h-10 shrink-0 !px-3 sm:!w-auto"
          onClick={() => onModeChange("create")}
        >
          <Plus size={16} />
          <span className="hidden sm:inline">Предмет</span>
        </button>
      </div>
    );
  }

  return (
    <section className="panel-reveal panel mb-6 overflow-hidden p-0">
      <div className="border-b px-4 py-4 sm:px-5 sm:py-5" style={{ borderColor: "var(--border)" }}>
        <div className="mb-1 flex items-center gap-2">
          <Layers size={16} style={{ color: "var(--accent)" }} />
          <p className="text-sm font-medium">Добавить предметы</p>
        </div>
        <p className="text-xs leading-relaxed sm:text-sm" style={{ color: "var(--fg-muted)" }}>
          Один предмет, список или расписание на весь семестр — как в вашем вузе.
        </p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
        <button
          type="button"
          className="subject-add-card pressable panel panel-interactive flex flex-col items-start gap-3 p-4 text-left sm:p-5"
          onClick={() => onModeChange("create")}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Plus size={20} />
          </span>
          <div>
            <p className="font-medium tracking-tight">Один предмет</p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              Быстро — название и сразу к лекциям.
            </p>
          </div>
        </button>
        <button
          type="button"
          className="subject-add-card pressable panel panel-interactive flex flex-col items-start gap-3 p-4 text-left sm:p-5"
          onClick={() => onModeChange("schedule")}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <CalendarDays size={20} />
          </span>
          <div>
            <p className="font-medium tracking-tight">Расписание на семестр</p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              Пн, Вт… и время пар — вручную или импортом.
            </p>
          </div>
        </button>
        <button
          type="button"
          className="subject-add-card pressable panel panel-interactive flex flex-col items-start gap-3 p-4 text-left sm:p-5"
          onClick={() => onModeChange("import")}
        >
          <span
            className="flex h-10 w-10 items-center justify-center rounded-[12px]"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Sparkles size={20} />
          </span>
          <div>
            <p className="font-medium tracking-tight">Список предметов</p>
            <p className="mt-1 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              Вставьте названия — без расписания.
            </p>
          </div>
        </button>
      </div>
    </section>
  );
}
