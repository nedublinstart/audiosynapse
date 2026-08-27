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
      <div className="pointer-events-none absolute inset-0">
        <div className="ambient-orb ambient-orb--a !opacity-55" />
        <div className="ambient-orb ambient-orb--b !opacity-40" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 70% 55% at 50% 35%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)",
          }}
        />
      </div>

      <div className="relative mx-auto flex min-h-dvh max-w-3xl flex-col items-center justify-center safe-px py-16 text-center sm:py-20">
        <FadeIn variant="hero" duration={1200}>
          <div className="brand-mark brand-mark--hero mx-auto mb-8 animate-float">
            <SynapseMark size={148} plain priority />
          </div>
        </FadeIn>

        <FadeIn delay={120} variant="blur-up" duration={1100}>
          <h1 className="brand-wordmark text-[clamp(2.8rem,8vw,4.75rem)] leading-none">Synapse</h1>
          <p className="mt-3 text-base sm:text-lg" style={{ color: "var(--fg-muted)" }}>
            Конспекты без шума
          </p>
        </FadeIn>

        <FadeIn delay={240} variant="fade-up" duration={900}>
          <p
            className="mx-auto mt-7 max-w-md text-[1.05rem] leading-relaxed sm:text-[1.15rem]"
            style={{ color: "var(--fg-muted)" }}
          >
            Аудио лекции превращаются в ясный конспект. Без расписания, без лишнего шума.
          </p>
        </FadeIn>

        <FadeIn delay={360} variant="fade-up" duration={900}>
          <div className="mt-10 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Link href="/login" className="btn-primary sm:w-auto">
              Войти
              <ArrowUpRight size={16} />
            </Link>
            <Link href="/register" className="btn-outline sm:w-auto">
              Создать аккаунт
            </Link>
          </div>
        </FadeIn>
      </div>
    </div>
  );
}
