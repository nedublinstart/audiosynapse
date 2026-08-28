"use client";

/** Near-invisible aurora — felt as atmosphere, not seen as animation. */
export function AmbientField() {
  return (
    <div className="ambient-field" aria-hidden>
      <span className="ambient-blob ambient-blob--1" />
      <span className="ambient-blob ambient-blob--2" />
      <span className="ambient-blob ambient-blob--3" />
      <span className="ambient-veil" />
    </div>
  );
}
