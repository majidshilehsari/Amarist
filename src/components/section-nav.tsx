"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type SectionItem = { id: string; label: string; short?: string };

/** ناوبری شناور سمت راست به سبک تلگرام: دکمه‌های دایره‌ای با عنوان داخلشان */
export default function SectionNav({ sections }: { sections: SectionItem[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");

  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-35% 0px -55% 0px" }
    );
    sections.forEach((s) => {
      const el = document.getElementById(s.id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [sections]);

  const go = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const idx = sections.findIndex((s) => s.id === active);
  const prev = idx > 0 ? sections[idx - 1] : null;
  const next = idx >= 0 && idx < sections.length - 1 ? sections[idx + 1] : null;

  return (
    <nav
      aria-label="ناوبری بخش‌ها"
      className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1.5 rounded-3xl border border-stone-200 bg-white/95 p-2 shadow-xl shadow-stone-900/10 backdrop-blur lg:flex dark:border-stone-700 dark:bg-slate-900/95"
    >
      <button
        type="button"
        title="بخش قبلی"
        disabled={!prev}
        onClick={() => prev && go(prev.id)}
        className="flex h-8 w-12 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 disabled:opacity-30 dark:text-stone-400 dark:hover:bg-slate-800"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div className="flex flex-col items-center gap-1.5">
        {sections.map((s, i) => {
          const isActive = active === s.id;
          return (
            <button
              key={s.id}
              type="button"
              title={`${i + 1}. ${s.label}`}
              onClick={() => go(s.id)}
              className={`flex h-12 w-12 flex-col items-center justify-center rounded-full border-2 text-[10px] font-black leading-tight transition ${
                isActive
                  ? "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : "border-stone-200 bg-white text-stone-500 hover:border-indigo-300 hover:text-indigo-600 dark:border-slate-700 dark:bg-slate-800 dark:text-stone-400 dark:hover:border-indigo-500"
              }`}
            >
              <span className="text-[8px] opacity-80">{i + 1}</span>
              <span>{s.short ?? s.label}</span>
            </button>
          );
        })}
      </div>

      <button
        type="button"
        title="بخش بعدی"
        disabled={!next}
        onClick={() => next && go(next.id)}
        className="flex h-8 w-12 items-center justify-center rounded-full text-stone-500 transition hover:bg-stone-100 disabled:opacity-30 dark:text-stone-400 dark:hover:bg-slate-800"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </nav>
  );
}
