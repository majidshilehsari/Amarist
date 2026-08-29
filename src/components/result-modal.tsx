"use client";

import { CheckCircle2, XCircle } from "lucide-react";

/** مودال نتیجه تحلیل: موفقیت/شکست + چند خط گزارش کوچک */
export default function ResultModal({
  ok,
  lines,
  onClose,
}: {
  ok: boolean;
  lines: string[];
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {ok ? (
            <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="h-8 w-8 shrink-0 text-red-600 dark:text-red-400" />
          )}
          <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">
            {ok ? "با موفقیت انجام شد" : "ناموفق بود"}
          </h3>
        </div>
        <div className="mt-4 max-h-72 space-y-1.5 overflow-auto rounded-xl bg-stone-50 p-4 dark:bg-slate-900">
          {lines.map((l, i) => (
            <p key={i} className="text-[13px] leading-6 text-stone-700 dark:text-stone-300">
              {l}
            </p>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500"
          >
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}
