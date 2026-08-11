"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { fmt, fmtP } from "@/lib/statistics";
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
import PathDiagram from "@/components/path-diagram";
import SectionNav from "@/components/section-nav";
import ToolHeader from "@/components/tool-header";

// ------------------------------------------------------------
// ثابت‌های استایل
// ------------------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-[#fbfdff] px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-100";
const labelCls = "mb-1 block text-[12px] font-bold text-stone-600 dark:text-stone-300";
const tinyCls = "mt-1 text-[11px] leading-5 text-stone-400 dark:text-stone-500";
const cardCls = "rounded-2xl p-5 shadow-sm sm:p-6";
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

// ------------------------------------------------------------
// سلول قابل ویرایش
// ------------------------------------------------------------

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
// مودال نتیجه تحلیل
// ------------------------------------------------------------

function ResultModal({
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
            <CheckCircle2 className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <XCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
          )}
          <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">
            {ok ? "تحلیل با موفقیت انجام شد" : "تحلیل ناموفق بود"}
          </h3>
        </div>
        <div className="mt-4 space-y-1.5 rounded-xl bg-stone-50 p-4 dark:bg-slate-900">
          {lines.map((l, i) => (
            <p key={i} className="text-[13px] leading-6 text-stone-700 dark:text-stone-300">
              {l}
            </p>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <button type="button" className={btnPrimary} onClick={onClose}>
            بستن
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// ابزارها
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

// ------------------------------------------------------------
// گزارش متنی
// ------------------------------------------------------------

function buildReportText(
  vars: VariableSpec[],
  nodes: ModelNode[],
  analysis: Analysis | null,
  answerKey: SemAnswerKey | null,
  bootResults: BootResult[] | null,
  n: number
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
  L.push(`تعداد موارد: ${n} | تعداد گره‌های مدل: ${nodes.length}`);
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
  L.push("۹) R² گره‌های درون‌زا:");
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
  return L.join("\n");
}

function varNameOf(vars: VariableSpec[], id: number): string {
  return vars.find((v) => v.id === id)?.name ?? `متغیر ${id}`;
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
  nodeCols: number[][];
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
// کامپوننت اصلی
// ------------------------------------------------------------

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

export default function SemTool() {
  const [source, setSource] = useState<"generate" | "real">("generate");
  const [vars, setVars] = useState<VariableSpec[]>(initialVars);
  const [inactiveArrowIds, setInactiveArrowIds] = useState<Set<string>>(() => new Set());
  const nodes = useMemo(() => buildModelNodes(vars), [vars]);
  const allArrows = useMemo(() => buildModelArrows(nodes), [nodes]);
  const arrows = useMemo(
    () => allArrows.filter((a) => !inactiveArrowIds.has(a.id)),
    [allArrows, inactiveArrowIds]
  );
  const [constraints, setConstraints] = useState<GenConstraints>({
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
  });
  const [n, setN] = useState("250");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(number | null)[][]>([]);
  const [colMap, setColMap] = useState<Record<number, (number | null)[]>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [answerKey, setAnswerKey] = useState<SemAnswerKey | null>(null);
  const [bootResults, setBootResults] = useState<BootResult[] | null>(null);
  const [bootBusy, setBootBusy] = useState(false);
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({
    text: "هنوز تحلیلی اجرا نشده است.",
    kind: "",
  });
  const [footerMsg, setFooterMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);
  const [showBigDiagram, setShowBigDiagram] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const nodeLabel = useCallback(
    (id: number) => nodes.find((x) => x.nodeId === id)?.label ?? `گره ${id}`,
    [nodes]
  );

  // ---------- تغییر متغیرها ----------
  const updateVar = (id: number, patch: Partial<VariableSpec>) => {
    setVars((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const addVar = () => {
    const id = vars.length ? Math.max(...vars.map((v) => v.id)) + 1 : 0;
    const newVar: VariableSpec = {
      id,
      name: `متغیر ${vars.length + 1}`,
      role: "outcome",
      hasTotal: false,
      totalMin: 1,
      totalMax: 5,
      subscales: [],
    };
    setVars((prev) => [...prev, newVar]);
    setStatus({ text: `متغیر «${newVar.name}» اضافه شد؛ نقش و زیرمقیاس‌هایش را تنظیم کنید.`, kind: "ok" });
  };

  const removeVar = (id: number) => {
    const removed = vars.find((v) => v.id === id);
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
    setStatus({ text: removed ? `متغیر «${removed.name}» حذف شد.` : "متغیر حذف شد.", kind: "ok" });
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
      prev.map((v) =>
        v.id === id ? { ...v, subscales: v.subscales.filter((_, i) => i !== idx) } : v
      )
    );
  };

  const setSubscaleName = (id: number, idx: number, name: string) => {
    setVars((prev) =>
      prev.map((v) =>
        v.id === id ? { ...v, subscales: v.subscales.map((s, i) => (i === idx ? { ...s, name } : s)) } : v
      )
    );
  };

  const setSubscaleRange = (id: number, idx: number, field: "min" | "max", value: number) => {
    setVars((prev) =>
      prev.map((v) =>
        v.id === id
          ? { ...v, subscales: v.subscales.map((s, i) => (i === idx ? { ...s, [field]: value } : s)) }
          : v
      )
    );
  };

  const toggleArrow = (arrowId: string) => {
    setInactiveArrowIds((prev) => {
      const next = new Set(prev);
      if (next.has(arrowId)) next.delete(arrowId);
      else next.add(arrowId);
      return next;
    });
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
          const sem = estimateSem(nodes, arrows, comps);
          const raw = bootstrapIndirectEffects(nodes, arrows, comps, bootN);
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
    [analysis, constraints.bootSamples, nodes, arrows]
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
        if (!r.length) throw new Error("داده‌ای وجود ندارد.");
        const { nodeCols, indicatorCols } = computeNodeCols(r, vars, nodes, cm);
        if (nodeCols.some((col) => col.every((v) => !Number.isFinite(v)))) {
          throw new Error("حداقل یکی از گره‌ها داده معتبر ندارد؛ نگاشت ستون‌ها را بررسی کنید.");
        }
        const sem = estimateSem(nodes, arrows, nodeCols);
        const corr = correlationMatrixWithP(nodeCols);
        const maha = mahalanobisDistances(nodeCols);
        const mardia = mardiaTest(nodeCols);
        const missing = c.map((col, i) => ({
          col,
          count: r.filter((row) => row[i] == null || !Number.isFinite(row[i])).length,
        }));
        const normals = nodes.map((nd) => ({
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
        setAnalysis({ nodeCols, sem, corr, maha, mardia, missing, normals, meas });
        setBootResults(null);
        setStatus({ text: "تحلیل با موفقیت اجرا شد.", kind: "ok" });
        if (openModal) {
          const sigCount = sem.paths.filter((p) => p.p < 0.05).length;
          setModal({
            ok: true,
            lines: [
              `تعداد موارد: ${r.length} | تعداد گره‌های مدل: ${nodes.length}`,
              `مسیرهای معنادار: ${sigCount} از ${sem.paths.length}`,
              sem.fit.valid
                ? `برازش: CFI=${fmt(sem.fit.cfi)} | RMSEA=${fmt(sem.fit.rmsea)} | χ²/df=${fmt(sem.fit.chi2df)} | SRMR=${fmt(sem.fit.srmr)}`
                : `برازش: ${sem.fit.message ?? "نامشخص"}`,
              nodes
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
    [rows, colMap, columns, vars, nodes, arrows, constraints.bootSamples, runBootstrap]
  );

  // ---------- تولید داده ----------
  const generate = useCallback(() => {
    try {
      const nn = Math.round(Number(n));
      if (!Number.isFinite(nn) || nn < 20) throw new Error("حجم نمونه باید عددی بزرگ‌تر از ۲۰ باشد.");
      const out = generateSemData({
        n: nn,
        variables: vars,
        arrows,
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
  }, [n, vars, arrows, constraints, analyze]);

  const generateRef = useRef(generate);

  useEffect(() => {
    generateRef.current = generate;
  });

  useEffect(() => {
    const timer = setTimeout(() => generateRef.current(), 80);
    return () => clearTimeout(timer);
  }, []);

  // ---------- ایمپورت اکسل ----------
  const handleImport = useCallback(
    async (file: File) => {
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
        const cm = autoMap(headers, vars);
        setSource("real");
        setColumns(headers);
        setRows(parsed);
        setColMap(cm);
        setStatus({ text: `داده وارد شد: ${parsed.length} مورد × ${headers.length} ستون.`, kind: "ok" });
        analyze(parsed, cm, headers, true, true);
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
        setModal({ ok: false, lines: [(err as Error).message] });
      }
    },
    [vars, analyze]
  );

  // ---------- خروجی‌ها ----------
  const exportExcel = useCallback(() => {
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
            nodes.map((nd) => nd.label),
            ...Array.from({ length: rows.length }, (_, i) => nodes.map((nd) => analysis.nodeCols[nd.nodeId][i])),
          ]),
          "نمرات کل / گره‌ها"
        );
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(
          buildReportText(vars, nodes, analysis, answerKey, bootResults, rows.length)
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
  }, [rows, columns, analysis, vars, nodes, answerKey, bootResults]);

  const downloadTemplate = useCallback(() => {
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
      setStatus({ text: "قالب داده دانلود شد؛ آن را پر کنید و دوباره ایمپورت کنید.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [vars]);

  const exportDocx = useCallback(async () => {
    try {
      const lines = buildReportText(vars, nodes, analysis, answerKey, bootResults, rows.length).split("\n");
      const doc = new Document({
        sections: [
          {
            children: lines.map(
              (l) =>
                new Paragraph({
                  children: [new TextRun({ text: l, font: "Tahoma", size: 22 })],
                  spacing: { after: 80 },
                })
            ),
          },
        ],
      });
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
  }, [vars, nodes, analysis, answerKey, bootResults, rows.length]);

  const exportTxt = useCallback(() => {
    try {
      const text = buildReportText(vars, nodes, analysis, answerKey, bootResults, rows.length);
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
  }, [vars, nodes, analysis, answerKey, bootResults, rows.length]);

  const copyReport = useCallback(async () => {
    try {
      const text = buildReportText(vars, nodes, analysis, answerKey, bootResults, rows.length);
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setStatus({ text: "کل گزارش کپی شد.", kind: "ok" });
      setFooterMsg("گزارش کپی شد ✓ — حالا می‌توانید آن را هر جا Paste کنید");
      setTimeout(() => setFooterMsg(null), 4000);
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [vars, nodes, analysis, answerKey, bootResults, rows.length]);

  // ---------- بکاپ و بازیابی ----------
  const backup = useCallback(() => {
    try {
      const data = {
        version: 1,
        source,
        vars,
        inactiveArrowIds: [...inactiveArrowIds],
        constraints,
        n,
        columns,
        rows,
        colMap,
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-backup.json";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "بکاپ تنظیمات و داده دانلود شد.", kind: "ok" });
      setFooterMsg("بکاپ دانلود شد ✓");
      setTimeout(() => setFooterMsg(null), 4000);
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [source, vars, inactiveArrowIds, constraints, n, columns, rows, colMap]);

  const restore = useCallback(
    async (file: File) => {
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || data.version !== 1 || !Array.isArray(data.vars)) {
          throw new Error("فایل بکاپ معتبر نیست.");
        }
        setSource(data.source === "real" ? "real" : "generate");
        setVars(data.vars);
        setInactiveArrowIds(new Set(data.inactiveArrowIds ?? []));
        setConstraints(data.constraints);
        setN(String(data.n ?? 250));
        setColumns(data.columns ?? []);
        setRows(data.rows ?? []);
        setColMap(data.colMap ?? {});
        setAnalysis(null);
        setAnswerKey(null);
        setBootResults(null);
        setStatus({ text: "بکاپ با موفقیت بازیابی شد.", kind: "ok" });
        setFooterMsg("بازیابی انجام شد ✓");
        setTimeout(() => setFooterMsg(null), 4000);
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
      }
    },
    []
  );

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

  const hasLatent = vars.some((v) => v.subscales.length > 0);
  const modeLabel = hasLatent ? "مدل معادلات ساختاری (SEM) — با متغیر پنهان (مکنون)" : "تحلیل مسیر — متغیرهای مشاهده‌شده";
  const varName = (id: number) => varNameOf(vars, id);

  // جفت‌های اثر غیرمستقیم (کل + هر میانجی)
  const indirectRows = useMemo(() => {
    const medVars = vars.filter((v) => v.role === "mediator").map((v) => v.id);
    const rowsList: { key: string; label: string; isTotal: boolean; fromVar: number; toVar: number; viaVar: number | null }[] = [];
    vars
      .filter((v) => v.role === "exogenous")
      .forEach((e) =>
        vars
          .filter((v) => v.role === "outcome")
          .forEach((o) => {
            const meds = medVars.filter(
              (m) =>
                arrows.some((a) => a.fromVar === e.id && a.toVar === m) &&
                arrows.some((a) => a.fromVar === m && a.toVar === o.id)
            );
            if (!meds.length) return;
            meds.forEach((m) => {
              rowsList.push({
                key: `${e.id}:${m}:${o.id}`,
                label: `${varNameOf(vars, e.id)} ← ${varNameOf(vars, m)} ← ${varNameOf(vars, o.id)}`,
                isTotal: false,
                fromVar: e.id,
                toVar: o.id,
                viaVar: m,
              });
            });
            if (meds.length > 1) {
              rowsList.push({
                key: `${e.id}:${o.id}`,
                label: `کل: ${varNameOf(vars, e.id)} ← ${varNameOf(vars, o.id)} (${meds.map((m) => varNameOf(vars, m)).join(" + ")})`,
                isTotal: true,
                fromVar: e.id,
                toVar: o.id,
                viaVar: null,
              });
            }
          })
      );
    return rowsList;
  }, [vars, arrows]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-44 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <ToolHeader
        title="تحلیل مسیر و مدل معادلات ساختاری (SEM)"
        subtitle={modeLabel}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3.5 py-1.5 text-[12px] font-extrabold text-white shadow-sm transition hover:bg-indigo-500"
              onClick={generate}
            >
              <Play className="h-3.5 w-3.5" />
              تولید داده و تحلیل
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3.5 py-1.5 text-[12px] font-extrabold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
              onClick={() => analyze(undefined, undefined, undefined, true, true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              اجرای تحلیل
            </button>
          </div>
        }
      />

      <SectionNav
        sections={[
          { id: "source", label: "منبع داده", short: "منبع" },
          { id: "variables", label: "مشخصات متغیرها", short: "متغیرها" },
          { id: "draw-model", label: "ترسیم مدل", short: "مدل" },
          { id: "constraints", label: "قیود تولید", short: "قیود" },
          { id: "data-table", label: "جدول داده", short: "داده" },
          { id: "assumptions", label: "بررسی پیش‌فرض‌ها", short: "پیش‌فرض" },
          { id: "results", label: "نتایج", short: "نتایج" },
        ]}
      />

      <div className="mx-auto max-w-[1280px] px-4">
        {/* ---------- هیرو ---------- */}
        <header className={`${cardCls} mt-6 border-stone-200 bg-white/80 shadow-lg shadow-stone-900/5 backdrop-blur dark:border-stone-700 dark:bg-slate-900/80`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md">
              <RefreshCw className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-stone-900 dark:text-stone-100 sm:text-3xl">
                تحلیل مسیر و مدل معادلات ساختاری (SEM)
              </h1>
              <p className="mt-1 text-sm font-bold text-indigo-600 dark:text-indigo-400">{modeLabel}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["متغیر پنهان (مکنون)", "مدل اندازه‌گیری CFA", "جمع‌پذیر / غیرجمع‌پذیر", "میانجی‌گری با بوت‌استرپ", "شاخص‌های برازش CFI / RMSEA"].map((p) => (
              <span
                key={p}
                className="inline-flex items-center rounded-full border border-stone-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-stone-600 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300"
              >
                {p}
              </span>
            ))}
          </div>
        </header>

        {/* ---------- ۱) منبع داده ---------- */}
        <section id="source" className={`${cardCls} mt-4 scroll-mt-20 ${sectionTones[0]}`}>
          <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۱) منبع داده</h2>
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
                فایل اکسل را در قدم ۵ وارد کنید؛ ستون‌ها را به متغیرها نسبت دهید.
              </p>
            </button>
          </div>
        </section>

        {/* ---------- ۲) مشخصات متغیرها ---------- */}
        <section id="variables" className={`${cardCls} mt-4 scroll-mt-20 ${sectionTones[1]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۲) مشخصات متغیرها</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                نقش ← نام ← جمع‌پذیری (نمره کل) ← زیرمقیاس‌ها. متغیر جمع‌پذیر با نمره کل وارد مدل می‌شود؛ متغیر غیرجمع‌پذیر
                به‌صورت زیرمقیاس‌های مستقل با فلش‌های جداگانه وارد می‌شود.
              </p>
            </div>
            <button type="button" className={btnLight} onClick={addVar}>
              <Plus className="h-4 w-4" />
              افزودن متغیر
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            {vars.map((v) => {
              const sumMin = v.subscales.reduce((s, x) => s + x.min, 0);
              const sumMax = v.subscales.reduce((s, x) => s + x.max, 0);
              const totalMatches =
                v.hasTotal && v.subscales.length > 0 && sumMin === v.totalMin && sumMax === v.totalMax;
              return (
                <div key={v.id} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                  {/* ردیف ۱: نقش و نام */}
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
                      <input
                        className={inputCls}
                        value={v.name}
                        onChange={(e) => updateVar(v.id, { name: e.target.value })}
                      />
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

                  {/* ردیف ۲: جمع‌پذیری (نمره کل دارد؟) */}
                  <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3 dark:border-stone-700 dark:bg-slate-900/60">
                    <div className="flex flex-wrap items-center gap-6">
                      <span className="text-sm font-extrabold text-stone-800 dark:text-stone-200">
                        جمع‌پذیر است؟ (نمره کل دارد؟)
                      </span>
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                        <input
                          type="radio"
                          name={`hasTotal-${v.id}`}
                          checked={v.hasTotal}
                          onChange={() => updateVar(v.id, { hasTotal: true })}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        بله — نمره کل دارد
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                        <input
                          type="radio"
                          name={`hasTotal-${v.id}`}
                          checked={!v.hasTotal}
                          onChange={() => updateVar(v.id, { hasTotal: false })}
                          className="h-4 w-4 accent-indigo-600"
                        />
                        خیر — زیرمقیاس‌ها مستقل‌اند
                      </label>
                    </div>
                    <div className="mt-2 grid max-w-md grid-cols-2 gap-3">
                      <div>
                        <label className={labelCls}>حداقل نمره کل</label>
                        <input
                          type="number"
                          className={`${inputCls} ${v.hasTotal ? "" : "opacity-50"}`}
                          value={v.totalMin}
                          disabled={!v.hasTotal}
                          onChange={(e) => updateVar(v.id, { totalMin: Number(e.target.value) })}
                        />
                      </div>
                      <div>
                        <label className={labelCls}>حداکثر نمره کل</label>
                        <input
                          type="number"
                          className={`${inputCls} ${v.hasTotal ? "" : "opacity-50"}`}
                          value={v.totalMax}
                          disabled={!v.hasTotal}
                          onChange={(e) => updateVar(v.id, { totalMax: Number(e.target.value) })}
                        />
                      </div>
                    </div>
                    {!v.hasTotal && v.subscales.length > 0 && (
                      <p className={`${tinyCls} mt-1`}>
                        غیرجمع‌پذیر: هر زیرمقیاس یک متغیر مستقل در مدل می‌شود و فلش‌های جداگانه می‌گیرد.
                      </p>
                    )}
                  </div>

                  {/* ردیف ۳: زیرمقیاس‌ها */}
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
                          onChange={() => updateVar(v.id, { subscales: [] })}
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
                              <input
                                className={inputCls}
                                value={s.name}
                                placeholder="نام زیرمقیاس"
                                onChange={(e) => setSubscaleName(v.id, si, e.target.value)}
                              />
                              <input
                                type="number"
                                dir="ltr"
                                className={inputCls}
                                value={s.min}
                                onChange={(e) => setSubscaleRange(v.id, si, "min", Number(e.target.value))}
                              />
                              <input
                                type="number"
                                dir="ltr"
                                className={inputCls}
                                value={s.max}
                                onChange={(e) => setSubscaleRange(v.id, si, "max", Number(e.target.value))}
                              />
                              <button
                                type="button"
                                onClick={() => removeSubscale(v.id, si)}
                                className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 transition hover:border-red-200 hover:text-red-500 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-400"
                                title="حذف زیرمقیاس"
                              >
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
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px]">
                          {v.hasTotal &&
                            (totalMatches ? (
                              <span className="rounded-full bg-emerald-100 px-3 py-1 font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                                ✓ نمره کل با جمع زیرمقیاس‌ها برابر است
                              </span>
                            ) : (
                              <span className="rounded-full bg-amber-100 px-3 py-1 font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                                ⚠ نمره کل ({v.totalMin} تا {v.totalMax}) با جمع زیرمقیاس‌ها ({sumMin} تا {sumMax}) برابر نیست
                              </span>
                            ))}
                        </div>

                        <button type="button" className={`${btnLight} mt-3`} onClick={() => addSubscale(v.id)}>
                          <Plus className="h-4 w-4" />
                          افزودن زیرمقیاس
                        </button>
                      </>
                    ) : (
                      <p className={`${tinyCls} mt-2`}>
                        بدون زیرمقیاس: متغیر تک‌نمره‌ای (مشاهده‌شده) در نظر گرفته می‌شود.
                      </p>
                    )}
                  </div>

                  {/* نگاشت ستون‌ها در حالت واقعی */}
                  {source === "real" && (
                    <div className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
                      <p className="text-[12px] font-bold text-indigo-700 dark:text-indigo-300">
                        نگاشت ستون‌های فایل به متغیر «{v.name}»
                      </p>
                      {v.subscales.length === 0 ? (
                        <div className="mt-2 max-w-xs">
                          <label className={labelCls}>ستون نمره / متغیر</label>
                          <select
                            className={inputCls}
                            value={colMap[v.id]?.[0] ?? -1}
                            onChange={(e) => updateColMap(v.id, 0, e.target.value === "-1" ? null : Number(e.target.value))}
                          >
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
                              <select
                                className={inputCls}
                                value={colMap[v.id]?.[si] ?? -1}
                                onChange={(e) => updateColMap(v.id, si, e.target.value === "-1" ? null : Number(e.target.value))}
                              >
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

        {/* ---------- ۳) ترسیم مدل ---------- */}
        <section id="draw-model" className={`${cardCls} mt-4 scroll-mt-20 ${sectionTones[2]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۳) ترسیم مدل</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                هر فلش در یک خط جداگانه قابل فعال/غیرفعال کردن است. در متغیرهای غیرجمع‌پذیر، هر زیرمقیاس فلش مستقل خودش را
                دارد. غیرفعال‌کردن فلش = صفر فرض‌شدن آن مسیر.
              </p>
            </div>
            <button type="button" className={btnSecondary} onClick={() => setShowBigDiagram(true)}>
              <RefreshCw className="h-4 w-4" />
              مشاهده بزرگ مدل
            </button>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[380px_1fr]">
            {/* لیست فلش‌ها — هر کدام در یک خط */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
              <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">
                فلش‌های مدل ({arrows.length} فعال از {allArrows.length})
              </p>
              <div className="mt-2 max-h-[520px] space-y-1.5 overflow-y-auto pe-1">
                {allArrows.map((a) => {
                  const active = !inactiveArrowIds.has(a.id);
                  const f = nodeLabel(a.fromNode);
                  const t = nodeLabel(a.toNode);
                  return (
                    <label
                      key={a.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11.5px] font-bold transition ${
                        active
                          ? "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300"
                          : "border-stone-200 bg-stone-50 text-stone-400 line-through dark:border-stone-700 dark:bg-slate-900 dark:text-stone-500"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={active}
                        onChange={() => toggleArrow(a.id)}
                        className="h-3.5 w-3.5 shrink-0 accent-emerald-600"
                      />
                      <span className="truncate">
                        {f} ← {t}
                      </span>
                    </label>
                  );
                })}
              </div>
              <p className={`${tinyCls} mt-2`}>
                نکته: وقتی همه فلش‌ها فعال‌اند مدل اشباع است (CFI=1، RMSEA=0)؛ با غیرفعال‌کردن یک فلش، برازش معنادار و
                قابل آزمون می‌شود.
              </p>
            </div>

            {/* پیش‌نمایش بزرگ */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
              <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">پیش‌نمایش مدل</p>
              <div className="mt-2">
                <PathDiagram vars={vars} nodes={nodes} arrows={arrows} />
              </div>
            </div>
          </div>
        </section>

        {/* ---------- ۴) قیود تولید ---------- */}
        {source === "generate" && (
          <section id="constraints" className={`${cardCls} mt-4 scroll-mt-20 ${sectionTones[3]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۴) قیود تولید داده</h2>
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
                <input
                  type="number"
                  className={inputCls}
                  value={constraints.bootSamples}
                  onChange={(e) => setConstraints({ ...constraints, bootSamples: Number(e.target.value) })}
                />
                <p className={tinyCls}>پیش‌فرض: 5000</p>
              </div>
              <div>
                <label className={labelCls}>درصد داده گمشده</label>
                <input
                  type="number"
                  min={0}
                  max={20}
                  className={inputCls}
                  value={constraints.missingPct}
                  onChange={(e) => setConstraints({ ...constraints, missingPct: Number(e.target.value) })}
                />
              </div>
              <div>
                <label className={labelCls}>درصد داده پرت</label>
                <input
                  type="number"
                  min={0}
                  max={10}
                  className={inputCls}
                  value={constraints.outlierPct}
                  onChange={(e) => setConstraints({ ...constraints, outlierPct: Number(e.target.value) })}
                />
              </div>
            </div>

            {/* قید مسیرها (سطح متغیر) */}
            <h3 className="mt-5 font-extrabold text-stone-800 dark:text-stone-200">قیود مسیرهای مستقیم</h3>
            <p className={tinyCls}>
              برای هر جفت متغیر (شامل همه فلش‌های بین گره‌هایشان) مشخص کنید معنی‌دار باشد، نباشد یا مهم نباشد؛ بازه β
              اختیاری است.
            </p>
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
                    const t = constraints.pathTargets[key] ?? { sig: "sig", betaMin: null, betaMax: null };
                    return (
                      <tr key={key}>
                        <td style={{ fontWeight: 900 }}>{varName(fv)} ← {varName(tv)}</td>
                        <td>
                          <select
                            className={`${inputCls} !py-1.5`}
                            value={t.sig}
                            onChange={(e) => setPathTarget(key, { sig: e.target.value as PathTarget["sig"] })}
                          >
                            <option value="sig">معنی‌دار باشد</option>
                            <option value="ns">معنی‌دار نباشد</option>
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
                            value={t.betaMin ?? ""}
                            onChange={(e) => setPathTarget(key, { betaMin: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            step={0.05}
                            dir="ltr"
                            className={`${inputCls} !py-1.5`}
                            placeholder="—"
                            value={t.betaMax ?? ""}
                            onChange={(e) => setPathTarget(key, { betaMax: e.target.value === "" ? null : Number(e.target.value) })}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* قید اثر غیرمستقیم — هر مسیر + کل */}
            {indirectRows.length > 0 && (
              <>
                <h3 className="mt-5 font-extrabold text-stone-800 dark:text-stone-200">
                  قیود اثرات غیرمستقیم (میانجی‌گری — با بوت‌استرپ)
                </h3>
                <p className={tinyCls}>
                  برای هر مسیر میانجی جداگانه و برای «کل» اثر غیرمستقیم، معناداری با بوت‌استرپ تعیین می‌شود.
                </p>
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
                            <td>{row.label}</td>
                            <td>
                              <select
                                className={`${inputCls} !py-1.5`}
                                value={val}
                                onChange={(e) => setIndirectTarget(row.key, e.target.value as IndirectTarget)}
                              >
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

            {/* پیش‌فرض‌ها */}
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
                      {item.conflict
                        ? "با وجود داده پرت عمدی، این قید خودکار غیرفعال است (سازگار نیستند)."
                        : item.desc}
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
                    <input
                      type="number"
                      step={0.05}
                      dir="ltr"
                      className={`${inputCls} !py-1`}
                      disabled={constraints.r2Range == null}
                      value={constraints.r2Range?.min ?? 0.3}
                      onChange={(e) => setConstraints({ ...constraints, r2Range: { min: Number(e.target.value), max: constraints.r2Range?.max ?? 0.6 } })}
                    />
                    <input
                      type="number"
                      step={0.05}
                      dir="ltr"
                      className={`${inputCls} !py-1`}
                      disabled={constraints.r2Range == null}
                      value={constraints.r2Range?.max ?? 0.6}
                      onChange={(e) => setConstraints({ ...constraints, r2Range: { min: constraints.r2Range?.min ?? 0.3, max: Number(e.target.value) } })}
                    />
                  </span>
                </span>
              </label>

              <div className="rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">
                  شاخص‌های برازش (قابل تنظیم — پیش‌فرض‌های داوری)
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    CFI ≥
                    <input
                      type="number"
                      step={0.01}
                      dir="ltr"
                      className={`${inputCls} !w-20 !py-1`}
                      value={constraints.cfiMin}
                      onChange={(e) => setConstraints({ ...constraints, cfiMin: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    RMSEA ≤
                    <input
                      type="number"
                      step={0.01}
                      dir="ltr"
                      className={`${inputCls} !w-20 !py-1`}
                      value={constraints.rmseaMax}
                      onChange={(e) => setConstraints({ ...constraints, rmseaMax: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    χ²/df ≤
                    <input
                      type="number"
                      step={0.1}
                      dir="ltr"
                      className={`${inputCls} !w-20 !py-1`}
                      value={constraints.chi2dfMax}
                      onChange={(e) => setConstraints({ ...constraints, chi2dfMax: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600 dark:text-stone-300">
                    SRMR ≤
                    <input
                      type="number"
                      step={0.01}
                      dir="ltr"
                      className={`${inputCls} !w-20 !py-1`}
                      value={constraints.srmrMax}
                      onChange={(e) => setConstraints({ ...constraints, srmrMax: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <p className={`${tinyCls} mt-1`}>پیش‌فرض معقول: CFI ≥ 0.90 ، RMSEA ≤ 0.08 ، χ²/df ≤ 3 ، SRMR ≤ 0.08</p>
              </div>

              <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3 dark:border-emerald-800 dark:bg-emerald-950/30">
                <p className="text-sm font-extrabold text-emerald-800 dark:text-emerald-300">پیش‌فرض‌های واقع‌گرایانه</p>
                <p className={`${tinyCls} mt-1 text-emerald-700 dark:text-emerald-400`}>
                  ضرایب مسیر، بارهای عاملی (0.6 تا 0.85) و R² در محدوده‌های متعارف پژوهش‌های واقعی ساخته می‌شوند تا خروجی
                  برای داوری و آموزش قابل قبول باشد و همه فرضیه‌های فعال معنادار شوند.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ---------- ۵) جدول داده ---------- */}
        <section id="data-table" className={`${cardCls} mt-4 scroll-mt-20 ${sectionTones[4]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۵) جدول داده</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                داده‌ها قابل ویرایش‌اند؛ ایمپورت و اکسپورت با اکسل انجام می‌شود.
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
              <button type="button" className={btnSecondary} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                ایمپورت اکسل
              </button>
              <button type="button" className={btnSecondary} onClick={downloadTemplate}>
                <FileSpreadsheet className="h-4 w-4" />
                دانلود قالب داده
              </button>
              <button type="button" className={btnSecondary} onClick={exportExcel}>
                <Download className="h-4 w-4" />
                اکسپورت اکسل
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
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
              هنوز داده‌ای وجود ندارد. دکمه «تولید داده و تحلیل» (بالای صفحه) را بزنید یا فایل اکسل وارد کنید.
            </div>
          )}
        </section>

        {/* ---------- ۶) بررسی پیش‌فرض‌ها ---------- */}
        <section id="assumptions" className={`${cardCls} mt-4 scroll-mt-20 ${sectionTones[5]}`}>
          <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۶) بررسی پیش‌فرض‌های تحلیل</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
            شش پیش‌فرض استاندارد مدل معادلات ساختاری روی داده فعلی محاسبه می‌شود.
          </p>

          {!analysis ? (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
              بعد از تولید یا ورود داده، نتایج این بخش نمایش داده می‌شود.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              <div>
                <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۱) داده‌های گمشده</h3>
                <p className={tinyCls}>در مدل معادلات ساختاری داده‌ها باید کامل باشند؛ تحلیل با حذف لیستی موارد ناقص انجام می‌شود.</p>
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
                <AssumptionNote
                  condition="هیچ سلولی از داده‌ها خالی نباشد"
                  pass={analysis.missing.every((m) => m.count === 0)}
                />
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
                <p className={tinyCls}>بر اساس نظر کلاین (۲۰۲۳): قدرمطلق کجی کوچک‌تر از ۳ و قدرمطلق کشیدگی کوچک‌تر از ۱۰.</p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>گره</th><th>دامنه نمره</th><th>کجی</th><th>کشیدگی</th><th>نتیجه کجی</th><th>نتیجه کشیدگی</th></tr>
                    </thead>
                    <tbody>
                      {analysis.normals.map((x, i) => {
                        const nd = nodes[i];
                        const v = vars.find((vv) => vv.id === nd.varId);
                        const rangeText = nd.kind === "total"
                          ? `${v?.totalMin}-${v?.totalMax} (کل)`
                          : nd.kind === "sub"
                            ? `${v?.subscales.find((s) => `${v?.name} — ${s.name}` === nd.label)?.min}-${v?.subscales.find((s) => `${v?.name} — ${s.name}` === nd.label)?.max}`
                            : `${v?.totalMin}-${v?.totalMax}`;
                        return (
                          <tr key={i}>
                            <td>{x.name}</td>
                            <td className="text-start text-[11px]">{rangeText}</td>
                            <td className="number-cell">{fmt(x.skew)}</td>
                            <td className="number-cell">{fmt(x.kurt)}</td>
                            <td dangerouslySetInnerHTML={{ __html: Math.abs(x.skew) < 3 ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                            <td dangerouslySetInnerHTML={{ __html: Math.abs(x.kurt) < 10 ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <AssumptionNote
                  condition="قدرمطلق کجی هر گره کمتر از ۳ و قدرمطلق کشیدگی کمتر از ۱۰ باشد (کلاین، ۲۰۲۳)"
                  pass={analysis.normals.every((x) => Math.abs(x.skew) < 3 && Math.abs(x.kurt) < 10)}
                />
              </div>

              <div>
                <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۴) نرمال بودن چندمتغیری (ضریب مردیا)</h3>
                <p className={tinyCls}>بر اساس پیشنهاد بلانچ (۲۰۱۲): نسبت بحرانی ضریب کشیدگی استانداردشده مردیا کوچک‌تر از ۵.</p>
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
                  condition="نسبت بحرانی ضریب کشیدگی مردیا کمتر از ۵ باشد (بلانچ، ۲۰۱۲)"
                  pass={analysis.mardia.valid && analysis.mardia.cr < 5}
                />
              </div>

              <div>
                <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۵) خطی بودن روابط (ماتریس همبستگی پیرسون)</h3>
                <p className={tinyCls}>اعداد زیر قطر ماتریس قرار دارند؛ ** معناداری در سطح ۰/۰۱ و * معناداری در سطح ۰/۰۵.</p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr>
                        <th>گره</th>
                        {nodes.map((nd, i) => (
                          <th key={i}>{nd.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {nodes.map((nd, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 900 }}>{nd.label}</td>
                          {nodes.map((_, j) => {
                            if (i === j) return <td key={j} className="number-cell">1</td>;
                            if (i < j) return <td key={j} />;
                            const r = analysis.corr.r[i][j];
                            const p = analysis.corr.p[i][j];
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
                  pass={arrows.every((a) => (analysis.corr.p[a.fromNode]?.[a.toNode] ?? 1) < 0.05)}
                />
              </div>

              <div>
                <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۶) عدم هم‌خطی چندگانه و استقلال خطاها</h3>
                <p className={tinyCls}>معیار: VIF کمتر از ۵ و آماره دوربین-واتسون بین ۱/۵ تا ۲/۵ (تلورانس = 1/VIF).</p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>گره وابسته</th><th>پیش‌بین‌ها</th><th>VIF</th><th>تلورانس</th><th>دوربین-واتسون</th><th>نتیجه</th></tr>
                    </thead>
                    <tbody>
                      {nodes.map((nd) => {
                        if (nd.role === "exogenous") return null;
                        const vifs = analysis.sem.vifs[nd.nodeId] ?? [];
                        const dw = analysis.sem.dw[nd.nodeId] ?? NaN;
                        const preds = arrows.filter((a) => a.active && a.toNode === nd.nodeId).map((a) => nodeLabel(a.fromNode));
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
                  pass={nodes
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

        {/* ---------- ۷) نتایج ---------- */}
        <section id="results" className={`${cardCls} mt-4 scroll-mt-20 ${sectionTones[6]}`}>
          <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۷) نتایج</h2>
          {!analysis ? (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
              بعد از تحلیل، دیاگرام مدل، ضرایب مسیر، اثرات، R² و شاخص‌های برازش اینجا نمایش داده می‌شود.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              <div>
                <h3 className="font-extrabold text-stone-800 dark:text-stone-200">دیاگرام مدل</h3>
                <div className="mt-2">
                  <PathDiagram vars={vars} nodes={nodes} arrows={arrows} results={analysis.sem} />
                </div>
                <button type="button" className={`${btnSecondary} mt-2`} onClick={() => setShowBigDiagram(true)}>
                  <RefreshCw className="h-4 w-4" />
                  مشاهده بزرگ
                </button>
              </div>

              {analysis.meas.length > 0 && (
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">
                    مدل اندازه‌گیری (آلفای کرونباخ نمره کل و بارهای عاملی)
                  </h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>متغیر پنهان</th><th>شاخص</th><th>بار عاملی</th><th>آلفای کرونباخ (نمره کل)</th><th>نتیجه</th></tr>
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

              <div>
                <h3 className="font-extrabold text-stone-800 dark:text-stone-200">ضرایب مسیر (هر فلش)</h3>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>مسیر</th><th>B (غیراستاندارد)</th><th>SE</th><th>t</th><th>p</th><th>β (استاندارد)</th><th>نتیجه</th></tr>
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
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">
                    اثرات مستقیم، غیرمستقیم و کل (بوت‌استرپ)
                  </h3>
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
                  هر مسیر میانجی جداگانه گزارش می‌شود و «کل اثر غیرمستقیم» مجموع همه مسیرهاست. فاصله اطمینان ۹۵٪ با
                  بوت‌استرپ؛ عدم عبور از صفر = معناداری در سطح ۰/۰۵.
                </p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>مسیر غیرمستقیم</th><th>اثر مستقیم</th><th>اثر غیرمستقیم</th><th>CI پایین ۹۵٪</th><th>CI بالا ۹۵٪</th><th>p بوت‌استرپ</th><th>اثر کل</th><th>نتیجه میانجی</th></tr>
                    </thead>
                    <tbody>
                      {bootResults === null && (
                        <tr>
                          <td colSpan={8} className="muted">
                            {bootBusy ? "در حال محاسبه بوت‌استرپ..." : "برای محاسبه فاصله اطمینان، بوت‌استرپ را اجرا کنید."}
                          </td>
                        </tr>
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
                <p className={`${tinyCls} mt-1 text-stone-500 dark:text-stone-400`}>* p &lt; 0.05 ، ** p &lt; 0.01 ، *** p &lt; 0.001</p>
              </div>

              <div>
                <h3 className="font-extrabold text-stone-800 dark:text-stone-200">R² گره‌های درون‌زا</h3>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>گره</th><th>R²</th><th>نتیجه</th></tr>
                    </thead>
                    <tbody>
                      {nodes.map((nd) =>
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

              {answerKey && (
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">کلید پاسخ (مقادیر هدف در برابر واقعی — مخصوص استاد)</h3>
                  <p className={`${tinyCls} mt-1`}>
                    کلید پاسخ یعنی ضرایب استانداردی (β) که هنگام تولید داده برای هر فلش «هدف» قرار گرفته‌اند، در برابر
                    ضرایبی که در داده نهایی «واقعاً» برآورد شده‌اند. دانشجو باید با تحلیل داده به ضرایبی نزدیک به ستون
                    «ضریب واقعی» برسد؛ این جدول فقط برای استاد است.
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
            <PathDiagram vars={vars} nodes={nodes} arrows={arrows} results={analysis?.sem} large />
          </div>
        </div>
      )}

      {/* ---------- مودال نتیجه تحلیل ---------- */}
      {modal && <ResultModal ok={modal.ok} lines={modal.lines} onClose={() => setModal(null)} />}

      {/* ---------- فوتر ثابت خروجی ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 shadow-[0_-6px_24px_rgba(24,32,51,0.08)] backdrop-blur dark:border-stone-700 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-[1280px] flex-col items-center gap-1.5 px-4 py-2.5">
          <p className="text-center text-[12px] leading-5 text-stone-500 dark:text-stone-400">
            برای دریافت خروجی مورد نظر، روی دکمه مربوطه کلیک کنید؛ اکسل کامل شامل شیت‌های «داده»، «نمرات کل / گره‌ها» و
            «گزارش»، قالب داده برای پر کردن و ایمپورت مجدد، و گزارش docx یا txt جداگانه در دسترس است. بکاپ تنظیمات و داده
            را هم می‌توانید ذخیره و بازیابی کنید.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" className={btnPrimary} onClick={exportExcel}>
              <Download className="h-4 w-4" />
              دانلود اکسل کامل
            </button>
            <button type="button" className={btnSecondary} onClick={downloadTemplate}>
              <FileSpreadsheet className="h-4 w-4" />
              دانلود قالب داده
            </button>
            <button type="button" className={btnLight} onClick={exportDocx}>
              <FileText className="h-4 w-4" />
              گزارش docx
            </button>
            <button type="button" className={btnLight} onClick={exportTxt}>
              <FileText className="h-4 w-4" />
              گزارش txt
            </button>
            <button type="button" className={btnLight} onClick={copyReport}>
              <Copy className="h-4 w-4" />
              کپی کل گزارش
            </button>
            <button type="button" className={btnLight} onClick={backup}>
              <Download className="h-4 w-4" />
              بکاپ تنظیمات
            </button>
            <input
              ref={restoreRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) restore(f);
                e.target.value = "";
              }}
            />
            <button type="button" className={btnLight} onClick={() => restoreRef.current?.click()}>
              <Upload className="h-4 w-4" />
              بازیابی بکاپ
            </button>
          </div>
          <div aria-live="polite" className="min-h-5">
            {footerMsg && (
              <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-[12px] font-bold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                ✓ {footerMsg}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
