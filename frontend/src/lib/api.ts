const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

async function request<T>(
  path: string,
  options: RequestInit = {},
  isForm = false
): Promise<T> {
  const headers = new Headers(options.headers || {});
  if (!isForm) headers.set("Content-Type", "application/json");
  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const data = await res.json();
      detail = data.detail || JSON.stringify(data);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  health: () => request<{ status: string; gemini_configured: boolean }>("/api/health"),
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
  getSubject: (id: number) => request<Subject>(`/api/subjects/${id}`),
  deleteSubject: (id: number) =>
    request<void>(`/api/subjects/${id}`, { method: "DELETE" }),
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
  getLecture: (id: number) => request<Lecture>(`/api/lectures/${id}`),
  deleteLecture: (id: number) =>
    request<void>(`/api/lectures/${id}`, { method: "DELETE" }),
  uploadAudio: async (lectureId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Lecture>(`/api/lectures/${lectureId}/audio`, {
      method: "POST",
      body: form,
    }, true);
  },
  uploadMaterial: async (lectureId: number, file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<Lecture>(`/api/lectures/${lectureId}/materials`, {
      method: "POST",
      body: form,
    }, true);
  },
  listChat: (lectureId: number) =>
    request<ChatMessage[]>(`/api/lectures/${lectureId}/chat`),
  chat: (lectureId: number, message: string, exam_mode = false) =>
    request<ChatMessage>(`/api/lectures/${lectureId}/chat`, {
      method: "POST",
      body: JSON.stringify({ message, exam_mode }),
    }),
  suggestions: () => request<ScheduleSuggestion[]>("/api/schedule/suggestions"),
};

export { ApiError };
