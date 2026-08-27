"use client";

import Image from "next/image";

type Props = {
  className?: string;
  size?: number;
  /** Larger wordmark-adjacent logo without chrome frame */
  plain?: boolean;
  priority?: boolean;
};

/** Official Synapse neural-S mark (neon cyan). */
export function SynapseMark({ className = "", size = 18, plain = false, priority = false }: Props) {
  return (
    <Image
      src="/synapse-logo.png"
      alt=""
      width={size}
      height={size}
      className={className}
      style={{
        width: size,
        height: size,
        objectFit: "contain",
        display: "block",
        filter: plain ? undefined : undefined,
      }}
      priority={priority}
      aria-hidden
    />
  );
}
