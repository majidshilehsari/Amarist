"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

export type SectionItem = { id: string; label: string };

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
      className="fixed right-4 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-center gap-1 rounded-2xl border border-stone-200 bg-white/95 p-2 shadow-xl shadow-stone-900/10 backdrop-blur lg:flex dark:border-stone-700 dark:bg-stone-900/95"
    >
      <button
        type="button"
        title="بخش قبلی"
        disabled={!prev}
        onClick={() => prev && go(prev.id)}
        className="flex h-7 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 disabled:opacity-30 dark:text-stone-400 dark:hover:bg-stone-800"
      >
        <ChevronUp className="h-4 w-4" />
      </button>

      <div className="my-1 flex flex-col items-center gap-1">
        {sections.map((s, i) => (
          <div key={s.id} className="flex flex-col items-center">
            <button
              type="button"
              title={`${i + 1}. ${s.label}`}
              onClick={() => go(s.id)}
              className={`group relative flex h-6 w-9 items-center justify-center rounded-lg transition ${
                active === s.id ? "bg-indigo-600 text-white" : "text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
              }`}
            >
              <span className="text-[10px] font-black">{i + 1}</span>
              <span className="pointer-events-none absolute right-full me-2 whitespace-nowrap rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-bold text-stone-700 opacity-0 shadow transition group-hover:opacity-100 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200">
                {s.label}
              </span>
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        title="بخش بعدی"
        disabled={!next}
        onClick={() => next && go(next.id)}
        className="flex h-7 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100 disabled:opacity-30 dark:text-stone-400 dark:hover:bg-stone-800"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </nav>
  );
}
