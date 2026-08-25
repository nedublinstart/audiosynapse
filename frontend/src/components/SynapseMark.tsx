export function SynapseMark({ className = "", size = 18 }: { className?: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      <circle cx="7" cy="8" r="2.2" fill="currentColor" opacity="0.9" />
      <circle cx="17" cy="7" r="1.7" fill="currentColor" opacity="0.55" />
      <circle cx="16.5" cy="16.5" r="2.4" fill="currentColor" />
      <circle cx="7.5" cy="16" r="1.5" fill="currentColor" opacity="0.7" />
      <path
        d="M9 9.2c2.2 0.8 3.6 2.4 5.2 5.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.85"
      />
      <path
        d="M8.6 14.8c1.8-.9 4.2-4.6 6.8-6.8"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.45"
      />
    </svg>
  );
}
