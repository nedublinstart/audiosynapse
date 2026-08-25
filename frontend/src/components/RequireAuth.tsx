"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (loading) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 safe-px">
        <div className="skeleton h-10 w-10 rounded-[10px]" />
        <p className="animate-fade-in text-sm" style={{ color: "var(--fg-muted)" }}>
          Загрузка…
        </p>
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
