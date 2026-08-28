"use client";

import clsx from "clsx";
import type { ReactNode } from "react";

/** Short fade + lift when text/content appears or changes. */
export function TextReveal({
  children,
  contentKey,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  /** Change to replay the entrance animation. */
  contentKey?: string | number;
  className?: string;
  as?: "div" | "p" | "span" | "article";
}) {
  return (
    <Tag key={contentKey} className={clsx("animate-text-in", className)}>
      {children}
    </Tag>
  );
}
