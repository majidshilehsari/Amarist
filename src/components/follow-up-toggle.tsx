"use client";

import { useState } from "react";
import { Check, Sigma } from "lucide-react";

export default function FollowUpToggle() {
  const [hasFollowUp, setHasFollowUp] = useState(false);

  return (
    <div className="mt-4">
      <label className="flex cursor-pointer select-none items-center gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 transition-colors hover:border-indigo-300">
        <input
          type="checkbox"
          checked={hasFollowUp}
          onChange={(e) => setHasFollowUp(e.target.checked)}
          className="sr-only"
        />
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-colors ${
            hasFollowUp
              ? "border-indigo-600 bg-indigo-600"
              : "border-stone-300 bg-white"
          }`}
        >
          {hasFollowUp && <Check className="h-3.5 w-3.5 text-white" strokeWidth={3.5} />}
        </span>
        <span className="text-[13px] font-bold text-stone-800">مرحله پیگیری</span>
        <span
          className={`ms-auto rounded-full px-2 py-0.5 text-[10px] font-bold ${
            hasFollowUp
              ? "bg-indigo-100 text-indigo-700"
              : "bg-stone-200 text-stone-600"
          }`}
        >
          {hasFollowUp ? "با مرحله پیگیری" : "بدون مرحله پیگیری"}
        </span>
      </label>

      <div className="mt-2 flex items-center justify-between gap-2 rounded-lg border border-dashed border-stone-200 bg-white px-3 py-2">
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-stone-500">
          <Sigma className="h-3.5 w-3.5 text-indigo-600" />
          روش تحلیل:
        </span>
        <span className="text-xs font-bold text-stone-800">
          {hasFollowUp
            ? "تحلیل واریانس با اندازه‌گیری مکرر"
            : "تحلیل کوواریانس (ANCOVA)"}
        </span>
      </div>
    </div>
  );
}
