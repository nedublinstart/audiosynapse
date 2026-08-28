"use client";

export function SkeletonList({
  rows = 3,
  tall,
}: {
  rows?: number;
  tall?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`panel p-4 ${tall ? "h-24" : "h-20"}`}>
          <div className="skeleton mb-2 h-4 w-1/3" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonSubjectGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="panel h-[9.5rem] p-4 sm:p-5">
          <div className="skeleton mb-3 h-4 w-1/2" />
          <div className="skeleton mb-2 h-3 w-full" />
          <div className="skeleton h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonPills() {
  return (
    <div className="flex gap-2">
      <div className="skeleton h-7 w-24 rounded-full" />
      <div className="skeleton h-7 w-28 rounded-full" />
    </div>
  );
}

export function SkeletonLecturePage() {
  return (
    <div className="space-y-4 animate-fade-in">
      <div className="skeleton h-8 w-48" />
      <div className="skeleton h-28 w-full rounded-[12px]" />
      <div className="skeleton h-10 w-full max-w-xs" />
      <div className="panel p-6">
        <div className="skeleton mb-3 h-5 w-1/3" />
        <div className="skeleton mb-2 h-3 w-full" />
        <div className="skeleton mb-2 h-3 w-5/6" />
        <div className="skeleton h-3 w-2/3" />
      </div>
      <p className="text-sm" style={{ color: "var(--fg-muted)" }}>
        Загрузка лекции…
      </p>
    </div>
  );
}
