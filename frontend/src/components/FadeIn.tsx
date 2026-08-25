"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import clsx from "clsx";

export function FadeIn({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  as?: "div" | "section" | "article" | "main" | "header";
}) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      setReady(true);
      return;
    }
    const id = window.setTimeout(() => setReady(true), 16);
    return () => window.clearTimeout(id);
  }, []);

  const style: CSSProperties = {
    animationDelay: `${delay}ms`,
    opacity: ready ? undefined : 0,
  };

  return (
    <Tag className={clsx("animate-fade-up", className)} style={style}>
      {children}
    </Tag>
  );
}
