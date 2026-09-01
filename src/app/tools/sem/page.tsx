"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  ListChecks,
  LoaderCircle,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { fmt, fmtP, mean, sampleStd } from "@/lib/statistics";
import {
  cronbachAlpha,
  estimateSem,
  bootstrapIndirectEffects,
  kurtosis,
  mahalanobisDistances,
  mardiaTest,
  AMOS_MARDIA_CR_LIMIT,
  pcaLoadings,
  skewness,
  correlationMatrixWithP,
  type ModelNode,
  type Role,
  type SemMeasurementColumns,
  type SemResults,
} from "@/lib/sem-stats";
import {
  generateSemData,
  buildModelNodes,
  buildModelArrows,
  defaultSemFitConstraints,
  defaultIndirectConstraint,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BETA_MIN,
  DEFAULT_BETA_MAX,
  MAX_MAX_ATTEMPTS,
  MIN_MAX_ATTEMPTS,
  type ConstraintGroup,
  type GenConstraints,
  type IndirectConstraint,
  type IndirectTarget,
  type SemFitConstraints,
  type PathTarget,
  type PathDirection,
  inferPathDirection,
  resolveAutomaticIndirectDirection,
  nodePathKey,
  indirectUnitsOfVar,
  indirectUnitKey,
  type SemAnswerKey,
  type SemConstraintReport,
  type SemGenProgress,
  type SemGenOutput,
  type VariableSpec,
} from "@/lib/sem-generator";
import { summarizeMlIndirect, type MlIndirectBootstrapSamples } from "@/lib/sem-ml";
import { buildSemRegressionDiagnostics } from "@/lib/sem-diagnostics";
import {
  alphaColumnName,
  alphaScaleForVariable,
  alphaTargetKey,
  calculateAlphaGroups,
  generateAlphaTrainingData,
  materializeAlphaScales,
  type AlphaResultGroup,
  type AlphaScale,
  type AlphaSemTargets,
} from "@/lib/sem-alpha";
import type { SemGeneratorWorkerResponse } from "@/workers/sem-generator.worker";
import SemGenerationModal, { type GenerationPhase } from "@/components/sem-generation-modal";
import ErrorBoundary from "@/components/error-boundary";
import HelpButtons from "@/components/help-buttons";
import PathDiagram from "@/components/path-diagram";
import ProgressStepper, { type StepStatus } from "@/components/progress-stepper";
import ResultModal from "@/components/result-modal";
import ToolHeader from "@/components/tool-header";
import ZoomableDiagram from "@/components/zoomable-diagram";

// ------------------------------------------------------------
// ثابت‌های استایل
// ------------------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-[#fbfdff] px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-100";
const labelCls = "mb-1 block text-[12px] font-bold text-stone-600 dark:text-stone-300";
const tinyCls = "mt-1 text-[11px] leading-5 text-stone-400 dark:text-stone-500";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 active:translate-y-0 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-extrabold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 disabled:opacity-50";
const btnLight =
  "inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-bold text-stone-600 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300 dark:hover:bg-slate-700 disabled:opacity-50";

const fitConstraintRows: {
  key: keyof SemFitConstraints;
  label: string;
  scientificRange: string;
  interpretation: string;
  step: number;
}[] = [
  { key: "chi2", label: "χ²", scientificRange: "آستانه ثابت ندارد", interpretation: "مقدار کمتر نسبت به df بهتر است؛ همراه p تفسیر می‌شود.", step: 0.1 },
  { key: "df", label: "Df", scientificRange: "بیشتر از صفر", interpretation: "با ساختار مدل تعیین می‌شود و با تولید داده تغییر نمی‌کند.", step: 1 },
  { key: "pValue", label: "P-value", scientificRange: "> 0.05 مطلوب", interpretation: "عدم تفاوت معنادار ماتریس مشاهده‌شده و مدل را نشان می‌دهد.", step: 0.01 },
  { key: "cminDf", label: "CMIN/df", scientificRange: "1 تا 3 مطلوب", interpretation: "کمتر از 3 مطلوب و تا 5 در برخی منابع قابل قبول است.", step: 0.1 },
  { key: "rmsea", label: "RMSEA", scientificRange: "≤ 0.08 قابل قبول", interpretation: "کمتر از 0.05 عالی و 0.05 تا 0.08 قابل قبول است.", step: 0.01 },
  { key: "rmseaCiHigh", label: "حد بالای CI90% RMSEA", scientificRange: "≤ 0.10", interpretation: "حد بالای فاصله اطمینان 90٪ بهتر است از 0.10 بیشتر نباشد.", step: 0.01 },
  { key: "pnfi", label: "PNFI", scientificRange: "وابسته به PRATIO", interpretation: "حد ثابت عمومی ندارد؛ با درجه آزادی و پیچیدگی مدل تفسیر می‌شود.", step: 0.01 },
  { key: "cfi", label: "CFI", scientificRange: "≥ 0.90 قابل قبول", interpretation: "بالاتر از 0.95 نشان‌دهنده برازش بسیار مطلوب است.", step: 0.01 },
  { key: "pcfi", label: "PCFI", scientificRange: "وابسته به PRATIO", interpretation: "حد ثابت عمومی ندارد؛ سقف آن با نسبت درجه آزادی محدود می‌شود.", step: 0.01 },
  { key: "ifi", label: "IFI", scientificRange: "≥ 0.90", interpretation: "بالاتر از 0.90 مطلوب و بالاتر از 0.95 بسیار مطلوب است.", step: 0.01 },
  { key: "gfi", label: "GFI", scientificRange: "≥ 0.90", interpretation: "بالاتر از 0.90 نشان‌دهنده برازش مطلوب است.", step: 0.01 },
  { key: "srmr", label: "SRMR", scientificRange: "≤ 0.08", interpretation: "شاخص تکمیلی؛ کمتر از 0.08 قابل قبول است.", step: 0.01 },
];

const sectionTones = [
  "border-blue-300 bg-blue-50/50 dark:border-blue-900 dark:bg-slate-900",
  "border-violet-300 bg-violet-50/50 dark:border-violet-900 dark:bg-slate-900",
  "border-cyan-300 bg-cyan-50/50 dark:border-cyan-900 dark:bg-slate-900",
  "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-slate-900",
  "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-slate-900",
  "border-rose-300 bg-rose-50/50 dark:border-rose-900 dark:bg-slate-900",
  "border-sky-300 bg-sky-50/50 dark:border-sky-900 dark:bg-slate-900",
  "border-teal-300 bg-teal-50/50 dark:border-teal-900 dark:bg-slate-900",
];

function badge(ok: boolean, text: string): string {
  return `<span class="assumption-badge ${ok ? "assumption-ok" : "assumption-bad"}">${text}</span>`;
}

function badgeWarn(text: string): string {
  return `<span class="assumption-badge assumption-warn">${text}</span>`;
}

function starP(p: number): string {
  if (!Number.isFinite(p)) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

function fmtChi2Df(fit: SemResults["fit"]): string {
  return fit.df === 0 ? "تعریف‌نشده (مدل اشباع)" : fmt(fit.chi2df);
}

function indirectEffectInterpretation(effect: number, p: number): string {
  if (!(p < 0.05)) return "اثر غیرمستقیم غیرمعنادار";
  const magnitude = Math.abs(effect);
  if (magnitude < 0.1) return "اثر معنادار اما کوچک‌تر از دامنه متداول";
  if (magnitude <= 0.3) return "اثر کوچک تا متوسط؛ طبیعی و متداول در مقالات";
  if (magnitude <= 0.5) return "اثر نسبتاً قوی؛ با توجه به زمینه پژوهش تفسیر شود";
  return "اثر بسیار قوی؛ احتمال بیش‌برازش یا همپوشانی سازه‌ها بررسی شود";
}

type FitReportRow = { index: string; value: string; criterion: string; interpretation: string; pass: boolean | null };

function fitReportRows(fit: SemResults["fit"]): FitReportRow[] {
  const cminPass = Number.isFinite(fit.chi2df) && fit.chi2df >= 1 && fit.chi2df <= 3;
  const rmseaPass = fit.rmsea <= 0.08 && (!Number.isFinite(fit.rmseaHigh) || fit.rmseaHigh <= 0.1);
  const rows: FitReportRow[] = [
    { index: "χ²", value: fmt(fit.chi2), criterion: "آستانه ثابت ندارد", interpretation: fit.pValue > 0.05 ? "قابل قبول" : "با احتیاط تفسیر شود", pass: null },
    { index: "Df", value: String(fit.df), criterion: "> 0 برای مدل قابل‌آزمون", interpretation: fit.df > 0 ? "مطلوب" : "مدل اشباع", pass: fit.df > 0 },
    { index: "P-value", value: fmtP(fit.pValue), criterion: "> 0.05 مطلوب", interpretation: fit.pValue > 0.05 ? "مطلوب" : "نامطلوب", pass: fit.pValue > 0.05 },
    { index: "CMIN/df", value: fmtChi2Df(fit), criterion: "1 تا 3 مطلوب", interpretation: cminPass ? "مطلوب" : "خارج از دامنه مطلوب", pass: cminPass },
    {
      index: "RMSEA (CI90%)",
      value: `${fmt(fit.rmsea)} (${fmt(fit.rmseaLow)}–${fmt(fit.rmseaHigh)})`,
      criterion: "≤ 0.08 و حد بالای CI ≤ 0.10",
      interpretation: rmseaPass ? (fit.rmsea <= 0.05 ? "بسیار مطلوب" : "مطلوب") : "نامطلوب",
      pass: rmseaPass,
    },
    { index: "PNFI", value: fmt(fit.pnfi), criterion: "بالاتر بهتر؛ وابسته به PRATIO", interpretation: "با پیچیدگی و df مدل تفسیر شود", pass: null },
    { index: "CFI", value: fmt(fit.cfi), criterion: "≥ 0.90؛ عالی ≥ 0.95", interpretation: fit.cfi >= 0.95 ? "بسیار مطلوب" : fit.cfi >= 0.9 ? "مطلوب" : "نامطلوب", pass: fit.cfi >= 0.9 },
    { index: "PCFI", value: fmt(fit.pcfi), criterion: "بالاتر بهتر؛ وابسته به PRATIO", interpretation: "با پیچیدگی و df مدل تفسیر شود", pass: null },
    { index: "IFI", value: fmt(fit.ifi), criterion: "≥ 0.90", interpretation: fit.ifi >= 0.95 ? "بسیار مطلوب" : fit.ifi >= 0.9 ? "مطلوب" : "نامطلوب", pass: fit.ifi >= 0.9 },
    { index: "GFI", value: fmt(fit.gfi), criterion: "≥ 0.90", interpretation: fit.gfi >= 0.95 ? "بسیار مطلوب" : fit.gfi >= 0.9 ? "مطلوب" : "نامطلوب", pass: fit.gfi >= 0.9 },
    { index: "TLI", value: fmt(fit.tli), criterion: "≥ 0.90", interpretation: fit.tli >= 0.9 ? "مطلوب" : "نامطلوب", pass: fit.tli >= 0.9 },
    { index: "SRMR", value: fmt(fit.srmr), criterion: "≤ 0.08", interpretation: fit.srmr <= 0.08 ? "مطلوب" : "نامطلوب", pass: fit.srmr <= 0.08 },
  ];
  if (Number.isFinite(fit.nfi)) rows.push({ index: "NFI", value: fmt(fit.nfi!), criterion: "≥ 0.90", interpretation: fit.nfi! >= 0.9 ? "مطلوب" : "نامطلوب", pass: fit.nfi! >= 0.9 });
  if (Number.isFinite(fit.rfi)) rows.push({ index: "RFI", value: fmt(fit.rfi!), criterion: "≥ 0.90", interpretation: fit.rfi! >= 0.9 ? "مطلوب" : "نامطلوب", pass: fit.rfi! >= 0.9 });
  if (Number.isFinite(fit.rmr)) rows.push({ index: "RMR", value: fmt(fit.rmr!), criterion: "کمتر بهتر؛ وابسته به مقیاس", interpretation: "همراه SRMR تفسیر شود", pass: null });
  if (Number.isFinite(fit.agfi)) rows.push({ index: "AGFI", value: fmt(fit.agfi!), criterion: "≥ 0.90", interpretation: fit.agfi! >= 0.9 ? "مطلوب" : "نامطلوب", pass: fit.agfi! >= 0.9 });
  if (Number.isFinite(fit.pgfi)) rows.push({ index: "PGFI", value: fmt(fit.pgfi!), criterion: "بالاتر بهتر", interpretation: "شاخص مقتصد و وابسته به df", pass: null });
  if (Number.isFinite(fit.pClose)) rows.push({ index: "PCLOSE", value: fmtP(fit.pClose!), criterion: "> 0.05 برای برازش نزدیک", interpretation: fit.pClose! > 0.05 ? "مطلوب" : "نامطلوب", pass: fit.pClose! > 0.05 });
  return rows;
}

function AssumptionNote({ condition, pass }: { condition: string; pass: boolean }) {
  return (
    <p
      className={`mt-1.5 rounded-lg px-3 py-1.5 text-[12px] font-bold ${
        pass
          ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
          : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300"
      }`}
    >
      شرط برقرار بودن: {condition} — وضعیت فعلی: {pass ? "برقرار ✓" : "برقرار نیست ✗"}
    </p>
  );
}

function CorrelationMatrixTable({ data }: { data: CorrelationTableData }) {
  return (
    <div className="tool-table-wrap mt-2">
      <table className="tool-table" style={{ minWidth: Math.max(560, (data.labels.length + 1) * 130) }}>
        <thead>
          <tr>
            <th>متغیر / زیرمقیاس</th>
            {data.labels.map((label, index) => (
              <th key={index}>{label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.labels.map((label, i) => (
            <tr key={`${label}-${i}`}>
              <td style={{ fontWeight: 900 }}>{label}</td>
              {data.labels.map((_, j) => {
                if (i === j) return <td key={j} className="number-cell">1</td>;
                if (i < j) return <td key={j} />;
                const value = data.r?.[i]?.[j] ?? NaN;
                const p = data.p?.[i]?.[j] ?? 1;
                return (
                  <td key={j} className="number-cell">
                    {fmt(value)}
                    {p < 0.01 ? "**" : p < 0.05 ? "*" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setTxt(value == null ? "" : String(value));
  }
  return (
    <input
      dir="ltr"
      className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[13px] tabular-nums outline-none transition hover:border-stone-200 focus:border-indigo-400 focus:bg-white dark:hover:border-stone-600 dark:focus:bg-slate-800"
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const t = txt.trim();
        if (t === "") onCommit(null);
        else {
          const num = Number(t);
          onCommit(Number.isFinite(num) ? num : null);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

// ------------------------------------------------------------
// ابزارهای عمومی
// ------------------------------------------------------------

function normName(s: string): string {
  return String(s).replace(/[\s\u200c\u200f-]/g, "").toLowerCase();
}

function parseLocalizedNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/[،٬,\s]/g, "")
    .replace(/[٫/]/g, ".");
  if (!normalized) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function autoMap(columns: string[], vars: VariableSpec[]): Record<number, (number | null)[]> {
  const map: Record<number, (number | null)[]> = {};
  const used = new Set<number>();
  vars.forEach((v) => {
    const slots = v.subscales.length ? v.subscales.map((s) => `${v.name} — ${s.name}`) : [v.name];
    const idxs: (number | null)[] = [];
    slots.forEach((slot) => {
      const target = normName(slot);
      let found = columns.findIndex((c, i) => !used.has(i) && normName(c) === target);
      if (found < 0) found = columns.findIndex((c, i) => !used.has(i) && normName(c).includes(target));
      if (found < 0) found = columns.findIndex((c, i) => !used.has(i));
      if (found >= 0) {
        used.add(found);
        idxs.push(found);
      } else {
        idxs.push(null);
      }
    });
    map[v.id] = idxs;
  });
  return map;
}

function computeNodeCols(
  rows: (number | null)[][],
  vars: VariableSpec[],
  nodes: ModelNode[],
  colMap: Record<number, (number | null)[]>
): { nodeCols: number[][]; indicatorCols: Record<number, number[][]> } {
  const n = rows.length;
  const nodeCols: number[][] = nodes.map(() => Array(n).fill(NaN));
  const indicatorCols: Record<number, number[][]> = {};
  vars.forEach((v) => {
    const idxs = colMap[v.id] ?? [];
    const expectedSlots = Math.max(1, v.subscales.length);
    const cols: number[][] = Array.from({ length: expectedSlots }, (_, slot) => {
      const columnIndex = idxs[slot];
      if (columnIndex == null) return Array(n).fill(NaN);
      return rows.map((row) => {
        const value = row[columnIndex];
        return value != null && Number.isFinite(value) ? value : NaN;
      });
    });
    indicatorCols[v.id] = cols;
    const vNodes = nodes.filter((x) => x.varId === v.id);
    if (vNodes.length === 1) {
      for (let i = 0; i < n; i++) {
        let sum = 0;
        let ok = true;
        for (const c of cols) {
          if (c[i] == null || !Number.isFinite(c[i])) {
            ok = false;
            break;
          }
          sum += c[i]!;
        }
        nodeCols[vNodes[0].nodeId][i] = ok ? sum : NaN;
      }
    } else {
      vNodes.forEach((node, si) => {
        const col = cols[si];
        if (col) for (let i = 0; i < n; i++) nodeCols[node.nodeId][i] = col[i];
      });
    }
  });
  return { nodeCols, indicatorCols };
}

function validateRealSemData(
  rows: (number | null)[][],
  columns: string[],
  vars: VariableSpec[],
  colMap: Record<number, (number | null)[]>
): string[] {
  const problems: string[] = [];
  const selectedColumns: number[] = [];
  for (const variable of vars) {
    const expectedSlots = Math.max(1, variable.subscales.length);
    const mappings = colMap[variable.id] ?? [];
    for (let slot = 0; slot < expectedSlots; slot++) {
      const columnIndex = mappings[slot];
      const label = variable.subscales[slot]
        ? `${variable.name} — ${variable.subscales[slot].name}`
        : variable.name;
      if (columnIndex == null || !columns[columnIndex]) {
        problems.push(`برای «${label}» هیچ ستون واقعی نگاشت نشده است.`);
        continue;
      }
      selectedColumns.push(columnIndex);
      const range = variable.subscales[slot] ?? { min: variable.totalMin, max: variable.totalMax };
      const invalidCount = rows.reduce((count, row) => {
        const value = row[columnIndex];
        return value != null && Number.isFinite(value) && (value < range.min || value > range.max) ? count + 1 : count;
      }, 0);
      if (invalidCount > 0) {
        problems.push(`در ستون «${columns[columnIndex]}» برای «${label}»، ${invalidCount} مقدار خارج از دامنه ${range.min} تا ${range.max} وجود دارد.`);
      }
    }
  }
  const duplicateColumns = [...new Set(selectedColumns.filter((column, index) => selectedColumns.indexOf(column) !== index))];
  if (duplicateColumns.length) {
    problems.push(`یک ستون به بیش از یک متغیر/زیرمقیاس نگاشت شده است: ${duplicateColumns.map((index) => columns[index]).join("، ")}.`);
  }
  return problems;
}

function buildCorrelationTables(
  vars: VariableSpec[],
  nodes: ModelNode[],
  nodeCols: number[][],
  indicatorCols: Record<number, number[][]>
): { totals: CorrelationTableData; all: CorrelationTableData; subscales: CorrelationTableData } {
  const totalsLabels = nodes.map((node) => node.label);
  const totalsCorr = correlationMatrixWithP(nodeCols);
  const allLabels: string[] = [];
  const allCols: number[][] = [];
  const subscaleLabels: string[] = [];
  const subscaleCols: number[][] = [];

  vars.forEach((variable) => {
    const variableNodes = nodes.filter((node) => node.varId === variable.id);
    const indicators = indicatorCols[variable.id] ?? [];
    const totalNode = variableNodes[0];

    if (variable.hasTotal && totalNode) {
      allLabels.push(variable.subscales.length ? `${variable.name} (کل)` : variable.name);
      allCols.push(nodeCols[totalNode.nodeId]);
    }

    if (variable.subscales.length > 0) {
      variable.subscales.forEach((subscale, index) => {
        const column = indicators[index];
        if (!column) return;
        const label = `${variable.name} — ${subscale.name}`;
        allLabels.push(label);
        allCols.push(column);
        subscaleLabels.push(label);
        subscaleCols.push(column);
      });
    } else if (totalNode) {
      subscaleLabels.push(variable.name);
      subscaleCols.push(nodeCols[totalNode.nodeId]);
    }
  });

  const allCorr = correlationMatrixWithP(allCols);
  const subscaleCorr = correlationMatrixWithP(subscaleCols);
  return {
    totals: { labels: totalsLabels, ...totalsCorr },
    all: { labels: allLabels, ...allCorr },
    subscales: { labels: subscaleLabels, ...subscaleCorr },
  };
}

function varNameOf(vars: VariableSpec[], id: number): string {
  return vars.find((v) => v.id === id)?.name ?? `متغیر ${id}`;
}

type BootLike = {
  fromVar: number;
  toVar: number;
  viaVar: number | null;
  fromNode?: number | null;
  viaNode?: number | null;
  toNode?: number | null;
};

/**
 * برچسبِ یک «واحد اثر» در ردیف‌های بوت‌استرپ.
 * برای پرسشنامهٔ غیرجمع‌پذیر (بدون نمرهٔ کل) هر زیرمقیاس یک واحدِ مستقل است؛
 * بنابراین برچسبِ ردیف باید برچسبِ همان زیرمقیاس باشد، نه نامِ متغیر.
 */
function bootUnitLabelOf(
  nodes: ModelNode[],
  vars: VariableSpec[],
  varId: number,
  nodeId: number | null
): string {
  if (nodeId != null) {
    const node = nodes.find((x) => x.nodeId === nodeId);
    if (node) return node.label;
  }
  return varNameOf(vars, varId);
}

function bootPathLabelOf(nodes: ModelNode[], vars: VariableSpec[], b: BootLike): string {
  const from = bootUnitLabelOf(nodes, vars, b.fromVar, b.fromNode ?? null);
  const to = bootUnitLabelOf(nodes, vars, b.toVar, b.toNode ?? null);
  if (b.viaVar === null) return `کل اثر غیرمستقیم: ${from} ← ${to}`;
  return `${from} ← ${bootUnitLabelOf(nodes, vars, b.viaVar, b.viaNode ?? null)} ← ${to}`;
}

function faNum(v: string | number): string {
  return String(v).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

// ------------------------------------------------------------
// تایپ‌ها
// ------------------------------------------------------------

type BootResult = {
  fromVar: number;
  toVar: number;
  viaVar: number | null;
  /** شناسهٔ گره وقتی ردیف مربوط به یک زیرمقیاسِ مستقل است (متغیرِ غیرجمع‌پذیر) */
  fromNode: number | null;
  viaNode: number | null;
  toNode: number | null;
  direct: number;
  indirect: number;
  lo: number;
  hi: number;
  p: number;
  total: number;
  /** تعداد نمونه‌های معتبر (وقتی برخی نمونه‌ها به‌دلیلِ هم‌خطیِ شدید کنار گذاشته شده‌اند) */
  usable: number | null;
  requested: number | null;
};

type CorrelationTableData = { labels: string[]; r: number[][]; p: number[][] };

type Analysis = {
  nodeIds: number[];
  nodeCols: number[][];
  indicatorCols: Record<number, number[][]>;
  sem: SemResults;
  corr: CorrelationTableData;
  corrAll: CorrelationTableData;
  corrSubscales: CorrelationTableData;
  maha: ReturnType<typeof mahalanobisDistances>;
  mardia: ReturnType<typeof mardiaTest>;
  missing: { col: string; count: number }[];
  normals: { name: string; skew: number; skewCr: number; kurt: number; kurtCr: number }[];
  meas: { varId: number; name: string; alpha: number; loadings: number[]; subNames: string[] }[];
};

type ModalState = { ok: boolean; lines: string[] } | null;

type AlphaProjectData = {
  wantAlpha: boolean;
  tab?: "training" | "real";
  scales: AlphaScale[];
  /** فیلد قدیمی برای سازگاری پروژه‌های ذخیره‌شده؛ حجم نمونه اکنون الزاماً از دادهٔ SEM می‌آید. */
  n: string;
  min: string;
  max: string;
  columns: string[];
  rows: (number | null)[][];
  result: AlphaResultGroup[] | null;
  realColumns?: string[];
  realRows?: (number | null)[][];
  realResult?: AlphaResultGroup[] | null;
};

// ------------------------------------------------------------
// پروژه‌ها (ذخیره در مرورگر)
// ------------------------------------------------------------

type ProjectData = {
  source: "generate" | "real";
  vars: VariableSpec[];
  inactiveArrowIds: string[];
  constraints: GenConstraints;
  n: string;
  columns: string[];
  rows: (number | null)[][];
  colMap: Record<number, (number | null)[]>;
  alpha?: AlphaProjectData;
};

type Project = {
  id: string;
  name: string;
  updatedAt: string;
  data: ProjectData;
};

const PROJECTS_KEY = "amarist-projects";

function loadProjects(): Project[] {
  try {
    const raw = localStorage.getItem(PROJECTS_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as Project[];
      if (Array.isArray(arr)) return arr.filter((p) => p && p.data);
    }
  } catch {
    // ignore
  }
  return [];
}

function saveProjects(projects: Project[]) {
  try {
    localStorage.setItem(PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // ignore
  }
}

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function defaultConstraints(): GenConstraints {
  return {
    pathTargets: {},
    indirectTargets: {},
    r2Range: { min: 0.3, max: 0.6 },
    fit: defaultSemFitConstraints(),
    missingPct: 0,
    outlierPct: 0,
    enforceNormality: true,
    enforceLinearity: true,
    enforceExogCorr: true,
    enforceVif: true,
    enforceDw: true,
    bootSamples: 2000,
    maxAttempts: DEFAULT_MAX_ATTEMPTS,
  };
}

type LegacyGenConstraints = Partial<GenConstraints> & {
  cfiMin?: number;
  rmseaMax?: number;
  chi2dfMax?: number;
  srmrMax?: number;
};

function normalizeConstraints(input?: LegacyGenConstraints | null): GenConstraints {
  const defaults = defaultConstraints();
  if (!input) return defaults;
  const savedFit = input.fit;
  const fit = Object.fromEntries(
    (Object.keys(defaults.fit) as (keyof SemFitConstraints)[]).map((key) => [
      key,
      { ...defaults.fit[key], ...(savedFit?.[key] ?? {}) },
    ])
  ) as SemFitConstraints;

  if (!savedFit) {
    if (input.cfiMin != null) fit.cfi.min = input.cfiMin;
    if (input.rmseaMax != null) fit.rmsea.max = input.rmseaMax;
    if (input.chi2dfMax != null) fit.cminDf.max = input.chi2dfMax;
    if (input.srmrMax != null) fit.srmr.max = input.srmrMax;
  }

  const indirectTargets = Object.fromEntries(
    Object.entries(input.indirectTargets ?? {}).map(([key, value]) => {
      const normalized =
        typeof value === "string"
          ? { ...defaultIndirectConstraint(), significance: value as IndirectTarget }
          : { ...defaultIndirectConstraint(), ...(value as Partial<IndirectConstraint>) };
      return [key, normalized];
    })
  );

  const rawAttempts = Math.round(Number(input.maxAttempts));
  const maxAttempts = Number.isFinite(rawAttempts)
    ? Math.max(MIN_MAX_ATTEMPTS, Math.min(MAX_MAX_ATTEMPTS, rawAttempts))
    : DEFAULT_MAX_ATTEMPTS;

  return {
    ...defaults,
    ...input,
    pathTargets: input.pathTargets ?? {},
    indirectTargets,
    fit,
    maxAttempts,
  };
}

const initialVars: VariableSpec[] = [
  {
    id: 0,
    name: "طرحواره‌های ناسازگار اولیه",
    role: "exogenous",
    hasTotal: true,
    totalMin: 5,
    totalMax: 25,
    subscales: [
      { name: "حوزه اول: بریدگی و طرد", min: 1, max: 5 },
      { name: "حوزه دوم: خودگردانی و عملکرد مختل", min: 1, max: 5 },
      { name: "حوزه سوم: محدودیت‌های مختل", min: 1, max: 5 },
      { name: "حوزه چهارم: دیگرجهت‌مندی", min: 1, max: 5 },
      { name: "حوزه پنجم: گوش‌به‌زنگی بیش از حد و بازداری", min: 1, max: 5 },
    ],
  },
  {
    id: 1,
    name: "اعتیاد به اینستاگرام",
    role: "mediator",
    hasTotal: true,
    totalMin: 2,
    totalMax: 10,
    subscales: [
      { name: "اثر اجتماعی", min: 1, max: 5 },
      { name: "اجبار", min: 1, max: 5 },
    ],
  },
  {
    id: 2,
    name: "نشخوار فکری",
    role: "mediator",
    hasTotal: true,
    totalMin: 3,
    totalMax: 15,
    subscales: [
      { name: "تأمل", min: 1, max: 5 },
      { name: "درون‌نگری", min: 1, max: 5 },
      { name: "در فکر فرو رفتن", min: 1, max: 5 },
    ],
  },
  {
    id: 3,
    name: "احساس تنهایی",
    role: "outcome",
    hasTotal: true,
    totalMin: 1,
    totalMax: 5,
    subscales: [{ name: "احساس تنهایی", min: 1, max: 5 }],
  },
];

const legacyDefault2Vars: VariableSpec[] = [
  {
    id: 0,
    name: "تاب‌آوری",
    role: "exogenous",
    hasTotal: true,
    totalMin: 1,
    totalMax: 5,
    subscales: [],
  },
  {
    id: 1,
    name: "پیری موفق",
    role: "mediator",
    hasTotal: false,
    totalMin: 1,
    totalMax: 5,
    subscales: [
      { name: "سبک زندگی سالم", min: 1, max: 5 },
      { name: "مقابله سازگار", min: 1, max: 5 },
      { name: "درگیر شدن با زندگی", min: 1, max: 5 },
    ],
  },
  {
    id: 2,
    name: "مشارکت اجتماعی",
    role: "outcome",
    hasTotal: false,
    totalMin: 1,
    totalMax: 5,
    subscales: [
      { name: "خانواده", min: 1, max: 5 },
      { name: "دوستان", min: 1, max: 5 },
    ],
  },
];

const totalOnlyDefault2Vars: VariableSpec[] = [
  {
    id: 0,
    name: "تاب‌آوری",
    role: "exogenous",
    hasTotal: true,
    totalMin: 0,
    totalMax: 40,
    subscales: [],
  },
  {
    id: 1,
    name: "پیری موفق",
    role: "mediator",
    hasTotal: true,
    totalMin: 13,
    totalMax: 91,
    subscales: [],
  },
  {
    id: 2,
    name: "مشارکت اجتماعی",
    role: "outcome",
    hasTotal: true,
    totalMin: 0,
    totalMax: 30,
    subscales: [],
  },
];

const default2Vars: VariableSpec[] = [
  {
    id: 0,
    name: "تاب‌آوری",
    role: "exogenous",
    hasTotal: true,
    totalMin: 0,
    totalMax: 40,
    subscales: [],
  },
  {
    id: 1,
    name: "پیری موفق",
    role: "mediator",
    hasTotal: true,
    totalMin: 13,
    totalMax: 91,
    subscales: [
      { name: "سبک زندگی سالم", min: 4, max: 28 },
      { name: "مقابله سازگار", min: 4, max: 28 },
      { name: "درگیر شدن با زندگی", min: 5, max: 35 },
    ],
  },
  {
    id: 2,
    name: "مشارکت اجتماعی",
    role: "outcome",
    hasTotal: true,
    totalMin: 0,
    totalMax: 30,
    subscales: [
      { name: "خانواده", min: 0, max: 15 },
      { name: "دوستان", min: 0, max: 15 },
    ],
  },
];

// پروژه پیش‌فرض ۳ — سناریوی SEM از فصل سوم یک پایان‌نامه:
// اثرات مستقیم و غیرمستقیم «اعتیاد به بازی‌های آنلاین» و «تنظیم هیجان» بر «پرخاشگری»
// با میانجی‌گری «احساس ناکامی» در نوجوانان شهر رشت.
// دامنه‌ها مطابق متن فصل سوم (تأییدشده توسط کاربر: تطابق کامل).
const default3Vars: VariableSpec[] = [
  {
    id: 0,
    name: "اعتیاد به بازی‌های آنلاین",
    role: "exogenous",
    hasTotal: true,
    totalMin: 20,
    totalMax: 100,
    subscales: [
      { name: "مشکلات اجتماعی و خلقی", min: 10, max: 50 },
      { name: "مشکلات عملکرد تحصیلی و شغلی", min: 10, max: 50 },
    ],
  },
  {
    id: 1,
    name: "تنظیم هیجان",
    role: "exogenous",
    // ERQ نمره کل ندارد؛ دو زیرمقیاس مستقل وارد مدل می‌شوند.
    // (totalMin/totalMax در حالت غیرجمع‌پذیر استفاده نمی‌شود؛ ۱ تا ۷ = طیف لیکرت ۷ درجه‌ای)
    hasTotal: false,
    totalMin: 1,
    totalMax: 7,
    subscales: [
      { name: "ارزیابی مجدد شناختی", min: 6, max: 42 },
      { name: "فرونشانی هیجانی", min: 4, max: 28 },
    ],
  },
  {
    id: 2,
    name: "احساس ناکامی",
    role: "mediator",
    hasTotal: true,
    totalMin: 16,
    totalMax: 80,
    subscales: [
      { name: "احساس ناکامی درونی", min: 6, max: 30 },
      { name: "احساس ناکامی بیرونی", min: 10, max: 50 },
    ],
  },
  {
    id: 3,
    name: "پرخاشگری",
    role: "outcome",
    hasTotal: true,
    totalMin: 29,
    totalMax: 145,
    subscales: [
      { name: "پرخاشگری بدنی", min: 9, max: 45 },
      { name: "پرخاشگری کلامی", min: 5, max: 25 },
      { name: "خشم", min: 7, max: 35 },
      { name: "خصومت", min: 8, max: 40 },
    ],
  },
];

function cloneVariableSpecs(vars: VariableSpec[]): VariableSpec[] {
  return vars.map((variable) => ({
    ...variable,
    subscales: variable.subscales.map((subscale) => ({ ...subscale })),
  }));
}

function defaultAlphaProjectData(vars: VariableSpec[]): AlphaProjectData {
  return {
    wantAlpha: true,
    tab: "training",
    scales: vars.map((variable) => alphaScaleForVariable(variable)),
    n: "",
    min: "0.7",
    max: "0.9",
    columns: [],
    rows: [],
    result: null,
    realColumns: [],
    realRows: [],
    realResult: null,
  };
}

function cloneAlphaProjectData(alpha: AlphaProjectData, vars: VariableSpec[]): AlphaProjectData {
  return {
    ...alpha,
    tab: alpha.tab ?? "training",
    scales: vars.map((variable) => alphaScaleForVariable(variable, alpha.scales.find((scale) => scale.varId === variable.id))),
    columns: [...(alpha.columns ?? [])],
    rows: (alpha.rows ?? []).map((row) => [...row]),
    result: alpha.result
      ? alpha.result.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) }))
      : null,
    realColumns: [...(alpha.realColumns ?? [])],
    realRows: (alpha.realRows ?? []).map((row) => [...row]),
    realResult: alpha.realResult
      ? alpha.realResult.map((group) => ({ ...group, items: group.items.map((item) => ({ ...item })) }))
      : null,
  };
}

function defaultProjectData(vars: VariableSpec[] = initialVars): ProjectData {
  return {
    source: "generate",
    vars: cloneVariableSpecs(vars),
    inactiveArrowIds: [],
    constraints: defaultConstraints(),
    n: "250",
    columns: [],
    rows: [],
    colMap: {},
    alpha: defaultAlphaProjectData(vars),
  };
}

const LEGACY_SHIRDEL_PRESETS: { id: string; vars: VariableSpec[] }[] = [
  { id: "default-shirdel-v2", vars: totalOnlyDefault2Vars },
  { id: "default-shirdel-v1", vars: legacyDefault2Vars },
];
const DEFAULT2_PROJECT_ID = "default-shirdel-v3";
const DEFAULT2_PROJECT_NAME = "پروژه پیش‌فرض ۲";
const DEFAULT2_PROJECT_SEED_KEY = "amarist-sem-shirdel-project-seeded-v3";

const DEFAULT3_PROJECT_ID = "default-tara-razvani-v1";
const DEFAULT3_PROJECT_NAME = "پروژه پیش‌فرض ۳";
const DEFAULT3_PROJECT_SEED_KEY = "amarist-sem-tara-razvani-project-seeded-v1";

function createSeedProject(id: string, name: string, vars: VariableSpec[]): Project {
  return {
    id,
    name,
    updatedAt: new Date().toISOString(),
    data: defaultProjectData(vars),
  };
}

function markSeeded(key: string) {
  try {
    localStorage.setItem(key, "1");
  } catch {
    // ignore
  }
}

function markDefault2ProjectSeeded() {
  markSeeded(DEFAULT2_PROJECT_SEED_KEY);
}

function markDefault3ProjectSeeded() {
  markSeeded(DEFAULT3_PROJECT_SEED_KEY);
}

function isUntouchedLegacyDefault2Project(project: Project, expectedVars: VariableSpec[]): boolean {
  const data = project.data;
  return (
    data.source === "generate" &&
    data.n === "250" &&
    data.rows.length === 0 &&
    data.columns.length === 0 &&
    data.inactiveArrowIds.length === 0 &&
    Object.keys(data.colMap).length === 0 &&
    JSON.stringify(data.vars) === JSON.stringify(expectedVars) &&
    JSON.stringify(data.constraints) === JSON.stringify(defaultConstraints())
  );
}

// افزودن/به‌روزرسانی «پروژه پیش‌فرض ۲» (همراه مهاجرت از نسخه‌های قدیمی v1/v2).
function ensureDefault2Project(existing: Project[]): Project[] {
  if (existing.some((project) => project.id === DEFAULT2_PROJECT_ID)) {
    markDefault2ProjectSeeded();
    return existing;
  }

  try {
    if (localStorage.getItem(DEFAULT2_PROJECT_SEED_KEY) === "1") return existing;
  } catch {
    // localStorage is unavailable; continue with an in-memory seed
  }

  const legacyIndex = existing.findIndex((project) =>
    LEGACY_SHIRDEL_PRESETS.some((preset) => preset.id === project.id)
  );
  const legacyPreset =
    legacyIndex >= 0
      ? LEGACY_SHIRDEL_PRESETS.find((preset) => preset.id === existing[legacyIndex].id)
      : undefined;
  let seeded: Project[];

  if (
    legacyIndex >= 0 &&
    legacyPreset &&
    isUntouchedLegacyDefault2Project(existing[legacyIndex], legacyPreset.vars)
  ) {
    seeded = existing.map((project, index) =>
      index === legacyIndex ? createSeedProject(DEFAULT2_PROJECT_ID, DEFAULT2_PROJECT_NAME, default2Vars) : project
    );
  } else {
    const legacyIds = new Set(LEGACY_SHIRDEL_PRESETS.map((preset) => preset.id));
    const preserved = existing.map((project) =>
      legacyIds.has(project.id) && project.name === DEFAULT2_PROJECT_NAME
        ? { ...project, name: `${DEFAULT2_PROJECT_NAME} — نسخه قبلی` }
        : project
    );
    seeded = [...preserved, createSeedProject(DEFAULT2_PROJECT_ID, DEFAULT2_PROJECT_NAME, default2Vars)];
  }

  saveProjects(seeded);
  markDefault2ProjectSeeded();
  return seeded;
}

// افزودن «پروژه پیش‌فرض ۳» — ادغام‌پذیر و غیرمخرب:
// فقط در صورت نبودِ پروژه اضافه می‌شود و به پروژه‌های کاربر دست نمی‌زند.
function ensureDefault3Project(existing: Project[]): Project[] {
  if (existing.some((project) => project.id === DEFAULT3_PROJECT_ID)) {
    markDefault3ProjectSeeded();
    return existing;
  }

  try {
    if (localStorage.getItem(DEFAULT3_PROJECT_SEED_KEY) === "1") return existing;
  } catch {
    // localStorage is unavailable; continue with an in-memory seed
  }

  const seeded = [
    ...existing,
    createSeedProject(DEFAULT3_PROJECT_ID, DEFAULT3_PROJECT_NAME, default3Vars),
  ];
  saveProjects(seeded);
  markDefault3ProjectSeeded();
  return seeded;
}

// نام پروژه‌های پیش‌فرض از نامِ اشخاص به شماره تغییر کرده است.
// این نگاشت پروژه‌هایِ از‌قبل‌ذخیره‌شده‌ی کاربر را هم به‌روزرسانی می‌کند.
// فقط یک بار اجرا می‌شود و به نام‌هایِ سفارشیِ کاربر دست نمی‌زند.
const PROJECT_RENAME_SEED_KEY = "amarist-sem-project-names-numbered-v1";
const PROJECT_NAME_RENAMES: Record<string, string> = {
  "پروژه پیش‌فرض": "پروژه پیش‌فرض ۱",
  "پروژه پیش‌فرض (شیردل)": "پروژه پیش‌فرض ۲",
  "پروژه پیش‌فرض (تارا رضوانی)": "پروژه پیش‌فرض ۳",
};

function migrateDefaultProjectNames(existing: Project[]): Project[] {
  try {
    if (localStorage.getItem(PROJECT_RENAME_SEED_KEY) === "1") return existing;
  } catch {
    return existing;
  }
  let changed = false;
  const next = existing.map((project) => {
    const renamed = PROJECT_NAME_RENAMES[project.name];
    if (!renamed) return project;
    changed = true;
    return { ...project, name: renamed };
  });
  markSeeded(PROJECT_RENAME_SEED_KEY);
  if (changed) {
    saveProjects(next);
    return next;
  }
  return existing;
}

function loadInitialProjects(): Project[] {
  const existing = loadProjects();

  if (!existing.length) {
    const seeded = [
      createSeedProject(uid(), "پروژه پیش‌فرض ۱", initialVars),
      createSeedProject(DEFAULT2_PROJECT_ID, DEFAULT2_PROJECT_NAME, default2Vars),
      createSeedProject(DEFAULT3_PROJECT_ID, DEFAULT3_PROJECT_NAME, default3Vars),
    ];
    saveProjects(seeded);
    markDefault2ProjectSeeded();
    markDefault3ProjectSeeded();
    markSeeded(PROJECT_RENAME_SEED_KEY);
    return seeded;
  }

  return migrateDefaultProjectNames(ensureDefault3Project(ensureDefault2Project(existing)));
}


// ------------------------------------------------------------
// گزارش متنی (txt / کپی)
// ------------------------------------------------------------

function buildReportText(
  vars: VariableSpec[],
  nodes: ModelNode[],
  analysis: Analysis | null,
  answerKey: SemAnswerKey | null,
  bootResults: BootResult[] | null,
  n: number,
  alphaReportTextRef?: string
): string {
  const L: string[] = [];
  L.push("گزارش آماری — آماریست (SEM / تحلیل مسیر)");
  L.push("==========================================");
  if (!analysis) {
    L.push("تحلیلی اجرا نشده است.");
    return L.join("\n");
  }
  const { sem, corr, corrAll, corrSubscales, maha, mardia, missing, normals, meas } = analysis;
  const nodeLabel = (id: number) => nodes.find((x) => x.nodeId === id)?.label ?? `گره ${id}`;
  const regressionDiagnostics = buildSemRegressionDiagnostics(nodes, sem);
  L.push(`تعداد موارد: ${n} | تعداد متغیرها/زیرمقیاس‌ها: ${nodes.length}`);
  L.push("");
  L.push("دامنه نمره متغیرها:");
  vars.forEach((v) => {
    if (v.subscales.length) {
      L.push(
        `  ${v.name}: ${v.subscales.map((s) => `${s.name} (${s.min} تا ${s.max})`).join("، ")}` +
          (v.hasTotal ? ` | نمره کل: ${v.totalMin} تا ${v.totalMax}` : " (غیرجمع‌پذیر — زیرمقیاس‌های مستقل)")
      );
    } else {
      L.push(`  ${v.name}: ${v.totalMin} تا ${v.totalMax}`);
    }
  });
  L.push("");
  L.push("۱) داده‌های گمشده:");
  missing.forEach((m) => L.push(`  ${m.col}: ${m.count} مورد گمشده`));
  L.push("");
  L.push("۲) داده پرت چندمتغیری (ماهالانوبیس، آستانه p<0.05):");
  L.push(maha.valid ? `  تعداد داده پرت: ${maha.outliers.length}` : `  ${maha.message}`);
  L.push("");
  L.push("۳) نرمال بودن تک‌متغیری (کلاین: |کجی|<3 و |کشیدگی|<10):");
  normals.forEach((x) => L.push(`  ${x.name}: کجی=${fmt(x.skew)} | CR کجی=${fmt(x.skewCr)} | کشیدگی=${fmt(x.kurt)} | CR کشیدگی=${fmt(x.kurtCr)}`));
  L.push("");
  L.push("۴) نرمال بودن چندمتغیری (مردیا، سازگار با AMOS):");
  L.push(
    mardia.valid
      ? `  ضریب کشیدگی مردیا=${fmt(mardia.kurtosis)} | نسبت بحرانی=${fmt(mardia.cr)} (محاسبه و معیار AMOS: |CR| ≤ ${AMOS_MARDIA_CR_LIMIT})`
      : `  ${mardia.message}`
  );
  L.push("");
  const appendCorrelationText = (title: string, table: CorrelationTableData) => {
    L.push(title);
    table.r.forEach((row, i) => {
      const entries = row
        .map((value, j) =>
          j < i
            ? `${table.labels[j]}=${fmt(value)}${table.p[i][j] < 0.01 ? "**" : table.p[i][j] < 0.05 ? "*" : ""}`
            : ""
        )
        .filter(Boolean);
      L.push(`  ${table.labels[i]}: ${entries.length ? entries.join("، ") : "1"}`);
    });
  };
  appendCorrelationText("۵-۱) ماتریس همبستگی پیرسون (نمرات کل / گره‌های مدل):", corr);
  appendCorrelationText("۵-۲) ماتریس همبستگی پیرسون (نمره کل و زیرمقیاس‌ها با هم):", corrAll);
  appendCorrelationText("۵-۳) ماتریس همبستگی پیرسون (فقط زیرمقیاس‌ها؛ نمره کل برای متغیر بدون زیرمقیاس):", corrSubscales);
  L.push("۵-۴) معناداری همبستگیِ پیش‌بین‌های برون‌زا:");
  const exogenousNodes = nodes.filter((node) => node.role === "exogenous");
  for (let i = 0; i < exogenousNodes.length; i++) {
    for (let j = i + 1; j < exogenousNodes.length; j++) {
      const left = exogenousNodes[i];
      const right = exogenousNodes[j];
      const r = corr.r[left.nodeId]?.[right.nodeId] ?? NaN;
      const p = corr.p[left.nodeId]?.[right.nodeId] ?? NaN;
      L.push(`  ${left.label} ↔ ${right.label}: r=${fmt(r)} | p=${fmtP(p)}${starP(p)} | ${p < 0.05 ? "معنادار" : "غیرمعنادار"}`);
    }
  }
  L.push("  پیش‌فرض تولید: همهٔ جفت‌های پیش‌بینِ برون‌زا در سطح ۰٫۰۵ معنادار و VIF ماتریس حداکثر ۴ باشد.");
  L.push("  ** p < 0.01 ، * p < 0.05 (دوطرفه؛ حذف زوجی داده‌های گمشده)");
  L.push("");
  L.push("۶) عدم هم‌خطی چندگانه و استقلال خطاها:");
  L.push("۶-۱) عدم هم‌خطی چندگانه (هر پیش‌بین در یک ردیف):");
  regressionDiagnostics.collinearity.forEach((row) => {
    L.push(
      `  وابسته: ${row.dependentLabel} | پیش‌بین: ${row.predictorLabel} | تلورانس=${fmt(row.tolerance)} | VIF=${fmt(row.vif)} | ${row.pass ? "برقرار" : "برقرار نیست"}`
    );
  });
  L.push("  معیار: VIF < ۵ و تلورانس > ۰٫۲۰.");
  L.push("۶-۲) استقلال خطاها:");
  regressionDiagnostics.independence.forEach((row) => {
    L.push(
      `  ${row.dependentLabel}: دوربین-واتسون=${Number.isFinite(row.durbinWatson) ? fmt(row.durbinWatson) : "تعریف‌نشده"} | ${row.pass ? "برقرار" : "برقرار نیست"}`
    );
  });
  L.push("  معیار: دوربین-واتسون بین ۱٫۵ تا ۲٫۵.");
  L.push("");
  L.push("۷) ضرایب مسیر:");
  sem.paths.forEach((pr) => {
    L.push(
      `  ${nodeLabel(pr.from)} ← ${nodeLabel(pr.to)}: B=${fmt(pr.b)} | β=${fmt(pr.std)} | SE=${fmt(pr.se)} | t=${fmt(pr.t)} | p=${fmtP(pr.p)}${starP(pr.p)}`
    );
  });
  L.push("  * p < 0.05 ، ** p < 0.01 ، *** p < 0.001");
  L.push("");
  L.push("۸) اثرات غیرمستقیم (بوت‌استرپ):");
  if (bootResults && bootResults.length) {
    bootResults.forEach((b) => {
      const pathLabel = bootPathLabelOf(nodes, vars, b);
      L.push(
        `  ${pathLabel}: اثر استانداردشده=${fmt(b.indirect)} | CI95: ${fmt(b.lo)} تا ${fmt(b.hi)} | p=${fmtP(b.p)}${starP(b.p)} | ${indirectEffectInterpretation(b.indirect, b.p)}` +
          (b.viaVar === null ? ` | مستقیم=${fmt(b.direct)} | کل=${fmt(b.total)}` : "")
      );
    });
    L.push("  فاصله اطمینان ۹۵٪ با روش بوت‌استرپ؛ عدم عبور از صفر = معناداری در سطح ۰/۰۵");
  } else {
    sem.effects.forEach((ef) => {
      L.push(
        `  ${varNameOf(vars, ef.fromVar)} ← ${varNameOf(vars, ef.toVar)}: مستقیم=${fmt(ef.direct)} | غیرمستقیم=${fmt(ef.indirect)} | کل=${fmt(ef.total)}`
      );
    });
  }
  L.push("");
  L.push("۹) R² متغیرهای درون‌زا:");
  nodes.forEach((nd) => {
    if (nd.role !== "exogenous") L.push(`  ${nd.label}: R²=${fmt(sem.r2[nd.nodeId] ?? 0)}`);
  });
  L.push("");
  L.push("۱۰) شاخص‌های برازش:");
  if (sem.fit.valid) {
    fitReportRows(sem.fit).forEach((row) => {
      L.push(`  ${row.index}: ${row.value} | معیار: ${row.criterion} | تفسیر: ${row.interpretation}`);
    });
    if (sem.fit.message) L.push(`  روش محاسبه: ${sem.fit.message}`);
  } else {
    L.push(`  ${sem.fit.message ?? "نامشخص"}`);
  }
  if (meas.length) {
    L.push("");
    L.push("۱۱) مدل اندازه‌گیری (آلفای کرونباخ نمره کل و بارهای عاملی):");
    meas.forEach((m) => {
      L.push(`  ${m.name}: آلفا=${fmt(m.alpha)} | بارها=${m.loadings.map((x) => fmt(x)).join("، ")}`);
    });
    L.push("  معیار پذیرش آلفای کرونباخ ≥ 0.70");
  }
  if (answerKey) {
    L.push("");
    L.push("۱۲) کلید پاسخ (مقادیر هدف در برابر مقادیر واقعی):");
    answerKey.pathTargets.forEach((pt) => {
      L.push(`  ${nodeLabel(pt.fromNode)} ← ${nodeLabel(pt.toNode)}: هدف=${fmt(pt.target)} | واقعی=${fmt(pt.actual)}`);
    });
  }
  if (alphaReportTextRef) {
    L.push("");
    L.push(alphaReportTextRef);
  }
  return L.join("\n");
}

// ------------------------------------------------------------
// ساخت سند docx زیبا (فونت فارسی + جداول)
// ------------------------------------------------------------

const FA_FONT = "B Nazanin";
const FA_HEAD = "B Titr";

const thinBorder = {
  style: BorderStyle.SINGLE,
  size: 2,
  color: "9AA5B1",
} as const;

function docP(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.RIGHT,
    spacing: { after: 100 },
    children: [
      new TextRun({
        text,
        font: FA_FONT,
        size: opts.size ?? 22,
        bold: opts.bold,
        color: opts.color,
      }),
    ],
  });
}

function docH(text: string) {
  return new Paragraph({
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, font: FA_HEAD, size: 28, bold: true, color: "1F3864" })],
  });
}

function docCell(text: string, opts: { bold?: boolean; fill?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: faNum(text), font: FA_FONT, size: 20, bold: opts.bold })],
      }),
    ],
  });
}

function docTable(headers: string[], rows: (string | number)[][]) {
  const w = headers.map(() => Math.floor(100 / headers.length));
  const headerRow = new TableRow({
    tableHeader: true,
    children: headers.map((h, i) => docCell(h, { bold: true, fill: "D9E2F3", width: w[i] })),
  });
  const body = rows.map(
    (r) =>
      new TableRow({
        children: r.map((c, i) => docCell(String(c), { width: w[i] })),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: thinBorder,
      bottom: thinBorder,
      left: thinBorder,
      right: thinBorder,
      insideHorizontal: thinBorder,
      insideVertical: thinBorder,
    },
    rows: [headerRow, ...body],
  });
}

function buildDocxReport(
  projectName: string,
  vars: VariableSpec[],
  nodes: ModelNode[],
  analysis: Analysis | null,
  answerKey: SemAnswerKey | null,
  bootResults: BootResult[] | null,
  n: number,
  source: "generate" | "real"
): Document {
  const children: (Paragraph | Table)[] = [];
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 },
      children: [new TextRun({ text: "گزارش آماری — آماریست", font: FA_HEAD, size: 40, bold: true, color: "1F3864" })],
    })
  );
  children.push(
    docP(`پروژه: ${projectName} | منبع داده: ${source === "generate" ? "تولید تمرینی" : "داده واقعی"} | تعداد موارد: ${faNum(n)} | تعداد متغیرها/زیرمقیاس‌ها: ${faNum(nodes.length)}`, { align: AlignmentType.CENTER, bold: true })
  );

  if (!analysis) {
    children.push(docP("تحلیلی اجرا نشده است."));
    return new Document({ sections: [{ children }] });
  }

  const { sem, corr, corrAll, corrSubscales, maha, mardia, missing, normals, meas } = analysis;
  const nodeLabel = (id: number) => nodes.find((x) => x.nodeId === id)?.label ?? `گره ${id}`;
  const regressionDiagnostics = buildSemRegressionDiagnostics(nodes, sem);

  // ۱) داده‌های گمشده
  children.push(docH("۱) داده‌های گمشده"));
  children.push(
    docTable(
      ["ستون", "تعداد گمشده", "نتیجه"],
      missing.map((m) => [m.col, m.count, m.count === 0 ? "کامل" : "دارای گمشده"])
    )
  );

  // ۲) داده پرت
  children.push(docH("۲) داده پرت چندمتغیری (ماهالانوبیس)"));
  children.push(
    docP(
      maha.valid
        ? `تعداد داده‌های پرت شناسایی‌شده: ${faNum(maha.outliers.length)} (آستانه p < ۰/۰۵)`
        : maha.message
    )
  );

  // ۳) نرمال بودن تک‌متغیری
  children.push(docH("۳) نرمال بودن تک‌متغیری (کجی و کشیدگی)"));
  children.push(
    docTable(
      ["گره", "کجی", "CR کجی", "کشیدگی", "CR کشیدگی", "نتیجه کجی", "نتیجه کشیدگی"],
      normals.map((x) => [
        x.name,
        fmt(x.skew),
        fmt(x.skewCr),
        fmt(x.kurt),
        fmt(x.kurtCr),
        Math.abs(x.skew) < 3 ? "برقرار" : "برقرار نیست",
        Math.abs(x.kurt) < 10 ? "برقرار" : "برقرار نیست",
      ])
    )
  );
  children.push(docP("معیار کلاین (۲۰۲۳): قدرمطلق کجی < ۳ و قدرمطلق کشیدگی < ۱۰.", { size: 20, color: "666666" }));

  // ۴) مردیا
  children.push(docH("۴) نرمال بودن چندمتغیری (مردیا، سازگار با AMOS)"));
  children.push(
    mardia.valid
      ? docP(`ضریب کشیدگی مردیا: ${faNum(fmt(mardia.kurtosis))} | نسبت بحرانی: ${faNum(fmt(mardia.cr))} — ${Math.abs(mardia.cr) <= AMOS_MARDIA_CR_LIMIT ? "نرمال چندمتغیره برقرار است" : "تخطی از نرمال چندمتغیری"}`)
      : docP(mardia.message)
  );
  children.push(
    docP(`روش محاسبه: نرمال‌سازی فاصله‌ها با n/(n−1) و مرکز نمونهٔ محدود p(p+2)(n−1)/(n+1)، همسان با AMOS؛ معیار بزرگ‌نمونه |CR| ≤ ${AMOS_MARDIA_CR_LIMIT}.`, { size: 20, color: "666666" })
  );

  // ۵) همبستگی
  const addCorrelationDocTable = (title: string, table: CorrelationTableData) => {
    children.push(docH(title));
    children.push(
      docTable(
        ["", ...table.labels],
        table.labels.map((label, i) => [
          label,
          ...table.labels.map((_, j) => {
            if (i === j) return "1";
            if (i < j) return "";
            const value = table.r?.[i]?.[j] ?? NaN;
            const p = table.p?.[i]?.[j] ?? 1;
            return `${fmt(value)}${p < 0.01 ? "**" : p < 0.05 ? "*" : ""}`;
          }),
        ])
      )
    );
  };
  addCorrelationDocTable("۵-۱) همبستگی نمرات کل / گره‌های مدل", corr);
  addCorrelationDocTable("۵-۲) همبستگی نمره کل و زیرمقیاس‌ها", corrAll);
  addCorrelationDocTable("۵-۳) همبستگی فقط زیرمقیاس‌ها (با جایگزینی نمره کل در نبود زیرمقیاس)", corrSubscales);
  const exogenousNodes = nodes.filter((node) => node.role === "exogenous");
  const exogenousCorrelationRows: (string | number)[][] = [];
  for (let i = 0; i < exogenousNodes.length; i++) {
    for (let j = i + 1; j < exogenousNodes.length; j++) {
      const left = exogenousNodes[i];
      const right = exogenousNodes[j];
      const r = corr.r[left.nodeId]?.[right.nodeId] ?? NaN;
      const p = corr.p[left.nodeId]?.[right.nodeId] ?? NaN;
      exogenousCorrelationRows.push([`${left.label} ↔ ${right.label}`, fmt(r), `${fmtP(p)}${starP(p)}`, p < 0.05 ? "معنادار" : "غیرمعنادار"]);
    }
  }
  children.push(docH("۵-۴) معناداری همبستگیِ پیش‌بین‌های برون‌زا"));
  children.push(docTable(["جفت پیش‌بین", "r", "p", "نتیجه"], exogenousCorrelationRows));
  children.push(docP("پیش‌فرض تولید: همهٔ جفت‌های پیش‌بینِ برون‌زا در سطح ۰٫۰۵ معنادار و VIF ماتریس حداکثر ۴ باشد.", { size: 20, color: "666666" }));
  children.push(docP("** p < 0.01 ، * p < 0.05 (دوطرفه؛ حذف زوجی داده‌های گمشده)", { size: 20, color: "666666" }));

  // ۶) VIF / Tolerance و DW — دو جدول مستقل برای جلوگیری از ادغام چند مقدار در یک سلول
  children.push(docH("۶) عدم هم‌خطی چندگانه و استقلال خطاها"));
  children.push(docH("۶-۱) عدم هم‌خطی چندگانه"));
  children.push(docTable(
    ["متغیر وابسته", "پیش‌بین", "تلورانس", "VIF", "نتیجه"],
    regressionDiagnostics.collinearity.map((row) => [
      row.dependentLabel,
      row.predictorLabel,
      fmt(row.tolerance),
      fmt(row.vif),
      row.pass ? "برقرار" : "برقرار نیست",
    ])
  ));
  children.push(docP("معیار: VIF کمتر از ۵ و تلورانس بیشتر از ۰٫۲۰ باشد (تلورانس = ۱/VIF).", { size: 20, color: "666666" }));
  children.push(docH("۶-۲) استقلال خطاها"));
  children.push(docTable(
    ["متغیر وابسته", "دوربین-واتسون", "دامنهٔ قابل قبول", "نتیجه"],
    regressionDiagnostics.independence.map((row) => [
      row.dependentLabel,
      Number.isFinite(row.durbinWatson) ? fmt(row.durbinWatson) : "تعریف‌نشده",
      "۱٫۵ تا ۲٫۵",
      row.pass ? "برقرار" : "برقرار نیست",
    ])
  ));

  // ۷) ضرایب مسیر
  children.push(docH("۷) ضرایب مسیر"));
  children.push(
    docTable(
      ["مسیر", "B", "SE", "t", "p", "β"],
      sem.paths.map((pr) => [
        `${nodeLabel(pr.from)} ← ${nodeLabel(pr.to)}`,
        fmt(pr.b),
        fmt(pr.se),
        fmt(pr.t),
        `${fmtP(pr.p)}${starP(pr.p)}`,
        fmt(pr.std),
      ])
    )
  );
  children.push(docP("* p < 0.05 ، ** p < 0.01 ، *** p < 0.001", { size: 20, color: "666666" }));

  // ۸) اثرات
  children.push(docH("۸) اثرات مستقیم، غیرمستقیم و کل (بوت‌استرپ)"));
  const effectRows: (string | number)[][] = [];
  if (bootResults && bootResults.length) {
    bootResults.forEach((b) => {
      const label = bootPathLabelOf(nodes, vars, b);
      effectRows.push([
        label,
        b.viaVar === null ? fmt(b.direct) : "—",
        fmt(b.indirect),
        fmt(b.lo),
        fmt(b.hi),
        `${fmtP(b.p)}${starP(b.p)}`,
        b.viaVar === null ? fmt(b.total) : "—",
        indirectEffectInterpretation(b.indirect, b.p),
      ]);
    });
  } else {
    sem.effects.forEach((ef) => {
      effectRows.push([
        `${varNameOf(vars, ef.fromVar)} ← ${varNameOf(vars, ef.toVar)}`,
        fmt(ef.direct),
        fmt(ef.indirect),
        "—",
        "—",
        "—",
        fmt(ef.total),
        "بوت‌استرپ اجرا نشده",
      ]);
    });
  }
  children.push(docTable(["مسیر", "مستقیم", "غیرمستقیم استاندارد", "CI پایین", "CI بالا", "p", "کل", "تفسیر"], effectRows));
  children.push(docP("فاصله اطمینان ۹۵٪ با بوت‌استرپ؛ عدم عبور از صفر = معناداری در سطح ۰/۰۵.", { size: 20, color: "666666" }));

  // ۹) R²
  children.push(docH("۹) R² گره‌های درون‌زا"));
  children.push(
    docTable(
      ["گره", "R²", "نتیجه"],
      nodes
        .filter((nd) => nd.role !== "exogenous")
        .map((nd) => [nd.label, fmt(sem.r2[nd.nodeId] ?? 0), (sem.r2[nd.nodeId] ?? 0) >= 0.1 ? "قابل قبول" : "کم"])
    )
  );

  // ۱۰) برازش
  children.push(docH("۱۰) شاخص‌های برازش مدل"));
  if (sem.fit.valid) {
    children.push(
      docTable(
        ["شاخص", "مقدار", "معیار متداول", "تفسیر"],
        fitReportRows(sem.fit).map((row) => [row.index, row.value, row.criterion, row.interpretation])
      )
    );
    if (sem.fit.message) children.push(docP(sem.fit.message, { size: 20, color: "666666" }));
  } else {
    children.push(docP(sem.fit.message ?? "نامشخص"));
  }

  // ۱۱) آلفا
  if (meas.length) {
    children.push(docH("۱۱) مدل اندازه‌گیری (آلفای کرونباخ و بارهای عاملی)"));
    meas.forEach((m) => {
      children.push(docP(`${m.name}: آلفای کرونباخ = ${faNum(fmt(m.alpha))}`, { bold: true }));
      children.push(
        docTable(
          ["شاخص", "بار عاملی"],
          m.subNames.map((s, si) => [s, fmt(m.loadings[si])])
        )
      );
    });
    children.push(docP("معیار پذیرش آلفای کرونباخ ≥ 0.70", { size: 20, color: "666666" }));
  }

  // ۱۲) کلید پاسخ
  if (answerKey) {
    children.push(docH("۱۲) کلید پاسخ (مخصوص استاد)"));
    children.push(
      docTable(
        ["مسیر", "ضریب هدف (β)", "ضریب واقعی (β)", "وضعیت"],
        answerKey.pathTargets.map((pt) => [
          `${nodeLabel(pt.fromNode)} ← ${nodeLabel(pt.toNode)}`,
          fmt(pt.target),
          fmt(pt.actual),
          Math.abs(pt.actual - pt.target) < 0.15 ? "نزدیک به هدف" : "فاصله دارد",
        ])
      )
    );
  }

  return new Document({ sections: [{ children }] });
}


// ------------------------------------------------------------
// کامپوننت اصلی
// ------------------------------------------------------------

function SemTool() {
  // ---------- پروژه‌ها ----------
  const [projects, setProjects] = useState<Project[]>(loadInitialProjects);
  const [projectId, setProjectId] = useState<string | null>(null);
  const currentProject = projects.find((p) => p.id === projectId) ?? null;

  // ---------- state های کاری ----------
  const [source, setSource] = useState<"generate" | "real">("generate");
  const [vars, setVars] = useState<VariableSpec[]>(initialVars);
  const [inactiveArrowIds, setInactiveArrowIds] = useState<Set<string>>(() => new Set());
  const [constraints, setConstraints] = useState<GenConstraints>(defaultConstraints);
  const [n, setN] = useState("250");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(number | null)[][]>([]);
  const [colMap, setColMap] = useState<Record<number, (number | null)[]>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [answerKey, setAnswerKey] = useState<SemAnswerKey | null>(null);
  const [bootResults, setBootResults] = useState<BootResult[] | null>(null);
  const [bootBusy, setBootBusy] = useState(false);
  /** پیشرفتِ زندهٔ بوت‌استرپ: تعداد نمونه‌های انجام‌شده از کل */
  const [bootProgress, setBootProgress] = useState<{ done: number; total: number } | null>(null);
  /** زمانِ صرف‌شده برای آخرین بوت‌استرپ (میلی‌ثانیه) و تعداد رشته‌های موازی */
  const [bootTiming, setBootTiming] = useState<{ ms: number; workers: number; samples: number } | null>(null);
  /** زمانِ سپری‌شدهٔ بوت‌استرپِ جاری (میلی‌ثانیه) — برای نمایشِ زندهٔ تایمر */
  const [bootElapsedMs, setBootElapsedMs] = useState<number | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });
  const [modal, setModal] = useState<ModalState>(null);
  const [showBigDiagram, setShowBigDiagram] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const initialAlpha = defaultAlphaProjectData(initialVars);
  const [wantAlpha, setWantAlpha] = useState(initialAlpha.wantAlpha);
  const [alphaScales, setAlphaScales] = useState<AlphaScale[]>(initialAlpha.scales);
  const [alphaMin, setAlphaMin] = useState(initialAlpha.min);
  const [alphaMax, setAlphaMax] = useState(initialAlpha.max);
  const [alphaCols, setAlphaCols] = useState<string[]>(initialAlpha.columns);
  const [alphaRows, setAlphaRows] = useState<(number | null)[][]>(initialAlpha.rows);
  const [alphaResult, setAlphaResult] = useState<AlphaResultGroup[] | null>(initialAlpha.result);
  const [alphaTab, setAlphaTab] = useState<"training" | "real">(initialAlpha.tab ?? "training");
  const [alphaRealCols, setAlphaRealCols] = useState<string[]>(initialAlpha.realColumns ?? []);
  const [alphaRealRows, setAlphaRealRows] = useState<(number | null)[][]>(initialAlpha.realRows ?? []);
  const [alphaRealResult, setAlphaRealResult] = useState<AlphaResultGroup[] | null>(initialAlpha.realResult ?? null);
  const [alphaStatus, setAlphaStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });
  const [backupModal, setBackupModal] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [backupScope, setBackupScope] = useState<"all" | "one">("all");
  const [projectModal, setProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [diagnoseModal, setDiagnoseModal] = useState(false);
  const [analysisInputs, setAnalysisInputs] = useState<string>("");
  // ---------- وضعیتِ تولید داده (مودالِ پیشرفت + گزارش قیود) ----------
  const [genPhase, setGenPhase] = useState<GenerationPhase>("running");
  const [genOpen, setGenOpen] = useState(false);
  const [genProgress, setGenProgress] = useState<SemGenProgress | null>(null);
  const [genReport, setGenReport] = useState<SemConstraintReport | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const [genAttempts, setGenAttempts] = useState(0);
  const [genCancelled, setGenCancelled] = useState(false);
  const genWorkerRef = useRef<Worker | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const alphaFileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);
  /** تغییر داده/نگاشت SEM، دادهٔ آلفای تولیدی قبلی را نامعتبر می‌کند (دادهٔ واقعی آلفا مستقل می‌ماند). */
  const lastAlphaSemSourceRef = useRef(JSON.stringify({ source, vars, columns, rows, colMap }));
  /** رشته‌های (Worker های) فعالِ بوت‌استرپ — برای اجرای موازی و امکانِ توقف */
  const bootstrapWorkersRef = useRef<Worker[]>([]);

  useEffect(() => {
    return () => {
      bootstrapWorkersRef.current.forEach((worker) => worker.terminate());
      bootstrapWorkersRef.current = [];
      genWorkerRef.current?.terminate();
    };
  }, []);

  // تایمرِ زندهٔ بوت‌استرپ: هر ۲۰۰ میلی‌ثانیه زمانِ سپری‌شده را به‌روز می‌کند
  useEffect(() => {
    if (!bootBusy) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => setBootElapsedMs(Date.now() - startedAt), 200);
    return () => window.clearInterval(timer);
  }, [bootBusy]);

  // ---------- گره‌ها و فلش‌ها ----------
  const nodes = useMemo(() => buildModelNodes(vars), [vars]);
  const allArrows = useMemo(() => buildModelArrows(nodes), [nodes]);
  const arrows = useMemo(() => allArrows.filter((a) => !inactiveArrowIds.has(a.id)), [allArrows, inactiveArrowIds]);
  const connectedVarIds = useMemo(() => {
    const s = new Set<number>();
    arrows.forEach((a) => {
      s.add(a.fromVar);
      s.add(a.toVar);
    });
    return s;
  }, [arrows]);
  const modelVars = useMemo(() => vars.filter((v) => connectedVarIds.has(v.id)), [vars, connectedVarIds]);
  const modelNodes = useMemo(() => buildModelNodes(modelVars), [modelVars]);
  const modelArrows = arrows;
  const isolatedVars = vars.filter((v) => !connectedVarIds.has(v.id));
  const nodeLabel = useCallback((id: number) => nodes.find((x) => x.nodeId === id)?.label ?? `گره ${id}`, [nodes]);

  const analysisValid =
    !!analysis &&
    analysis.nodeIds.length === modelNodes.length &&
    analysis.nodeIds.every((id, i) => id === modelNodes[i].nodeId);
  const regressionDiagnostics = analysisValid && analysis
    ? buildSemRegressionDiagnostics(modelNodes, analysis.sem)
    : null;

  const inputsChangedSinceAnalysis = useMemo(() => {
    if (!analysisValid) return false;
    const current = JSON.stringify({ source, vars, inactiveArrowIds: [...inactiveArrowIds], constraints, n, rows, columns });
    return analysisInputs !== current;
  }, [analysisValid, analysisInputs, source, vars, inactiveArrowIds, constraints, n, rows, columns]);

  const hasLatent = vars.some((v) => v.subscales.length > 0 && v.hasTotal);
  const modeLabel = hasLatent ? "مدل معادلات ساختاری (SEM) — با متغیر پنهان (مکنون)" : "تحلیل مسیر — متغیرهای مشاهده‌شده";
  const varName = useCallback((id: number) => varNameOf(vars, id), [vars]);

  // ---------- مراحل استپر ----------
  const steps = useMemo(() => {
    const list: { id: string; label: string; short?: string }[] = [
      { id: "project", label: "پروژه", short: "پروژه" },
      { id: "source", label: "منبع داده", short: "منبع" },
      { id: "variables", label: "مشخصات متغیرها", short: "متغیرها" },
      { id: "draw", label: "ترسیم مدل", short: "مدل" },
    ];
    if (source === "generate") {
      list.push({ id: "constraints", label: "قیود تولید داده", short: "قیود" });
      list.push({ id: "diagnose", label: "تشخیص", short: "تشخیص" });
    }
    list.push(
      { id: "data", label: "جدول داده‌ها", short: "داده" },
      { id: "analysis", label: "تحلیل", short: "تحلیل" },
      { id: "assumptions", label: "بررسی پیش‌فرض‌ها", short: "پیش‌فرض" },
      { id: "descriptive", label: "یافته‌های توصیفی", short: "توصیفی" },
      { id: "diagram", label: "دیاگرام مدل", short: "دیاگرام" },
      { id: "inferential", label: "یافته‌های استنباطی", short: "استنباطی" }
    );
    list.push({ id: "alpha", label: "آلفای کرونباخ", short: "آلفا" });
    list.push({ id: "report", label: "نگارش گزارش", short: "گزارش" });
    list.push({ id: "save", label: "ذخیره", short: "ذخیره" });
    return list;
  }, [source]);

  const stepIdx = (id: string) => steps.findIndex((s) => s.id === id);
  const currentStep = Math.min(activeStep, steps.length - 1);

  // مراحل وابسته به تحلیل (فقط بعد از اجرای تحلیل سبز می‌شوند)
  const analysisSteps = new Set(["assumptions", "descriptive", "diagram", "inferential", "alpha"]);

  const stepStatuses: StepStatus[] = useMemo(() => {
    return steps.map((s, i) => {
      if (i === currentStep) return "current";
      if (i > currentStep) return "pending";
      if (analysisSteps.has(s.id)) {
        return completed[s.id] && analysisValid ? "done" : "analysis";
      }
      return completed[s.id] ? "done" : "pending";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, currentStep, analysisValid, completed]);

  const goToStep = (i: number) => {
    if (i >= 0 && i <= currentStep) setActiveStep(i);
  };

  const markDone = (stepId: string) => {
    setCompleted((prev) => (prev[stepId] ? prev : { ...prev, [stepId]: true }));
  };

  const goNext = () => {
    const cur = Math.min(activeStep, steps.length - 1);
    const stepId = steps[cur]?.id ?? "";
    if (stepId === "diagnose") {
      // مودال تولید داده
      if (rows.length) {
        setDiagnoseModal(true);
      } else {
        setDiagnoseModal(true);
      }
      return;
    }
    if (stepId === "data" || stepId === "analysis") {
      // قبل از رفتن به مراحل تحلیل‌محور، اعتبارسنجی داده
      const problems = validateData();
      if (problems.length) {
        setModal({ ok: false, lines: problems });
        return;
      }
    }
    if (stepId === "alpha" && wantAlpha) {
      try {
        materializeAlphaScales(alphaScales);
      } catch (error) {
        const message = (error as Error).message;
        setAlphaStatus({ text: message, kind: "err" });
        setModal({ ok: false, lines: [message] });
        return;
      }
    }
    markDone(stepId);
    setActiveStep(Math.min(cur + 1, steps.length - 1));
  };

  const goPrev = () => {
    const cur = Math.min(activeStep, steps.length - 1);
    setActiveStep(Math.max(cur - 1, 0));
  };

  // تشخیص تغییر در ورودی‌ها → مراحل بعدی ناقص می‌شوند
  const lastInputsRef = useRef<string>("");
  useEffect(() => {
    const snapshot = JSON.stringify({ source, vars, inactiveArrowIds: [...inactiveArrowIds], constraints, n, rows, columns });
    if (lastInputsRef.current && lastInputsRef.current !== snapshot) {
      const t = setTimeout(() => {
        setCompleted((prev) => {
          const next: Record<string, boolean> = {};
          const inputSteps = new Set(steps.slice(0, stepIdx("diagnose")).map((s) => s.id));
          Object.keys(prev).forEach((k) => {
            if (inputSteps.has(k) || k === "diagnose") next[k] = true;
          });
          return next;
        });
      }, 0);
      lastInputsRef.current = snapshot;
      return () => clearTimeout(t);
    }
    lastInputsRef.current = snapshot;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, vars, inactiveArrowIds, constraints, n, rows, columns]);

  // ---------- اعتبارسنجی داده ----------
  const validateData = (): string[] => {
    const problems: string[] = [];
    if (!rows.length) {
      problems.push("داده‌ای وجود ندارد؛ ابتدا داده تولید یا وارد کنید.");
      return problems;
    }
    if (source === "real") {
      problems.push(...validateRealSemData(rows, columns, vars, colMap));
    }

    // گره‌های بی‌اعتبار
    for (const nd of modelNodes) {
      const col = computeNodeCols(rows, vars, modelNodes, colMap).nodeCols[nd.nodeId] ?? [];
      const validCount = col.filter(Number.isFinite).length;
      if (validCount === 0) {
        problems.push(`متغیر «${nd.label}» هیچ داده معتبری ندارد؛ نگاشت ستون‌ها را بررسی کنید.`);
      } else if (validCount < 10) {
        problems.push(`متغیر «${nd.label}» فقط ${validCount} داده معتبر دارد (حداقل ۱۰ لازم است).`);
      }
    }
    // داده گمشده (وقتی تولید با missing عمدی نداریم)
    if (source === "generate" && constraints.missingPct === 0) {
      const missingCols = columns
        .map((col, i) => ({ col, count: rows.filter((r) => r[i] == null || !Number.isFinite(r[i])).length }))
        .filter((m) => m.count > 0);
      if (missingCols.length) {
        problems.push(
          `داده گمشده یافت شد: ${missingCols.map((m) => `${m.col} (${m.count})`).join("، ")} — سلول‌ها را کامل کنید.`
        );
      }
    }
    return problems;
  };

  // ---------- اعمال/ذخیره پروژه ----------
  const applyProjectData = useCallback((data: ProjectData) => {
    bootstrapWorkersRef.current.forEach((worker) => worker.terminate());
    bootstrapWorkersRef.current = [];
    setBootBusy(false);
    setSource(data.source);
    setVars(data.vars);
    setInactiveArrowIds(new Set(data.inactiveArrowIds ?? []));
    setConstraints(normalizeConstraints(data.constraints));
    setN(data.n ?? "250");
    setColumns(data.columns ?? []);
    setRows(data.rows ?? []);
    setColMap(data.colMap ?? {});
    lastAlphaSemSourceRef.current = JSON.stringify({
      source: data.source,
      vars: data.vars,
      columns: data.columns ?? [],
      rows: data.rows ?? [],
      colMap: data.colMap ?? {},
    });
    const alpha = cloneAlphaProjectData(data.alpha ?? defaultAlphaProjectData(data.vars), data.vars);
    setWantAlpha(alpha.wantAlpha);
    setAlphaScales(alpha.scales);
    setAlphaMin(alpha.min);
    setAlphaMax(alpha.max);
    setAlphaCols(alpha.columns);
    setAlphaRows(alpha.rows);
    setAlphaResult(alpha.result);
    setAlphaTab(alpha.tab ?? "training");
    setAlphaRealCols(alpha.realColumns ?? []);
    setAlphaRealRows(alpha.realRows ?? []);
    setAlphaRealResult(alpha.realResult ?? null);
    setAlphaStatus({ text: "", kind: "" });
    setAnalysis(null);
    setAnswerKey(null);
    setBootResults(null);
  }, []);

  // بارگذاری اولین پروژه هنگام شروع
  useEffect(() => {
    const t = setTimeout(() => {
      if (!projectId && projects.length) {
        const first = projects[0];
        setProjectId(first.id);
        applyProjectData(first.data);
      }
    }, 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ذخیره خودکار پروژه فعلی
  useEffect(() => {
    if (!projectId) return;
    const t = setTimeout(() => {
      setProjects((prev) => {
        const next = prev.map((p) =>
          p.id === projectId
            ? {
                ...p,
                updatedAt: new Date().toISOString(),
                data: {
                  source,
                  vars,
                  inactiveArrowIds: [...inactiveArrowIds],
                  constraints,
                  n,
                  columns,
                  rows,
                  colMap,
                  alpha: {
                    wantAlpha,
                    tab: alphaTab,
                    scales: alphaScales,
                    n: "",
                    min: alphaMin,
                    max: alphaMax,
                    columns: alphaCols,
                    rows: alphaRows,
                    result: alphaResult,
                    realColumns: alphaRealCols,
                    realRows: alphaRealRows,
                    realResult: alphaRealResult,
                  },
                },
              }
            : p
        );
        saveProjects(next);
        return next;
      });
    }, 100);
    return () => clearTimeout(t);
  }, [
    projectId,
    source,
    vars,
    inactiveArrowIds,
    constraints,
    n,
    columns,
    rows,
    colMap,
    wantAlpha,
    alphaScales,
    alphaMin,
    alphaMax,
    alphaCols,
    alphaRows,
    alphaResult,
    alphaTab,
    alphaRealCols,
    alphaRealRows,
    alphaRealResult,
  ]);

  // همگام‌سازی متغیرها با localStorage برای صفحه آلفا
  useEffect(() => {
    try {
      localStorage.setItem("amarist-sem-vars", JSON.stringify(vars));
    } catch {
      // ignore
    }
    const timer = setTimeout(() => {
      setAlphaScales((previous) =>
        vars.map((variable) => {
          const existing = previous.find((scale) => scale.varId === variable.id);
          return alphaScaleForVariable(variable, existing);
        })
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [vars]);

  useEffect(() => {
    const snapshot = JSON.stringify({ source, vars, columns, rows, colMap });
    if (lastAlphaSemSourceRef.current !== snapshot) {
      lastAlphaSemSourceRef.current = snapshot;
      const timer = window.setTimeout(() => {
        setAlphaCols([]);
        setAlphaRows([]);
        setAlphaResult(null);
        setAlphaStatus((previous) => previous.kind
          ? { text: "داده یا نگاشت SEM تغییر کرد؛ گویه‌های آموزشی آلفا باید دوباره تولید شوند.", kind: "" }
          : previous);
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [source, vars, columns, rows, colMap]);

  const switchProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
    bootstrapWorkersRef.current.forEach((worker) => worker.terminate());
    bootstrapWorkersRef.current = [];
    setBootBusy(false);
    setProjectId(id);
    applyProjectData(p.data);
    setActiveStep(0);
    setStatus({ text: `پروژه «${p.name}» بارگذاری شد.`, kind: "ok" });
  };

  const createProject = () => {
    const name = newProjectName.trim() || `پروژه ${projects.length + 1}`;
    const p: Project = { id: uid(), name, updatedAt: new Date().toISOString(), data: defaultProjectData() };
    setProjects((prev) => {
      const next = [...prev, p];
      saveProjects(next);
      return next;
    });
    setProjectModal(false);
    setNewProjectName("");
    setProjectId(p.id);
    applyProjectData(p.data);
    setActiveStep(0);
  };

  const deleteProject = (id: string) => {
    if (projects.length <= 1) {
      setStatus({ text: "حداقل یک پروژه باید وجود داشته باشد.", kind: "err" });
      return;
    }
    const remaining = projects.filter((p) => p.id !== id);
    setProjects(remaining);
    saveProjects(remaining);
    if (projectId === id) {
      const next = remaining[0];
      setProjectId(next.id);
      applyProjectData(next.data);
      setActiveStep(0);
    }
  };

  // ---------- تغییر متغیرها ----------
  const updateVar = (id: number, patch: Partial<VariableSpec>) => {
    setVars((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addVar = () => {
    const id = vars.length ? Math.max(...vars.map((v) => v.id)) + 1 : 0;
    setVars((prev) => [
      ...prev,
      { id, name: `متغیر ${prev.length + 1}`, role: "outcome" as Role, hasTotal: true, totalMin: 1, totalMax: 5, subscales: [] },
    ]);
    setStatus({ text: "متغیر جدید اضافه شد.", kind: "ok" });
  };

  const removeVar = (id: number) => {
    const target = vars.find((v) => v.id === id);
    const remaining = vars.filter((v) => v.id !== id);
    if (!target) return;
    if (target.role === "exogenous" && !remaining.some((v) => v.role === "exogenous")) {
      setModal({ ok: false, lines: ["حذف ممکن نیست: برای شکل‌گیری مدل حداقل یک متغیر برون‌زا (X) لازم است."] });
      return;
    }
    if (target.role === "outcome" && !remaining.some((v) => v.role === "outcome")) {
      setModal({ ok: false, lines: ["حذف ممکن نیست: برای شکل‌گیری مدل حداقل یک متغیر درون‌زا (Y) لازم است."] });
      return;
    }
    if (target.role === "mediator" && !remaining.some((v) => v.role === "mediator")) {
      setModal({
        ok: false,
        lines: [
          "با حذف این متغیر، هیچ میانجی (M) باقی نمی‌ماند و مدل بدون مسیر غیرمستقیم می‌شود.",
          "اگر مطمئن هستید، ابتدا نقش یک متغیر دیگر را به «میانجی» تغییر دهید.",
        ],
      });
      return;
    }
    setVars((prev) => prev.filter((v) => v.id !== id));
    setColMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setConstraints((prev) => {
      const pathTargets = { ...prev.pathTargets };
      Object.keys(pathTargets).forEach((k) => {
        const [f, t] = k.split(":").map(Number);
        if (f === id || t === id) delete pathTargets[k];
      });
      const indirectTargets = { ...prev.indirectTargets };
      Object.keys(indirectTargets).forEach((k) => {
        const parts = k.split(":").map(Number);
        if (parts.includes(id)) delete indirectTargets[k];
      });
      return { ...prev, pathTargets, indirectTargets };
    });
    setInactiveArrowIds(new Set());
    setAnalysis(null);
    setAnswerKey(null);
    setBootResults(null);
  };

  const addSubscale = (id: number) => {
    setVars((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, subscales: [...v.subscales, { name: `زیرمقیاس ${v.subscales.length + 1}`, min: 1, max: 5 }] }
          : v
      )
    );
  };

  const removeSubscale = (id: number, idx: number) => {
    setVars((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const subscales = v.subscales.filter((_, i) => i !== idx);
        // اگر زیرمقیاسی باقی نماند، نمره کل اجباری می‌شود
        return subscales.length === 0 ? { ...v, subscales, hasTotal: true } : { ...v, subscales };
      })
    );
  };

  const setSubscaleName = (id: number, idx: number, name: string) => {
    setVars((prev) =>
      prev.map((v) => (v.id === id ? { ...v, subscales: v.subscales.map((s, i) => (i === idx ? { ...s, name } : s)) } : v))
    );
  };

  const setSubscaleRange = (id: number, idx: number, field: "min" | "max", value: number) => {
    setVars((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, subscales: v.subscales.map((s, i) => (i === idx ? { ...s, [field]: value } : s)) } : v
      )
    );
  };

  const setPathTarget = (key: string, patch: Partial<PathTarget>) => {
    setConstraints((prev) => ({
      ...prev,
      pathTargets: { ...prev.pathTargets, [key]: { ...prev.pathTargets[key], ...patch } },
    }));
  };

  /**
   * قیدِ اختصاصیِ یک زیرمقیاس (برای پرسشنامه‌های غیرجمع‌پذیر) — بر قیدِ سطحِ متغیر مقدم است.
   * «base» همان مقادیری است که در جدول نمایش داده می‌شود (با احتسابِ وراثت از سطحِ متغیر)؛
   * ذخیرهٔ آن باعث می‌شود نخستین تغییرِ کاربر روی یک زیرمقیاس، تنظیماتِ سطحِ متغیر را
   * از جای دیگری عوض نکند.
   */
  const setNodePathTarget = (key: string, patch: Partial<PathTarget>, base: PathTarget) => {
    setConstraints((prev) => {
      const current: PathTarget = prev.nodePathTargets?.[key] ?? base;
      return {
        ...prev,
        nodePathTargets: { ...(prev.nodePathTargets ?? {}), [key]: { ...current, ...patch } },
      };
    });
  };

  const setIndirectTarget = (key: string, patch: Partial<IndirectConstraint>) => {
    setConstraints((prev) => ({
      ...prev,
      indirectTargets: {
        ...prev.indirectTargets,
        [key]: { ...defaultIndirectConstraint(), ...prev.indirectTargets[key], ...patch },
      },
    }));
  };

  const setFitRange = (key: keyof SemFitConstraints, field: "min" | "max", value: number | null) => {
    setConstraints((prev) => ({
      ...prev,
      fit: {
        ...prev.fit,
        [key]: { ...prev.fit[key], [field]: value },
      },
    }));
  };

  // ---------- بوت‌استرپ ----------
  const runBootstrap = useCallback(
    (
      nodeColsArg?: number[][],
      nBoot?: number,
      silent = false,
      measurementColsArg?: SemMeasurementColumns,
      onProgress?: (done: number, total: number) => void
    ) => {
      const comps = nodeColsArg ?? analysis?.nodeCols;
      if (!comps) return;
      const measurements: SemMeasurementColumns = measurementColsArg ?? {};
      if (!measurementColsArg && analysis) {
        modelNodes.forEach((node) => {
          const indicators = analysis.indicatorCols[node.varId] ?? [];
          measurements[node.nodeId] = node.kind === "total" && indicators.length ? indicators : [comps[node.nodeId]];
        });
      }
      const bootN = nBoot ?? constraints.bootSamples;
      const useMl = Object.keys(measurements).length > 0;
      bootstrapWorkersRef.current.forEach((worker) => worker.terminate());
      bootstrapWorkersRef.current = [];
      setBootBusy(true);
      setBootProgress({ done: 0, total: bootN });
      setBootTiming(null);
      setBootElapsedMs(null);
      const startedAt = typeof performance !== "undefined" ? performance.now() : Date.now();
      if (!silent) setStatus({ text: `در حال اجرای بوت‌استرپ با ${bootN} نمونه...`, kind: "" });

      const sem = estimateSem(
        modelNodes,
        modelArrows,
        comps,
        useMl ? measurements : undefined,
        useMl ? "ml" : "approx"
      );

      /**
       * اثر مستقیمِ یک «واحد» (متغیر یا زیرمقیاس). برای متغیرِ غیرجمع‌پذیر، اثرِ مستقیمِ
       * هر زیرمقیاس باید جداگانه جمع شود — درست همان‌طور که در جدولِ نتایج نمایش می‌یابد.
       */
      const directOf = (fromVar: number, toVar: number, fromNode: number | null, toNode: number | null) =>
        sem.paths
          .filter((path) => {
            const from = modelNodes.find((node) => node.nodeId === path.from);
            const to = modelNodes.find((node) => node.nodeId === path.to);
            if (!from || !to || from.varId !== fromVar || to.varId !== toVar) return false;
            if (fromNode != null && from.nodeId !== fromNode) return false;
            if (toNode != null && to.nodeId !== toNode) return false;
            return true;
          })
          .reduce((sum, path) => sum + (Number.isFinite(path.std) ? path.std : 0), 0);

      const finish = (
        raw: {
          fromVar: number;
          toVar: number;
          viaVar: number | null;
          fromNode?: number | null;
          viaNode?: number | null;
          toNode?: number | null;
          indirect: number;
          lo: number;
          hi: number;
          p: number;
          usable?: number;
          requested?: number;
        }[],
        workersUsed = 1
      ) => {
        const results: BootResult[] = raw.map((result) => ({
          fromVar: result.fromVar,
          toVar: result.toVar,
          viaVar: result.viaVar,
          fromNode: result.fromNode ?? null,
          viaNode: result.viaNode ?? null,
          toNode: result.toNode ?? null,
          direct:
            result.viaVar === null
              ? directOf(result.fromVar, result.toVar, result.fromNode ?? null, result.toNode ?? null)
              : 0,
          indirect: result.indirect,
          lo: result.lo,
          hi: result.hi,
          p: result.p,
          total:
            result.viaVar === null
              ? directOf(result.fromVar, result.toVar, result.fromNode ?? null, result.toNode ?? null) + result.indirect
              : NaN,
          usable: result.usable ?? null,
          requested: result.requested ?? null,
        }));
        setBootResults(results);
        setBootBusy(false);
        setBootProgress(null);
        const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
        setBootTiming({ ms: elapsed, workers: workersUsed, samples: bootN });
        if (!silent) {
          setStatus({
            text: `بوت‌استرپ با ${bootN} نمونه در ${(elapsed / 1000).toFixed(1)} ثانیه تکمیل شد.`,
            kind: "ok",
          });
        }
      };
      const fail = (message: string) => {
        bootstrapWorkersRef.current.forEach((worker) => worker.terminate());
        bootstrapWorkersRef.current = [];
        setBootBusy(false);
        setBootProgress(null);
        setStatus({ text: message, kind: "err" });
        if (!silent) setModal({ ok: false, lines: [message] });
      };

      /** شروعِ گرم: پارامترها و وارونِ هسی‌ینِ برآوردِ نمونهٔ کامل */
      const seed =
        useMl && sem.parameterVector?.length
          ? {
              parameterVector: sem.parameterVector,
              paths: sem.paths.map((path) => ({ from: path.from, to: path.to, std: path.std })),
              inverseHessian: sem.inverseHessian ?? null,
            }
          : undefined;

      /**
       * اجرای موازی: نمونه‌ها بین چند Worker تقسیم می‌شود (به تعدادِ هسته‌های در دسترس،
       * حداکثر ۸). این کار زمانِ بوت‌استرپ را تقریباً به اندازهٔ تعدادِ رشته‌ها کم می‌کند؛
       * ادغامِ نمونه‌ها پیش از محاسبهٔ فاصلهٔ اطمینان انجام می‌شود، بنابراین نتیجه با
       * اجرای تک‌رشته‌ای یکسان است.
       */
      if (useMl && typeof Worker !== "undefined") {
        try {
          const hardware = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 4 : 4;
          const workerCount = Math.max(1, Math.min(8, hardware, bootN));
          const base = Math.floor(bootN / workerCount);
          const remainder = bootN - base * workerCount;
          const chunks = Array.from({ length: workerCount }, (_, index) => base + (index < remainder ? 1 : 0)).filter(
            (count) => count > 0
          );
          const collected: MlIndirectBootstrapSamples[] = [];
          const doneCounts = new Array(chunks.length).fill(0);
          let settled = 0;
          let failed = false;
          const workers: Worker[] = [];
          chunks.forEach((count, index) => {
            const worker = new Worker(new URL("../../../workers/sem-bootstrap.worker.ts", import.meta.url), {
              type: "module",
            });
            workers.push(worker);
            worker.onmessage = (
              event: MessageEvent<
                | { type: "progress"; done: number; total: number }
                | { type: "done"; ok: boolean; samples?: MlIndirectBootstrapSamples; error?: string }
              >
            ) => {
              if (failed) return;
              if (event.data.type === "progress") {
                doneCounts[index] = event.data.done;
                const totalDone = doneCounts.reduce((sum, value) => sum + value, 0);
                setBootProgress({ done: totalDone, total: bootN });
                onProgress?.(totalDone, bootN);
                return;
              }
              settled += 1;
              if (event.data.ok && event.data.samples) collected.push(event.data.samples);
              else if (!failed) {
                failed = true;
                bootstrapWorkersRef.current.forEach((item) => item.terminate());
                bootstrapWorkersRef.current = [];
                fail(event.data.error ?? "بوت‌استرپ ML ناموفق بود.");
                return;
              }
              if (settled === chunks.length && !failed) {
                workers.forEach((item) => item.terminate());
                const first = collected[0];
                if (!first || !first.definitions.length) {
                  setBootResults([]);
                  setBootBusy(false);
                  setBootProgress(null);
                  const elapsed = (typeof performance !== "undefined" ? performance.now() : Date.now()) - startedAt;
                  setBootTiming({ ms: elapsed, workers: chunks.length, samples: bootN });
                  return;
                }
                // ادغامِ نمونه‌های همهٔ رشته‌ها، سپس محاسبهٔ یک‌جای فاصلهٔ اطمینان
                const merged: number[][] = first.effects.map((_, rowIndex) =>
                  collected.flatMap((item) => item.effects[rowIndex] ?? [])
                );
                const rows = summarizeMlIndirect(first.definitions, merged, bootN).map((result) => ({
                  fromVar: result.fromVar,
                  toVar: result.toVar,
                  viaVar: result.viaVar,
                  fromNode: result.fromNode,
                  viaNode: result.viaNode,
                  toNode: result.toNode,
                  indirect: result.indirect,
                  lo: result.lo,
                  hi: result.hi,
                  p: result.p,
                  usable: result.usable,
                  requested: result.requested,
                }));
                bootstrapWorkersRef.current = [];
                finish(rows, chunks.length);
              }
            };
            worker.onerror = (event) => {
              if (failed) return;
              failed = true;
              workers.forEach((item) => item.terminate());
              bootstrapWorkersRef.current = [];
              fail(event.message || "خطا در Worker بوت‌استرپ ML.");
            };
            worker.postMessage({
              nodes: modelNodes,
              arrows: modelArrows,
              nodeColumns: comps,
              measurementColumns: measurements,
              samples: count,
              seed,
            });
          });
          bootstrapWorkersRef.current = workers;
          return;
        } catch {
          // اگر Worker در مرورگر پشتیبانی نشود، مسیر همگام فقط با درخواست صریح کاربر اجرا می‌شود.
        }
      }

      setTimeout(() => {
        try {
          const raw = bootstrapIndirectEffects(
            modelNodes,
            modelArrows,
            comps,
            bootN,
            useMl ? measurements : undefined,
            useMl ? "ml" : "approx",
            (done, total) => {
              setBootProgress({ done, total });
              onProgress?.(done, total);
            }
          );
          finish(raw);
        } catch (error) {
          fail((error as Error).message);
        }
      }, 30);
    },
    [analysis, constraints.bootSamples, modelNodes, modelArrows]
  );


  /**
   * یادداشتِ شفاف دربارهٔ نمونه‌های کنارگذاشته‌شده: اگر در برخی نمونه‌های بازنمونه‌گیری
   * هم‌خطیِ شدید باعثِ جوابِ نامناسب شود، آن نمونه‌ها کنار گذاشته می‌شوند و باید گزارش شوند.
   */
  const bootUsableNote = useMemo(() => {
    if (!bootResults) return null;
    const withCounts = bootResults.filter((b) => b.usable != null && b.requested != null);
    if (!withCounts.length) return null;
    const usable = Math.min(...withCounts.map((b) => b.usable ?? 0));
    const requested = Math.max(...withCounts.map((b) => b.requested ?? 0));
    if (!(requested > 0) || usable >= requested) return null;
    return `از ${faNum(requested)} نمونهٔ بوت‌استرپ، ${faNum(usable)} نمونه معتبر بود؛ ${faNum(
      requested - usable
    )} نمونه به‌دلیلِ هم‌خطیِ بسیار شدید (ضریب استانداردِ ناممکن) کنار گذاشته شد — رفتاری مشابه AMOS با نمونه‌های ناهمگرا.`;
  }, [bootResults]);

  // ---------- تحلیل ----------
  const analyze = useCallback(
    (
      rowsArg?: (number | null)[][],
      mapArg?: Record<number, (number | null)[]>,
      colsArg?: string[],
      openModal = false
    ) => {
      const r = rowsArg ?? rows;
      const cm = mapArg ?? colMap;
      const c = colsArg ?? columns;
      try {
        if (!r.length) throw new Error("داده‌ای وجود ندارد؛ ابتدا داده تولید یا وارد کنید.");
        if (source === "real") {
          const realDataProblems = validateRealSemData(r, c, vars, cm);
          if (realDataProblems.length) throw new Error(realDataProblems.join("\n"));
        }
        const { nodeCols, indicatorCols } = computeNodeCols(r, vars, modelNodes, cm);
        if (nodeCols.some((col) => col.every((v) => !Number.isFinite(v)))) {
          throw new Error("حداقل یکی از گره‌ها داده معتبر ندارد؛ نگاشت ستون‌ها را بررسی کنید.");
        }
        const measurementCols: SemMeasurementColumns = {};
        modelNodes.forEach((node) => {
          const indicators = indicatorCols[node.varId] ?? [];
          measurementCols[node.nodeId] = node.kind === "total" && indicators.length ? indicators : [nodeCols[node.nodeId]];
        });
        const sem = estimateSem(modelNodes, modelArrows, nodeCols, measurementCols, "ml");
        if (modelNodes.some((node) => (measurementCols[node.nodeId]?.length ?? 0) > 1) && sem.estimator !== "ml") {
          throw new Error("برآورد هم‌زمان ML همگرا نشد؛ برای جلوگیری از گزارش خروجی غیرهم‌ارز با AMOS، نتیجه تقریبی نمایش داده نشد.");
        }
        const correlationTables = buildCorrelationTables(vars, modelNodes, nodeCols, indicatorCols);
        const observedForAssumptions = modelNodes.flatMap((node) => {
          const variable = vars.find((item) => item.id === node.varId);
          const observed = measurementCols[node.nodeId] ?? [nodeCols[node.nodeId]];
          return observed.map((column, index) => ({
            name:
              observed.length > 1
                ? `${variable?.name ?? node.label} — ${variable?.subscales[index]?.name ?? `شاخص ${index + 1}`}`
                : node.label,
            column,
          }));
        });
        const assumptionColumns = observedForAssumptions.map((item) => item.column);
        const maha = mahalanobisDistances(assumptionColumns);
        const mardia = mardiaTest(assumptionColumns);
        const missing = c.map((col, i) => ({
          col,
          count: r.filter((row) => row[i] == null || !Number.isFinite(row[i])).length,
        }));
        const normals = observedForAssumptions.map((item) => {
          const validCount = item.column.filter(Number.isFinite).length;
          const skew = skewness(item.column);
          const kurt = kurtosis(item.column);
          return {
            name: item.name,
            skew,
            skewCr: validCount > 0 ? skew / Math.sqrt(6 / validCount) : NaN,
            kurt,
            kurtCr: validCount > 0 ? kurt / Math.sqrt(24 / validCount) : NaN,
          };
        });
        const meas = vars
          .filter((v) => (indicatorCols[v.id]?.length ?? 0) >= 2)
          .map((v) => ({
            varId: v.id,
            name: v.name,
            alpha: cronbachAlpha(indicatorCols[v.id]),
            loadings:
              sem.measurementLoadings
                ?.filter((loading) => modelNodes.find((node) => node.nodeId === loading.nodeId)?.varId === v.id)
                .sort((left, right) => left.indicatorIndex - right.indicatorIndex)
                .map((loading) => loading.std) ?? pcaLoadings(indicatorCols[v.id]),
            subNames: v.subscales.map((s) => s.name),
          }));
        setAnalysisInputs(JSON.stringify({ source, vars, inactiveArrowIds: [...inactiveArrowIds], constraints, n, rows: r, columns: c }));
        setAnalysis({
          nodeIds: modelNodes.map((nd) => nd.nodeId),
          nodeCols,
          indicatorCols,
          sem,
          corr: correlationTables.totals,
          corrAll: correlationTables.all,
          corrSubscales: correlationTables.subscales,
          maha,
          mardia,
          missing,
          normals,
          meas,
        });
        setBootResults(null);
        setStatus({ text: "تحلیل با موفقیت اجرا شد.", kind: "ok" });
        if (openModal) {
          const sigCount = sem.paths.filter((p) => p.p < 0.05).length;
          setModal({
            ok: true,
            lines: [
              `تعداد موارد: ${r.length} | تعداد متغیرها/زیرمقیاس‌ها: ${modelNodes.length}`,
              `مسیرهای معنادار: ${sigCount} از ${sem.paths.length}`,
              sem.fit.valid
                ? `برازش: χ²=${fmt(sem.fit.chi2)} | df=${sem.fit.df} | p=${fmtP(sem.fit.pValue)} | CMIN/df=${fmtChi2Df(sem.fit)} | RMSEA=${fmt(sem.fit.rmsea)} | CFI=${fmt(sem.fit.cfi)}`
                : `برازش: ${sem.fit.message ?? "نامشخص"}`,
              modelNodes
                .filter((nd) => nd.role !== "exogenous")
                .map((nd) => `${nd.label}: R²=${fmt(sem.r2[nd.nodeId] ?? 0)}`)
                .join(" | "),
              sem.warnings.length ? `هشدار: ${sem.warnings[0]}` : "همه پیش‌فرض‌ها بررسی شدند.",
            ],
          });
        }
        // بوت‌استرپِ اثرات مستقیم/غیرمستقیم/کل به‌صورت خودکار و بلافاصله بعد از تحلیل اجرا می‌شود
        // (هم برای داده تولیدی — تا با قیود تطبیق داده شود — و هم برای داده واقعی).
        // دکمهٔ «اجرای بوت‌استرپ» همچنان باقی است تا کاربر بتواند دوباره نمونه‌گیری کند.
        const anyMediator = modelNodes.some((node) => node.role === "mediator");
        const anyOutcome = modelNodes.some((node) => node.role === "outcome");
        if (anyMediator && anyOutcome) {
          runBootstrap(nodeCols, constraints.bootSamples, true, measurementCols);
        }
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
        if (openModal) setModal({ ok: false, lines: [(err as Error).message] });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, colMap, columns, vars, modelNodes, modelArrows, constraints.bootSamples, runBootstrap, setModal, source, inactiveArrowIds, constraints, n, setAnalysisInputs]
  );

  // ---------- تولید داده (چندتلاشه + مودالِ پیشرفت + گزارش قیود) ----------
  const genCancelRef = useRef(false);

  const generate = useCallback(() => {
    const nn = Math.round(Number(n));
    if (!Number.isFinite(nn) || nn < 20) {
      setStatus({ text: "حجم نمونه باید عددی بزرگ‌تر از ۲۰ باشد.", kind: "err" });
      setGenError("حجم نمونه باید عددی بزرگ‌تر از ۲۰ باشد.");
      setGenPhase("error");
      setGenOpen(true);
      return;
    }

    const input = { n: nn, variables: modelVars, arrows: modelArrows, constraints };
    const maxAttempts = constraints.maxAttempts || DEFAULT_MAX_ATTEMPTS;

    // --- بازنشانیِ وضعیتِ مودال ---
    genCancelRef.current = false;
    setGenOpen(true);
    setGenPhase("running");
    setGenProgress(null);
    setGenReport(null);
    setGenError(null);
    setGenAttempts(0);
    setGenCancelled(false);
    setStatus({ text: "در حال تولید داده...", kind: "" });

    const finish = (out: SemGenOutput) => {
      setColumns(out.columns);
      setRows(out.rows);
      setColMap(autoMap(out.columns, vars));
      setAnswerKey(out.answerKey);
      setGenAttempts(out.attempts);
      setGenReport(out.report);
      setGenCancelled(out.cancelled);
      setGenPhase("done");
      const cm = autoMap(out.columns, vars);
      analyze(out.rows, cm, out.columns, true);
      // پیامِ وضعیت بعد از analyze ست می‌شود تا هم نتیجهٔ تولید و هم نتیجهٔ تحلیل را داشته باشد
      setStatus({
        text: out.success
          ? `داده تولید و تحلیل شد — همهٔ ${out.report.total} قید رعایت شد (${out.attempts} تلاش).`
          : `داده تولید و تحلیل شد اما ${out.report.failed} قید از ${out.report.total} قید رعایت نشد (${out.attempts} تلاش).`,
        kind: out.success ? "ok" : "err",
      });
    };

    const fail = (message: string) => {
      setGenError(message);
      setGenPhase("error");
      setStatus({ text: message, kind: "err" });
    };

    genWorkerRef.current?.terminate();
    genWorkerRef.current = null;

    if (typeof Worker === "undefined") {
      // مسیرِ پشتیبان: اجرا روی نخ اصلی (صفحه در فواصلِ تلاش‌ها به‌روزرسانی می‌شود)
      void (async () => {
        try {
          const out = await generateSemData(input, {
            maxAttempts,
            shouldCancel: () => genCancelRef.current,
            onProgress: (p) => setGenProgress(p),
          });
          if (genCancelRef.current) {
            setGenCancelled(true);
            setGenPhase("done");
            setStatus({ text: "تولید متوقف شد.", kind: "err" });
            return;
          }
          finish(out);
        } catch (err) {
          fail((err as Error).message);
        }
      })();
      return;
    }

    try {
      const worker = new Worker(new URL("../../../workers/sem-generator.worker.ts", import.meta.url), {
        type: "module",
      });
      genWorkerRef.current = worker;
      worker.onmessage = (event: MessageEvent<SemGeneratorWorkerResponse>) => {
        const data = event.data;
        if (data.type === "progress") {
          setGenProgress(data.progress);
          return;
        }
        worker.terminate();
        if (genWorkerRef.current === worker) genWorkerRef.current = null;
        if (data.type === "done") {
          finish(data.output);
        } else if (data.type === "error") {
          fail(data.message);
        }
      };
      worker.onerror = (event) => {
        worker.terminate();
        if (genWorkerRef.current === worker) genWorkerRef.current = null;
        fail(event.message || "خطای ناشناخته در Worker تولید داده.");
      };
      worker.postMessage({
        type: "generate",
        input,
        options: { maxAttempts, verifyBootSamples: Math.min(constraints.bootSamples || 500, 300) },
      });
    } catch (err) {
      fail((err as Error).message);
    }
  }, [n, modelVars, modelArrows, constraints, analyze, vars]);

  // ---------- ایمپورت اکسل ----------
  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("فایل اکسل خالی است.");
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
      if (!aoa.length) throw new Error("فایل اکسل خالی است.");
      const first = aoa[0] ?? [];
      const hasHeader = first.some((value) => typeof value === "string" && value.trim() !== "" && parseLocalizedNumber(value) == null);
      const headers: string[] = [];
      let dataRows = aoa;
      if (hasHeader) {
        headers.push(...first.map((v, i) => String(v ?? `ستون ${i + 1}`)));
        dataRows = aoa.slice(1);
      } else {
        headers.push(...first.map((_, i) => `ستون ${i + 1}`));
      }
      const parsed = dataRows.map((r) =>
        Array.from({ length: headers.length }, (_, j) => {
          const value = (r as unknown[])[j];
          return parseLocalizedNumber(value);
        })
      );
      setSource("real");
      setColumns(headers);
      setRows(parsed);
      setColMap(autoMap(headers, vars));
      setAnalysis(null);
      setAnswerKey(null);
      setBootResults(null);
      setStatus({
        text: `داده واقعی وارد شد: ${parsed.length} مورد × ${headers.length} ستون. نگاشت ستون‌ها را بررسی و سپس «اجرای تحلیل» را بزنید.`,
        kind: "ok",
      });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
  };


  // ---------- خروجی‌ها ----------
  const exportExcel = () => {
    try {
      if (!rows.length) throw new Error("داده‌ای برای خروجی وجود ندارد.");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => r.map((v) => (v == null ? "" : v)))]),
        "داده"
      );
      if (analysis) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([
            modelNodes.map((nd) => nd.label),
            ...Array.from({ length: rows.length }, (_, i) => modelNodes.map((nd) => analysis.nodeCols[nd.nodeId][i])),
          ]),
          "نمرات کل / گره‌ها"
        );
      }
      const appendAlphaWorkbookSheets = (
        dataRows: (number | null)[][],
        dataColumns: string[],
        result: AlphaResultGroup[] | null,
        suffix: string
      ) => {
        if (!dataRows.length) return;
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([dataColumns, ...dataRows.map((row) => row.map((value) => value == null ? "" : value))]),
          `داده آلفا ${suffix}`
        );
        if (!result?.length) return;
        const output: (string | number)[][] = [["واحد پایایی", "گویه", "میانگین", "SD", "گویه-کل", "آلفا اگر حذف شود", "آلفا"]];
        result.forEach((group) => group.items.forEach((item, index) => output.push([
          group.name,
          item.name,
          Number(item.mean.toFixed(2)),
          Number(item.sd.toFixed(2)),
          Number(item.itemTotal.toFixed(3)),
          Number.isFinite(item.alphaIfDeleted) ? Number(item.alphaIfDeleted.toFixed(3)) : "—",
          index === 0 ? Number(group.alpha.toFixed(3)) : "",
        ])));
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(output), `نتایج آلفا ${suffix}`);
      };
      appendAlphaWorkbookSheets(alphaRows, alphaCols, alphaResult, "تمرینی");
      appendAlphaWorkbookSheets(alphaRealRows, alphaRealCols, alphaRealResult, "واقعی");
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(
          buildReportText(vars, modelNodes, analysis, answerKey, bootResults, rows.length, alphaReportText())
            .split("\n")
            .map((l) => [l])
        ),
        "گزارش"
      );
      XLSX.writeFile(wb, "amarist-sem.xlsx");
      setStatus({ text: "فایل اکسل دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const downloadTemplate = () => {
    try {
      const headers: string[] = [];
      const sample1: (number | null)[] = [];
      const sample2: (number | null)[] = [];
      const empty: (number | null)[] = [];
      vars.forEach((v) => {
        if (v.subscales.length) {
          v.subscales.forEach((s) => {
            headers.push(`${v.name} — ${s.name}`);
            sample1.push(s.min);
            sample2.push(s.max);
            empty.push(null);
          });
        } else {
          headers.push(v.name);
          sample1.push(v.totalMin);
          sample2.push(v.totalMax);
          empty.push(null);
        }
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers, sample1, sample2, empty, empty, empty]), "قالب داده");
      const guide: (string | number)[][] = [
        ["متغیر", "زیرمقیاس", "حداقل", "حداکثر", "نقش"],
        ...vars.flatMap((v) =>
          v.subscales.length
            ? v.subscales.map((s) => [v.name, s.name, s.min, s.max, v.role === "exogenous" ? "برون‌زا" : v.role === "mediator" ? "میانجی" : "درون‌زا"])
            : [[v.name, "—", v.totalMin, v.totalMax, v.role === "exogenous" ? "برون‌زا" : v.role === "mediator" ? "میانجی" : "درون‌زا"]]
        ),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), "راهنمای دامنه");
      XLSX.writeFile(wb, "amarist-sem-template.xlsx");
      setStatus({ text: "قالب داده دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const exportDocx = async () => {
    try {
      const doc = buildDocxReport(
        currentProject?.name ?? "پروژه",
        vars,
        modelNodes,
        analysis,
        answerKey,
        bootResults,
        rows.length,
        source
      );
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-sem-report.docx";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "گزارش docx دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const exportTxt = () => {
    try {
      const text = buildReportText(vars, modelNodes, analysis, answerKey, bootResults, rows.length, alphaReportText());
      const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-sem-report.txt";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "گزارش txt دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const copyReport = async () => {
    try {
      const text = buildReportText(vars, modelNodes, analysis, answerKey, bootResults, rows.length, alphaReportText());
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setStatus({ text: "کل گزارش کپی شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  // ---------- توابع آلفای کرونباخ ----------
  const alphaCurrentCols = alphaTab === "training" ? alphaCols : alphaRealCols;
  const alphaCurrentRows = alphaTab === "training" ? alphaRows : alphaRealRows;
  const alphaCurrentResult = alphaTab === "training" ? alphaResult : alphaRealResult;

  const invalidateGeneratedAlpha = () => {
    if (alphaRows.length) {
      setAlphaCols([]);
      setAlphaRows([]);
      setAlphaResult(null);
      setAlphaStatus({ text: "پیکربندی گویه‌ها تغییر کرد؛ دادهٔ آموزشی را دوباره تولید کنید.", kind: "" });
    }
  };

  const updateAlphaScale = (varId: number, patch: Partial<AlphaScale>) => {
    invalidateGeneratedAlpha();
    setAlphaRealResult(null);
    setAlphaScales((previous) => previous.map((scale) => scale.varId === varId ? { ...scale, ...patch } : scale));
  };

  const updateAlphaAssignment = (varId: number, subscale: string, expression: string) => {
    invalidateGeneratedAlpha();
    setAlphaRealResult(null);
    setAlphaScales((previous) => previous.map((scale) => scale.varId === varId
      ? { ...scale, assignments: { ...scale.assignments, [subscale]: expression } }
      : scale));
  };

  const buildAlphaSemTargets = (scales: AlphaScale[]): AlphaSemTargets => {
    if (!rows.length || !columns.length) {
      throw new Error("ابتدا داده‌های SEM را در مرحلهٔ داده‌ها تولید یا ایمپورت کنید؛ تولید مستقلِ گویهٔ آلفا مجاز نیست.");
    }
    const targets: AlphaSemTargets = {};
    for (const scale of scales) {
      const variable = vars.find((candidate) => candidate.id === scale.varId);
      if (!variable) throw new Error(`متغیر «${scale.name}» در پروژه پیدا نشد.`);
      const labels = scale.subscales.length ? scale.subscales : [""];
      labels.forEach((subscale, subscaleIndex) => {
        const label = subscale ? `${scale.name} — ${subscale}` : scale.name;
        const mappedIndex = source === "real" ? colMap[scale.varId]?.[subscaleIndex] : null;
        const columnIndex = mappedIndex ?? columns.indexOf(label);
        if (columnIndex == null || columnIndex < 0 || !columns[columnIndex]) {
          throw new Error(`ستون SEM مربوط به «${label}» پیدا/نگاشت نشده است؛ نگاشت داده‌های واقعی را کامل کنید.`);
        }
        targets[alphaTargetKey(scale.varId, subscale)] = rows.map((row) => row[columnIndex] ?? null);
      });
    }
    return targets;
  };

  const generateAlpha = () => {
    try {
      const aMin = Number(alphaMin);
      const aMax = Number(alphaMax);
      if (!Number.isFinite(aMin) || !Number.isFinite(aMax) || aMin >= aMax || aMin < 0 || aMax > 1) {
        throw new Error("بازه آلفای هدف معتبر نیست.");
      }
      const configuredScales = materializeAlphaScales(alphaScales);
      const semTargets = buildAlphaSemTargets(configuredScales);
      const generated = generateAlphaTrainingData(configuredScales, semTargets, aMin, aMax);
      setAlphaScales(generated.scales);
      setAlphaCols(generated.columns);
      setAlphaRows(generated.rows);
      setAlphaResult(generated.result);
      setAlphaTab("training");
      setAlphaStatus({
        text: `گویه‌های منطبق با SEM تولید شد: ${generated.rows.length} نفر × ${generated.columns.length} گویه؛ جمع هر ردیف دقیقاً کنترل شد.`,
        kind: "ok",
      });
    } catch (err) {
      setAlphaStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
  };

  const computeAlphaResult = (tab: "training" | "real" = alphaTab) => {
    const dataRows = tab === "training" ? alphaRows : alphaRealRows;
    const dataColumns = tab === "training" ? alphaCols : alphaRealCols;
    if (!dataRows.length || !dataColumns.length) {
      setAlphaStatus({ text: "داده‌ای برای محاسبه آلفا وجود ندارد.", kind: "err" });
      return;
    }
    let configuredScales: AlphaScale[];
    try {
      configuredScales = materializeAlphaScales(alphaScales);
    } catch (error) {
      setAlphaStatus({ text: (error as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(error as Error).message] });
      return;
    }
    const expected = configuredScales.reduce((sum, scale) => sum + scale.items.length, 0);
    if (dataColumns.length < expected) {
      setAlphaStatus({ text: `فایل ${dataColumns.length} ستون دارد، اما برای نگاشت فعلی ${expected} گویه لازم است.`, kind: "err" });
      return;
    }
    const result = calculateAlphaGroups(dataRows, dataColumns, configuredScales);
    if (tab === "training") setAlphaResult(result);
    else setAlphaRealResult(result);
    setAlphaStatus({ text: `آلفای کرونباخ برای ${result.length} واحدِ معتبر محاسبه شد (n=${dataRows.length}).`, kind: "ok" });
  };

  const handleAlphaImport = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("فایل اکسل خالی است.");
      const aoa = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null }) as unknown[][];
      if (!aoa.length) throw new Error("فایل اکسل خالی است.");
      const first = aoa[0] ?? [];
      const hasHeader = first.some((value) => typeof value === "string" && !/^-?\d+(\.\d+)?$/.test(value.trim()));
      const headers = hasHeader
        ? first.map((value, index) => String(value ?? `ستون ${index + 1}`))
        : first.map((_, index) => `ستون ${index + 1}`);
      const sourceRows = hasHeader ? aoa.slice(1) : aoa;
      const parsed = sourceRows
        .map((row) => Array.from({ length: headers.length }, (_, index) => {
          const value = row[index];
          if (value == null || value === "") return null;
          const number = Number(String(value).replace(/[،]/g, "").trim());
          return Number.isFinite(number) ? number : null;
        }))
        .filter((row) => row.some((value) => value != null));
      if (!parsed.length) throw new Error("فایل هیچ ردیف داده‌ای ندارد.");
      const configuredScales = materializeAlphaScales(alphaScales);
      const expected = configuredScales.reduce((sum, scale) => sum + scale.items.length, 0);
      if (headers.length < expected) throw new Error(`حداقل ${expected} ستون گویه لازم است؛ فایل ${headers.length} ستون دارد.`);
      const result = calculateAlphaGroups(parsed, headers, configuredScales);
      setAlphaRealCols(headers);
      setAlphaRealRows(parsed);
      setAlphaRealResult(result);
      setAlphaTab("real");
      setAlphaStatus({ text: `دادهٔ واقعی وارد شد: ${parsed.length} نفر × ${headers.length} گویه؛ حجم نمونه خودکار تشخیص داده شد.`, kind: "ok" });
    } catch (err) {
      setAlphaStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
  };

  const downloadAlphaTemplate = () => {
    try {
      const configuredScales = materializeAlphaScales(alphaScales);
      const headers = configuredScales.flatMap((scale) => scale.items.map((item, index) => alphaColumnName(scale, item, index)));
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([headers]), "قالب داده آلفا");
      const guide: (string | number)[][] = [["متغیر", "زیرمقیاس", "گویه", "حداقل", "حداکثر", "نمره کل مجاز؟"]];
      configuredScales.forEach((scale) => scale.items.forEach((item, index) => guide.push([
        scale.name,
        item.sub || "—",
        index + 1,
        item.min,
        item.max,
        scale.hasTotal ? "بله" : "خیر؛ فقط زیرمقیاس",
      ])));
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(guide), "راهنما");
      XLSX.writeFile(workbook, "amarist-alpha-template.xlsx");
      setAlphaStatus({ text: "قالب اکسل آلفا دانلود شد.", kind: "ok" });
    } catch (error) {
      setAlphaStatus({ text: (error as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(error as Error).message] });
    }
  };

  const exportAlphaExcel = (tab: "training" | "real" = alphaTab) => {
    try {
      const dataRows = tab === "training" ? alphaRows : alphaRealRows;
      const dataColumns = tab === "training" ? alphaCols : alphaRealCols;
      const result = tab === "training" ? alphaResult : alphaRealResult;
      if (!dataRows.length) throw new Error("داده‌ای برای خروجی آلفا وجود ندارد.");
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([dataColumns, ...dataRows]), "داده آلفا");
      if (result?.length) {
        const output: (string | number)[][] = [["واحد پایایی", "گویه", "میانگین", "SD", "گویه-کل", "آلفا اگر حذف شود", "آلفا", "آلفای استاندارد"]];
        result.forEach((group) => group.items.forEach((item, index) => output.push([
          group.name,
          item.name,
          Number(item.mean.toFixed(2)),
          Number(item.sd.toFixed(2)),
          Number(item.itemTotal.toFixed(3)),
          Number.isFinite(item.alphaIfDeleted) ? Number(item.alphaIfDeleted.toFixed(3)) : "—",
          index === 0 ? Number(group.alpha.toFixed(3)) : "",
          index === 0 ? Number(group.stdAlpha.toFixed(3)) : "",
        ])));
        XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(output), "نتایج آلفا");
      }
      XLSX.writeFile(workbook, tab === "training" ? "amarist-alpha-training.xlsx" : "amarist-alpha-real.xlsx");
      setAlphaStatus({ text: "فایل اکسل آلفا دانلود شد.", kind: "ok" });
    } catch (err) {
      setAlphaStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const alphaReportText = useCallback((): string => {
    const sections: string[] = [];
    const append = (title: string, dataRows: (number | null)[][], result: AlphaResultGroup[] | null) => {
      if (!result?.length) return;
      sections.push(title, "-------------------------------", `تعداد موارد: ${dataRows.length}`);
      result.forEach((group) => {
        sections.push(`واحد پایایی: ${group.name} (${group.k} گویه)`);
        group.items.forEach((item) => sections.push(
          `  ${item.name}: میانگین=${fmt(item.mean)} | SD=${fmt(item.sd)} | گویه-کل=${fmt(item.itemTotal)} | آلفا-اگر-حذف=${fmt(item.alphaIfDeleted)}`
        ));
        sections.push(`  آلفای کرونباخ: ${fmt(group.alpha)} | استانداردشده: ${fmt(group.stdAlpha)}`);
      });
      sections.push("");
    };
    append(`بررسی پایایی — دادهٔ تمرینی (بازه هدف ${alphaMin} تا ${alphaMax})`, alphaRows, alphaResult);
    append("بررسی پایایی — داده‌های واقعی کاربر", alphaRealRows, alphaRealResult);
    return sections.join("\n");
  }, [alphaResult, alphaRows, alphaRealResult, alphaRealRows, alphaMin, alphaMax]);

  // ---------- بکاپ پروژه‌ها ----------
  const openBackupModal = () => {
    const now = new Date();
    const pad = (x: number) => String(x).padStart(2, "0");
    const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`;
    setBackupName(`بکاپ-پروژه‌ها-${stamp}`);
    setBackupScope("all");
    setBackupModal(true);
  };

  const doBackup = () => {
    try {
      const safeName = backupName.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\.json$/i, "") || "بکاپ-پروژه‌ها";
      const data =
        backupScope === "all"
          ? { version: 2, type: "projects", projects }
          : { version: 2, type: "project", project: currentProject };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${safeName}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setBackupModal(false);
      setStatus({ text: "بکاپ دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const restoreBackup = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (data?.version === 2 && data.type === "projects" && Array.isArray(data.projects)) {
        const restored: Project[] = data.projects.filter((p: Project) => p && p.data);
        if (!restored.length) throw new Error("بکاپ معتبر نیست.");
        setProjects(restored);
        saveProjects(restored);
        setProjectId(restored[0].id);
        applyProjectData(restored[0].data);
        setActiveStep(0);
        setStatus({ text: `${restored.length} پروژه بازیابی شد.`, kind: "ok" });
      } else if (data?.version === 2 && data.type === "project" && data.project) {
        const p = data.project as Project;
        setProjects((prev) => {
          const idx = prev.findIndex((x) => x.id === p.id);
          const next = idx >= 0 ? prev.map((x, i) => (i === idx ? p : x)) : [...prev, p];
          saveProjects(next);
          return next;
        });
        setProjectId(p.id);
        applyProjectData(p.data);
        setActiveStep(0);
        setStatus({ text: `پروژه «${p.name}» بازیابی شد.`, kind: "ok" });
      } else {
        throw new Error("فایل بکاپ معتبر نیست.");
      }
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
  };

  // ---------- ویرایش سلول ----------
  const updateCell = (rowIdx: number, colIdx: number, value: number | null) => {
    setRows((prev) => prev.map((r, i) => (i === rowIdx ? r.map((v, j) => (j === colIdx ? value : v)) : r)));
  };

  const updateColMap = (varId: number, slot: number, colIdx: number | null) => {
    setColMap((prev) => {
      const next = { ...prev, [varId]: [...(prev[varId] ?? [])] };
      next[varId][slot] = colIdx;
      return next;
    });
  };

  // ---------- واحدهای اثر غیرمستقیم ----------
  const indirectRows = useMemo(() => {
    const rowsList: { key: string; legacyKey: string; label: string; isTotal: boolean; autoDir: PathDirection }[] = [];
    const exogenous = vars.filter((variable) => variable.role === "exogenous");
    const outcomes = vars.filter((variable) => variable.role === "outcome");
    const mediators = vars.filter((variable) => variable.role === "mediator");
    for (const fromVariable of exogenous) {
      for (const toVariable of outcomes) {
        const activeMediators = mediators.filter(
          (viaVariable) =>
            modelArrows.some((arrow) => arrow.fromVar === fromVariable.id && arrow.toVar === viaVariable.id) &&
            modelArrows.some((arrow) => arrow.fromVar === viaVariable.id && arrow.toVar === toVariable.id)
        );
        if (!activeMediators.length) continue;
        const fromUnits = indirectUnitsOfVar(nodes, fromVariable.id);
        const toUnits = indirectUnitsOfVar(nodes, toVariable.id);
        const viaUnits = activeMediators.flatMap((variable) => indirectUnitsOfVar(nodes, variable.id));
        for (const from of fromUnits) {
          for (const to of toUnits) {
            for (const via of viaUnits) {
              rowsList.push({
                key: indirectUnitKey(from.label, via.label, to.label),
                legacyKey: `${from.varId}:${via.varId}:${to.varId}`,
                label: `${from.label} ← ${via.label} ← ${to.label}`,
                isTotal: false,
                autoDir: resolveAutomaticIndirectDirection(constraints, nodes, modelArrows, from.nodeIds[0], [via.nodeIds[0]], to.nodeIds[0]),
              });
            }
            if (viaUnits.length > 1) {
              rowsList.push({
                key: indirectUnitKey(from.label, null, to.label),
                legacyKey: `${from.varId}:${to.varId}`,
                label: `کل: ${from.label} ← ${to.label} (${viaUnits.map((via) => via.label).join(" + ")})`,
                isTotal: true,
                autoDir: resolveAutomaticIndirectDirection(constraints, nodes, modelArrows, from.nodeIds[0], viaUnits.map((via) => via.nodeIds[0]), to.nodeIds[0]),
              });
            }
          }
        }
      }
    }
    return rowsList;
  }, [vars, modelArrows, nodes, constraints]);

  // ---------- ردیف‌های جدولِ قیودِ مسیرهای مستقیم ----------
  // برای متغیرهای غیرجمع‌پذیر (مانند ERQ) فقط به‌ازای هر زیرمقیاس یک ردیفِ مستقل
  // ساخته می‌شود؛ ردیفِ سطحِ متغیر/«همهٔ زیرمقیاس‌ها» برای سازهٔ بدون نمرهٔ کل معنا ندارد.
  const pathRows = useMemo(() => {
    type Row = {
      id: string;
      kind: "pair" | "group" | "node";
      varKey: string;
      nodeKey: string | null;
      label: string;
      hint: string | null;
      autoDir: PathDirection;
      mixed: boolean;
    };
    const rows: Row[] = [];
    const seen = new Set<string>();
    for (const arrow of allArrows) {
      const varKey = `${arrow.fromVar}:${arrow.toVar}`;
      if (seen.has(varKey)) continue;
      seen.add(varKey);
      const pairArrows = allArrows.filter((a) => `${a.fromVar}:${a.toVar}` === varKey);
      const dirSet = new Set(
        pairArrows.map((a) => inferPathDirection(nodeLabel(a.fromNode), nodeLabel(a.toNode)))
      );
      const autoDir = (dirSet.size === 1 ? [...dirSet][0] : "any") as PathDirection;
      if (pairArrows.length > 1) {
        for (const a of pairArrows) {
          const dir = inferPathDirection(nodeLabel(a.fromNode), nodeLabel(a.toNode));
          const key = nodePathKey(nodeLabel(a.fromNode), nodeLabel(a.toNode));
          rows.push({
            id: key,
            kind: "node",
            varKey,
            nodeKey: key,
            label: `${nodeLabel(a.fromNode)} ← ${nodeLabel(a.toNode)}`,
            hint: `خودکار: ${dir === "pos" ? "مثبت" : dir === "neg" ? "منفی" : "نامشخص"}`,
            autoDir: dir,
            mixed: false,
          });
        }
      } else {
        rows.push({
          id: varKey,
          kind: "pair",
          varKey,
          nodeKey: null,
          label: `${varName(arrow.fromVar)} ← ${varName(arrow.toVar)}`,
          hint: null,
          autoDir,
          mixed: false,
        });
      }
    }
    return rows;
  }, [allArrows, nodeLabel, varName]);

  // ---------- گزینه‌های مدل (بر اساس میانجی‌ها) ----------
  const medVars = useMemo(
    () => vars.filter((v) => v.role === "mediator" && connectedVarIds.has(v.id)),
    [vars, connectedVarIds]
  );
  const modelOptions = useMemo(() => {
    if (!medVars.length) return [];
    const options: { id: string; label: string; desc: string; meds: number[] }[] = [
      {
        id: "full",
        label: "مدل کامل",
        desc: "همه میانجی‌ها در مدل فعال‌اند",
        meds: medVars.map((m) => m.id),
      },
    ];
    medVars.forEach((m) => {
      options.push({
        id: `med-${m.id}`,
        label: `مدل با میانجی «${m.name}»`,
        desc: "فقط این میانجی در مدل فعال است",
        meds: [m.id],
      });
    });
    return options;
  }, [medVars]);

  const selectedModelId = useMemo(() => {
    if (!medVars.length) return "full";
    const activeMeds = medVars.filter((m) =>
      allArrows.some((a) => !inactiveArrowIds.has(a.id) && (a.fromVar === m.id || a.toVar === m.id))
    );
    if (activeMeds.length === medVars.length) return "full";
    if (activeMeds.length === 1) return `med-${activeMeds[0].id}`;
    return "custom";
  }, [medVars, allArrows, inactiveArrowIds]);

  const selectModel = (opt: { id: string; meds: number[] }) => {
    const inactive = new Set<string>();
    allArrows.forEach((a) => {
      const touchesMed = medVars.some((m) => m.id === a.fromVar || m.id === a.toVar);
      if (touchesMed && !opt.meds.some((mid) => mid === a.fromVar || mid === a.toVar)) {
        inactive.add(a.id);
      }
    });
    setInactiveArrowIds(inactive);
  };

  // ---------- یافته‌های توصیفی درختی ----------
  const descriptive = useMemo(() => {
    if (!analysis) return null;
    const statOf = (col: number[]) => {
      const vals = col.filter(Number.isFinite);
      return {
        n: vals.length,
        mean: vals.length ? mean(vals) : NaN,
        sd: vals.length > 1 ? sampleStd(vals) : NaN,
        min: vals.length ? Math.min(...vals) : NaN,
        max: vals.length ? Math.max(...vals) : NaN,
        skew: skewness(col),
        kurt: kurtosis(col),
      };
    };
    const out: { label: string; indent: number; bold?: boolean; s: ReturnType<typeof statOf> }[] = [];
    for (const v of modelVars) {
      const vNodes = modelNodes.filter((nd) => nd.varId === v.id);
      if (v.subscales.length === 0) {
        const nd = vNodes[0];
        out.push({ label: v.name, indent: 0, bold: true, s: statOf(analysis.nodeCols[nd.nodeId]) });
      } else if (v.hasTotal) {
        const totalNode = vNodes.find((nd) => nd.kind === "total") ?? vNodes[0];
        out.push({ label: `${v.name} (نمره کل)`, indent: 0, bold: true, s: statOf(analysis.nodeCols[totalNode.nodeId]) });
        const subs = analysis.indicatorCols[v.id] ?? [];
        v.subscales.forEach((s, i) => {
          const col = subs[i];
          if (col) out.push({ label: `└─ ${s.name}`, indent: 1, s: statOf(col) });
        });
      } else {
        vNodes.forEach((nd, i) => {
          const sub = v.subscales[i];
          out.push({ label: sub ? `${v.name} — ${sub.name}` : nd.label, indent: 0, s: statOf(analysis.nodeCols[nd.nodeId]) });
        });
      }
    }
    return out;
  }, [analysis, modelVars, modelNodes]);


  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-24 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <ToolHeader title="تحلیل مسیر و مدل معادلات ساختاری (SEM)" subtitle={modeLabel} />

      {/* ---------- استپر شناور زیر هدر + دکمه‌های قبلی/بعدی ---------- */}
      <div className="sticky top-14 z-40 border-b border-stone-200 bg-white/95 shadow-sm backdrop-blur dark:border-stone-700 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-[1280px] items-center gap-3 px-4 py-1.5">
          <div className="min-w-0 flex-1 overflow-x-auto">
            <ProgressStepper steps={steps} statuses={stepStatuses} onSelect={goToStep} />
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
              onClick={goPrev}
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
              onClick={goNext}
              title="مرحله بعدی"
              className="flex h-9 items-center gap-1 rounded-xl bg-indigo-600 px-3 text-[11px] font-extrabold text-white shadow-md shadow-indigo-600/25 transition hover:bg-indigo-500 disabled:opacity-30"
            >
              مرحله بعد
              <ChevronLeft className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1280px] px-4">
        {/* ============ مرحله ۰: پروژه ============ */}
        {currentStep === stepIdx("project") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[0]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">پروژه‌ها</h2>
              <HelpButtons section="project" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              همه داده‌ها در مرورگر شما ذخیره می‌شوند. یک پروژه انتخاب کنید یا پروژه جدید بسازید؛ با «بکاپ پروژه‌ها»
              می‌توانید همه پروژه‌ها یا فقط همین پروژه را ذخیره کنید.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {projects.map((p) => (
                <div
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => switchProject(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") switchProject(p.id);
                  }}
                  className={`cursor-pointer rounded-2xl border-2 p-4 transition ${
                    p.id === projectId
                      ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40"
                      : "border-stone-200 bg-white hover:border-indigo-300 dark:border-stone-700 dark:bg-slate-800"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <p className="font-extrabold text-stone-900 dark:text-stone-100">{p.name}</p>
                    {p.id === projectId && (
                      <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">فعال</span>
                    )}
                  </div>
                  <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                    {p.data.vars.length} متغیر · {p.data.rows.length} ردیف داده · به‌روزرسانی:{" "}
                    {new Date(p.updatedAt).toLocaleDateString("fa-IR")}
                  </p>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteProject(p.id);
                      }}
                      className="flex h-9 w-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                      title="حذف پروژه"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}

              <button
                type="button"
                onClick={() => setProjectModal(true)}
                className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 text-stone-400 transition hover:border-indigo-400 hover:text-indigo-600 dark:border-stone-600 dark:text-stone-500"
              >
                <FolderPlus className="h-8 w-8" />
                <span className="text-sm font-extrabold">پروژه جدید</span>
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" className={btnSecondary} onClick={openBackupModal}>
                <Download className="h-4 w-4" />
                بکاپ پروژه‌ها
              </button>
              <input
                ref={restoreRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) restoreBackup(f);
                  e.target.value = "";
                }}
              />
              <button type="button" className={btnLight} onClick={() => restoreRef.current?.click()}>
                <Upload className="h-4 w-4" />
                بازیابی از بکاپ
              </button>
            </div>
          </section>
        )}

        {/* ============ مرحله ۱: منبع داده ============ */}
        {currentStep === stepIdx("source") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[1]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">منبع داده</h2>
              <HelpButtons section="source" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              انتخاب کنید داده‌های واقعی پژوهش خود را وارد می‌کنید یا داده تمرینی برای شما تولید شود.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSource("generate")}
                className={`rounded-2xl border-2 p-4 text-start transition ${
                  source === "generate"
                    ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40"
                    : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"
                }`}
              >
                <p className="font-extrabold text-stone-900 dark:text-stone-100">تولید داده تمرینی</p>
                <p className="mt-1 text-[12px] leading-6 text-stone-500 dark:text-stone-400">
                  با رعایت قیود انتخابی شما (معنی‌داری مسیرها، اثر میانجی، R² و...) داده شبیه‌سازی‌شده ساخته می‌شود.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSource("real")}
                className={`rounded-2xl border-2 p-4 text-start transition ${
                  source === "real"
                    ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40"
                    : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"
                }`}
              >
                <p className="font-extrabold text-stone-900 dark:text-stone-100">داده واقعی خودم</p>
                <p className="mt-1 text-[12px] leading-6 text-stone-500 dark:text-stone-400">
                  فایل اکسل را در مرحله «جدول داده‌ها» وارد کنید؛ ستون‌ها را به متغیرها نسبت دهید.
                </p>
              </button>
            </div>
          </section>
        )}

        {/* ============ مرحله ۲: متغیرها ============ */}
        {currentStep === stepIdx("variables") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[2]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">مشخصات متغیرها</h2>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                  اول زیرمقیاس دارد؟ بعد نمره کل دارد؟ — متغیر جمع‌پذیر با نمره کل وارد مدل می‌شود؛ متغیر غیرجمع‌پذیر
                  به‌صورت زیرمقیاس‌های مستقل وارد می‌شود.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <HelpButtons section="variables" />
                <button type="button" className={btnLight} onClick={addVar}>
                  <Plus className="h-4 w-4" />
                  افزودن متغیر
                </button>
              </div>
            </div>

            <div className="mt-4 grid gap-4">
              {vars.map((v) => {
                const sumMin = v.subscales.reduce((s, x) => s + x.min, 0);
                const sumMax = v.subscales.reduce((s, x) => s + x.max, 0);
                const totalMatches =
                  v.hasTotal && v.subscales.length > 0 && sumMin === v.totalMin && sumMax === v.totalMax;
                return (
                  <div key={v.id} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="w-44">
                        <label className={labelCls}>نقش متغیر</label>
                        <select
                          className={inputCls}
                          value={v.role}
                          onChange={(e) => updateVar(v.id, { role: e.target.value as Role })}
                        >
                          <option value="exogenous">برون‌زا (X)</option>
                          <option value="mediator">میانجی (M)</option>
                          <option value="outcome">درون‌زا (Y)</option>
                        </select>
                      </div>
                      <div className="min-w-52 flex-1">
                        <label className={labelCls}>نام متغیر</label>
                        <input className={inputCls} value={v.name} onChange={(e) => updateVar(v.id, { name: e.target.value })} />
                      </div>
                      <button
                        type="button"
                        onClick={() => removeVar(v.id)}
                        className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                        title="حذف متغیر"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    {/* ۱) زیرمقیاس دارد؟ */}
                    <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-700 dark:bg-slate-900/60">
                      <div className="flex flex-wrap items-center gap-6">
                        <span className="text-sm font-extrabold text-stone-800 dark:text-stone-200">زیرمقیاس دارد؟</span>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                          <input
                            type="radio"
                            name={`hasSub-${v.id}`}
                            checked={v.subscales.length > 0}
                            onChange={() => {
                              if (v.subscales.length === 0) addSubscale(v.id);
                            }}
                            className="h-4 w-4 accent-indigo-600"
                          />
                          بله
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                          <input
                            type="radio"
                            name={`hasSub-${v.id}`}
                            checked={v.subscales.length === 0}
                            onChange={() => updateVar(v.id, { subscales: [], hasTotal: true })}
                            className="h-4 w-4 accent-indigo-600"
                          />
                          خیر
                        </label>
                      </div>

                      {v.subscales.length > 0 ? (
                        <>
                          <div className="mt-3 space-y-2">
                            <div className="grid grid-cols-[1fr_110px_110px_40px] items-center gap-2 px-1 text-[11px] font-bold text-stone-500 dark:text-stone-400">
                              <span>نام زیرمقیاس</span>
                              <span className="text-center">حداقل نمره</span>
                              <span className="text-center">حداکثر نمره</span>
                              <span />
                            </div>
                            {v.subscales.map((s, si) => (
                              <div key={si} className="grid grid-cols-[1fr_110px_110px_40px] items-center gap-2">
                                <input className={inputCls} value={s.name} placeholder="نام زیرمقیاس" onChange={(e) => setSubscaleName(v.id, si, e.target.value)} />
                                <input type="number" dir="ltr" className={inputCls} value={s.min} onChange={(e) => setSubscaleRange(v.id, si, "min", Number(e.target.value))} />
                                <input type="number" dir="ltr" className={inputCls} value={s.max} onChange={(e) => setSubscaleRange(v.id, si, "max", Number(e.target.value))} />
                                <button type="button" onClick={() => removeSubscale(v.id, si)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 transition hover:border-red-200 hover:text-red-500 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-400" title="حذف زیرمقیاس">
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            ))}
                          </div>

                          <div className="mt-3 grid grid-cols-[1fr_110px_110px] items-center gap-2 rounded-xl border-2 border-violet-300 bg-violet-100/60 px-2 py-2 dark:border-violet-800 dark:bg-violet-950/40">
                            <span className="text-[13px] font-black text-violet-800 dark:text-violet-200">جمع کل زیرمقیاس‌ها</span>
                            <span className="text-center text-[13px] font-black text-violet-800 dark:text-violet-200">{sumMin}</span>
                            <span className="text-center text-[13px] font-black text-violet-800 dark:text-violet-200">{sumMax}</span>
                          </div>

                          <button type="button" className={`${btnLight} mt-3`} onClick={() => addSubscale(v.id)}>
                            <Plus className="h-4 w-4" />
                            افزودن زیرمقیاس
                          </button>
                        </>
                      ) : (
                        <div className="mt-3">
                          <p className={tinyCls}>
                            بدون زیرمقیاس: متغیر تک‌نمره‌ای (مشاهده‌شده) است و نمره کل همان خود متغیر خواهد بود.
                          </p>
                          <div className="mt-2 grid max-w-md grid-cols-2 gap-3">
                            <div>
                              <label className={labelCls}>حداقل نمره کل</label>
                              <input
                                type="number"
                                className={inputCls}
                                value={v.totalMin}
                                onChange={(e) => updateVar(v.id, { totalMin: Number(e.target.value) })}
                              />
                            </div>
                            <div>
                              <label className={labelCls}>حداکثر نمره کل</label>
                              <input
                                type="number"
                                className={inputCls}
                                value={v.totalMax}
                                onChange={(e) => updateVar(v.id, { totalMax: Number(e.target.value) })}
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ۲) نمره کل دارد؟ — فقط وقتی زیرمقیاس دارد */}
                    {v.subscales.length > 0 && (
                      <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-700 dark:bg-slate-900/60">
                        <div className="flex flex-wrap items-center gap-6">
                          <span className="text-sm font-extrabold text-stone-800 dark:text-stone-200">جمع‌پذیر است؟ (نمره کل دارد؟)</span>
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                            <input type="radio" name={`hasTotal-${v.id}`} checked={v.hasTotal} onChange={() => updateVar(v.id, { hasTotal: true })} className="h-4 w-4 accent-indigo-600" />
                            بله — نمره کل دارد
                          </label>
                          <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                            <input type="radio" name={`hasTotal-${v.id}`} checked={!v.hasTotal} onChange={() => updateVar(v.id, { hasTotal: false })} className="h-4 w-4 accent-indigo-600" />
                            خیر — زیرمقیاس‌ها مستقل‌اند
                          </label>
                        </div>
                        <div className="mt-2 grid max-w-md grid-cols-2 gap-3">
                          <div>
                            <label className={labelCls}>حداقل نمره کل</label>
                            <input type="number" className={`${inputCls} ${v.hasTotal ? "" : "opacity-50"}`} value={v.totalMin} disabled={!v.hasTotal} onChange={(e) => updateVar(v.id, { totalMin: Number(e.target.value) })} />
                          </div>
                          <div>
                            <label className={labelCls}>حداکثر نمره کل</label>
                            <input type="number" className={`${inputCls} ${v.hasTotal ? "" : "opacity-50"}`} value={v.totalMax} disabled={!v.hasTotal} onChange={(e) => updateVar(v.id, { totalMax: Number(e.target.value) })} />
                          </div>
                        </div>
                        {v.hasTotal &&
                          (totalMatches ? (
                            <span className="mt-2 inline-block rounded-full bg-emerald-100 px-3 py-1 text-[12px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">✓ نمره کل با جمع زیرمقیاس‌ها برابر است</span>
                          ) : (
                            <span className="mt-2 inline-block rounded-full bg-amber-100 px-3 py-1 text-[12px] font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">⚠ نمره کل ({v.totalMin} تا {v.totalMax}) با جمع زیرمقیاس‌ها ({sumMin} تا {sumMax}) برابر نیست</span>
                          ))}
                      </div>
                    )}

                    {source === "real" && (
                      <div className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                        <p className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300">نگاشت ستون‌های فایل به متغیر «{v.name}»</p>
                        {v.subscales.length === 0 ? (
                          <div className="mt-2 max-w-xs">
                            <label className={labelCls}>ستون نمره / متغیر</label>
                            <select className={inputCls} value={colMap[v.id]?.[0] ?? -1} onChange={(e) => updateColMap(v.id, 0, e.target.value === "-1" ? null : Number(e.target.value))}>
                              <option value={-1}>— انتخاب نشده —</option>
                              {columns.map((c, i) => (
                                <option key={i} value={i}>{c}</option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                            {v.subscales.map((s, si) => (
                              <div key={si}>
                                <label className={labelCls}>{s.name}</label>
                                <select className={inputCls} value={colMap[v.id]?.[si] ?? -1} onChange={(e) => updateColMap(v.id, si, e.target.value === "-1" ? null : Number(e.target.value))}>
                                  <option value={-1}>— انتخاب نشده —</option>
                                  {columns.map((c, i) => (
                                    <option key={i} value={i}>{c}</option>
                                  ))}
                                </select>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ============ مرحله ۳: ترسیم مدل ============ */}
        {currentStep === stepIdx("draw") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[3]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">ترسیم مدل</h2>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                  هر فلش در یک خط جداگانه قابل فعال/غیرفعال کردن است. غیرفعال‌کردن فلش = صفر فرض‌شدن آن مسیر.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <HelpButtons section="draw" />
                <button type="button" className={btnSecondary} onClick={() => setShowBigDiagram(true)}>
                  <RefreshCw className="h-4 w-4" />
                  مشاهده بزرگ مدل
                </button>
              </div>
            </div>

            {isolatedVars.length > 0 && (
              <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-[12px] font-bold text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                ⚠ متغیرهای زیر هیچ فلش فعالی ندارند و از مدل حذف شده‌اند: {isolatedVars.map((v) => v.name).join("، ")}
              </div>
            )}

            <div className="mt-4 space-y-4">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">
                  انتخاب مدل ({modelOptions.length} حالت)
                </p>
                <p className={`${tinyCls} mt-1`}>
                  بر اساس تعداد میانجی‌های شما ({medVars.length} میانجی)، حالت‌های زیر قابل انتخاب است. فقط یکی از مدل‌ها
                  را انتخاب کنید؛ ادامه تحلیل بر اساس همان مدل پیش می‌رود. برازش با ماتریس شاخص‌های مشاهده‌شده و مدل اندازه‌گیری محاسبه می‌شود.
                </p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {modelOptions.map((opt) => {
                    const selected = selectedModelId === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => selectModel(opt)}
                        className={`cursor-pointer rounded-xl border-2 p-3 text-start transition ${
                          selected
                            ? "border-indigo-500 bg-indigo-50 shadow-md shadow-indigo-500/20 dark:border-indigo-400 dark:bg-indigo-950/40"
                            : "border-stone-200 bg-white hover:border-indigo-300 dark:border-stone-700 dark:bg-slate-800"
                        }`}
                      >
                        <p className="font-extrabold text-stone-800 dark:text-stone-200">
                          {selected && "✓ "}
                          {opt.label}
                        </p>
                        <p className={`${tinyCls} mt-0.5`}>{opt.desc}</p>
                      </button>
                    );
                  })}
                </div>
                {selectedModelId === "custom" && (
                  <p className={`${tinyCls} mt-2 text-amber-700 dark:text-amber-400`}>
                    ترکیب فعلی فلش‌ها با هیچ‌یک از حالت‌های استاندارد یکی نیست؛ برای پیش‌فرض‌های آماده یکی از حالت‌های بالا
                    را انتخاب کنید.
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">پیش‌نمایش مدل</p>
                <div className="mt-2">
                  <PathDiagram vars={modelVars} nodes={modelNodes} arrows={modelArrows} />
                </div>
              </div>
            </div>
          </section>
        )}


        {/* ============ مرحله ۴: قیود تولید ============ */}
        {currentStep === stepIdx("constraints") && source === "generate" && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[4]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">قیود تولید داده</h2>
              <HelpButtons section="constraints" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              مشخص کنید داده تولیدی چه شرایطی را حتماً رعایت کند؛ تولید فقط خروجی‌ای را قبول می‌کند که این شرایط برقرار
              باشد.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelCls}>حجم نمونه</label>
                <input type="number" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} />
                <p className={`${tinyCls} !text-emerald-700 dark:!text-emerald-300`}>
                  دامنه علمی متداول: ۱۰ تا ۲۰ نمونه به‌ازای هر پارامتر (کلاین)
                </p>
              </div>
              <div>
                <label className={labelCls}>تعداد نمونه‌های بوت‌استرپ</label>
                <input type="number" className={inputCls} value={constraints.bootSamples} onChange={(e) => setConstraints({ ...constraints, bootSamples: Number(e.target.value) })} />
                <p className={tinyCls}>پیش‌فرض: 2000 (مانند AMOS)؛ اجرا به‌صورت موازی است</p>
                <p className={`${tinyCls} !text-emerald-700 dark:!text-emerald-300`}>
                  دامنه علمی متداول: ۱۰۰۰ تا ۵۰۰۰ نمونه
                </p>
              </div>
              <div>
                <label className={labelCls}>درصد داده گمشده</label>
                <input type="number" min={0} max={20} className={inputCls} value={constraints.missingPct} onChange={(e) => setConstraints({ ...constraints, missingPct: Number(e.target.value) })} />
                <p className={`${tinyCls} !text-emerald-700 dark:!text-emerald-300`}>
                  دامنه علمی متداول: تا ۵٪ قابل‌چشم‌پوشی
                </p>
              </div>
              <div>
                <label className={labelCls}>درصد داده پرت</label>
                <input type="number" min={0} max={10} className={inputCls} value={constraints.outlierPct} onChange={(e) => setConstraints({ ...constraints, outlierPct: Number(e.target.value) })} />
                <p className={`${tinyCls} !text-emerald-700 dark:!text-emerald-300`}>
                  دامنه علمی متداول: کمتر از ۵٪
                </p>
              </div>
              <div>
                <label className={labelCls}>تعداد تلاش‌های تولید</label>
                <input
                  type="number"
                  min={MIN_MAX_ATTEMPTS}
                  max={MAX_MAX_ATTEMPTS}
                  dir="ltr"
                  className={inputCls}
                  value={constraints.maxAttempts}
                  onChange={(e) =>
                    setConstraints({
                      ...constraints,
                      maxAttempts: Math.max(
                        MIN_MAX_ATTEMPTS,
                        Math.min(MAX_MAX_ATTEMPTS, Math.round(Number(e.target.value) || DEFAULT_MAX_ATTEMPTS))
                      ),
                    })
                  }
                />
                <p className={tinyCls}>
                  پیش‌فرض: {DEFAULT_MAX_ATTEMPTS} — هر تلاش یک دادهٔ تازه می‌سازد و در برابر همهٔ قیود سنجیده می‌شود؛
                  تلاشِ بیشتر یعنی شانسِ بیشتر برای رعایتِ همهٔ قیود (و زمانِ بیشتر).
                </p>
              </div>
            </div>

            <h3 className="mt-5 font-extrabold text-stone-800 dark:text-stone-200">قیود مسیرهای مستقیم</h3>
            <p className={tinyCls}>
              برای هر مسیر مشخص کنید معنی‏دار باشد، نباشد یا مهم نباشد؛ بازهٔ الزامیِ پیش‌فرض برای قدرمطلق β برابر ۰٫۱۰ تا ۰٫۵۰ است. خالی‌کردن هر فیلد یعنی حذف همان قید.
              <strong className="text-stone-600 dark:text-stone-300">«جهت رابطه»</strong> به‌طور خودکار از جنسِ
              سازه‌ها استنتاج می‌شود: دو سازهٔ هم‌جنس (مانند «اعتیاد به بازی» و «پرخاشگری») رابطه‌ای مثبت و دو
              سازهٔ ناهم‌جنس (مانند «ارزیابی مجددِ شناختی» که سازگار است و «اعتیاد») رابطه‌ای منفی دارند.
            </p>
            <p className={`${tinyCls} mt-1`}>
              برای پرسشنامه‌های غیرجمع‌پذیر (بدون نمرهٔ کل، مانند ERQ) زیرمقیاس‌ها جهتِ اثرِ متفاوتی دارند؛
              بنابراین جدول فقط به‌ازای هر زیرمقیاس یک ردیفِ مستقل نشان می‌دهد و ردیفِ کلی یا «همهٔ زیرمقیاس‌ها» ندارد؛ مثلاً
              می‌توانید برای «ارزیابی مجدد شناختی» اثرِ <b>منفی و معنادار</b> و برای «فرونشانی هیجانی» اثرِ
              <b>مثبت و معنادار</b> بخواهید.
            </p>
            <div className="tool-table-wrap mt-3">
              <table className="tool-table" style={{ minWidth: 780 }}>
                <thead>
                  <tr>
                    <th>مسیر</th>
                    <th>وضعیت</th>
                    <th>جهت رابطه</th>
                    <th>β حداقل</th>
                    <th>β حداکثر</th>
                    <th>دامنه علمی متداول</th>
                  </tr>
                </thead>
                <tbody>
                  {pathRows.map((row) => {
                    // undefined = هنوز تنظیم نشده (پیش‌فرض)؛ null = کاربر عمداً قید را حذف کرده است.
                    const pickSet = <T,>(...values: (T | null | undefined)[]): T | null => {
                      for (const value of values) if (value !== undefined) return value;
                      return null;
                    };
                    const varTarget = constraints.pathTargets[row.varKey];
                    const nodeTarget = row.nodeKey ? constraints.nodePathTargets?.[row.nodeKey] : undefined;
                    const isGroup = false;
                    const dirValue = nodeTarget?.dir ?? varTarget?.dir ?? row.autoDir;
                    const dirForBase = dirValue as PathDirection;
                    const sigValue = nodeTarget?.sig ?? varTarget?.sig ?? "sig";
                    const betaMinValue = pickSet(nodeTarget?.betaMin, varTarget?.betaMin, DEFAULT_BETA_MIN);
                    const betaMaxValue = pickSet(nodeTarget?.betaMax, varTarget?.betaMax, DEFAULT_BETA_MAX);
                    const write = (patch: Partial<PathTarget>) =>
                      row.nodeKey && !isGroup
                        ? setNodePathTarget(row.nodeKey, patch, {
                            sig: sigValue,
                            betaMin: betaMinValue,
                            betaMax: betaMaxValue,
                            dir: dirForBase,
                          })
                        : setPathTarget(row.varKey, patch);
                    return (
                      <tr
                        key={row.id}
                        className={
                          row.kind === "group"
                            ? "bg-indigo-50/70 dark:bg-indigo-950/30"
                            : row.kind === "node"
                              ? "bg-white dark:bg-slate-900"
                              : ""
                        }
                      >
                        <td style={{ fontWeight: 900 }}>
                          {row.kind === "group" && (
                            <span className="me-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              همهٔ زیرمقیاس‌ها
                            </span>
                          )}
                          {row.kind === "node" && (
                            <span className="me-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-black text-stone-500 dark:bg-slate-800 dark:text-stone-400">
                              زیرمقیاس
                            </span>
                          )}
                          {row.label}
                          {row.hint && (
                            <span className="mt-0.5 block text-[10px] font-bold leading-4 text-stone-400 dark:text-stone-500">
                              {row.hint}
                            </span>
                          )}
                        </td>
                        <td>
                          <select
                            className={`${inputCls} !py-1.5`}
                            value={sigValue}
                            onChange={(e) => write({ sig: e.target.value as PathTarget["sig"] })}
                          >
                            <option value="sig">معنی‌دار باشد</option>
                            <option value="ns">معنی‌دار نباشد</option>
                            <option value="any">مهم نیست</option>
                          </select>
                        </td>
                        <td>
                          <select
                            className={`${inputCls} !py-1.5`}
                            value={dirValue}
                            onChange={(e) => write({ dir: e.target.value === "auto" ? undefined : (e.target.value as PathDirection) })}
                          >
                            {isGroup && row.mixed && <option value="auto">خودکار (بر اساس زیرمقیاس)</option>}
                            <option value="pos">مثبت</option>
                            <option value="neg">منفی</option>
                            <option value="any">مهم نیست</option>
                          </select>
                        </td>
                        <td>
                          <input
                            type="number"
                            step={0.05}
                            dir="ltr"
                            className={`${inputCls} !py-1.5`}
                            placeholder="—"
                            value={betaMinValue ?? ""}
                            onChange={(e) => write({ betaMin: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step={0.05}
                            dir="ltr"
                            className={`${inputCls} !py-1.5`}
                            placeholder="—"
                            value={betaMaxValue ?? ""}
                            onChange={(e) => write({ betaMax: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td className="text-[11px] font-extrabold leading-5 text-emerald-700 dark:text-emerald-300">
                          ۰٫۱۰ (کوچک) تا ۰٫۵۰ (بزرگ)
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {indirectRows.length > 0 && (
              <>
                <h3 className="mt-5 font-extrabold text-stone-800 dark:text-stone-200">قیود اثرات غیرمستقیم (میانجی‌گری — با بوت‌استرپ)</h3>
                <p className={tinyCls}>
                  معناداری، جهت و دامنهٔ اثر غیرمستقیم استانداردشده برای هر واحد قابل تنظیم و در تولید الزام‌آور است. جهت پیش‌فرض
                  خودکار است و می‌توان آن را به مثبت، منفی یا «مهم نیست» تغییر داد. متغیرِ بدون نمرهٔ کل هیچ ردیفِ کلی ندارد و هر
                  زیرمقیاس جداگانه نمایش داده می‌شود. کفِ پیش‌فرضِ ۰٫۰۶ و سقفِ ۰٫۳۰ برای حاصل‌ضرب دو ضریب واقع‌بینانه است.
                </p>
                <div className="tool-table-wrap mt-3">
                  <table className="tool-table" style={{ minWidth: 760 }}>
                    <thead>
                      <tr>
                        <th>مسیر غیرمستقیم</th>
                        <th>وضعیت</th>
                        <th>جهت اثر</th>
                        <th>حداقل اثر</th>
                        <th>حداکثر اثر</th>
                        <th>دامنه علمی متداول</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indirectRows.map((row) => {
                        const storedTarget = constraints.indirectTargets[row.key] ?? constraints.indirectTargets[row.legacyKey];
                        const target = { ...defaultIndirectConstraint(), ...storedTarget };
                        const directionValue = storedTarget?.dir ?? "auto";
                        return (
                          <tr key={row.key} className={row.isTotal ? "bg-stone-50 font-bold dark:bg-slate-900" : ""}>
                            <td>
                              {row.isTotal && (
                                <span className="me-2 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                                  وضعیت کلی
                                </span>
                              )}
                              {!row.isTotal && (
                                <span className="me-2 rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-black text-stone-500 dark:bg-slate-900 dark:text-stone-400">
                                  فرعی
                                </span>
                              )}
                              {row.label}
                            </td>
                            <td>
                              <select
                                className={`${inputCls} !py-1.5`}
                                value={target.significance}
                                onChange={(e) => setIndirectTarget(row.key, { significance: e.target.value as IndirectTarget })}
                              >
                                <option value="sig">معنی‌دار باشد</option>
                                <option value="ns">معنی‌دار نباشد</option>
                                <option value="any">مهم نیست</option>
                              </select>
                            </td>
                            <td>
                              <select
                                className={`${inputCls} !py-1.5`}
                                value={directionValue}
                                onChange={(e) => setIndirectTarget(row.key, {
                                  dir: e.target.value === "auto" ? undefined : e.target.value as PathDirection,
                                })}
                              >
                                <option value="auto">خودکار ({row.autoDir === "pos" ? "مثبت" : row.autoDir === "neg" ? "منفی" : "نامشخص"})</option>
                                <option value="pos">مثبت</option>
                                <option value="neg">منفی</option>
                                <option value="any">مهم نیست</option>
                              </select>
                            </td>
                            <td>
                              <input
                                type="number"
                                step={0.01}
                                dir="ltr"
                                className={`${inputCls} !min-w-24 !py-1.5`}
                                placeholder="آزاد"
                                value={target.min ?? ""}
                                onChange={(e) => setIndirectTarget(row.key, { min: e.target.value === "" ? null : Number(e.target.value) })}
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                step={0.01}
                                dir="ltr"
                                className={`${inputCls} !min-w-24 !py-1.5`}
                                placeholder="آزاد"
                                value={target.max ?? ""}
                                onChange={(e) => setIndirectTarget(row.key, { max: e.target.value === "" ? null : Number(e.target.value) })}
                              />
                            </td>
                            <td className="text-[11px] font-extrabold leading-5 text-emerald-700 dark:text-emerald-300">
                              ۰٫۰۶ تا ۰٫۳۰ (کوچک تا متوسط)
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <h3 className="mt-5 font-extrabold text-stone-800 dark:text-stone-200">پیش‌فرض‌های آماری (همگی قابل تنظیم)</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                { key: "enforceNormality" as const, title: "نرمال بودن تک‌متغیری", desc: "کجی < 3 و کشیدگی < 10 (کلاین) برای همه گره‌ها", range: "|کجی| < ۳ و |کشیدگی| < ۱۰", conflict: constraints.outlierPct > 0 },
                { key: "enforceLinearity" as const, title: "خطی بودن روابط", desc: "همبستگی همه فلش‌های فعال معنادار باشد", range: "p < ۰٫۰۵ برای همه فلش‌ها", conflict: false },
                { key: "enforceExogCorr" as const, title: "معناداری همبستگیِ پیش‌بین‌های برون‌زا", desc: "همبستگیِ همهٔ جفت‌های پیش‌بینِ برون‌زا معنادار باشد", range: "p < ۰٫۰۵ و VIF ماتریس ≤ ۴", conflict: false },
                { key: "enforceVif" as const, title: "عدم هم‌خطی چندگانه", desc: "VIF همه پیش‌بین‌ها کمتر از 5", range: "VIF < ۵ (تا ۱۰ قابل‌بحث)", conflict: false },
                { key: "enforceDw" as const, title: "استقلال خطاها", desc: "دوربین-واتسون بین 1.5 تا 2.5", range: "دوربین-واتسون ۱٫۵ تا ۲٫۵", conflict: false },
              ].map((item) => (
                <label
                  key={item.key}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800 ${
                    item.conflict ? "opacity-60" : ""
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={constraints[item.key] && !item.conflict}
                    disabled={item.conflict}
                    onChange={(e) => setConstraints({ ...constraints, [item.key]: e.target.checked })}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />
                  <span className="w-full">
                    <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">{item.title}</span>
                    <span className={tinyCls}>
                      {item.conflict ? "با وجود داده پرت عمدی، این قید خودکار غیرفعال است (سازگار نیستند)." : item.desc}
                    </span>
                    <span className="mt-1 block text-[11px] font-extrabold leading-5 text-emerald-700 dark:text-emerald-300">
                      دامنه علمی متداول: {item.range}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-3 max-w-md">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <input
                  type="checkbox"
                  checked={constraints.r2Range != null}
                  onChange={(e) => setConstraints({ ...constraints, r2Range: e.target.checked ? { min: 0.3, max: 0.6 } : null })}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span className="w-full">
                  <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">بازه R² متغیرهای نتیجه (Y)</span>
                  <span className="mt-1 flex gap-2">
                    <input type="number" step={0.05} dir="ltr" className={`${inputCls} !py-1`} disabled={constraints.r2Range == null} value={constraints.r2Range?.min ?? 0.3} onChange={(e) => setConstraints({ ...constraints, r2Range: { min: Number(e.target.value), max: constraints.r2Range?.max ?? 0.6 } })} />
                    <input type="number" step={0.05} dir="ltr" className={`${inputCls} !py-1`} disabled={constraints.r2Range == null} value={constraints.r2Range?.max ?? 0.6} onChange={(e) => setConstraints({ ...constraints, r2Range: { min: constraints.r2Range?.min ?? 0.3, max: Number(e.target.value) } })} />
                  </span>
                  <span className="mt-1 block text-[11px] font-extrabold leading-5 text-emerald-700 dark:text-emerald-300">
                    دامنه علمی متداول: ۰٫۰۲ (کوچک) · ۰٫۱۳ (متوسط) · ۰٫۲۶ (بزرگ) — کوهن
                  </span>
                </span>
              </label>
            </div>

            <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50/50 p-4 dark:border-indigo-900 dark:bg-indigo-950/20">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="font-extrabold text-indigo-900 dark:text-indigo-100">قیود شاخص‌های برازش</h3>
                  <p className="mt-1 text-[11px] leading-5 text-indigo-700 dark:text-indigo-300">
                    حداقل و حداکثر هر شاخص قابل تنظیم است. خانه خالی یعنی برای آن سمت محدودیتی اعمال نشود. پیش‌فرض‌ها
                    عمداً در محدوده قابل‌قبول اما غیرکامل تنظیم شده‌اند تا خروجی‌ها طبیعی و شبیه پژوهش واقعی باشند.
                  </p>
                </div>
                <button
                  type="button"
                  className={btnLight}
                  onClick={() => setConstraints((prev) => ({ ...prev, fit: defaultSemFitConstraints() }))}
                >
                  بازنشانی دامنه‌های علمی
                </button>
              </div>

              <div className="tool-table-wrap mt-3">
                <table className="tool-table" style={{ minWidth: 920 }}>
                  <thead>
                    <tr>
                      <th>شاخص</th>
                      <th>حداقل تولیدی</th>
                      <th>حداکثر تولیدی</th>
                      <th>دامنه علمی متداول</th>
                      <th>راهنمای تفسیر</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fitConstraintRows.map((row) => {
                      const range = constraints.fit[row.key];
                      return (
                        <tr key={row.key}>
                          <td className="font-black text-stone-800 dark:text-stone-200">{row.label}</td>
                          <td>
                            <input
                              type="number"
                              step={row.step}
                              dir="ltr"
                              className={`${inputCls} !min-w-24 !py-1.5`}
                              placeholder="آزاد"
                              value={range.min ?? ""}
                              onChange={(e) => setFitRange(row.key, "min", e.target.value === "" ? null : Number(e.target.value))}
                            />
                          </td>
                          <td>
                            <input
                              type="number"
                              step={row.step}
                              dir="ltr"
                              className={`${inputCls} !min-w-24 !py-1.5`}
                              placeholder="آزاد"
                              value={range.max ?? ""}
                              onChange={(e) => setFitRange(row.key, "max", e.target.value === "" ? null : Number(e.target.value))}
                            />
                          </td>
                          <td className="font-extrabold text-emerald-700 dark:text-emerald-300">{row.scientificRange}</td>
                          <td className="max-w-80 text-[11px] leading-5 text-stone-500 dark:text-stone-400">{row.interpretation}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="mt-3 rounded-xl border border-dashed border-emerald-300 bg-emerald-50/70 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-[12px] font-extrabold text-emerald-800 dark:text-emerald-300">پیش‌فرض واقع‌گرایانه</p>
                <p className="mt-1 text-[11px] leading-5 text-emerald-700 dark:text-emerald-400">
                  علاوه بر کف پذیرش علمی، برای بعضی شاخص‌ها سقف نیز گذاشته شده است؛ بنابراین موتور از خروجی‌های مصنوعیِ
                  کاملاً بی‌نقص مانند CFI=1 و RMSEA=0 عبور می‌کند و برازش خوب اما طبیعی می‌سازد.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ============ مرحله ۵: تشخیص ============ */}
        {currentStep === stepIdx("diagnose") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[6]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">تشخیص</h2>
              <HelpButtons section="diagnose" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              خلاصه وضعیت مدل را مرور کنید و تصمیم بگیرید؛ تولید داده یا اجرای تحلیل فقط از اینجا انجام می‌شود.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">منبع داده</p>
                <p className="mt-1 font-extrabold text-stone-800 dark:text-stone-200">
                  {source === "generate" ? "تولید داده تمرینی" : "داده واقعی خودم"}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">متغیرها / گره‌ها</p>
                <p className="mt-1 font-extrabold text-stone-800 dark:text-stone-200">
                  {modelVars.length} متغیر · {modelNodes.length} گره
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">فلش‌های فعال</p>
                <p className="mt-1 font-extrabold text-stone-800 dark:text-stone-200">
                  {modelArrows.length} از {allArrows.length}
                </p>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-[11px] font-bold text-stone-400 dark:text-stone-500">داده</p>
                <p className="mt-1 font-extrabold text-stone-800 dark:text-stone-200">
                  {rows.length} ردیف · {columns.length} ستون {source === "generate" && `· n=${n}`}
                </p>
              </div>
            </div>

            {rows.length > 0 && (
              <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">دامنه متغیرها</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {modelVars.map((v) => (
                    <span key={v.id} className="rounded-full bg-stone-100 px-3 py-1 text-[11px] font-bold text-stone-600 dark:bg-slate-900 dark:text-stone-400">
                      {v.name}
                      {v.subscales.length
                        ? v.hasTotal
                          ? ` (کل ${v.totalMin}-${v.totalMax})`
                          : ` (${v.subscales.map((s) => s.min + "-" + s.max).join("، ")})`
                        : ` (${v.totalMin}-${v.totalMax})`}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" className={btnPrimary} onClick={generate}>
                <Play className="h-4 w-4" />
                {rows.length ? "تولید مجدد داده و تحلیل" : "تولید داده و تحلیل"}
              </button>
              {genReport && (
                <button
                  type="button"
                  className={btnLight}
                  onClick={() => {
                    setGenPhase("done");
                    setGenOpen(true);
                  }}
                >
                  <ListChecks className="h-4 w-4" />
                  گزارش قیودِ آخرین تولید ({genReport.passed}/{genReport.total})
                </button>
              )}
              <span
                className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                  status.kind === "ok"
                    ? "font-bold text-emerald-700 dark:text-emerald-400"
                    : status.kind === "err"
                      ? "font-bold text-red-700 dark:text-red-400"
                      : "text-stone-400 dark:text-stone-500"
                }`}
              >
                {status.kind === "ok" ? "✓" : status.kind === "err" ? "✗" : "•"} {status.text}
              </span>
            </div>

            {source === "generate" && genReport && (
              <div
                className={`mt-4 rounded-2xl border p-4 ${
                  genReport.allPassed
                    ? "border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30"
                    : "border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30"
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p
                    className={`text-[13px] font-black ${
                      genReport.allPassed
                        ? "text-emerald-800 dark:text-emerald-300"
                        : "text-amber-800 dark:text-amber-300"
                    }`}
                  >
                    {genReport.allPassed
                      ? `همهٔ ${genReport.total} قید در ${genAttempts} تلاش رعایت شد`
                      : `${genReport.failed} قید از ${genReport.total} قید در ${genAttempts} تلاش رعایت نشد`}
                  </p>
                  <button
                    type="button"
                    className={btnLight}
                    onClick={() => {
                      setGenPhase("done");
                      setGenOpen(true);
                    }}
                  >
                    <ListChecks className="h-4 w-4" />
                    نمایش جدول قیود
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(
                    [
                      "برازش مدل",
                      "مسیر مستقیم",
                      "اثر غیرمستقیم",
                      "R² متغیر نتیجه",
                      "پیش‌فرض‌های آماری",
                    ] as ConstraintGroup[]
                  ).map((group) => {
                    const rowsOfGroup = genReport.checks.filter((check) => check.group === group);
                    if (!rowsOfGroup.length) return null;
                    const passedCount = rowsOfGroup.filter((check) => check.status === "pass").length;
                    const all = passedCount === rowsOfGroup.length;
                    return (
                      <span
                        key={group}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${
                          all
                            ? "border-emerald-300 bg-white text-emerald-700 dark:border-emerald-800 dark:bg-slate-900 dark:text-emerald-300"
                            : "border-amber-300 bg-white text-amber-700 dark:border-amber-800 dark:bg-slate-900 dark:text-amber-300"
                        }`}
                      >
                        {group}
                        <span className="rounded-full bg-stone-100 px-1.5 dark:bg-slate-800">
                          {passedCount}/{rowsOfGroup.length}
                        </span>
                      </span>
                    );
                  })}
                </div>
                {!genReport.allPassed && (
                  <p className="mt-2 text-[11px] leading-5 text-amber-700 dark:text-amber-400">
                    تعداد تلاش‌ها را بیشتر کنید یا دامنهٔ قیود را بازتر کنید؛ جدولِ گزارش دقیقاً نشان می‌دهد کدام قید و با
                    چه مقداری نقض شده است.
                  </p>
                )}
              </div>
            )}
            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-[13px] leading-6 text-stone-700 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300">
              {rows.length ? (
                <>
                  <p>
                    <b>وضعیت داده:</b> {rows.length} ردیف × {columns.length} ستون
                    {source === "generate" ? ` (n=${n})` : " (واردشده)"}
                  </p>
                  <p>
                    <b>وضعیت تحلیل:</b>{" "}
                    {analysisValid
                      ? analysis.sem.fit.valid
                        ? `اجرا شده — CFI=${fmt(analysis.sem.fit.cfi)}، RMSEA=${fmt(analysis.sem.fit.rmsea)}`
                        : "اجرا شده (برازش نامعتبر)"
                      : "اجرا نشده"}
                  </p>
                  {inputsChangedSinceAnalysis && analysisValid && (
                    <p className="mt-1 rounded-lg bg-amber-50 p-2 font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      ⚠ در بخش‌های قبل تغییری ایجاد شده است؛ برای اطمینان، تحلیل را دوباره اجرا کنید.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  <b>وضعیت داده:</b> هنوز داده‌ای تولید/وارد نشده است.
                </p>
              )}
            </div>

            {source === "generate" && !rows.length && (
              <p className={`${tinyCls} mt-2`}>
                هنوز داده‌ای تولید نشده است؛ با «تولید داده و تحلیل» داده ساخته و تحلیل اجرا می‌شود.
              </p>
            )}
            {source === "real" && !rows.length && (
              <p className={`${tinyCls} mt-2`}>
                هنوز داده‌ای وارد نشده است؛ به مرحله «جدول داده‌ها» برگردید و فایل اکسل را وارد کنید.
              </p>
            )}
          </section>
        )}


        {/* ============ مرحله ۶: جدول داده‌ها ============ */}
        {currentStep === stepIdx("data") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[5]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">جدول داده‌ها</h2>
              <HelpButtons section="data" />
            </div>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                  {source === "generate"
                    ? "داده‌ها در مرحله «تشخیص» تولید می‌شوند؛ اینجا می‌توانید داده موجود را ویرایش یا ایمپورت/اکسپورت کنید."
                    : "فایل اکسل داده‌های واقعی را وارد کنید یا از قالب داده استفاده کنید."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.xls"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImport(f);
                    e.target.value = "";
                  }}
                />
                <button type="button" className={btnSecondary} onClick={downloadTemplate}>
                  <FileSpreadsheet className="h-4 w-4" />
                  دانلود قالب داده
                </button>
                <button type="button" className={btnSecondary} onClick={() => fileRef.current?.click()}>
                  <Upload className="h-4 w-4" />
                  ایمپورت اکسل
                </button>
                <button type="button" className={btnSecondary} onClick={exportExcel}>
                  <Download className="h-4 w-4" />
                  اکسپورت اکسل
                </button>
              </div>
            </div>

            {rows.length > 0 ? (
              <div className="tool-table-wrap tool-table-scroll mt-4">
                <table className="tool-table" style={{ minWidth: Math.max(720, columns.length * 90) }}>
                  <thead>
                    <tr>
                      <th>ردیف</th>
                      {columns.map((c, i) => (
                        <th key={i}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i}>
                        <td className="row-index">{i + 1}</td>
                        {r.map((v, j) => (
                          <td key={j}>
                            <Cell value={v} onCommit={(nv) => updateCell(i, j, nv)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                هنوز داده‌ای وجود ندارد؛ در مرحله «تشخیص» داده تولید کنید یا فایل اکسل وارد کنید.
              </div>
            )}
          </section>
        )}

        {/* ============ مرحله: تحلیل ============ */}
        {currentStep === stepIdx("analysis") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[6]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">تحلیل</h2>
              <HelpButtons section="diagnose" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              داده آماده است؛ با «اجرای تحلیل» مدل روی داده فعلی برآورد می‌شود و مراحل بعدی (پیش‌فرض‌ها، توصیفی،
              دیاگرام، استنباطی) فعال می‌شوند.
            </p>
            {source === "real" && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] font-bold leading-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                حالت داده واقعی فعال است: هیچ‌یک از قیود تولید، ضرایب هدف یا دامنه‌های دلخواه به نتایج تحمیل نمی‌شود.
                محاسبات فقط از مقادیر فایل واردشده و مسیرهای مدل انجام می‌شوند؛ داده‌های گمشده نیز مطابق هر تحلیل به‌صورت
                زوجی یا لیستی حذف می‌شوند.
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-[13px] leading-6 text-stone-700 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300">
              {rows.length ? (
                <>
                  <p>
                    <b>وضعیت داده:</b> {rows.length} ردیف × {columns.length} ستون
                    {source === "generate" ? ` (n=${n})` : " (واردشده)"}
                  </p>
                  <p>
                    <b>وضعیت تحلیل:</b>{" "}
                    {analysisValid
                      ? analysis.sem.fit.valid
                        ? `اجرا شده — CFI=${fmt(analysis.sem.fit.cfi)}، RMSEA=${fmt(analysis.sem.fit.rmsea)}`
                        : "اجرا شده (برازش نامعتبر)"
                      : "اجرا نشده"}
                  </p>
                  {inputsChangedSinceAnalysis && analysisValid && (
                    <p className="mt-1 rounded-lg bg-amber-50 p-2 font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      ⚠ در بخش‌های قبل تغییری ایجاد شده است؛ برای اطمینان، تحلیل را دوباره اجرا کنید.
                    </p>
                  )}
                </>
              ) : (
                <p>
                  <b>وضعیت داده:</b> هنوز داده‌ای وجود ندارد؛ ابتدا در «جدول داده‌ها» داده تولید یا وارد کنید.
                </p>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                className={btnPrimary}
                disabled={!rows.length}
                onClick={() => analyze(undefined, undefined, undefined, true)}
              >
                <RefreshCw className="h-4 w-4" />
                {analysisValid ? "اجرای مجدد تحلیل" : "اجرای تحلیل"}
              </button>
              <span
                className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                  status.kind === "ok"
                    ? "font-bold text-emerald-700 dark:text-emerald-400"
                    : status.kind === "err"
                      ? "font-bold text-red-700 dark:text-red-400"
                      : "text-stone-400 dark:text-stone-500"
                }`}
              >
                {status.kind === "ok" ? "✓" : status.kind === "err" ? "✗" : "•"} {status.text}
              </span>
            </div>
          </section>
        )}

        {/* ============ مرحله ۷: بررسی پیش‌فرض‌ها ============ */}
        {currentStep === stepIdx("assumptions") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[7]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">بررسی پیش‌فرض‌های تحلیل</h2>
              <HelpButtons section="assumptions" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              شش پیش‌فرض استاندارد مدل معادلات ساختاری روی داده فعلی محاسبه می‌شود.
            </p>
            {!analysisValid ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                {analysis
                  ? "مدل تغییر کرده است؛ از مرحله «تشخیص» دوباره تحلیل را اجرا کنید."
                  : "ابتدا از مرحله «تشخیص» داده تولید یا تحلیل را اجرا کنید."}
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۱) داده‌های گمشده</h3>
                  <p className={tinyCls}>داده‌ها باید کامل باشند؛ تحلیل با حذف لیستی موارد ناقص انجام می‌شود.</p>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>ستون</th><th>تعداد گمشده</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {analysis.missing.map((m, i) => (
                          <tr key={i}>
                            <td>{m.col}</td>
                            <td className="number-cell">{m.count}</td>
                            <td dangerouslySetInnerHTML={{ __html: m.count === 0 ? badge(true, "کامل") : badge(false, `${m.count} گمشده`) }} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <AssumptionNote condition="هیچ سلولی از داده‌ها خالی نباشد" pass={analysis.missing.every((m) => m.count === 0)} />
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۲) داده پرت چندمتغیری (فاصله ماهالانوبیس)</h3>
                  <p className={tinyCls}>فاصله ماهالانوبیس برای هر مورد با توزیع کای‌دو مقایسه می‌شود؛ p کمتر از ۰/۰۵ نشانه داده پرت است.</p>
                  {analysis.maha.valid ? (
                    <>
                      <div className="tool-table-wrap mt-2">
                        <table className="tool-table">
                          <thead>
                            <tr><th>ردیف</th><th>فاصله ماهالانوبیس</th><th>p مقدار</th><th>وضعیت</th></tr>
                          </thead>
                          <tbody>
                            {analysis.maha.originalIdx.slice(0, 15).map((oi, i) => (
                              <tr key={oi}>
                                <td className="row-index">{oi + 1}</td>
                                <td className="number-cell">{fmt(analysis.maha.d2[i])}</td>
                                <td className="number-cell">{fmtP(analysis.maha.p[i])}</td>
                                <td dangerouslySetInnerHTML={{ __html: analysis.maha.p[i] < 0.05 ? badge(false, "داده پرت") : badge(true, "عادی") }} />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className={`${tinyCls} mt-2`}>
                        تعداد کل داده‌های پرت: {analysis.maha.outliers.length}
                        {analysis.maha.outliers.length === 0 ? " — داده پرت شناسایی نشد." : ""}
                      </p>
                    </>
                  ) : (
                    <p className={`${tinyCls} mt-2 text-red-600`}>{analysis.maha.message}</p>
                  )}
                  <AssumptionNote
                    condition="هیچ داده پرتی با p کمتر از ۰/۰۵ در فاصله ماهالانوبیس وجود نداشته باشد"
                    pass={analysis.maha.valid && analysis.maha.outliers.length === 0}
                  />
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۳) نرمال بودن تک‌متغیری (کجی و کشیدگی)</h3>
                  <p className={tinyCls}>بر اساس کلاین (۲۰۲۳): قدرمطلق کجی کمتر از ۳ و قدرمطلق کشیدگی کمتر از ۱۰.</p>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>متغیر / زیرمقیاس</th><th>کجی</th><th>CR کجی</th><th>کشیدگی</th><th>CR کشیدگی</th><th>نتیجه کجی</th><th>نتیجه کشیدگی</th></tr>
                      </thead>
                      <tbody>
                        {analysis.normals.map((x, i) => (
                          <tr key={i}>
                            <td>{x.name}</td>
                            <td className="number-cell">{fmt(x.skew)}</td>
                            <td className="number-cell">{fmt(x.skewCr)}</td>
                            <td className="number-cell">{fmt(x.kurt)}</td>
                            <td className="number-cell">{fmt(x.kurtCr)}</td>
                            <td dangerouslySetInnerHTML={{ __html: Math.abs(x.skew) < 3 ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                            <td dangerouslySetInnerHTML={{ __html: Math.abs(x.kurt) < 10 ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <AssumptionNote
                    condition="قدرمطلق کجی هر گره کمتر از ۳ و قدرمطلق کشیدگی کمتر از ۱۰ باشد"
                    pass={analysis.normals.every((x) => Math.abs(x.skew) < 3 && Math.abs(x.kurt) < 10)}
                  />
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۴) نرمال بودن چندمتغیری (ضریب مردیا، سازگار با AMOS)</h3>
                  <p className={tinyCls}>
                    محاسبه با نرمال‌سازی فاصله‌ها در n/(n−1) و مرکز نمونهٔ محدود p(p+2)(n−1)/(n+1)، همسان با AMOS؛ C.R. در تفسیر بزرگ‌نمونه مانند z است و |CR| ≤ {AMOS_MARDIA_CR_LIMIT} قابل قبول است.
                  </p>
                  {analysis.mardia.valid ? (
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>ضریب کشیدگی مردیا</th><th>نسبت بحرانی (CR)</th><th>نتیجه</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="number-cell">{fmt(analysis.mardia.kurtosis)}</td>
                            <td className="number-cell">{fmt(analysis.mardia.cr)}</td>
                            <td dangerouslySetInnerHTML={{ __html: Math.abs(analysis.mardia.cr) <= AMOS_MARDIA_CR_LIMIT ? badge(true, "نرمال چندمتغیره") : badge(false, "تخطی") }} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className={`${tinyCls} mt-2 text-red-600`}>{analysis.mardia.message}</p>
                  )}
                  <AssumptionNote
                    condition={`بر اساس تفسیر بزرگ‌نمونهٔ AMOS، قدرمطلق C.R. حداکثر ${AMOS_MARDIA_CR_LIMIT} باشد`}
                    pass={analysis.mardia.valid && Math.abs(analysis.mardia.cr) <= AMOS_MARDIA_CR_LIMIT}
                  />
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۵) خطی بودن روابط (ماتریس همبستگی پیرسون)</h3>
                  <p className={tinyCls}>
                    اعداد زیر قطر ماتریس؛ ** معناداری در سطح ۰/۰۱ و * در سطح ۰/۰۵. همبستگی‌ها دوطرفه و با حذف زوجی
                    داده‌های گمشده محاسبه می‌شوند.
                  </p>
                  <div className="mt-3">
                    <h4 className="text-[13px] font-extrabold text-stone-700 dark:text-stone-300">۵-۱) نمرات کل / گره‌های مدل</h4>
                    <CorrelationMatrixTable data={analysis.corr} />
                  </div>
                  <div className="mt-5">
                    <h4 className="text-[13px] font-extrabold text-stone-700 dark:text-stone-300">۵-۲) نمره کل و زیرمقیاس‌ها با هم</h4>
                    <CorrelationMatrixTable data={analysis.corrAll} />
                  </div>
                  <div className="mt-5">
                    <h4 className="text-[13px] font-extrabold text-stone-700 dark:text-stone-300">
                      ۵-۳) فقط زیرمقیاس‌ها؛ نمره کل برای متغیرهای بدون زیرمقیاس
                    </h4>
                    <CorrelationMatrixTable data={analysis.corrSubscales} />
                  </div>
                  <div className="mt-5">
                    <h4 className="text-[13px] font-extrabold text-stone-700 dark:text-stone-300">
                      ۵-۴) معناداریِ همبستگیِ پیش‌بین‌های برون‌زا
                    </h4>
                    <p className={tinyCls}>این شرط با گزینهٔ پیش‌فرضِ روشن در قیود تولید کنترل می‌شود؛ VIF ماتریس نیز حداکثر ۴ نگه داشته می‌شود.</p>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead><tr><th>جفت پیش‌بین</th><th>r</th><th>p</th><th>نتیجه</th></tr></thead>
                        <tbody>
                          {modelNodes.filter((node) => node.role === "exogenous").flatMap((left, i, list) =>
                            list.slice(i + 1).map((right) => {
                              const r = analysis.corr.r[left.nodeId]?.[right.nodeId] ?? NaN;
                              const p = analysis.corr.p[left.nodeId]?.[right.nodeId] ?? NaN;
                              return (
                                <tr key={`${left.nodeId}-${right.nodeId}`}>
                                  <td>{left.label} ↔ {right.label}</td>
                                  <td className="number-cell">{fmt(r)}</td>
                                  <td className="number-cell">{fmtP(p)}{starP(p)}</td>
                                  <td dangerouslySetInnerHTML={{ __html: badge(p < 0.05, p < 0.05 ? "معنادار" : "غیرمعنادار") }} />
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                    <AssumptionNote
                      condition="همبستگی همهٔ جفت‌های پیش‌بینِ برون‌زا در سطح ۰/۰۵ معنادار باشد"
                      pass={modelNodes.filter((node) => node.role === "exogenous").every((left, i, list) =>
                        list.slice(i + 1).every((right) => (analysis.corr.p[left.nodeId]?.[right.nodeId] ?? 1) < 0.05)
                      )}
                    />
                  </div>
                  <p className={`${tinyCls} mt-2 text-stone-500 dark:text-stone-400`}>** p &lt; 0.01 ، * p &lt; 0.05 (دوطرفه)</p>
                  <AssumptionNote
                    condition="همبستگی همه فلش‌های فعال مدل در سطح ۰/۰۵ معنادار باشد"
                    pass={modelArrows.every((a) => (analysis.corr.p[a.fromNode]?.[a.toNode] ?? 1) < 0.05)}
                  />
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۶) عدم هم‌خطی چندگانه و استقلال خطاها</h3>
                  <p className={tinyCls}>
                    برای خوانایی و انطباق با خروجی Coefficients در SPSS، شاخص‌های هم‌خطی برای هر پیش‌بین در یک ردیف و
                    آمارهٔ دوربین–واتسون در جدول مستقلِ هر معادلهٔ وابسته نمایش داده می‌شود.
                  </p>

                  <div className="mt-4 space-y-5">
                    <div>
                      <h4 className="text-[13px] font-extrabold text-stone-700 dark:text-stone-300">۶-۱) عدم هم‌خطی چندگانه</h4>
                      <p className={tinyCls}>معیار: تلورانس بیشتر از ۰/۲۰ و VIF کمتر از ۵ باشد (تلورانس = ۱/VIF).</p>
                      <div className="tool-table-wrap mt-2">
                        <table className="tool-table" style={{ minWidth: 760 }}>
                          <thead>
                            <tr>
                              <th rowSpan={2}>متغیر وابسته</th>
                              <th rowSpan={2}>پیش‌بین</th>
                              <th colSpan={2}>عدم هم‌خطی چندگانه</th>
                              <th rowSpan={2}>نتیجه</th>
                            </tr>
                            <tr><th>تلورانس</th><th>VIF</th></tr>
                          </thead>
                          <tbody>
                            {regressionDiagnostics?.collinearity.map((row, index, list) => {
                              const firstOfModel = index === 0 || list[index - 1].dependentNodeId !== row.dependentNodeId;
                              const rowSpan = firstOfModel
                                ? list.filter((candidate) => candidate.dependentNodeId === row.dependentNodeId).length
                                : 0;
                              return (
                                <tr key={`${row.dependentNodeId}-${row.predictorNodeId}`}>
                                  {firstOfModel && (
                                    <td rowSpan={rowSpan} className="align-middle" style={{ fontWeight: 900 }}>
                                      {row.dependentLabel}
                                    </td>
                                  )}
                                  <td>{row.predictorLabel}</td>
                                  <td className="number-cell">{Number.isFinite(row.tolerance) ? fmt(row.tolerance) : "—"}</td>
                                  <td className="number-cell">{Number.isFinite(row.vif) ? fmt(row.vif) : "—"}</td>
                                  <td dangerouslySetInnerHTML={{ __html: row.pass ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                                </tr>
                              );
                            })}
                            {!regressionDiagnostics?.collinearity.length && (
                              <tr><td colSpan={5} className="text-center text-stone-400">معادله‌ای با پیش‌بین فعال وجود ندارد.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <AssumptionNote
                        condition="تلورانس همهٔ پیش‌بین‌ها بیشتر از ۰/۲۰ و VIF آن‌ها کمتر از ۵ باشد"
                        pass={regressionDiagnostics?.collinearityPass ?? false}
                      />
                    </div>

                    <div>
                      <h4 className="text-[13px] font-extrabold text-stone-700 dark:text-stone-300">۶-۲) استقلال خطاها</h4>
                      <p className={tinyCls}>معیار: آمارهٔ دوربین–واتسون برای هر متغیر وابسته بین ۱/۵ تا ۲/۵ باشد.</p>
                      <div className="tool-table-wrap mt-2">
                        <table className="tool-table" style={{ minWidth: 620 }}>
                          <thead><tr><th>متغیر وابسته</th><th>دوربین–واتسون</th><th>دامنهٔ قابل قبول</th><th>نتیجه</th></tr></thead>
                          <tbody>
                            {regressionDiagnostics?.independence.map((row) => (
                              <tr key={row.dependentNodeId}>
                                <td style={{ fontWeight: 900 }}>{row.dependentLabel}</td>
                                <td className="number-cell">{Number.isFinite(row.durbinWatson) ? fmt(row.durbinWatson) : "—"}</td>
                                <td className="number-cell">۱/۵ تا ۲/۵</td>
                                <td dangerouslySetInnerHTML={{ __html: row.pass ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                              </tr>
                            ))}
                            {!regressionDiagnostics?.independence.length && (
                              <tr><td colSpan={4} className="text-center text-stone-400">معادله‌ای با پیش‌بین فعال وجود ندارد.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                      <AssumptionNote
                        condition="دوربین–واتسون همهٔ معادله‌های وابسته بین ۱/۵ تا ۲/۵ باشد"
                        pass={regressionDiagnostics?.independencePass ?? false}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* ============ مرحله ۸: یافته‌های توصیفی (درختی) ============ */}
        {currentStep === stepIdx("descriptive") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[0]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">یافته‌های توصیفی</h2>
              <HelpButtons section="descriptive" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              آمار توصیفی به‌صورت درخت‌واری: نمره کل هر متغیر و زیرمقیاس‌های آن در زیرش.
            </p>
            {!descriptive ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                ابتدا از مرحله «تشخیص» تحلیل را اجرا کنید.
              </div>
            ) : (
              <div className="tool-table-wrap mt-3">
                <table className="tool-table">
                  <thead>
                    <tr>
                      <th>متغیر / زیرمقیاس</th>
                      <th>n</th>
                      <th>میانگین</th>
                      <th>انحراف معیار</th>
                      <th>کمینه</th>
                      <th>بیشینه</th>
                      <th>کجی</th>
                      <th>کشیدگی</th>
                    </tr>
                  </thead>
                  <tbody>
                    {descriptive.map((d, i) => (
                      <tr key={i} className={d.bold ? "bg-stone-50 font-bold dark:bg-slate-900" : ""}>
                        <td style={{ fontWeight: d.bold ? 900 : 600, paddingInlineStart: d.indent ? "2rem" : undefined }}>{d.label}</td>
                        <td className="number-cell">{d.s.n}</td>
                        <td className="number-cell">{Number.isFinite(d.s.mean) ? fmt(d.s.mean) : "-"}</td>
                        <td className="number-cell">{Number.isFinite(d.s.sd) ? fmt(d.s.sd) : "-"}</td>
                        <td className="number-cell">{Number.isFinite(d.s.min) ? fmt(d.s.min) : "-"}</td>
                        <td className="number-cell">{Number.isFinite(d.s.max) ? fmt(d.s.max) : "-"}</td>
                        <td className="number-cell">{Number.isFinite(d.s.skew) ? fmt(d.s.skew) : "-"}</td>
                        <td className="number-cell">{Number.isFinite(d.s.kurt) ? fmt(d.s.kurt) : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {/* ============ مرحله ۹: دیاگرام مدل ============ */}
        {currentStep === stepIdx("diagram") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[1]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">دیاگرام مدل</h2>
              <HelpButtons section="diagram" />
            </div>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                  نمایش گرافیکی مدل با ضرایب مسیر (β) و R² گره‌ها.
                </p>
              </div>
              <button type="button" className={btnSecondary} onClick={() => setShowBigDiagram(true)}>
                <RefreshCw className="h-4 w-4" />
                مشاهده بزرگ
              </button>
            </div>
            <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
              <PathDiagram vars={modelVars} nodes={modelNodes} arrows={modelArrows} results={analysisValid ? analysis.sem : null} />
            </div>
          </section>
        )}

        {/* ============ مرحله ۱۰: یافته‌های استنباطی ============ */}
        {currentStep === stepIdx("inferential") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[2]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">یافته‌های استنباطی</h2>
              <HelpButtons section="inferential" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              ابتدا شاخص‌های برازش مدل، سپس ضرایب مسیر، اثرات و R².
            </p>
            {!analysisValid ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                ابتدا از مرحله «تشخیص» تحلیل را اجرا کنید.
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">شاخص‌های برازش مدل</h3>
                  {analysis.sem.fit.valid ? (
                    <>
                      <div className="tool-table-wrap mt-2">
                        <table className="tool-table" style={{ minWidth: 720 }}>
                          <thead>
                            <tr><th>شاخص</th><th>مقدار</th><th>معیار معمول</th><th>تفسیر</th></tr>
                          </thead>
                          <tbody>
                            {fitReportRows(analysis.sem.fit).map((row) => (
                              <tr key={row.index}>
                                <td className="font-extrabold">{row.index}</td>
                                <td className="number-cell font-black">{row.value}</td>
                                <td>{row.criterion}</td>
                                <td
                                  dangerouslySetInnerHTML={{
                                    __html: row.pass == null ? badgeWarn(row.interpretation) : badge(row.pass, row.interpretation),
                                  }}
                                />
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {analysis.sem.fit.message && (
                        <p className={`${tinyCls} mt-2 text-stone-500 dark:text-stone-400`}>{analysis.sem.fit.message}</p>
                      )}
                    </>
                  ) : (
                    <p className={`${tinyCls} mt-2 text-red-600`}>{analysis.sem.fit.message}</p>
                  )}
                  {analysis.sem.warnings.map((w, i) => (
                    <p key={i} className={`${tinyCls} mt-1 text-amber-700 dark:text-amber-400`}>{w}</p>
                  ))}
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">ضرایب مسیر (هر فلش)</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>مسیر</th><th>B</th><th>SE</th><th>t</th><th>p</th><th>β</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {analysis.sem.paths.length === 0 && (
                          <tr><td colSpan={7} className="muted">مسیر فعالی وجود ندارد.</td></tr>
                        )}
                        {analysis.sem.paths.map((pr, i) => (
                          <tr key={i}>
                            <td>{nodeLabel(pr.from)} ← {nodeLabel(pr.to)}</td>
                            <td className="number-cell">{fmt(pr.b)}</td>
                            <td className="number-cell">{fmt(pr.se)}</td>
                            <td className="number-cell">{fmt(pr.t)}</td>
                            <td className="number-cell">{fmtP(pr.p)}{starP(pr.p)}</td>
                            <td className="number-cell">{fmt(pr.std)}</td>
                            <td dangerouslySetInnerHTML={{ __html: pr.p < 0.05 ? badge(true, "معنی‌دار") : badge(false, "غیرمعنی‌دار") }} />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={`${tinyCls} mt-1 text-stone-500 dark:text-stone-400`}>* p &lt; 0.05 ، ** p &lt; 0.01 ، *** p &lt; 0.001</p>
                </div>

                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">اثرات مستقیم، غیرمستقیم و کل (بوت‌استرپ)</h3>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-[12px] font-bold text-stone-600 dark:text-stone-300">
                        تعداد نمونه:
                        <input
                          type="number"
                          dir="ltr"
                          className={`${inputCls} !w-24 !py-1`}
                          value={constraints.bootSamples}
                          onChange={(e) => setConstraints({ ...constraints, bootSamples: Number(e.target.value) })}
                        />
                      </label>
                      <button type="button" className={btnLight} disabled={bootBusy} onClick={() => runBootstrap()}>
                        <RefreshCw className={`h-4 w-4 ${bootBusy ? "animate-spin" : ""}`} />
                        {bootBusy ? "در حال اجرا..." : "اجرای بوت‌استرپ"}
                      </button>
                    </div>
                  </div>
                  <p className={tinyCls}>
                    هر مسیر میانجی جداگانه و «کل اثر غیرمستقیم» مجموع همه مسیرها. فاصله اطمینان ۹۵٪ با بوت‌استرپ.
                    این محاسبه پس از تولید داده یا اجرای تحلیل، <b>به‌صورت خودکار</b> انجام می‌شود؛ دکمهٔ بالا برای
                    نمونه‌گیریِ دوباره است. برای پرسشنامهٔ بدون نمرهٔ کل (مانند ERQ) هر زیرمقیاس یک ردیفِ مستقل دارد،
                    چون اثرِ کلِ چنین متغیری — با زیرمقیاس‌های ناهمسو — اساساً تعریف ندارد.
                  </p>

                  {bootBusy && bootElapsedMs != null && (
                    <p className={`${tinyCls} font-extrabold text-indigo-600 dark:text-indigo-300`} dir="rtl">
                      زمانِ سپری‌شده: {faNum((bootElapsedMs / 1000).toFixed(1))} ثانیه
                    </p>
                  )}

                  {!bootBusy && bootTiming && (
                    <p className={`${tinyCls} font-extrabold text-emerald-700 dark:text-emerald-300`} dir="rtl">
                      زمانِ بوت‌استرپ: {faNum((bootTiming.ms / 1000).toFixed(1))} ثانیه برای {faNum(bootTiming.samples)} نمونه
                      {bootTiming.workers > 1 ? ` با ${faNum(bootTiming.workers)} رشتهٔ موازی` : ""} — یعنی{" "}
                      {faNum((bootTiming.ms / Math.max(1, bootTiming.samples)).toFixed(1))} میلی‌ثانیه برای هر نمونه
                    </p>
                  )}

                  {bootBusy && (
                    <div className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-3 dark:border-stone-700 dark:bg-slate-900">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-extrabold text-stone-700 dark:text-stone-200">
                        <span className="inline-flex items-center gap-1.5">
                          <LoaderCircle className="h-3.5 w-3.5 animate-spin text-indigo-600 dark:text-indigo-400" />
                          در حال اجرای بوت‌استرپ...
                        </span>
                        <span dir="ltr">
                          {bootProgress
                            ? `${bootProgress.done} از ${bootProgress.total} نمونه (${
                                bootProgress.total > 0
                                  ? Math.round((bootProgress.done / bootProgress.total) * 100)
                                  : 0
                              }٪)`
                            : "در حال آماده‌سازی..."}
                        </span>
                      </div>
                      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-slate-700">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-indigo-600 to-violet-500 transition-[width] duration-200"
                          style={{
                            width: `${
                              bootProgress && bootProgress.total > 0
                                ? Math.max(2, Math.round((bootProgress.done / bootProgress.total) * 100))
                                : 2
                            }%`,
                          }}
                        />
                      </div>
                      <p className={`${tinyCls} mt-1.5`}>
                        هر نمونه یک برآوردِ کاملِ ML است؛ با گرادیانِ تحلیلی و اجرای موازی در چند رشته (Worker) انجام
                        می‌شود تا صفحه قفل نشود و زمان به چند ثانیه برسد.
                      </p>
                    </div>
                  )}

                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>مسیر غیرمستقیم</th><th>اثر مستقیم</th><th>اثر غیرمستقیم استاندارد</th><th>CI پایین ۹۵٪</th><th>CI بالا ۹۵٪</th><th>p</th><th>اثر کل</th><th>تفسیر نهایی</th></tr>
                      </thead>
                      <tbody>
                        {bootResults === null && (
                          <tr><td colSpan={8} className="muted">{bootBusy ? "در حال محاسبه بوت‌استرپ — پیشرفت در بالا نمایش داده می‌شود..." : "بوت‌استرپ اجرا نشده است؛ با دکمهٔ «اجرای بوت‌استرپ» دوباره نمونه‌گیری کنید."}</td></tr>
                        )}
                        {bootResults?.map((b, i) => {
                          const isTotal = b.viaVar === null;
                          const label = bootPathLabelOf(modelNodes, vars, b);
                          return (
                            <tr key={i} className={isTotal ? "bg-stone-50 font-bold dark:bg-slate-900" : ""}>
                              <td>{label}</td>
                              <td className="number-cell">{isTotal ? fmt(b.direct) : "—"}</td>
                              <td className="number-cell">{fmt(b.indirect)}</td>
                              <td className="number-cell">{fmt(b.lo)}</td>
                              <td className="number-cell">{fmt(b.hi)}</td>
                              <td className="number-cell">{fmtP(b.p)}{starP(b.p)}</td>
                              <td className="number-cell">{isTotal ? fmt(b.total) : "—"}</td>
                              <td
                                dangerouslySetInnerHTML={{
                                  __html:
                                    b.p < 0.05
                                      ? badge(Math.abs(b.indirect) >= 0.1 && Math.abs(b.indirect) <= 0.3, indirectEffectInterpretation(b.indirect, b.p))
                                      : badge(false, indirectEffectInterpretation(b.indirect, b.p)),
                                }}
                              />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {bootUsableNote && <p className={`${tinyCls} mt-1`}>{bootUsableNote}</p>}
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">R² متغیرهای درون‌زای مدل</h3>
                  <p className={tinyCls}>
                    R² هر متغیر درون‌زا یعنی درصد واریانس آن که توسط پیش‌بین‌هایش تبیین می‌شود (برای متغیرهای غیرجمع‌پذیر، هر زیرمقیاس جداگانه).
                  </p>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>متغیر / زیرمقیاس</th><th>R²</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {modelNodes.map((nd) =>
                          nd.role === "exogenous" ? null : (
                            <tr key={nd.nodeId}>
                              <td style={{ fontWeight: 900 }}>{nd.label}</td>
                              <td className="number-cell">{fmt(analysis.sem.r2[nd.nodeId] ?? 0)}</td>
                              <td dangerouslySetInnerHTML={{ __html: (analysis.sem.r2[nd.nodeId] ?? 0) >= 0.1 ? badge(true, "قابل قبول") : badgeWarn("کم") }} />
                            </tr>
                          )
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {analysis.meas.length > 0 && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">مدل اندازه‌گیری (آلفای کرونباخ و بارهای عاملی)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>متغیر پنهان</th><th>شاخص</th><th>بار عاملی</th><th>آلفای کرونباخ</th><th>نتیجه</th></tr>
                        </thead>
                        <tbody>
                          {analysis.meas.map((m) => (
                            <Fragment key={m.varId}>
                              <tr key={`${m.varId}-total`} style={{ background: "#f8fafc" }}>
                                <td rowSpan={m.subNames.length + 1} style={{ fontWeight: 900 }}>{m.name}</td>
                                <td style={{ fontWeight: 800 }}>نمره کل ({m.subNames.length} زیرمقیاس)</td>
                                <td className="number-cell">—</td>
                                <td className="number-cell">{fmt(m.alpha)}</td>
                                <td dangerouslySetInnerHTML={{ __html: m.alpha >= 0.7 ? badge(true, "قابل قبول") : badge(false, "ضعیف") }} />
                              </tr>
                              {m.subNames.map((s, si) => (
                                <tr key={`${m.varId}-${si}`}>
                                  <td>{s}</td>
                                  <td className="number-cell">{fmt(m.loadings[si])}</td>
                                  <td className="number-cell">—</td>
                                  <td />
                                </tr>
                              ))}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className={`${tinyCls} mt-1 text-stone-500 dark:text-stone-400`}>معیار پذیرش آلفای کرونباخ ≥ 0.70</p>
                  </div>
                )}

                {answerKey && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">کلید پاسخ (مقادیر هدف در برابر واقعی — مخصوص استاد)</h3>
                    <p className={`${tinyCls} mt-1`}>
                      ضرایب β «هدف» هنگام تولید در برابر ضرایب «واقعی» برآوردشده؛ دانشجو باید به ستون واقعی برسد. این
                      جدول فقط برای استاد است.
                    </p>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>مسیر</th><th>ضریب هدف (β)</th><th>ضریب واقعی (β)</th><th>وضعیت</th></tr>
                        </thead>
                        <tbody>
                          {answerKey.pathTargets.map((pt, i) => (
                            <tr key={i}>
                              <td>{nodeLabel(pt.fromNode)} ← {nodeLabel(pt.toNode)}</td>
                              <td className="number-cell">{fmt(pt.target)}</td>
                              <td className="number-cell">{fmt(pt.actual)}</td>
                              <td dangerouslySetInnerHTML={{ __html: Math.abs(pt.actual - pt.target) < 0.15 ? badge(true, "نزدیک به هدف") : badgeWarn("فاصله دارد") }} />
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <p className={`${tinyCls} mt-2`}>تعداد تلاش‌های تولید: {answerKey.attempts}</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}


        {/* ============ مرحله ۱۱: آلفای کرونباخ ============ */}
        {currentStep === stepIdx("alpha") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[3]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">محاسبه آلفای کرونباخ</h2>
              <div className="flex items-center gap-3">
                <HelpButtons section="alpha" />
                <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white p-2.5 dark:border-stone-700 dark:bg-slate-800">
                  <span className="text-sm font-extrabold text-stone-800 dark:text-stone-200">نیاز دارم؟</span>
                  <label className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-stone-700 dark:text-stone-300">
                    <input type="radio" name="wantAlpha" checked={wantAlpha} onChange={() => setWantAlpha(true)} className="h-4 w-4 accent-indigo-600" />
                    بله
                  </label>
                  <label className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-stone-700 dark:text-stone-300">
                    <input type="radio" name="wantAlpha" checked={!wantAlpha} onChange={() => setWantAlpha(false)} className="h-4 w-4 accent-indigo-600" />
                    خیر
                  </label>
                </div>
              </div>
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              این بخش اختیاری است؛ متغیرها و زیرمقیاس‌ها از همین پروژه می‌آیند. تولید گویه فقط بر پایهٔ نمره‌های موجود SEM انجام می‌شود
              تا جمع گویه‌های هر پاسخ‌دهنده دقیقاً با نمرهٔ زیرمقیاس و، در مقیاس جمع‌پذیر، با نمرهٔ کل سازگار بماند.
            </p>

            {!wantAlpha ? (
              <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-8 text-center text-sm font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                این مرحله فعلاً غیرفعال است — اگر خواستید، «بله» را انتخاب کنید تا محاسبه آلفا فعال شود.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">تعریف فشردهٔ گویه‌ها و زیرمقیاس‌ها</p>
                      <p className={tinyCls}>
                        نام مقیاس، همهٔ زیرمقیاس‌ها و مجازبودن نمرهٔ کل از «مشخصات متغیرها» خوانده می‌شود. هر شماره باید دقیقاً یک‌بار پوشش داده شود.
                      </p>
                    </div>
                    <button type="button" className={btnSecondary} onClick={downloadAlphaTemplate}>
                      <FileSpreadsheet className="h-4 w-4" /> دانلود قالب اکسل
                    </button>
                  </div>
                  <div className="mt-3 space-y-4">
                    {alphaScales.map((q) => (
                      <div key={q.varId} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-700 dark:bg-slate-900/60">
                        <div className="flex flex-wrap items-center gap-3">
                          <input className={`${inputCls} max-w-xs opacity-70`} value={q.name} disabled title="نام از متغیرهای پروژه می‌آید" />
                          <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold ${q.hasTotal ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"}`}>
                            {q.hasTotal ? "آلفای زیرمقیاس‌ها + کل" : "فقط آلفای زیرمقیاس‌ها؛ بدون کل"}
                          </span>
                        </div>

                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <div>
                            <label className={labelCls}>تعداد کل گویه‌های مقیاس</label>
                            <input type="number" min={2} step={1} dir="ltr" className={inputCls} value={q.itemCount} onChange={(event) => updateAlphaScale(q.varId, { itemCount: Number(event.target.value) })} />
                          </div>
                          <div>
                            <label className={labelCls}>حداقل مشترک گویه‌ها</label>
                            <input type="number" step={1} dir="ltr" className={inputCls} value={q.defaultMin} onChange={(event) => updateAlphaScale(q.varId, { defaultMin: Number(event.target.value) })} />
                          </div>
                          <div>
                            <label className={labelCls}>حداکثر مشترک گویه‌ها</label>
                            <input type="number" step={1} dir="ltr" className={inputCls} value={q.defaultMax} onChange={(event) => updateAlphaScale(q.varId, { defaultMax: Number(event.target.value) })} />
                          </div>
                        </div>

                        <div className="mt-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                          <p className="mb-2 text-[11px] font-extrabold text-stone-600 dark:text-stone-300">عضویت گویه‌ها در زیرمقیاس‌ها</p>
                          {q.subscales.length ? (
                            <div className="space-y-2">
                              {q.subscales.map((subscale) => (
                                <div key={subscale} className="grid items-center gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)]">
                                  <label className="text-[12px] font-bold text-stone-600 dark:text-stone-300">{subscale}</label>
                                  <input
                                    dir="ltr"
                                    className={inputCls}
                                    value={q.assignments[subscale] ?? ""}
                                    placeholder="مثال: 1-5,7,9-12"
                                    onChange={(event) => updateAlphaAssignment(q.varId, subscale, event.target.value)}
                                  />
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="grid items-center gap-2 sm:grid-cols-[minmax(180px,1fr)_minmax(220px,2fr)]">
                              <span className="text-[12px] font-bold text-stone-600 dark:text-stone-300">بدون زیرمقیاس</span>
                              <input dir="ltr" className={`${inputCls} opacity-70`} value={`1-${q.itemCount}`} disabled />
                            </div>
                          )}
                          <p className={`${tinyCls} mt-2`}>بازه و فهرست را می‌توان ترکیب کرد؛ مثال: <span dir="ltr">1-5,7,8-10</span>. گویهٔ جاافتاده، تکراری، نامعتبر یا خارج از بازه ادامه را مسدود می‌کند.</p>
                        </div>

                        <div className="mt-3">
                          <label className={labelCls}>استثناهای دامنهٔ گویه (اختیاری)</label>
                          <input
                            dir="ltr"
                            className={inputCls}
                            value={q.rangeExceptions}
                            placeholder="مثال: 3=0-4; 7-9=1-7"
                            onChange={(event) => updateAlphaScale(q.varId, { rangeExceptions: event.target.value })}
                          />
                          <p className={tinyCls}>ساختار هر بخش: شماره/بازهٔ گویه = حداقل-حداکثر؛ بخش‌ها را با «;» جدا کنید.</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-[12px] font-bold leading-6 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/30 dark:text-indigo-300">
                    حجم نمونه ثابت و برابر دادهٔ SEM موجود است: {rows.length || "—"} پاسخ‌دهنده. تولید مستقل بدون دادهٔ مرحلهٔ SEM انجام نمی‌شود.
                  </div>
                  <div>
                    <label className={labelCls}>حداقل آلفای هدف</label>
                    <input type="number" step={0.05} dir="ltr" className={inputCls} value={alphaMin} onChange={(event) => { invalidateGeneratedAlpha(); setAlphaMin(event.target.value); }} />
                  </div>
                  <div>
                    <label className={labelCls}>حداکثر آلفای هدف</label>
                    <input type="number" step={0.05} dir="ltr" className={inputCls} value={alphaMax} onChange={(event) => { invalidateGeneratedAlpha(); setAlphaMax(event.target.value); }} />
                  </div>
                </div>

                <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-2 dark:border-indigo-900 dark:bg-indigo-950/20">
                  <div className="grid gap-2 md:grid-cols-2">
                    <button type="button" onClick={() => setAlphaTab("training")} className={`rounded-xl px-4 py-3 text-sm font-extrabold transition ${alphaTab === "training" ? "bg-indigo-600 text-white shadow" : "bg-white text-stone-600 dark:bg-slate-800 dark:text-stone-300"}`}>
                      تولید گویه از دادهٔ SEM و محاسبهٔ آلفا
                    </button>
                    <button type="button" onClick={() => setAlphaTab("real")} className={`rounded-xl px-4 py-3 text-sm font-extrabold transition ${alphaTab === "real" ? "bg-indigo-600 text-white shadow" : "bg-white text-stone-600 dark:bg-slate-800 dark:text-stone-300"}`}>
                      محاسبهٔ آلفای کرونباخ بر اساس داده‌های واقعی خودم
                    </button>
                  </div>
                </div>

                <input ref={alphaFileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleAlphaImport(file);
                  event.target.value = "";
                }} />
                <div className="flex flex-wrap items-center gap-3">
                  {alphaTab === "training" ? (
                    <button type="button" className={btnPrimary} onClick={generateAlpha}><Play className="h-4 w-4" /> تولید گویه‌های منطبق با SEM</button>
                  ) : (
                    <button type="button" className={btnPrimary} onClick={() => alphaFileRef.current?.click()}><Upload className="h-4 w-4" /> ایمپورت اکسلِ داده‌های واقعی</button>
                  )}
                  <button type="button" className={btnSecondary} onClick={() => computeAlphaResult(alphaTab)}><RefreshCw className="h-4 w-4" /> محاسبهٔ آلفا</button>
                  <button type="button" className={btnSecondary} onClick={() => exportAlphaExcel(alphaTab)} disabled={!alphaCurrentRows.length}><Download className="h-4 w-4" /> اکسپورت اکسل</button>
                  <button type="button" className={btnLight} onClick={downloadAlphaTemplate}><FileSpreadsheet className="h-4 w-4" /> دانلود قالب</button>
                  <span className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${alphaStatus.kind === "ok" ? "font-bold text-emerald-700 dark:text-emerald-400" : alphaStatus.kind === "err" ? "font-bold text-red-700 dark:text-red-400" : "text-stone-400"}`}>
                    {alphaStatus.kind === "ok" ? "✓" : alphaStatus.kind === "err" ? "✗" : "•"} {alphaStatus.text || (alphaTab === "training" ? "آمادهٔ تولید گویه از نمره‌های SEM" : "قالب را دانلود و فایل واقعی را ایمپورت کنید")}
                  </span>
                </div>

                {alphaCurrentRows.length > 0 && (
                  <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">دادهٔ {alphaTab === "training" ? "تمرینی" : "واقعی"} ({alphaCurrentRows.length} نفر × {alphaCurrentCols.length} گویه)</p>
                      <button type="button" className={btnSecondary} onClick={() => exportAlphaExcel(alphaTab)}><Download className="h-4 w-4" /> خروجی اکسل همین داده</button>
                    </div>
                    <div className="tool-table-wrap tool-table-scroll mt-2">
                      <table className="tool-table" style={{ minWidth: Math.max(560, alphaCurrentCols.length * 110) }}>
                        <thead><tr><th>ردیف</th>{alphaCurrentCols.map((column, index) => <th key={index}>{column}</th>)}</tr></thead>
                        <tbody>{alphaCurrentRows.slice(0, 15).map((row, rowIndex) => (
                          <tr key={rowIndex}><td className="row-index">{rowIndex + 1}</td>{row.map((value, columnIndex) => <td key={columnIndex} className="number-cell">{value == null ? "" : value}</td>)}</tr>
                        ))}</tbody>
                      </table>
                    </div>
                  </div>
                )}

                {alphaCurrentResult && alphaCurrentResult.length > 0 && (
                  <div className="space-y-4">
                    {alphaCurrentResult.map((group, groupIndex) => (
                      <div key={groupIndex} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-extrabold text-stone-800 dark:text-stone-200">{group.name} <span className="text-[12px] font-bold text-stone-400">({group.k} گویه)</span></h3>
                          <div className="flex flex-wrap gap-2 text-[12px] font-bold">
                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">آلفا: {fmt(group.alpha)}</span>
                            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300">استانداردشده: {fmt(group.stdAlpha)}</span>
                            <span className={`rounded-full px-3 py-1 ${group.alpha >= 0.7 ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}`}>{group.alpha >= 0.7 ? "قابل قبول ✓" : "ضعیف ✗"}</span>
                          </div>
                        </div>
                        <div className="tool-table-wrap mt-3"><table className="tool-table">
                          <thead><tr><th>گویه</th><th>میانگین</th><th>انحراف معیار</th><th>همبستگی گویه-کل</th><th>آلفا اگر حذف شود</th></tr></thead>
                          <tbody>{group.items.map((item, index) => <tr key={index}><td>{item.name}</td><td className="number-cell">{fmt(item.mean)}</td><td className="number-cell">{fmt(item.sd)}</td><td className="number-cell">{fmt(item.itemTotal)}</td><td className="number-cell">{fmt(item.alphaIfDeleted)}</td></tr>)}</tbody>
                        </table></div>
                        <p className={`${tinyCls} mt-2`}>معیار: همبستگی گویه-کل ≥ ۰٫۳۰ مطلوب است؛ آلفای ۰٫۷۰ به بالا برای پژوهش قابل قبول است.</p>
                      </div>
                    ))}
                    <p className={`${tinyCls} text-center`}>نتایجِ تمرینی و واقعیِ موجود، هر دو در گزارش نهایی درج می‌شوند.</p>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============ مرحله ۱۲: نگارش گزارش ============ */}
        {currentStep === stepIdx("report") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[4]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">نگارش گزارش</h2>
              <HelpButtons section="report" />
            </div>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                  گزارش کامل تحلیل به‌صورت متن آماده. می‌توانید کپی کنید یا docx / txt دانلود کنید.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} onClick={exportDocx}>
                  <FileText className="h-4 w-4" />
                  دانلود گزارش docx
                </button>
                <button type="button" className={btnLight} onClick={exportTxt}>
                  <FileText className="h-4 w-4" />
                  گزارش txt
                </button>
                <button type="button" className={btnLight} onClick={copyReport}>
                  <Copy className="h-4 w-4" />
                  کپی گزارش
                </button>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
              <pre
                dir="rtl"
                className="max-h-[520px] overflow-auto whitespace-pre-wrap text-[12.5px] leading-7 text-stone-700 dark:text-stone-300"
              >
                {buildReportText(vars, modelNodes, analysis, answerKey, bootResults, rows.length, alphaReportText())}
              </pre>
            </div>
          </section>
        )}

        {/* ============ مرحله ۱۳: ذخیره ============ */}
        {currentStep === stepIdx("save") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[5]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">ذخیره</h2>
              <HelpButtons section="save" />
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              پروژه به‌صورت خودکار در مرورگر ذخیره می‌شود. برای انتقال یا بکاپ، فایل بکاپ بگیرید؛ خروجی‌های نهایی را هم
              می‌توانید از اینجا دانلود کنید.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">بکاپ این پروژه</p>
                <p className={`${tinyCls} mt-1`}>
                  فقط پروژه فعلی («{currentProject?.name ?? "—"}») با متغیرها، فلش‌ها، قیود و داده ذخیره می‌شود.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      const now = new Date();
                      const pad = (x: number) => String(x).padStart(2, "0");
                      setBackupName(`بکاپ-${currentProject?.name ?? "پروژه"}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
                      setBackupScope("one");
                      setBackupModal(true);
                    }}
                  >
                    <Download className="h-4 w-4" />
                    بکاپ این پروژه
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">بکاپ تمام پروژه‌ها</p>
                <p className={`${tinyCls} mt-1`}>
                  همه {projects.length} پروژه با هم در یک فایل ذخیره می‌شوند؛ برای انتقال کامل بین مرورگرها مناسب است.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnSecondary} onClick={openBackupModal}>
                    <Download className="h-4 w-4" />
                    بکاپ تمام پروژه‌ها
                  </button>
                  <button type="button" className={btnLight} onClick={() => restoreRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                    بازیابی
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">خروجی‌های نهایی</p>
                <p className={`${tinyCls} mt-1`}>
                  اکسل کامل (داده، نمرات کل، گزارش)، گزارش docx و txt، و قالب داده برای پر کردن مجدد.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} onClick={exportExcel}>
                    <Download className="h-4 w-4" />
                    دانلود اکسل کامل
                  </button>
                  <button type="button" className={btnLight} onClick={exportDocx}>
                    <FileText className="h-4 w-4" />
                    گزارش docx
                  </button>
                  <button type="button" className={btnLight} onClick={downloadTemplate}>
                    <FileSpreadsheet className="h-4 w-4" />
                    قالب داده
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-indigo-300 bg-indigo-50/60 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
              <div>
                <p className="text-sm font-extrabold text-indigo-800 dark:text-indigo-300">شروع دوباره؟</p>
                <p className={`${tinyCls} mt-1 text-indigo-700 dark:text-indigo-400`}>
                  برای شروع یک پروژه جدید از صفر، پروژه جدید بسازید — به مرحله اول برمی‌گردد.
                </p>
              </div>
              <button type="button" className={btnSecondary} onClick={() => setProjectModal(true)}>
                <FolderPlus className="h-4 w-4" />
                پروژه جدید
              </button>
            </div>
          </section>
        )}

      </div>

      {/* ---------- مودال نمایش بزرگ دیاگرام ---------- */}
      {showBigDiagram && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowBigDiagram(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[90vh] w-full max-w-5xl overflow-auto rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">دیاگرام بزرگ مدل</h3>
              <button type="button" className={btnLight} onClick={() => setShowBigDiagram(false)}>
                بستن
              </button>
            </div>
            <ZoomableDiagram>
              <PathDiagram vars={modelVars} nodes={modelNodes} arrows={modelArrows} results={analysisValid ? analysis.sem : null} />
            </ZoomableDiagram>
          </div>
        </div>
      )}

      {/* ---------- مودال تشخیص (تصمیم تولید داده) ---------- */}
      {diagnoseModal && (
        <div
          className="fixed inset-0 z-[72] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setDiagnoseModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex flex-col items-center text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
              </span>
              <h3 className="mt-3 text-lg font-black text-stone-900 dark:text-stone-100">وضعیت داده</h3>
            </div>

            <div className="mt-4 rounded-xl bg-stone-50 p-4 text-[13px] leading-6 text-stone-700 dark:bg-slate-900 dark:text-stone-300">
              {rows.length ? (
                <p>
                  <b>داده آماده است:</b> {rows.length} ردیف × {columns.length} ستون
                  {source === "generate" ? ` (n=${n})` : " (واردشده)"} — می‌توانید دوباره تولید کنید یا به مرحله بعد
                  بروید.
                </p>
              ) : (
                <p>
                  <b>هنوز داده‌ای تولید نشده است.</b> با دکمه زیر داده تمرینی ساخته و تحلیل اجرا می‌شود.
                </p>
              )}
            </div>

            <div className="mt-4 grid gap-2">
              <button
                type="button"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white shadow transition hover:bg-indigo-500"
                onClick={() => {
                  setDiagnoseModal(false);
                  generate();
                  markDone("diagnose");
                  setActiveStep(Math.min(stepIdx("diagnose") + 1, steps.length - 1));
                }}
              >
                <Play className="h-4 w-4" />
                {rows.length ? "تولید مجدد داده و تحلیل" : "تولید داده و تحلیل"}
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-200 pt-4 dark:border-stone-700">
              <button
                type="button"
                className="text-[13px] font-bold text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
                onClick={() => setDiagnoseModal(false)}
              >
                بستن
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-emerald-500"
                onClick={() => {
                  setDiagnoseModal(false);
                  markDone("diagnose");
                  setActiveStep(Math.min(stepIdx("diagnose") + 1, steps.length - 1));
                }}
              >
                برو مرحله بعدی
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- مودال پروژه جدید ---------- */}
      {projectModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setProjectModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">پروژه جدید</h3>
            <p className="mt-1 text-[12px] text-stone-500 dark:text-stone-400">
              نام پروژه را وارد کنید؛ با متغیرهای پیش‌فرض شروع می‌شود و به مرحله اول برمی‌گردید.
            </p>
            <input
              className={`${inputCls} mt-3`}
              value={newProjectName}
              placeholder={`پروژه ${projects.length + 1}`}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") createProject();
              }}
              autoFocus
            />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnLight} onClick={() => setProjectModal(false)}>
                انصراف
              </button>
              <button type="button" className={btnPrimary} onClick={createProject}>
                <FolderPlus className="h-4 w-4" />
                ایجاد پروژه
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- مودال بکاپ ---------- */}
      {backupModal && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
          onClick={() => setBackupModal(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">بکاپ پروژه‌ها</h3>
            <p className="mt-1 text-[12px] text-stone-500 dark:text-stone-400">
              بکاپ شامل متغیرها، فلش‌ها، قیود و داده همه پروژه‌ها (یا فقط همین پروژه) است. تاریخ و ساعت به‌صورت خودکار در
              نام پیش‌فرض آمده است.
            </p>

            <div className="mt-3 space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm font-bold text-stone-700 dark:border-stone-700 dark:bg-slate-900 dark:text-stone-300">
                <input
                  type="radio"
                  name="backupScope"
                  checked={backupScope === "all"}
                  onChange={() => setBackupScope("all")}
                  className="h-4 w-4 accent-indigo-600"
                />
                بکاپ کامل (همه {projects.length} پروژه)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm font-bold text-stone-700 dark:border-stone-700 dark:bg-slate-900 dark:text-stone-300">
                <input
                  type="radio"
                  name="backupScope"
                  checked={backupScope === "one"}
                  onChange={() => setBackupScope("one")}
                  className="h-4 w-4 accent-indigo-600"
                />
                فقط پروژه فعلی ({currentProject?.name ?? "—"})
              </label>
            </div>

            <input
              dir="ltr"
              className={`${inputCls} mt-3`}
              value={backupName}
              onChange={(e) => setBackupName(e.target.value)}
              autoFocus
            />

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnLight} onClick={() => setBackupModal(false)}>
                انصراف
              </button>
              <button type="button" className={btnPrimary} onClick={doBackup}>
                <Download className="h-4 w-4" />
                دانلود بکاپ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- مودال تولید داده: پیشرفتِ زنده + گزارش قیود ---------- */}
      <SemGenerationModal
        open={genOpen}
        phase={genPhase}
        progress={genProgress}
        report={genReport}
        errorMessage={genError}
        attempts={genAttempts}
        cancelled={genCancelled}
        onCancel={() => {
          genCancelRef.current = true;
          genWorkerRef.current?.postMessage({ type: "cancel" });
          setStatus({ text: "در حال توقف تولید...", kind: "" });
        }}
        onClose={() => setGenOpen(false)}
        onRetry={() => generate()}
      />

      {/* ---------- مودال نتیجه ---------- */}
      {modal && <ResultModal ok={modal.ok} lines={modal.lines} onClose={() => setModal(null)} />}
    </div>
  );
}

export default function SemPage() {
  return (
    <ErrorBoundary>
      <SemTool />
    </ErrorBoundary>
  );
}
