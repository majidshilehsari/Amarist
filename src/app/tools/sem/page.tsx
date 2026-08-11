"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Download,
  Play,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import { fmt, fmtP } from "@/lib/statistics";
import {
  cronbachAlpha,
  estimateSem,
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
  type SemAnswerKey,
  type VariableSpec,
} from "@/lib/sem-generator";

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
    slots.forEach((slot, si) => {
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
      void si;
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
  const composites: number[][] = vars.map(() => Array(n).fill(0));
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
// ساخت گزارش متنی (برای خروجی ورد/گزارش)
// ------------------------------------------------------------

function buildReportText(
  vars: VariableSpec[],
  analysis: Analysis | null,
  answerKey: SemAnswerKey | null,
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
  normals.forEach((x) =>
    L.push(`  ${x.name}: کجی=${fmt(x.skew)} | کشیدگی=${fmt(x.kurt)}`)
  );
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
        row.map((r, j) => (j <= i ? "" : `${vars[j].name}=${fmt(r)}${corr.p[i][j] < 0.01 ? "**" : corr.p[i][j] < 0.05 ? "*" : ""}`)).filter(Boolean).join("، ")
    );
  });
  L.push("");
  L.push("۶) هم‌خطی و استقلال خطاها:");
  vars.forEach((v) => {
    if (v.role === "exogenous") return;
    const vifs = sem.vifs[v.id] ?? [];
    const dw = sem.dw[v.id];
    if (vifs.length) {
      L.push(`  ${v.name}: VIF=${vifs.map((x) => fmt(x)).join("، ")} | دوربین-واتسون=${Number.isFinite(dw as number) ? fmt(dw as number) : "-"}`);
    }
  });
  L.push("");
  L.push("۷) ضرایب مسیر:");
  sem.paths.forEach((pr) => {
    const from = vars[pr.from].name;
    const to = vars[pr.to].name;
    L.push(
      `  ${from} ← ${to}: B=${fmt(pr.b)} | β=${fmt(pr.std)} | SE=${fmt(pr.se)} | t=${fmt(pr.t)} | p=${fmtP(pr.p)}`
    );
  });
  L.push("");
  L.push("۸) اثرات (مستقیم / غیرمستقیم / کل):");
  sem.effects.forEach((ef) => {
    L.push(
      `  ${vars[ef.from].name} ← ${vars[ef.to].name}: مستقیم=${fmt(ef.direct)} | غیرمستقیم=${fmt(ef.indirect)} (z=${fmt(ef.zIndirect)}، p=${fmtP(ef.pIndirect)}) | کل=${fmt(ef.total)}`
    );
  });
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
    L.push("۱۱) مدل اندازه‌گیری (آلفای کرونباخ و بارهای عاملی):");
    meas.forEach((m) => {
      L.push(`  ${m.name}: آلفا=${fmt(m.alpha)} | بارها=${m.loadings.map((x) => fmt(x)).join("، ")}`);
    });
  }
  if (answerKey) {
    L.push("");
    L.push("۱۲) کلید پاسخ (مقادیر هدف در برابر مقادیر واقعی):");
    answerKey.pathTargets.forEach((pt) => {
      L.push(
        `  ${vars[pt.from].name} ← ${vars[pt.to].name}: هدف=${fmt(pt.target)} | واقعی=${fmt(pt.actual)}`
      );
    });
  }
  return L.join("\n");
}

// ------------------------------------------------------------
// تایپ تحلیل
// ------------------------------------------------------------

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

// ------------------------------------------------------------
// کامپوننت اصلی
// ------------------------------------------------------------

export default function SemTool() {
  const [source, setSource] = useState<"generate" | "real">("generate");
  const [vars, setVars] = useState<VariableSpec[]>([
    { id: 0, name: "طرحواره‌های ناسازگار اولیه", role: "exogenous", hasTotal: true, subscales: ["حوزه اول: بریدگی و طرد", "حوزه دوم: خودگردانی و عملکرد مختل", "حوزه سوم: محدودیت‌های مختل", "حوزه چهارم: دیگرجهت‌مندی", "حوزه پنجم: گوش‌به‌زنگی بیش از حد و بازداری"] },
    { id: 1, name: "اعتیاد به اینستاگرام", role: "mediator", hasTotal: true, subscales: ["اثر اجتماعی", "اجبار"] },
    { id: 2, name: "نشخوار فکری", role: "mediator", hasTotal: true, subscales: ["تأمل", "درون‌نگری", "در فکر فرو رفتن"] },
    { id: 3, name: "احساس تنهایی", role: "outcome", hasTotal: true, subscales: ["احساس تنهایی"] },
  ]);
  const [paths, setPaths] = useState<PathRow[]>(() => buildPaths([
    { id: 0, name: "طرحواره‌های ناسازگار اولیه", role: "exogenous", hasTotal: true, subscales: ["حوزه اول: بریدگی و طرد", "حوزه دوم: خودگردانی و عملکرد مختل", "حوزه سوم: محدودیت‌های مختل", "حوزه چهارم: دیگرجهت‌مندی", "حوزه پنجم: گوش‌به‌زنگی بیش از حد و بازداری"] },
    { id: 1, name: "اعتیاد به اینستاگرام", role: "mediator", hasTotal: true, subscales: ["اثر اجتماعی", "اجبار"] },
    { id: 2, name: "نشخوار فکری", role: "mediator", hasTotal: true, subscales: ["تأمل", "درون‌نگری", "در فکر فرو رفتن"] },
    { id: 3, name: "احساس تنهایی", role: "outcome", hasTotal: true, subscales: ["احساس تنهایی"] },
  ]));
  const [n, setN] = useState("250");
  const [minScale, setMinScale] = useState("1");
  const [maxScale, setMaxScale] = useState("5");
  const [constraints, setConstraints] = useState<GenConstraints>({
    enforcePathSig: true,
    enforceIndirectSig: true,
    r2Range: { min: 0.3, max: 0.6 },
    cfiMin: null,
    rmseaMax: null,
  });
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(number | null)[][]>([]);
  const [colMap, setColMap] = useState<Record<number, (number | null)[]>>({});
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [answerKey, setAnswerKey] = useState<SemAnswerKey | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({
    text: "هنوز تحلیلی اجرا نشده است.",
    kind: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  // ---------- تغییر متغیرها ----------
  const updateVar = (id: number, patch: Partial<VariableSpec>) => {
    setVars((prev) => {
      const next = prev.map((v) => (v.id === id ? { ...v, ...patch } : v));
      setPaths(buildPaths(next));
      return next;
    });
  };

  const addVar = () => {
    setVars((prev) => {
      const id = prev.length ? Math.max(...prev.map((v) => v.id)) + 1 : 0;
      const next = [
        ...prev,
        { id, name: `متغیر ${prev.length + 1}`, role: "outcome" as Role, hasTotal: true, subscales: [] },
      ];
      setPaths(buildPaths(next));
      return next;
    });
  };

  const removeVar = (id: number) => {
    setVars((prev) => {
      const next = prev.filter((v) => v.id !== id);
      setPaths(buildPaths(next));
      return next;
    });
  };

  const addSubscale = (id: number) => {
    updateVar(id, {
      subscales: [...(vars.find((v) => v.id === id)?.subscales ?? []), `زیرمقیاس ${(vars.find((v) => v.id === id)?.subscales.length ?? 0) + 1}`],
    });
  };

  const removeSubscale = (id: number, idx: number) => {
    const v = vars.find((x) => x.id === id);
    if (!v) return;
    updateVar(id, { subscales: v.subscales.filter((_, i) => i !== idx) });
  };

  const setSubscaleName = (id: number, idx: number, name: string) => {
    const v = vars.find((x) => x.id === id);
    if (!v) return;
    updateVar(id, { subscales: v.subscales.map((s, i) => (i === idx ? name : s)) });
  };

  const togglePath = (from: number, to: number) => {
    setPaths((prev) => prev.map((p) => (p.from === from && p.to === to ? { ...p, active: !p.active } : p)));
  };

  // ---------- تحلیل ----------
  const analyze = useCallback(
    (rowsArg?: (number | null)[][], mapArg?: Record<number, (number | null)[]>, colsArg?: string[]) => {
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
        setStatus({ text: "تحلیل با موفقیت اجرا شد.", kind: "ok" });
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
      }
    },
    [rows, colMap, columns, vars, paths]
  );

  // ---------- تولید داده ----------
  const generate = useCallback(() => {
    try {
      const nn = Math.round(Number(n));
      const minS = Number(minScale);
      const maxS = Number(maxScale);
      if (!Number.isFinite(nn) || nn < 20) throw new Error("حجم نمونه باید عددی بزرگ‌تر از ۲۰ باشد.");
      if (!Number.isFinite(minS) || !Number.isFinite(maxS) || minS >= maxS) {
        throw new Error("بازه مقیاس معتبر نیست.");
      }
      const out = generateSemData({
        n: nn,
        minScale: minS,
        maxScale: maxS,
        variables: vars,
        paths,
        constraints,
      });
      setColumns(out.columns);
      setRows(out.rows);
      setColMap(autoMap(out.columns, vars));
      setAnswerKey(out.answerKey);
      setStatus({ text: `داده تولید شد (${out.answerKey.attempts} تلاش). تحلیل خودکار اجرا می‌شود.`, kind: "ok" });
      analyze(out.rows, autoMap(out.columns, vars), out.columns);
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [n, minScale, maxScale, vars, paths, constraints, analyze]);

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
        const hasHeader = first.some(
          (v) => typeof v === "string" && !/^-?\d+(\.\d+)?$/.test(v.trim())
        );
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
        analyze(parsed, cm, headers);
      } catch (err) {
        setStatus({ text: (err as Error).message, kind: "err" });
      }
    },
    [vars, analyze]
  );

  // ---------- خروجی ----------
  const exportExcel = useCallback(() => {
    try {
      if (!rows.length) throw new Error("داده‌ای برای خروجی وجود ندارد.");
      const wb = XLSX.utils.book_new();
      const dataAoa: (string | number | null)[][] = [
        columns,
        ...rows.map((r) => r.map((v) => (v == null ? "" : v))),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(dataAoa), "داده");
      if (analysis) {
        const compAoa: (string | number | null)[][] = [
          vars.map((v) => v.name),
          ...Array.from({ length: rows.length }, (_, i) => vars.map((v) => analysis.composites[v.id][i])),
        ];
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(compAoa), "نمرات کل");
      }
      const report = buildReportText(vars, analysis, answerKey, rows.length);
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(report.split("\n").map((l) => [l])),
        "گزارش"
      );
      XLSX.writeFile(wb, "amarist-sem.xlsx");
      setStatus({ text: "فایل اکسل دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [rows, columns, analysis, vars, answerKey]);

  const exportCSV = useCallback(() => {
    try {
      if (!rows.length) throw new Error("داده‌ای برای خروجی وجود ندارد.");
      const ws = XLSX.utils.aoa_to_sheet([
        columns,
        ...rows.map((r) => r.map((v) => (v == null ? "" : v))),
      ]);
      const csv = XLSX.utils.sheet_to_csv(ws);
      const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-sem-data.csv";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "فایل CSV دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [rows, columns]);

  const exportReport = useCallback(() => {
    try {
      const text = buildReportText(vars, analysis, answerKey, rows.length);
      const blob = new Blob(["\uFEFF" + text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-sem-report.txt";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "گزارش دانلود شد (برای ورد قابل استفاده است).", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [vars, analysis, answerKey, rows.length]);

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

  const possiblePaths = paths;
  const varName = (id: number) => vars.find((v) => v.id === id)?.name ?? `متغیر ${id + 1}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-16">
      <div className="mx-auto max-w-[1280px] px-4">
        {/* ---------- سربرگ ---------- */}
        <header className="mt-6 rounded-[22px] border border-stone-200 bg-white/80 p-6 shadow-lg shadow-stone-900/5 backdrop-blur sm:p-7">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 transition hover:text-indigo-500"
          >
            <ArrowRight className="h-4 w-4" />
            بازگشت به صفحه اصلی
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
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
            {["متغیر پنهان (در صورت وجود زیرمقیاس)", "مدل اندازه‌گیری CFA", "اثر مستقیم / غیرمستقیم / کل", "میانجی‌گری (Sobel)", "شاخص‌های برازش CFI / RMSEA"].map((p) => (
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
                با رعایت قیود انتخابی شما (معنی‌داری مسیرها، R²، اثر میانجی) داده شبیه‌سازی‌شده ساخته می‌شود.
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
                فایل اکسل یا CSV را در قدم ۴ وارد کنید؛ ستون‌ها را به متغیرها نسبت دهید.
              </p>
            </button>
          </div>
          <p className={`${tinyCls} mt-3`}>
            نکته: اگر داده‌ی تولیدشده را نگه دارید و به حالت «واقعی» بروید، می‌توانید همان داده را به‌عنوان داده واقعی تحلیل کنید.
          </p>
        </section>

        {/* ---------- ۲) مشخصات متغیرها ---------- */}
        <section className={`${cardCls} mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">۲) مشخصات متغیرها</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500">
                نام، نقش (برون‌زا / میانجی / درون‌زا)، وجود نمره کل و زیرمقیاس‌ها را مشخص کنید. تمرکز فعلی بر میانجی‌گری است؛ تعدیل‌گر در آینده اضافه می‌شود.
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
                    <input
                      className={inputCls}
                      value={v.name}
                      onChange={(e) => updateVar(v.id, { name: e.target.value })}
                    />
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
                    <p className={`${tinyCls} mt-1`}>
                      بدون زیرمقیاس: متغیر تک‌نمره‌ای (مشاهده‌شده) در نظر گرفته می‌شود.
                    </p>
                  )}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {v.subscales.map((s, si) => (
                      <div key={si} className="flex items-center gap-2">
                        <input
                          className={inputCls}
                          value={s}
                          onChange={(e) => setSubscaleName(v.id, si, e.target.value)}
                        />
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
              {possiblePaths.map((p, i) => (
                <label
                  key={i}
                  className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-bold transition ${
                    p.active ? "border-indigo-300 bg-indigo-50 text-indigo-800" : "border-stone-200 bg-white text-stone-400"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={p.active}
                    onChange={() => togglePath(p.from, p.to)}
                    className="h-4 w-4 accent-indigo-600"
                  />
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
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <label className={labelCls}>حجم نمونه</label>
                <input type="number" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداقل مقیاس</label>
                <input type="number" className={inputCls} value={minScale} onChange={(e) => setMinScale(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداکثر مقیاس</label>
                <input type="number" className={inputCls} value={maxScale} onChange={(e) => setMaxScale(e.target.value)} />
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
                <input
                  type="checkbox"
                  checked={constraints.enforcePathSig}
                  onChange={(e) => setConstraints({ ...constraints, enforcePathSig: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-extrabold text-stone-800">همه مسیرهای فعال معنی‌دار باشند</span>
                  <span className={tinyCls}>p مقدار همه ضرایب مسیر کوچک‌تر از ۰/۰۵ باشد.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
                <input
                  type="checkbox"
                  checked={constraints.enforceIndirectSig}
                  onChange={(e) => setConstraints({ ...constraints, enforceIndirectSig: e.target.checked })}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span>
                  <span className="block text-sm font-extrabold text-stone-800">اثر غیرمستقیم (میانجی) معنی‌دار باشد</span>
                  <span className={tinyCls}>آزمون سوبل برای مسیرهای میانجی معنی‌دار باشد.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
                <input
                  type="checkbox"
                  checked={constraints.r2Range != null}
                  onChange={(e) => setConstraints({ ...constraints, r2Range: e.target.checked ? { min: 0.3, max: 0.6 } : null })}
                  className="mt-1 h-4 w-4 accent-indigo-600"
                />
                <span className="w-full">
                  <span className="block text-sm font-extrabold text-stone-800">بازه R² متغیرهای درون‌زا</span>
                  <span className="mt-1 flex gap-2">
                    <input
                      type="number"
                      step={0.05}
                      className={`${inputCls} !py-1`}
                      disabled={constraints.r2Range == null}
                      value={constraints.r2Range?.min ?? 0.3}
                      onChange={(e) => setConstraints({ ...constraints, r2Range: { min: Number(e.target.value), max: constraints.r2Range?.max ?? 0.6 } })}
                    />
                    <input
                      type="number"
                      step={0.05}
                      className={`${inputCls} !py-1`}
                      disabled={constraints.r2Range == null}
                      value={constraints.r2Range?.max ?? 0.6}
                      onChange={(e) => setConstraints({ ...constraints, r2Range: { min: constraints.r2Range?.min ?? 0.3, max: Number(e.target.value) } })}
                    />
                  </span>
                </span>
              </label>
              <div className="rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
                <p className="text-sm font-extrabold text-stone-800">شاخص‌های برازش (اختیاری — فقط وقتی مسیری غیرفعال باشد اثر دارد)</p>
                <div className="mt-2 flex gap-3">
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600">
                    CFI ≥
                    <input
                      type="number"
                      step={0.01}
                      className={`${inputCls} !w-24 !py-1`}
                      value={constraints.cfiMin ?? 0.9}
                      onChange={(e) => setConstraints({ ...constraints, cfiMin: Number(e.target.value) })}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-[13px] font-bold text-stone-600">
                    RMSEA ≤
                    <input
                      type="number"
                      step={0.01}
                      className={`${inputCls} !w-24 !py-1`}
                      value={constraints.rmseaMax ?? 0.08}
                      onChange={(e) => setConstraints({ ...constraints, rmseaMax: Number(e.target.value) })}
                    />
                  </label>
                </div>
                <p className={tinyCls}>مقدار «خاموش» این قیود را می‌توان با خالی نکردن فیلد کنترل کرد؛ فعلاً همیشه فعال‌اند.</p>
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
                داده‌ها در همین جدول قابل ویرایش‌اند؛ ایمپورت و اکسپورت فوری با اکسل و CSV.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = "";
                }}
              />
              <button className={btnSecondary} onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4" />
                ایمپورت اکسل / CSV
              </button>
              <button className={btnSecondary} onClick={exportExcel}>
                <Download className="h-4 w-4" />
                اکسپورت اکسل
              </button>
              <button className={btnLight} onClick={exportCSV}>
                CSV
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
            <div className="tool-table-wrap mt-4">
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
                <p className={tinyCls}>
                  در مدل معادلات ساختاری داده‌ها باید کامل باشند؛ تحلیل با حذف لیستی موارد ناقص انجام می‌شود.
                </p>
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
                <p className={tinyCls}>
                  فاصله ماهالانوبیس برای هر مورد با توزیع کای‌دو (درجه آزادی = تعداد متغیرها) مقایسه می‌شود؛ p کمتر از ۰/۰۵ نشانه داده پرت است.
                </p>
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
                <p className={tinyCls}>
                  بر اساس نظر کلاین (۲۰۲۳): قدرمطلق کجی کوچک‌تر از ۳ و قدرمطلق کشیدگی کوچک‌تر از ۱۰.
                </p>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>متغیر</th><th>کجی</th><th>کشیدگی</th><th>نتیجه کجی</th><th>نتیجه کشیدگی</th></tr>
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
              </div>

              {/* ۴) مردیا */}
              <div>
                <h3 className="font-extrabold text-stone-800">۴) نرمال بودن چندمتغیری (ضریب مردیا)</h3>
                <p className={tinyCls}>
                  بر اساس پیشنهاد بلانچ (۲۰۱۲): نسبت بحرانی ضریب کشیدگی استانداردشده مردیا کوچک‌تر از ۵.
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
                <p className={tinyCls}>** معناداری در سطح ۰/۰۱ و * معناداری در سطح ۰/۰۵.</p>
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
                            if (i > j) return <td key={j} />;
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
                <p className={tinyCls}>
                  معیار: VIF کمتر از ۲ و آماره دوربین-واتسون بین ۱/۵ تا ۲/۵ (تلورانس = 1/VIF).
                </p>
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
                        const preds = paths
                          .filter((p) => p.active && p.to === v.id)
                          .map((p) => varName(p.from));
                        const vifOk = vifs.every((x) => x < 2);
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
              بعد از تحلیل، ضرایب مسیر، اثرات، R² و شاخص‌های برازش اینجا نمایش داده می‌شود.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {/* مدل اندازه‌گیری */}
              {analysis.meas.length > 0 && (
                <div>
                  <h3 className="font-extrabold text-stone-800">مدل اندازه‌گیری (CFA ساده — آلفای کرونباخ و بارهای عاملی)</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>متغیر پنهان</th><th>زیرمقیاس</th><th>بار عاملی</th><th>آلفای کرونباخ</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {analysis.meas.map((m) =>
                          m.subNames.map((s, si) => (
                            <tr key={`${m.varId}-${si}`}>
                              {si === 0 && <td rowSpan={m.subNames.length} style={{ fontWeight: 900 }}>{m.name}</td>}
                              <td>{s}</td>
                              <td className="number-cell">{fmt(m.loadings[si])}</td>
                              {si === 0 && (
                                <td rowSpan={m.subNames.length} className="number-cell">{fmt(m.alpha)}</td>
                              )}
                              {si === 0 && (
                                <td rowSpan={m.subNames.length} dangerouslySetInnerHTML={{ __html: m.alpha >= 0.7 ? badge(true, "قابل قبول") : badge(false, "ضعیف") }} />
                              )}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
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

              {/* اثرات */}
              <div>
                <h3 className="font-extrabold text-stone-800">اثرات مستقیم، غیرمستقیم و کل (آزمون سوبل)</h3>
                <div className="tool-table-wrap mt-2">
                  <table className="tool-table">
                    <thead>
                      <tr><th>مسیر</th><th>اثر مستقیم</th><th>اثر غیرمستقیم</th><th>z سوبل</th><th>p سوبل</th><th>اثر کل</th><th>نتیجه میانجی</th></tr>
                    </thead>
                    <tbody>
                      {analysis.sem.effects.length === 0 && (
                        <tr><td colSpan={7} className="muted">اثری قابل محاسبه نیست.</td></tr>
                      )}
                      {analysis.sem.effects.map((ef, i) => (
                        <tr key={i}>
                          <td>{varName(ef.from)} ← {varName(ef.to)}</td>
                          <td className="number-cell">{fmt(ef.direct)}</td>
                          <td className="number-cell">{fmt(ef.indirect)}</td>
                          <td className="number-cell">{fmt(ef.zIndirect)}</td>
                          <td className="number-cell">{fmtP(ef.pIndirect)}</td>
                          <td className="number-cell">{fmt(ef.total)}</td>
                          <td dangerouslySetInnerHTML={{ __html: ef.indirect !== 0 && ef.pIndirect < 0.05 ? badge(true, "میانجی معنی‌دار") : ef.indirect === 0 ? badgeWarn("میانجی وجود ندارد") : badge(false, "میانجی غیرمعنی‌دار") }} />
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

        {/* ---------- ۷) خروجی نهایی ---------- */}
        <section className={`${cardCls} mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">۷) خروجی نهایی</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500">
                فایل اکسل شامل سه شیت «داده»، «نمرات کل» و «گزارش» است. گزارش متنی برای استفاده در ورد نیز قابل دانلود است.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className={btnSecondary} onClick={exportExcel}>
                <Download className="h-4 w-4" />
                دانلود اکسل کامل
              </button>
              <button className={btnLight} onClick={exportCSV}>
                دانلود CSV داده
              </button>
              <button className={btnLight} onClick={exportReport}>
                دانلود گزارش (ورد)
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
