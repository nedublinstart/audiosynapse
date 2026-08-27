"use client";

import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  CalendarDays,
  CloudOff,
  FileAudio,
  FileQuestion,
  FolderOpen,
  HelpCircle,
  Inbox,
  Layers,
  MapPinOff,
  MessageSquareOff,
  RefreshCw,
  ServerCrash,
  UploadCloud,
  WifiOff,
  Clock3,
  Sparkles,
} from "lucide-react";

export type PlaceholderVariant =
  | "network"
  | "timeout"
  | "server"
  | "load-failed"
  | "empty"
  | "empty-subjects"
  | "empty-lectures"
  | "empty-calendar-day"
  | "empty-chat"
  | "empty-notes"
  | "empty-materials"
  | "empty-import"
  | "import-empty"
  | "not-found"
  | "clarification"
  | "upload-failed"
  | "offline-chat"
  | "auth-failed"
  | "processing-wait"
  | "calendar-offline";

type Copy = { title: string; message: string; icon: LucideIcon };

const COPY: Record<PlaceholderVariant, Copy> = {
  network: {
    title: "Нет связи с сервером",
    message: "Проверьте интернет и попробуйте снова. Введённые данные на устройстве не потеряны.",
    icon: WifiOff,
  },
  timeout: {
    title: "Ответ занял слишком много времени",
    message: "Соединение медленное — повторите запрос через несколько секунд.",
    icon: Clock3,
  },
  server: {
    title: "Сервер временно недоступен",
    message: "Мы уже работаем над этим. Попробуйте обновить страницу чуть позже.",
    icon: ServerCrash,
  },
  "load-failed": {
    title: "Не удалось загрузить",
    message: "Данные не пришли с сервера. Нажмите «Повторить» или вернитесь назад.",
    icon: CloudOff,
  },
  empty: {
    title: "Пока пусто",
    message: "Здесь появится содержимое, когда вы его добавите.",
    icon: Inbox,
  },
  "empty-subjects": {
    title: "Начните с предметов",
    message: "Добавьте один предмет или вставьте весь список — расписание и время не нужны.",
    icon: Layers,
  },
  "empty-lectures": {
    title: "Лекций пока нет",
    message: "Создайте карточку лекции и загрузите аудио — Synapse соберёт развёрнутый конспект.",
    icon: BookOpen,
  },
  "empty-calendar-day": {
    title: "В этот день лекций нет",
    message: "Выберите другой день в календаре или создайте новую лекцию.",
    icon: CalendarDays,
  },
  "empty-chat": {
    title: "Спросите по лекции",
    message: "Ответ строится только из конспекта и материалов этой лекции — без выдумок.",
    icon: MessageSquareOff,
  },
  "empty-notes": {
    title: "Конспекта ещё нет",
    message: "Загрузите аудио лекции или PDF/DOCX — Synapse соберёт структурированный текст.",
    icon: FileQuestion,
  },
  "empty-materials": {
    title: "Дополнительных материалов нет",
    message: "PDF или слайды обогатят конспект схемами и списками из презентации.",
    icon: FolderOpen,
  },
  "empty-import": {
    title: "Вставьте список предметов",
    message: "По одному названию на строку или кусок расписания — время ИИ отбросит сам.",
    icon: Sparkles,
  },
  "import-empty": {
    title: "Предметы не найдены",
    message: "В тексте не нашлось названий дисциплин. Попробуйте по одному предмету на строку.",
    icon: Sparkles,
  },
  "not-found": {
    title: "Не найдено",
    message: "Такой страницы или записи нет. Проверьте ссылку или вернитесь в учебный процесс.",
    icon: MapPinOff,
  },
  clarification: {
    title: "Нужно уточнение",
    message:
      "Не удалось полностью обработать лекцию. Загрузите аудио заново, добавьте PDF/DOCX или нажмите «Обработать снова».",
    icon: HelpCircle,
  },
  "upload-failed": {
    title: "Не удалось загрузить файл",
    message: "Проверьте формат и размер файла, а также соединение с интернетом.",
    icon: UploadCloud,
  },
  "offline-chat": {
    title: "Чат временно недоступен",
    message: "Нет связи с сервером. Конспект на вкладке слева уже сохранён — вернитесь, когда интернет появится.",
    icon: WifiOff,
  },
  "auth-failed": {
    title: "Не удалось войти",
    message: "Проверьте email и пароль. Если проблема в сети — попробуйте снова через минуту.",
    icon: WifiOff,
  },
  "processing-wait": {
    title: "Обработка идёт дольше обычного",
    message: "Можно подождать ещё немного или перезапустить обработку вручную.",
    icon: FileAudio,
  },
  "calendar-offline": {
    title: "Календарь не загрузился",
    message: "Без интернета даты лекций не подтянутся. Остальной учебный процесс доступен.",
    icon: CalendarDays,
  },
};

export type PlaceholderAction = {
  label: string;
  onClick: () => void;
  primary?: boolean;
};

export function StatePlaceholder({
  variant = "empty",
  title,
  message,
  onRetry,
  actions,
  compact,
  inline,
}: {
  variant?: PlaceholderVariant;
  title?: string;
  message?: string;
  onRetry?: () => void;
  actions?: PlaceholderAction[];
  compact?: boolean;
  inline?: boolean;
}) {
  const meta = COPY[variant];
  const Icon = meta.icon;
  const resolvedActions: PlaceholderAction[] = [
    ...(onRetry ? [{ label: "Повторить", onClick: onRetry, primary: true }] : []),
    ...(actions ?? []),
  ];

  return (
    <div
      className={`state-placeholder animate-text-in flex flex-col items-center text-center ${
        inline ? "" : "panel"
      } ${compact ? "px-4 py-6 sm:py-8" : "px-6 py-10 sm:py-12"}`}
    >
      <div
        className={`mb-4 flex items-center justify-center rounded-[14px] ${
          compact ? "h-10 w-10" : "h-12 w-12"
        }`}
        style={{ background: "var(--bg-soft)", color: "var(--fg-muted)" }}
      >
        <Icon size={compact ? 18 : 22} />
      </div>
      <p className="mb-1 text-base font-medium" style={{ color: "var(--fg)" }}>
        {title ?? meta.title}
      </p>
      <p className="max-w-sm text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        {message ?? meta.message}
      </p>
      {resolvedActions.length ? (
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-center">
          {resolvedActions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={action.primary ? "btn-primary sm:!w-auto" : "btn-outline sm:!w-auto"}
              onClick={action.onClick}
            >
              {action.label === "Повторить" ? <RefreshCw size={16} /> : null}
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** @deprecated use StatePlaceholder */
export function NetworkStub(props: {
  variant?: "network" | "empty" | "timeout";
  title?: string;
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}) {
  return <StatePlaceholder {...props} />;
}
