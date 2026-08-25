"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [loading, user, router]);

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <div className="mb-8 flex items-center gap-3">
        <span
          className="flex h-11 w-11 items-center justify-center rounded-xl"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
        >
          <Sparkles size={22} />
        </span>
        <div>
          <div
            className="text-3xl font-semibold tracking-tight"
            style={{ fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Synapse
          </div>
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Интеллектуальный помощник для конспектирования
          </p>
        </div>
      </div>

      <p className="mb-8 max-w-xl text-lg leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        Аудиолекции и разрозненные материалы превращаются в конспекты по методу Корнелла,
        технике Фейнмана и таксономии Блума — с контекстным ИИ-чатом по вашей лекции.
      </p>

      <div className="flex flex-wrap gap-3">
        <Link href="/login" className="btn-primary">
          Войти
        </Link>
        <Link href="/register" className="btn-ghost panel !px-4 !py-2">
          Создать аккаунт
        </Link>
      </div>
    </div>
  );
}
