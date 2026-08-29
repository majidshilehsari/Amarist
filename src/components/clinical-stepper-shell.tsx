"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import ProgressStepper, { type StepStatus, type StepItem } from "./progress-stepper";

/** قالب مشترک ابزارهای بالینی: استپر شناور زیر هدر + دکمه‌های قبلی/بعدی + محتوای مرحله. */
export default function ClinicalStepperShell({
  steps,
  statuses,
  activeStep,
  onSelect,
  onPrev,
  onNext,
  children,
}: {
  steps: StepItem[];
  statuses: StepStatus[];
  activeStep: number;
  onSelect: (index: number) => void;
  onPrev: () => void;
  onNext: () => void;
  children: ReactNode;
}) {
  const currentStep = Math.min(activeStep, steps.length - 1);
  return (
    <>
      <div className="sticky top-14 z-40 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur dark:border-stone-700 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-1.5">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <ProgressStepper steps={steps} statuses={statuses} onSelect={onSelect} />
            <div className="mt-1 flex flex-wrap items-center gap-3 text-[10px] font-bold text-stone-400 dark:text-stone-500">
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> کامل شده
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> در انتظار
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> نیازمند تحلیل
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-full bg-indigo-600" /> مرحله فعلی
              </span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              disabled={currentStep === 0}
              onClick={onPrev}
              title="مرحله قبلی"
              className="flex h-9 items-center gap-1 rounded-xl border border-stone-300 bg-white px-3 text-[11px] font-extrabold text-stone-600 transition hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-30 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-300"
            >
              <ChevronRight className="h-4 w-4" />
              مرحله قبل
            </button>
            <span className="rounded-full bg-indigo-600 px-3 py-1.5 text-[11px] font-black text-white shadow-md shadow-indigo-600/25">
              مرحله {currentStep + 1} از {steps.length}
            </span>
            <button
              type="button"
              disabled={currentStep >= steps.length - 1}
              onClick={onNext}
              title="مرحله بعدی"
              className="flex h-9 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-[11px] font-extrabold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-30"
            >
              مرحله بعد
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-4">{children}</div>
    </>
  );
}
