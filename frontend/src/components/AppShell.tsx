"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Moon, Sun } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme } from "@/lib/theme";
import { SynapseMark } from "@/components/SynapseMark";

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
    <div className="min-h-dvh pb-[env(safe-area-inset-bottom)]">
      <header
        className="sticky top-0 z-30 border-b animate-fade-in"
        style={{
          animationDuration: "0.28s",
          borderColor: "color-mix(in srgb, var(--border) 80%, transparent)",
          background: "color-mix(in srgb, var(--bg) 68%, transparent)",
          backdropFilter: "blur(18px) saturate(1.25)",
          WebkitBackdropFilter: "blur(18px) saturate(1.25)",
          paddingTop: "env(safe-area-inset-top)",
          transition: "background 0.25s var(--ease-expo), border-color 0.25s var(--ease-expo)",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 safe-px py-3">
          <div className="flex min-w-0 items-center gap-4 sm:gap-6">
            <Link
              href="/app"
              className="group flex shrink-0 items-center gap-2.5 tracking-tight"
            >
              <span className="brand-mark transition-transform duration-300 group-hover:scale-105">
                <SynapseMark size={20} priority />
              </span>
              <span className="brand-wordmark text-[1.15rem] sm:text-[1.2rem]">Synapse</span>
            </Link>
            <nav className="hidden items-center gap-1 text-sm sm:flex" style={{ color: "var(--fg-muted)" }}>
              <Link
                href="/app"
                className="nav-link rounded-lg px-2.5 py-1.5"
                data-active={pathname === "/app" ? "true" : "false"}
                style={{
                  background: pathname === "/app" ? "var(--bg-soft)" : "transparent",
                  color: pathname === "/app" ? "var(--fg)" : undefined,
                }}
              >
                Предметы
              </Link>
            </nav>
          </div>

          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden sm:flex">{actions}</div>
            <button className="btn-ghost !min-h-10 !px-2.5" onClick={toggle} aria-label="Тема">
              {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
            </button>
            <div
              className="hidden max-w-[9rem] truncate text-sm md:block"
              style={{ color: "var(--fg-muted)" }}
              title={user?.full_name}
            >
              {user?.full_name}
            </div>
            <button
              className="btn-ghost !min-h-10 !px-2.5"
              onClick={() => {
                logout();
                router.push("/login");
              }}
              aria-label="Выйти"
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>

        {(title || actions) && (
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 safe-px pb-3 sm:hidden">
            {title ? (
              <p className="min-w-0 truncate text-sm animate-fade-in" style={{ color: "var(--fg-muted)" }}>
                {title}
              </p>
            ) : (
              <span />
            )}
            <div className="flex shrink-0 items-center gap-1">{actions}</div>
          </div>
        )}

        {title ? (
          <div className="mx-auto hidden max-w-5xl items-center gap-2 safe-px pb-3 sm:flex">
            <p className="truncate text-sm animate-fade-in" style={{ color: "var(--fg-muted)" }}>
              {title}
            </p>
          </div>
        ) : null}
      </header>

      <main className="mx-auto max-w-5xl safe-px py-5 sm:py-8">{children}</main>
    </div>
  );
}
