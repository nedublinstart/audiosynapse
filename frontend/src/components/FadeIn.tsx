"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import clsx from "clsx";

type FadeVariant = "fade-up" | "fade-in" | "fade-scale" | "blur-up" | "hero";

/**
 * Rule #1: effects must be unnoticed — only guide attention.
 * All variants resolve to a short opacity fade.
 */
export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 280,
  variant = "fade-in",
  as: Tag = "div",
  when = true,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  duration?: number;
  variant?: FadeVariant;
  as?: "div" | "section" | "article" | "main" | "header" | "li" | "h1" | "h2" | "p";
  when?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  const [active, setActive] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  void variant;

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (!when) {
      setActive(false);
      return;
    }
    if (reduceMotion) {
      setActive(true);
      return;
    }

    const el = ref.current;
    if (!el) return;

    let cancelled = false;
    const start = () => {
      if (!cancelled) setActive(true);
    };

    const rect = el.getBoundingClientRect();
    const mostlyVisible = rect.top < window.innerHeight * 0.98;

    if (mostlyVisible) {
      const id = window.requestAnimationFrame(() => start());
      return () => {
        cancelled = true;
        window.cancelAnimationFrame(id);
      };
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          start();
          observer.disconnect();
        }
      },
      { threshold: 0.05, rootMargin: "0px 0px -2% 0px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [when, reduceMotion]);

  const style: CSSProperties = {
    animationDelay: active ? `${Math.min(delay, 120)}ms` : undefined,
    animationDuration: reduceMotion ? undefined : `${Math.min(duration, 320)}ms`,
    opacity: active || reduceMotion ? undefined : 0,
  };

  return (
    <Tag
      ref={ref as never}
      className={clsx("animate-fade-in", className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
