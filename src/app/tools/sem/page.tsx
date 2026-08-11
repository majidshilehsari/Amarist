"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
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
  type PathRow,
  type Role,
  type SemResults,
} from "@/lib/sem-stats";
import {
  generateSemData,
  type GenConstraints,
  type IndirectTarget,
  type PathTarget,
  type SemAnswerKey,
  type VariableSpec,
} from "@/lib/sem-generator";
import PathDiagram from "@/components/path-diagram";
import ToolHeader from "@/components/tool-header";

// ------------------------------------------------------------
// ثابت‌های استایل
// ------------------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-[#fbfdff] px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
const labelCls = "mb-1 block text-[12px] font-bold text-stone-600";
const tinyCls = "mt-1 text-[11px] leading-5 text-stone-400";
const cardCls = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 active:translate-y-0";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-extrabold text-indigo-700 transition hover:bg-indigo-100";
const btnLight =
  "inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-bold text-stone-600 transition hover:bg-stone-100";

function badge(ok: boolean, text: string): string {
  return `<span class="assumption-badge ${ok ? "assumption-ok" : "assumption-bad"}">${text}</span>`;
}

function badgeWarn(text: string): string {
  return `<span class="assumption-badge assumption-warn">${text}</span>`;
}

// ------------------------------------------------------------
// سلول قابل ویرایش (غیرکنترل‌شده برای کارایی)
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
      className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[13px] tabular-nums outline-none transition hover:border-stone-200 focus:border-indigo-400 focus:bg-white"
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
// نرمال‌سازی نام ستون برای تطبیق خودکار
// ------------------------------------------------------------

function normName(s: string): string {
  return String(s).replace(/[\s\u200c\u200f-]/g, "").toLowerCase();
}

function autoMap(columns: string[], vars: VariableSpec[]): Record<number, (number | null)[]> {
  const map: Record<number, (number | null)[]> = {};
  const used = new Set<number>();
  vars.forEach((v) => {
    const slots = v.subscales.length ? v.subscales.map((s) => `${v.name} — ${s}`) : [v.name];
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

// ------------------------------------------------------------
// محاسبه نمرات کل از روی ستون‌ها
// ------------------------------------------------------------

function computeComposites(
  rows: (number | null)[][],
  vars: VariableSpec[],
  colMap: Record<number, (number | null)[]>
): { composites: number[][]; indicatorCols: Record<number, number[][]> } {
  const n = rows.length;
  const composites: number[][] = vars.map(() => Array(n).fill(NaN));
  const indicatorCols: Record<number, number[][]> = {};
  vars.forEach((v) => {
    const idxs = colMap[v.id] ?? [];
    const cols: number[][] = idxs
      .filter((i): i is number => i != null)
      .map((i) => rows.map((r) => r[i] as number));
    indicatorCols[v.id] = cols;
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
      composites[v.id][i] = ok ? sum : NaN;
    }
  });
  return { composites, indicatorCols };
}

// ------------------------------------------------------------
// ساخت گزارش متنی (برای docx / txt / کپی)
// ------------------------------------------------------------

function buildReportText(
  vars: VariableSpec[],
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
  L.push(`تعداد موارد: ${n} | تعداد متغیرهای مدل: ${vars.length}`);
  L.push("");
  L.push("۱) داده‌های گمشده:");
  missing.forEach((m) => L.push(`  ${m.col}: ${m.count} مورد گمشده`));
  L.push("");
  L.push("۲) داده پرت چندمتغیری (فاصله ماهالانوبیس، آستانه p<0.05):");
  L.push(maha.valid ? `  تعداد داده پرت: ${maha.outliers.length}` : `  ${maha.message}`);
  L.push("");
  L.push("۳) نرمال بودن تک‌متغیری (معیار کلاین: |کجی|<3 و |کشیدگی|<10):");
  normals.forEach((x) => L.push(`  ${x.name}: کجی=${fmt(x.skew)} | کشیدگی=${fmt(x.kurt)}`));
  L.push("");
  L.push("۴) نرمال بودن چندمتغیری (مردیا):");
  L.push(
    mardia.valid
      ? `  ضریب کشیدگی مردیا=${fmt(mardia.kurtosis)} | نسبت بحرانی=${fmt(mardia.cr)} (معیار بلانچ: کمتر از 5)`
      : `  ${mardia.message}`
  );
  L.push("");
  L.push("۵) ماتریس همبستگی پیرسون (نمرات کل):");
  corr.r.forEach((row, i) => {
    L.push(
      `  ${vars[i].name}: ` +
        row
          .map((r, j) =>
            j > i ? `${vars[j].name}=${fmt(r)}${corr.p[i][j] < 0.01 ? "**" : corr.p[i][j] < 0.05 ? "*" : ""}` : ""
          )
          .filter(Boolean)
          .join("، ")
    );
  });
  L.push("");
  L.push("۶) هم‌خطی و استقلال خطاها:");
  vars.forEach((v) => {
    if (v.role === "exogenous") return;
    const vifs = sem.vifs[v.id] ?? [];
    const dw = sem.dw[v.id];
    if (vifs.length) {
      L.push(
        `  ${v.name}: VIF=${vifs.map((x) => fmt(x)).join("، ")} | دوربین-واتسون=${Number.isFinite(dw as number) ? fmt(dw as number) : "-"}`
      );
    }
  });
  L.push("");
  L.push("۷) ضرایب مسیر:");
  sem.paths.forEach((pr) => {
    const from = vars[pr.from].name;
    const to = vars[pr.to].name;
    L.push(`  ${from} ← ${to}: B=${fmt(pr.b)} | β=${fmt(pr.std)} | SE=${fmt(pr.se)} | t=${fmt(pr.t)} | p=${fmtP(pr.p)}`);
  });
  L.push("");
  L.push("۸) اثرات (بوت‌استرپ):");
  if (bootResults && bootResults.length) {
    bootResults.forEach((b) => {
      L.push(
        `  ${vars[b.from].name} ← ${vars[b.to].name}: مستقیم=${fmt(b.direct)} | غیرمستقیم=${fmt(b.indirect)} (CI95: ${fmt(b.lo)} تا ${fmt(b.hi)}، p=${fmtP(b.p)}) | کل=${fmt(b.total)}`
      );
    });
  } else {
    sem.effects.forEach((ef) => {
      L.push(
        `  ${vars[ef.from].name} ← ${vars[ef.to].name}: مستقیم=${fmt(ef.direct)} | غیرمستقیم=${fmt(ef.indirect)} | کل=${fmt(ef.total)} (برای فاصله اطمینان، بوت‌استرپ را اجرا کنید)`
      );
    });
  }
  L.push("");
  L.push("۹) R² متغیرهای درون‌زا:");
  vars.forEach((v) => {
    if (v.role !== "exogenous") L.push(`  ${v.name}: R²=${fmt(sem.r2[v.id] ?? 0)}`);
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
  }
  if (answerKey) {
    L.push("");
    L.push("۱۲) کلید پاسخ (مقادیر هدف در برابر مقادیر واقعی):");
    answerKey.pathTargets.forEach((pt) => {
      L.push(`  ${vars[pt.from].name} ← ${vars[pt.to].name}: هدف=${fmt(pt.target)} | واقعی=${fmt(pt.actual)}`);
    });
  }
  return L.join("\n");
}

// ------------------------------------------------------------
// تایپ‌ها
// ------------------------------------------------------------

type BootResult = {
  from: number;
  to: number;
  direct: number;
  indirect: number;
  lo: number;
  hi: number;
  p: number;
  total: number;
};

type Analysis = {
  composites: number[][];
  sem: SemResults;
  corr: { r: number[][]; p: number[][] };
  maha: ReturnType<typeof mahalanobisDistances>;
  mardia: ReturnType<typeof mardiaTest>;
  missing: { col: string; count: number }[];
  normals: { name: string; skew: number; kurt: number }[];
  meas: { varId: number; name: string; alpha: number; loadings: number[]; subNames: string[] }[];
};

// ------------------------------------------------------------
// ساخت مسیرهای ممکن بر اساس نقش‌ها
// ------------------------------------------------------------

function buildPaths(vars: VariableSpec[]): PathRow[] {
  const exogs = vars.filter((x) => x.role === "exogenous").map((x) => x.id);
  const meds = vars.filter((x) => x.role === "mediator").map((x) => x.id);
  const outs = vars.filter((x) => x.role === "outcome").map((x) => x.id);
  const list: PathRow[] = [];
  exogs.forEach((e) => meds.forEach((m) => list.push({ from: e, to: m, active: true })));
  exogs.forEach((e) => outs.forEach((o) => list.push({ from: e, to: o, active: true })));
  meds.forEach((m) => outs.forEach((o) => list.push({ from: m, to: o, active: true })));
  return list;
}

function indirectPairs(vars: VariableSpec[], paths: PathRow[]): { from: number; to: number }[] {
  const meds = vars.filter((v) => v.role === "mediator").map((v) => v.id);
  const pairs: { from: number; to: number }[] = [];
  vars
    .filter((v) => v.role === "exogenous")
    .forEach((e) =>
      vars
        .filter((v) => v.role === "outcome")
        .forEach((o) => {
          const hasMed = meds.some(
            (m) =>
              paths.some((p) => p.active && p.from === e.id && p.to === m) &&
              paths.some((p) => p.active && p.from === m && p.to === o.id)
          );
          if (hasMed) pairs.push({ from: e.id, to: o.id });
        })
    );
  return pairs;
}

// ------------------------------------------------------------
// کامپوننت اصلی
// ------------------------------------------------------------

export default function SemTool() {
  const [source, setSource] = useState<"generate" | "real">("generate");
  const [vars, setVars] = useState<VariableSpec[]>(() => [
    { id: 0, name: "طرحواره‌های ناسازگار اولیه", role: "exogenous", hasTotal: true, itemMin: 1, itemMax: 5, totalMin: 5, totalMax: 25, subscales: ["حوزه اول: بریدگی و طرد", "حوزه دوم: خودگردانی و عملکرد مختل", "حوزه سوم: محدودیت‌های مختل", "حوزه چهارم: دیگرجهت‌مندی", "حوزه پنجم: گوش‌به‌زنگی بیش از حد و بازداری"] },
    { id: 1, name: "اعتیاد به اینستاگرام", role: "mediator", hasTotal: true, itemMin: 1, itemMax: 5, totalMin: 2, totalMax: 10, subscales: ["اثر اجتماعی", "اجبار"] },
    { id: 2, name: "نشخوار فکری", role: "mediator", hasTotal: true, itemMin: 1, itemMax: 5, totalMin: 3, totalMax: 15, subscales: ["تأمل", "درون‌نگری", "در فکر فرو رفتن"] },
    { id: 3, name: "احساس تنهایی", role: "outcome", hasTotal: true, itemMin: 1, itemMax: 5, totalMin: 1, totalMax: 5, subscales: ["احساس تنهایی"] },
  ]);
  const [inactiveKeys, setInactiveKeys] = useState<Set<string>>(() => new Set());
  const allPaths = useMemo(() => buildPaths(vars), [vars]);
  const paths = useMemo(
    () => allPaths.filter((p) => !inactiveKeys.has(`${p.from}:${p.to}`)),
    [allPaths, inactiveKeys]
  );
  const [constraints, setConstraints] = useState<GenConstraints>({
    pathTargets: {},
    indirectTargets: {},
    r2Range: { min: 0.3, max: 0.6 },
    cfiMin: null,
    rmseaMax: null,
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
  const fileRef = useRef<HTMLInputElement>(null);

  // ---------- تغییر متغیرها ----------
  const updateVar = (id: number, patch: Partial<VariableSpec>) => {
    setVars((prev) => prev.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  };

  const updateItemRange = (id: number, field: "itemMin" | "itemMax", value: number) => {
    setVars((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const itemMin = field === "itemMin" ? value : v.itemMin;
        const itemMax = field === "itemMax" ? value : v.itemMax;
        const count = v.subscales.length || 1;
        return {
          ...v,
          itemMin,
          itemMax,
          totalMin: itemMin * count,
          totalMax: itemMax * count,
        };
      })
    );
  };

  const addVar = () => {
    setVars((prev) => {
      const id = prev.length ? Math.max(...prev.map((v) => v.id)) + 1 : 0;
      return [
        ...prev,
        { id, name: `متغیر ${prev.length + 1}`, role: "outcome" as Role, hasTotal: true, itemMin: 1, itemMax: 5, totalMin: 1, totalMax: 5, subscales: [] },
      ];
    });
  };

  const removeVar = (id: number) => {
    setVars((prev) => prev.filter((v) => v.id !== id));
  };

  const addSubscale = (id: number) => {
    setVars((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const subscales = [...v.subscales, `زیرمقیاس ${v.subscales.length + 1}`];
        const count = subscales.length || 1;
        return { ...v, subscales, totalMin: v.itemMin * count, totalMax: v.itemMax * count };
      })
    );
  };

  const removeSubscale = (id: number, idx: number) => {
    setVars((prev) =>
      prev.map((v) => {
        if (v.id !== id) return v;
        const subscales = v.subscales.filter((_, i) => i !== idx);
        const count = subscales.length || 1;
        return { ...v, subscales, totalMin: v.itemMin * count, totalMax: v.itemMax * count };
      })
    );
  };

  const setSubscaleName = (id: number, idx: number, name: string) => {
    setVars((prev) => prev.map((v) => (v.id === id ? { ...v, subscales: v.subscales.map((s, i) => (i === idx ? name : s)) } : v)));
  };

  const togglePath = (from: number, to: number) => {
    const k = `${from}:${to}`;
    setInactiveKeys((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
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
    (compositesArg?: number[][], nBoot?: number) => {
      const comps = compositesArg ?? analysis?.composites;
      if (!comps) return;
      const bootN = nBoot ?? constraints.bootSamples;
      setBootBusy(true);
      setStatus({ text: `در حال اجرای بوت‌استرپ با ${bootN} نمونه...`, kind: "" });
      setTimeout(() => {
        try {
          const sem = estimateSem(comps, vars.map((v) => v.role), paths);
          const raw = bootstrapIndirectEffects(comps, vars.map((v) => v.role), paths, bootN);
          const directOf = (from: number, to: number) =>
            sem.paths.find((p) => p.from === from && p.to === to)?.b ?? 0;
          const res: BootResult[] = raw.map((b) => ({
            from: b.from,
            to: b.to,
            direct: directOf(b.from, b.to),
            indirect: b.indirect,
            lo: b.lo,
            hi: b.hi,
            p: b.p,
            total: directOf(b.from, b.to) + b.indirect,
          }));
          setBootResults(res);
          setBootBusy(false);
          setStatus({ text: `بوت‌استرپ با ${bootN} نمونه تکمیل شد.`, kind: "ok" });
        } catch (err) {
          setBootBusy(false);
          setStatus({ text: (err as Error).message, kind: "err" });
        }
      }, 30);
    },
    [analysis, constraints.bootSamples, vars, paths]
  );

  // ---------- تحلیل ----------
  const analyze = useCallback(
    (rowsArg?: (number | null)[][], mapArg?: Record<number, (number | null)[]>, colsArg?: string[], boot = true) => {
      const r = rowsArg ?? rows;
      const cm = mapArg ?? colMap;
      const c = colsArg ?? columns;
      try {
        if (!r.length) throw new Error("داده‌ای وجود ندارد.");
        const { composites, indicatorCols } = computeComposites(r, vars, cm);
        if (composites.some((col) => col.every((v) => !Number.isFinite(v)))) {
          throw new Error("حداقل یکی از متغیرها داده معتبر ندارد؛ نگاشت ستون‌ها را بررسی کنید.");
        }
        const sem = estimateSem(composites, vars.map((v) => v.role), paths);
        const corr = correlationMatrixWithP(composites);
        const maha = mahalanobisDistances(composites);
        const mardia = mardiaTest(composites);
        const missing = c.map((col, i) => ({
          col,
          count: r.filter((row) => row[i] == null || !Number.isFinite(row[i])).length,
        }));
        const normals = vars.map((v) => ({
          name: v.name,
          skew: skewness(composites[v.id]),
          kurt: kurtosis(composites[v.id]),
        }));
        const meas = vars
          .filter((v) => (indicatorCols[v.id]?.length ?? 0) >= 2)
          .map((v) => ({
            varId: v.id,
            name: v.name,
            alpha: cronbachAlpha(indicatorCols[v.id]),
            loadings: pcaLoadings(indicatorCols[v.id]),
            subNames: v.subscales,
          }));
        setAnalysis({ composites, sem, corr, maha, mardia, missing, normals, meas });
        setBootResults(null);
        setStatus({ text: "تحلیل با موفقیت اجرا شد.", kind: "ok" });
        if (boot) runBootstrap(composites, constraints.bootSamples);
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
      }
    },
    [rows, colMap, columns, vars, paths, constraints.bootSamples, runBootstrap]
  );

  // ---------- تولید داده ----------
  const generate = useCallback(() => {
    try {
      const nn = Math.round(Number(n));
      if (!Number.isFinite(nn) || nn < 20) throw new Error("حجم نمونه باید عددی بزرگ‌تر از ۲۰ باشد.");
      const out = generateSemData({
        n: nn,
        variables: vars,
        paths,
        constraints,
      });
      setColumns(out.columns);
      setRows(out.rows);
      setColMap(autoMap(out.columns, vars));
      setAnswerKey(out.answerKey);
      setStatus({ text: `داده تولید شد (${out.answerKey.attempts} تلاش). تحلیل خودکار اجرا می‌شود.`, kind: "ok" });
      analyze(out.rows, autoMap(out.columns, vars), out.columns, true);
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [n, vars, paths, constraints, analyze]);

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
        analyze(parsed, cm, headers, true);
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
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
            vars.map((v) => v.name),
            ...Array.from({ length: rows.length }, (_, i) => vars.map((v) => analysis.composites[v.id][i])),
          ]),
          "نمرات کل"
        );
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(buildReportText(vars, analysis, answerKey, bootResults, rows.length).split("\n").map((l) => [l])),
        "گزارش"
      );
      XLSX.writeFile(wb, "amarist-sem.xlsx");
      setStatus({ text: "فایل اکسل دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [rows, columns, analysis, vars, answerKey, bootResults]);

  /** دانلود قالب داده با نظم تعیین‌شده — مشتری پر می‌کند و ایمپورت می‌کند */
  const downloadTemplate = useCallback(() => {
    try {
      const headers: string[] = [];
      const sample1: (number | null)[] = [];
      const sample2: (number | null)[] = [];
      const empty: (number | null)[] = [];
      vars.forEach((v) => {
        if (v.subscales.length) {
          v.subscales.forEach((s) => {
            headers.push(`${v.name} — ${s}`);
            sample1.push(v.itemMin);
            sample2.push(v.itemMax);
            empty.push(null);
          });
        } else {
          headers.push(v.name);
          sample1.push(v.itemMin);
          sample2.push(v.itemMax);
          empty.push(null);
        }
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([headers, sample1, sample2, empty, empty, empty]),
        "قالب داده"
      );
      XLSX.writeFile(wb, "amarist-sem-template.xlsx");
      setStatus({ text: "قالب داده دانلود شد؛ آن را پر کنید و دوباره ایمپورت کنید.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [vars]);

  const exportDocx = useCallback(async () => {
    try {
      const lines = buildReportText(vars, analysis, answerKey, bootResults, rows.length).split("\n");
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
  }, [vars, analysis, answerKey, bootResults, rows.length]);

  const exportTxt = useCallback(() => {
    try {
      const text = buildReportText(vars, analysis, answerKey, bootResults, rows.length);
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
  }, [vars, analysis, answerKey, bootResults, rows.length]);

  const copyReport = useCallback(async () => {
    try {
      const text = buildReportText(vars, analysis, answerKey, bootResults, rows.length);
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
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [vars, analysis, answerKey, bootResults, rows.length]);

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
  const modeLabel = hasLatent ? "مدل معادلات ساختاری (SEM) — با متغیر پنهان" : "تحلیل مسیر — متغیرهای مشاهده‌شده";
  const varName = (id: number) => vars.find((v) => v.id === id)?.name ?? `متغیر ${id + 1}`;
  const pairs = indirectPairs(vars, paths);
  const bootSamples = constraints.bootSamples;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-44">
      <ToolHeader title="تحلیل مسیر و مدل معادلات ساختاری (SEM)" subtitle={modeLabel} />

      <div className="mx-auto max-w-[1280px] px-4">
        {/* ---------- هیرو ---------- */}
        <header className="mt-6 rounded-[22px] border border-stone-200 bg-white/80 p-6 shadow-lg shadow-stone-900/5 backdrop-blur sm:p-7">
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-indigo-600 text-white shadow-md">
              <RefreshCw className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
                تحلیل مسیر و مدل معادلات ساختاری (SEM)
              </h1>
              <p className="mt-1 text-sm font-bold text-indigo-600">{modeLabel}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {["متغیر پنهان (در صورت وجود زیرمقیاس)", "مدل اندازه‌گیری CFA", "اثر مستقیم / غیرمستقیم / کل", "میانجی‌گری با بوت‌استرپ", "شاخص‌های برازش CFI / RMSEA"].map((p) => (
              <span key={p} className="inline-flex items-center rounded-full border border-stone-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-stone-600">
                {p}
              </span>
            ))}
          </div>
        </header>

        {/* ---------- ۱) منبع داده ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۱) منبع داده</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            انتخاب کنید داده‌های واقعی پژوهش خود را وارد می‌کنید یا داده تمرینی برای شما تولید شود.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setSource("generate")}
              className={`rounded-2xl border-2 p-4 text-start transition ${
                source === "generate" ? "border-indigo-600 bg-indigo-50" : "border-stone-200 bg-white hover:border-indigo-300"
              }`}
            >
              <p className="font-extrabold text-stone-900">تولید داده تمرینی</p>
              <p className="mt-1 text-[12px] leading-6 text-stone-500">
                با رعایت قیود انتخابی شما (معنی‌داری مسیرها، اثر میانجی، R² و...) داده شبیه‌سازی‌شده ساخته می‌شود.
              </p>
            </button>
            <button
              onClick={() => setSource("real")}
              className={`rounded-2xl border-2 p-4 text-start transition ${
                source === "real" ? "border-indigo-600 bg-indigo-50" : "border-stone-200 bg-white hover:border-indigo-300"
              }`}
            >
              <p className="font-extrabold text-stone-900">داده واقعی خودم</p>
              <p className="mt-1 text-[12px] leading-6 text-stone-500">
                فایل اکسل را در قدم ۴ وارد کنید؛ ستون‌ها را به متغیرها نسبت دهید.
              </p>
            </button>
          </div>
        </section>

        {/* ---------- ۲) مشخصات متغیرها ---------- */}
        <section className={`${cardCls} mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">۲) مشخصات متغیرها</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500">
                نام، نقش (برون‌زا / میانجی / درون‌زا)، دامنه نمره و زیرمقیاس‌ها را مشخص کنید. نمره کل = مجموع زیرمقیاس‌ها.
              </p>
            </div>
            <button className={btnLight} onClick={addVar}>
              <Plus className="h-4 w-4" />
              افزودن متغیر
            </button>
          </div>

          <div className="mt-4 grid gap-4">
            {vars.map((v) => (
              <div key={v.id} className="rounded-2xl border border-stone-200 bg-[#fbfdff] p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-44 flex-1">
                    <label className={labelCls}>نام متغیر</label>
                    <input className={inputCls} value={v.name} onChange={(e) => updateVar(v.id, { name: e.target.value })} />
                  </div>
                  <div className="w-40">
                    <label className={labelCls}>نقش</label>
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
                  <div className="flex items-center gap-2 pt-6">
                    <label className="flex cursor-pointer items-center gap-2 text-[13px] font-bold text-stone-700">
                      <input
                        type="checkbox"
                        checked={v.hasTotal}
                        onChange={(e) => updateVar(v.id, { hasTotal: e.target.checked })}
                        className="h-4 w-4 accent-indigo-600"
                      />
                      نمره کل دارد
                    </label>
                    <button
                      onClick={() => removeVar(v.id)}
                      className="flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100"
                      title="حذف متغیر"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* دامنه نمره */}
                <div className="mt-3 grid gap-3 sm:grid-cols-4">
                  <div>
                    <label className={labelCls}>حداقل نمره زیرمقیاس‌ها</label>
                    <input type="number" className={inputCls} value={v.itemMin} onChange={(e) => updateItemRange(v.id, "itemMin", Number(e.target.value))} />
                  </div>
                  <div>
                    <label className={labelCls}>حداکثر نمره زیرمقیاس‌ها</label>
                    <input type="number" className={inputCls} value={v.itemMax} onChange={(e) => updateItemRange(v.id, "itemMax", Number(e.target.value))} />
                  </div>
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
                <p className={`${tinyCls} mt-1`}>
                  دامنه نمره کل با تغییر دامنه زیرمقیاس‌ها یا تعداد آن‌ها خودکار محاسبه می‌شود (قابل ویرایش دستی).
                </p>

                {/* زیرمقیاس‌ها */}
                <div className="mt-3">
                  <div className="flex items-center justify-between">
                    <label className="text-[12px] font-bold text-stone-600">
                      زیرمقیاس‌ها ({v.subscales.length} عدد)
                      {v.subscales.length > 0 && " — نمره کل = مجموع زیرمقیاس‌ها"}
                    </label>
                    <button className="text-[12px] font-bold text-indigo-600 hover:text-indigo-500" onClick={() => addSubscale(v.id)}>
                      + افزودن زیرمقیاس
                    </button>
                  </div>
                  {v.subscales.length === 0 && (
                    <p className={`${tinyCls} mt-1`}>بدون زیرمقیاس: متغیر تک‌نمره‌ای (مشاهده‌شده) در نظر گرفته می‌شود.</p>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {v.subscales.map((s, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <input className={inputCls} value={s} onChange={(e) => setSubscaleName(v.id, si, e.target.value)} />
                        <button
                          onClick={() => removeSubscale(v.id, si)}
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-400 transition hover:border-red-200 hover:text-red-500"
                          title="حذف زیرمقیاس"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* نگاشت ستون‌ها در حالت واقعی */}
                {source === "real" && (
                  <div className="mt-3 rounded-xl border border-dashed border-indigo-200 bg-indigo-50/50 p-3">
                    <p className="text-[12px] font-bold text-indigo-700">نگاشت ستون‌های فایل به متغیر «{v.name}»</p>
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
                            <label className={labelCls}>{s}</label>
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
            ))}
          </div>

          {/* مسیرهای مدل */}
          <div className="mt-4 rounded-2xl border border-stone-200 bg-[#fbfdff] p-4">
            <p className="text-[12px] font-bold text-stone-600">مسیرهای مدل (فعال/غیرفعال)</p>
            <p className={tinyCls}>با غیرفعال کردن یک مسیر، آن مسیر صفر فرض می‌شود و شاخص‌های برازش معنادار می‌شوند.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {paths.map((p, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-bold transition ${
                    p.active ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-stone-200 bg-white text-stone-400"
                  }`}
                >
                  <input type="checkbox" checked={p.active} onChange={() => togglePath(p.from, p.to)} className="h-4 w-4 accent-indigo-600" />
                  {varName(p.from)} ← {varName(p.to)}
                </label>
              ))}
            </div>
          </div>
        </section>

        {/* ---------- ۳) قیود تولید ---------- */}
        {source === "generate" && (
          <section className={`${cardCls} mt-4`}>
            <h2 className="text-lg font-extrabold text-stone-900">۳) قیود تولید داده</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500">
              مشخص کنید داده تولیدی چه شرایطی را حتماً رعایت کند؛ تولید فقط خروجی‌ای را قبول می‌کند که این شرایط برقرار باشد.
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

            {/* قید مسیرها */}
            <h3 className="mt-5 font-extrabold text-stone-800">قیود مسیرهای مستقیم (بر اساس متغیرهای واردشده)</h3>
            <p className={tinyCls}>
              برای هر مسیر مشخص کنید معنی‌دار باشد، نباشد یا مهم نباشد؛ بازه β استانداردشده اختیاری است (پیش‌فرض: همه معنی‌دار).
            </p>
            <div className="tool-table-wrap mt-3">
              <table className="tool-table" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th>مسیر</th>
                    <th>وضعیت</th>
                    <th>β حداقل</th>
                    <th>β حداکثر</th>
                  </tr>
                </thead>
                <tbody>
                  {paths.filter((p) => p.active).map((p) => {
                    const key = `${p.from}:${p.to}`;
                    const t = constraints.pathTargets[key] ?? { sig: "sig", betaMin: null, betaMax: null };
                    return (
                      <tr key={key}>
                        <td style={{ fontWeight: 900 }}>{varName(p.from)} ← {varName(p.to)}</td>
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

            {/* قید اثر غیرمستقیم */}
            {pairs.length > 0 && (
              <>
                <h3 className="mt-5 font-extrabold text-stone-800">قیود اثرات غیرمستقیم (میانجی‌گری — با بوت‌استرپ)</h3>
                <p className={tinyCls}>برای هر جفت برون‌زا ← درون‌زا، معناداری اثر غیرمستقیم از طریق میانجی‌ها تعیین می‌شود.</p>
                <div className="tool-table-wrap mt-3">
                  <table className="tool-table" style={{ minWidth: 480 }}>
                    <thead>
                      <tr>
                        <th>مسیر غیرمستقیم</th>
                        <th>وضعیت</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pairs.map((pr) => {
                        const key = `${pr.from}:${pr.to}`;
                        const val = constraints.indirectTargets[key] ?? "sig";
                        return (
                          <tr key={key}>
                            <td style={{ fontWeight: 900 }}>{varName(pr.from)} ← … ← {varName(pr.to)}</td>
                            <td>
                              <select
                                className={`${inputCls} !py-1.5`}
                                value={val}
                                onChange={(e) => setIndirectTarget(key, e.target.value as IndirectTarget)}
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
            <h3 className="mt-5 font-extrabold text-stone-800">پیش‌فرض‌های آماری (همگی قابل تنظیم)</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                { key: "enforceNormality" as const, title: "نرمال بودن تک‌متغیری", desc: "کجی < 3 و کشیدگی < 10 (معیار کلاین) برای همه متغیرها", conflict: constraints.outlierPct > 0 },
                { key: "enforceLinearity" as const, title: "خطی بودن روابط", desc: "همبستگی همه مسیرهای فعال معنادار باشد", conflict: false },
                { key: "enforceVif" as const, title: "عدم هم‌خطی چندگانه", desc: "VIF همه پیش‌بین‌ها کمتر از 5", conflict: false },
                { key: "enforceDw" as const, title: "استقلال خطاها", desc: "دوربین-واتسون بین 1.5 تا 2.5", conflict: false },
              ].map((item) => (
                <label key={item.key} className={`flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3 ${item.conflict ? "opacity-60" : ""}`}>
                  <input
                    type="checkbox"
                    checked={constraints[item.key] && !item.conflict}
                    disabled={item.conflict}
                    onChange={(e) => setConstraints({ ...constraints, [item.key]: e.target.checked })}
                    className="mt-1 h-4 w-4 accent-indigo-600"
                  />
                  <span>
                    <span className="block text-sm font-extrabold text-stone-800">{item.title}</span>
                    <span className={tinyCls}>
                      {item.conflict ? "با وجود داده پرت عمدی، این قید به‌صورت خودکار غیرفعال است (داده پرت و نرمال بودن با هم سازگار نیستند)." : item.desc}
                    </span>
                  </span>
                </label>
              ))}
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
                <input
                  type="checkbox"
                  checked={constraints.r2Range != null}
                  onChange={(e) => setConstraints({ ...constraints, r2Range: e.target.checked ? { min: 0.3, max: 0.6 } : null })}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span className="w-full">
                  <span className="block text-sm font-extrabold text-stone-800">بازه R² متغیرهای نتیجه (Y)</span>
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
              <div className="rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
                <p className="text-sm font-extrabold text-stone-800">شاخص‌های برازش (اختیاری)</p>
                <div className="mt-2 flex gap-3">
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600">
                    CFI ≥
                    <input
                      type="number"
                      step={0.01}
                      dir="ltr"
                      className={`${inputCls} !w-20 !py-1`}
                      value={constraints.cfiMin ?? 0.9}
                      onChange={(e) => setConstraints({ ...constraints, cfiMin: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600">
                    RMSEA ≤
                    <input
                      type="number"
                      step={0.01}
                      dir="ltr"
                      className={`${inputCls} !w-20 !py-1`}
                      value={constraints.rmseaMax ?? 0.08}
                      onChange={(e) => setConstraints({ ...constraints, rmseaMax: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <p className={tinyCls}>با خالی‌کردن فیلد، قید غیرفعال می‌شود.</p>
              </div>
              <div className="rounded-xl border border-dashed border-emerald-300 bg-emerald-50/60 p-3">
                <p className="text-sm font-extrabold text-emerald-800">پیش‌فرض‌های واقع‌گرایانه</p>
                <p className={`${tinyCls} mt-1 text-emerald-700`}>
                  ضرایب مسیر، بارهای عاملی (0.6 تا 0.85) و R² در محدوده‌های متعارف پژوهش‌های واقعی ساخته می‌شوند تا خروجی برای
                  داوری و آموزش قابل قبول باشد.
                </p>
              </div>
            </div>
          </section>
        )}

        {/* ---------- ۴) جدول داده ---------- */}
        <section className={`${cardCls} mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">۴) جدول داده</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500">
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
              <button className={btnSecondary} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                ایمپورت اکسل
              </button>
              <button className={btnSecondary} onClick={downloadTemplate}>
                <FileSpreadsheet className="h-4 w-4" />
                دانلود قالب داده
              </button>
              <button className={btnSecondary} onClick={exportExcel}>
                <Download className="h-4 w-4" />
                اکسپورت اکسل
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {source === "generate" && (
              <button className={btnPrimary} onClick={generate}>
                <Play className="h-4 w-4" />
                تولید داده و تحلیل
              </button>
            )}
            <button className={btnSecondary} onClick={() => analyze()}>
              <RefreshCw className="h-4 w-4" />
              اجرای تحلیل روی داده فعلی
            </button>
            <span
              className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                status.kind === "ok" ? "font-bold text-emerald-700" : status.kind === "err" ? "font-bold text-red-700" : "text-stone-400"
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
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
              هنوز داده‌ای وجود ندارد. دکمه «تولید داده و تحلیل» را بزنید یا فایل اکسل وارد کنید.
            </div>
          )}
        </section>

        {/* ---------- ۵) بررسی پیش‌فرض‌ها ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۵) بررسی پیش‌فرض‌های تحلیل</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            شش پیش‌فرض استاندارد مدل معادلات ساختاری روی داده فعلی محاسبه می‌شود.
          </p>

          {!analysis ? (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
              بعد از تولید یا ورود داده، نتایج این بخش نمایش داده می‌شود.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {/* ۱) داده گمشده */}
              <div>
                <h3 className="font-extrabold text-stone-800">۱) داده‌های گمشده</h3>
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
              </div>

              {/* ۲) داده پرت */}
              <div>
                <h3 className="font-extrabold text-stone-800">۲) داده پرت چندمتغیری (فاصله ماهالانوبیس)</h3>
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
              </div>

              {/* ۳) نرمال بودن تک‌متغیری */}
              <div>
                <h3 className="font-extrabold text-stone-800">۳) نرمال بودن تک‌متغیری (کجی و کشیدگی)</h3>
                <p className={tinyCls}>بر اساس نظر کلاین (۲۰۲۳): قدرمطلق کجی کوچک‌تر از ۳ و قدرمطلق کشیدگی کوچک‌تر از ۱۰.</p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>متغیر</th><th>دامنه نمره</th><th>کجی</th><th>کشیدگی</th><th>نتیجه کجی</th><th>نتیجه کشیدگی</th></tr>
                    </thead>
                    <tbody>
                      {analysis.normals.map((x, i) => (
                        <tr key={i}>
                          <td>{x.name}</td>
                          <td className="number-cell">{vars[i].itemMin} تا {vars[i].itemMax}{vars[i].hasTotal ? ` (کل: ${vars[i].totalMin} تا ${vars[i].totalMax})` : ""}</td>
                          <td className="number-cell">{fmt(x.skew)}</td>
                          <td className="number-cell">{fmt(x.kurt)}</td>
                          <td dangerouslySetInnerHTML={{ __html: Math.abs(x.skew) < 3 ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                          <td dangerouslySetInnerHTML={{ __html: Math.abs(x.kurt) < 10 ? badge(true, "برقرار") : badge(false, "برقرار نیست") }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* ۴) مردیا */}
              <div>
                <h3 className="font-extrabold text-stone-800">۴) نرمال بودن چندمتغیری (ضریب مردیا)</h3>
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
              </div>

              {/* ۵) خطی بودن */}
              <div>
                <h3 className="font-extrabold text-stone-800">۵) خطی بودن روابط (ماتریس همبستگی پیرسون)</h3>
                <p className={tinyCls}>** معناداری در سطح ۰/۰۱ و * معناداری در سطح ۰/۰۵. اعداد زیر قطر ماتریس قرار دارند.</p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr>
                        <th>متغیر</th>
                        {vars.map((v, i) => (
                          <th key={i}>{v.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {vars.map((v, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 900 }}>{v.name}</td>
                          {vars.map((_, j) => {
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
              </div>

              {/* ۶) هم‌خطی و استقلال خطاها */}
              <div>
                <h3 className="font-extrabold text-stone-800">۶) عدم هم‌خطی چندگانه و استقلال خطاها</h3>
                <p className={tinyCls}>معیار: VIF کمتر از ۵ و آماره دوربین-واتسون بین ۱/۵ تا ۲/۵ (تلورانس = 1/VIF).</p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>متغیر وابسته</th><th>پیش‌بین‌ها</th><th>VIF</th><th>تلورانس</th><th>دوربین-واتسون</th><th>نتیجه</th></tr>
                    </thead>
                    <tbody>
                      {vars.map((v) => {
                        if (v.role === "exogenous") return null;
                        const vifs = analysis.sem.vifs[v.id] ?? [];
                        const dw = analysis.sem.dw[v.id] ?? NaN;
                        const preds = paths.filter((p) => p.active && p.to === v.id).map((p) => varName(p.from));
                        const vifOk = vifs.every((x) => x < 5);
                        const dwOk = !Number.isFinite(dw) || (dw >= 1.5 && dw <= 2.5);
                        return (
                          <tr key={v.id}>
                            <td style={{ fontWeight: 900 }}>{v.name}</td>
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
              </div>
            </div>
          )}
        </section>

        {/* ---------- ۶) نتایج ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۶) نتایج</h2>
          {!analysis ? (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400">
              بعد از تحلیل، دیاگرام مدل، ضرایب مسیر، اثرات، R² و شاخص‌های برازش اینجا نمایش داده می‌شود.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {/* دیاگرام مدل */}
              <div>
                <h3 className="font-extrabold text-stone-800">دیاگرام مدل</h3>
                <div className="mt-2">
                  <PathDiagram vars={vars} paths={paths} results={analysis.sem} />
                </div>
              </div>

              {/* مدل اندازه‌گیری */}
              {analysis.meas.length > 0 && (
                <div>
                  <h3 className="font-extrabold text-stone-800">مدل اندازه‌گیری (آلفای کرونباخ نمره کل و بارهای عاملی)</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>متغیر پنهان</th><th>شاخص</th><th>بار عاملی</th><th>آلفای کرونباخ (نمره کل)</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {analysis.meas.map((m) => (
                          <>
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
                          </>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={tinyCls}>
                    آلفای کرونباخ روی زیرمقیاس‌های هر متغیر (همان نمره کل) محاسبه می‌شود؛ برای متغیر تک‌شاخصی قابل محاسبه نیست.
                  </p>
                </div>
              )}

              {/* ضرایب مسیر */}
              <div>
                <h3 className="font-extrabold text-stone-800">ضرایب مسیر</h3>
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
                          <td>{varName(pr.from)} ← {varName(pr.to)}</td>
                          <td className="number-cell">{fmt(pr.b)}</td>
                          <td className="number-cell">{fmt(pr.se)}</td>
                          <td className="number-cell">{fmt(pr.t)}</td>
                          <td className="number-cell">{fmtP(pr.p)}</td>
                          <td className="number-cell">{fmt(pr.std)}</td>
                          <td dangerouslySetInnerHTML={{ __html: pr.p < 0.05 ? badge(true, "معنی‌دار") : badge(false, "غیرمعنی‌دار") }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* اثرات با بوت‌استرپ */}
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-extrabold text-stone-800">اثرات مستقیم، غیرمستقیم و کل (بوت‌استرپ)</h3>
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-[12px] font-bold text-stone-600">
                      تعداد نمونه:
                      <input
                        type="number"
                        dir="ltr"
                        className={`${inputCls} !w-24 !py-1`}
                        value={bootSamples}
                        onChange={(e) => setConstraints({ ...constraints, bootSamples: Number(e.target.value) })}
                      />
                    </label>
                    <button
                      className={btnLight}
                      disabled={bootBusy}
                      onClick={() => runBootstrap()}
                    >
                      <RefreshCw className={`h-4 w-4 ${bootBusy ? "animate-spin" : ""}`} />
                      {bootBusy ? "در حال اجرا..." : "اجرای بوت‌استرپ"}
                    </button>
                  </div>
                </div>
                <p className={tinyCls}>
                  فاصله اطمینان ۹۵٪ اثر غیرمستقیم با روش بوت‌استرپ (بازنمونه‌گیری با جایگذاری) محاسبه می‌شود؛ اگر بازه صفر را
                  شامل نشود، میانجی‌گری معنی‌دار است.
                </p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>مسیر</th><th>اثر مستقیم</th><th>اثر غیرمستقیم</th><th>CI پایین ۹۵٪</th><th>CI بالا ۹۵٪</th><th>p بوت‌استرپ</th><th>اثر کل</th><th>نتیجه میانجی</th></tr>
                    </thead>
                    <tbody>
                      {bootResults === null && (
                        <tr><td colSpan={8} className="muted">{bootBusy ? "در حال محاسبه بوت‌استرپ..." : "برای محاسبه فاصله اطمینان، بوت‌استرپ را اجرا کنید (یا تحلیل را دوباره اجرا کنید)."}</td></tr>
                      )}
                      {bootResults?.map((b, i) => (
                        <tr key={i}>
                          <td>{varName(b.from)} ← {varName(b.to)}</td>
                          <td className="number-cell">{fmt(b.direct)}</td>
                          <td className="number-cell">{fmt(b.indirect)}</td>
                          <td className="number-cell">{fmt(b.lo)}</td>
                          <td className="number-cell">{fmt(b.hi)}</td>
                          <td className="number-cell">{fmtP(b.p)}</td>
                          <td className="number-cell">{fmt(b.total)}</td>
                          <td dangerouslySetInnerHTML={{ __html: b.indirect !== 0 && b.p < 0.05 ? badge(true, "میانجی معنی‌دار") : b.indirect === 0 ? badgeWarn("میانجی وجود ندارد") : badge(false, "میانجی غیرمعنی‌دار") }} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* R² */}
              <div>
                <h3 className="font-extrabold text-stone-800">R² متغیرهای درون‌زا</h3>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>متغیر</th><th>R²</th><th>نتیجه</th></tr>
                    </thead>
                    <tbody>
                      {vars.map((v) =>
                        v.role === "exogenous" ? null : (
                          <tr key={v.id}>
                            <td style={{ fontWeight: 900 }}>{v.name}</td>
                            <td className="number-cell">{fmt(analysis.sem.r2[v.id] ?? 0)}</td>
                            <td dangerouslySetInnerHTML={{ __html: (analysis.sem.r2[v.id] ?? 0) >= 0.1 ? badge(true, "قابل قبول") : badgeWarn("کم") }} />
                          </tr>
                        )
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* برازش */}
              <div>
                <h3 className="font-extrabold text-stone-800">شاخص‌های برازش مدل</h3>
                {analysis.sem.fit.valid ? (
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
                ) : (
                  <p className={`${tinyCls} mt-2 text-red-600`}>{analysis.sem.fit.message}</p>
                )}
                {analysis.sem.warnings.map((w, i) => (
                  <p key={i} className={`${tinyCls} mt-1 text-amber-700`}>{w}</p>
                ))}
              </div>

              {/* کلید پاسخ */}
              {answerKey && (
                <div>
                  <h3 className="font-extrabold text-stone-800">کلید پاسخ (مقادیر هدف در برابر واقعی — مخصوص استاد)</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>مسیر</th><th>ضریب هدف (β)</th><th>ضریب واقعی (β)</th><th>وضعیت</th></tr>
                      </thead>
                      <tbody>
                        {answerKey.pathTargets.map((pt, i) => (
                          <tr key={i}>
                            <td>{varName(pt.from)} ← {varName(pt.to)}</td>
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

      {/* ---------- فوتر ثابت خروجی ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 shadow-[0_-6px_24px_rgba(24,32,51,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-2 px-4 py-2.5">
          <span className="text-sm font-extrabold text-stone-800">خروجی نهایی</span>
          <div className="flex flex-wrap items-center gap-2">
            <button className={btnPrimary} onClick={exportExcel}>
              <Download className="h-4 w-4" />
              اکسل کامل
            </button>
            <button className={btnSecondary} onClick={downloadTemplate}>
              <FileSpreadsheet className="h-4 w-4" />
              قالب داده
            </button>
            <button className={btnLight} onClick={exportDocx}>
              <FileText className="h-4 w-4" />
              گزارش docx
            </button>
            <button className={btnLight} onClick={exportTxt}>
              <FileText className="h-4 w-4" />
              گزارش txt
            </button>
            <button className={btnLight} onClick={copyReport}>
              <Copy className="h-4 w-4" />
              کپی گزارش
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
