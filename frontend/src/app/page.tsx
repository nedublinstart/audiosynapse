"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowUpRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SynapseMark } from "@/components/SynapseMark";
import { FadeIn } from "@/components/FadeIn";

export default function HomePage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) router.replace("/app");
  }, [loading, user, router]);

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[55vh] opacity-80"
        style={{
          background:
            "radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%)",
        }}
      />

      <div className="relative mx-auto flex min-h-dvh max-w-3xl flex-col justify-center safe-px py-16 sm:py-20">
        <FadeIn>
          <div className="mb-10 flex items-center gap-3">
            <span className="brand-mark !h-12 !w-12 !rounded-[14px]">
              <SynapseMark size={22} />
            </span>
            <div>
              <div className="page-title text-4xl sm:text-5xl">Synapse</div>
              <p className="mt-1 text-sm sm:text-base" style={{ color: "var(--fg-muted)" }}>
                Конспекты без шума
              </p>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={90}>
          <p
            className="mb-10 max-w-xl text-[1.15rem] leading-relaxed sm:text-[1.3rem]"
            style={{ color: "var(--fg-muted)", fontFamily: "var(--font-display), Georgia, serif" }}
          >
            Лекции и слайды складываются в ясный конспект — по Корнеллу, Фейнману и Блуму.
            Спокойный интерфейс для уставшей головы.
          </p>
        </FadeIn>

        <FadeIn delay={170}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link href="/login" className="btn-primary sm:w-auto">
              Войти
              <ArrowUpRight size={16} />
            </Link>
            <Link href="/register" className="btn-outline sm:w-auto">
              Создать аккаунт
            </Link>
          </div>
        </FadeIn>

        <FadeIn delay={260}>
          <div
            className="mt-14 grid gap-4 border-t pt-6 text-sm sm:grid-cols-3"
            style={{ borderColor: "var(--border)", color: "var(--fg-muted)" }}
          >
            <div>
              <div className="mb-1 font-medium" style={{ color: "var(--fg)" }}>
                Аудио → конспект
              </div>
              Структура вместо потока речи
            </div>
            <div>
              <div className="mb-1 font-medium" style={{ color: "var(--fg)" }}>
                Слайды в контексте
              </div>
              Обогащение без переписывания
            </div>
            <div>
              <div className="mb-1 font-medium" style={{ color: "var(--fg)" }}>
                Чат по лекции
              </div>
              Только ваш материал, без флуда
            </div>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
