"use client";

import { useCallback, useRef, useState } from "react";
import { FileAudio, Film, Loader2, Upload, X } from "lucide-react";
import { AUDIO_ACCEPT, MEDIA_HINT } from "@/lib/fileFormats";
import { isVideoFilename } from "@/lib/schedule";

const ACCEPT = AUDIO_ACCEPT;
const MAX_MB = 500;

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} КБ`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}

function formatDuration(seconds: number) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

type Props = {
  disabled?: boolean;
  busy?: boolean;
  uploadProgress?: number | null;
  currentFilename?: string | null;
  onFile: (file: File) => void;
  onError?: (message: string) => void;
};

export function AudioUploadZone({
  disabled,
  busy,
  uploadProgress,
  currentFilename,
  onFile,
  onError,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState("");
  const [preview, setPreview] = useState<{ name: string; size: number; duration?: number } | null>(
    null,
  );

  const validateAndPick = useCallback(
    (file: File | undefined) => {
      if (!file || disabled || busy) return;
      if (file.size > MAX_MB * 1024 * 1024) {
        const msg = `Файл слишком большой. Максимум ${MAX_MB} МБ.`;
        setLocalError(msg);
        onError?.(msg);
        return;
      }
      if (file.size < 1024) {
        const msg = "Файл слишком маленький — похоже, он пустой.";
        setLocalError(msg);
        onError?.(msg);
        return;
      }
      setLocalError("");
      setPreview({ name: file.name, size: file.size });
      const url = URL.createObjectURL(file);
      const isVideo = isVideoFilename(file.name) || file.type.startsWith("video/");
      if (isVideo) {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => {
          setPreview({ name: file.name, size: file.size, duration: video.duration });
          URL.revokeObjectURL(url);
        };
        video.onerror = () => URL.revokeObjectURL(url);
        video.src = url;
      } else {
        const audio = new Audio(url);
        audio.addEventListener("loadedmetadata", () => {
          setPreview({ name: file.name, size: file.size, duration: audio.duration });
          URL.revokeObjectURL(url);
        });
        audio.addEventListener("error", () => URL.revokeObjectURL(url));
      }
      onFile(file);
    },
    [busy, disabled, onError, onFile],
  );

  const uploading = uploadProgress != null && uploadProgress < 100;
  const showProgress = uploading || (busy && uploadProgress === 100);

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        className={`upload-zone relative rounded-[14px] border-2 border-dashed px-4 py-8 text-center transition-all duration-300 sm:py-10 ${
          dragOver ? "upload-zone--drag" : showProgress ? "upload-zone--busy" : "upload-zone--idle"
        }`}
        style={{
          borderColor: dragOver ? "var(--accent)" : "var(--border)",
          background: dragOver
            ? "color-mix(in srgb, var(--accent) 8%, var(--bg-elevated))"
            : "color-mix(in srgb, var(--bg-elevated) 90%, transparent)",
          opacity: disabled && !showProgress ? 0.6 : 1,
          cursor: disabled || showProgress ? "default" : "pointer",
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled && !showProgress) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          validateAndPick(e.dataTransfer.files?.[0]);
        }}
        onClick={() => {
          if (!disabled && !showProgress) inputRef.current?.click();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!disabled && !showProgress) inputRef.current?.click();
          }
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          disabled={disabled || showProgress}
          onChange={(e) => {
            validateAndPick(e.target.files?.[0]);
            e.target.value = "";
          }}
        />

        {showProgress ? (
          <div className="mx-auto max-w-sm">
            <Loader2
              size={32}
              className="mx-auto mb-3 animate-spin"
              style={{ color: "var(--accent)" }}
            />
            <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
              {uploadProgress != null && uploadProgress < 100
                ? "Загрузка на сервер…"
                : "Файл принят — запускаем обработку…"}
            </p>
            {preview ? (
              <p className="mt-1 truncate text-xs" style={{ color: "var(--fg-muted)" }}>
                {preview.name}
                {preview.duration ? ` · ~${formatDuration(preview.duration)}` : ""}
                {" · "}
                {formatSize(preview.size)}
              </p>
            ) : null}
            <div
              className="progress-track mx-auto mt-4 h-2 overflow-hidden rounded-full"
              style={{ background: "var(--bg-soft)" }}
            >
              <div
                className="progress-fill h-full rounded-full transition-all duration-300"
                style={{
                  width: `${Math.max(2, uploadProgress ?? 0)}%`,
                  background: "linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white))",
                }}
              />
            </div>
            <p className="mt-2 text-xs tabular-nums" style={{ color: "var(--fg-muted)" }}>
              {uploadProgress ?? 0}%
            </p>
          </div>
        ) : (
          <>
            <div
              className="upload-zone-icon mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-[14px]"
              style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
            >
              {currentFilename ? <FileAudio size={22} /> : <Upload size={22} />}
            </div>
            <p className="text-sm font-medium" style={{ color: "var(--fg)" }}>
              {currentFilename
                ? "Перетащите новый файл или нажмите"
                : "Перетащите аудио или видео лекции сюда"}
            </p>
            <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--fg-muted)" }}>
              {MEDIA_HINT}
            </p>
            {currentFilename ? (
              <p className="mt-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs" style={{ background: "var(--bg-soft)", color: "var(--fg-muted)" }}>
                {isVideoFilename(currentFilename) ? <Film size={12} /> : <FileAudio size={12} />}
                {currentFilename}
              </p>
            ) : null}
          </>
        )}
      </div>

      {preview && !showProgress && !currentFilename ? (
        <div
          className="flex items-center justify-between rounded-[10px] px-3 py-2 text-xs"
          style={{ background: "var(--bg-soft)", color: "var(--fg-muted)" }}
        >
          <span className="truncate">{preview.name}</span>
          <button
            type="button"
            className="btn-ghost !min-h-8 !px-2"
            onClick={() => setPreview(null)}
            aria-label="Очистить"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {localError ? (
        <p className="text-sm" style={{ color: "var(--danger)" }}>
          {localError}
        </p>
      ) : null}
    </div>
  );
}
