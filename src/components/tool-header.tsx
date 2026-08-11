"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Moon, Sigma, Sun } from "lucide-react";

export default function ToolHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return localStorage.getItem("amarist-theme") === "dark";
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("amarist-theme", dark ? "dark" : "light");
  }, [dark]);

  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/80 bg-[#faf9f6]/90 backdrop-blur-md dark:border-stone-700 dark:bg-stone-900/90">
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
          <span className="hidden shrink-0 text-xs text-stone-400 dark:text-stone-500 sm:block">{subtitle}</span>
        )}

        {/* سوییچ لایت / دارک */}
        <div
          className="ms-auto flex shrink-0 items-center gap-0.5 rounded-full border border-stone-200 bg-white p-0.5 shadow-sm dark:border-stone-700 dark:bg-stone-800"
          role="radiogroup"
          aria-label="حالت نمایش"
        >
          <button
            type="button"
            role="radio"
            aria-checked={!dark}
            onClick={() => setDark(false)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
              !dark ? "bg-indigo-600 text-white shadow" : "text-stone-500 hover:text-stone-700 dark:text-stone-400"
            }`}
          >
            <Sun className="h-3.5 w-3.5" />
            لایت
          </button>
          <button
            type="button"
            role="radio"
            aria-checked={dark}
            onClick={() => setDark(true)}
            className={`flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold transition ${
              dark ? "bg-indigo-600 text-white shadow" : "text-stone-500 hover:text-stone-700 dark:text-stone-400"
            }`}
          >
            <Moon className="h-3.5 w-3.5" />
            دارک
          </button>
        </div>
      </div>
    </header>
  );
}
