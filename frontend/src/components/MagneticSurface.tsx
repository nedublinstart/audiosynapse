"use client";

import {
  useCallback,
  useRef,
  type CSSProperties,
  type ReactNode,
  type MouseEvent,
} from "react";
import clsx from "clsx";

/**
 * Soft hover wrapper — intentionally invisible.
 * Depth without the user noticing “effects”.
 */
export function MagneticSurface({
  children,
  className,
  style,
  href,
  as: Tag = "div",
  strength = 0,
  tilt = 0,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  href?: string;
  as?: "div" | "a" | "button";
  strength?: number;
  tilt?: number;
}) {
  const ref = useRef<HTMLElement>(null);
  const frame = useRef(0);

  const onMove = useCallback(
    (e: MouseEvent) => {
      if (!strength && !tilt) return;
      const el = ref.current;
      if (!el) return;
      const reduce =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (reduce) return;

      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.transform = `translate3d(${x * strength}px, ${y * strength - 1}px, 0) rotateX(${-y * tilt}deg) rotateY(${x * tilt}deg)`;
      });
    },
    [strength, tilt],
  );

  const onLeave = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(frame.current);
    el.style.transform = "";
  }, []);

  const shared = {
    ref: ref as never,
    className: clsx("magnetic-surface", className),
    style,
    onMouseMove: onMove,
    onMouseLeave: onLeave,
  };

  if (Tag === "a" || href) {
    return (
      <a {...shared} href={href}>
        {children}
      </a>
    );
  }

  if (Tag === "button") {
    return (
      <button type="button" {...shared}>
        {children}
      </button>
    );
  }

  return <div {...shared}>{children}</div>;
}
