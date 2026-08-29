// ============================================================
// آمار بالینی (کارآزمایی مداخله‌ای) — آماریست
// طراحی: دو گروه مستقل × دو یا سه زمان (پیش‌آزمون / پس‌آزمون / پیگیری)
// تحلیل‌ها: t مستقل (نمره تغییر)، ANCOVA، تحلیل واریانس اندازه‌گیری مکرر (میکس‌آنوا)،
// بن‌فرونی درون‌گروهی، اندازه اثر (d کوهن و مجذور اتای جزئی) و پیش‌فرض‌ها.
// ============================================================

import {
  fSurvival,
  chiSquareSurvival,
  inverseNormalCDF,
  covarianceMatrix,
  determinant,
  transpose,
  matMul,
  trace,
  mean,
  sampleVariance,
  sampleStd,
  type Lists,
} from "./statistics";

// ---------- ماتریس ----------

/** وارون ماتریس مربعی با حذف گاوسی و محورگیری جزئی؛ در صورت تکین بودن null برمی‌گرداند. */
export function matrixInverse(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => row.concat(Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))));
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r;
    if (Math.abs(m[pivot][col]) < 1e-12) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const pv = m[col][col];
    for (let c = 0; c < 2 * n; c++) m[col][c] /= pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r][col];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) m[r][c] -= f * m[col][c];
    }
  }
  return m.map((row) => row.slice(n));
}

// ---------- رگرسیون خطی (حداقل مربعات) ----------

export type OlsResult = {
  coefs: number[];
  fitted: number[];
  resid: number[];
  sse: number;
  df: number;
  se: number[];
  t: number[];
  p: number[];
};

export function olsFit(X: number[][], y: number[]): OlsResult {
  const n = X.length;
  const k = X[0].length;
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const Xty = Xt.map((row) => row.reduce((s, x, i) => s + x * y[i], 0));
  const inv = matrixInverse(XtX);
  if (!inv) throw new Error("ماتریس طراحی تکین است؛ تحلیل قابل انجام نیست.");
  const coefs = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const fitted = X.map((row) => row.reduce((s, x, j) => s + x * coefs[j], 0));
  const resid = y.map((yi, i) => yi - fitted[i]);
  const sse = resid.reduce((s, r) => s + r * r, 0);
  const df = n - k;
  const mse = df > 0 ? sse / df : NaN;
  const se = inv.map((row, j) => (Number.isFinite(mse) ? Math.sqrt(Math.max(0, row[j]) * mse) : NaN));
  const t = coefs.map((c, j) => (Number.isFinite(se[j]) && se[j] > 1e-12 ? c / se[j] : NaN));
  const p = t.map((tv) => (Number.isFinite(tv) && df > 0 ? fSurvival(tv * tv, 1, df) : NaN));
  return { coefs, fitted, resid, sse, df, se, t, p };
}

// ---------- مقدار بحرانی t ----------

export function tCriticalTwoTail(df: number, alpha: number): number {
  if (!(df > 0) || !(alpha > 0 && alpha < 1)) return inverseNormalCDF(1 - alpha / 2);
  let hi = 1;
  for (let i = 0; i < 60; i++) {
    if (fSurvival(hi * hi, 1, df) < alpha) break;
    hi *= 2;
  }
  let lo = 0;
  for (let i = 0; i < 120; i++) {
    const mid = (lo + hi) / 2;
    if (fSurvival(mid * mid, 1, df) > alpha) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---------- t مستقل (واریانس تجمیعی) ----------

export type IndependentTResult = {
  n1: number;
  n2: number;
  mean1: number;
  mean2: number;
  meanDiff: number;
  se: number;
  t: number;
  df: number;
  p: number;
  ciLo: number;
  ciHi: number;
  cohensD: number;
  valid: boolean;
};

export function independentTTest(a: number[], b: number[]): IndependentTResult {
  const n1 = a.length;
  const n2 = b.length;
  const m1 = mean(a);
  const m2 = mean(b);
  const v1 = sampleVariance(a);
  const v2 = sampleVariance(b);
  const df = n1 + n2 - 2;
  const sp2 = ((n1 - 1) * v1 + (n2 - 1) * v2) / df;
  const se = Math.sqrt(sp2 * (1 / n1 + 1 / n2));
  const meanDiff = m2 - m1;
  const valid = Number.isFinite(se) && se > 1e-12;
  const t = valid ? meanDiff / se : NaN;
  const p = Number.isFinite(t) && df > 0 ? fSurvival(t * t, 1, df) : NaN;
  const tCrit = tCriticalTwoTail(df, 0.05);
  const pooledSd = Math.sqrt(sp2);
  return {
    n1,
    n2,
    mean1: m1,
    mean2: m2,
    meanDiff,
    se,
    t,
    df,
    p,
    ciLo: meanDiff - tCrit * se,
    ciHi: meanDiff + tCrit * se,
    cohensD: pooledSd > 1e-12 ? meanDiff / pooledSd : NaN,
    valid,
  };
}

// ---------- t زوجی ----------

export type PairedTResult = {
  n: number;
  meanDiff: number;
  sdDiff: number;
  se: number;
  t: number;
  df: number;
  p: number;
  ciLo: number;
  ciHi: number;
  cohensDz: number;
  cohensDav: number;
  valid: boolean;
};

export function pairedTTest(a: number[], b: number[]): PairedTResult {
  const n = Math.min(a.length, b.length);
  const diffs = Array.from({ length: n }, (_, i) => b[i] - a[i]);
  const meanDiff = mean(diffs);
  const sdDiff = sampleStd(diffs);
  const se = sdDiff / Math.sqrt(n);
  const df = n - 1;
  const valid = Number.isFinite(se) && se > 1e-12;
  const t = valid ? meanDiff / se : NaN;
  const p = Number.isFinite(t) && df > 0 ? fSurvival(t * t, 1, df) : NaN;
  const tCrit = tCriticalTwoTail(df, 0.05);
  const sdA = sampleStd(a);
  const sdB = sampleStd(b);
  return {
    n,
    meanDiff,
    sdDiff,
    se,
    t,
    df,
    p,
    ciLo: meanDiff - tCrit * se,
    ciHi: meanDiff + tCrit * se,
    cohensDz: sdDiff > 1e-12 ? meanDiff / sdDiff : NaN,
    cohensDav: sdA + sdB > 1e-12 ? meanDiff / ((sdA + sdB) / 2) : NaN,
    valid,
  };
}

// ---------- ANCOVA (پس‌آزمون با کنترل پیش‌آزمون) ----------

export type AncovaResult = {
  n: number;
  F: number;
  df1: number;
  df2: number;
  p: number;
  eta2: number;
  bGroup: number;
  tGroup: number;
  pGroup: number;
  bPre: number;
  adjMeans: [number, number];
  grandPre: number;
  grandPost: number;
  valid: boolean;
};

/** group آرایه‌ای از 0 و 1 است؛ pre و post نمره‌های پیش‌آزمون و پس‌آزمون. */
export function ancova(group: number[], pre: number[], post: number[]): AncovaResult {
  const n = group.length;
  const grandPre = mean(pre);
  const preC = pre.map((v) => v - grandPre);
  const Xf = group.map((g, i) => [1, g, preC[i]]);
  const Xr = group.map((g) => [1, g]);
  const full = olsFit(Xf, post);
  const red = olsFit(Xr, post);
  const ssGroup = Math.max(0, red.sse - full.sse);
  const dfE = n - 3;
  const valid = dfE > 0 && full.sse > 1e-12;
  const F = valid ? ssGroup / (full.sse / dfE) : NaN;
  const p = Number.isFinite(F) ? fSurvival(F, 1, dfE) : NaN;
  const eta2 = valid ? ssGroup / (ssGroup + full.sse) : NaN;
  const bPre = full.coefs[2];
  const adjMeans = [0, 1].map((g) => {
    const idx = group.map((x, i) => [x, i] as const).filter(([x]) => x === g).map(([, i]) => i);
    const meanPost = mean(idx.map((i) => post[i]));
    const meanPre = mean(idx.map((i) => pre[i]));
    return meanPost - bPre * (meanPre - grandPre);
  }) as [number, number];
  return {
    n,
    F,
    df1: 1,
    df2: dfE,
    p,
    eta2,
    bGroup: full.coefs[1],
    tGroup: full.t[1],
    pGroup: full.p[1],
    bPre,
    adjMeans,
    grandPre,
    grandPost: mean(post),
    valid,
  };
}

// ---------- تحلیل واریانس اندازه‌گیری مکرر (میکس‌آنوا) ----------

export type AnovaEffect = { ss: number; df: number; ms: number; f: number; p: number; eta: number };

export type MixedAnovaResult = {
  group: AnovaEffect;
  time: AnovaEffect;
  timeGroup: AnovaEffect;
  errorBetween: { ss: number; df: number; ms: number };
  errorTime: { ss: number; df: number; ms: number };
};

/** data[گروه][فرد][زمان] — عمومی برای هر تعداد گروه و زمان. */
export function mixedAnova(data: number[][][]): MixedAnovaResult {
  const G = data.length;
  const T = data[0][0].length;
  const nPerGroup = data.map((g) => g.length);
  const totalSubjects = nPerGroup.reduce((s, n) => s + n, 0);

  const allValues: number[] = [];
  for (let g = 0; g < G; g++) for (let s = 0; s < nPerGroup[g]; s++) for (let t = 0; t < T; t++) allValues.push(data[g][s][t]);
  const grandMean = mean(allValues);

  const subjectMeans = data.map((g) => g.map((subj) => mean(subj)));
  const groupMeans = data.map((g) => {
    const vals: number[] = [];
    g.forEach((subj) => subj.forEach((x) => vals.push(x)));
    return mean(vals);
  });
  const timeMeans = Array.from({ length: T }, (_, t) => {
    const vals: number[] = [];
    for (let g = 0; g < G; g++) data[g].forEach((subj) => vals.push(subj[t]));
    return mean(vals);
  });
  const cellMeans = data.map((g) => Array.from({ length: T }, (_, t) => mean(g.map((subj) => subj[t]))));

  const ssGroup = nPerGroup.reduce((s, ng, g) => s + ng * T * (groupMeans[g] - grandMean) ** 2, 0);
  let ssSubjectsWithin = 0;
  for (let g = 0; g < G; g++) {
    for (let s = 0; s < nPerGroup[g]; s++) ssSubjectsWithin += T * (subjectMeans[g][s] - groupMeans[g]) ** 2;
  }
  const ssTime = totalSubjects * timeMeans.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  let ssTimeGroup = 0;
  for (let g = 0; g < G; g++) {
    for (let t = 0; t < T; t++) ssTimeGroup += nPerGroup[g] * (cellMeans[g][t] - groupMeans[g] - timeMeans[t] + grandMean) ** 2;
  }
  let ssWithin = 0;
  for (let g = 0; g < G; g++) {
    for (let s = 0; s < nPerGroup[g]; s++) {
      for (let t = 0; t < T; t++) ssWithin += (data[g][s][t] - subjectMeans[g][s]) ** 2;
    }
  }
  let ssErrorTime = ssWithin - ssTime - ssTimeGroup;
  if (ssErrorTime < 0 && Math.abs(ssErrorTime) < 1e-8) ssErrorTime = 0;

  const dfGroup = G - 1;
  const dfSubjectsWithin = totalSubjects - G;
  const dfTime = T - 1;
  const dfTimeGroup = (T - 1) * (G - 1);
  const dfErrorTime = (totalSubjects - G) * (T - 1);

  const msGroup = ssGroup / dfGroup;
  const msSubjectsWithin = ssSubjectsWithin / dfSubjectsWithin;
  const msTime = ssTime / dfTime;
  const msTimeGroup = ssTimeGroup / dfTimeGroup;
  const msErrorTime = ssErrorTime / dfErrorTime;

  const fTime = msErrorTime > 0 ? msTime / msErrorTime : Infinity;
  const fTimeGroup = msErrorTime > 0 ? msTimeGroup / msErrorTime : Infinity;
  const fGroup = msSubjectsWithin > 0 ? msGroup / msSubjectsWithin : Infinity;

  return {
    group: {
      ss: ssGroup,
      df: dfGroup,
      ms: msGroup,
      f: fGroup,
      p: fSurvival(fGroup, dfGroup, dfSubjectsWithin),
      eta: ssGroup / (ssGroup + ssSubjectsWithin),
    },
    time: {
      ss: ssTime,
      df: dfTime,
      ms: msTime,
      f: fTime,
      p: fSurvival(fTime, dfTime, dfErrorTime),
      eta: ssTime / (ssTime + ssErrorTime),
    },
    timeGroup: {
      ss: ssTimeGroup,
      df: dfTimeGroup,
      ms: msTimeGroup,
      f: fTimeGroup,
      p: fSurvival(fTimeGroup, dfTimeGroup, dfErrorTime),
      eta: ssTimeGroup / (ssTimeGroup + ssErrorTime),
    },
    errorBetween: { ss: ssSubjectsWithin, df: dfSubjectsWithin, ms: msSubjectsWithin },
    errorTime: { ss: ssErrorTime, df: dfErrorTime, ms: msErrorTime },
  };
}

// ---------- موچلی (کرویت) ----------

function orthonormalContrasts(p: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < p - 1; i++) {
    let w = Array(p).fill(0);
    w[i] = 1;
    w[i + 1] = -1;
    for (const r of rows) {
      const dot = w.reduce((s, x, j) => s + x * r[j], 0);
      w = w.map((x, j) => x - dot * r[j]);
    }
    const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
    if (norm > 1e-12) rows.push(w.map((x) => x / norm));
  }
  return rows;
}

export type MauchlyResult = { valid: boolean; w: number; chi: number; df: number; p: number; message: string };

/** محاسبه موچلی از روی ماتریس کوواریانس تجمیعی و درجه آزادی تجمیعی. */
export function mauchlyFromCov(S: number[][], pooledDf: number): MauchlyResult {
  const p = S.length;
  if (p < 3) return { valid: false, w: NaN, chi: NaN, df: NaN, p: NaN, message: "حداقل ۳ زمان اندازه‌گیری لازم است." };
  const contrasts = orthonormalContrasts(p);
  const C = contrasts;
  const CSC = matMul(matMul(C, S), transpose(C));
  const detA = determinant(CSC);
  const trA = trace(CSC);
  if (detA <= 1e-12 || trA <= 1e-12) {
    return { valid: false, w: NaN, chi: NaN, df: NaN, p: NaN, message: "ماتریس کوواریانس تضادها تکین است." };
  }
  const w = Math.min(1, Math.max(1e-12, detA / Math.pow(trA / (p - 1), p - 1)));
  const df = (p * (p - 1)) / 2 - 1;
  const correction = (2 * p * p + p + 2) / (6 * p);
  const chi = Math.max(0, -(pooledDf - correction) * Math.log(w));
  return { valid: true, w, chi, df, p: chiSquareSurvival(chi, df), message: "p بر اساس تقریب کای‌دو محاسبه شده است." };
}

/** کوواریانس تجمیعی درون‌گروهی برای داده‌های [گروه][فرد][زمان]. */
export function pooledCovarianceOf(data: number[][][]): { pooled: number[][]; ns: number[]; pooledDf: number } {
  const G = data.length;
  const T = data[0][0].length;
  const ns = data.map((g) => g.length);
  const pooledDf = ns.reduce((s, n) => s + n - 1, 0);
  const pooled = Array.from({ length: T }, () => Array(T).fill(0) as number[]);
  data.forEach((group, gi) => {
    const cov = covarianceMatrix(group);
    const w = ns[gi] - 1;
    for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) pooled[i][j] += w * cov[i][j];
  });
  for (let i = 0; i < T; i++) for (let j = 0; j < T; j++) pooled[i][j] /= pooledDf;
  return { pooled, ns, pooledDf };
}

export function mauchlyPooled(data: number[][][]): MauchlyResult {
  const { pooled, pooledDf } = pooledCovarianceOf(data);
  return mauchlyFromCov(pooled, pooledDf);
}

// ---------- باکس M ----------

export type BoxMResult = { valid: boolean; m: number; chi: number; df: number; p: number; message: string };

export function boxMGeneral(covs: number[][][], ns: number[]): BoxMResult {
  const k = covs.length;
  const p = covs[0].length;
  const pooledDf = ns.reduce((s, n) => s + n - 1, 0);
  const pooled = Array.from({ length: p }, () => Array(p).fill(0) as number[]);
  covs.forEach((cov, i) => {
    const w = ns[i] - 1;
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) pooled[a][b] += w * cov[a][b];
  });
  for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) pooled[a][b] /= pooledDf;
  const dets = covs.map(determinant);
  const detPooled = determinant(pooled);
  if (dets.some((d) => d <= 1e-12) || detPooled <= 1e-12) {
    return { valid: false, m: NaN, chi: NaN, df: NaN, p: NaN, message: "ماتریس کوواریانس تکین یا نزدیک به تکین است." };
  }
  let m = pooledDf * Math.log(detPooled);
  covs.forEach((_, i) => {
    m -= (ns[i] - 1) * Math.log(dets[i]);
  });
  if (m < 0 && Math.abs(m) < 1e-9) m = 0;
  const sumInv = ns.reduce((s, n) => s + 1 / (n - 1), 0);
  const correction = ((2 * p * p + 3 * p - 1) / (6 * (p + 1) * (k - 1))) * (sumInv - 1 / pooledDf);
  const chi = Math.max(0, m * (1 - correction));
  const df = ((k - 1) * p * (p + 1)) / 2;
  return { valid: true, m, chi, df, p: chiSquareSurvival(chi, df), message: "p بر اساس تقریب کای‌دو محاسبه شده است." };
}

// ---------- بن‌فرونی درون‌گروهی (زوج‌های زمانی) ----------

export type WithinPair = { i: number; j: number; meanDiff: number; sdDiff: number; p: number; pBonf: number };

export function withinGroupBonferroni(groupData: number[][]): WithinPair[] {
  const T = groupData[0].length;
  const times = transpose(groupData);
  const nPairs = (T * (T - 1)) / 2;
  const pairs: WithinPair[] = [];
  for (let i = 0; i < T; i++) {
    for (let j = i + 1; j < T; j++) {
      const pt = pairedTTest(times[i], times[j]);
      pairs.push({ i, j, meanDiff: pt.meanDiff, sdDiff: pt.sdDiff, p: pt.p, pBonf: Math.min(1, pt.p * nPairs) });
    }
  }
  return pairs;
}

// ---------- استخراج گروه‌ها از ردیف‌های جدول ----------

export type ClinicalRows = { groupIds: number[]; timeData: number[][] };

/** ردیف‌های جدول: ستون ۰ = شماره گروه (۱ یا ۲)، بقیه ستون‌ها = نمره‌های زمانی. */
export function rowsToGrouped(rows: (number | null)[][]): ClinicalRows {
  const groupIds: number[] = [];
  const timeData: number[][] = [];
  rows.forEach((row) => {
    const g = row[0];
    if (g == null) return;
    const gi = g === 1 ? 0 : 1;
    const vals = row.slice(1);
    groupIds.push(gi);
    timeData.push(vals.map((v) => (v == null || !Number.isFinite(v) ? NaN : v)));
  });
  return { groupIds, timeData };
}

/** حذف لیستی موارد ناقص (هر فردی که سلول گمشده دارد). */
export function completeCases(groupIds: number[], timeData: number[][]): { groupIds: number[]; timeData: number[][]; dropped: number } {
  const g: number[] = [];
  const t: number[][] = [];
  let dropped = 0;
  groupIds.forEach((gi, i) => {
    if (timeData[i].every((v) => Number.isFinite(v))) {
      g.push(gi);
      t.push(timeData[i]);
    } else {
      dropped++;
    }
  });
  return { groupIds: g, timeData: t, dropped };
}

/** ساخت ساختار [گروه][فرد][زمان] از ردیف‌های کامل. */
export function groupedByGroup(groupIds: number[], timeData: number[][]): number[][][] {
  const groups: number[][][] = [[], []];
  groupIds.forEach((gi, i) => groups[gi].push(timeData[i]));
  return groups;
}

/** نگه‌داشتن سازگاری با نوع قدیمی Lists (در صورت نیاز). */
export type { Lists };
