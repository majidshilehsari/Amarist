"use client";

import { Check, ChevronLeft } from "lucide-react";

export type StepStatus = "done" | "current" | "pending" | "analysis";

export type StepItem = { id: string; label: string; short?: string };

/** استپر پیشرفت فلش‌دار راست‌به‌چپ — فلش‌ها نام مرحله بعد را دارند و شمارنده مرحله بین فلش‌هاست */
export default function ProgressStepper({
  steps,
  statuses,
  onSelect,
}: {
  steps: StepItem[];
  statuses: StepStatus[];
  onSelect: (index: number) => void;
}) {
  const current = statuses.indexOf("current");
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
            {i > 0 && (
              <div className="flex flex-col items-center px-0.5">
                <ChevronLeft className="-mb-0.5 h-4 w-4 text-stone-300 dark:text-stone-600" />
                <span className="mb-1 -mt-0.5 whitespace-nowrap text-[9px] font-bold text-stone-400 dark:text-stone-500">
                  {steps[i].short ?? steps[i].label}
                </span>
              </div>
            )}
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

      {/* شمارنده مرحله بین فلش‌ها */}
      <div className="ms-2 flex shrink-0 items-center rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[11px] font-black text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300">
        مرحله {current + 1} از {steps.length}
      </div>
    </div>
  );
}
