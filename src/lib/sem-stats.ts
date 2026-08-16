// ============================================================
// آماره‌ها و تحلیل‌های مدل معادلات ساختاری (SEM) و تحلیل مسیر — آماریست
// ============================================================

import {
  mean,
  sampleVariance,
  sampleStd,
  regularizedBeta,
  chiSquareSurvival,
  determinant,
  matMul,
  transpose,
  clamp,
} from "./statistics";

export type Role = "exogenous" | "mediator" | "outcome";



export type PathRow = {
  from: number;
  to: number;
  active: boolean;
};

// ---------- آماره‌های تک‌متغیره ----------

export function countFinite(values: number[]): number {
  return values.reduce((s, v) => s + (Number.isFinite(v) ? 1 : 0), 0);
}

export function skewness(values: number[]): number {
  const n = countFinite(values);
  if (n < 3) return NaN;
  const m = mean(values);
  const sd = sampleStd(values);
  if (!Number.isFinite(sd) || sd <= 0) return NaN;
  return (n / ((n - 1) * (n - 2))) * values.reduce((s, v) => s + Math.pow((v - m) / sd, 3), 0);
}

/** کشیدگی (نرمال‌شده/اضافی) با فرمول متداول SPSS */
export function kurtosis(values: number[]): number {
  const n = countFinite(values);
  if (n < 4) return NaN;
  const m = mean(values);
  const sd = sampleStd(values);
  if (!Number.isFinite(sd) || sd <= 0) return NaN;
  const m4 = values.reduce((s, v) => s + Math.pow((v - m) / sd, 4), 0) / n;
  return (
    ((n * (n + 1)) / ((n - 1) * (n - 2) * (n - 3))) * m4 -
    (3 * (n - 1) * (n - 1)) / ((n - 2) * (n - 3))
  );
}

// ---------- توزیع t و همبستگی پیرسون ----------

export function tSurvival(t: number, df: number): number {
  if (!Number.isFinite(t)) return NaN;
  if (t <= 0) return 1;
  return 0.5 * regularizedBeta(df / (df + t * t), df / 2, 1 / 2);
}

export function pearson(x: number[], y: number[]): { r: number; p: number; n: number } {
  const n = Math.min(x.length, y.length);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Number.isFinite(x[i]) && Number.isFinite(y[i])) {
      xs.push(x[i]);
      ys.push(y[i]);
    }
  }
  const k = xs.length;
  if (k < 3) return { r: NaN, p: NaN, n: k };
  const mx = mean(xs);
  const my = mean(ys);
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < k; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx <= 0 || syy <= 0) return { r: NaN, p: NaN, n: k };
  const r = sxy / Math.sqrt(sxx * syy);
  const t = r * Math.sqrt((k - 2) / Math.max(1e-12, 1 - r * r));
  const p = clamp(2 * tSurvival(Math.abs(t), k - 2), 0, 1);
  return { r, p, n: k };
}

export function correlationMatrixWithP(cols: number[][]): { r: number[][]; p: number[][] } {
  const p = cols.length;
  const r = Array.from({ length: p }, () => Array(p).fill(0));
  const pv = Array.from({ length: p }, () => Array(p).fill(1));
  for (let i = 0; i < p; i++) {
    r[i][i] = 1;
    pv[i][i] = 0;
    for (let j = i + 1; j < p; j++) {
      const res = pearson(cols[i], cols[j]);
      r[i][j] = r[j][i] = res.r;
      pv[i][j] = pv[j][i] = res.p;
    }
  }
  return { r, p: pv };
}

// ---------- ماتریس ----------

function gaussSolve(A: number[][], b: number[]): number[] | null {
  const n = A.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    }
    if (Math.abs(M[piv][col]) < 1e-12) return null;
    [M[piv], M[col]] = [M[col], M[piv]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / M[i][i]);
}

export function invertMatrix(A: number[][]): number[][] | null {
  const n = A.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = Array(n).fill(0);
    e[j] = 1;
    const col = gaussSolve(A, e);
    if (!col) return null;
    cols.push(col);
  }
  return cols[0].map((_, i) => cols.map((row) => row[i]));
}

export function completeRows(cols: number[][]): number {
  const n = cols[0]?.length ?? 0;
  let c = 0;
  for (let i = 0; i < n; i++) {
    if (cols.every((col) => Number.isFinite(col[i]))) c++;
  }
  return c;
}

/** کوواریانس نمونه (تقسیم بر n-1) با حذف لیستی موارد ناقص */
export function covarianceMatrix(cols: number[][]): number[][] {
  const p = cols.length;
  const n = cols[0]?.length ?? 0;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const r = cols.map((c) => c[i]);
    if (r.every(Number.isFinite)) rows.push(r);
  }
  const k = rows.length;
  if (k <= 1) return Array.from({ length: p }, () => Array(p).fill(0));
  const means = Array(p).fill(0);
  rows.forEach((r) => r.forEach((v, j) => (means[j] += v)));
  means.forEach((_, j) => (means[j] /= k));
  const cov = Array.from({ length: p }, () => Array(p).fill(0));
  rows.forEach((r) => {
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) cov[i][j] += (r[i] - means[i]) * (r[j] - means[j]);
    }
  });
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) cov[i][j] /= k - 1;
  }
  return cov;
}

// ---------- ماهالانوبیس و مردیا ----------

export function mahalanobisDistances(cols: number[][]) {
  const p = cols.length;
  const n = cols[0]?.length ?? 0;
  const rows: number[][] = [];
  const originalIdx: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = cols.map((c) => c[i]);
    if (r.every(Number.isFinite)) {
      rows.push(r);
      originalIdx.push(i);
    }
  }
  const k = rows.length;
  if (k <= p + 1) {
    return { valid: false, d2: [], p: [], originalIdx: [], outliers: [], message: "تعداد موارد کامل کمتر از تعداد متغیرهاست." };
  }
  const cov = covarianceMatrix(cols);
  const inv = invertMatrix(cov);
  if (!inv) {
    return { valid: false, d2: [], p: [], originalIdx: [], outliers: [], message: "ماتریس کوواریانس تکین است؛ داده پرت چندمتغیری قابل بررسی نیست." };
  }
  const means = Array(p).fill(0);
  rows.forEach((r) => r.forEach((v, j) => (means[j] += v)));
  means.forEach((_, j) => (means[j] /= k));
  const d2 = rows.map((r) => {
    const d = r.map((v, j) => v - means[j]);
    let q = 0;
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) q += d[i] * inv[i][j] * d[j];
    }
    return q;
  });
  const pv = d2.map((d) => chiSquareSurvival(d, p));
  const outliers = originalIdx.filter((_, i) => pv[i] < 0.05);
  return { valid: true, d2, p: pv, originalIdx, outliers, message: "" };
}

export function mardiaTest(cols: number[][]) {
  const m = mahalanobisDistances(cols);
  if (!m.valid) return { valid: false, kurtosis: NaN, cr: NaN, message: m.message };
  const p = cols.length;
  const n = m.d2.length;
  const b2p = mean(m.d2);
  const expected = p * (p + 2);
  const se = Math.sqrt((8 * p * (p + 2)) / n);
  const cr = (b2p - expected) / se;
  return { valid: true, kurtosis: b2p, cr, message: "" };
}

// ---------- رگرسیون ----------

export type OlsResult = {
  n: number;
  k: number;
  coefs: number[];
  se: number[];
  t: number[];
  p: number[];
  r2: number;
  adjR2: number;
  residuals: number[];
  ssr: number;
  dw: number;
};

export function ols(predictors: number[][], y: number[]): OlsResult {
  const n = y.length;
  const k = predictors.length;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const preds = predictors.map((c) => c[i]);
    if (Number.isFinite(y[i]) && preds.every(Number.isFinite)) rows.push([1, ...preds, y[i]]);
  }
  const m = rows.length;
  if (m < k + 2) throw new Error("تعداد موارد کافی برای رگرسیون نیست.");
  const XtX = Array.from({ length: k + 1 }, () => Array(k + 1).fill(0));
  const Xty = Array(k + 1).fill(0);
  rows.forEach((row) => {
    for (let i = 0; i <= k; i++) {
      Xty[i] += row[i] * row[k + 1];
      for (let j = 0; j <= k; j++) XtX[i][j] += row[i] * row[j];
    }
  });
  const coefs = gaussSolve(XtX, Xty);
  if (!coefs) throw new Error("مشکل در حل معادلات رگرسیون (همخطی کامل).");
  const fitted = rows.map((row) => coefs.reduce((s, c, j) => s + c * row[j], 0));
  const residuals = rows.map((row, i) => row[k + 1] - fitted[i]);
  const ssr = residuals.reduce((s, e) => s + e * e, 0);
  const yMean = mean(rows.map((r) => r[k + 1]));
  const sst = rows.reduce((s, r) => s + (r[k + 1] - yMean) ** 2, 0);
  const r2 = sst > 0 ? 1 - ssr / sst : 0;
  const adjR2 = 1 - ((1 - r2) * (m - 1)) / (m - k - 1);
  const s2 = ssr / (m - k - 1);
  const inv = invertMatrix(XtX);
  const se = coefs.map((_, j) => (inv ? Math.sqrt(s2 * Math.max(0, inv[j][j])) : NaN));
  const t = coefs.map((c, j) => (Number.isFinite(se[j]) && se[j] > 0 ? c / se[j] : NaN));
  const p = t.map((tv) => (Number.isFinite(tv) ? clamp(2 * tSurvival(Math.abs(tv), m - k - 1), 0, 1) : NaN));
  let dw = NaN;
  if (residuals.length > 1) {
    let num = 0;
    for (let i = 1; i < residuals.length; i++) num += (residuals[i] - residuals[i - 1]) ** 2;
    dw = ssr > 0 ? num / ssr : NaN;
  }
  return { n: m, k, coefs, se, t, p, r2, adjR2, residuals, ssr, dw };
}

export function vifForPredictors(predictors: number[][]): number[] {
  const k = predictors.length;
  const vifs: number[] = [];
  for (let j = 0; j < k; j++) {
    const others = predictors.filter((_, i) => i !== j);
    const r2 = ols(others, predictors[j]).r2;
    vifs.push(1 / Math.max(1e-9, 1 - r2));
  }
  return vifs;
}

// ---------- قابلیت اعتماد و بارهای عاملی ----------

export function cronbachAlpha(cols: number[][]): number {
  const k = cols.length;
  if (k < 2) return NaN;
  const n = cols[0]?.length ?? 0;
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const r = cols.map((c) => c[i]);
    if (r.every(Number.isFinite)) rows.push(r);
  }
  if (rows.length < 3) return NaN;
  const itemVars = cols.map(sampleVariance);
  const totals = rows.map((r) => r.reduce((s, v) => s + v, 0));
  const varTotal = sampleVariance(totals);
  if (!Number.isFinite(varTotal) || varTotal <= 0) return NaN;
  return (k / (k - 1)) * (1 - itemVars.reduce((s, v) => s + v, 0) / varTotal);
}

/** بارهای عاملی مؤلفه اول (تحلیل مؤلفه‌های اصلی) روی شاخص‌ها */
export function pcaLoadings(cols: number[][]): number[] {
  const k = cols.length;
  if (k < 2) return cols.map(() => NaN);
  const corr = correlationMatrixWithP(cols).r;
  let vec = Array(k).fill(1 / Math.sqrt(k));
  for (let it = 0; it < 200; it++) {
    const nv = corr.map((row) => row.reduce((s, v, j) => s + v * vec[j], 0));
    const norm = Math.sqrt(nv.reduce((s, v) => s + v * v, 0));
    if (norm < 1e-12) break;
    vec = nv.map((v) => v / norm);
  }
  const ev = vec.reduce((s, v, i) => s + v * corr[i].reduce((ss, c, j) => ss + c * vec[j], 0), 0);
  return vec.map((v) => v * Math.sqrt(Math.max(0, ev)));
}

// ---------- مدل گره‌ای (متغیر جمع‌پذیر / غیرجمع‌پذیر) ----------

export type ModelNode = {
  nodeId: number;
  varId: number;
  label: string;
  kind: "total" | "sub" | "single";
  role: Role;
};

export type ModelArrow = {
  id: string;
  fromNode: number;
  toNode: number;
  fromVar: number;
  toVar: number;
  active: boolean;
};

export type SemFit = {
  valid: boolean;
  chi2: number;
  df: number;
  pValue: number;
  chi2df: number;
  cfi: number;
  tli: number;
  rmsea: number;
  rmseaLow: number;
  rmseaHigh: number;
  srmr: number;
  pnfi: number;
  pcfi: number;
  ifi: number;
  gfi: number;
  message?: string;
};

export type SemMeasurementColumns = Record<number, number[][]>;

export type SemPathResult = {
  from: number;
  to: number;
  b: number;
  se: number;
  t: number;
  p: number;
  std: number;
};

export type SemEffect = {
  fromVar: number;
  toVar: number;
  direct: number;
  indirect: number;
  total: number;
};

export type SemResults = {
  ordered: number[];
  paths: SemPathResult[];
  r2: Record<number, number>;
  dw: Record<number, number>;
  vifs: Record<number, number[]>;
  fit: SemFit;
  effects: SemEffect[];
  warnings: string[];
};

const ROLE_ORDER_NODE: Record<Role, number> = { exogenous: 0, mediator: 1, outcome: 2 };

function noncentralChiSquareCdf(x: number, df: number, lambda: number): number {
  if (!(x >= 0) || !(df > 0) || !(lambda >= 0)) return NaN;
  if (lambda < 1e-12) return clamp(1 - chiSquareSurvival(x, df), 0, 1);
  const half = lambda / 2;
  let weight = Math.exp(-half);
  let sum = 0;
  const maxTerms = Math.max(200, Math.ceil(half + 12 * Math.sqrt(half + 1)));
  for (let j = 0; j <= maxTerms; j++) {
    sum += weight * (1 - chiSquareSurvival(x, df + 2 * j));
    weight *= half / (j + 1);
    if (j > half && weight < 1e-14) break;
  }
  return clamp(sum, 0, 1);
}

function noncentralityAtCdf(x: number, df: number, target: number): number {
  const atZero = noncentralChiSquareCdf(x, df, 0);
  if (!Number.isFinite(atZero) || atZero <= target) return 0;
  let lo = 0;
  let hi = Math.max(1, x + df);
  while (noncentralChiSquareCdf(x, df, hi) > target && hi < 1e5) hi *= 2;
  for (let i = 0; i < 70; i++) {
    const mid = (lo + hi) / 2;
    if (noncentralChiSquareCdf(x, df, mid) > target) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

function rmseaConfidence90(chi2: number, df: number, n: number): { low: number; high: number } {
  if (!(df > 0) || !(n > 1) || !Number.isFinite(chi2)) return { low: NaN, high: NaN };
  const denominator = df * (n - 1);
  const lowLambda = noncentralityAtCdf(chi2, df, 0.95);
  const highLambda = noncentralityAtCdf(chi2, df, 0.05);
  return {
    low: Math.sqrt(Math.max(0, lowLambda) / denominator),
    high: Math.sqrt(Math.max(0, highLambda) / denominator),
  };
}

function commonFactorLoadings(cols: number[][]): number[] {
  const count = cols.length;
  if (count <= 1) return [1];
  const corr = correlationMatrixWithP(cols).r;
  if (count === 2) {
    const loading = Math.sqrt(clamp(Math.abs(corr[0][1]), 0.09, 0.9025));
    return [loading, loading];
  }

  let averageCorrelation = 0;
  let pairs = 0;
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      averageCorrelation += Math.max(0, corr[i][j]);
      pairs++;
    }
  }
  const initial = Math.sqrt(clamp(averageCorrelation / Math.max(1, pairs), 0.09, 0.9025));
  let loadings = Array(count).fill(initial);
  const learningRate = 0.04 / count;
  for (let iteration = 0; iteration < 800; iteration++) {
    const gradients = Array(count).fill(0);
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) {
        const residual = corr[i][j] - loadings[i] * loadings[j];
        gradients[i] -= 2 * loadings[j] * residual;
        gradients[j] -= 2 * loadings[i] * residual;
      }
    }
    loadings = loadings.map((loading, index) => clamp(loading - learningRate * gradients[index], 0.3, 0.95));
  }
  return loadings;
}

function measurementModelFit(
  nodes: ModelNode[],
  activeArrows: ModelArrow[],
  nodeCols: number[][],
  measurementCols: SemMeasurementColumns,
  paths: SemPathResult[],
  r2: Record<number, number>
): SemFit | null {
  const orderedNodes = [...nodes].sort((a, b) => a.nodeId - b.nodeId);
  const blocks = orderedNodes.map((node) => {
    const supplied = measurementCols[node.nodeId]?.filter((col) => col?.length) ?? [];
    return { node, cols: supplied.length ? supplied : [nodeCols[node.nodeId]] };
  });
  const observedRaw = blocks.flatMap((block) => block.cols);
  if (observedRaw.length < 2) return null;

  const rawN = Math.min(
    ...[...observedRaw, ...orderedNodes.map((node) => nodeCols[node.nodeId])].map((col) => col?.length ?? 0)
  );
  const complete: number[] = [];
  for (let row = 0; row < rawN; row++) {
    if (
      observedRaw.every((col) => Number.isFinite(col[row])) &&
      orderedNodes.every((node) => Number.isFinite(nodeCols[node.nodeId]?.[row]))
    ) {
      complete.push(row);
    }
  }
  const nCases = complete.length;
  if (nCases <= observedRaw.length + 2) return null;

  const clean = (col: number[]) => complete.map((row) => col[row]);
  const observed = observedRaw.map(clean);
  const latent = orderedNodes.map((node) => clean(nodeCols[node.nodeId]));
  const sample = correlationMatrixWithP(observed).r;
  if (sample.some((row) => row.some((value) => !Number.isFinite(value)))) return null;

  const latentIndex = new Map(orderedNodes.map((node, index) => [node.nodeId, index]));
  const latentCount = orderedNodes.length;
  const bStd = Array.from({ length: latentCount }, () => Array(latentCount).fill(0));
  for (const path of paths) {
    const from = latentIndex.get(path.from);
    const to = latentIndex.get(path.to);
    if (from != null && to != null && Number.isFinite(path.std)) bStd[to][from] = path.std;
  }

  const psi = Array.from({ length: latentCount }, () => Array(latentCount).fill(0));
  const exogenous = orderedNodes.filter((node) => node.role === "exogenous");
  for (const left of exogenous) {
    for (const right of exogenous) {
      const i = latentIndex.get(left.nodeId)!;
      const j = latentIndex.get(right.nodeId)!;
      psi[i][j] = i === j ? 1 : pearson(latent[i], latent[j]).r;
    }
  }
  for (const node of orderedNodes) {
    if (node.role === "exogenous") continue;
    const index = latentIndex.get(node.nodeId)!;
    psi[index][index] = Math.max(0.02, 1 - clamp(r2[node.nodeId] ?? 0, 0, 0.98));
  }

  const identity = Array.from({ length: latentCount }, (_, i) =>
    Array.from({ length: latentCount }, (_, j) => (i === j ? 1 : 0))
  );
  const structural = identity.map((row, i) => row.map((value, j) => value - bStd[i][j]));
  const structuralInv = invertMatrix(structural);
  if (!structuralInv) return null;
  const latentCov = matMul(matMul(structuralInv, psi), transpose(structuralInv));
  const latentCorr = latentCov.map((row, i) =>
    row.map((value, j) => {
      const denominator = Math.sqrt(Math.max(1e-12, latentCov[i][i] * latentCov[j][j]));
      return value / denominator;
    })
  );

  const loadings: number[] = [];
  const factorOfIndicator: number[] = [];
  let observedOffset = 0;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    const blockObserved = observed.slice(observedOffset, observedOffset + block.cols.length);
    const blockLoadings = block.cols.length > 1 ? commonFactorLoadings(blockObserved) : [1];
    for (const loading of blockLoadings) {
      loadings.push(block.cols.length > 1 ? clamp(Math.abs(loading), 0.3, 0.95) : 1);
      factorOfIndicator.push(blockIndex);
    }
    observedOffset += block.cols.length;
  }

  const observedCount = observed.length;
  const implied = Array.from({ length: observedCount }, () => Array(observedCount).fill(0));
  for (let i = 0; i < observedCount; i++) {
    for (let j = 0; j < observedCount; j++) {
      if (i === j) implied[i][j] = 1;
      else implied[i][j] = loadings[i] * loadings[j] * latentCorr[factorOfIndicator[i]][factorOfIndicator[j]];
    }
  }

  const detSample = determinant(sample);
  const detImplied = determinant(implied);
  const invImplied = invertMatrix(implied);
  if (!(detSample > 1e-12) || !(detImplied > 1e-12) || !invImplied) return null;

  const trace = sample.reduce((total, row, i) => {
    let diagonal = 0;
    for (let j = 0; j < observedCount; j++) diagonal += row[j] * invImplied[j][i];
    return total + diagonal;
  }, 0);
  const discrepancy = Math.max(0, Math.log(detImplied) + trace - Math.log(detSample) - observedCount);
  const chi2 = Math.max(0, (nCases - 1) * discrepancy);

  // برازش روی ماتریس همبستگی انجام می‌شود؛ واریانس‌ها استاندارد و خطاها از ۱-λ² به‌دست می‌آیند.
  // بنابراین فقط مسیرها، کوواریانس بین برون‌زاها و بارهای آزاد در شمار پارامترها قرار می‌گیرند.
  const exogenousCount = exogenous.length;
  const measurementParameters = blocks.reduce(
    (total, block) => total + Math.max(0, block.cols.length - 1),
    0
  );
  const parameterCount =
    activeArrows.length +
    (exogenousCount * Math.max(0, exogenousCount - 1)) / 2 +
    measurementParameters;
  const moments = (observedCount * (observedCount - 1)) / 2;
  const df = Math.max(0, moments - parameterCount);

  const independenceDf = (observedCount * (observedCount - 1)) / 2;
  const independenceChi2 = Math.max(0, (nCases - 1) * -Math.log(detSample));
  const denominator = Math.max(chi2 - df, independenceChi2 - independenceDf, 1e-12);
  const cfi = clamp(1 - Math.max(chi2 - df, 0) / denominator, 0, 1);
  const tli =
    df > 0 && independenceDf > 0 && independenceChi2 / independenceDf !== 1
      ? clamp(
          (independenceChi2 / independenceDf - chi2 / df) /
            (independenceChi2 / independenceDf - 1),
          0,
          1
        )
      : 1;
  const nfi = independenceChi2 > 0 ? clamp((independenceChi2 - chi2) / independenceChi2, 0, 1) : 1;
  const parsimonyRatio = independenceDf > 0 ? clamp(df / independenceDf, 0, 1) : 0;
  const pnfi = clamp(parsimonyRatio * nfi, 0, 1);
  const pcfi = clamp(parsimonyRatio * cfi, 0, 1);
  const ifi =
    independenceChi2 - df > 0
      ? clamp((independenceChi2 - chi2) / (independenceChi2 - df), 0, 1)
      : 1;

  let standardizedResidualSum = 0;
  let gfiResidual = 0;
  let gfiObserved = 0;
  for (let i = 0; i < observedCount; i++) {
    for (let j = 0; j < observedCount; j++) {
      const residual = sample[i][j] - implied[i][j];
      gfiResidual += residual * residual;
      gfiObserved += sample[i][j] * sample[i][j];
      if (j >= i) standardizedResidualSum += residual * residual;
    }
  }
  const srmr = Math.sqrt(standardizedResidualSum / ((observedCount * (observedCount + 1)) / 2));
  const gfi = gfiObserved > 0 ? clamp(1 - gfiResidual / gfiObserved, 0, 1) : NaN;
  const pValue = df > 0 ? chiSquareSurvival(chi2, df) : NaN;
  const chi2df = df > 0 ? chi2 / df : NaN;
  const rmsea = df > 0 ? Math.sqrt(Math.max(chi2 - df, 0) / (df * (nCases - 1))) : 0;
  const rmseaCi = rmseaConfidence90(chi2, df, nCases);

  return {
    valid: true,
    chi2,
    df,
    pValue,
    chi2df,
    cfi,
    tli,
    rmsea,
    rmseaLow: rmseaCi.low,
    rmseaHigh: rmseaCi.high,
    srmr,
    pnfi,
    pcfi,
    ifi,
    gfi,
    message: "برازش بر پایه ماتریس همبستگی شاخص‌های مشاهده‌شده و مدل اندازه‌گیری محاسبه شده است.",
  };
}

export function estimateSem(
  nodes: ModelNode[],
  arrows: ModelArrow[],
  nodeCols: number[][],
  measurementCols?: SemMeasurementColumns
): SemResults {
  const p = nodes.length;
  const ordered = [...nodes]
    .sort((a, b) => ROLE_ORDER_NODE[a.role] - ROLE_ORDER_NODE[b.role])
    .map((n) => n.nodeId);
  const pos = new Map<number, number>(ordered.map((id, i) => [id, i]));
  const active = arrows.filter((a) => a.active);
  const nCases = completeRows(nodeCols);
  const warnings: string[] = [];

  const S = covarianceMatrix(ordered.map((id) => nodeCols[id]));

  const B = Array.from({ length: p }, () => Array(p).fill(0));
  const psi = Array(p).fill(0);
  const pathResults: SemPathResult[] = [];
  const r2: Record<number, number> = {};
  const dw: Record<number, number> = {};
  const vifs: Record<number, number[]> = {};

  for (const id of ordered) {
    const node = nodes.find((n) => n.nodeId === id)!;
    if (node.role === "exogenous") continue;
    const preds = active.filter((a) => a.toNode === id);
    if (!preds.length) {
      psi[pos.get(id)!] = sampleVariance(nodeCols[id]) || 0;
      r2[id] = 0;
      dw[id] = NaN;
      vifs[id] = [];
      warnings.push(`گره «${node.label}» هیچ مسیر ورودی فعالی ندارد.`);
      continue;
    }
    const X = preds.map((a) => nodeCols[a.fromNode]);
    const o = ols(X, nodeCols[id]);
    const sy = sampleStd(nodeCols[id]);
    preds.forEach((a, j) => {
      const sx = sampleStd(X[j]);
      const std = Number.isFinite(o.coefs[j + 1]) && sx > 0 && sy > 0 ? (o.coefs[j + 1] * sx) / sy : NaN;
      B[pos.get(id)!][pos.get(a.fromNode)!] = o.coefs[j + 1];
      pathResults.push({
        from: a.fromNode,
        to: id,
        b: o.coefs[j + 1],
        se: o.se[j + 1],
        t: o.t[j + 1],
        p: o.p[j + 1],
        std,
      });
    });
    psi[pos.get(id)!] = o.ssr / o.n;
    r2[id] = o.r2;
    dw[id] = o.dw;
    vifs[id] = vifForPredictors(X);
  }

  const exogNodes = ordered.filter((id) => nodes.find((n) => n.nodeId === id)!.role === "exogenous");
  const q = exogNodes.length;

  const Psi = Array.from({ length: p }, () => Array(p).fill(0));
  exogNodes.forEach((a) => exogNodes.forEach((b) => (Psi[pos.get(a)!][pos.get(b)!] = S[pos.get(a)!][pos.get(b)!])));
  ordered.forEach((id) => {
    if (nodes.find((n) => n.nodeId === id)!.role !== "exogenous") Psi[pos.get(id)!][pos.get(id)!] = psi[pos.get(id)!];
  });

  let fit: SemFit;
  const A = Array.from({ length: p }, (_, i) =>
    Array.from({ length: p }, (_, j) => (i === j ? 1 : 0) - B[i][j])
  );
  const Ainv = invertMatrix(A);
  const detS = determinant(S);

  if (!Ainv || !Number.isFinite(detS) || detS <= 1e-12) {
    fit = {
      valid: false,
      chi2: NaN,
      df: 0,
      pValue: NaN,
      chi2df: NaN,
      cfi: NaN,
      tli: NaN,
      rmsea: NaN,
      rmseaLow: NaN,
      rmseaHigh: NaN,
      srmr: NaN,
      pnfi: NaN,
      pcfi: NaN,
      ifi: NaN,
      gfi: NaN,
      message: "برازش مدل قابل محاسبه نیست (ماتریس کوواریانس تکین است)."
    };
  } else {
    const Sigma = matMul(matMul(Ainv, Psi), transpose(Ainv));
    const detSig = determinant(Sigma);
    const invSig = invertMatrix(Sigma);
    if (!Number.isFinite(detSig) || detSig <= 1e-12 || !invSig) {
      fit = {
        valid: false,
        chi2: NaN,
        df: 0,
        pValue: NaN,
        chi2df: NaN,
        cfi: NaN,
        tli: NaN,
        rmsea: NaN,
        rmseaLow: NaN,
        rmseaHigh: NaN,
        srmr: NaN,
        pnfi: NaN,
        pcfi: NaN,
        ifi: NaN,
        gfi: NaN,
        message: "برازش مدل قابل محاسبه نیست (ماتریس کوواریانس مدل تکین است)."
      };
    } else {
      const logDetS = Math.log(detS);
      const logDetSig = Math.log(detSig);
      const traceSInv = S.reduce((s, row, i) => {
        let acc = 0;
        for (let j = 0; j < p; j++) acc += row[j] * invSig![j][i];
        return s + acc;
      }, 0);
      const F = logDetSig + traceSInv - logDetS - p;
      const chi2 = Math.max(0, (nCases - 1) * F);
      const npar = active.length + ordered.filter((id) => nodes.find((n) => n.nodeId === id)!.role !== "exogenous").length + (q * (q + 1)) / 2;
      const df = Math.max(0, (p * (p + 1)) / 2 - npar);

      const D = S.map((row, i) => row.map((_, j) => (i === j ? row[i] : 0)));
      const invD = D.map((row, i) => row.map((v, j) => (i === j && v > 0 ? 1 / v : 0)));
      const Fi = Math.log(determinant(D)) + S.reduce((s, row, i) => {
        let acc = 0;
        for (let j = 0; j < p; j++) acc += row[j] * invD[j][i];
        return s + acc;
      }, 0) - logDetS - p;
      const chi2i = Math.max(0, (nCases - 1) * Fi);
      const dfi = (p * (p - 1)) / 2;

      const denom = Math.max(chi2 - df, chi2i - dfi, 0);
      const cfi = denom > 0 ? 1 - Math.max(chi2 - df, 0) / denom : 1;
      const tli = dfi > 0 && df > 0 && chi2i / dfi - 1 !== 0 ? (chi2i / dfi - chi2 / df) / (chi2i / dfi - 1) : 1;
      const rmsea = df > 0 ? Math.sqrt(Math.max(chi2 - df, 0) / (df * (nCases - 1))) : 0;

      let srSum = 0;
      for (let i = 0; i < p; i++) {
        for (let j = i; j < p; j++) {
          const e = (S[i][j] - Sigma[i][j]) / Math.sqrt(S[i][i] * S[j][j]);
          srSum += e * e;
        }
      }
      const srmr = Math.sqrt(srSum / ((p * (p + 1)) / 2));
      const nfi = chi2i > 0 ? clamp((chi2i - chi2) / chi2i, 0, 1) : 1;
      const parsimonyRatio = dfi > 0 ? clamp(df / dfi, 0, 1) : 0;
      const pValue = df > 0 ? chiSquareSurvival(chi2, df) : NaN;
      const rmseaCi = rmseaConfidence90(chi2, df, nCases);
      let gfiResidual = 0;
      let gfiObserved = 0;
      for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
          const residual = S[i][j] - Sigma[i][j];
          gfiResidual += residual * residual;
          gfiObserved += S[i][j] * S[i][j];
        }
      }

      fit = {
        valid: true,
        chi2,
        df,
        pValue,
        chi2df: df > 0 ? chi2 / df : NaN,
        cfi: clamp(cfi, 0, 1),
        tli: clamp(tli, 0, 1),
        rmsea,
        rmseaLow: rmseaCi.low,
        rmseaHigh: rmseaCi.high,
        srmr,
        pnfi: clamp(parsimonyRatio * nfi, 0, 1),
        pcfi: clamp(parsimonyRatio * cfi, 0, 1),
        ifi: chi2i - df > 0 ? clamp((chi2i - chi2) / (chi2i - df), 0, 1) : 1,
        gfi: gfiObserved > 0 ? clamp(1 - gfiResidual / gfiObserved, 0, 1) : NaN,
      };
    }
  }

  if (measurementCols) {
    const measuredFit = measurementModelFit(nodes, active, nodeCols, measurementCols, pathResults, r2);
    if (measuredFit) fit = measuredFit;
  }
  if (fit.valid && fit.df === 0) {
    warnings.push("مدل اشباع‌شده است؛ شاخص‌های برازش کامل (CFI=1 و RMSEA=0) محاسبه می‌شوند.");
  }

  // اثرات در سطح متغیر (مستقیم / غیرمستقیم / کل)
  const exogVars = [...new Set(nodes.filter((n) => n.role === "exogenous").map((n) => n.varId))];
  const outVars = [...new Set(nodes.filter((n) => n.role === "outcome").map((n) => n.varId))];
  const effects: SemEffect[] = [];
  for (const e of exogVars) {
    for (const c of outVars) {
      let direct = 0;
      let indirect = 0;
      for (const y of nodes.filter((n) => n.varId === c)) {
        for (const x of nodes.filter((n) => n.varId === e)) {
          direct += B[pos.get(y.nodeId)!][pos.get(x.nodeId)!];
        }
      }
      for (const m of nodes.filter((n) => n.role === "mediator")) {
        for (const x of nodes.filter((n) => n.varId === e)) {
          for (const y of nodes.filter((n) => n.varId === c)) {
            indirect += B[pos.get(m.nodeId)!][pos.get(x.nodeId)!] * B[pos.get(y.nodeId)!][pos.get(m.nodeId)!];
          }
        }
      }
      effects.push({ fromVar: e, toVar: c, direct, indirect, total: direct + indirect });
    }
  }

  return { ordered, paths: pathResults, r2, dw, vifs, fit, effects, warnings };
}

// ---------- بوت‌استرپ اثر غیرمستقیم (مسیرهای جداگانه + کل) ----------

export type IndirectBootRow = {
  fromVar: number;
  toVar: number;
  /** متغیر میانجی این مسیر خاص؛ null یعنی «کل اثر غیرمستقیم» */
  viaVar: number | null;
  indirect: number;
  lo: number;
  hi: number;
  p: number;
  sig: boolean;
};

export function bootstrapIndirectEffects(
  nodes: ModelNode[],
  arrows: ModelArrow[],
  nodeCols: number[][],
  nBoot: number
): IndirectBootRow[] {
  const n = nodeCols[0]?.length ?? 0;
  const fullRows: number[][] = [];
  for (let i = 0; i < n; i++) {
    const r = nodeCols.map((c) => c[i]);
    if (r.every(Number.isFinite)) fullRows.push(r);
  }
  const nn = fullRows.length;
  if (nn < 10) return [];
  const active = arrows.filter((a) => a.active);
  const medVars = [...new Set(nodes.filter((x) => x.role === "mediator").map((x) => x.varId))];
  const exogVars = [...new Set(nodes.filter((x) => x.role === "exogenous").map((x) => x.varId))];
  const outVars = [...new Set(nodes.filter((x) => x.role === "outcome").map((x) => x.varId))];
  const results: IndirectBootRow[] = [];

  const summarize = (effects: number[]): { lo: number; hi: number; p: number } => {
    effects.sort((a, b) => a - b);
    const count = effects.length;
    if (!count) return { lo: NaN, hi: NaN, p: NaN };
    const lo = effects[Math.max(0, Math.floor((count - 1) * 0.025))];
    const hi = effects[Math.min(count - 1, Math.ceil((count - 1) * 0.975))];
    const p = clamp(
      2 * Math.min(
        effects.filter((x) => x <= 0).length / count,
        effects.filter((x) => x >= 0).length / count
      ),
      0,
      1
    );
    return { lo, hi, p };
  };

  for (const e of exogVars) {
    for (const c of outVars) {
      const meds = medVars.filter(
        (m) =>
          active.some((a) => a.fromVar === e && a.toVar === m) &&
          active.some((a) => a.fromVar === m && a.toVar === c)
      );
      if (!meds.length) continue;

      const xNodes = nodes.filter((x) => x.varId === e);
      const yNodes = nodes.filter((x) => x.varId === c);

      for (const m of meds) {
        const mNodes = nodes.filter((x) => x.varId === m);
        const effects: number[] = [];
        for (let b = 0; b < nBoot; b++) {
          const idx = Array.from({ length: nn }, () => Math.floor(Math.random() * nn));
          const boot = (v: number) => idx.map((k) => fullRows[k][v]);
          let sum = 0;
          for (const mNode of mNodes) {
            const xBoot = xNodes.map((x) => boot(x.nodeId));
            const mBoot = boot(mNode.nodeId);
            const aCoefs = ols(xBoot, mBoot).coefs;
            const mSd = sampleStd(mBoot);
            for (const yNode of yNodes) {
              const yBoot = boot(yNode.nodeId);
              const bCoefs = ols([...xBoot, mBoot], yBoot).coefs;
              const bCoef = bCoefs[bCoefs.length - 1] ?? 0;
              const ySd = sampleStd(yBoot);
              const bStd = mSd > 0 && ySd > 0 ? (bCoef * mSd) / ySd : 0;
              for (let i = 1; i < aCoefs.length; i++) {
                const xSd = sampleStd(xBoot[i - 1]);
                const aStd = xSd > 0 && mSd > 0 ? (aCoefs[i] * xSd) / mSd : 0;
                sum += aStd * bStd;
              }
            }
          }
          effects.push(sum);
        }
        const { lo, hi, p } = summarize(effects);
        results.push({ fromVar: e, toVar: c, viaVar: m, indirect: mean(effects), lo, hi, p, sig: lo > 0 || hi < 0 });
      }

      if (meds.length > 1) {
        const effects: number[] = [];
        for (let b = 0; b < nBoot; b++) {
          const idx = Array.from({ length: nn }, () => Math.floor(Math.random() * nn));
          const boot = (v: number) => idx.map((k) => fullRows[k][v]);
          let sum = 0;
          for (const m of meds) {
            const mNodes = nodes.filter((x) => x.varId === m);
            for (const mNode of mNodes) {
              const xBoot = xNodes.map((x) => boot(x.nodeId));
              const mBoot = boot(mNode.nodeId);
              const aCoefs = ols(xBoot, mBoot).coefs;
              const mSd = sampleStd(mBoot);
              for (const yNode of yNodes) {
                const yBoot = boot(yNode.nodeId);
                const bCoefs = ols([...xBoot, mBoot], yBoot).coefs;
                const bCoef = bCoefs[bCoefs.length - 1] ?? 0;
                const ySd = sampleStd(yBoot);
                const bStd = mSd > 0 && ySd > 0 ? (bCoef * mSd) / ySd : 0;
                for (let i = 1; i < aCoefs.length; i++) {
                  const xSd = sampleStd(xBoot[i - 1]);
                  const aStd = xSd > 0 && mSd > 0 ? (aCoefs[i] * xSd) / mSd : 0;
                  sum += aStd * bStd;
                }
              }
            }
          }
          effects.push(sum);
        }
        const { lo, hi, p } = summarize(effects);
        results.push({ fromVar: e, toVar: c, viaVar: null, indirect: mean(effects), lo, hi, p, sig: lo > 0 || hi < 0 });
      }
    }
  }
  return results;
}
