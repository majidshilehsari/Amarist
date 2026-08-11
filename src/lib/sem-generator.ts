// ============================================================
// موتور تولید داده تمرینی برای مدل معادلات ساختاری (SEM) و تحلیل مسیر — آماریست
// ============================================================

import { clamp, mean, randomNormal } from "./statistics";
import {
  estimateSem,
  bootstrapIndirectEffects,
  correlationMatrixWithP,
  kurtosis,
  skewness,
  type Role,
  type PathRow,
  type SemResults,
} from "./sem-stats";

export type VariableSpec = {
  id: number;
  name: string;
  role: Role;
  /** آیا نمره کل دارد؟ (نمره کل = مجموع زیرمقیاس‌ها) */
  hasTotal: boolean;
  /** دامنه نمره زیرمقیاس‌ها (مشترک برای همه زیرمقیاس‌های این متغیر) */
  itemMin: number;
  itemMax: number;
  /** دامنه نمره کل (فقط وقتی hasTotal) */
  totalMin: number;
  totalMax: number;
  /** نام زیرمقیاس‌ها؛ اگر خالی باشد متغیر تک‌نمره‌ای (مشاهده‌شده) است */
  subscales: string[];
};

/** قید هر مسیر: معناداری هدف + بازه β استانداردشده (اختیاری) */
export type PathTarget = {
  sig: "sig" | "ns" | "any";
  betaMin: number | null;
  betaMax: number | null;
};

/** قید اثر غیرمستقیم برای هر جفت برون‌زا → درون‌زا */
export type IndirectTarget = "sig" | "ns" | "any";

export type GenConstraints = {
  /** قید مسیرها به شکل «from:to» */
  pathTargets: Record<string, PathTarget>;
  /** قید اثر غیرمستقیم به شکل «from:to» (برون‌زا:درون‌زا) */
  indirectTargets: Record<string, IndirectTarget>;
  /** بازه R² متغیرهای درون‌زا */
  r2Range: { min: number; max: number } | null;
  cfiMin: number | null;
  rmseaMax: number | null;
  /** درصد داده گمشده (۰ تا ۲۰) */
  missingPct: number;
  /** درصد داده پرت (۰ تا ۱۰) */
  outlierPct: number;
  /** رعایت نرمال بودن تک‌متغیری (کجی/کشیدگی) */
  enforceNormality: boolean;
  /** رعایت خطی بودن (همبستگی‌های مسیردار معنادار باشند) */
  enforceLinearity: boolean;
  /** رعایت عدم هم‌خطی (VIF < 5) */
  enforceVif: boolean;
  /** رعایت استقلال خطاها (دوربین-واتسون بین ۱.۵ تا ۲.۵) */
  enforceDw: boolean;
  /** تعداد نمونه‌های بوت‌استرپ برای اثر غیرمستقیم */
  bootSamples: number;
};

export type SemGenInput = {
  n: number;
  variables: VariableSpec[];
  paths: PathRow[];
  constraints: GenConstraints;
};

export type SemAnswerKey = {
  pathTargets: { from: number; to: number; target: number; actual: number }[];
  r2Targets: { varId: number; target: number; actual: number }[];
  fit: SemResults["fit"];
  attempts: number;
  r2Range: { min: number; max: number } | null;
};

export type SemGenOutput = {
  columns: string[];
  rows: (number | null)[][];
  composites: number[][];
  answerKey: SemAnswerKey;
};

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function normKey(from: number, to: number): string {
  return `${from}:${to}`;
}

export function generateSemData(input: SemGenInput): SemGenOutput {
  const { variables, paths, n, constraints } = input;
  const activePaths = paths.filter((p) => p.active);
  const exogs = variables.filter((v) => v.role === "exogenous");
  const meds = variables.filter((v) => v.role === "mediator");
  const outs = variables.filter((v) => v.role === "outcome");

  if (!exogs.length || !outs.length) {
    throw new Error("حداقل یک متغیر برون‌زا و یک متغیر درون‌زا لازم است.");
  }
  if (exogs.length > 3 || meds.length > 2 || outs.length > 2) {
    throw new Error("فعلاً حداکثر ۳ متغیر برون‌زا، ۲ میانجی و ۲ درون‌زا پشتیبانی می‌شود.");
  }

  const maxAttempts = 6000;
  const scaleOf = (v: VariableSpec) => {
    const mn = v.itemMin;
    const mx = v.itemMax;
    return { mn, mx, mean: (mn + mx) / 2, sd: Math.max(0.6, (mx - mn) / 5) };
  };
  const toScale = (v: VariableSpec, z: number) => {
    const s = scaleOf(v);
    return Math.round(clamp(s.mean + z * s.sd, s.mn, s.mx));
  };

  type Attempt = {
    score: number;
    columns: string[];
    rows: (number | null)[][];
    composites: number[][];
    sem: SemResults;
    pathTargets: { from: number; to: number; target: number; actual: number }[];
    r2Targets: { varId: number; target: number; actual: number }[];
  };
  let best: Attempt | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // ---------- ۱) ضرایب هدف (استانداردشده) بر اساس قید مسیرها ----------
    const targets = new Map<string, number>();
    for (const pr of activePaths) {
      const t = constraints.pathTargets[normKey(pr.from, pr.to)] ?? {
        sig: "any",
        betaMin: null,
        betaMax: null,
      };
      let val: number;
      if (t.sig === "ns") {
        val = rand(-0.12, 0.12);
      } else if (t.sig === "sig") {
        val = rand(0.25, 0.5);
        if (t.betaMin != null) val = Math.max(val, t.betaMin);
        if (t.betaMax != null) val = Math.min(val, t.betaMax);
      } else {
        val = Math.random() < 0.5 ? rand(-0.15, 0.45) : rand(0.1, 0.4);
      }
      targets.set(normKey(pr.from, pr.to), val);
    }

    // ---------- ۲) نمرات نهفته ----------
    const L: Record<number, number[]> = {};
    for (const v of exogs) L[v.id] = Array.from({ length: n }, () => randomNormal(Math.random));

    let bad = false;
    const r2Targets: { varId: number; target: number; actual: number }[] = [];

    for (const m of meds) {
      const preds = activePaths.filter((pr) => pr.to === m.id);
      const lin = Array(n).fill(0);
      let varLin = 0;
      for (const pr of preds) {
        const a = targets.get(normKey(pr.from, pr.to)) ?? 0;
        const x = L[pr.from];
        for (let i = 0; i < n; i++) lin[i] += a * x[i];
        varLin += a * a;
      }
      if (varLin > 0.9) {
        bad = true;
        break;
      }
      const sdE = Math.sqrt(1 - varLin);
      L[m.id] = lin.map((v) => v + sdE * randomNormal(Math.random));
      r2Targets.push({ varId: m.id, target: varLin, actual: 0 });
    }
    if (bad) continue;

    for (const o of outs) {
      const preds = activePaths.filter((pr) => pr.to === o.id);
      const lin = Array(n).fill(0);
      for (const pr of preds) {
        const b = targets.get(normKey(pr.from, pr.to)) ?? 0;
        const x = L[pr.from];
        for (let i = 0; i < n; i++) lin[i] += b * x[i];
      }
      const m = mean(lin);
      let varLin = 0;
      for (let i = 0; i < n; i++) varLin += (lin[i] - m) ** 2;
      varLin /= n - 1;
      if (varLin > 0.97) {
        bad = true;
        break;
      }
      const sdE = Math.sqrt(1 - varLin);
      L[o.id] = lin.map((v) => v + sdE * randomNormal(Math.random));
      r2Targets.push({ varId: o.id, target: varLin, actual: 0 });
    }
    if (bad) continue;

    // ---------- ۳) شاخص‌ها با دامنه هر متغیر ----------
    const columns: string[] = [];
    const rows: (number | null)[][] = Array.from({ length: n }, () => []);
    const rawComposites: number[][] = variables.map(() => Array(n).fill(0));

    for (const v of variables) {
      const latent = L[v.id];
      const cols: number[][] = [];
      if (v.subscales.length) {
        for (const sub of v.subscales) {
          const lam = rand(0.6, 0.85);
          const col = Array.from({ length: n }, (_, i) =>
            toScale(v, lam * latent[i] + Math.sqrt(1 - lam * lam) * randomNormal(Math.random))
          );
          cols.push(col);
          columns.push(`${v.name} — ${sub}`);
        }
      } else {
        const col = Array.from({ length: n }, (_, i) => toScale(v, latent[i]));
        cols.push(col);
        columns.push(v.name);
      }
      cols.forEach((col) => rows.forEach((r, i) => r.push(col[i])));
      rawComposites[v.id] = Array.from({ length: n }, (_, i) => cols.reduce((s, c) => s + c[i], 0));
    }

    // ---------- ۴) اعمال داده گمشده و داده پرت ----------
    if (constraints.missingPct > 0) {
      const total = n * columns.length;
      const count = Math.min(total, Math.round((constraints.missingPct / 100) * total));
      const cells = new Set<number>();
      while (cells.size < count) {
        cells.add(Math.floor(Math.random() * total));
      }
      cells.forEach((cell) => {
        const r = Math.floor(cell / columns.length);
        const c = cell % columns.length;
        rows[r][c] = null;
      });
    }

    if (constraints.outlierPct > 0) {
      const count = Math.round((constraints.outlierPct / 100) * n);
      const chosen = new Set<number>();
      while (chosen.size < count && chosen.size < n) {
        chosen.add(Math.floor(Math.random() * n));
      }
      chosen.forEach((r) => {
        const c = Math.floor(Math.random() * columns.length);
        const v = variables.find(
          (x) => columns[c].startsWith(x.name + " — ") || columns[c] === x.name
        );
        const s = v ? scaleOf(v) : { mn: 1, mx: 5 };
        rows[r][c] = Math.random() < 0.5 ? s.mx + rand(1, 4) : s.mn - rand(1, 4);
      });
    }

    // نمره کل = مجموع زیرمقیاس‌ها (با null → NaN)
    const composites: number[][] = variables.map(() => Array(n).fill(NaN));
    for (let r = 0; r < n; r++) {
      let col = 0;
      for (const v of variables) {
        const nSub = v.subscales.length || 1;
        let sum = 0;
        let ok = true;
        for (let s = 0; s < nSub; s++) {
          const val = rows[r][col + s];
          if (val == null || !Number.isFinite(val)) {
            ok = false;
            break;
          }
          sum += val;
        }
        composites[v.id][r] = ok ? sum : NaN;
        col += nSub;
      }
    }

    // ---------- ۵) ارزیابی روی داده نهایی ----------
    const sem = estimateSem(composites, variables.map((v) => v.role), paths);
    const margins: number[] = [];

    // قید مسیرها
    for (const pr of sem.paths) {
      const t = constraints.pathTargets[normKey(pr.from, pr.to)];
      if (!t) continue;
      if (t.sig === "sig") {
        margins.push(0.05 - pr.p);
        if (t.betaMin != null) margins.push(pr.std - t.betaMin);
        if (t.betaMax != null) margins.push(t.betaMax - pr.std);
      } else if (t.sig === "ns") {
        margins.push(pr.p - 0.05);
        margins.push(0.2 - Math.abs(pr.std));
      }
    }

    if (constraints.r2Range) {
      // بازه R² فقط روی متغیرهای نتیجه (Y) اعمال می‌شود؛
      // R² میانجی‌ها با یک پیش‌بین برابر مجذور β است و قید جداگانه نمی‌خواهد.
      for (const o of outs) {
        const r2 = sem.r2[o.id] ?? 0;
        margins.push(r2 - constraints.r2Range.min, constraints.r2Range.max - r2);
      }
    }
    if (constraints.cfiMin != null && sem.fit.valid) margins.push(sem.fit.cfi - constraints.cfiMin);
    if (constraints.rmseaMax != null && sem.fit.valid) margins.push(constraints.rmseaMax - sem.fit.rmsea);

    // نرمال بودن تک‌متغیری (روی نمره کل) — اگر داده پرت عمدی داریم، این قید منتفی است
    if (constraints.enforceNormality && constraints.outlierPct === 0) {
      for (const v of variables) {
        const s = skewness(composites[v.id]);
        const k = kurtosis(composites[v.id]);
        if (Number.isFinite(s)) margins.push(3 - Math.abs(s));
        if (Number.isFinite(k)) margins.push(10 - Math.abs(k));
      }
    }

    // خطی بودن: همبستگی مسیرهای فعال معنادار باشند
    if (constraints.enforceLinearity) {
      const corr = correlationMatrixWithP(composites);
      for (const pr of activePaths) {
        const p = corr.p[pr.from][pr.to];
        if (Number.isFinite(p)) margins.push(0.05 - p);
      }
    }

    // هم‌خطی و استقلال خطاها
    if (constraints.enforceVif) {
      for (const v of [...meds, ...outs]) {
        const vifs = sem.vifs[v.id] ?? [];
        if (vifs.length) margins.push(5 - Math.max(...vifs));
      }
    }
    if (constraints.enforceDw) {
      for (const v of [...meds, ...outs]) {
        const dw = sem.dw[v.id];
        if (Number.isFinite(dw)) margins.push(dw - 1.5, 2.5 - dw);
      }
    }

    const scoreBase = margins.length ? Math.min(...margins) : Infinity;

    // اثر غیرمستقیم با بوت‌استرپ — فقط وقتی بقیه قیود پاس شده‌اند (برای سرعت)
    let score = scoreBase;
    if (scoreBase >= 0 && Object.keys(constraints.indirectTargets).length > 0) {
      const boot = bootstrapIndirectEffects(composites, variables.map((v) => v.role), paths, constraints.bootSamples);
      for (const b of boot) {
        const t = constraints.indirectTargets[normKey(b.from, b.to)];
        if (!t) continue;
        if (t === "sig") score = Math.min(score, 0.05 - b.p);
        else if (t === "ns") score = Math.min(score, b.p - 0.05);
      }
    }

    const pathTargets = activePaths.map((pr) => ({
      from: pr.from,
      to: pr.to,
      target: targets.get(normKey(pr.from, pr.to)) ?? 0,
      actual: sem.paths.find((x) => x.from === pr.from && x.to === pr.to)?.std ?? NaN,
    }));
    r2Targets.forEach((r) => (r.actual = sem.r2[r.varId] ?? 0));

    const attemptData: Attempt = {
      score,
      columns,
      rows,
      composites,
      sem,
      pathTargets,
      r2Targets,
    };

    if (score >= 0) {
      return {
        columns,
        rows,
        composites,
        answerKey: {
          pathTargets,
          r2Targets,
          fit: sem.fit,
          attempts: attempt + 1,
          r2Range: constraints.r2Range,
        },
      };
    }
    if (!best || score > best.score) best = attemptData;
  }

  const scoreText = best ? (Number.isFinite(best.score) ? best.score.toFixed(3) : "-") : "-";
  const messages: string[] = [];
  const sigPaths = Object.entries(constraints.pathTargets)
    .filter(([, t]) => t.sig === "sig")
    .map(([k]) => `مسیر ${k} معنادار`);
  const nsPaths = Object.entries(constraints.pathTargets)
    .filter(([, t]) => t.sig === "ns")
    .map(([k]) => `مسیر ${k} غیرمعنادار`);
  messages.push(...sigPaths, ...nsPaths);
  const sigInd = Object.entries(constraints.indirectTargets)
    .filter(([, v]) => v === "sig")
    .map(([k]) => `اثر غیرمستقیم ${k} معنادار`);
  messages.push(...sigInd);
  if (constraints.r2Range) messages.push(`R² بین ${constraints.r2Range.min} تا ${constraints.r2Range.max}`);
  if (constraints.cfiMin != null) messages.push(`CFI حداقل ${constraints.cfiMin}`);
  if (constraints.rmseaMax != null) messages.push(`RMSEA حداکثر ${constraints.rmseaMax}`);
  throw new Error(
    `با این تنظیمات، در ${maxAttempts} تلاش داده‌ای که همه قیود (${messages.join("، ")}) را پاس کند پیدا نشد. ` +
      `بهترین امتیاز معیار: ${scoreText}. پیشنهاد: حجم نمونه را بیشتر کنید، تعداد زیرمقیاس‌ها را افزایش دهید یا قیود را ملایم‌تر کنید.`
  );
}
