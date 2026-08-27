"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { useAuth } from "@/lib/auth";
import { SynapseMark } from "@/components/SynapseMark";
import { FadeIn } from "@/components/FadeIn";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register(fullName, email, password);
      router.push("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка регистрации");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative mx-auto flex min-h-dvh max-w-md flex-col justify-center safe-px py-10">
      <FadeIn>
        <Link href="/" className="mb-8 inline-flex items-center gap-2.5">
          <span className="brand-mark">
            <SynapseMark size={22} priority />
          </span>
          <span className="brand-wordmark text-xl">Synapse</span>
        </Link>
      </FadeIn>

      <FadeIn delay={40}>
        <div className="panel p-5 sm:p-7">
          <h1 className="page-title mb-1 text-2xl sm:text-[1.75rem]">Регистрация</h1>
          <p className="mb-6 text-sm" style={{ color: "var(--fg-muted)" }}>
            Предмет → лекция → конспект. Без расписания.
          </p>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="label">Имя</label>
              <input
                className="input"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </div>
            <div>
              <label className="label">Эл. почта</label>
              <input
                className="input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                inputMode="email"
              />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input
                className="input"
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            {error ? (
              <p className="animate-fade-in text-sm" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            ) : null}
            <button className="btn-primary w-full" disabled={busy}>
              {busy ? "Создаём…" : "Зарегистрироваться"}
            </button>
          </form>
          <p className="mt-5 text-center text-sm" style={{ color: "var(--fg-muted)" }}>
            Уже есть аккаунт?{" "}
            <Link href="/login" className="underline-offset-4 hover:underline" style={{ color: "var(--accent)" }}>
              Войти
            </Link>
          </p>
        </div>
      </FadeIn>
    </div>
  );
}
