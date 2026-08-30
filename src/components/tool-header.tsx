"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Sigma } from "lucide-react";
import AboutApp from "@/components/about-app";
import ThemeToggle from "@/components/theme-toggle";

export default function ToolHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#faf9f6]/90 backdrop-blur-md dark:border-stone-700 dark:bg-slate-900/90">
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-3 px-4">
        <Link href="/" className="flex shrink-0 items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-sm">
            <Sigma className="h-4 w-4" strokeWidth={2.5} />
          </span>
          <span className="font-extrabold tracking-tight text-stone-900 dark:text-stone-100">آماریست</span>
        </Link>
        <span className="text-stone-300 dark:text-stone-600">|</span>
        <span className="truncate text-sm font-bold text-stone-700 dark:text-stone-200">{title}</span>
        {subtitle && (
          <span className="hidden shrink-0 text-xs text-stone-400 dark:text-stone-500 lg:block">{subtitle}</span>
        )}

        {actions && <div className="ms-auto flex shrink-0 items-center gap-2">{actions}</div>}

        {/* دربارهٔ برنامه */}
        <div className={`flex shrink-0 items-center ${actions ? "" : "ms-auto"}`}>
          <AboutApp />
        </div>

        {/* سوییچ لایت / دارک */}
        <ThemeToggle />
      </div>
    </header>
  );
}
