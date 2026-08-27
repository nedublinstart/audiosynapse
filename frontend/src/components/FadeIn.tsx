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

const VARIANT_CLASS: Record<FadeVariant, string> = {
  "fade-up": "animate-fade-up",
  "fade-in": "animate-fade-in",
  "fade-scale": "animate-fade-scale",
  "blur-up": "animate-blur-up",
  hero: "animate-hero-reveal",
};

export function FadeIn({
  children,
  className,
  delay = 0,
  duration = 900,
  variant = "fade-up",
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
    const mostlyVisible = rect.top < window.innerHeight * 0.94;

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
      { threshold: 0.08, rootMargin: "0px 0px -4% 0px" },
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [when, reduceMotion]);

  const style: CSSProperties = {
    animationDelay: active ? `${delay}ms` : undefined,
    animationDuration: reduceMotion ? undefined : `${duration}ms`,
    opacity: active || reduceMotion ? undefined : 0,
  };

  return (
    <Tag
      ref={ref as never}
      className={clsx(VARIANT_CLASS[variant], className)}
      style={style}
    >
      {children}
    </Tag>
  );
}
