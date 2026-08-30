"use client";

import { useState } from "react";
import { Info, X } from "lucide-react";
import { APP_VERSION } from "@/data/app-version";

/** دکمهٔ «دربارهٔ برنامه» — نسخه و زمانِ انتشار (شمسی، تهران) را نشان می‌دهد */
export default function AboutApp({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="دربارهٔ برنامه"
        aria-label="دربارهٔ برنامه"
        className={`inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-600 shadow-sm transition hover:border-indigo-300 hover:text-indigo-600 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300 dark:hover:text-indigo-400 ${
          compact ? "" : ""
        }`}
      >
        <Info className="h-3.5 w-3.5" />
        {!compact && "دربارهٔ برنامه"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[88vh] w-full max-w-lg overflow-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">دربارهٔ برنامه</h3>
                <p className="mt-0.5 text-[12px] text-stone-500 dark:text-stone-400">آماریست — تحلیل آماری و تولید دادهٔ تمرینی</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-slate-700 dark:hover:text-stone-200"
                aria-label="بستن"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-slate-900">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">نسخه</p>
                <p className="mt-0.5 text-[13px] font-extrabold text-stone-800 dark:text-stone-100">
                  {APP_VERSION.version}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-slate-900">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">زمانِ انتشار (تهران)</p>
                <p dir="ltr" className="mt-0.5 text-[13px] font-extrabold text-stone-800 dark:text-stone-100">
                  {APP_VERSION.releasedAt}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-slate-900">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">شاخه</p>
                <p dir="ltr" className="mt-0.5 text-[12px] font-extrabold text-stone-800 dark:text-stone-100">
                  {APP_VERSION.branch}
                </p>
              </div>
              <div className="rounded-xl bg-stone-50 p-3 dark:bg-slate-900">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">شمارهٔ کامیت</p>
                <p dir="ltr" className="mt-0.5 text-[12px] font-extrabold text-stone-800 dark:text-stone-100">
                  {APP_VERSION.commit}
                </p>
              </div>
            </div>

            <div className="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3 dark:border-indigo-900 dark:bg-indigo-950/40">
              <p className="text-[12px] font-extrabold text-indigo-800 dark:text-indigo-300">این نسخه</p>
              <p className="mt-1 text-[12px] leading-6 text-indigo-700 dark:text-indigo-400">{APP_VERSION.summary}</p>
            </div>

            <ul className="mt-3 space-y-1.5 text-[12px] leading-6 text-stone-600 dark:text-stone-300">
              {APP_VERSION.changes.map((change, index) => (
                <li key={index}>• {change}</li>
              ))}
            </ul>

            <p className="mt-4 text-[11px] leading-5 text-stone-400 dark:text-stone-500">
              داده‌ها فقط در مرورگر شما ذخیره می‌شوند (localStorage) و هیچ دیتابیس یا سروری در کار نیست.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
