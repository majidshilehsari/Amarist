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
import { fmt, fmtP, mean, sampleStd, covarianceMatrix, shapiroWilkTest, leveneTest } from "@/lib/statistics";
import {
  ancova,
  boxMGeneral,
  completeCases,
  groupedByGroup,
  independentTTest,
  mauchlyPooled,
  mixedAnova,
  pairedTTest,
  rowsToGrouped,
  withinGroupBonferroni,
  type AncovaResult,
  type BoxMResult,
  type IndependentTResult,
  type MauchlyResult,
  type MixedAnovaResult,
  type PairedTResult,
  type WithinPair,
} from "@/lib/clinical-stats";
import {
  clinicalColumns,
  generateClinicalData,
  type ClinicalAnswerKey,
  type ClinicalDesign,
} from "@/lib/clinical-generator";
import {
  buildClinicalDocx,
  buildClinicalReportText,
  clinicalDataTSV,
  type ClinicalDescriptive,
  type ClinicalHomogeneity,
  type ClinicalNormality,
} from "@/lib/clinical-report";
import ToolHeader from "@/components/tool-header";
import ClinicalStepperShell from "@/components/clinical-stepper-shell";
import ResultModal from "@/components/result-modal";
import { type StepStatus } from "@/components/progress-stepper";

// ------------------------------------------------------------
// پیکربندی حالت‌ها
// ------------------------------------------------------------

export type ClinicalMode = "one" | "compare";

const MODE_CONFIG: Record<
  ClinicalMode,
  {
    title: string;
    subtitle: string;
    storageKey: string;
    defaultProjectName: string;
    groupDefaults: [string, string];
    allowFollowup: boolean;
  }
> = {
  one: {
    title: "اثربخشی یک درمان",
    subtitle: "گروه مداخله در برابر گروه کنترل (پیش/پس)",
    storageKey: "amarist-one-treatment-projects",
    defaultProjectName: "پروژه پیش‌فرض (اثربخشی یک درمان)",
    groupDefaults: ["کنترل", "مداخله"],
    allowFollowup: false,
  },
  compare: {
    title: "مقایسه اثربخشی دو درمان",
    subtitle: "دو گروه مستقل — با یا بدون مرحله پیگیری",
    storageKey: "amarist-compare-treatments-projects",
    defaultProjectName: "پروژه پیش‌فرض (مقایسه دو درمان)",
    groupDefaults: ["درمان الف", "درمان ب"],
    allowFollowup: true,
  },
};

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

// ------------------------------------------------------------
// پروژه‌ها
// ------------------------------------------------------------

type ClinicalProjectData = {
  source: "generate" | "real";
  groupLabels: [string, string];
  followup: boolean;
  scoreMin: string;
  scoreMax: string;
  nPerGroup: string;
  alpha: string;
  targetDMin: string;
  targetDMax: string;
  targetEta2Min: string;
  targetEta2Max: string;
  enforceNormality: boolean;
  enforceHomogeneity: boolean;
  enforceSphericity: boolean;
  columns: string[];
  rows: (number | null)[][];
  answerKey: ClinicalAnswerKey | null;
};

type ClinicalProject = {
  id: string;
  name: string;
  updatedAt: string;
  data: ClinicalProjectData;
};

function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

function defaultProjectData(mode: ClinicalMode, followup: boolean): ClinicalProjectData {
  return {
    source: "generate",
    groupLabels: [...MODE_CONFIG[mode].groupDefaults] as [string, string],
    followup,
    scoreMin: "0",
    scoreMax: "100",
    nPerGroup: "30",
    alpha: "0.05",
    targetDMin: "0.5",
    targetDMax: "0.8",
    targetEta2Min: "0.06",
    targetEta2Max: "0.14",
    enforceNormality: true,
    enforceHomogeneity: true,
    enforceSphericity: true,
    columns: [],
    rows: [],
    answerKey: null,
  };
}

// ------------------------------------------------------------
// تحلیل
// ------------------------------------------------------------

type ClinicalAnalysis = {
  valid: boolean;
  message?: string;
  dropped: number;
  nTotal: number;
  nPerGroup: [number, number];
  T: number;
  descriptives: ClinicalDescriptive[];
  normality: ClinicalNormality[];
  homogeneity: ClinicalHomogeneity[];
  independentT?: IndependentTResult;
  ancova?: AncovaResult;
  pairedT?: { group0: PairedTResult; group1: PairedTResult };
  mixedAnova?: MixedAnovaResult;
  mauchly?: MauchlyResult;
  boxM?: BoxMResult;
  bonferroni?: { groupLabel: string; pairs: WithinPair[] }[];
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

function computeAnalysis(
  rows: (number | null)[][],
  groupLabels: [string, string],
  followup: boolean,
  alpha: number
): ClinicalAnalysis {
  const base: ClinicalAnalysis = {
    valid: false,
    dropped: 0,
    nTotal: 0,
    nPerGroup: [0, 0],
    T: followup ? 3 : 2,
    descriptives: [],
    normality: [],
    homogeneity: [],
  };
  if (!rows.length) return { ...base, message: "داده‌ای وجود ندارد؛ ابتدا داده تولید یا وارد کنید." };

  const groupIds: number[] = [];
  const timeData: number[][] = [];
  for (const row of rows) {
    const g = row[0];
    if (g == null || !Number.isFinite(g)) return { ...base, message: "مقادیر ستون «گروه» باید عدد ۱ یا ۲ باشد." };
    const gi = g === 1 ? 0 : g === 2 ? 1 : -1;
    if (gi < 0) return { ...base, message: "مقادیر ستون «گروه» باید عدد ۱ یا ۲ باشد." };
    groupIds.push(gi);
    timeData.push(row.slice(1).map((v) => (v == null || !Number.isFinite(v) ? NaN : v)));
  }
  const T = timeData[0]?.length ?? 0;
  const expectedT = followup ? 3 : 2;
  if (T !== expectedT) {
    return { ...base, message: `این طرح به ${expectedT} زمان (${expectedT} ستون نمره) نیاز دارد؛ تعداد ستون‌های فعلی ${T} است.` };
  }

  const cc = completeCases(groupIds, timeData);
  if (cc.groupIds.length === 0) return { ...base, message: "هیچ ردیف کاملی (بدون داده گمشده) وجود ندارد." };
  const counts = [cc.groupIds.filter((g) => g === 0).length, cc.groupIds.filter((g) => g === 1).length];
  if (counts[0] < 3 || counts[1] < 3) {
    return { ...base, message: `هر گروه باید حداقل ۳ مورد کامل داشته باشد (گروه «${groupLabels[0]}»: ${counts[0]}، گروه «${groupLabels[1]}»: ${counts[1]}).` };
  }

  const grouped = groupedByGroup(cc.groupIds, cc.timeData);
  const timeLabels = followup ? ["پیش‌آزمون", "پس‌آزمون", "پیگیری"] : ["پیش‌آزمون", "پس‌آزمون"];

  const descriptives: ClinicalDescriptive[] = [];
  const normality: ClinicalNormality[] = [];
  const homogeneity: ClinicalHomogeneity[] = [];
  for (let g = 0; g < 2; g++) {
    for (let t = 0; t < T; t++) {
      const col = grouped[g].map((s) => s[t]);
      descriptives.push({
        label: `${groupLabels[g]} — ${timeLabels[t]}`,
        n: col.length,
        mean: mean(col),
        sd: sampleStd(col),
        min: Math.min(...col),
        max: Math.max(...col),
      });
      const sw = shapiroFor(col);
      normality.push({ label: `${groupLabels[g]} — ${timeLabels[t]}`, w: sw.w, p: sw.p, pass: sw.p >= alpha });
    }
  }
  for (let t = 0; t < T; t++) {
    const lev = leveneFor([grouped[0].map((s) => s[t]), grouped[1].map((s) => s[t])]);
    homogeneity.push({ label: timeLabels[t], f: lev.f, p: lev.p, pass: lev.p >= alpha });
  }

  let out: ClinicalAnalysis = {
    valid: true,
    dropped: cc.dropped,
    nTotal: cc.groupIds.length,
    nPerGroup: counts as [number, number],
    T,
    descriptives,
    normality,
    homogeneity,
  };

  if (!followup) {
    const pre = grouped.flatMap((g) => g.map((s) => s[0]));
    const post = grouped.flatMap((g) => g.map((s) => s[1]));
    const group = [0, 1].flatMap((g) => grouped[g].map(() => g));
    const change0 = grouped[0].map((s) => s[1] - s[0]);
    const change1 = grouped[1].map((s) => s[1] - s[0]);
    out.independentT = independentTTest(change0, change1);
    out.ancova = ancova(group, pre, post);
    out.pairedT = {
      group0: pairedTTest(grouped[0].map((s) => s[0]), grouped[0].map((s) => s[1])),
      group1: pairedTTest(grouped[1].map((s) => s[0]), grouped[1].map((s) => s[1])),
    };
  } else {
    out.mixedAnova = mixedAnova(grouped);
    out.mauchly = mauchlyPooled(grouped);
    const covs = grouped.map((g) => covarianceMatrix(g));
    const ns = grouped.map((g) => g.length);
    out.boxM = boxMGeneral(covs, ns);
    out.bonferroni = [0, 1].map((g) => ({ groupLabel: groupLabels[g], pairs: withinGroupBonferroni(grouped[g]) }));
  }

  return out;
}

function shapiroFor(col: number[]): { w: number; p: number } {
  const sw = shapiroWilkTest(col);
  return { w: sw.w, p: sw.p };
}

function leveneFor(groups: number[][]): { f: number; p: number } {
  const lev = leveneTest(groups);
  return { f: lev.f, p: lev.p };
}

function dInterpretation(d: number): string {
  const a = Math.abs(d);
  if (a < 0.2) return "ناچیز";
  if (a < 0.5) return "کوچک";
  if (a < 0.8) return "متوسط";
  return "بزرگ";
}

function etaInterpretation(eta: number): string {
  if (eta < 0.01) return "ناچیز";
  if (eta < 0.06) return "کوچک";
  if (eta < 0.14) return "متوسط";
  return "بزرگ";
}

function starP(p: number): string {
  if (!Number.isFinite(p)) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

// ------------------------------------------------------------
// کامپوننت اصلی
// ------------------------------------------------------------

export default function ClinicalTool({ mode }: { mode: ClinicalMode }) {
  const cfg = MODE_CONFIG[mode];

  // ---------- پروژه‌ها ----------
  const [projects, setProjects] = useState<ClinicalProject[]>(() => {
    try {
      const raw = localStorage.getItem(cfg.storageKey);
      if (raw) {
        const arr = JSON.parse(raw) as ClinicalProject[];
        if (Array.isArray(arr) && arr.length) return arr.filter((p) => p && p.data);
      }
    } catch {
      // ignore
    }
    const p: ClinicalProject = {
      id: uid(),
      name: cfg.defaultProjectName,
      updatedAt: new Date().toISOString(),
      data: defaultProjectData(mode, mode === "compare"),
    };
    return [p];
  });
  const [projectId, setProjectId] = useState<string | null>(null);
  const currentProject = projects.find((p) => p.id === projectId) ?? null;

  // ---------- state ----------
  const [source, setSource] = useState<"generate" | "real">("generate");
  const [groupLabels, setGroupLabels] = useState<[string, string]>([...cfg.groupDefaults]);
  const [followup, setFollowup] = useState(mode === "compare");
  const [scoreMin, setScoreMin] = useState("0");
  const [scoreMax, setScoreMax] = useState("100");
  const [nPerGroup, setNPerGroup] = useState("30");
  const [alpha, setAlpha] = useState("0.05");
  const [targetDMin, setTargetDMin] = useState("0.5");
  const [targetDMax, setTargetDMax] = useState("0.8");
  const [targetEta2Min, setTargetEta2Min] = useState("0.06");
  const [targetEta2Max, setTargetEta2Max] = useState("0.14");
  const [enforceNormality, setEnforceNormality] = useState(true);
  const [enforceHomogeneity, setEnforceHomogeneity] = useState(true);
  const [enforceSphericity, setEnforceSphericity] = useState(true);
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(number | null)[][]>([]);
  const [answerKey, setAnswerKey] = useState<ClinicalAnswerKey | null>(null);

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
  const timeLabels = followup ? ["پیش‌آزمون", "پس‌آزمون", "پیگیری"] : ["پیش‌آزمون", "پس‌آزمون"];

  // ---------- مراحل ----------
  const steps = useMemo(() => {
    const list: { id: string; label: string; short?: string }[] = [
      { id: "project", label: "پروژه", short: "پروژه" },
      { id: "source", label: "منبع داده", short: "منبع" },
      { id: "spec", label: "مشخصات طرح", short: "مشخصات" },
    ];
    if (source === "generate") {
      list.push({ id: "constraints", label: "قیود تولید داده", short: "قیود" });
      list.push({ id: "diagnose", label: "تشخیص", short: "تشخیص" });
    }
    list.push(
      { id: "data", label: "جدول داده‌ها", short: "داده" },
      { id: "analysis", label: "تحلیل", short: "تحلیل" },
      { id: "assumptions", label: "پیش‌فرض‌ها", short: "پیش‌فرض" },
      { id: "findings", label: "یافته‌ها", short: "یافته‌ها" },
      { id: "report", label: "نگارش گزارش", short: "گزارش" },
      { id: "save", label: "ذخیره", short: "ذخیره" }
    );
    return list;
  }, [source]);

  const stepIdx = (id: string) => steps.findIndex((s) => s.id === id);
  const currentStep = Math.min(activeStep, steps.length - 1);
  const analysisSteps = new Set(["assumptions", "findings", "report"]);

  const analysis = useMemo(
    () => computeAnalysis(rows, groupLabels, followup, safeAlpha),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, groupLabels, followup, safeAlpha]
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

  // تغییر ورودی‌ها → تحلیل باطل می‌شود
  const inputsKey = JSON.stringify({ source, followup, rows, columns, scoreMin, scoreMax, alpha, groupLabels });
  const prevInputsRef = useRef(inputsKey);
  useEffect(() => {
    if (prevInputsRef.current !== inputsKey) {
      prevInputsRef.current = inputsKey;
      setAnalysisRun(false);
    }
  }, [inputsKey]);

  // بارگذاری اولین پروژه
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

  // ذخیره خودکار
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
                  groupLabels,
                  followup,
                  scoreMin,
                  scoreMax,
                  nPerGroup,
                  alpha,
                  targetDMin,
                  targetDMax,
                  targetEta2Min,
                  targetEta2Max,
                  enforceNormality,
                  enforceHomogeneity,
                  enforceSphericity,
                  columns,
                  rows,
                  answerKey,
                },
              }
            : p
        );
        try {
          localStorage.setItem(cfg.storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    }, 150);
    return () => clearTimeout(t);
  }, [
    projectId,
    cfg.storageKey,
    source,
    groupLabels,
    followup,
    scoreMin,
    scoreMax,
    nPerGroup,
    alpha,
    targetDMin,
    targetDMax,
    targetEta2Min,
    targetEta2Max,
    enforceNormality,
    enforceHomogeneity,
    enforceSphericity,
    columns,
    rows,
    answerKey,
  ]);

  function applyProjectData(data: ClinicalProjectData) {
    setSource(data.source);
    setGroupLabels(data.groupLabels ?? [...cfg.groupDefaults]);
    setFollowup(mode === "compare" ? !!data.followup : false);
    setScoreMin(data.scoreMin);
    setScoreMax(data.scoreMax);
    setNPerGroup(data.nPerGroup);
    setAlpha(data.alpha);
    setTargetDMin(data.targetDMin);
    setTargetDMax(data.targetDMax);
    setTargetEta2Min(data.targetEta2Min);
    setTargetEta2Max(data.targetEta2Max);
    setEnforceNormality(data.enforceNormality);
    setEnforceHomogeneity(data.enforceHomogeneity);
    setEnforceSphericity(data.enforceSphericity);
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
    const p: ClinicalProject = { id: uid(), name, updatedAt: new Date().toISOString(), data: defaultProjectData(mode, mode === "compare") };
    setProjects((prev) => {
      const next = [...prev, p];
      try {
        localStorage.setItem(cfg.storageKey, JSON.stringify(next));
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
      localStorage.setItem(cfg.storageKey, JSON.stringify(remaining));
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

  // ---------- قیود و تولید ----------
  function buildConstraints() {
    const smin = Math.round(Number(scoreMin));
    const smax = Math.round(Number(scoreMax));
    const nn = Math.round(Number(nPerGroup));
    const dMin = Number(targetDMin);
    const dMax = Number(targetDMax);
    const eMin = Number(targetEta2Min);
    const eMax = Number(targetEta2Max);
    if (!Number.isFinite(smin) || !Number.isFinite(smax) || smin >= smax) throw new Error("بازهٔ نمره باید معتبر باشد (حداقل کوچک‌تر از حداکثر).");
    if (!Number.isFinite(nn) || nn < 5) throw new Error("حجم نمونهٔ هر گروه باید حداقل ۵ باشد.");
    if (!followup) {
      if (!Number.isFinite(dMin) || !Number.isFinite(dMax) || dMin < 0 || dMax > 2.5 || dMin > dMax) throw new Error("بازهٔ d کوهن باید بین 0 و 2.5 باشد و حداقل از حداکثر بزرگ‌تر نباشد.");
    } else {
      if (!Number.isFinite(eMin) || !Number.isFinite(eMax) || eMin < 0 || eMax > 1 || eMin > eMax) throw new Error("بازهٔ مجذور اتای تعامل باید بین 0 و 1 باشد.");
    }
    const design: ClinicalDesign = followup ? "followup" : "control";
    return {
      design,
      nPerGroup: nn,
      alpha: safeAlpha,
      scoreMin: smin,
      scoreMax: smax,
      targetD: followup ? null : { min: dMin, max: dMax },
      targetInteractionEta2: followup ? { min: eMin, max: eMax } : null,
      enforceNormality,
      enforceHomogeneity,
      enforceSphericity: followup && enforceSphericity,
    };
  }

  const generate = useCallback(() => {
    try {
      const constraints = buildConstraints();
      const result = generateClinicalData(constraints, 20000);
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
  }, [scoreMin, scoreMax, nPerGroup, alpha, targetDMin, targetDMax, targetEta2Min, targetEta2Max, followup, enforceNormality, enforceHomogeneity, enforceSphericity]);

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

  // ---------- ایمپورت ----------
  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("فایل اکسل خالی است.");
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
      if (!aoa.length) throw new Error("فایل اکسل خالی است.");
      const expectedCols = followup ? 4 : 3;
      const first = aoa[0] ?? [];
      const hasHeader = first.some((v) => typeof v === "string" && v.trim() !== "" && parseLocalizedNumber(v) == null);
      const dataRows = hasHeader ? aoa.slice(1) : aoa;
      const parsed = dataRows.map((r) => Array.from({ length: expectedCols }, (_, j) => parseLocalizedNumber((r as unknown[])[j])));
      const groupVals = parsed.map((r) => r[0]);
      let shifted = false;
      let groups = groupVals.map((v) => (v == null ? null : Math.round(v)));
      if (groups.some((v) => v != null && (v < 0 || v > 2))) throw new Error("مقادیر ستون «گروه» باید ۱ و ۲ (یا ۰ و ۱) باشند.");
      if (groups.every((v) => v == null || (v >= 0 && v <= 1))) {
        shifted = true;
        groups = groups.map((v) => (v == null ? null : v + 1));
      }
      const outRows: (number | null)[][] = parsed.map((r, i) => [groups[i], ...r.slice(1)]);
      setSource("real");
      setColumns(clinicalColumns(followup ? "followup" : "control"));
      setRows(outRows);
      setAnswerKey(null);
      setAnalysisRun(false);
      setStatus({ text: `داده واقعی وارد شد: ${outRows.length} ردیف × ${expectedCols} ستون. «اجرای تحلیل» را بزنید.`, kind: "ok" });
      void shifted;
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
      setModal({ ok: false, lines: [(err as Error).message] });
    }
  };

  const downloadTemplate = () => {
    try {
      const headers = clinicalColumns(followup ? "followup" : "control");
      const sample: (string | number | null)[][] = [
        headers,
        [1, 45, 50, followup ? 52 : null].slice(0, headers.length),
        [1, 48, 52, followup ? 53 : null].slice(0, headers.length),
        [2, 44, 58, followup ? 61 : null].slice(0, headers.length),
        [2, 47, 60, followup ? 63 : null].slice(0, headers.length),
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(sample), "قالب داده");
      XLSX.writeFile(wb, "amarist-clinical-template.xlsx");
      setStatus({ text: "قالب داده دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  // ---------- خروجی‌ها ----------
  const reportInput = useMemo(() => {
    return {
      design: followup ? "followup" : "control",
      projectName: currentProject?.name ?? "پروژه",
      source,
      groupLabels,
      timeLabels,
      nTotal: analysis.nTotal,
      nPerGroup: analysis.nPerGroup,
      alpha: safeAlpha,
      independentT: analysis.independentT,
      ancova: analysis.ancova,
      pairedT: analysis.pairedT,
      mixedAnova: analysis.mixedAnova,
      mauchly: analysis.mauchly,
      boxM: analysis.boxM,
      bonferroni: analysis.bonferroni,
      descriptives: analysis.descriptives,
      normality: analysis.normality,
      homogeneity: analysis.homogeneity,
      answerKey: answerKey ?? undefined,
    } as const;
  }, [followup, currentProject, source, groupLabels, timeLabels, analysis, safeAlpha, answerKey]);

  const reportText = useMemo(() => buildClinicalReportText(reportInput), [reportInput]);

  const exportExcel = () => {
    try {
      if (!rows.length) throw new Error("داده‌ای برای خروجی وجود ندارد.");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => r.map((v) => (v == null ? "" : v)))]), "داده");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(reportText.split("\n").map((l) => [l])), "گزارش");
      XLSX.writeFile(wb, "amarist-clinical.xlsx");
      setStatus({ text: "فایل اکسل دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const exportDocx = async () => {
    try {
      const blob = await Packer.toBlob(buildClinicalDocx(reportInput));
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-clinical-report.docx";
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
      a.download = "amarist-clinical-report.txt";
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
      const text = clinicalDataTSV(columns, rows);
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
      setStatus({ text: "جدول داده کپی شد؛ می‌توانید مستقیم در Excel پیست کنید.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  // ---------- بکاپ ----------
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
        const restored = data.projects.filter((p: ClinicalProject) => p && p.data);
        if (!restored.length) throw new Error("بکاپ معتبر نیست.");
        setProjects(restored);
        localStorage.setItem(cfg.storageKey, JSON.stringify(restored));
        setProjectId(restored[0].id);
        applyProjectData(restored[0].data);
        setActiveStep(0);
        setStatus({ text: `${restored.length} پروژه بازیابی شد.`, kind: "ok" });
      } else if (data?.type === "project" && data.project) {
        const p = data.project as ClinicalProject;
        setProjects((prev) => {
          const idx = prev.findIndex((x) => x.id === p.id);
          const next = idx >= 0 ? prev.map((x, i) => (i === idx ? p : x)) : [...prev, p];
          localStorage.setItem(cfg.storageKey, JSON.stringify(next));
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

  // ---------- خلاصه تشخیص ----------
  const genSummary = useMemo(() => {
    const lines: string[] = [];
    lines.push(`طرح: ${followup ? "دو گروه × پیش/پس/پیگیری" : "گروه مداخله در برابر کنترل (پیش/پس)"}`);
    lines.push(`گروه‌ها: «${groupLabels[0]}» در برابر «${groupLabels[1]}»`);
    lines.push(`حجم نمونهٔ هر گروه: ${nPerGroup}`);
    lines.push(`مقیاس نمره: ${scoreMin} تا ${scoreMax} | α = ${alpha}`);
    if (!followup) lines.push(`هدف: d کوهن بین ${targetDMin} تا ${targetDMax} (تفاوت بین‌گروهی در تغییر)`);
    else lines.push(`هدف: مجذور اتای تعامل زمان*گروه بین ${targetEta2Min} تا ${targetEta2Max}`);
    return lines;
  }, [followup, groupLabels, nPerGroup, scoreMin, scoreMax, alpha, targetDMin, targetDMax, targetEta2Min, targetEta2Max]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-24 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <ToolHeader title={cfg.title} subtitle={cfg.subtitle} />

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
        {/* ============ مرحله ۰: پروژه ============ */}
        {currentStep === stepIdx("project") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[0]}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">پروژه‌ها</h2>
            </div>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              همه داده‌ها در مرورگر شما ذخیره می‌شوند. یک پروژه انتخاب کنید یا پروژه جدید بسازید؛ با «بکاپ» می‌توانید
              پروژه‌ها را ذخیره یا منتقل کنید.
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
                    {p.data.rows.length} ردیف داده · {p.data.followup ? "با پیگیری" : "پیش/پس"} · به‌روزرسانی: {new Date(p.updatedAt).toLocaleDateString("fa-IR")}
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

        {/* ============ مرحله ۱: منبع داده ============ */}
        {currentStep === stepIdx("source") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[1]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">منبع داده</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              انتخاب کنید داده‌های واقعی پژوهش خود را وارد می‌کنید یا داده تمرینی برای شما تولید شود.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setSource("generate")}
                className={`rounded-2xl border-2 p-4 text-start transition ${
                  source === "generate" ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40" : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"
                }`}
              >
                <p className="font-extrabold text-stone-900 dark:text-stone-100">تولید داده تمرینی</p>
                <p className="mt-1 text-[12px] leading-6 text-stone-500 dark:text-stone-400">
                  با رعایت قیود انتخابی شما (معنی‌داری، اندازه اثر و پیش‌فرض‌ها) داده شبیه‌سازی‌شده ساخته می‌شود.
                </p>
              </button>
              <button
                type="button"
                onClick={() => setSource("real")}
                className={`rounded-2xl border-2 p-4 text-start transition ${
                  source === "real" ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40" : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"
                }`}
              >
                <p className="font-extrabold text-stone-900 dark:text-stone-100">داده واقعی خودم</p>
                <p className="mt-1 text-[12px] leading-6 text-stone-500 dark:text-stone-400">
                  فایل اکسل را در مرحله «جدول داده‌ها» وارد کنید؛ ستون اول گروه (۱ یا ۲) و بقیه نمره‌های زمانی است.
                </p>
              </button>
            </div>
          </section>
        )}

        {/* ============ مرحله ۲: مشخصات طرح ============ */}
        {currentStep === stepIdx("spec") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[2]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">مشخصات طرح</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              نام گروه‌ها، ساختار زمانی و مقیاس نمره را مشخص کنید.
            </p>

            {cfg.allowFollowup && (
              <div className="mt-4 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <div className="flex flex-wrap items-center gap-6">
                  <span className="text-sm font-extrabold text-stone-800 dark:text-stone-200">مرحله پیگیری داریم؟</span>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                    <input type="radio" name="followup" checked={followup} onChange={() => setFollowup(true)} className="h-4 w-4 accent-indigo-600" />
                    بله — پیش / پس / پیگیری
                  </label>
                  <label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-stone-700 dark:text-stone-300">
                    <input type="radio" name="followup" checked={!followup} onChange={() => setFollowup(false)} className="h-4 w-4 accent-indigo-600" />
                    خیر — فقط پیش / پس
                  </label>
                </div>
                <p className={tinyCls}>
                  با پیگیری، تحلیل با «تحلیل واریانس اندازه‌گیری مکرر (میکس‌آنوا)» انجام می‌شود؛ بدون پیگیری، با «t مستقل روی نمرهٔ تغییر + ANCOVA».
                </p>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>نام گروه ۱ (ستون گروه = ۱)</label>
                <input className={inputCls} value={groupLabels[0]} onChange={(e) => setGroupLabels([e.target.value, groupLabels[1]])} />
              </div>
              <div>
                <label className={labelCls}>نام گروه ۲ (ستون گروه = ۲)</label>
                <input className={inputCls} value={groupLabels[1]} onChange={(e) => setGroupLabels([groupLabels[0], e.target.value])} />
              </div>
              <div>
                <label className={labelCls}>حداقل نمره مقیاس</label>
                <input type="number" dir="ltr" className={inputCls} value={scoreMin} onChange={(e) => setScoreMin(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداکثر نمره مقیاس</label>
                <input type="number" dir="ltr" className={inputCls} value={scoreMax} onChange={(e) => setScoreMax(e.target.value)} />
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
              <p className="text-[12px] font-bold text-stone-600 dark:text-stone-300">ساختار زمانی:</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {timeLabels.map((t, i) => (
                  <span key={t} className="rounded-full bg-indigo-50 px-3 py-1 text-[12px] font-bold text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                    {i + 1}. {t}
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ============ مرحله ۳: قیود تولید ============ */}
        {currentStep === stepIdx("constraints") && source === "generate" && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[3]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">قیود تولید داده</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              مشخص کنید داده تولیدی چه شرایطی را حتماً رعایت کند؛ تولید فقط خروجی‌ای را می‌پذیرد که این شرایط برقرار باشد.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>حجم نمونهٔ هر گروه</label>
                <input type="number" dir="ltr" className={inputCls} value={nPerGroup} onChange={(e) => setNPerGroup(e.target.value)} />
                <p className={tinyCls}>پیش‌فرض: 30</p>
              </div>
              <div>
                <label className={labelCls}>سطح معنی‌داری α</label>
                <input type="number" step={0.001} dir="ltr" className={inputCls} value={alpha} onChange={(e) => setAlpha(e.target.value)} />
                <p className={tinyCls}>پیش‌فرض: 0.05</p>
              </div>
              {!followup ? (
                <>
                  <div>
                    <label className={labelCls}>حداقل d کوهن (هدف)</label>
                    <input type="number" step={0.05} dir="ltr" className={inputCls} value={targetDMin} onChange={(e) => setTargetDMin(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>حداکثر d کوهن (هدف)</label>
                    <input type="number" step={0.05} dir="ltr" className={inputCls} value={targetDMax} onChange={(e) => setTargetDMax(e.target.value)} />
                    <p className={tinyCls}>d بین 0.5 تا 0.8 یعنی اثر متوسط تا بزرگ.</p>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className={labelCls}>حداقل η² تعامل (هدف)</label>
                    <input type="number" step={0.01} dir="ltr" className={inputCls} value={targetEta2Min} onChange={(e) => setTargetEta2Min(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>حداکثر η² تعامل (هدف)</label>
                    <input type="number" step={0.01} dir="ltr" className={inputCls} value={targetEta2Max} onChange={(e) => setTargetEta2Max(e.target.value)} />
                    <p className={tinyCls}>η² جزئی بین 0.06 تا 0.14 یعنی اثر متوسط.</p>
                  </div>
                </>
              )}
            </div>

            <h3 className="mt-5 font-extrabold text-stone-800 dark:text-stone-200">پیش‌فرض‌های آماری (همگی قابل تنظیم)</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <input type="checkbox" checked={enforceNormality} onChange={(e) => setEnforceNormality(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">نرمال بودن توزیع داده‌ها</span>
                  <span className={tinyCls}>آزمون شاپیرو-ویلک برای همه سلول‌های «گروه × زمان» (p ≥ α).</span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                <input type="checkbox" checked={enforceHomogeneity} onChange={(e) => setEnforceHomogeneity(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
                <span>
                  <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">همگنی واریانس‌ها</span>
                  <span className={tinyCls}>آزمون لوین در هر زمان بین دو گروه (p ≥ α).</span>
                </span>
              </label>
              {followup && (
                <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-white p-3 dark:border-stone-700 dark:bg-slate-800">
                  <input type="checkbox" checked={enforceSphericity} onChange={(e) => setEnforceSphericity(e.target.checked)} className="mt-1 h-4 w-4 accent-indigo-600" />
                  <span>
                    <span className="block text-sm font-extrabold text-stone-800 dark:text-stone-200">کرویت</span>
                    <span className={tinyCls}>آزمون موچلی برای عامل زمان (p ≥ α).</span>
                  </span>
                </label>
              )}
            </div>
          </section>
        )}

        {/* ============ مرحله ۴: تشخیص ============ */}
        {currentStep === stepIdx("diagnose") && source === "generate" && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[6]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">تشخیص</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              خلاصه وضعیت طرح را مرور کنید؛ تولید داده از اینجا انجام می‌شود.
            </p>

            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
              {genSummary.map((l, i) => (
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
                <p>
                  <b>وضعیت داده:</b> {rows.length} ردیف × {columns.length} ستون (تولیدشده)
                </p>
                <p>
                  <b>وضعیت تحلیل:</b> {analysisReady ? "اجرا شده" : "اجرا نشده"}
                </p>
              </div>
            )}
          </section>
        )}

        {/* ============ مرحله ۵: جدول داده‌ها ============ */}
        {currentStep === stepIdx("data") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[4]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">جدول داده‌ها</h2>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                  {source === "generate"
                    ? "داده‌ها در مرحله «تشخیص» تولید می‌شوند؛ اینجا می‌توانید داده موجود را ویرایش یا اکسپورت کنید."
                    : "فایل اکسل داده‌های واقعی را وارد کنید (ستون اول گروه ۱/۲، بقیه نمره‌های زمانی) یا از قالب استفاده کنید."}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImport(f);
                  e.target.value = "";
                }} />
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
                <button type="button" className={btnLight} onClick={copyData}>
                  <Copy className="h-4 w-4" />
                  کپی داده
                </button>
              </div>
            </div>

            {rows.length > 0 ? (
              <div className="tool-table-wrap tool-table-scroll mt-4">
                <table className="tool-table" style={{ minWidth: Math.max(360, columns.length * 130) }}>
                  <thead>
                    <tr>
                      <th>ردیف</th>
                      {columns.map((c, i) => (
                        <th key={i}>{c}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 200).map((r, i) => (
                      <tr key={i}>
                        <td className="row-index">{i + 1}</td>
                        {r.map((v, j) => (
                          <td key={j}>
                            <EditableCell value={v} onCommit={(nv) => updateCell(i, j, nv)} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rows.length > 200 && (
                  <p className={`${tinyCls} mt-2 text-center`}>نمایش ۲۰۰ ردیف اول ({rows.length} ردیف کل).</p>
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                هنوز داده‌ای وجود ندارد؛ در مرحله «تشخیص» داده تولید کنید یا فایل اکسل وارد کنید.
              </div>
            )}
          </section>
        )}

        {/* ============ مرحله ۶: تحلیل ============ */}
        {currentStep === stepIdx("analysis") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[5]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">تحلیل</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              داده آماده است؛ با «اجرای تحلیل» مدل روی داده فعلی برآورد می‌شود و مراحل بعدی فعال می‌شوند.
            </p>

            {source === "real" && (
              <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-[12px] font-bold leading-6 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300">
                حالت داده واقعی فعال است: هیچ قیدی به نتایج تحمیل نمی‌شود؛ محاسبات فقط از مقادیر فایل واردشده انجام می‌شوند.
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 text-[13px] leading-6 text-stone-700 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300">
              {rows.length ? (
                <>
                  <p>
                    <b>وضعیت داده:</b> {rows.length} ردیف × {columns.length} ستون
                  </p>
                  <p>
                    <b>وضعیت تحلیل:</b> {analysisReady ? "اجرا شده" : "اجرا نشده"}
                  </p>
                  {analysis.valid && (
                    <p>
                      <b>موارد کامل:</b> {analysis.nTotal} (گروه «{groupLabels[0]}»: {analysis.nPerGroup[0]}، گروه «{groupLabels[1]}»: {analysis.nPerGroup[1]})
                      {analysis.dropped > 0 ? ` — ${analysis.dropped} ردیف ناقص حذف شد.` : ""}
                    </p>
                  )}
                  {!analysis.valid && analysis.message && (
                    <p className="mt-1 rounded-lg bg-amber-50 p-2 font-bold text-amber-700 dark:bg-amber-950 dark:text-amber-300">
                      {analysis.message}
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

        {/* ============ مرحله ۷: پیش‌فرض‌ها ============ */}
        {currentStep === stepIdx("assumptions") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[7]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">بررسی پیش‌فرض‌ها</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">پیش‌فرض‌های آماری روی داده فعلی محاسبه می‌شوند.</p>
            {!analysisReady ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                {rows.length ? "ابتدا از مرحله «تحلیل»، تحلیل را اجرا کنید." : "ابتدا داده تولید یا وارد کنید."}
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۱) نرمال بودن توزیع داده‌ها (شاپیرو-ویلک)</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>متغیر</th><th>W</th><th>p</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {analysis.normality.map((n, i) => (
                          <tr key={i}>
                            <td>{n.label}</td>
                            <td className="number-cell">{fmt(n.w, 3)}</td>
                            <td className="number-cell">{fmtP(n.p)}</td>
                            <td><Badge ok={n.pass} text={n.pass ? "برقرار" : "برقرار نیست"} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۲) همگنی واریانس‌ها (لوین)</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>زمان</th><th>F</th><th>p</th><th>نتیجه</th></tr>
                      </thead>
                      <tbody>
                        {analysis.homogeneity.map((h, i) => (
                          <tr key={i}>
                            <td>{h.label}</td>
                            <td className="number-cell">{fmt(h.f, 3)}</td>
                            <td className="number-cell">{fmtP(h.p)}</td>
                            <td><Badge ok={h.pass} text={h.pass ? "برقرار" : "برقرار نیست"} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {followup && analysis.mauchly && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۳) کرویت (موچلی)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>W</th><th>χ²</th><th>df</th><th>p</th><th>نتیجه</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="number-cell">{fmt(analysis.mauchly.w, 3)}</td>
                            <td className="number-cell">{fmt(analysis.mauchly.chi, 3)}</td>
                            <td className="number-cell">{analysis.mauchly.df}</td>
                            <td className="number-cell">{fmtP(analysis.mauchly.p)}</td>
                            <td><Badge ok={analysis.mauchly.p >= safeAlpha} text={analysis.mauchly.p >= safeAlpha ? "برقرار" : "برقرار نیست"} /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {followup && analysis.boxM && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۴) همگنی ماتریس‌های کوواریانس (Box&apos;s M)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>M</th><th>χ²</th><th>df</th><th>p</th><th>نتیجه</th></tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="number-cell">{fmt(analysis.boxM.m, 3)}</td>
                            <td className="number-cell">{fmt(analysis.boxM.chi, 3)}</td>
                            <td className="number-cell">{analysis.boxM.df}</td>
                            <td className="number-cell">{fmtP(analysis.boxM.p)}</td>
                            <td><Badge ok={analysis.boxM.p >= safeAlpha} text={analysis.boxM.p >= safeAlpha ? "برقرار" : "برقرار نیست"} /></td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        )}

        {/* ============ مرحله ۸: یافته‌ها ============ */}
        {currentStep === stepIdx("findings") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[0]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">یافته‌ها</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">آمار توصیفی و نتایج تحلیل‌ها.</p>
            {!analysisReady ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
                ابتدا تحلیل را اجرا کنید.
              </div>
            ) : (
              <div className="mt-4 space-y-6">
                <div>
                  <h3 className="font-extrabold text-stone-800 dark:text-stone-200">آمار توصیفی</h3>
                  <div className="tool-table-wrap mt-2">
                    <table className="tool-table">
                      <thead>
                        <tr><th>گروه / زمان</th><th>n</th><th>میانگین</th><th>انحراف معیار</th><th>کمینه</th><th>بیشینه</th></tr>
                      </thead>
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
                </div>

                {!followup && analysis.independentT && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۱) آزمون t مستقل روی نمرهٔ تغییر (پس − پیش)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>شاخص</th><th>مقدار</th></tr>
                        </thead>
                        <tbody>
                          <tr><td>تغییر گروه «{groupLabels[0]}»</td><td className="number-cell">{fmt(analysis.independentT.mean1)}</td></tr>
                          <tr><td>تغییر گروه «{groupLabels[1]}»</td><td className="number-cell">{fmt(analysis.independentT.mean2)}</td></tr>
                          <tr><td>t (df={analysis.independentT.df})</td><td className="number-cell">{fmt(analysis.independentT.t)}</td></tr>
                          <tr><td>p</td><td className="number-cell">{fmtP(analysis.independentT.p)}{starP(analysis.independentT.p)}</td></tr>
                          <tr><td>d کوهن</td><td className="number-cell">{fmt(analysis.independentT.cohensD)} ({dInterpretation(analysis.independentT.cohensD)})</td></tr>
                          <tr><td>CI ۹۵٪ تفاوت میانگین‌ها</td><td className="number-cell">{fmt(analysis.independentT.ciLo)} تا {fmt(analysis.independentT.ciHi)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <p className={`${tinyCls} mt-1`}>* p &lt; 0.05 ، ** p &lt; 0.01 ، *** p &lt; 0.001</p>
                  </div>
                )}

                {!followup && analysis.ancova && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۲) تحلیل کوواریانس (ANCOVA — کنترل اثر پیش‌آزمون)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>شاخص</th><th>مقدار</th></tr>
                        </thead>
                        <tbody>
                          <tr><td>F (1، {analysis.ancova.df2})</td><td className="number-cell">{fmt(analysis.ancova.F)}</td></tr>
                          <tr><td>p</td><td className="number-cell">{fmtP(analysis.ancova.p)}{starP(analysis.ancova.p)}</td></tr>
                          <tr><td>مجذور اتای جزئی</td><td className="number-cell">{fmt(analysis.ancova.eta2)} ({etaInterpretation(analysis.ancova.eta2)})</td></tr>
                          <tr><td>میانگین تعدیل‌شده «{groupLabels[0]}»</td><td className="number-cell">{fmt(analysis.ancova.adjMeans[0])}</td></tr>
                          <tr><td>میانگین تعدیل‌شده «{groupLabels[1]}»</td><td className="number-cell">{fmt(analysis.ancova.adjMeans[1])}</td></tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {!followup && analysis.pairedT && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">۳) تغییر درون‌گروهی (t زوجی)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>گروه</th><th>t</th><th>p</th><th>d (dz)</th><th>نتیجه</th></tr>
                        </thead>
                        <tbody>
                          {([0, 1] as const).map((g) => {
                            const pt = g === 0 ? analysis.pairedT!.group0 : analysis.pairedT!.group1;
                            return (
                              <tr key={g}>
                                <td style={{ fontWeight: 800 }}>{groupLabels[g]}</td>
                                <td className="number-cell">{fmt(pt.t)}</td>
                                <td className="number-cell">{fmtP(pt.p)}{starP(pt.p)}</td>
                                <td className="number-cell">{fmt(pt.cohensDz)}</td>
                                <td><Badge ok={pt.p < safeAlpha} text={pt.p < safeAlpha ? "معنی‌دار" : "غیرمعنی‌دار"} /></td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {followup && analysis.mixedAnova && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">تحلیل واریانس اندازه‌گیری مکرر (میکس‌آنوا)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table" style={{ minWidth: 720 }}>
                        <thead>
                          <tr><th>منبع تغییر</th><th>SS</th><th>df</th><th>MS</th><th>F</th><th>p</th><th>η² جزئی</th></tr>
                        </thead>
                        <tbody>
                          {[
                            { label: "بین‌گروهی (گروه)", s: analysis.mixedAnova.group, err: analysis.mixedAnova.errorBetween },
                            { label: "زمان", s: analysis.mixedAnova.time, err: analysis.mixedAnova.errorTime },
                            { label: "تعامل زمان*گروه", s: analysis.mixedAnova.timeGroup, err: analysis.mixedAnova.errorTime },
                          ].map((r) => (
                            <tr key={r.label}>
                              <td style={{ fontWeight: 800 }}>{r.label}</td>
                              <td className="number-cell">{fmt(r.s.ss, 3)}</td>
                              <td className="number-cell">{r.s.df}</td>
                              <td className="number-cell">{fmt(r.s.ms, 3)}</td>
                              <td className="number-cell">{fmt(r.s.f)}</td>
                              <td className="number-cell">{fmtP(r.s.p)}{starP(r.s.p)}</td>
                              <td className="number-cell">{fmt(r.s.eta)} ({etaInterpretation(r.s.eta)})</td>
                            </tr>
                          ))}
                          <tr style={{ background: "#f8fafc" }}>
                            <td style={{ fontWeight: 800 }}>خطای بین‌آزمودنی</td>
                            <td className="number-cell">{fmt(analysis.mixedAnova.errorBetween.ss, 3)}</td>
                            <td className="number-cell">{analysis.mixedAnova.errorBetween.df}</td>
                            <td className="number-cell">{fmt(analysis.mixedAnova.errorBetween.ms, 3)}</td>
                            <td className="number-cell">—</td><td className="number-cell">—</td><td className="number-cell">—</td>
                          </tr>
                          <tr style={{ background: "#f8fafc" }}>
                            <td style={{ fontWeight: 800 }}>خطای درون‌آزمودنی (زمان)</td>
                            <td className="number-cell">{fmt(analysis.mixedAnova.errorTime.ss, 3)}</td>
                            <td className="number-cell">{analysis.mixedAnova.errorTime.df}</td>
                            <td className="number-cell">{fmt(analysis.mixedAnova.errorTime.ms, 3)}</td>
                            <td className="number-cell">—</td><td className="number-cell">—</td><td className="number-cell">—</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {followup && analysis.bonferroni && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">مقایسه‌های زوجی درون‌گروهی (بونفرونی)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>گروه</th><th>مقایسه</th><th>تفاوت میانگین</th><th>SD تفاوت</th><th>p (بونفرونی)</th><th>نتیجه</th></tr>
                        </thead>
                        <tbody>
                          {analysis.bonferroni.flatMap((g) =>
                            g.pairs.map((p, i) => (
                              <tr key={`${g.groupLabel}-${i}`}>
                                <td style={{ fontWeight: 800 }}>{g.groupLabel}</td>
                                <td>{timeLabels[p.i]} − {timeLabels[p.j]}</td>
                                <td className="number-cell">{fmt(p.meanDiff)}</td>
                                <td className="number-cell">{fmt(p.sdDiff)}</td>
                                <td className="number-cell">{fmtP(p.pBonf)}{starP(p.pBonf)}</td>
                                <td><Badge ok={p.pBonf < safeAlpha} text={p.pBonf < safeAlpha ? "معنی‌دار" : "غیرمعنی‌دار"} /></td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {answerKey && (
                  <div>
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">کلید پاسخ (مخصوص استاد)</h3>
                    <div className="tool-table-wrap mt-2">
                      <table className="tool-table">
                        <thead>
                          <tr><th>شاخص</th><th>هدف</th><th>واقعی</th></tr>
                        </thead>
                        <tbody>
                          {answerKey.targetD && (
                            <tr><td>d کوهن</td><td className="number-cell">{fmt(answerKey.targetD.target)}</td><td className="number-cell">{fmt(answerKey.targetD.actual)}</td></tr>
                          )}
                          {answerKey.targetInteractionEta2 && (
                            <tr><td>η² تعامل</td><td className="number-cell">{fmt(answerKey.targetInteractionEta2.target)}</td><td className="number-cell">{fmt(answerKey.targetInteractionEta2.actual)}</td></tr>
                          )}
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

        {/* ============ مرحله ۹: گزارش ============ */}
        {currentStep === stepIdx("report") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[1]}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">نگارش گزارش</h2>
                <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">گزارش کامل تحلیل به‌صورت متن آماده؛ می‌توانید کپی یا دانلود کنید.</p>
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
              <pre dir="rtl" className="max-h-[520px] overflow-auto whitespace-pre-wrap text-[12.5px] leading-7 text-stone-700 dark:text-stone-300">
                {reportText}
              </pre>
            </div>
          </section>
        )}

        {/* ============ مرحله ۱۰: ذخیره ============ */}
        {currentStep === stepIdx("save") && (
          <section className={`mt-4 rounded-2xl border p-5 shadow-sm sm:p-6 ${sectionTones[2]}`}>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">ذخیره</h2>
            <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
              پروژه به‌صورت خودکار در مرورگر ذخیره می‌شود؛ برای انتقال یا بکاپ، فایل بکاپ بگیرید.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                <p className="text-sm font-extrabold text-stone-800 dark:text-stone-200">بکاپ این پروژه</p>
                <p className={`${tinyCls} mt-1`}>فقط پروژه فعلی («{currentProject?.name ?? "—"}»).</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={btnSecondary}
                    onClick={() => {
                      setBackupName(`بکاپ-${currentProject?.name ?? "پروژه"}`);
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
                <p className={`${tinyCls} mt-1`}>همه {projects.length} پروژه با هم.</p>
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
            </div>
          </section>
        )}
      </ClinicalStepperShell>

      {/* ---------- مودال تشخیص ---------- */}
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
              {rows.length ? (
                <p><b>داده آماده است:</b> {rows.length} ردیف × {columns.length} ستون — می‌توانید دوباره تولید کنید یا به مرحله بعد بروید.</p>
              ) : (
                <p><b>هنوز داده‌ای تولید نشده است.</b> با دکمه زیر داده تمرینی ساخته می‌شود.</p>
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
                {rows.length ? "تولید مجدد داده" : "تولید داده"}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between gap-2 border-t border-stone-200 pt-4 dark:border-stone-700">
              <button type="button" className="text-[13px] font-bold text-stone-400 transition hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300" onClick={() => setDiagnoseModal(false)}>
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
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4" onClick={() => setProjectModal(false)} role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-6 shadow-2xl dark:border-stone-700 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-stone-900 dark:text-stone-100">پروژه جدید</h3>
            <p className="mt-1 text-[12px] text-stone-500 dark:text-stone-400">نام پروژه را وارد کنید؛ با مشخصات پیش‌فرض شروع می‌شود.</p>
            <input className={`${inputCls} mt-3`} value={newProjectName} placeholder={`پروژه ${projects.length + 1}`} onChange={(e) => setNewProjectName(e.target.value)} onKeyDown={(e) => {
              if (e.key === "Enter") createProject();
            }} autoFocus />
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className={btnLight} onClick={() => setProjectModal(false)}>انصراف</button>
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

// ------------------------------------------------------------
// اجزای کمکی
// ------------------------------------------------------------

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
