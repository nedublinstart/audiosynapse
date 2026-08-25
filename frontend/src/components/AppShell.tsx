"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, LogOut, Moon, Sun, Sparkles } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";

export function AppShell({
  children,
  title,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
}) {
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b backdrop-blur-md" style={{ borderColor: "var(--border)", background: "color-mix(in srgb, var(--bg) 82%, transparent)" }}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/app" className="flex items-center gap-2 font-medium tracking-tight">
              <span
                className="flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                <Sparkles size={16} />
              </span>
              <span style={{ fontFamily: "var(--font-display), Georgia, serif", fontSize: "1.2rem" }}>
                Synapse
              </span>
            </Link>
            <nav className="hidden items-center gap-1 text-sm sm:flex" style={{ color: "var(--fg-muted)" }}>
              <Link
                href="/app"
                className="rounded-md px-2.5 py-1.5 transition hover:opacity-100"
                style={{
                  background: pathname === "/app" ? "var(--bg-soft)" : "transparent",
                  color: pathname === "/app" ? "var(--fg)" : undefined,
                }}
              >
                Предметы
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-2">
            {actions}
            <button className="btn-ghost" onClick={toggle} aria-label="Toggle theme">
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
            </button>
            <div className="hidden text-sm sm:block" style={{ color: "var(--fg-muted)" }}>
              {user?.full_name}
            </div>
            <button
              className="btn-ghost"
              onClick={() => {
                logout();
                router.push("/login");
              }}
              aria-label="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
        {title ? (
          <div className="mx-auto flex max-w-6xl items-center gap-2 px-4 pb-3">
            <BookOpen size={16} style={{ color: "var(--fg-muted)" }} />
            <h1 className="text-sm font-medium" style={{ color: "var(--fg-muted)" }}>
              {title}
            </h1>
          </div>
        ) : null}
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
