import Link from "next/link";
import { SynapseMark } from "@/components/SynapseMark";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center safe-px py-16 text-center">
      <span className="brand-mark mb-6 !h-12 !w-12 !rounded-[12px] !p-1.5">
        <SynapseMark size={34} />
      </span>
      <h1 className="page-title mb-2 text-2xl">Страница не найдена</h1>
      <p className="mb-8 text-sm leading-relaxed" style={{ color: "var(--fg-muted)" }}>
        Такого адреса нет. Вернитесь в учебный процесс или на главную.
      </p>
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
