"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Download,
  FileUp,
  GraduationCap,
  MessageSquare,
  Mic,
  Printer,
  RefreshCw,
  Send,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { RequireAuth } from "@/components/RequireAuth";
import { FadeIn } from "@/components/FadeIn";
import { StatusBadge } from "@/components/StatusBadge";
import {
  MarkdownNotes,
  exportNotesAsMarkdown,
  printNotesAsPdf,
} from "@/components/MarkdownNotes";
import { api, type ChatMessage, type Lecture } from "@/lib/api";

function LectureInner() {
  const params = useParams();
  const lectureId = Number(params.id);
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [tab, setTab] = useState<"notes" | "chat">("notes");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [examMode, setExamMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLInputElement>(null);
  const materialRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const data = await api.getLecture(lectureId);
    setLecture(data);
    return data;
  }, [lectureId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("tab") === "chat") setTab("chat");
    if (q.get("exam") === "1") setExamMode(true);
  }, []);

  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);

  useEffect(() => {
    if (lecture?.status === "processing") {
      pollRef.current = setInterval(() => {
        void load();
      }, 2000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
      };
    }
    if (pollRef.current) clearInterval(pollRef.current);
  }, [lecture?.status, load]);

  useEffect(() => {
    if (tab === "chat") {
      void api.listChat(lectureId).then(setChat).catch((e) => setError(e.message));
    }
  }, [tab, lectureId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, tab]);

  async function onAudio(file: File) {
    setBusy(true);
    setError("");
    try {
      const updated = await api.uploadAudio(lectureId, file);
      setLecture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  async function onMaterial(file: File) {
    setBusy(true);
    setError("");
    try {
      const updated = await api.uploadMaterial(lectureId, file);
      setLecture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  async function onReprocess() {
    setBusy(true);
    setError("");
    try {
      const updated = await api.reprocessLecture(lectureId);
      setLecture(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось перезапустить обработку");
    } finally {
      setBusy(false);
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    const text = message.trim();
    setMessage("");
    setBusy(true);
    try {
      const optimistic: ChatMessage = {
        id: Date.now(),
        role: "user",
        content: text,
        exam_mode: examMode,
        created_at: new Date().toISOString(),
      };
      setChat((prev) => [...prev, optimistic]);
      await api.chat(lectureId, text, examMode);
      const history = await api.listChat(lectureId);
      setChat(history);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка чата");
    } finally {
      setBusy(false);
    }
  }

  if (!lecture) {
    return (
      <AppShell>
        <div className="space-y-3 animate-fade-in">
          <div className="skeleton h-8 w-48" />
          <div className="skeleton h-40 w-full" />
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            {error || "Загрузка лекции…"}
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell
      title={`${lecture.title}${lecture.topic ? ` — ${lecture.topic}` : ""}`}
      actions={
        lecture.notes_markdown ? (
          <div className="flex items-center gap-0.5">
            <button
              className="btn-ghost !min-h-10 !px-2.5"
              title="Экспорт Markdown"
              onClick={() =>
                exportNotesAsMarkdown(lecture.topic || lecture.title, lecture.notes_markdown || "")
              }
            >
              <Download size={16} />
            </button>
            <button className="btn-ghost !min-h-10 !px-2.5 no-print" title="Печать / PDF" onClick={printNotesAsPdf}>
              <Printer size={16} />
            </button>
          </div>
        ) : null
      }
    >
      <FadeIn>
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href={`/app/subjects/${lecture.subject_id}`}
              className="btn-ghost !min-h-10 !px-2.5"
            >
              <ArrowLeft size={16} />
              <span className="hidden xs:inline sm:inline">К предмету</span>
            </Link>
            <StatusBadge status={lecture.status} />
            {lecture.audio_filename ? (
              <span className="max-w-[10rem] truncate text-xs sm:max-w-none" style={{ color: "var(--fg-muted)" }}>
                <Mic size={12} className="mr-1 inline" />
                {lecture.audio_filename}
              </span>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            <input
              ref={audioRef}
              type="file"
              accept=".mp3,.wav,.m4a,.ogg,.opus,.aac,.flac,.wma,.amr,.mp4,.webm,audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onAudio(f);
              }}
            />
            <input
              ref={materialRef}
              type="file"
              accept=".pdf,.pptx,.docx,.png,.jpg,.jpeg,.webp,.txt,.md"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onMaterial(f);
              }}
            />
            <button
              className="btn-primary col-span-2 sm:col-span-1 sm:!w-auto"
              disabled={busy}
              onClick={() => audioRef.current?.click()}
            >
              <Mic size={16} />
              <span className="truncate">
                {lecture.audio_filename ? "Заменить аудио" : "Загрузить аудио"}
              </span>
            </button>
            <button
              className="btn-outline col-span-2 sm:!w-auto"
              disabled={busy}
              onClick={() => materialRef.current?.click()}
            >
              <FileUp size={16} /> Материал
            </button>
            {lecture.audio_filename && lecture.status !== "processing" ? (
              <button
                className="btn-outline col-span-2 sm:!w-auto"
                disabled={busy}
                onClick={() => void onReprocess()}
              >
                <RefreshCw size={16} /> Обработать снова
              </button>
            ) : null}
          </div>
        </div>
      </FadeIn>

      {lecture.enrichment_notice ? (
        <div
          className="mb-4 animate-fade-in rounded-[10px] px-4 py-3 text-sm"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          {lecture.enrichment_notice}
        </div>
      ) : null}

      {error ? (
        <p className="mb-4 text-sm" style={{ color: "var(--danger)" }}>
          {error}
        </p>
      ) : null}

      <div
        className="mb-4 flex gap-1 border-b"
        style={{ borderColor: "var(--border)" }}
        role="tablist"
      >
        <button
          role="tab"
          aria-selected={tab === "notes"}
          className="relative flex-1 rounded-none border-b-2 px-3 py-3 text-sm transition-colors duration-300 sm:flex-none"
          style={{
            borderColor: tab === "notes" ? "var(--accent)" : "transparent",
            color: tab === "notes" ? "var(--fg)" : "var(--fg-muted)",
          }}
          onClick={() => setTab("notes")}
        >
          Конспект
        </button>
        <button
          role="tab"
          aria-selected={tab === "chat"}
          className="relative flex flex-1 items-center justify-center gap-1.5 rounded-none border-b-2 px-3 py-3 text-sm transition-colors duration-300 sm:flex-none"
          style={{
            borderColor: tab === "chat" ? "var(--accent)" : "transparent",
            color: tab === "chat" ? "var(--fg)" : "var(--fg-muted)",
          }}
          onClick={() => setTab("chat")}
        >
          <MessageSquare size={14} /> Чат
        </button>
      </div>

      {tab === "notes" ? (
        <FadeIn key="notes">
          <article className="panel p-4 sm:p-8">
            {lecture.status === "processing" ? (
              <div className="flex flex-col items-center gap-3 py-16 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
                <span
                  className="processing-dot h-2 w-2 rounded-full"
                  style={{ background: "var(--processing)" }}
                />
                Расшифровываем аудио и собираем конспект…
              </div>
            ) : lecture.notes_markdown ? (
              <MarkdownNotes content={lecture.notes_markdown} />
            ) : (
              <div className="py-16 text-center text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                Загрузите аудио (mp3, wav, m4a, ogg, opus, aac, flac и др.),
                <br className="sm:hidden" /> чтобы собрать конспект.
              </div>
            )}
            {lecture.materials.length > 0 ? (
              <div className="mt-8 border-t pt-4" style={{ borderColor: "var(--border)" }}>
                <div className="label mb-2">Материалы</div>
                <ul className="space-y-1.5 text-sm">
                  {lecture.materials.map((m) => (
                    <li key={m.id} className="truncate">
                      {m.filename}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        </FadeIn>
      ) : (
        <FadeIn key="chat">
          <div
            className="panel flex flex-col"
            style={{
              height: "min(70dvh, 640px)",
              minHeight: "22rem",
            }}
          >
            <div
              className="flex flex-col gap-2 border-b px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-4"
              style={{ borderColor: "var(--border)" }}
            >
              <div className="text-xs sm:text-sm" style={{ color: "var(--fg-muted)" }}>
                Только материалы этой лекции
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={examMode}
                  onChange={(e) => setExamMode(e.target.checked)}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <GraduationCap size={14} /> Экзамен
              </label>
            </div>
            <div className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4">
              {chat.map((m) => (
                <div
                  key={m.id}
                  className="max-w-[92%] rounded-[12px] px-3 py-2.5 text-sm animate-fade-up sm:max-w-[85%]"
                  style={{
                    marginLeft: m.role === "user" ? "auto" : 0,
                    background: m.role === "user" ? "var(--accent-soft)" : "var(--bg-soft)",
                    color: "var(--fg)",
                  }}
                >
                  <MarkdownNotes content={m.content} />
                </div>
              ))}
              {!chat.length ? (
                <p className="text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
                  Например: «Объясни разницу между понятиями на примерах из этой лекции».
                </p>
              ) : null}
              <div ref={chatEndRef} />
            </div>
            <form
              onSubmit={onChat}
              className="flex gap-2 border-t p-3 safe-pb"
              style={{ borderColor: "var(--border)" }}
            >
              <input
                className="input"
                placeholder={examMode ? "Вопросы или ответ…" : "Вопрос по лекции…"}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
              <button className="btn-primary !min-h-11 !w-11 shrink-0 !px-0" disabled={busy} aria-label="Отправить">
                <Send size={16} />
              </button>
            </form>
          </div>
        </FadeIn>
      )}
    </AppShell>
  );
}

export default function LecturePage() {
  return (
    <RequireAuth>
      <LectureInner />
    </RequireAuth>
  );
}
