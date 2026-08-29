"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CheckCircle2,
  ChevronLeft,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  FileText,
  FolderPlus,
  Play,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Packer } from "docx";
import { fmt, fmtP, mean, sampleStd, shapiroWilkTest } from "@/lib/statistics";
import {
  correlationMatrix,
  generateRegressionData,
  multipleRegression,
  regressionColumns,
  type RegressionAnswerKey,
  type RegressionFit,
} from "@/lib/regression";
import {
  buildRegressionDocx,
  buildRegressionReportText,
  type RegressionDescriptive,
} from "@/lib/regression-report";
import ToolHeader from "@/components/tool-header";
import ClinicalStepperShell from "@/components/clinical-stepper-shell";
import ResultModal from "@/components/result-modal";
import { type StepStatus } from "@/components/progress-stepper";

const STORAGE_KEY = "amarist-regression-projects";
const DEFAULT_PROJECT_NAME = "پروژه پیش‌فرض (پیش‌بینی رگرسیونی)";

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

type RegProjectData = {
  source: "generate" | "real";
  k: string;
  predictorNames: string[];
  outcomeName: string;
  xMin: string;
  xMax: string;
  yMin: string;
  yMax: string;
  alpha: string;
  n: string;
  r2Min: string;
  r2Max: string;
  enforceSignificance: boolean;
  enforceNormality: boolean;
  columns: string[];
  rows: (number | null)[][];
  answerKey: RegressionAnswerKey | null;
};

type RegProject = { id: string; name: string; updatedAt: string; data: RegProjectData };

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function defaultPredictorNames(k: number): string[] {
  return Array.from({ length: k }, (_, i) => `X${i + 1}`);
}

function defaultProjectData(): RegProjectData {
  return {
    source: "generate",
    k: "3",
    predictorNames: defaultPredictorNames(3),
    outcomeName: "Y (پیامد)",
    xMin: "0",
    xMax: "100",
    yMin: "0",
    yMax: "100",
    alpha: "0.05",
    n: "120",
    r2Min: "0.4",
    r2Max: "0.6",
    enforceSignificance: true,
    enforceNormality: true,
    columns: [],
    rows: [],
    answerKey: null,
  };
}

type RegAnalysis = {
  valid: boolean;
  message?: string;
  n: number;
  k: number;
  dropped: number;
  descriptives: RegressionDescriptive[];
  correlations: number[][];
  fit?: RegressionFit;
  residualNormality?: { w: number; p: number; pass: boolean };
};

function parseLocalizedNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .trim()
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)))
    .replace(/[،٬,\s]/g, "")
    .replace(/[٫/]/g, ".");
  if (!normalized) return null;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

function computeRegAnalysis(rows: (number | null)[][], k: number, predictorNames: string[], outcomeName: string, alpha: number): RegAnalysis {
  const base: RegAnalysis = { valid: false, n: 0, k, dropped: 0, descriptives: [], correlations: [] };
  if (!rows.length) return { ...base, message: "داده‌ای وجود ندارد؛ ابتدا داده تولید یا وارد کنید." };
  const expected = k + 1;
  if (rows[0].length !== expected) return { ...base, message: `این مدل به ${k} پیش‌بین + ۱ پیامد (${expected} ستون) نیاز دارد؛ تعداد ستون‌های فعلی ${rows[0].length} است.` };

  const complete = rows.map((r) => r.map((v) => (v == null || !Number.isFinite(v) ? NaN : v))).filter((r) => r.every((v) => Number.isFinite(v)));
  const dropped = rows.length - complete.length;
  if (complete.length < k + 2) return { ...base, message: `حداقل ${k + 2} ردیف کامل لازم است (موجود: ${complete.length}).` };

  const cols: number[][] = Array.from({ length: expected }, (_, c) => complete.map((r) => r[c]));
  const Xs = cols.slice(0, k);
  const y = cols[k];
  const fit = multipleRegression(Xs, y);

  const allNames = [...predictorNames, outcomeName];
  const descriptives: RegressionDescriptive[] = allNames.map((nm, c) => ({
    label: nm,
    n: complete.length,
    mean: mean(cols[c]),
    sd: sampleStd(cols[c]),
    min: Math.min(...cols[c]),
    max: Math.max(...cols[c]),
  }));
  const corr = correlationMatrix(cols);
  const sw = shapiroWilkTest(fit.residuals);
  const residualNormality = sw.valid && Number.isFinite(sw.p) ? { w: sw.w, p: sw.p, pass: sw.p >= alpha } : undefined;

  return { valid: true, n: complete.length, k, dropped, descriptives, correlations: corr, fit, residualNormality };
}

export default function RegressionTool() {
  const [projects, setProjects] = useState<RegProject[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw) as RegProject[];
        if (Array.isArray(arr) && arr.length) return arr.filter((p) => p && p.data);
      }
    } catch {
      // ignore
    }
    return [{ id: uid(), name: DEFAULT_PROJECT_NAME, updatedAt: new Date().toISOString(), data: defaultProjectData() }];
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const currentProject = projects.find((p) => p.id === projectId) ?? null;

  const [source, setSource] = useState<"generate" | "real">("generate");
  const [k, setK] = useState("3");
  const [predictorNames, setPredictorNames] = useState<string[]>(defaultPredictorNames(3));
  const [outcomeName, setOutcomeName] = useState("Y (پیامد)");
  const [xMin, setXMin] = useState("0");
  const [xMax, setXMax] = useState("100");
  const [yMin, setYMin] = useState("0");
  const [yMax, setYMax] = useState("100");
  const [alpha, setAlpha] = useState("0.05");
  const [n, setN] = useState("120");
  const [r2Min, setR2Min] = useState("0.4");
  const [r2Max, setR2Max] = useState("0.6");
  const [enforceSignificance, setEnforceSignificance] = useState(true);
  const [enforceNormality, setEnforceNormality] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(number | null)[][]>([]);
  const [answerKey, setAnswerKey] = useState<RegressionAnswerKey | null>(null);

  const [analysisRun, setAnalysisRun] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [completed, setCompleted] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({ text: "", kind: "" });
  const [modal, setModal] = useState<{ ok: boolean; lines: string[] } | null>(null);
  const [diagnoseModal, setDiagnoseModal] = useState(false);
  const [projectModal, setProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [backupModal, setBackupModal] = useState(false);
  const [backupName, setBackupName] = useState("");
  const [backupScope, setBackupScope] = useState<"all" | "one">("all");
  const fileRef = useRef<HTMLInputElement>(null);
  const restoreRef = useRef<HTMLInputElement>(null);

  const alphaNum = Number(alpha);
  const safeAlpha = Number.isFinite(alphaNum) && alphaNum > 0 && alphaNum < 1 ? alphaNum : 0.05;
  const kNum = Math.max(1, Math.min(8, Math.round(Number(k) || 3)));

  const setPredictorName = (idx: number, value: string) => setPredictorNames((prev) => prev.map((x, i) => (i === idx ? value : x)));
  const updateK = (value: string) => {
    const nk = Math.max(1, Math.min(8, Math.round(Number(value) || 1)));
    setK(String(nk));
    setPredictorNames((prev) => Array.from({ length: nk }, (_, i) => prev[i] ?? `X${i + 1}`));
  };

  const steps = useMemo(() => {
    const list: { id: string; label: string; short?: string }[] = [
      { id: "project", label: "پروژه", short: "پروژه" },
      { id: "source", label: "منبع داده", short: "منبع" },
      { id: "spec", label: "مشخصات مدل", short: "مشخصات" },
    ];
    if (source === "generate") {
      list.push({ id: "constraints", label: "قیود تولید داده", short: "قیود" });
      list.push({ id: "diagnose", label: "تشخیص", short: "تشخیص" });
    }
    list.push(
      { id: "data", label: "جدول داده‌ها", short: "داده" },
      { id: "analysis", label: "تحلیل", short: "تحلیل" },
      { id: "descriptive", label: "یافته‌های توصیفی", short: "توصیفی" },
      { id: "inferential", label: "یافته‌های استنباطی", short: "استنباطی" },
      { id: "report", label: "نگارش گزارش", short: "گزارش" },
      { id: "save", label: "ذخیره", short: "ذخیره" }
    );
    return list;
  }, [source]);

  const stepIdx = (id: string) => steps.findIndex((s) => s.id === id);
  const currentStep = Math.min(activeStep, steps.length - 1);
  const analysisSteps = new Set(["descriptive", "inferential", "report"]);

  const analysis = useMemo(
    () => computeRegAnalysis(rows, kNum, predictorNames, outcomeName, safeAlpha),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, kNum, predictorNames, outcomeName, safeAlpha]
  );
  const analysisReady = analysisRun && analysis.valid;

  const stepStatuses: StepStatus[] = useMemo(() => {
    return steps.map((s, i) => {
      if (i === currentStep) return "current";
      if (i > currentStep) return "pending";
      if (analysisSteps.has(s.id)) return completed[s.id] && analysisReady ? "done" : "analysis";
      return completed[s.id] ? "done" : "pending";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps, currentStep, completed, analysisReady]);

  const markDone = (stepId: string) => setCompleted((prev) => (prev[stepId] ? prev : { ...prev, [stepId]: true }));

  const goNext = () => {
    const cur = Math.min(activeStep, steps.length - 1);
    const stepId = steps[cur]?.id ?? "";
    if (stepId === "diagnose") {
      if (!rows.length) setDiagnoseModal(true);
      else markDone(stepId);
      if (rows.length) setActiveStep(Math.min(cur + 1, steps.length - 1));
      return;
    }
    if (stepId === "data" && !rows.length) {
      setModal({ ok: false, lines: ["داده‌ای وجود ندارد؛ ابتدا داده تولید یا وارد کنید."] });
      return;
    }
    markDone(stepId);
    setActiveStep(Math.min(cur + 1, steps.length - 1));
  };

  const goPrev = () => setActiveStep(Math.max(activeStep - 1, 0));

  const inputsKey = JSON.stringify({ source, rows, columns, k, predictorNames, outcomeName, alpha });
  const prevInputsRef = useRef(inputsKey);
  useEffect(() => {
    if (prevInputsRef.current !== inputsKey) {
      prevInputsRef.current = inputsKey;
      setAnalysisRun(false);
    }
  }, [inputsKey]);

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
                  source, k, predictorNames, outcomeName, xMin, xMax, yMin, yMax, alpha, n, r2Min, r2Max,
                  enforceSignificance, enforceNormality, columns, rows, answerKey,
                },
              }
            : p
        );
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }, 150);
    return () => clearTimeout(t);
  }, [projectId, source, k, predictorNames, outcomeName, xMin, xMax, yMin, yMax, alpha, n, r2Min, r2Max, enforceSignificance, enforceNormality, columns, rows, answerKey]);

  function applyProjectData(data: RegProjectData) {
    setSource(data.source);
    const nk = Math.max(1, Math.min(8, Math.round(Number(data.k) || 3)));
    setK(String(nk));
    setPredictorNames(Array.from({ length: nk }, (_, i) => data.predictorNames?.[i] ?? `X${i + 1}`));
    setOutcomeName(data.outcomeName ?? "Y (پیامد)");
    setXMin(data.xMin ?? "0");
    setXMax(data.xMax ?? "100");
    setYMin(data.yMin ?? "0");
    setYMax(data.yMax ?? "100");
    setAlpha(data.alpha ?? "0.05");
    setN(data.n ?? "120");
    setR2Min(data.r2Min ?? "0.4");
    setR2Max(data.r2Max ?? "0.6");
    setEnforceSignificance(data.enforceSignificance ?? true);
    setEnforceNormality(data.enforceNormality ?? true);
    setColumns(data.columns ?? []);
    setRows(data.rows ?? []);
    setAnswerKey(data.answerKey ?? null);
    setAnalysisRun(false);
    setCompleted({});
    setStatus({ text: "", kind: "" });
  }

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
    const p: RegProject = { id: uid(), name, updatedAt: new Date().toISOString(), data: defaultProjectData() };
    setProjects((prev) => {
      const next = [...prev, p];
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore
      }
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(remaining));
    } catch {
      // ignore
    }
    if (projectId === id) {
      const next = remaining[0];
      setProjectId(next.id);
      applyProjectData(next.data);
      setActiveStep(0);
    }
  };

  function buildConstraints() {
    const nn = Math.round(Number(n));
    const rmin = Number(r2Min);
    const rmax = Number(r2Max);
    const xmn = Math.round(Number(xMin));
    const xmx = Math.round(Number(xMax));
    const ymn = Math.round(Number(yMin));
    const ymx = Math.round(Number(yMax));
    if (!Number.isFinite(nn) || nn < kNum + 5) throw new Error(`حجم نمونه باید حداقل ${kNum + 5} باشد.`);
    if (!Number.isFinite(xmn) || !Number.isFinite(xmx) || xmn >= xmx) throw new Error("بازهٔ نمره پیش‌بین‌ها معتبر نیست.");
    if (!Number.isFinite(ymn) || !Number.isFinite(ymx) || ymn >= ymx) throw new Error("بازهٔ نمره پیامد معتبر نیست.");
    if (!Number.isFinite(rmin) || !Number.isFinite(rmax) || rmin < 0 || rmax > 1 || rmin > rmax) throw new Error("بازهٔ R² باید بین 0 و 1 باشد.");
    return {
      n: nn,
      k: kNum,
      alpha: safeAlpha,
      xMin: xmn,
      xMax: xmx,
      yMin: ymn,
      yMax: ymx,
      targetR2: { min: rmin, max: rmax },
      enforceSignificance,
      enforceNormality,
    };
  }

  const generate = useCallback(() => {
    try {
      const constraints = buildConstraints();
      const result = generateRegressionData(constraints, 20000);
      setColumns(result.columns);
      setRows(result.rows);
      setAnswerKey(result.answerKey);
      setAnalysisRun(true);
      setStatus({ text: `دادهٔ تمرینی تولید شد (${result.answerKey.attempts} تلاش).`, kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [n, kNum, alpha, xMin, xMax, yMin, yMax, r2Min, r2Max, enforceSignificance, enforceNormality]);

  const runAnalysis = () => {
    if (!rows.length) {
      setModal({ ok: false, lines: ["داده‌ای وجود ندارد؛ ابتدا داده تولید یا وارد کنید."] });
      return;
    }
    if (!analysis.valid) {
      setModal({ ok: false, lines: [analysis.message ?? "تحلیل قابل انجام نیست."] });
      return;
    }
    setAnalysisRun(true);
    setStatus({ text: "تحلیل با موفقیت اجرا شد.", kind: "ok" });
  };

  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("فایل اکسل خالی است.");
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
      if (!aoa.length) throw new Error("فایل اکسل خالی است.");
      const expected = kNum + 1;
      const first = aoa[0] ?? [];
      const hasHeader = first.some((v) => typeof v === "string" && v.trim() !== "" && parseLocalizedNumber(v) == null);
      const dataRows = hasHeader ? aoa.slice(1) : aoa;
      const outRows = dataRows.map((r) => Array.from({ length: expected }, (_, j) => parseLocalizedNumber((r as unknown[])[j])));
      setSource("real");
      setColumns(regressionColumns(kNum));
      setRows(outRows);
      setAnswerKey(null);
      setAnalysisRun(false);
      setStatus({ text: `داده واقعی وارد شد: ${outRows.length} ردیف × ${expected} ستون. «اجرای تحلیل» را بزنید.`, kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
  };

  const downloadTemplate = () => {
    try {
      const headers = regressionColumns(kNum);
      const sample: (string | number | null)[][] = [headers];
      for (let i = 0; i < 4; i++) sample.push(headers.map((_, c) => (c < kNum ? 50 : 60)));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sample), "قالب داده");
      XLSX.writeFile(wb, "amarist-regression-template.xlsx");
      setStatus({ text: "قالب داده دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const reportInput = useMemo(() => {
    return {
      projectName: currentProject?.name ?? "پروژه",
      source,
      predictorNames,
      outcomeName,
      n: analysis.n,
      k: kNum,
      alpha: safeAlpha,
      descriptives: analysis.descriptives,
      correlations: analysis.correlations,
      fit: analysis.fit,
      residualNormality: analysis.residualNormality,
      answerKey: answerKey ?? undefined,
    } as const;
  }, [currentProject, source, predictorNames, outcomeName, kNum, safeAlpha, analysis, answerKey]);

  const reportText = useMemo(() => buildRegressionReportText(reportInput), [reportInput]);

  const exportExcel = () => {
    try {
      if (!rows.length) throw new Error("داده‌ای برای خروجی وجود ندارد.");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => r.map((v) => (v == null ? "" : v)))]), "داده");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reportText.split("\n").map((l) => [l])), "گزارش");
      XLSX.writeFile(wb, "amarist-regression.xlsx");
      setStatus({ text: "فایل اکسل دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const exportDocx = async () => {
    try {
      const blob = await Packer.toBlob(buildRegressionDocx(reportInput));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-regression-report.docx";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "گزارش docx دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const exportTxt = () => {
    try {
      const blob = new Blob(["\uFEFF" + reportText], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-regression-report.txt";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "گزارش txt دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const copyReport = async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(reportText);
      } else {
        const ta = document.createElement("textarea");
        ta.value = reportText;
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

  const copyData = async () => {
    try {
      if (!rows.length) throw new Error("ابتدا داده تولید یا وارد کنید.");
      const text = [columns.join("\t"), ...rows.map((r) => r.map((v) => (v == null ? "" : v)).join("\t"))].join("\n");
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
      setStatus({ text: "جدول داده کپی شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const openBackupModal = () => {
    const now = new Date();
    const pad = (x: number) => String(x).padStart(2, "0");
    setBackupName(`بکاپ-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}`);
    setBackupScope("all");
    setBackupModal(true);
  };

  const doBackup = () => {
    try {
      const safeName = backupName.trim().replace(/[\\/:*?"<>|]+/g, "-").replace(/\.json$/i, "") || "بکاپ";
      const data = backupScope === "all" ? { version: 1, type: "projects", projects } : { version: 1, type: "project", project: currentProject };
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
      if (data?.type === "projects" && Array.isArray(data.projects)) {
        const restored = data.projects.filter((p: RegProject) => p && p.data);
        if (!restored.length) throw new Error("بکاپ معتبر نیست.");
        setProjects(restored);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(restored));
        setProjectId(restored[0].id);
        applyProjectData(restored[0].data);
        setActiveStep(0);
        setStatus({ text: `${restored.length} پروژه بازیابی شد.`, kind: "ok" });
      } else if (data?.type === "project" && data.project) {
        const p = data.project as RegProject;
        setProjects((prev) => {
          const idx = prev.findIndex((x) => x.id === p.id);
          const next = idx >= 0 ? prev.map((x, i) => (i === idx ? p : x)) : [...prev, p];
          localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
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

  const updateCell = (rowIdx: number, colIdx: number, value: number | null) => {
    setRows((prev) => prev.map((r, i) => (i === rowIdx ? r.map((v, j) => (j === colIdx ? value : v)) : r)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-emerald-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-24 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <ToolHeader title="پیش‌بینی رگرسیونی" subtitle="رگرسیون خطی چندگانه — تولید دادهٔ تمرینی هدفمند یا تحلیل دادهٔ واقعی" />

      <ClinicalStepperShell
        steps={steps}
        statuses={stepStatuses}
        activeStep={currentStep}
        onSelect={(i) => {
          if (i >= 0 && i <= currentStep) setActiveStep(i);
        }}
        onPrev={goPrev}
        onNext={goNext}
      >
        {/* پروژه */}
        {currentStep === stepIdx("project") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[0]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">پروژه‌ها</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              همه داده‌ها در مرورگر شما ذخیره می‌شوند؛ پروژه انتخاب کنید یا جدید بسازید و با «بکاپ» ذخیره/منتقل کنید.
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
                    {p.id === projectId && <span className="rounded-full bg-indigo-600 px-2 py-0.5 text-[10px] font-bold text-white">فعال</span>}
                  </div>
                  <p className="mt-1 text-[11px] text-stone-400 dark:text-stone-500">
                    {p.data.rows.length} ردیف · {p.data.k} پیش‌بین · به‌روزرسانی: {new Date(p.updatedAt).toLocaleDateString("fa-IR")}
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
              <input ref={restoreRef} type="file" accept=".json" className="hidden" onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) restoreBackup(f);
                e.target.value = "";
              }} />
              <button type="button" className={btnLight} onClick={() => restoreRef.current?.click()}>
                <Upload className="h-4 w-4" />
                بازیابی از بکاپ
              </button>
            </div>
          </section>
        )}

        {/* منبع داده */}
        {currentStep === stepIdx("source") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[1]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">منبع داده</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">داده واقعی وارد می‌کنید یا داده تمرینی تولید شود؟</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSource("generate")}
                className={`rounded-2xl border-2 p-4 text-start transition ${source === "generate" ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40" : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"}`}
              >
                <p className="font-extrabold text-stone-900 dark:text-stone-100">تولید داده تمرینی</p>
                <p className="mt-1 text-[12px] leading-6 text-stone-500 dark:text-stone-400">با R² هدف، معنی‌داری ضرایب و نرمال بودن باقیمانده‌ها.</p>
              </button>
              <button
                type="button"
                onClick={() => setSource("real")}
                className={`rounded-2xl border-2 p-4 text-start transition ${source === "real" ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40" : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"}`}
              >
                <p className="font-extrabold text-stone-900 dark:text-stone-100">داده واقعی خودم</p>
                <p className="mt-1 text-[12px] leading-6 text-stone-500 dark:text-stone-400">ستون‌ها: پیش‌بین‌ها و ستون آخر = پیامد؛ در «جدول داده‌ها» وارد کنید.</p>
              </button>
            </div>
          </section>
        )}

        {/* مشخصات مدل */}
        {currentStep === stepIdx("spec") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[2]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">مشخصات مدل</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">تعداد پیش‌بین‌ها، نام متغیرها، دامنه نمره و سطح معناداری.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>تعداد متغیرهای پیش‌بین</label>
                <select className={inputCls} value={k} onChange={(e) => updateK(e.target.value)}>
                  {Array.from({ length: 8 }, (_, i) => i + 1).map((v) => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>نام متغیر پیامد</label>
                <input className={inputCls} value={outcomeName} onChange={(e) => setOutcomeName(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>سطح معناداری α</label>
                <input type="number" step={0.001} dir="ltr" className={inputCls} value={alpha} onChange={(e) => setAlpha(e.target.value)} />
              </div>
            </div>

            <div className="mt-4">
              <label className={labelCls}>نام متغیرهای پیش‌بین</label>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {predictorNames.map((nm, i) => (
                  <input key={i} className={inputCls} value={nm} onChange={(e) => setPredictorName(i, e.target.value)} />
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelCls}>حداقل نمره پیش‌بین‌ها</label>
                <input type="number" dir="ltr" className={inputCls} value={xMin} onChange={(e) => setXMin(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداکثر نمره پیش‌بین‌ها</label>
                <input type="number" dir="ltr" className={inputCls} value={xMax} onChange={(e) => setXMax(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداقل نمره پیامد</label>
                <input type="number" dir="ltr" className={inputCls} value={yMin} onChange={(e) => setYMin(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداکثر نمره پیامد</label>
                <input type="number" dir="ltr" className={inputCls} value={yMax} onChange={(e) => setYMax(e.target.value)} />
              </div>
            </div>
          </section>
        )}

        {/* قیود تولید */}
        {currentStep === stepIdx("constraints") && source === "generate" && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[3]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">قیود تولید داده</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">تولید فقط خروجی‌ای را می‌پذیرد که این شرایط برقرار باشد.</p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>حجم نمونه (n)</label>
                <input type="number" dir="ltr" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداقل R² (هدف)</label>
                <input type="number" step={0.05} dir="ltr" className={inputCls} value={r2Min} onChange={(e) => setR2Min(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداکثر R² (هدف)</label>
                <input type="number" step={0.05} dir="ltr" className={inputCls} value={r2Max} onChange={(e) => setR2Max(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <input type="checkbox" checked={enforceSignificance} onChange={(e) => setEnforceSignificance(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">معنی‌داری همه ضرایب</span>
                  <span className={tinyCls}>p هر ضریب پیش‌بین کمتر از α باشد.</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <input type="checkbox" checked={enforceNormality} onChange={(e) => setEnforceNormality(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">نرمال بودن باقیمانده‌ها</span>
                  <span className={tinyCls}>آزمون شاپیرو-ویلک روی باقیمانده‌ها (p ≥ α).</span>
                </span>
              </label>
            </div>
          </section>
        )}

        {/* تشخیص */}
        {currentStep === stepIdx("diagnose") && source === "generate" && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[4]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">تشخیص</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">خلاصه طرح را مرور و داده تولید کنید.</p>
            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
              {[
                `مدل: رگرسیون خطی چندگانه با ${kNum} پیش‌بین («${predictorNames.join("، ")}») و پیامد «${outcomeName}»`,
                `حجم نمونه: ${n} | α = ${alpha}`,
                `هدف: R² بین ${r2Min} تا ${r2Max}${enforceSignificance ? " + معنی‌داری همه ضرایب" : ""}${enforceNormality ? " + نرمال بودن باقیمانده‌ها" : ""}`,
              ].map((l, i) => (
                <p key={i} className="flex items-start gap-2 py-1 text-[13px] leading-6 text-stone-700 dark:text-stone-300">
                  <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-emerald-500" />
                  {l}
                </p>
              ))}
            </div>
            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button type="button" className={btnPrimary} onClick={generate}>
                <Play className="h-4 w-4" />
                {rows.length ? "تولید مجدد داده" : "تولید داده"}
              </button>
              <span className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                status.kind === "ok" ? "font-bold text-emerald-700 dark:text-emerald-400" : status.kind === "err" ? "font-bold text-red-700 dark:text-red-400" : "text-stone-400 dark:text-stone-500"
              }`}>
                {status.kind === "ok" ? "✓" : status.kind === "err" ? "✗" : "•"} {status.text}
              </span>
            </div>
            {rows.length > 0 && (
              <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-[13px] leading-6 text-stone-700 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300">
                <p><b>وضعیت داده:</b> {rows.length} ردیف × {columns.length} ستون</p>
                <p><b>وضعیت تحلیل:</b> {analysisReady ? "اجرا شده" : "اجرا نشده"}</p>
              </div>
            )}
          </section>
        )}

        {/* جدول داده‌ها */}
        {currentStep === stepIdx("data") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[5]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">جدول داده‌ها</h2>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                  {source === "generate" ? "داده‌ها در مرحله «تشخیص» تولید می‌شوند؛ اینجا می‌توانید ویرایش یا اکسپورت کنید." : "فایل اکسل وارد کنید (پیش‌بین‌ها + ستون آخر پیامد) یا از قالب استفاده کنید."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = "";
                }} />
                <button type="button" className={btnSecondary} onClick={downloadTemplate}><FileSpreadsheet className="h-4 w-4" />دانلود قالب</button>
                <button type="button" className={btnSecondary} onClick={() => fileRef.current?.click()}><Upload className="h-4 w-4" />ایمپورت اکسل</button>
                <button type="button" className={btnSecondary} onClick={exportExcel}><Download className="h-4 w-4" />اکسپورت اکسل</button>
                <button type="button" className={btnLight} onClick={copyData}><Copy className="h-4 w-4" />کپی داده</button>
              </div>
            </div>
            {rows.length > 0 ? (
              <div className="tool-table-wrap tool-table-scroll mt-4">
                <table className="tool-table" style={{ minWidth: Math.max(360, columns.length * 110) }}>
                  <thead>
                    <tr><th>ردیف</th>{columns.map((c, i) => (<th key={i}>{c}</th>))}</tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        <td className="row-index">{i + 1}</td>
                        {r.map((v, j) => (
                          <td key={j}><EditableCell value={v} onCommit={(nv) => updateCell(i, j, nv)} /></td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && <p className={`${tinyCls} mt-2 text-center`}>نمایش ۲۰۰ ردیف اول ({rows.length} ردیف کل).</p>}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                هنوز داده‌ای وجود ندارد.
              </div>
            )}
          </section>
        )}

        {/* تحلیل */}
        {currentStep === stepIdx("analysis") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[6]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">تحلیل</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">مدل رگرسیون با «اجرای تحلیل» برآورد می‌شود.</p>
            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-[13px] leading-6 text-stone-700 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300">
              {rows.length ? (
                <>
                  <p><b>وضعیت داده:</b> {rows.length} ردیف × {columns.length} ستون</p>
                  <p><b>وضعیت تحلیل:</b> {analysisReady ? "اجرا شده" : "اجرا نشده"}</p>
                  {analysis.valid && <p><b>موارد کامل:</b> {analysis.n}{analysis.dropped > 0 ? ` — ${analysis.dropped} ردیف ناقص حذف شد.` : ""}</p>}
                  {!analysis.valid && analysis.message && <p className="mt-1 rounded-lg bg-amber-50 p-2 font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">{analysis.message}</p>}
                </>
              ) : (
                <p><b>وضعیت داده:</b> هنوز داده‌ای وجود ندارد.</p>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="button" className={btnPrimary} disabled={!rows.length} onClick={runAnalysis}>
                <RefreshCw className="h-4 w-4" />
                {analysisReady ? "اجرای مجدد تحلیل" : "اجرای تحلیل"}
              </button>
              <span className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                status.kind === "ok" ? "font-bold text-emerald-700 dark:text-emerald-400" : status.kind === "err" ? "font-bold text-red-700 dark:text-red-400" : "text-stone-400 dark:text-stone-500"
              }`}>
                {status.kind === "ok" ? "✓" : status.kind === "err" ? "✗" : "•"} {status.text}
              </span>
            </div>
          </section>
        )}

        {/* یافته‌های توصیفی */}
        {currentStep === stepIdx("descriptive") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[0]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">یافته‌های توصیفی</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">میانگین، انحراف معیار و ماتریس همبستگی.</p>
            {!analysisReady ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">ابتدا تحلیل را اجرا کنید.</div>
            ) : (
              <div className="mt-4 space-y-6">
                <div className="tool-table-wrap">
                  <table className="tool-table">
                    <thead><tr><th>متغیر</th><th>n</th><th>میانگین</th><th>انحراف معیار</th><th>کمینه</th><th>بیشینه</th></tr></thead>
                    <tbody>
                      {analysis.descriptives.map((d, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 800 }}>{d.label}</td>
                          <td className="number-cell">{d.n}</td>
                          <td className="number-cell">{fmt(d.mean)}</td>
                          <td className="number-cell">{fmt(d.sd)}</td>
                          <td className="number-cell">{fmt(d.min)}</td>
                          <td className="number-cell">{fmt(d.max)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">ماتریس همبستگی پیرسون</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead><tr><th>متغیر</th>{[...predictorNames, outcomeName].map((nm) => (<th key={nm}>{nm}</th>))}</tr></thead>
                      <tbody>
                        {analysis.correlations.map((row, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 800 }}>{[...predictorNames, outcomeName][i]}</td>
                            {row.map((v, j) => (<td key={j} className="number-cell">{fmt(v, 2)}</td>))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </section>
        )}

        {/* یافته‌های استنباطی */}
        {currentStep === stepIdx("inferential") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[1]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">یافته‌های استنباطی</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">برازش کلی مدل و ضرایب رگرسیون.</p>
            {!analysisReady || !analysis.fit ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">ابتدا تحلیل را اجرا کنید.</div>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">برازش مدل</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead><tr><th>شاخص</th><th>مقدار</th></tr></thead>
                      <tbody>
                        <tr><td>R²</td><td className="number-cell">{fmt(analysis.fit.r2, 3)}</td></tr>
                        <tr><td>R² تعدیل‌شده</td><td className="number-cell">{fmt(analysis.fit.adjR2, 3)}</td></tr>
                        <tr><td>F ({analysis.fit.k}، {analysis.fit.n - analysis.fit.k - 1})</td><td className="number-cell">{fmt(analysis.fit.F)}</td></tr>
                        <tr><td>p (مدل)</td><td className="number-cell">{fmtP(analysis.fit.pF)}{starP(analysis.fit.pF)}</td></tr>
                      </tbody>
                    </table>
                  </div>
                </div>
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">ضرایب رگرسیون</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table" style={{ minWidth: 640 }}>
                      <thead><tr><th>متغیر</th><th>B</th><th>SE</th><th>β استاندارد</th><th>t</th><th>p</th></tr></thead>
                      <tbody>
                        <tr>
                          <td style={{ fontWeight: 800 }}>عرض از مبدأ</td>
                          <td className="number-cell">{fmt(analysis.fit.intercept)}</td>
                          <td className="number-cell">{fmt(analysis.fit.se[0] ?? NaN, 3)}</td>
                          <td className="number-cell">—</td>
                          <td className="number-cell">—</td>
                          <td className="number-cell">—</td>
                        </tr>
                        {analysis.fit.coefs.map((b, i) => (
                          <tr key={i}>
                            <td style={{ fontWeight: 800 }}>{predictorNames[i] ?? `X${i + 1}`}</td>
                            <td className="number-cell">{fmt(b)}</td>
                            <td className="number-cell">{fmt(analysis.fit!.se[i], 3)}</td>
                            <td className="number-cell">{fmt(analysis.fit!.stdBetas[i])}</td>
                            <td className="number-cell">{fmt(analysis.fit!.t[i])}</td>
                            <td className="number-cell">{fmtP(analysis.fit!.p[i])}{starP(analysis.fit!.p[i])}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={`${tinyCls} mt-1`}>* p &lt; 0.05 ، ** p &lt; 0.01 ، *** p &lt; 0.001</p>
                </div>
                {analysis.residualNormality && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">پیش‌فرض نرمال بودن باقیمانده‌ها</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead><tr><th>W</th><th>p</th><th>نتیجه</th></tr></thead>
                        <tbody>
                          <tr>
                            <td className="number-cell">{fmt(analysis.residualNormality.w, 3)}</td>
                            <td className="number-cell">{fmtP(analysis.residualNormality.p)}</td>
                            <td><Badge ok={analysis.residualNormality.pass} text={analysis.residualNormality.pass ? "برقرار" : "برقرار نیست"} /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {answerKey?.targetR2 && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">کلید پاسخ (مخصوص استاد)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead><tr><th>شاخص</th><th>هدف</th><th>واقعی</th></tr></thead>
                        <tbody>
                          <tr><td>R²</td><td className="number-cell">{fmt(answerKey.targetR2.target, 3)}</td><td className="number-cell">{fmt(answerKey.targetR2.actual, 3)}</td></tr>
                          <tr><td>تعداد تلاش تولید</td><td className="number-cell">—</td><td className="number-cell">{answerKey.attempts}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* گزارش */}
        {currentStep === stepIdx("report") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[2]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">نگارش گزارش</h2>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">گزارش کامل تحلیل؛ کپی یا دانلود کنید.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={btnPrimary} onClick={exportDocx}><FileText className="h-4 w-4" />گزارش docx</button>
                <button type="button" className={btnLight} onClick={exportTxt}><FileText className="h-4 w-4" />گزارش txt</button>
                <button type="button" className={btnLight} onClick={copyReport}><Copy className="h-4 w-4" />کپی گزارش</button>
              </div>
            </div>
            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
              <pre dir="rtl" className="max-h-[520px] overflow-auto whitespace-pre-wrap text-[12.5px] leading-7 text-stone-700 dark:text-stone-300">{reportText}</pre>
            </div>
          </section>
        )}

        {/* ذخیره */}
        {currentStep === stepIdx("save") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[3]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">ذخیره</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">پروژه به‌صورت خودکار ذخیره می‌شود؛ برای انتقال، بکاپ بگیرید.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">بکاپ این پروژه</p>
                <p className={`${tinyCls} mt-1`}>فقط پروژه فعلی.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnSecondary} onClick={() => { setBackupName(`بکاپ-${currentProject?.name ?? "پروژه"}`); setBackupScope("one"); setBackupModal(true); }}>
                    <Download className="h-4 w-4" />بکاپ این پروژه
                  </button>
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">بکاپ تمام پروژه‌ها</p>
                <p className={`${tinyCls} mt-1`}>همه {projects.length} پروژه.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnSecondary} onClick={openBackupModal}><Download className="h-4 w-4" />بکاپ تمام پروژه‌ها</button>
                  <button type="button" className={btnLight} onClick={() => restoreRef.current?.click()}><Upload className="h-4 w-4" />بازیابی</button>
                </div>
              </div>
            </div>
          </section>
        )}
      </ClinicalStepperShell>

      {/* مودال تشخیص */}
      {diagnoseModal && (
        <div className="fixed inset-0 z-[72] flex items-center justify-center bg-black/50 p-4" onClick={() => setDiagnoseModal(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center">
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
                <CheckCircle2 className="h-12 w-12 text-emerald-600 dark:text-emerald-400" />
              </span>
              <h3 className="mt-3 text-lg font-black text-stone-900 dark:text-stone-100">وضعیت داده</h3>
            </div>
            <div className="mt-4 rounded-xl bg-stone-50 p-4 text-[13px] leading-6 text-stone-700 dark:bg-slate-900 dark:text-stone-300">
              {rows.length ? <p><b>داده آماده است:</b> {rows.length} ردیف × {columns.length} ستون.</p> : <p><b>هنوز داده‌ای تولید نشده است.</b></p>}
            </div>
            <div className="mt-4 grid gap-2">
              <button type="button" className="inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-extrabold text-white shadow transition hover:bg-indigo-500" onClick={() => { setDiagnoseModal(false); generate(); markDone("diagnose"); setActiveStep(Math.min(stepIdx("diagnose") + 1, steps.length - 1)); }}>
                <Play className="h-4 w-4" />
                {rows.length ? "تولید مجدد داده" : "تولید داده"}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-200 pt-4 dark:border-stone-700">
              <button type="button" className="text-[13px] font-bold text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300" onClick={() => setDiagnoseModal(false)}>بستن</button>
              <button type="button" className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-extrabold text-white shadow transition hover:bg-emerald-500" onClick={() => { setDiagnoseModal(false); markDone("diagnose"); setActiveStep(Math.min(stepIdx("diagnose") + 1, steps.length - 1)); }}>
                برو مرحله بعدی
                <ChevronLeft className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* مودال پروژه جدید */}
      {projectModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setProjectModal(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">پروژه جدید</h3>
            <p className="mt-1 text-[12px] text-stone-500 dark:text-stone-400">نام پروژه را وارد کنید.</p>
            <input className={`${inputCls} mt-3`} value={newProjectName} placeholder={`پروژه ${projects.length + 1}`} onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createProject(); }} autoFocus />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnLight} onClick={() => setProjectModal(false)}>انصراف</button>
              <button type="button" className={btnPrimary} onClick={createProject}><FolderPlus className="h-4 w-4" />ایجاد پروژه</button>
            </div>
          </div>
        </div>
      )}

      {/* مودال بکاپ */}
      {backupModal && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setBackupModal(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">بکاپ پروژه‌ها</h3>
            <div className="mt-3 space-y-2">
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm font-bold text-stone-700 dark:border-stone-700 dark:bg-slate-900 dark:text-stone-300">
                <input type="radio" name="backupScope" checked={backupScope === "all"} onChange={() => setBackupScope("all")} className="h-4 w-4 accent-indigo-600" />
                بکاپ کامل (همه {projects.length} پروژه)
              </label>
              <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm font-bold text-stone-700 dark:border-stone-700 dark:bg-slate-900 dark:text-stone-300">
                <input type="radio" name="backupScope" checked={backupScope === "one"} onChange={() => setBackupScope("one")} className="h-4 w-4 accent-indigo-600" />
                فقط پروژه فعلی ({currentProject?.name ?? "—"})
              </label>
            </div>
            <input dir="ltr" className={`${inputCls} mt-3`} value={backupName} onChange={(e) => setBackupName(e.target.value)} autoFocus />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnLight} onClick={() => setBackupModal(false)}>انصراف</button>
              <button type="button" className={btnPrimary} onClick={doBackup}><Download className="h-4 w-4" />دانلود بکاپ</button>
            </div>
          </div>
        </div>
      )}

      {modal && <ResultModal ok={modal.ok} lines={modal.lines} onClose={() => setModal(null)} />}
    </div>
  );
}

function starP(p: number): string {
  if (!Number.isFinite(p)) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

function Badge({ ok, text }: { ok: boolean; text: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
      ok ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300"
    }`}>
      {ok ? "✓" : "✗"} {text}
    </span>
  );
}

function EditableCell({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setTxt(value == null ? "" : String(value));
  }
  return (
    <input
      dir="ltr"
      className="w-20 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[13px] tabular-nums outline-none transition hover:border-stone-200 focus:border-indigo-400 focus:bg-white dark:hover:border-stone-600 dark:focus:bg-slate-800"
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
