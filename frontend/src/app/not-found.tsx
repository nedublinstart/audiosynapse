import Link from "next/link";
import { StatePlaceholder } from "@/components/StatePlaceholder";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-2 safe-px py-16">
      <StatePlaceholder variant="not-found" />
      <div className="flex flex-col gap-2 sm:flex-row">
        <Link href="/app" className="btn-primary sm:!w-auto">
          Учебный процесс
        </Link>
        <Link href="/" className="btn-outline sm:!w-auto">
          На главную
        </Link>
      </div>
    </div>
  );
}
