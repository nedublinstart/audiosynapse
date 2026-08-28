"use client";

import { SynapseMark } from "@/components/SynapseMark";

export function PageLoader({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 safe-px">
      <span className="brand-mark loader-pulse !h-11 !w-11 !rounded-[12px] !p-1.5">
        <SynapseMark size={30} />
      </span>
      <p className="animate-text-in text-sm" style={{ color: "var(--fg-muted)" }}>
        {label}
      </p>
    </div>
  );
}
