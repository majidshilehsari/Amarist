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
  pcaLoadings,
  skewness,
  correlationMatrixWithP,
  type ModelNode,
  type Role,
  type SemResults,
} from "@/lib/sem-stats";
import {
  generateSemData,
  buildModelNodes,
  buildModelArrows,
  type GenConstraints,
  type IndirectTarget,
  type PathTarget,
  type SemAnswerKey,
  type VariableSpec,
} from "@/lib/sem-generator";
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
    const cols: number[][] = idxs
      .filter((i): i is number => i != null)
      .map((i) => rows.map((r) => r[i] as number));
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

function stdAlphaOf(cols: number[][]): number {
  const k = cols.length;
  if (k < 2) return NaN;
  const corr = correlationMatrixWithP(cols).r;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      sum += corr[i][j];
      count++;
    }
  }
  if (!count) return NaN;
  const rBar = sum / count;
  return (k * rBar) / (1 + (k - 1) * rBar);
}

function pearsonCorr(x: number[], y: number[]): number {
  const n = Math.min(x.length, y.length);
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
  }
  const mx = sx / n;
  const my = sy / n;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return NaN;
  return sxy / Math.sqrt(sxx * syy);
}

function varNameOf(vars: VariableSpec[], id: number): string {
  return vars.find((v) => v.id === id)?.name ?? `متغیر ${id}`;
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
  direct: number;
  indirect: number;
  lo: number;
  hi: number;
  p: number;
  total: number;
};

type Analysis = {
  nodeIds: number[];
  nodeCols: number[][];
  indicatorCols: Record<number, number[][]>;
  sem: SemResults;
  corr: { r: number[][]; p: number[][] };
  maha: ReturnType<typeof mahalanobisDistances>;
  mardia: ReturnType<typeof mardiaTest>;
  missing: { col: string; count: number }[];
  normals: { name: string; skew: number; kurt: number }[];
  meas: { varId: number; name: string; alpha: number; loadings: number[]; subNames: string[] }[];
};

type ModalState = { ok: boolean; lines: string[] } | null;

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
    cfiMin: 0.9,
    rmseaMax: 0.08,
    chi2dfMax: 3,
    srmrMax: 0.08,
    missingPct: 0,
    outlierPct: 0,
    enforceNormality: true,
    enforceLinearity: true,
    enforceVif: true,
    enforceDw: true,
    bootSamples: 5000,
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

const legacyShirdelVars: VariableSpec[] = [
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

const shirdelVars: VariableSpec[] = [
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

function cloneVariableSpecs(vars: VariableSpec[]): VariableSpec[] {
  return vars.map((variable) => ({
    ...variable,
    subscales: variable.subscales.map((subscale) => ({ ...subscale })),
  }));
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
  };
}

const LEGACY_SHIRDEL_PROJECT_ID = "default-shirdel-v1";
const SHIRDEL_PROJECT_ID = "default-shirdel-v2";
const SHIRDEL_PROJECT_NAME = "پروژه پیش‌فرض (شیردل)";
const SHIRDEL_PROJECT_SEED_KEY = "amarist-sem-shirdel-project-seeded-v2";

function createSeedProject(id: string, name: string, vars: VariableSpec[]): Project {
  return {
    id,
    name,
    updatedAt: new Date().toISOString(),
    data: defaultProjectData(vars),
  };
}

function markShirdelProjectSeeded() {
  try {
    localStorage.setItem(SHIRDEL_PROJECT_SEED_KEY, "1");
  } catch {
    // ignore
  }
}

function isUntouchedLegacyShirdelProject(project: Project): boolean {
  const data = project.data;
  return (
    project.id === LEGACY_SHIRDEL_PROJECT_ID &&
    data.source === "generate" &&
    data.n === "250" &&
    data.rows.length === 0 &&
    data.columns.length === 0 &&
    data.inactiveArrowIds.length === 0 &&
    Object.keys(data.colMap).length === 0 &&
    JSON.stringify(data.vars) === JSON.stringify(legacyShirdelVars) &&
    JSON.stringify(data.constraints) === JSON.stringify(defaultConstraints())
  );
}

function loadInitialProjects(): Project[] {
  const existing = loadProjects();

  if (!existing.length) {
    const seeded = [
      createSeedProject(uid(), "پروژه پیش‌فرض", initialVars),
      createSeedProject(SHIRDEL_PROJECT_ID, SHIRDEL_PROJECT_NAME, shirdelVars),
    ];
    saveProjects(seeded);
    markShirdelProjectSeeded();
    return seeded;
  }

  if (existing.some((project) => project.id === SHIRDEL_PROJECT_ID)) {
    markShirdelProjectSeeded();
    return existing;
  }

  try {
    if (localStorage.getItem(SHIRDEL_PROJECT_SEED_KEY) === "1") return existing;
  } catch {
    // localStorage is unavailable; continue with an in-memory seed
  }

  const legacyIndex = existing.findIndex((project) => project.id === LEGACY_SHIRDEL_PROJECT_ID);
  let seeded: Project[];

  if (legacyIndex >= 0 && isUntouchedLegacyShirdelProject(existing[legacyIndex])) {
    seeded = existing.map((project, index) =>
      index === legacyIndex ? createSeedProject(SHIRDEL_PROJECT_ID, SHIRDEL_PROJECT_NAME, shirdelVars) : project
    );
  } else {
    const preserved = existing.map((project) =>
      project.id === LEGACY_SHIRDEL_PROJECT_ID && project.name === SHIRDEL_PROJECT_NAME
        ? { ...project, name: `${SHIRDEL_PROJECT_NAME} — نسخه قبلی` }
        : project
    );
    seeded = [...preserved, createSeedProject(SHIRDEL_PROJECT_ID, SHIRDEL_PROJECT_NAME, shirdelVars)];
  }

  saveProjects(seeded);
  markShirdelProjectSeeded();
  return seeded;
}

type ScoringGuideTable = {
  title: string;
  rows: { component: string; items: string; range: string; interpretation: string }[];
  notes: string[];
};

const shirdelScoringGuide: ScoringGuideTable[] = [
  {
    title: "تاب‌آوری کانر–دیویدسون (CD-RISC-10)",
    rows: [
      {
        component: "تاب‌آوری (نمره کل)",
        items: "۱ تا ۱۰",
        range: "۰ تا ۴۰",
        interpretation: "نمره بالاتر نشان‌دهنده تاب‌آوری بیشتر است.",
      },
      {
        component: "روش پاسخ‌دهی",
        items: "همه گویه‌ها",
        range: "لیکرت ۵ درجه‌ای؛ ۰ تا ۴",
        interpretation: "۰=اصلاً درست نیست؛ ۴=تقریباً همیشه درست است.",
      },
    ],
    notes: ["در مدل، فقط نمره کل ۰ تا ۴۰ به‌عنوان متغیر مشاهده‌شده وارد می‌شود."],
  },
  {
    title: "پرسشنامه پیری موفق (SAS)",
    rows: [
      {
        component: "سبک زندگی سالم",
        items: "۱، ۷، ۸، ۱۲",
        range: "۴ تا ۲۸",
        interpretation: "نمره بالاتر نشان‌دهنده سبک زندگی سالم‌تر است.",
      },
      {
        component: "مقابله سازگار",
        items: "۲، ۳، ۱۱، ۱۳",
        range: "۴ تا ۲۸",
        interpretation: "نمره بالاتر نشان‌دهنده توانایی بیشتر در مقابله سازگار است.",
      },
      {
        component: "درگیر شدن با زندگی",
        items: "۴، ۵، ۶، ۹، ۱۰",
        range: "۵ تا ۳۵",
        interpretation: "نمره بالاتر نشان‌دهنده مشارکت و درگیری بیشتر با زندگی است.",
      },
      {
        component: "پیری موفق (نمره کل)",
        items: "۱ تا ۱۳",
        range: "۱۳ تا ۹۱",
        interpretation: "نمره بالاتر نشان‌دهنده پیری موفق‌تر است.",
      },
    ],
    notes: ["گویه شماره ۱ معکوس نمره‌گذاری می‌شود.", "در مدل، فقط نمره کل ۱۳ تا ۹۱ وارد می‌شود؛ خرده‌مقیاس‌ها صرفاً برای نمره‌گذاری و گزارش توصیفی‌اند."],
  },
  {
    title: "شبکه اجتماعی لوبن، نسخه ۶ سؤالی (LSNS-6)",
    rows: [
      {
        component: "شبکه اجتماعی خانواده",
        items: "۱، ۲، ۳",
        range: "۰ تا ۱۵",
        interpretation: "نمره بالاتر نشان‌دهنده ارتباط خانوادگی بیشتر است.",
      },
      {
        component: "شبکه اجتماعی دوستان",
        items: "۴، ۵، ۶",
        range: "۰ تا ۱۵",
        interpretation: "نمره بالاتر نشان‌دهنده ارتباط دوستانه بیشتر است.",
      },
      {
        component: "مشارکت اجتماعی (نمره کل)",
        items: "۱ تا ۶",
        range: "۰ تا ۳۰",
        interpretation: "نمره بالاتر نشان‌دهنده شبکه اجتماعی قوی‌تر و مشارکت اجتماعی بیشتر است.",
      },
    ],
    notes: ["در مدل، فقط نمره کل ۰ تا ۳۰ وارد می‌شود؛ خانواده و دوستان جداگانه وارد مدل نمی‌شوند."],
  },
];


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
  const { sem, corr, maha, mardia, missing, normals, meas } = analysis;
  const nodeLabel = (id: number) => nodes.find((x) => x.nodeId === id)?.label ?? `گره ${id}`;
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
  normals.forEach((x) => L.push(`  ${x.name}: کجی=${fmt(x.skew)} | کشیدگی=${fmt(x.kurt)}`));
  L.push("");
  L.push("۴) نرمال بودن چندمتغیری (مردیا):");
  L.push(
    mardia.valid
      ? `  ضریب کشیدگی مردیا=${fmt(mardia.kurtosis)} | نسبت بحرانی=${fmt(mardia.cr)} (بلانچ: کمتر از 5)`
      : `  ${mardia.message}`
  );
  L.push("");
  L.push("۵) ماتریس همبستگی پیرسون (نمرات کل / گره‌ها):");
  corr.r.forEach((row, i) => {
    L.push(
      `  ${nodeLabel(i)}: ` +
        row
          .map((r, j) =>
            j > i ? `${nodeLabel(j)}=${fmt(r)}${corr.p[i][j] < 0.01 ? "**" : corr.p[i][j] < 0.05 ? "*" : ""}` : ""
          )
          .filter(Boolean)
          .join("، ")
    );
  });
  L.push("  ** p < 0.01 ، * p < 0.05");
  L.push("");
  L.push("۶) هم‌خطی و استقلال خطاها:");
  nodes.forEach((nd) => {
    if (nd.role === "exogenous") return;
    const vifs = sem.vifs[nd.nodeId] ?? [];
    const dw = sem.dw[nd.nodeId];
    if (vifs.length) {
      L.push(`  ${nd.label}: VIF=${vifs.map((x) => fmt(x)).join("، ")} | دوربین-واتسون=${Number.isFinite(dw as number) ? fmt(dw as number) : "-"}`);
    }
  });
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
      const pathLabel = b.viaVar
        ? `${varNameOf(vars, b.fromVar)} ← ${varNameOf(vars, b.viaVar)} ← ${varNameOf(vars, b.toVar)}`
        : `کل اثر غیرمستقیم: ${varNameOf(vars, b.fromVar)} ← ${varNameOf(vars, b.toVar)}`;
      L.push(
        `  ${pathLabel}: اثر=${fmt(b.indirect)} | CI95: ${fmt(b.lo)} تا ${fmt(b.hi)} | p=${fmtP(b.p)}${starP(b.p)}` +
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
    L.push(
      `  χ²=${fmt(sem.fit.chi2)} | df=${sem.fit.df} | χ²/df=${fmt(sem.fit.chi2df)} | CFI=${fmt(sem.fit.cfi)} | TLI=${fmt(sem.fit.tli)} | RMSEA=${fmt(sem.fit.rmsea)} | SRMR=${fmt(sem.fit.srmr)}`
    );
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

  const { sem, corr, maha, mardia, missing, normals, meas } = analysis;
  const nodeLabel = (id: number) => nodes.find((x) => x.nodeId === id)?.label ?? `گره ${id}`;

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
      ["گره", "کجی", "کشیدگی", "نتیجه کجی", "نتیجه کشیدگی"],
      normals.map((x) => [
        x.name,
        fmt(x.skew),
        fmt(x.kurt),
        Math.abs(x.skew) < 3 ? "برقرار" : "برقرار نیست",
        Math.abs(x.kurt) < 10 ? "برقرار" : "برقرار نیست",
      ])
    )
  );
  children.push(docP("معیار کلاین (۲۰۲۳): قدرمطلق کجی < ۳ و قدرمطلق کشیدگی < ۱۰.", { size: 20, color: "666666" }));

  // ۴) مردیا
  children.push(docH("۴) نرمال بودن چندمتغیری (مردیا)"));
  children.push(
    mardia.valid
      ? docP(`ضریب کشیدگی مردیا: ${faNum(fmt(mardia.kurtosis))} | نسبت بحرانی: ${faNum(fmt(mardia.cr))} — ${mardia.cr < 5 ? "نرمال چندمتغیره برقرار است" : "تخطی از نرمال چندمتغیری"}`)
      : docP(mardia.message)
  );

  // ۵) همبستگی
  children.push(docH("۵) ماتریس همبستگی پیرسون"));
  children.push(
    docTable(
      ["", ...nodes.map((nd) => nd.label)],
      nodes.map((nd, i) => [
        nd.label,
        ...nodes.map((_, j) => {
          if (i === j) return "1";
          if (i < j) return "";
          const r = corr.r?.[i]?.[j] ?? NaN;
          const p = corr.p?.[i]?.[j] ?? 1;
          return `${fmt(r)}${p < 0.01 ? "**" : p < 0.05 ? "*" : ""}`;
        }),
      ])
    )
  );
  children.push(docP("** p < 0.01 ، * p < 0.05", { size: 20, color: "666666" }));

  // ۶) VIF / DW
  children.push(docH("۶) عدم هم‌خطی چندگانه و استقلال خطاها"));
  const vifRows: (string | number)[][] = [];
  nodes.forEach((nd) => {
    if (nd.role === "exogenous") return;
    const vifs = sem.vifs[nd.nodeId] ?? [];
    const dw = sem.dw[nd.nodeId];
    if (vifs.length) {
      vifRows.push([nd.label, vifs.map((x) => fmt(x)).join("، "), vifs.map((x) => fmt(1 / x)).join("، "), Number.isFinite(dw as number) ? fmt(dw as number) : "-"]);
    }
  });
  children.push(docTable(["گره وابسته", "VIF", "تلورانس", "دوربین-واتسون"], vifRows));

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
      const label = b.viaVar
        ? `${varNameOf(vars, b.fromVar)} ← ${varNameOf(vars, b.viaVar)} ← ${varNameOf(vars, b.toVar)}`
        : `کل اثر غیرمستقیم: ${varNameOf(vars, b.fromVar)} ← ${varNameOf(vars, b.toVar)}`;
      effectRows.push([
        label,
        b.viaVar === null ? fmt(b.direct) : "—",
        fmt(b.indirect),
        fmt(b.lo),
        fmt(b.hi),
        `${fmtP(b.p)}${starP(b.p)}`,
        b.viaVar === null ? fmt(b.total) : "—",
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
      ]);
    });
  }
  children.push(docTable(["مسیر", "مستقیم", "غیرمستقیم", "CI پایین", "CI بالا", "p", "کل"], effectRows));
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
        ["χ²", "df", "χ²/df", "CFI", "TLI", "RMSEA", "SRMR", "نتیجه"],
        [[
          fmt(sem.fit.chi2),
          sem.fit.df,
          fmt(sem.fit.chi2df),
          fmt(sem.fit.cfi),
          fmt(sem.fit.tli),
          fmt(sem.fit.rmsea),
          fmt(sem.fit.srmr),
          sem.fit.cfi >= 0.9 && sem.fit.rmsea <= 0.08 ? "برازش خوب" : "برازش ضعیف",
        ]]
      )
    );
    children.push(docP("معیار: CFI ≥ 0.90 ، RMSEA ≤ 0.08", { size: 20, color: "666666" }));
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
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });
  const [modal, setModal] = useState<ModalState>(null);
  const [showBigDiagram, setShowBigDiagram] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [wantAlpha, setWantAlpha] = useState(true);
  const [alphaScales, setAlphaScales] = useState<
    { varId: number; name: string; items: { min: number; max: number }[] }[]
  >(() => {
    try {
      const raw = localStorage.getItem("amarist-sem-vars");
      if (raw) {
        const arr = JSON.parse(raw) as { id: number; name: string }[];
        if (Array.isArray(arr) && arr.length) {
          return arr.map((v) => ({
            varId: v.id,
            name: v.name,
            items: Array.from({ length: 6 }, () => ({ min: 1, max: 5 })),
          }));
        }
      }
    } catch {
      // ignore
    }
    return initialVars.map((v) => ({
      varId: v.id,
      name: v.name,
      items: Array.from({ length: Math.max(2, v.subscales.length || 1) }, () => ({ min: 1, max: 5 })),
    }));
  });
  const [alphaN, setAlphaN] = useState("120");
  const [alphaMin, setAlphaMin] = useState("0.7");
  const [alphaMax, setAlphaMax] = useState("0.9");
  const [alphaCols, setAlphaCols] = useState<string[]>([]);
  const [alphaRows, setAlphaRows] = useState<(number | null)[][]>([]);
  const [alphaResult, setAlphaResult] = useState<
    { name: string; k: number; alpha: number; stdAlpha: number; items: { name: string; mean: number; sd: number; itemTotal: number; alphaIfDeleted: number }[] }[] | null
  >(null);
  const [alphaStatus, setAlphaStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });
  const [backupModal, setBackupModal] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [backupScope, setBackupScope] = useState<"all" | "one">("all");
  const [projectModal, setProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [diagnoseModal, setDiagnoseModal] = useState(false);
  const [analysisInputs, setAnalysisInputs] = useState<string>("");
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

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

  const inputsChangedSinceAnalysis = useMemo(() => {
    if (!analysisValid) return false;
    const current = JSON.stringify({ source, vars, inactiveArrowIds: [...inactiveArrowIds], constraints, n, rows, columns });
    return analysisInputs !== current;
  }, [analysisValid, analysisInputs, source, vars, inactiveArrowIds, constraints, n, rows, columns]);

  const hasLatent = vars.some((v) => v.subscales.length > 0 && v.hasTotal);
  const modeLabel = hasLatent ? "مدل معادلات ساختاری (SEM) — با متغیر پنهان (مکنون)" : "تحلیل مسیر — متغیرهای مشاهده‌شده";
  const varName = (id: number) => varNameOf(vars, id);

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
    if (constraints.missingPct === 0) {
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
    setSource(data.source);
    setVars(data.vars);
    setInactiveArrowIds(new Set(data.inactiveArrowIds ?? []));
    setConstraints(data.constraints);
    setN(data.n ?? "250");
    setColumns(data.columns ?? []);
    setRows(data.rows ?? []);
    setColMap(data.colMap ?? {});
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
                },
              }
            : p
        );
        saveProjects(next);
        return next;
      });
    }, 100);
    return () => clearTimeout(t);
  }, [projectId, source, vars, inactiveArrowIds, constraints, n, columns, rows, colMap]);

  // همگام‌سازی متغیرها با localStorage برای صفحه آلفا
  useEffect(() => {
    try {
      localStorage.setItem("amarist-sem-vars", JSON.stringify(vars));
    } catch {
      // ignore
    }
  }, [vars]);

  const switchProject = (id: string) => {
    const p = projects.find((x) => x.id === id);
    if (!p) return;
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

  const setIndirectTarget = (key: string, value: IndirectTarget) => {
    setConstraints((prev) => ({ ...prev, indirectTargets: { ...prev.indirectTargets, [key]: value } }));
  };

  // ---------- بوت‌استرپ ----------
  const runBootstrap = useCallback(
    (nodeColsArg?: number[][], nBoot?: number, silent = false) => {
      const comps = nodeColsArg ?? analysis?.nodeCols;
      if (!comps) return;
      const bootN = nBoot ?? constraints.bootSamples;
      setBootBusy(true);
      if (!silent) setStatus({ text: `در حال اجرای بوت‌استرپ با ${bootN} نمونه...`, kind: "" });
      setTimeout(() => {
        try {
          const sem = estimateSem(modelNodes, modelArrows, comps);
          const raw = bootstrapIndirectEffects(modelNodes, modelArrows, comps, bootN);
          const directOf = (fromVar: number, toVar: number) =>
            sem.effects.find((e) => e.fromVar === fromVar && e.toVar === toVar)?.direct ?? 0;
          const res: BootResult[] = raw.map((b) => ({
            fromVar: b.fromVar,
            toVar: b.toVar,
            viaVar: b.viaVar,
            direct: b.viaVar === null ? directOf(b.fromVar, b.toVar) : 0,
            indirect: b.indirect,
            lo: b.lo,
            hi: b.hi,
            p: b.p,
            total: b.viaVar === null ? directOf(b.fromVar, b.toVar) + b.indirect : NaN,
          }));
          setBootResults(res);
          setBootBusy(false);
          if (!silent) setStatus({ text: `بوت‌استرپ با ${bootN} نمونه تکمیل شد.`, kind: "ok" });
        } catch (err) {
          setBootBusy(false);
          if (!silent) setStatus({ text: (err as Error).message, kind: "err" });
        }
      }, 30);
    },
    [analysis, constraints.bootSamples, modelNodes, modelArrows]
  );

  // ---------- تحلیل ----------
  const analyze = useCallback(
    (
      rowsArg?: (number | null)[][],
      mapArg?: Record<number, (number | null)[]>,
      colsArg?: string[],
      boot = true,
      openModal = false
    ) => {
      const r = rowsArg ?? rows;
      const cm = mapArg ?? colMap;
      const c = colsArg ?? columns;
      try {
        if (!r.length) throw new Error("داده‌ای وجود ندارد؛ ابتدا داده تولید یا وارد کنید.");
        const { nodeCols, indicatorCols } = computeNodeCols(r, vars, modelNodes, cm);
        if (nodeCols.some((col) => col.every((v) => !Number.isFinite(v)))) {
          throw new Error("حداقل یکی از گره‌ها داده معتبر ندارد؛ نگاشت ستون‌ها را بررسی کنید.");
        }
        const sem = estimateSem(modelNodes, modelArrows, nodeCols);
        const corr = correlationMatrixWithP(nodeCols);
        const maha = mahalanobisDistances(nodeCols);
        const mardia = mardiaTest(nodeCols);
        const missing = c.map((col, i) => ({
          col,
          count: r.filter((row) => row[i] == null || !Number.isFinite(row[i])).length,
        }));
        const normals = modelNodes.map((nd) => ({
          name: nd.label,
          skew: skewness(nodeCols[nd.nodeId]),
          kurt: kurtosis(nodeCols[nd.nodeId]),
        }));
        const meas = vars
          .filter((v) => (indicatorCols[v.id]?.length ?? 0) >= 2)
          .map((v) => ({
            varId: v.id,
            name: v.name,
            alpha: cronbachAlpha(indicatorCols[v.id]),
            loadings: pcaLoadings(indicatorCols[v.id]),
            subNames: v.subscales.map((s) => s.name),
          }));
        setAnalysisInputs(JSON.stringify({ source, vars, inactiveArrowIds: [...inactiveArrowIds], constraints, n, rows: r, columns: c }));
        setAnalysis({
          nodeIds: modelNodes.map((nd) => nd.nodeId),
          nodeCols,
          indicatorCols,
          sem,
          corr,
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
                ? `برازش: CFI=${fmt(sem.fit.cfi)} | RMSEA=${fmt(sem.fit.rmsea)} | χ²/df=${fmt(sem.fit.chi2df)} | SRMR=${fmt(sem.fit.srmr)}`
                : `برازش: ${sem.fit.message ?? "نامشخص"}`,
              modelNodes
                .filter((nd) => nd.role !== "exogenous")
                .map((nd) => `${nd.label}: R²=${fmt(sem.r2[nd.nodeId] ?? 0)}`)
                .join(" | "),
              sem.warnings.length ? `هشدار: ${sem.warnings[0]}` : "همه پیش‌فرض‌ها بررسی شدند.",
            ],
          });
        }
        if (boot) runBootstrap(nodeCols, constraints.bootSamples, true);
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
        if (openModal) setModal({ ok: false, lines: [(err as Error).message] });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, colMap, columns, vars, modelNodes, modelArrows, constraints.bootSamples, runBootstrap, setModal, source, inactiveArrowIds, constraints, n, setAnalysisInputs]
  );

  // ---------- تولید داده ----------
  const generate = useCallback(() => {
    try {
      const nn = Math.round(Number(n));
      if (!Number.isFinite(nn) || nn < 20) throw new Error("حجم نمونه باید عددی بزرگ‌تر از ۲۰ باشد.");
      const out = generateSemData({
        n: nn,
        variables: modelVars,
        arrows: modelArrows,
        constraints,
      });
      setColumns(out.columns);
      setRows(out.rows);
      setColMap(autoMap(out.columns, vars));
      setAnswerKey(out.answerKey);
      setStatus({ text: `داده تولید شد (${out.answerKey.attempts} تلاش).`, kind: "ok" });
      const cm = autoMap(out.columns, vars);
      analyze(out.rows, cm, out.columns, true, true);
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
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
      const hasHeader = first.some((v) => typeof v === "string" && !/^-?\d+(\.\d+)?$/.test(v.trim()));
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
          const v = (r as unknown[])[j];
          if (v == null || v === "") return null;
          const num = Number(String(v).replace(/[،]/g, "").trim());
          return Number.isFinite(num) ? num : null;
        })
      );
      setSource("real");
      setColumns(headers);
      setRows(parsed);
      setColMap(autoMap(headers, vars));
      setStatus({ text: `داده وارد شد: ${parsed.length} مورد × ${headers.length} ستون.`, kind: "ok" });
      analyze(parsed, autoMap(headers, vars), headers, true, true);
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
      if (alphaRows.length) {
        XLSX.utils.book_append_sheet(
          wb,
          XLSX.utils.aoa_to_sheet([alphaCols, ...alphaRows.map((r) => r.map((v) => (v == null ? "" : v)))]),
          "داده آلفا"
        );
        if (alphaResult) {
          const aoa: (string | number)[][] = [["متغیر", "گویه", "میانگین", "SD", "گویه-کل", "آلفا اگر حذف شود", "آلفای کل"]];
          alphaResult.forEach((g) => {
            g.items.forEach((it, i) => {
              aoa.push([g.name, it.name, Number(it.mean.toFixed(2)), Number(it.sd.toFixed(2)), Number(it.itemTotal.toFixed(3)), Number(it.alphaIfDeleted.toFixed(3)), i === 0 ? Number(g.alpha.toFixed(3)) : ""]);
            });
          });
          XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "نتایج آلفا");
        }
      }
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
  const addAlphaItem = (varId: number) => {
    setAlphaScales((prev) =>
      prev.map((q) =>
        q.varId === varId
          ? { ...q, items: [...q.items, { min: q.items[0]?.min ?? 1, max: q.items[0]?.max ?? 5 }] }
          : q
      )
    );
  };
  const removeAlphaItem = (varId: number, idx: number) => {
    setAlphaScales((prev) =>
      prev.map((q) =>
        q.varId === varId ? { ...q, items: q.items.filter((_, i) => i !== idx) } : q
      )
    );
  };
  const setAlphaItemRange = (varId: number, idx: number, field: "min" | "max", value: number) => {
    setAlphaScales((prev) =>
      prev.map((q) =>
        q.varId === varId
          ? { ...q, items: q.items.map((it, i) => (i === idx ? { ...it, [field]: value } : it)) }
          : q
      )
    );
  };

  const generateAlpha = () => {
    try {
      const nn = Math.round(Number(alphaN));
      const aMin = Number(alphaMin);
      const aMax = Number(alphaMax);
      if (!Number.isFinite(nn) || nn < 10) throw new Error("حجم نمونه باید حداقل ۱۰ باشد.");
      if (!Number.isFinite(aMin) || !Number.isFinite(aMax) || aMin >= aMax || aMin < 0 || aMax > 1) {
        throw new Error("بازه آلفای هدف معتبر نیست.");
      }
      const totalItems = alphaScales.reduce((s, q) => s + q.items.length, 0);
      if (!totalItems) throw new Error("حداقل یک متغیر با گویه تعریف کنید.");
      const targetAlpha = Math.min(0.97, aMax + 0.05);
      const cols: number[][] = [];
      const colNames: string[] = [];
      for (const q of alphaScales) {
        const k = q.items.length;
        if (k < 2) throw new Error(`متغیر «${q.name}» باید حداقل ۲ گویه داشته باشد.`);
        const lam = Math.max(0.35, Math.min(0.95, Math.sqrt(targetAlpha / (k - (k - 1) * targetAlpha))));
        let attempt = 0;
        let alpha = NaN;
        let qCols: number[][] = [];
        do {
          const latent = Array.from({ length: nn }, () => {
            let u = 0;
            let v = 0;
            while (u === 0) u = Math.random();
            while (v === 0) v = Math.random();
            return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
          });
          qCols = q.items.map((it) => {
            const mid = (it.min + it.max) / 2;
            const sd = Math.max(0.6, (it.max - it.min) / 5);
            return latent.map((z) => {
              let u = 0;
              let v = 0;
              while (u === 0) u = Math.random();
              while (v === 0) v = Math.random();
              const e = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
              return Math.round(Math.min(it.max, Math.max(it.min, mid + sd * (lam * z + Math.sqrt(1 - lam * lam) * e))));
            });
          });
          alpha = cronbachAlpha(qCols);
          attempt++;
        } while ((!Number.isFinite(alpha) || alpha < aMin || alpha > aMax) && attempt < 250);
        if (!Number.isFinite(alpha) || alpha < aMin || alpha > aMax) {
          throw new Error(
            `برای متغیر «${q.name}» با ${k} گویه در بازه آلفای ${aMin} تا ${aMax} داده قابل قبول پیدا نشد؛ گویه‌ها را بیشتر کنید یا بازه را بازتر کنید.`
          );
        }
        qCols.forEach((c, i) => {
          cols.push(c);
          colNames.push(`${q.name} — گویه ${i + 1}`);
        });
      }
      setAlphaCols(colNames);
      setAlphaRows(Array.from({ length: nn }, (_, i) => cols.map((c) => c[i])));
      computeAlphaResult(cols, colNames);
      setAlphaStatus({ text: `داده آلفا تولید شد: ${nn} نفر × ${totalItems} گویه.`, kind: "ok" });
    } catch (err) {
      setAlphaStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
  };

  const computeAlphaResult = (colsArg?: number[][], colNamesArg?: string[]) => {
    const cols = colsArg ?? alphaCols.map((_, ci) => alphaRows.map((r) => r[ci] as number));
    const names = colNamesArg ?? alphaCols;
    if (!cols.length || !cols[0].length) {
      setAlphaStatus({ text: "داده‌ای برای محاسبه آلفا وجود ندارد.", kind: "err" });
      return;
    }
    // گروه‌بندی بر اساس پیشوند نام (متغیر)
    const groups: { name: string; cols: number[][] }[] = [];
    names.forEach((n, ci) => {
      const varName = n.split(" — ")[0];
      let g = groups.find((x) => x.name === varName);
      if (!g) {
        g = { name: varName, cols: [] };
        groups.push(g);
      }
      g.cols.push(cols[ci]);
    });
    const result = groups.map((g) => {
      const k = g.cols.length;
      const items = g.cols.map((col, i) => {
        const rest = g.cols.filter((_, j) => j !== i);
        const restTotal = rest[0]?.map((_, ri) => rest.reduce((acc, c) => acc + (c[ri] ?? 0), 0)) ?? [];
        return {
          name: names[cols.indexOf(col)] ?? `گویه ${i + 1}`,
          mean: mean(col),
          sd: sampleStd(col),
          itemTotal: restTotal.length ? pearsonCorr(col, restTotal) : NaN,
          alphaIfDeleted: cronbachAlpha(rest),
        };
      });
      return { name: g.name, k, alpha: cronbachAlpha(g.cols), stdAlpha: stdAlphaOf(g.cols), items };
    });
    setAlphaResult(result);
    setAlphaStatus({ text: "آلفای کرونباخ محاسبه شد.", kind: "ok" });
  };

  const alphaReportText = useCallback((): string => {
    if (!alphaResult || !alphaResult.length) return "";
    const L: string[] = [];
    L.push("");
    L.push("بررسی پایایی (آلفای کرونباخ)");
    L.push("-------------------------------");
    L.push(`تعداد موارد: ${alphaRows.length} | منبع: تولید تمرینی (بازه هدف ${alphaMin} تا ${alphaMax})`);
    alphaResult.forEach((g) => {
      L.push(`متغیر: ${g.name} (${g.k} گویه)`);
      g.items.forEach((it) => {
        L.push(`  ${it.name}: میانگین=${fmt(it.mean)} | SD=${fmt(it.sd)} | گویه-کل=${fmt(it.itemTotal)} | آلفا-اگر-حذف=${fmt(it.alphaIfDeleted)}`);
      });
      L.push(`  آلفای کرونباخ: ${fmt(g.alpha)} | استانداردشده: ${fmt(g.stdAlpha)}`);
    });
    return L.join("\n");
  }, [alphaResult, alphaRows, alphaMin, alphaMax]);

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

  // ---------- جفت‌های اثر غیرمستقیم ----------
  const indirectRows = useMemo(() => {
    const medVars = vars.filter((v) => v.role === "mediator").map((v) => v.id);
    const rowsList: { key: string; label: string; isTotal: boolean }[] = [];
    vars
      .filter((v) => v.role === "exogenous")
      .forEach((e) =>
        vars
          .filter((v) => v.role === "outcome")
          .forEach((o) => {
            const meds = medVars.filter(
              (m) =>
                modelArrows.some((a) => a.fromVar === e.id && a.toVar === m) &&
                modelArrows.some((a) => a.fromVar === m && a.toVar === o.id)
            );
            if (!meds.length) return;
            meds.forEach((m) => {
              rowsList.push({
                key: `${e.id}:${m}:${o.id}`,
                label: `${varNameOf(vars, e.id)} ← ${varNameOf(vars, m)} ← ${varNameOf(vars, o.id)}`,
                isTotal: false,
              });
            });
            if (meds.length > 1) {
              rowsList.push({
                key: `${e.id}:${o.id}`,
                label: `کل: ${varNameOf(vars, e.id)} ← ${varNameOf(vars, o.id)} (${meds.map((m) => varNameOf(vars, m)).join(" + ")})`,
                isTotal: true,
              });
            }
          })
      );
    return rowsList;
  }, [vars, modelArrows]);

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

            {currentProject?.id === SHIRDEL_PROJECT_ID && (
              <div className="mt-4 rounded-2xl border border-indigo-200 bg-indigo-50/70 p-4 dark:border-indigo-800 dark:bg-indigo-950/30">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-black text-indigo-900 dark:text-indigo-100">راهنمای نمره‌گذاری پروژه شیردل</h3>
                    <p className="mt-1 text-[12px] leading-6 text-indigo-700 dark:text-indigo-300">
                      خرده‌مقیاس‌ها برای محاسبه و گزارش توصیفی نگه داشته می‌شوند؛ در مدل ساختاری فقط نمره کل هر سه
                      پرسشنامه وارد می‌شود.
                    </p>
                  </div>
                  <span className="rounded-full bg-indigo-600 px-3 py-1 text-[11px] font-extrabold text-white">
                    مدل با ۳ نمره کل مشاهده‌شده
                  </span>
                </div>

                <div className="mt-3 space-y-3">
                  {shirdelScoringGuide.map((table, tableIndex) => (
                    <div key={table.title} className="overflow-hidden rounded-xl border border-indigo-100 bg-white dark:border-indigo-900 dark:bg-slate-900">
                      <div className="border-b border-indigo-100 bg-indigo-100/70 px-3 py-2 text-[12px] font-black text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-100">
                        جدول {tableIndex + 1}. {table.title}
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[760px] border-collapse text-right text-[11px]">
                          <thead>
                            <tr className="bg-stone-50 text-stone-600 dark:bg-slate-800 dark:text-stone-300">
                              <th className="border-b border-stone-200 px-3 py-2 font-extrabold dark:border-stone-700">مؤلفه</th>
                              <th className="border-b border-stone-200 px-3 py-2 font-extrabold dark:border-stone-700">شماره گویه‌ها</th>
                              <th className="border-b border-stone-200 px-3 py-2 font-extrabold dark:border-stone-700">دامنه نمره‌گذاری</th>
                              <th className="border-b border-stone-200 px-3 py-2 font-extrabold dark:border-stone-700">نحوه تفسیر</th>
                            </tr>
                          </thead>
                          <tbody>
                            {table.rows.map((row) => (
                              <tr key={`${table.title}-${row.component}`} className="text-stone-700 dark:text-stone-300">
                                <td className="border-b border-stone-100 px-3 py-2 font-bold dark:border-stone-800">{row.component}</td>
                                <td className="border-b border-stone-100 px-3 py-2 dark:border-stone-800">{row.items}</td>
                                <td className="border-b border-stone-100 px-3 py-2 font-bold dark:border-stone-800">{row.range}</td>
                                <td className="border-b border-stone-100 px-3 py-2 dark:border-stone-800">{row.interpretation}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="space-y-1 px-3 py-2">
                        {table.notes.map((note) => (
                          <p key={note} className="text-[11px] font-bold leading-5 text-amber-700 dark:text-amber-300">
                            نکته: {note}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl bg-white p-3 text-center shadow-sm dark:bg-slate-900">
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">تاب‌آوری · مستقل (X)</p>
                    <p className="mt-1 text-sm font-black text-blue-700 dark:text-blue-300">CD-RISC-10 · کل ۰–۴۰</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 text-center shadow-sm dark:bg-slate-900">
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">پیری موفق · میانجی (M)</p>
                    <p className="mt-1 text-sm font-black text-amber-700 dark:text-amber-300">SAS · کل ۱۳–۹۱</p>
                  </div>
                  <div className="rounded-xl bg-white p-3 text-center shadow-sm dark:bg-slate-900">
                    <p className="text-[11px] text-stone-500 dark:text-stone-400">مشارکت اجتماعی · وابسته (Y)</p>
                    <p className="mt-1 text-sm font-black text-emerald-700 dark:text-emerald-300">LSNS-6 · کل ۰–۳۰</p>
                  </div>
                </div>
              </div>
            )}

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
                        <p className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-bold leading-5 text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-300">
                          {v.hasTotal
                            ? "نمایش در مدل: یک سازه کل با زیرمقیاس‌ها به‌عنوان شاخص؛ مسیرهای ساختاری به سازه کل متصل می‌شوند."
                            : "نمایش در مدل: هر زیرمقیاس یک متغیر مشاهده‌شده مستقل است و مسیر ساختاری جداگانه می‌گیرد."}
                        </p>
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
                  را انتخاب کنید؛ ادامه تحلیل بر اساس همان مدل پیش می‌رود. (مدل کامل اشباع است: CFI=1، RMSEA=0)
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
              </div>
              <div>
                <label className={labelCls}>تعداد نمونه‌های بوت‌استرپ</label>
                <input type="number" className={inputCls} value={constraints.bootSamples} onChange={(e) => setConstraints({ ...constraints, bootSamples: Number(e.target.value) })} />
                <p className={tinyCls}>پیش‌فرض: 5000</p>
              </div>
              <div>
                <label className={labelCls}>درصد داده گمشده</label>
                <input type="number" min={0} max={20} className={inputCls} value={constraints.missingPct} onChange={(e) => setConstraints({ ...constraints, missingPct: Number(e.target.value) })} />
              </div>
              <div>
                <label className={labelCls}>درصد داده پرت</label>
                <input type="number" min={0} max={10} className={inputCls} value={constraints.outlierPct} onChange={(e) => setConstraints({ ...constraints, outlierPct: Number(e.target.value) })} />
              </div>
            </div>

            <h3 className="mt-5 font-extrabold text-stone-800 dark:text-stone-200">قیود مسیرهای مستقیم</h3>
            <p className={tinyCls}>برای هر جفت متغیر مشخص کنید معنی‌دار باشد، نباشد یا مهم نباشد؛ بازه β اختیاری است.</p>
            <div className="tool-table-wrap mt-3">
              <table className="tool-table" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    <th>مسیر</th>
                    <th>وضعیت</th>
                    <th>β حداقل</th>
                    <th>β حداکثر</th>
                  </tr>
                </thead>
                <tbody>
                  {[...new Set(allArrows.map((a) => `${a.fromVar}:${a.toVar}`))].map((key) => {
                    const [fv, tv] = key.split(":").map(Number);
                    const t = constraints.pathTargets[key] ?? { sig: "sig", betaMin: 0.2, betaMax: 0.5 };
                    return (
                      <tr key={key}>
                        <td style={{ fontWeight: 900 }}>{varName(fv)} ← {varName(tv)}</td>
                        <td>
                          <select className={`${inputCls} !py-1.5`} value={t.sig} onChange={(e) => setPathTarget(key, { sig: e.target.value as PathTarget["sig"] })}>
                            <option value="sig">معنی‌دار باشد</option>
                            <option value="ns">معنی‌دار نباشد</option>
                            <option value="any">مهم نیست</option>
                          </select>
                        </td>
                        <td>
                          <input type="number" step={0.05} dir="ltr" className={`${inputCls} !py-1.5`} placeholder="—" value={t.betaMin ?? ""} onChange={(e) => setPathTarget(key, { betaMin: e.target.value === "" ? null : Number(e.target.value) })} />
                        </td>
                        <td>
                          <input type="number" step={0.05} dir="ltr" className={`${inputCls} !py-1.5`} placeholder="—" value={t.betaMax ?? ""} onChange={(e) => setPathTarget(key, { betaMax: e.target.value === "" ? null : Number(e.target.value) })} />
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
                <p className={tinyCls}>برای هر مسیر میانجی جداگانه و برای «کل» اثر غیرمستقیم، معناداری با بوت‌استرپ تعیین می‌شود.</p>
                <div className="tool-table-wrap mt-3">
                  <table className="tool-table" style={{ minWidth: 560 }}>
                    <thead>
                      <tr>
                        <th>مسیر غیرمستقیم</th>
                        <th>وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indirectRows.map((row) => {
                        const val = constraints.indirectTargets[row.key] ?? "sig";
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
                              <select className={`${inputCls} !py-1.5`} value={val} onChange={(e) => setIndirectTarget(row.key, e.target.value as IndirectTarget)}>
                                <option value="sig">معنی‌دار باشد</option>
                                <option value="ns">معنی‌دار نباشد</option>
                                <option value="any">مهم نیست</option>
                              </select>
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
                { key: "enforceNormality" as const, title: "نرمال بودن تک‌متغیری", desc: "کجی < 3 و کشیدگی < 10 (کلاین) برای همه گره‌ها", conflict: constraints.outlierPct > 0 },
                { key: "enforceLinearity" as const, title: "خطی بودن روابط", desc: "همبستگی همه فلش‌های فعال معنادار باشد", conflict: false },
                { key: "enforceVif" as const, title: "عدم هم‌خطی چندگانه", desc: "VIF همه پیش‌بین‌ها کمتر از 5", conflict: false },
                { key: "enforceDw" as const, title: "استقلال خطاها", desc: "دوربین-واتسون بین 1.5 تا 2.5", conflict: false },
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
                  <span>
                    <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">{item.title}</span>
                    <span className={tinyCls}>
                      {item.conflict ? "با وجود داده پرت عمدی، این قید خودکار غیرفعال است (سازگار نیستند)." : item.desc}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
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
                </span>
              </label>

              <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">شاخص‌های برازش</p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    CFI ≥
                    <input type="number" step={0.01} dir="ltr" className={`${inputCls} !w-20 !py-1`} value={constraints.cfiMin} onChange={(e) => setConstraints({ ...constraints, cfiMin: Number(e.target.value) })} />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    RMSEA ≤
                    <input type="number" step={0.01} dir="ltr" className={`${inputCls} !w-20 !py-1`} value={constraints.rmseaMax} onChange={(e) => setConstraints({ ...constraints, rmseaMax: Number(e.target.value) })} />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    χ²/df ≤
                    <input type="number" step={0.1} dir="ltr" className={`${inputCls} !w-20 !py-1`} value={constraints.chi2dfMax} onChange={(e) => setConstraints({ ...constraints, chi2dfMax: Number(e.target.value) })} />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    SRMR ≤
                    <input type="number" step={0.01} dir="ltr" className={`${inputCls} !w-20 !py-1`} value={constraints.srmrMax} onChange={(e) => setConstraints({ ...constraints, srmrMax: Number(e.target.value) })} />
                  </label>
                </div>
                <p className={`${tinyCls} mt-1`}>پیش‌فرض معقول: CFI ≥ 0.90 ، RMSEA ≤ 0.08 ، χ²/df ≤ 3 ، SRMR ≤ 0.08</p>
              </div>

              <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">پیش‌فرض‌های واقع‌گرایانه</p>
                <p className={`${tinyCls} mt-1 text-emerald-700 dark:text-emerald-400`}>
                  ضرایب مسیر، بارهای عاملی (0.6 تا 0.85) و R² در محدوده‌های متعارف پژوهش‌های واقعی ساخته می‌شوند تا خروجی
                  برای داوری و آموزش قابل قبول باشد.
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
                onClick={() => analyze(undefined, undefined, undefined, true, true)}
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
                        <tr><th>متغیر / زیرمقیاس</th><th>کجی</th><th>کشیدگی</th><th>نتیجه کجی</th><th>نتیجه کشیدگی</th></tr>
                      </thead>
                      <tbody>
                        {analysis.normals.map((x, i) => (
                          <tr key={i}>
                            <td>{x.name}</td>
                            <td className="number-cell">{fmt(x.skew)}</td>
                            <td className="number-cell">{fmt(x.kurt)}</td>
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
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۴) نرمال بودن چندمتغیری (ضریب مردیا)</h3>
                  <p className={tinyCls}>بر اساس بلانچ (۲۰۱۲): نسبت بحرانی ضریب کشیدگی استانداردشده مردیا کمتر از ۵.</p>
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
                            <td dangerouslySetInnerHTML={{ __html: analysis.mardia.cr < 5 ? badge(true, "نرمال چندمتغیره") : badge(false, "تخطی") }} />
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className={`${tinyCls} mt-2 text-red-600`}>{analysis.mardia.message}</p>
                  )}
                  <AssumptionNote
                    condition="نسبت بحرانی ضریب کشیدگی مردیا کمتر از ۵ باشد"
                    pass={analysis.mardia.valid && analysis.mardia.cr < 5}
                  />
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۵) خطی بودن روابط (ماتریس همبستگی پیرسون)</h3>
                  <p className={tinyCls}>اعداد زیر قطر ماتریس؛ ** معناداری در سطح ۰/۰۱ و * در سطح ۰/۰۵.</p>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr>
                          <th>متغیر / زیرمقیاس</th>
                          {modelNodes.map((nd, i) => (
                            <th key={i}>{nd.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {modelNodes.map((nd, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 900 }}>{nd.label}</td>
                            {modelNodes.map((_, j) => {
                              if (i === j) return <td key={j} className="number-cell">1</td>;
                              if (i < j) return <td key={j} />;
                              const r = analysis.corr.r?.[i]?.[j] ?? NaN;
                              const p = analysis.corr.p?.[i]?.[j] ?? 1;
                              return (
                                <td key={j} className="number-cell">
                                  {fmt(r)}
                                  {p < 0.01 ? "**" : p < 0.05 ? "*" : ""}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={`${tinyCls} mt-1 text-stone-500 dark:text-stone-400`}>** p &lt; 0.01 ، * p &lt; 0.05 (دوطرفه)</p>
                  <AssumptionNote
                    condition="همبستگی همه فلش‌های فعال مدل در سطح ۰/۰۵ معنادار باشد"
                    pass={modelArrows.every((a) => (analysis.corr.p[a.fromNode]?.[a.toNode] ?? 1) < 0.05)}
                  />
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۶) عدم هم‌خطی چندگانه و استقلال خطاها</h3>
                  <p className={tinyCls}>معیار: VIF کمتر از ۵ و دوربین-واتسون بین ۱/۵ تا ۲/۵ (تلورانس = 1/VIF).</p>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>متغیر وابسته</th><th>پیش‌بین‌ها</th><th>VIF</th><th>تلورانس</th><th>دوربین-واتسون</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {modelNodes.map((nd) => {
                          if (nd.role === "exogenous") return null;
                          const vifs = analysis.sem.vifs[nd.nodeId] ?? [];
                          const dw = analysis.sem.dw[nd.nodeId] ?? NaN;
                          const preds = modelArrows.filter((a) => a.active && a.toNode === nd.nodeId).map((a) => nodeLabel(a.fromNode));
                          const vifOk = vifs.every((x) => x < 5);
                          const dwOk = !Number.isFinite(dw) || (dw >= 1.5 && dw <= 2.5);
                          return (
                            <tr key={nd.nodeId}>
                              <td style={{ fontWeight: 900 }}>{nd.label}</td>
                              <td>{preds.length ? preds.join("، ") : "—"}</td>
                              <td className="number-cell">{vifs.length ? vifs.map((x) => fmt(x)).join("، ") : "—"}</td>
                              <td className="number-cell">{vifs.length ? vifs.map((x) => fmt(1 / x)).join("، ") : "—"}</td>
                              <td className="number-cell">{Number.isFinite(dw) ? fmt(dw) : "—"}</td>
                              <td dangerouslySetInnerHTML={{ __html: vifOk && dwOk ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <AssumptionNote
                    condition="VIF همه پیش‌بین‌ها کمتر از ۵ و دوربین-واتسون بین ۱/۵ تا ۲/۵ باشد"
                    pass={modelNodes
                      .filter((nd) => nd.role !== "exogenous")
                      .every((nd) => {
                        const vifs = analysis.sem.vifs[nd.nodeId] ?? [];
                        const dw = analysis.sem.dw[nd.nodeId] ?? NaN;
                        return vifs.every((x) => x < 5) && (!Number.isFinite(dw) || (dw >= 1.5 && dw <= 2.5));
                      })}
                  />
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
                        <table className="tool-table">
                          <thead>
                            <tr><th>χ²</th><th>df</th><th>χ²/df</th><th>CFI</th><th>TLI</th><th>RMSEA</th><th>SRMR</th><th>نتیجه کلی</th></tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td className="number-cell">{fmt(analysis.sem.fit.chi2)}</td>
                              <td className="number-cell">{analysis.sem.fit.df}</td>
                              <td className="number-cell">{fmt(analysis.sem.fit.chi2df)}</td>
                              <td className="number-cell">{fmt(analysis.sem.fit.cfi)}</td>
                              <td className="number-cell">{fmt(analysis.sem.fit.tli)}</td>
                              <td className="number-cell">{fmt(analysis.sem.fit.rmsea)}</td>
                              <td className="number-cell">{fmt(analysis.sem.fit.srmr)}</td>
                              <td dangerouslySetInnerHTML={{ __html: analysis.sem.fit.cfi >= 0.9 && analysis.sem.fit.rmsea <= 0.08 ? badge(true, "برازش خوب") : badge(false, "برازش ضعیف") }} />
                            </tr>
                          </tbody>
                        </table>
                      </div>
                      <p className={`${tinyCls} mt-1 text-stone-500 dark:text-stone-400`}>معیار: CFI ≥ 0.90 ، RMSEA ≤ 0.08</p>
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
                  </p>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>مسیر غیرمستقیم</th><th>اثر مستقیم</th><th>اثر غیرمستقیم</th><th>CI پایین ۹۵٪</th><th>CI بالا ۹۵٪</th><th>p</th><th>اثر کل</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {bootResults === null && (
                          <tr><td colSpan={8} className="muted">{bootBusy ? "در حال محاسبه بوت‌استرپ..." : "برای فاصله اطمینان، بوت‌استرپ را اجرا کنید."}</td></tr>
                        )}
                        {bootResults?.map((b, i) => {
                          const isTotal = b.viaVar === null;
                          const label = isTotal
                            ? `کل اثر غیرمستقیم: ${varName(b.fromVar)} ← ${varName(b.toVar)}`
                            : `${varName(b.fromVar)} ← ${varName(b.viaVar!)} ← ${varName(b.toVar)}`;
                          return (
                            <tr key={i} className={isTotal ? "bg-stone-50 font-bold dark:bg-slate-900" : ""}>
                              <td>{label}</td>
                              <td className="number-cell">{isTotal ? fmt(b.direct) : "—"}</td>
                              <td className="number-cell">{fmt(b.indirect)}</td>
                              <td className="number-cell">{fmt(b.lo)}</td>
                              <td className="number-cell">{fmt(b.hi)}</td>
                              <td className="number-cell">{fmtP(b.p)}{starP(b.p)}</td>
                              <td className="number-cell">{isTotal ? fmt(b.total) : "—"}</td>
                              <td dangerouslySetInnerHTML={{ __html: b.indirect !== 0 && b.p < 0.05 ? badge(true, "میانجی معنی‌دار") : b.indirect === 0 ? badgeWarn("میانجی وجود ندارد") : badge(false, "غیرمعنی‌دار") }} />
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
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
              این بخش اختیاری است؛ با «خیر» غیرفعال می‌شود ولی در استپر باقی می‌ماند. متغیرها از همین پروژه می‌آیند؛ برای
              هر گویه دامنه نمره جداگانه تعیین کنید.
            </p>

            {!wantAlpha ? (
              <div className="mt-4 rounded-xl border border-dashed border-amber-300 bg-amber-50/60 p-8 text-center text-sm font-bold text-amber-700 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
                این مرحله فعلاً غیرفعال است — اگر خواستید، «بله» را انتخاب کنید تا محاسبه آلفا فعال شود.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                {/* تعریف گویه‌ها */}
                <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                  <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">گویه‌های هر متغیر (دامنه هر گویه جداگانه)</p>
                  <div className="mt-3 space-y-4">
                    {alphaScales.map((q) => (
                      <div key={q.varId} className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-700 dark:bg-slate-900/60">
                        <div className="flex flex-wrap items-center gap-3">
                          <input className={`${inputCls} max-w-xs opacity-70`} value={q.name} disabled title="نام از متغیرهای پروژه می‌آید" />
                          <button type="button" className={btnLight} onClick={() => addAlphaItem(q.varId)}>
                            <Plus className="h-4 w-4" />
                            افزودن گویه
                          </button>
                        </div>
                        <div className="mt-2 space-y-2">
                          <div className="grid grid-cols-[1fr_110px_110px_40px] items-center gap-2 px-1 text-[11px] font-bold text-stone-500 dark:text-stone-400">
                            <span>گویه</span>
                            <span className="text-center">حداقل نمره</span>
                            <span className="text-center">حداکثر نمره</span>
                            <span />
                          </div>
                          {q.items.map((it, si) => (
                            <div key={si} className="grid grid-cols-[1fr_110px_110px_40px] items-center gap-2">
                              <input className={`${inputCls} opacity-60`} value={`گویه ${si + 1}`} disabled />
                              <input type="number" dir="ltr" className={inputCls} value={it.min} onChange={(e) => setAlphaItemRange(q.varId, si, "min", Number(e.target.value))} />
                              <input type="number" dir="ltr" className={inputCls} value={it.max} onChange={(e) => setAlphaItemRange(q.varId, si, "max", Number(e.target.value))} />
                              <button
                                type="button"
                                onClick={() => removeAlphaItem(q.varId, si)}
                                disabled={q.items.length <= 2}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 transition hover:border-red-200 hover:text-red-500 disabled:opacity-30 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-400"
                                title="حذف گویه"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ))}
                        </div>
                        <p className={`${tinyCls} mt-2`}>
                          {q.items.length} گویه · دامنه‌ها: {q.items.map((it) => `${it.min}-${it.max}`).join("، ")}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* تنظیمات تولید */}
                <div className="grid gap-3 sm:grid-cols-3">
                  <div>
                    <label className={labelCls}>حجم نمونه</label>
                    <input type="number" className={inputCls} value={alphaN} onChange={(e) => setAlphaN(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>حداقل آلفای هدف</label>
                    <input type="number" step={0.05} dir="ltr" className={inputCls} value={alphaMin} onChange={(e) => setAlphaMin(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>حداکثر آلفای هدف</label>
                    <input type="number" step={0.05} dir="ltr" className={inputCls} value={alphaMax} onChange={(e) => setAlphaMax(e.target.value)} />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <button type="button" className={btnPrimary} onClick={generateAlpha}>
                    <Play className="h-4 w-4" />
                    تولید داده آلفا و محاسبه
                  </button>
                  <button type="button" className={btnSecondary} onClick={() => computeAlphaResult()}>
                    <RefreshCw className="h-4 w-4" />
                    محاسبه آلفا
                  </button>
                  <span
                    className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                      alphaStatus.kind === "ok"
                        ? "font-bold text-emerald-700 dark:text-emerald-400"
                        : alphaStatus.kind === "err"
                          ? "font-bold text-red-700 dark:text-red-400"
                          : "text-stone-400 dark:text-stone-500"
                    }`}
                  >
                    {alphaStatus.kind === "ok" ? "✓" : alphaStatus.kind === "err" ? "✗" : "•"} {alphaStatus.text}
                  </span>
                </div>

                {/* جدول داده آلفا */}
                {alphaRows.length > 0 && (
                  <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                    <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">داده گویه‌ها ({alphaRows.length} ردیف)</p>
                    <div className="tool-table-wrap tool-table-scroll mt-2">
                      <table className="tool-table" style={{ minWidth: Math.max(560, alphaCols.length * 90) }}>
                        <thead>
                          <tr>
                            <th>ردیف</th>
                            {alphaCols.map((c, i) => (
                              <th key={i}>{c}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {alphaRows.slice(0, 15).map((r, i) => (
                            <tr key={i}>
                              <td className="row-index">{i + 1}</td>
                              {r.map((v, j) => (
                                <td key={j} className="number-cell">{v == null ? "" : v}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* نتایج */}
                {alphaResult && alphaResult.length > 0 && (
                  <div className="space-y-4">
                    {alphaResult.map((g, gi) => (
                      <div key={gi} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-extrabold text-stone-800 dark:text-stone-200">
                            {g.name} <span className="text-[12px] font-bold text-stone-400">({g.k} گویه)</span>
                          </h3>
                          <div className="flex flex-wrap gap-2 text-[12px] font-bold">
                            <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                              آلفای کرونباخ: {fmt(g.alpha)}
                            </span>
                            <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                              استانداردشده: {fmt(g.stdAlpha)}
                            </span>
                            <span
                              className={`rounded-full px-3 py-1 ${
                                g.alpha >= 0.7
                                  ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                              }`}
                            >
                              {g.alpha >= 0.7 ? "قابل قبول ✓" : "ضعیف ✗"}
                            </span>
                          </div>
                        </div>
                        <div className="tool-table-wrap mt-3">
                          <table className="tool-table">
                            <thead>
                              <tr>
                                <th>گویه</th>
                                <th>میانگین</th>
                                <th>انحراف معیار</th>
                                <th>همبستگی گویه-کل</th>
                                <th>آلفا اگر حذف شود</th>
                              </tr>
                            </thead>
                            <tbody>
                              {g.items.map((it, si) => (
                                <tr key={si}>
                                  <td>{it.name}</td>
                                  <td className="number-cell">{Number.isFinite(it.mean) ? fmt(it.mean) : "-"}</td>
                                  <td className="number-cell">{Number.isFinite(it.sd) ? fmt(it.sd) : "-"}</td>
                                  <td className="number-cell">{Number.isFinite(it.itemTotal) ? fmt(it.itemTotal) : "-"}</td>
                                  <td className="number-cell">{Number.isFinite(it.alphaIfDeleted) ? fmt(it.alphaIfDeleted) : "-"}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className={`${tinyCls} mt-2`}>
                          معیار: همبستگی گویه-کل ≥ 0.30 مطلوب؛ اگر «آلفا اگر حذف شود» از آلفای کل بزرگ‌تر باشد، حذف آن
                          گویه آلفا را بالا می‌برد.
                        </p>
                      </div>
                    ))}
                    <p className={`${tinyCls} text-center`}>
                      نتیجه آلفا در «نگارش گزارش» و «خروجی‌های نهایی» نیز درج می‌شود.
                    </p>
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
