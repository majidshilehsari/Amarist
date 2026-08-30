"use client";

import { Sigma } from "lucide-react";
import AboutApp from "@/components/about-app";
import ThemeToggle from "@/components/theme-toggle";

export default function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-stone-200/70 bg-[#faf9f6]/85 backdrop-blur-md dark:border-slate-700/70 dark:bg-slate-900/85">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
        <a href="#top" className="flex shrink-0 items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-indigo-600/25">
            <Sigma className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="text-lg font-extrabold tracking-tight text-stone-900 dark:text-stone-100">
            آماریست
          </span>
          <span className="mt-1 hidden rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-500 dark:bg-slate-800 dark:text-stone-400 sm:inline-block">
            Amarist
          </span>
        </a>

        <div className="flex shrink-0 items-center gap-2">
          <AboutApp />
          <ThemeToggle />
          <a
            href="#modes"
            className="hidden rounded-full bg-gradient-to-l from-indigo-600 to-violet-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-indigo-600/25 transition hover:brightness-110 sm:inline-block"
          >
            شروع کنید
          </a>
        </div>
      </nav>
    </header>
  );
}
