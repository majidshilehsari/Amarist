// ============================================================
// موتور تولید داده تمرینی برای مدل معادلات ساختاری (SEM) و تحلیل مسیر — آماریست
// ============================================================

import { clamp, mean, randomNormal } from "./statistics";
import { estimateSem, type Role, type PathRow, type SemResults } from "./sem-stats";

export type VariableSpec = {
  id: number;
  name: string;
  role: Role;
  /** آیا نمره کل دارد؟ (نمره کل = مجموع زیرمقیاس‌ها) */
  hasTotal: boolean;
  /** نام زیرمقیاس‌ها؛ اگر خالی باشد متغیر تک‌نمره‌ای (مشاهده‌شده) است */
  subscales: string[];
};

export type GenConstraints = {
  /** همه مسیرهای فعال معنی‌دار باشند (p<0.05) */
  enforcePathSig: boolean;
  /** اثر غیرمستقیم (میانجی) معنی‌دار باشد */
  enforceIndirectSig: boolean;
  /** بازه R² برای متغیرهای درونزاد */
  r2Range: { min: number; max: number } | null;
  /** حداقل CFI */
  cfiMin: number | null;
  /** حداکثر RMSEA */
  rmseaMax: number | null;
};

export type SemGenInput = {
  n: number;
  minScale: number;
  maxScale: number;
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

export function generateSemData(input: SemGenInput): SemGenOutput {
  const { variables, paths, n, minScale, maxScale, constraints } = input;
  const activePaths = paths.filter((p) => p.active);
  const roles = (id: number) => variables.find((v) => v.id === id)!.role;
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
  const meanScale = (minScale + maxScale) / 2;
  const sdScale = Math.max(0.6, (maxScale - minScale) / 5.0);
  const toScale = (z: number) => Math.round(clamp(meanScale + z * sdScale, minScale, maxScale));

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
    // ---------- ۱) ضرایب هدف (استانداردشده) ----------
    const targets = new Map<string, number>();
    for (const pr of activePaths) {
      const toRole = roles(pr.to);
      const fromRole = roles(pr.from);
      let val: number;
      if (constraints.enforcePathSig) {
        if (toRole === "mediator") val = rand(0.32, 0.62);
        else if (fromRole === "mediator") val = rand(0.22, 0.48);
        else val = rand(0.12, 0.38);
      } else {
        const strong = Math.random() < 0.5;
        if (toRole === "mediator") val = strong ? rand(0.32, 0.62) : rand(-0.28, 0.28);
        else if (fromRole === "mediator") val = strong ? rand(0.22, 0.48) : rand(-0.28, 0.28);
        else val = strong ? rand(0.12, 0.38) : rand(-0.28, 0.28);
      }
      targets.set(`${pr.from}:${pr.to}`, val);
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
        const a = targets.get(`${pr.from}:${pr.to}`) ?? 0;
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
        const b = targets.get(`${pr.from}:${pr.to}`) ?? 0;
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

    // ---------- ۳) شاخص‌ها و مقیاس‌سازی ----------
    const columns: string[] = [];
    const rows: (number | null)[][] = Array.from({ length: n }, () => []);
    const composites: number[][] = variables.map(() => Array(n).fill(0));

    for (const v of variables) {
      const latent = L[v.id];
      const cols: number[][] = [];
      if (v.subscales.length) {
        for (const sub of v.subscales) {
          const lam = rand(0.68, 0.85);
          const col = Array.from({ length: n }, (_, i) =>
            toScale(lam * latent[i] + Math.sqrt(1 - lam * lam) * randomNormal(Math.random))
          );
          cols.push(col);
          columns.push(`${v.name} — ${sub}`);
        }
      } else {
        const col = Array.from({ length: n }, (_, i) => toScale(latent[i]));
        cols.push(col);
        columns.push(v.name);
      }
      cols.forEach((col) => rows.forEach((r, i) => r.push(col[i])));
      composites[v.id] = Array.from({ length: n }, (_, i) => cols.reduce((s, c) => s + c[i], 0));
    }

    // ---------- ۴) ارزیابی روی داده نهایی ----------
    const sem = estimateSem(composites, variables.map((v) => v.role), paths);
    const margins: number[] = [];

    if (constraints.enforcePathSig) {
      for (const pr of sem.paths) margins.push(0.05 - pr.p);
    }
    if (constraints.enforceIndirectSig && meds.length) {
      for (const ef of sem.effects) {
        if (ef.indirect !== 0 && Number.isFinite(ef.pIndirect)) margins.push(0.05 - ef.pIndirect);
      }
    }
    if (constraints.r2Range) {
      for (const o of outs) {
        const r2 = sem.r2[o.id] ?? 0;
        margins.push(r2 - constraints.r2Range.min, constraints.r2Range.max - r2);
      }
    }
    if (constraints.cfiMin != null && sem.fit.valid) margins.push(sem.fit.cfi - constraints.cfiMin);
    if (constraints.rmseaMax != null && sem.fit.valid) margins.push(constraints.rmseaMax - sem.fit.rmsea);

    const score = margins.length ? Math.min(...margins) : Infinity;

    const pathTargets = activePaths.map((pr) => ({
      from: pr.from,
      to: pr.to,
      target: targets.get(`${pr.from}:${pr.to}`) ?? 0,
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
  if (constraints.enforcePathSig) messages.push("همه مسیرها باید معنی‌دار باشند (p<0.05)");
  if (constraints.enforceIndirectSig) messages.push("اثر غیرمستقیم باید معنی‌دار باشد");
  if (constraints.r2Range) messages.push(`R² بین ${constraints.r2Range.min} تا ${constraints.r2Range.max}`);
  if (constraints.cfiMin != null) messages.push(`CFI حداقل ${constraints.cfiMin}`);
  if (constraints.rmseaMax != null) messages.push(`RMSEA حداکثر ${constraints.rmseaMax}`);
  throw new Error(
    `با این تنظیمات، در ${maxAttempts} تلاش داده‌ای که همه قیود (${messages.join("، ")}) را پاس کند پیدا نشد. ` +
      `بهترین امتیاز معیار: ${scoreText}. پیشنهاد: حجم نمونه را بیشتر کنید، تعداد زیرمقیاس‌ها را افزایش دهید یا قیود را ملایم‌تر کنید.`
  );
}
