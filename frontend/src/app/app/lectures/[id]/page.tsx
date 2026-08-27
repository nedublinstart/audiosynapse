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
import { AudioUploadZone } from "@/components/AudioUploadZone";
import { ProcessingStatus } from "@/components/ProcessingStatus";
import { QuickStartGuide } from "@/components/QuickStartGuide";
import { ChatEmptyState } from "@/components/ChatEmptyState";
import { ErrorPanel, InlineAlert } from "@/components/InlineAlert";
import { SkeletonLecturePage } from "@/components/SkeletonList";
import { StatePlaceholder } from "@/components/StatePlaceholder";
import { TextReveal } from "@/components/TextReveal";
import { api, isNetworkError, type ChatMessage, type Lecture } from "@/lib/api";
import { placeholderForError } from "@/lib/placeholders";

function LectureInner() {
  const params = useParams();
  const lectureId = Number(params.id);
  const invalidId = !Number.isFinite(lectureId) || lectureId <= 0;
  const [lecture, setLecture] = useState<Lecture | null>(null);
  const [tab, setTab] = useState<"notes" | "chat">("notes");
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState("");
  const [examMode, setExamMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [lastError, setLastError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const materialRef = useRef<HTMLInputElement>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingSinceRef = useRef<number | null>(null);
  const prevStatusRef = useRef<string | null>(null);
  const [processingStuck, setProcessingStuck] = useState(false);
  const [loadFailed, setLoadFailed] = useState<unknown>(null);
  const [chatLoadFailed, setChatLoadFailed] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (invalidId) {
      setError("Некорректная ссылка на лекцию");
      return null;
    }
    const data = await api.getLecture(lectureId);
    setLecture(data);
    return data;
  }, [invalidId, lectureId]);

  const retryLoad = useCallback(() => {
    setLoadFailed(null);
    setError("");
    void load()
      .then(() => setLoadFailed(null))
      .catch((e) => {
        setLoadFailed(e);
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      });
  }, [load]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("tab") === "chat") setTab("chat");
    if (q.get("exam") === "1") setExamMode(true);
  }, []);

  useEffect(() => {
    if (invalidId) {
      const err = new Error("Некорректная ссылка на лекцию");
      setLoadFailed(err);
      setError(err.message);
      return;
    }
    void load()
      .then(() => setLoadFailed(null))
      .catch((e) => {
        setLoadFailed(e);
        setError(e instanceof Error ? e.message : "Ошибка загрузки");
      });
  }, [invalidId, load]);

  useEffect(() => {
    if (tab !== "chat" || invalidId) return;
    setChatLoadFailed(false);
    void api
      .listChat(lectureId)
      .then((rows) => {
        setChat(rows);
        setChatLoadFailed(false);
      })
      .catch(() => setChatLoadFailed(true));
  }, [tab, lectureId, invalidId]);

  useEffect(() => {
    if (lecture?.status !== "processing") {
      if (pollRef.current) clearTimeout(pollRef.current);
      processingSinceRef.current = null;
      setProcessingStuck(false);
      return;
    }
    if (!processingSinceRef.current) {
      processingSinceRef.current = Date.now();
    }
    const tick = () => {
      const elapsed = Date.now() - (processingSinceRef.current ?? Date.now());
      if (elapsed > 30 * 60 * 1000) {
        setProcessingStuck(true);
      }
      void load();
      pollRef.current = setTimeout(tick, 800);
    };
    pollRef.current = setTimeout(tick, 400);
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [lecture?.status, load]);

  useEffect(() => {
    if (
      lecture?.status === "ready" &&
      lecture.notes_markdown &&
      prevStatusRef.current === "processing"
    ) {
      setSuccess("Конспект готов! Можно читать, экспортировать или спросить в чате.");
    }
    prevStatusRef.current = lecture?.status ?? null;
  }, [lecture?.status, lecture?.notes_markdown]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat, tab, busy]);

  async function onAudio(file: File) {
    setBusy(true);
    setError("");
    setLastError(null);
    setSuccess("");
    setUploadProgress(0);
    try {
      const updated = await api.uploadAudio(lectureId, file, (pct) => setUploadProgress(pct));
      setUploadProgress(100);
      setLecture(updated);
    } catch (err) {
      setUploadProgress(null);
      setLastError(err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
      window.setTimeout(() => setUploadProgress(null), 600);
    }
  }

  async function onMaterial(file: File) {
    setBusy(true);
    setError("");
    setLastError(null);
    setSuccess("");
    try {
      const updated = await api.uploadMaterial(lectureId, file);
      setLecture(updated);
      setSuccess(
        updated.status === "processing"
          ? "Материал добавлен — обновляем конспект…"
          : "Материал добавлен.",
      );
    } catch (err) {
      setLastError(err);
      setError(err instanceof Error ? err.message : "Ошибка загрузки");
    } finally {
      setBusy(false);
    }
  }

  async function onReprocess() {
    setBusy(true);
    setError("");
    setLastError(null);
    try {
      const updated = await api.reprocessLecture(lectureId);
      setLecture(updated);
      setProcessingStuck(false);
      processingSinceRef.current = Date.now();
    } catch (err) {
      setLastError(err);
      setError(err instanceof Error ? err.message : "Не удалось перезапустить обработку");
    } finally {
      setBusy(false);
    }
  }

  async function onChat(e: FormEvent) {
    e.preventDefault();
    if (!message.trim() || busy) return;
    const text = message.trim();
    setMessage("");
    setBusy(true);
    const optimistic: ChatMessage = {
      id: Date.now(),
      role: "user",
      content: text,
      exam_mode: examMode,
      created_at: new Date().toISOString(),
    };
    setChat((prev) => [...prev, optimistic]);
    try {
      const assistant = await api.chat(lectureId, text, examMode);
      setChat((prev) => [...prev, assistant]);
    } catch {
      const fallback: ChatMessage = {
        id: Date.now() + 1,
        role: "assistant",
        content:
          "Сейчас нет связи с сервером. Откройте вкладку «Конспект» — там уже есть материалы лекции. " +
          "Когда интернет вернётся, задайте вопрос ещё раз.",
        exam_mode: examMode,
        created_at: new Date().toISOString(),
      };
      setChat((prev) => [...prev, fallback]);
    } finally {
      setBusy(false);
    }
  }

  if (!lecture) {
    if (loadFailed) {
      const variant = invalidId ? "not-found" : placeholderForError(loadFailed);
      return (
        <AppShell>
          <ErrorPanel
            err={loadFailed}
            error={
              invalidId
                ? "Лекция не найдена"
                : isNetworkError(loadFailed)
                  ? undefined
                  : error || "Не удалось загрузить лекцию"
            }
            onRetry={invalidId ? undefined : retryLoad}
            compact={variant === "not-found"}
          />
        </AppShell>
      );
    }

    return (
      <AppShell>
        <SkeletonLecturePage />
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
              <span className="hidden sm:inline">К предмету</span>
            </Link>
            <StatusBadge status={lecture.status} />
            {lecture.audio_filename ? (
              <span className="max-w-[10rem] truncate text-xs sm:max-w-none" style={{ color: "var(--fg-muted)" }}>
                <Mic size={12} className="mr-1 inline" />
                {lecture.audio_filename}
              </span>
            ) : null}
          </div>

          <div className="flex flex-col gap-3">
            <AudioUploadZone
              disabled={lecture.status === "processing" && uploadProgress == null}
              busy={busy}
              uploadProgress={uploadProgress}
              currentFilename={lecture.audio_filename}
              onFile={(f) => void onAudio(f)}
              onError={(msg) => {
                setError(msg);
                setLastError(new Error(msg));
              }}
            />
            <div className="flex flex-wrap gap-2">
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
                className="btn-outline sm:!w-auto"
                disabled={busy || lecture.status === "processing"}
                onClick={() => materialRef.current?.click()}
              >
                <FileUp size={16} /> Добавить материал (PDF, слайды)
              </button>
              {lecture.audio_filename && lecture.status !== "processing" ? (
                <button
                  className="btn-outline sm:!w-auto"
                  disabled={busy}
                  onClick={() => void onReprocess()}
                >
                  <RefreshCw size={16} /> Обработать снова
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </FadeIn>

      {lecture.enrichment_notice ? (
        <TextReveal contentKey={lecture.enrichment_notice}>
          <div
            className="mb-4 rounded-[10px] px-4 py-3 text-sm"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {lecture.enrichment_notice}
          </div>
        </TextReveal>
      ) : null}

      {success ? (
        <TextReveal contentKey={success}>
          <div
            className="mb-4 rounded-[10px] px-4 py-3 text-sm"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {success}
          </div>
        </TextReveal>
      ) : null}

      {error ? (
        <InlineAlert
          error={error}
          err={lastError ?? undefined}
          networkStub
          onRetry={
            lastError && isNetworkError(lastError)
              ? () => {
                  setError("");
                  setLastError(null);
                  void retryLoad();
                }
              : undefined
          }
        />
      ) : null}

      <div
        className="mb-4 flex gap-1 border-b"
        style={{ borderColor: "var(--border)" }}
        role="tablist"
      >
        <button
          role="tab"
          aria-selected={tab === "notes"}
          className="tab-btn relative flex-1 rounded-none px-3 py-3 text-sm sm:flex-none"
          style={{
            color: tab === "notes" ? "var(--fg)" : "var(--fg-muted)",
          }}
          onClick={() => setTab("notes")}
        >
          Конспект
        </button>
        <button
          role="tab"
          aria-selected={tab === "chat"}
          className="tab-btn relative flex flex-1 items-center justify-center gap-1.5 rounded-none px-3 py-3 text-sm sm:flex-none"
          style={{
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
              <>
                <ProcessingStatus
                  stage={lecture.processing_stage}
                  progress={lecture.processing_progress}
                  message={lecture.processing_message}
                  audioSizeBytes={lecture.audio_size_bytes}
                  stuck={processingStuck}
                />
                {processingStuck ? (
                  <div className="mt-6">
                    <StatePlaceholder
                      inline
                      compact
                      variant="processing-wait"
                      actions={
                        lecture.audio_filename
                          ? [
                              {
                                label: "Обработать снова",
                                onClick: () => void onReprocess(),
                                primary: true,
                              },
                            ]
                          : undefined
                      }
                    />
                  </div>
                ) : null}
              </>
            ) : lecture.status === "needs_clarification" ? (
              <StatePlaceholder
                inline
                variant="clarification"
                actions={
                  lecture.audio_filename
                    ? [
                        {
                          label: "Обработать снова",
                          onClick: () => void onReprocess(),
                          primary: true,
                        },
                      ]
                    : undefined
                }
              />
            ) : lecture.notes_markdown ? (
              <MarkdownNotes content={lecture.notes_markdown} />
            ) : (
              <div className="space-y-6">
                <StatePlaceholder inline compact variant="empty-notes" />
                <QuickStartGuide />
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
            ) : lecture.status !== "processing" && lecture.notes_markdown ? (
              <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--border)" }}>
                <StatePlaceholder inline compact variant="empty-materials" />
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
              {chatLoadFailed ? (
                <StatePlaceholder
                  compact
                  inline
                  variant="offline-chat"
                  onRetry={() => {
                    setChatLoadFailed(false);
                    void api
                      .listChat(lectureId)
                      .then(setChat)
                      .catch(() => setChatLoadFailed(true));
                  }}
                />
              ) : null}
              {chat.map((m) => (
                <div
                  key={m.id}
                  className="animate-chat-in max-w-[92%] rounded-[12px] px-3 py-2.5 text-sm sm:max-w-[85%]"
                  style={{
                    marginLeft: m.role === "user" ? "auto" : 0,
                    background: m.role === "user" ? "var(--accent-soft)" : "var(--bg-soft)",
                    color: "var(--fg)",
                  }}
                >
                  <MarkdownNotes content={m.content} animate={false} />
                </div>
              ))}
              {!chat.length && !chatLoadFailed ? <ChatEmptyState onHint={setMessage} /> : null}
              {busy ? (
                <div
                  className="animate-chat-in max-w-[85%] rounded-[12px] px-3 py-2.5 text-sm"
                  style={{ background: "var(--bg-soft)", color: "var(--fg-muted)" }}
                >
                  <span
                    className="processing-dot mr-2 inline-block h-2 w-2 rounded-full align-middle"
                    style={{ background: "var(--processing)" }}
                  />
                  Synapse думает…
                </div>
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
