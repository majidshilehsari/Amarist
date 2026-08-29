"use client";

import { Check, ChevronLeft } from "lucide-react";

export type StepStatus = "done" | "current" | "pending" | "analysis";

export type StepItem = { id: string; label: string; short?: string };

/** استپر پیشرفت فلش‌دار راست‌به‌چپ — فقط دایره شماره‌دار با نام زیرش؛ فلش‌ها بدون متن */
export default function ProgressStepper({
  steps,
  statuses,
  onSelect,
}: {
  steps: StepItem[];
  statuses: StepStatus[];
  onSelect: (index: number) => void;
}) {
  return (
    <div dir="rtl" className="flex items-center gap-0 overflow-x-auto px-1 py-1.5">
      {steps.map((s, i) => {
        const status = statuses[i] ?? "pending";
        const clickable = status !== "pending";
        const circleCls =
          status === "done"
            ? "border-emerald-500 bg-emerald-500 text-white"
            : status === "current"
              ? "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-600/30"
              : status === "analysis"
                ? "border-red-400 bg-red-100 text-red-600 dark:bg-red-950 dark:text-red-300"
                : "border-amber-400 bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300";
        const labelCls =
          status === "done"
            ? "text-emerald-700 dark:text-emerald-300"
            : status === "current"
              ? "text-indigo-700 dark:text-indigo-300"
              : status === "analysis"
                ? "text-red-600 dark:text-red-300"
                : "text-amber-700 dark:text-amber-300";
        return (
          <div key={s.id} className="flex shrink-0 items-center">
            {i > 0 && <ChevronLeft className="-mx-1 h-5 w-5 shrink-0 text-stone-300 dark:text-stone-600" />}
            <button
              type="button"
              disabled={!clickable}
              onClick={() => onSelect(i)}
              title={s.label}
              className={`flex flex-col items-center gap-1 rounded-xl px-1.5 py-1 transition ${
                status === "current"
                  ? "bg-indigo-50 dark:bg-indigo-950/40"
                  : clickable
                    ? "hover:bg-stone-100 dark:hover:bg-slate-800"
                    : "cursor-not-allowed"
              }`}
            >
              <span
                className={`flex h-9 w-9 items-center justify-center rounded-full border-2 text-sm font-black ${circleCls}`}
              >
                {status === "done" ? <Check className="h-4 w-4" /> : i + 1}
              </span>
              <span className={`whitespace-nowrap text-[11px] font-bold ${labelCls}`}>{s.short ?? s.label}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}
