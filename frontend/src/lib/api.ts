// Same-origin by default so the browser talks to Next.js rewrites → FastAPI.
// Override with NEXT_PUBLIC_API_URL only when the API is on another host.
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export type LectureStatus =
  | "awaiting_audio"
  | "processing"
  | "ready"
  | "needs_clarification";

export type User = {
  id: number;
  email: string;
  full_name: string;
  created_at: string;
};

export type Semester = {
  id: number;
  name: string;
  created_at: string;
};

export type ScheduleSlot = {
  id: number;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
};

export type Subject = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  semester_id: number | null;
  created_at: string;
  schedule_slots: ScheduleSlot[];
  lecture_count: number;
};

export type Material = {
  id: number;
  filename: string;
  content_type: string;
  created_at: string;
};

export type Lecture = {
  id: number;
  subject_id: number;
  title: string;
  topic: string | null;
  lecture_date: string | null;
  status: LectureStatus;
  audio_filename: string | null;
  audio_size_bytes: number | null;
  processing_stage: string | null;
  processing_progress: number;
  processing_message: string | null;
  notes_markdown: string | null;
  enrichment_notice: string | null;
  duration_seconds: number | null;
  created_at: string;
  updated_at: string;
  materials: Material[];
  transcript?: string | null;
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant" | string;
  content: string;
  exam_mode: boolean;
  source?: "ai" | "offline" | "greeting" | string;
  created_at: string;
};

export type ScheduleSuggestion = {
  subject_id: number;
  subject_name: string;
  weekday: number;
  start_time: string;
  end_time: string;
  location: string | null;
  suggested_title: string;
};

export type SubjectImportItem = {
  name: string;
  description: string | null;
  color: string | null;
  selected: boolean;
  schedule?: Omit<ScheduleSlot, "id">[];
};

export type CalendarLecture = {
  id: number;
  title: string;
  topic: string | null;
  lecture_date: string | null;
  status: LectureStatus;
  subject_id: number;
  subject_name: string;
  subject_color: string;
};

class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("synapse_token");
}

export function setToken(token: string | null) {
  if (typeof window === "undefined") return;
  if (token) localStorage.setItem("synapse_token", token);
  else localStorage.removeItem("synapse_token");
}

function parseApiErrorDetail(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object") return fallback;
  const detail = (data as { detail?: unknown }).detail;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object" && "msg" in item) {
          return String((item as { msg?: string }).msg || "");
        }
        return "";
      })
      .filter(Boolean);
    if (parts.length) return parts.join(". ");
  }
  return fallback;
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  isForm = false,
  timeoutMs = 60_000,
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!isForm) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const controller = new AbortController();
  let timer: number | undefined;
  if (typeof window !== "undefined" && timeoutMs > 0) {
    timer = window.setTimeout(() => controller.abort(), timeoutMs);
  }

  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      let detail = res.statusText;
      try {
        const data = await res.json();
        detail = parseApiErrorDetail(data, "Не удалось выполнить запрос");
      } catch {
        /* ignore */
      }
      throw new ApiError(res.status, typeof detail === "string" ? detail : "Не удалось выполнить запрос");
    }
    if (res.status === 204) return undefined as T;
    return res.json();
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError(0, "Запрос занял слишком много времени — попробуйте ещё раз");
    }
    throw err;
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

function uploadForm<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}${path}`);
    const token = getToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.addEventListener("progress", (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText) as T);
        } catch {
          reject(new ApiError(xhr.status, "Некорректный ответ сервера"));
        }
        return;
      }
      let detail = xhr.statusText;
      try {
        const data = JSON.parse(xhr.responseText);
        detail = parseApiErrorDetail(data, "Не удалось загрузить файл");
      } catch {
        /* ignore */
      }
      reject(new ApiError(xhr.status, typeof detail === "string" ? detail : "Не удалось загрузить файл"));
    });

    xhr.addEventListener("error", () => reject(new ApiError(0, "Сеть недоступна — проверьте соединение")));
    xhr.addEventListener("abort", () => reject(new ApiError(0, "Загрузка отменена")));
    xhr.send(form);
  });
}

export type AiHealthStatus = {
  engine: string;
  custom_api_configured: boolean;
  custom_api_model: string | null;
  cached_provider: string | null;
  timeout_seconds: number;
  max_attempts: number;
  candidate_providers: string[];
  transcription: {
    api: boolean;
    api_model: string | null;
    local_whisper: boolean;
    local_whisper_model: string;
    language: string;
    beam_size: number;
    prefer_local: boolean;
  };
};

export const api = {
  health: () =>
    request<{ status: string; app: string; ai: AiHealthStatus }>("/api/health"),
  register: (body: { email: string; full_name: string; password: string }) =>
    request<{ access_token: string; user: User }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  login: (body: { email: string; password: string }) =>
    request<{ access_token: string; user: User }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  me: () => request<User>("/api/auth/me"),
  listSemesters: () => request<Semester[]>("/api/semesters"),
  createSemester: (name: string) =>
    request<Semester>("/api/semesters", { method: "POST", body: JSON.stringify({ name }) }),
  listSubjects: () => request<Subject[]>("/api/subjects"),
  createSubject: (body: {
    name: string;
    description?: string;
    color?: string;
    semester_id?: number | null;
    schedule?: Omit<ScheduleSlot, "id">[];
  }) => request<Subject>("/api/subjects", { method: "POST", body: JSON.stringify(body) }),
  previewSubjectImport: (text: string, withSchedule = false) =>
    request<{ engine: string; items: SubjectImportItem[] }>(
      "/api/subjects/import/preview",
      {
        method: "POST",
        body: JSON.stringify({ text, with_schedule: withSchedule }),
      },
      false,
      120_000,
    ),
  confirmSubjectImport: (items: SubjectImportItem[]) =>
    request<Subject[]>("/api/subjects/import", {
      method: "POST",
      body: JSON.stringify({ items }),
    }),
  getSubject: (id: number) => request<Subject>(`/api/subjects/${id}`),
  deleteSubject: (id: number) =>
    request<void>(`/api/subjects/${id}`, { method: "DELETE" }),
  addScheduleSlot: (
    subjectId: number,
    body: Omit<ScheduleSlot, "id">,
  ) =>
    request<ScheduleSlot>(`/api/subjects/${subjectId}/schedule`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  deleteScheduleSlot: (subjectId: number, slotId: number) =>
    request<void>(`/api/subjects/${subjectId}/schedule/${slotId}`, {
      method: "DELETE",
    }),
  listLectures: (subjectId: number) =>
    request<Lecture[]>(`/api/subjects/${subjectId}/lectures`),
  createLecture: (
    subjectId: number,
    body: { title: string; topic?: string; lecture_date?: string }
  ) =>
    request<Lecture>(`/api/subjects/${subjectId}/lectures`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  calendar: (year: number, month: number) =>
    request<CalendarLecture[]>(`/api/calendar?year=${year}&month=${month}`),
  getLecture: (id: number) => request<Lecture>(`/api/lectures/${id}`),
  deleteLecture: (id: number) =>
    request<void>(`/api/lectures/${id}`, { method: "DELETE" }),
  uploadAudio: async (
    lectureId: number,
    file: File,
    onProgress?: (percent: number) => void,
  ) => {
    const form = new FormData();
    form.append("file", file);
    return uploadForm<Lecture>(`/api/lectures/${lectureId}/audio`, form, onProgress);
  },
  uploadMaterial: async (lectureId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Lecture>(
      `/api/lectures/${lectureId}/materials`,
      {
        method: "POST",
        body: form,
      },
      true,
      180_000,
    );
  },
  reprocessLecture: (lectureId: number) =>
    request<Lecture>(`/api/lectures/${lectureId}/reprocess`, { method: "POST" }),
  listChat: (lectureId: number) =>
    request<ChatMessage[]>(`/api/lectures/${lectureId}/chat`),
  chat: (lectureId: number, message: string, exam_mode = false) =>
    request<ChatMessage>(
      `/api/lectures/${lectureId}/chat`,
      {
        method: "POST",
        body: JSON.stringify({ message, exam_mode }),
      },
      false,
      120_000,
    ),
  suggestions: () => request<ScheduleSuggestion[]>("/api/schedule/suggestions"),
};

export { ApiError };

export function isNetworkError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 0 || /сеть|соединен|timeout|время/i.test(err.message);
  }
  if (err instanceof DOMException && err.name === "AbortError") return true;
  if (err instanceof TypeError) return true;
  return false;
}

export function networkErrorVariant(err: unknown): "network" | "timeout" {
  if (err instanceof ApiError && /время|timeout/i.test(err.message)) return "timeout";
  if (err instanceof DOMException && err.name === "AbortError") return "timeout";
  return "network";
}
