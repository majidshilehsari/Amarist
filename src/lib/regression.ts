// ============================================================
// رگرسیون خطی چندگانه — آماریست
// تحلیل OLS (ضرایب، خطای معیار، β استاندارد، t و p، R²، R² تعدیل‌شده، F)
// و تولید دادهٔ تمرینی با R² هدف.
// ============================================================

import { clamp, fSurvival, mean, randomNormal, sampleStd, sampleVariance, shapiroWilkTest } from "./statistics";
import { olsFit } from "./clinical-stats";

export function pearson(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return NaN;
  const ma = mean(a);
  const mb = mean(b);
  let num = 0;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    sa += (a[i] - ma) ** 2;
    sb += (b[i] - mb) ** 2;
  }
  const den = Math.sqrt(sa * sb);
  return den > 1e-12 ? num / den : NaN;
}

export function correlationMatrix(cols: number[][]): number[][] {
  const m = cols.length;
  const out: number[][] = [];
  for (let i = 0; i < m; i++) {
    const row: number[] = [];
    for (let j = 0; j < m; j++) row.push(i === j ? 1 : pearson(cols[i], cols[j]));
    out.push(row);
  }
  return out;
}

export type RegressionFit = {
  n: number;
  k: number;
  intercept: number;
  coefs: number[];
  se: number[];
  t: number[];
  p: number[];
  stdBetas: number[];
  r2: number;
  adjR2: number;
  F: number;
  pF: number;
  sse: number;
  sst: number;
  residuals: number[];
};

/** Xs = آرایهٔ متغیرهای پیش‌بین (هر کدام یک بردار)، y = متغیر پیامد. */
export function multipleRegression(Xs: number[][], y: number[]): RegressionFit {
  const n = y.length;
  const k = Xs.length;
  const X = Array.from({ length: n }, (_, i) => [1, ...Xs.map((c) => c[i])]);
  const fit = olsFit(X, y);
  const meanY = mean(y);
  const sst = y.reduce((s, v) => s + (v - meanY) ** 2, 0);
  const sse = fit.sse;
  const r2 = sst > 1e-12 ? 1 - sse / sst : NaN;
  const dfE = n - k - 1;
  const adjR2 = dfE > 0 ? 1 - (1 - r2) * ((n - 1) / dfE) : NaN;
  const ssr = Math.max(0, sst - sse);
  const F = dfE > 0 && sse > 1e-12 ? ssr / k / (sse / dfE) : NaN;
  const pF = Number.isFinite(F) ? fSurvival(F, k, dfE) : NaN;
  const sdY = sampleStd(y);
  const stdBetas = Xs.map((c, i) => (sdY > 1e-12 ? (fit.coefs[i + 1] * sampleStd(c)) / sdY : NaN));
  return {
    n,
    k,
    intercept: fit.coefs[0],
    coefs: fit.coefs.slice(1),
    se: fit.se.slice(1),
    t: fit.t.slice(1),
    p: fit.p.slice(1),
    stdBetas,
    r2,
    adjR2,
    F,
    pF,
    sse,
    sst,
    residuals: fit.resid,
  };
}

// ---------- تولید دادهٔ تمرینی ----------

export type RegressionGenConfig = {
  n: number;
  k: number;
  alpha: number;
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  targetR2: { min: number; max: number } | null;
  enforceSignificance: boolean;
  enforceNormality: boolean;
};

export type RegressionAnswerKey = {
  targetR2: { target: number; actual: number } | null;
  attempts: number;
};

export type RegressionGenResult = {
  columns: string[];
  rows: (number | null)[][];
  answerKey: RegressionAnswerKey;
};

export function regressionColumns(k: number): string[] {
  const names: string[] = [];
  for (let i = 1; i <= k; i++) names.push(`X${i}`);
  names.push("Y");
  return names;
}

function genX(k: number, n: number, xMin: number, xMax: number): number[][] {
  const mu = (xMin + xMax) / 2;
  const sd = Math.max(1, (xMax - xMin) / 6);
  const Xs: number[][] = [];
  for (let j = 0; j < k; j++) {
    const col: number[] = [];
    for (let i = 0; i < n; i++) col.push(clamp(mu + randomNormal(Math.random) * sd, xMin, xMax));
    Xs.push(col);
  }
  return Xs;
}

export function generateRegressionData(config: RegressionGenConfig, maxAttempts: number): RegressionGenResult {
  const { n, k, alpha, xMin, xMax, yMin, yMax } = config;
  const r2mid = config.targetR2 ? (config.targetR2.min + config.targetR2.max) / 2 : 0.6;
  const xRange = xMax - xMin;
  const yRange = yMax - yMin;
  const muX = (xMin + xMax) / 2;
  const beta = (yRange * 0.6) / (xRange * k);
  let noiseScale = 1;
  let best: { rows: number[][]; score: number; messages: string[]; r2: number } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const Xs = genX(k, n, xMin, xMax);
    const signal: number[] = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let j = 0; j < k; j++) s += beta * Xs[j][i];
      signal[i] = s;
    }
    const signalVar = Math.max(1e-6, sampleVariance(signal));
    const sdE = Math.sqrt(signalVar * (1 - r2mid) / Math.max(r2mid, 1e-3)) * noiseScale;
    const yMid = (yMin + yMax) / 2;
    const intercept = yMid - beta * muX * k;
    const rows: number[][] = [];
    const y: number[] = [];
    for (let i = 0; i < n; i++) {
      const yv = clamp(intercept + signal[i] + randomNormal(Math.random) * sdE, yMin, yMax);
      rows.push([...Xs.map((c) => c[i]), yv]);
      y.push(yv);
    }

    const fit = multipleRegression(Xs, y);
    let score = Infinity;
    const messages: string[] = [];
    if (config.targetR2) {
      const m1 = fit.r2 - config.targetR2.min;
      const m2 = config.targetR2.max - fit.r2;
      score = Math.min(score, m1, m2);
      if (m1 < 0) messages.push(`R² (${fit.r2.toFixed(3)}) کمتر از حداقل هدف است.`);
      if (m2 < 0) messages.push(`R² (${fit.r2.toFixed(3)}) بیشتر از حداکثر هدف است.`);
    }
    if (config.enforceSignificance) {
      for (let j = 0; j < k; j++) {
        score = Math.min(score, alpha - fit.p[j]);
        if (fit.p[j] >= alpha) messages.push(`ضریب پیش‌بین ${j + 1} معنی‌دار نشد (p=${fit.p[j].toFixed(4)}).`);
      }
    }
    if (config.enforceNormality) {
      const sw = shapiroWilkTest(fit.residuals);
      if (sw.valid && Number.isFinite(sw.p)) {
        score = Math.min(score, sw.p - alpha);
        if (sw.p < alpha) messages.push(`نرمال بودن باقیمانده‌ها برقرار نشد (شاپیرو p=${sw.p.toFixed(3)}).`);
      }
    }

    if (!best || score > best.score) best = { rows, score, messages, r2: fit.r2 };
    if (score >= 0) {
      return {
        columns: regressionColumns(k),
        rows,
        answerKey: { targetR2: config.targetR2 ? { target: r2mid, actual: fit.r2 } : null, attempts: attempt + 1 },
      };
    }
    if (config.targetR2 && Number.isFinite(fit.r2) && Math.abs(fit.r2) > 1e-3) {
      noiseScale = Math.max(0.2, noiseScale * clamp(Math.sqrt(fit.r2 / r2mid), 0.5, 1.5));
    }
  }

  const why = best && best.messages.length ? best.messages.slice(0, 3).join(" | ") : "شرایط هدف برقرار نشد.";
  throw new Error(`با این تنظیمات در ${maxAttempts} تلاش دادهٔ مطلوب پیدا نشد. ${why} پیشنهاد: بازهٔ R² را بازتر کنید یا حجم نمونه را بیشتر کنید.`);
}
