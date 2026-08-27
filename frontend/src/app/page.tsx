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

  if (loading) {
    return (
      <div className="relative min-h-dvh overflow-hidden">
        <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col justify-center safe-px py-16">
          <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
            Загрузка…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-dvh overflow-hidden">
      <div className="relative mx-auto flex min-h-dvh max-w-xl flex-col justify-center safe-px py-16 sm:py-20">
        <FadeIn>
          <div className="mb-8 flex items-center gap-3">
            <span className="brand-mark !h-11 !w-11 !rounded-[12px] !p-1.5">
              <SynapseMark size={32} priority />
            </span>
            <div>
              <div className="brand-wordmark text-3xl sm:text-4xl">Synapse</div>
              <p className="mt-0.5 text-sm" style={{ color: "var(--fg-muted)" }}>
                Конспекты без шума
              </p>
            </div>
          </div>
        </FadeIn>

        <FadeIn delay={40}>
          <p
            className="mb-8 max-w-md text-[1.05rem] leading-relaxed"
            style={{ color: "var(--fg-muted)" }}
          >
            Аудиолекции → ясный конспект. Без расписания и лишнего.
          </p>
        </FadeIn>

        <FadeIn delay={80}>
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
      </div>
    </div>
  );
}
