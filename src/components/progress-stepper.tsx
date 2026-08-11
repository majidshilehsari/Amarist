"use client";

import { Check, ChevronLeft } from "lucide-react";

export type StepItem = { id: string; label: string; short?: string };

/** استپر پیشرفت فلش‌دار راست‌به‌چپ — هر مرحله یک تکلیف مشخص */
export default function ProgressStepper({
  steps,
  active,
  onSelect,
}: {
  steps: StepItem[];
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div dir="rtl" className="flex items-center gap-0 overflow-x-auto px-1 py-2">
      {steps.map((s, i) => {
        const done = i < active;
        const current = i === active;
        return (
          <div key={s.id} className="flex shrink-0 items-center">
            {i > 0 && (
              <ChevronLeft className="-mx-1.5 h-5 w-5 text-stone-300 dark:text-stone-600" />
            )}
            <button
              type="button"
              disabled={i > active}
              onClick={() => onSelect(i)}
              title={s.label}
              className={`flex flex-col items-center gap-1 rounded-xl px-2.5 py-1.5 transition ${
                current
                  ? "bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
                  : done
                    ? "text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-slate-800"
                    : "cursor-not-allowed text-stone-400 dark:text-stone-500"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black ${
                  current
                    ? "border-white bg-white/20"
                    : done
                      ? "border-indigo-500 bg-indigo-100 dark:border-indigo-400 dark:bg-indigo-950"
                      : "border-stone-300 bg-white dark:border-stone-600 dark:bg-slate-800"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className="whitespace-nowrap text-[11px] font-bold">{s.short ?? s.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
