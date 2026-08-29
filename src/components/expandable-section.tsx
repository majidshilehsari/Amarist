"use client";

import { useState, type ReactNode } from "react";
import { Maximize2, X } from "lucide-react";

/** هر بخش را با دکمه «باز کردن در پنجره» wrap می‌کند؛ مودال تمام‌صفحه برای تنظیم راحت جداول عریض */
export default function ExpandableSection({
  id,
  title,
  desc,
  tone,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  tone: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <section id={id} className={`mt-4 scroll-mt-20 rounded-2xl p-5 shadow-sm sm:p-6 ${tone}`}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">{title}</h2>
            {desc && <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">{desc}</p>}
          </div>
          <button
            type="button"
            title="باز کردن کامل این بخش در پنجره"
            onClick={() => setOpen(true)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-[12px] font-extrabold text-stone-600 transition hover:border-indigo-300 hover:text-indigo-600 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-300"
          >
            <Maximize2 className="h-3.5 w-3.5" />
            باز کردن کامل
          </button>
        </div>
        <div className="mt-3">{children}</div>
      </section>

      {open && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-6"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[94vh] w-full max-w-6xl overflow-auto rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl dark:border-stone-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 mb-3 flex items-center justify-between gap-2 border-b border-stone-200 bg-white pb-3 dark:border-stone-700 dark:bg-slate-900">
              <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">{title}</h3>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-[12px] font-extrabold text-stone-600 transition hover:bg-stone-100 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-300"
              >
                <X className="h-4 w-4" />
                بستن
              </button>
            </div>
            <div className="pb-4">{children}</div>
          </div>
        </div>
      )}
    </>
  );
}
