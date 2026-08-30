"use client";

import { Fragment, useMemo } from "react";
import { Activity, CircleAlert, CircleCheck, CircleX, ListChecks, LoaderCircle, RefreshCw, X } from "lucide-react";
import type {
  ConstraintCheck,
  ConstraintGroup,
  SemConstraintReport,
  SemGenProgress,
} from "@/lib/sem-generator";

export type GenerationPhase = "running" | "done" | "error";

const GROUP_ORDER: ConstraintGroup[] = [
  "برازش مدل",
  "مسیر مستقیم",
  "اثر غیرمستقیم",
  "R² متغیر نتیجه",
  "پیش‌فرض‌های آماری",
];

function StatusBadge({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
      <CircleCheck className="h-3.5 w-3.5" />
      رعایت شد
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-extrabold text-red-700 dark:bg-red-950 dark:text-red-300">
      <CircleX className="h-3.5 w-3.5" />
      رعایت نشد
    </span>
  );
}

function GroupSummaryChips({
  progress,
}: {
  progress: SemGenProgress | null;
}) {
  if (!progress) return null;
  const ordered = [...(progress.groupSummary ?? [])].sort(
    (a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group)
  );
  if (!ordered.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {ordered.map((item) => {
        const all = item.passed === item.total;
        return (
          <span
            key={item.group}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${
              all
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            }`}
          >
            {item.group}
            <span className="rounded-full bg-white/70 px-1.5 dark:bg-slate-900/60">
              {item.passed}/{item.total}
            </span>
          </span>
        );
      })}
    </div>
  );
}

function ReportTable({ report }: { report: SemConstraintReport }) {
  const grouped = useMemo(() => {
    return GROUP_ORDER.map((group) => ({
      group,
      rows: report.checks.filter((check) => check.group === group),
    })).filter((item) => item.rows.length > 0);
  }, [report]);

  return (
    <div className="tool-table-wrap mt-3 max-h-[46vh] overflow-auto rounded-xl border border-stone-200 dark:border-stone-700">
      <table className="tool-table" style={{ minWidth: 620 }}>
        <thead className="sticky top-0 z-10">
          <tr>
            <th style={{ width: 150 }}>گروه قید</th>
            <th>قید</th>
            <th style={{ width: 150 }}>شرط لازم</th>
            <th style={{ width: 130 }}>مقدار به‌دست‌آمده</th>
            <th style={{ width: 110 }}>وضعیت</th>
          </tr>
        </thead>
        <tbody>
          {grouped.map(({ group, rows }) => {
            const passed = rows.filter((row) => row.status === "pass").length;
            return (
              <Fragment key={`group-${group}`}>
                <tr className="bg-stone-100 dark:bg-slate-900">
                  <td colSpan={4} className="!py-1.5 text-[12px] font-extrabold text-stone-700 dark:text-stone-200">
                    {group}
                  </td>
                  <td className="!py-1.5 text-[12px] font-extrabold text-stone-500 dark:text-stone-400">
                    {passed} / {rows.length}
                  </td>
                </tr>
                {rows.map((row: ConstraintCheck, index: number) => (
                  <tr key={`${group}-${index}`}>
                    <td className="text-[11px] text-stone-400 dark:text-stone-500" />
                    <td className="text-[12px] font-bold text-stone-700 dark:text-stone-200">{row.label}</td>
                    <td dir="ltr" className="text-[12px] text-stone-600 dark:text-stone-300">
                      {row.requirement}
                    </td>
                    <td dir="ltr" className="text-[12px] font-extrabold text-stone-800 dark:text-stone-100">
                      {row.actual}
                    </td>
                    <td>
                      <StatusBadge ok={row.status === "pass"} />
                    </td>
                  </tr>
                ))}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SemGenerationModal({
  open,
  phase,
  progress,
  report,
  errorMessage,
  attempts,
  cancelled,
  onCancel,
  onClose,
  onRetry,
}: {
  open: boolean;
  phase: GenerationPhase;
  progress: SemGenProgress | null;
  report: SemConstraintReport | null;
  errorMessage: string | null;
  attempts: number;
  cancelled: boolean;
  onCancel: () => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  if (!open) return null;

  const pct = (value: number | null | undefined) =>
    value == null ? 0 : Math.max(0, Math.min(100, Math.round(value * 100)));

  const attemptPct = progress && progress.maxAttempts > 0 ? pct(progress.attempt / progress.maxAttempts) : 0;

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl dark:border-stone-700 dark:bg-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ---------- هدر ---------- */}
        <div className="flex items-start justify-between gap-3 border-b border-stone-200 px-5 py-4 dark:border-stone-700">
          <div className="flex items-center gap-3">
            {phase === "running" && (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-950">
                <LoaderCircle className="h-5 w-5 animate-spin text-indigo-600 dark:text-indigo-400" />
              </span>
            )}
            {phase === "done" && report?.allPassed && (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CircleCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </span>
            )}
            {phase === "done" && report && !report.allPassed && (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-950">
                <CircleAlert className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </span>
            )}
            {phase === "error" && (
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
                <CircleX className="h-6 w-6 text-red-600 dark:text-red-400" />
              </span>
            )}
            <div>
              <h3 className="text-base font-black text-stone-900 dark:text-stone-100">
                {phase === "running"
                  ? "در حال تولید داده و تحلیل"
                  : phase === "error"
                    ? "تولید ناموفق بود"
                    : cancelled
                      ? "تولید متوقف شد"
                      : report?.allPassed
                        ? "تولید کامل شد — همهٔ قیود رعایت شد"
                        : "تولید پایان یافت — برخی قیود رعایت نشد"}
              </h3>
              <p className="mt-0.5 text-[12px] text-stone-500 dark:text-stone-400">
                {phase === "running"
                  ? "هر تلاش یک دادهٔ تازه می‌سازد و در برابر همهٔ قیود سنجیده می‌شود."
                  : cancelled
                    ? `پس از ${attempts} تلاش متوقف شد — نتیجهٔ زیر بهترین خروجی تا لحظهٔ توقف است.`
                    : `${attempts} تلاش انجام شد`}
              </p>
            </div>
          </div>
          {phase !== "running" && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-stone-400 transition hover:bg-stone-100 hover:text-stone-700 dark:hover:bg-slate-700 dark:hover:text-stone-200"
              aria-label="بستن"
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {/* ---------- بدنه ---------- */}
        <div className="flex-1 overflow-auto px-5 py-4">
          {phase === "running" && (
            <>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px]">
                <span className="inline-flex items-center gap-1.5 font-extrabold text-stone-800 dark:text-stone-100">
                  <Activity className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  تلاش {Math.max(1, progress?.attempt ?? 1)} از {progress?.maxAttempts ?? "—"}
                </span>
                <span className="rounded-full bg-indigo-50 px-2.5 py-1 text-[12px] font-extrabold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                  {progress?.stageLabel ?? "—"}
                </span>
                {progress && progress.verificationsDone > 0 && (
                  <span className="rounded-full bg-violet-50 px-2.5 py-1 text-[12px] font-extrabold text-violet-700 dark:bg-violet-950 dark:text-violet-300">
                    راستی‌آزمایی {progress.verificationsDone} از {progress.maxVerifications}
                  </span>
                )}
              </div>

              <div className="mt-3">
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-700">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-indigo-600 to-violet-500 transition-[width] duration-200"
                    style={{ width: `${attemptPct}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                  پیشرفتِ کلیِ تلاش‌ها: {attemptPct}٪
                </p>
              </div>

              {progress?.stageProgress != null && (
                <div className="mt-3">
                  <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-700">
                    <div
                      className="h-full rounded-full bg-violet-500 transition-[width] duration-150"
                      style={{ width: `${pct(progress.stageProgress)}%` }}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] text-stone-500 dark:text-stone-400">
                    پیشرفتِ مرحلهٔ جاری: {pct(progress.stageProgress)}٪
                  </p>
                </div>
              )}

              <p className="mt-3 rounded-xl bg-stone-50 p-3 text-[12px] leading-6 text-stone-700 dark:bg-slate-900 dark:text-stone-300">
                {progress?.message ?? "در حال آماده‌سازی..."}
              </p>

              <div className="mt-3 flex items-start gap-2 rounded-xl border border-stone-200 p-3 dark:border-stone-700">
                <ListChecks className="mt-0.5 h-4 w-4 shrink-0 text-stone-400" />
                <div className="w-full">
                  <p className="text-[12px] font-extrabold text-stone-700 dark:text-stone-200">
                    وضعیت قیود در بهترین دادهٔ ساخته‌شده تا این لحظه
                  </p>
                  {progress && progress.bestTotal > 0 && (
                    <p className="mt-1 text-[12px] font-bold text-stone-500 dark:text-stone-400">
                      {progress.bestPassed} از {progress.bestTotal} قید رعایت شده است
                    </p>
                  )}
                  <GroupSummaryChips progress={progress} />
                </div>
              </div>

              <p className="mt-3 text-[11px] leading-5 text-stone-400 dark:text-stone-500">
                تولید در یک پردازشِ جدا (Worker) اجرا می‌شود؛ صفحه قفل نمی‌شود و می‌توانید هر لحظه متوقف کنید.
              </p>
            </>
          )}

          {phase === "error" && (
            <p className="rounded-xl bg-red-50 p-4 text-[13px] leading-6 text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {errorMessage}
            </p>
          )}

          {phase === "done" && !report && (
            <p className="rounded-xl bg-stone-50 p-4 text-[13px] leading-6 text-stone-700 dark:bg-slate-900 dark:text-stone-300">
              تولید پیش از ساخته‌شدنِ دادهٔ قابل‌ارائه متوقف شد. می‌توانید دوباره تلاش کنید.
            </p>
          )}

          {phase === "done" && report && (
            <>
              <div
                className={`rounded-2xl border p-4 ${
                  report.allPassed
                    ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : "border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30"
                }`}
              >
                <p
                  className={`text-[15px] font-black ${
                    report.allPassed
                      ? "text-emerald-800 dark:text-emerald-300"
                      : "text-amber-800 dark:text-amber-300"
                  }`}
                >
                  {report.passed} از {report.total} قید رعایت شد
                  {report.failed > 0 && ` · ${report.failed} قید رعایت نشد`}
                </p>
                <p className="mt-1 text-[12px] leading-6 text-stone-600 dark:text-stone-300">
                  بهترین خروجیِ به‌دست‌آمده پس از {attempts} تلاش
                  {report.bootstrapSamples
                    ? ` — قیدهای اثر غیرمستقیم با بوت‌استرپ ${
                        report.bootstrapEstimator === "ml" ? "ML" : "سریع"
                      } (${report.bootstrapSamples} نمونه) سنجیده شده‌اند.`
                    : " — قیدها با برآوردگر ML سنجیده شده‌اند."}
                </p>
              </div>

              <ReportTable report={report} />

              {report.hints.length > 0 && (
                <div className="mt-3 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-3 dark:border-amber-800 dark:bg-amber-950/30">
                  <p className="text-[12px] font-extrabold text-amber-800 dark:text-amber-300">
                    برای اینکه قیدهای باقی‌مانده هم رعایت شوند
                  </p>
                  <ul className="mt-1.5 space-y-1 text-[11px] leading-5 text-amber-700 dark:text-amber-400">
                    {report.hints.map((hint, index) => (
                      <li key={index}>• {hint}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>

        {/* ---------- پاورقی ---------- */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-200 px-5 py-3 dark:border-stone-700">
          {phase === "running" ? (
            <>
              <span className="text-[11px] text-stone-400 dark:text-stone-500">
                بسته‌شدنِ این پنجره تولید را متوقف نمی‌کند.
              </span>
              <button
                type="button"
                onClick={onCancel}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-red-500"
              >
                توقف تولید
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-2 rounded-xl border border-stone-300 bg-white px-4 py-2.5 text-sm font-extrabold text-stone-700 transition hover:bg-stone-50 dark:border-stone-600 dark:bg-slate-700 dark:text-stone-200 dark:hover:bg-slate-600"
              >
                <RefreshCw className="h-4 w-4" />
                تولید مجدد
              </button>
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-indigo-500"
              >
                بستن و ادامه
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
