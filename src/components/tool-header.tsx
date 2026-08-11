import Link from "next/link";
import { Sigma } from "lucide-react";

export default function ToolHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200/80 bg-[#faf9f6]/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
            <Sigma className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="font-extrabold tracking-tight text-stone-900">آماریست</span>
        </Link>
        <span className="text-stone-300">|</span>
        <span className="truncate text-sm font-bold text-stone-700">{title}</span>
        {subtitle && (
          <span className="ms-auto hidden shrink-0 text-xs text-stone-400 sm:block">{subtitle}</span>
        )}
      </div>
    </header>
  );
}
