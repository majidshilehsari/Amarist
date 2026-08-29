// ============================================================
// توابع آماری — آماریست
// برگرفته از مدل کاربر: تولید سه لیست ۴۵تایی با سه گروه ۱۵نفره
// (مقایسه اثربخشی دو درمان — تحلیل واریانس با اندازه‌گیری مکرر)
// ============================================================

export const GROUPS = 3;
export const GROUP_SIZE = 15;

/** ساختار داده: [لیست][گروه][فرد] */
export type Lists = number[][][];

// ---------- ابزارهای پایه ----------

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, x) => s + x, 0) / values.length;
}

export function variancePopulation(values: number[]): number {
  if (!values.length) return 0;
  const m = mean(values);
  return values.reduce((s, x) => s + (x - m) ** 2, 0) / values.length;
}

export function stdPopulation(values: number[]): number {
  return Math.sqrt(variancePopulation(values));
}

export function sampleVariance(values: number[]): number {
  if (values.length < 2) return NaN;
  const m = mean(values);
  return values.reduce((s, x) => s + (x - m) ** 2, 0) / (values.length - 1);
}

export function sampleStd(values: number[]): number {
  return Math.sqrt(sampleVariance(values));
}

export function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function shuffle<T>(array: T[]): T[] {
  const arr = array.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function shuffleInPlace<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

export function fmt(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return "-";
  return String(Number(value.toFixed(digits)));
}

export function fmtP(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value < 0.001) return "<0.001";
  return fmt(value, 3);
}

// ---------- توزیع‌های آماری ----------

export function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return sign * y;
}

export function normalCDF(z: number): number {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

export function inverseNormalCDF(p: number): number {
  if (p <= 0 || p >= 1) return NaN;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const plow = 0.02425;
  const phigh = 1 - plow;
  let q: number;
  if (p < plow) {
    q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > phigh) {
    q = Math.sqrt(-2 * Math.log(1 - p));
    return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  q = p - 0.5;
  const r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
    (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

export function polyEval(coeffs: number[], x: number): number {
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = result * x + coeffs[i];
  }
  return result;
}

export function logGamma(z: number): number {
  const coeffs = [
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z);
  }
  z -= 1;
  let x = 0.99999999999980993;
  for (let i = 0; i < coeffs.length; i++) {
    x += coeffs[i] / (z + i + 1);
  }
  const t = z + coeffs.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function betacf(x: number, a: number, b: number): number {
  const MAX_ITER = 200;
  const EPS = 3e-12;
  const FPMIN = 1e-30;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}

export function regularizedBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  );
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(x, a, b)) / a;
  return 1 - (bt * betacf(1 - x, b, a)) / b;
}

export function fSurvival(fValue: number, df1: number, df2: number): number {
  if (!Number.isFinite(fValue)) return fValue === Infinity ? 0 : NaN;
  if (fValue < 0) return 1;
  const x = (df1 * fValue) / (df1 * fValue + df2);
  return clamp(1 - regularizedBeta(x, df1 / 2, df2 / 2), 0, 1);
}

export function gammaPSeries(a: number, x: number): number {
  const ITMAX = 200;
  const EPS = 1e-12;
  const gln = logGamma(a);
  if (x <= 0) return 0;
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 1; n <= ITMAX; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * EPS) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - gln);
}

export function gammaQContinuedFraction(a: number, x: number): number {
  const ITMAX = 200;
  const EPS = 1e-12;
  const FPMIN = 1e-30;
  const gln = logGamma(a);
  let b = x + 1 - a;
  let c = 1 / FPMIN;
  let d = 1 / Math.max(Math.abs(b), FPMIN);
  if (b < 0 && Math.abs(b) < FPMIN) d = -1 / FPMIN;
  let h = d;
  for (let i = 1; i <= ITMAX; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = b + an / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return Math.exp(-x + a * Math.log(x) - gln) * h;
}

export function regularizedGammaQ(a: number, x: number): number {
  if (x < 0 || a <= 0) return NaN;
  if (x === 0) return 1;
  if (x < a + 1) return clamp(1 - gammaPSeries(a, x), 0, 1);
  return clamp(gammaQContinuedFraction(a, x), 0, 1);
}

export function chiSquareSurvival(x: number, df: number): number {
  if (!Number.isFinite(x)) return NaN;
  if (x < 0) return 1;
  return regularizedGammaQ(df / 2, x / 2);
}

// ---------- آزمون نرمال بودن ----------

export function shapiroWilkTest(
  values: number[]
): { valid: boolean; w: number; p: number; message: string } {
  const x = values.slice().sort((a, b) => a - b);
  const n = x.length;
  if (n < 3) return { valid: false, w: NaN, p: NaN, message: "n کمتر از ۳ است." };
  const m = mean(x);
  const denom = x.reduce((s, v) => s + (v - m) ** 2, 0);
  if (denom <= 0) return { valid: false, w: NaN, p: NaN, message: "همه مقادیر برابرند." };

  const c1 = [0, 0.221157, -0.147981, -2.07119, 4.434685, -2.706056];
  const c2 = [0, 0.042981, -0.293762, -1.752461, 5.682633, -3.582633];
  const c3 = [0.544, -0.39978, 0.025054, -0.0006714];
  const c4 = [1.3822, -0.77857, 0.062767, -0.0020322];
  const c5 = [-1.5861, -0.31082, -0.083751, 0.0038915];
  const c6 = [-0.4803, -0.082676, 0.0030302];
  const g = [-2.273, 0.459];

  const n2 = Math.floor(n / 2);
  const a: number[] = [];
  for (let i = 1; i <= n2; i++) {
    a.push(inverseNormalCDF((i - 0.375) / (n + 0.25)));
  }
  const summ2 = 2 * a.reduce((s, v) => s + v * v, 0);
  const ssumm2 = Math.sqrt(summ2);
  const rsn = 1 / Math.sqrt(n);
  const a1 = polyEval(c1, rsn) - a[0] / ssumm2;
  let startIndex: number;
  let fac: number;
  if (n > 5) {
    const a2 = polyEval(c2, rsn) - a[1] / ssumm2;
    fac = Math.sqrt((summ2 - 2 * a[0] * a[0] - 2 * a[1] * a[1]) / (1 - 2 * a1 * a1 - 2 * a2 * a2));
    a[0] = a1;
    a[1] = a2;
    startIndex = 2;
  } else {
    fac = Math.sqrt((summ2 - 2 * a[0] * a[0]) / (1 - 2 * a1 * a1));
    a[0] = a1;
    startIndex = 1;
  }
  for (let i = startIndex; i < n2; i++) {
    a[i] = -a[i] / fac;
  }
  let numerator = 0;
  for (let i = 0; i < n2; i++) {
    numerator += a[i] * (x[n - 1 - i] - x[i]);
  }
  const w = clamp((numerator * numerator) / denom, 0, 1);

  let pValue: number;
  if (n === 3) {
    const pExact = (6 / Math.PI) * (Math.asin(Math.sqrt(w)) - Math.asin(Math.sqrt(0.75)));
    pValue = clamp(pExact, 0, 1);
  } else {
    const y0 = Math.log(Math.max(1e-16, 1 - w));
    let y = y0;
    let mu: number;
    let sigma: number;
    if (n <= 11) {
      const gamma = polyEval(g, n);
      if (y >= gamma) {
        pValue = 0;
      } else {
        y = -Math.log(gamma - y);
        mu = polyEval(c3, n);
        sigma = Math.exp(polyEval(c4, n));
        pValue = 1 - normalCDF((y - mu) / sigma);
      }
    } else {
      const xx = Math.log(n);
      mu = polyEval(c5, xx);
      sigma = Math.exp(polyEval(c6, xx));
      pValue = 1 - normalCDF((y - mu) / sigma);
    }
  }
  return { valid: true, w, p: clamp(pValue, 0, 1), message: "" };
}

export function ksStatisticFittedNormal(values: number[]): number {
  const x = values.slice().sort((a, b) => a - b);
  const n = x.length;
  const m = mean(x);
  const sd = sampleStd(x);
  if (!Number.isFinite(sd) || sd <= 0) return NaN;
  let d = 0;
  for (let i = 0; i < n; i++) {
    const f = normalCDF((x[i] - m) / sd);
    const dPlus = (i + 1) / n - f;
    const dMinus = f - i / n;
    d = Math.max(d, Math.abs(dPlus), Math.abs(dMinus));
  }
  return d;
}

export function mulberry32(seed: number): () => number {
  let t = seed;
  return function () {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), t | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomNormal(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const lillieforsCache: Record<number, number[]> = {};

export function getLillieforsDistribution(n: number): number[] {
  if (lillieforsCache[n]) return lillieforsCache[n];
  const simulations = 5000;
  const rng = mulberry32(987654321 + n * 1009);
  const dist: number[] = [];
  for (let s = 0; s < simulations; s++) {
    const sample: number[] = [];
    for (let i = 0; i < n; i++) sample.push(randomNormal(rng));
    dist.push(ksStatisticFittedNormal(sample));
  }
  dist.sort((a, b) => a - b);
  lillieforsCache[n] = dist;
  return dist;
}

export function lowerBound(array: number[], value: number): number {
  let lo = 0;
  let hi = array.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (array[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function ksNormalityTest(
  values: number[]
): { valid: boolean; d: number; p: number; message: string } {
  const n = values.length;
  const d = ksStatisticFittedNormal(values);
  if (!Number.isFinite(d)) {
    return { valid: false, d: NaN, p: NaN, message: "انحراف معیار صفر است." };
  }
  const dist = getLillieforsDistribution(n);
  const idx = lowerBound(dist, d);
  const pValue = (dist.length - idx + 1) / (dist.length + 1);
  return { valid: true, d, p: clamp(pValue, 0, 1), message: "" };
}

// ---------- آزمون‌های پارامتری ----------

export function leveneTest(
  groups: number[][]
): { valid: boolean; f: number; df1: number; df2: number; p: number; message: string } {
  const k = groups.length;
  const zGroups = groups.map((group) => {
    const center = mean(group);
    return group.map((value) => Math.abs(value - center));
  });
  const allZ = zGroups.flat();
  const overallMean = mean(allZ);
  const ssBetween = zGroups.reduce(
    (s, group) => s + group.length * (mean(group) - overallMean) ** 2,
    0
  );
  const ssWithin = zGroups.reduce((s, group) => {
    const gm = mean(group);
    return s + group.reduce((inner, value) => inner + (value - gm) ** 2, 0);
  }, 0);
  const n = allZ.length;
  const df1 = k - 1;
  const df2 = n - k;
  if (df2 <= 0) return { valid: false, f: NaN, df1, df2, p: NaN, message: "درجه آزادی کافی نیست." };
  if (ssWithin <= 1e-12) {
    const f = ssBetween <= 1e-12 ? 0 : Infinity;
    return { valid: true, f, df1, df2, p: f === 0 ? 1 : 0, message: "" };
  }
  const f = ssBetween / df1 / (ssWithin / df2);
  return { valid: true, f, df1, df2, p: fSurvival(f, df1, df2), message: "" };
}

// ---------- ماتریس ----------

export function covarianceMatrix(rows: number[][]): number[][] {
  const n = rows.length;
  const p = rows[0].length;
  const means = Array.from({ length: p }, (_, j) => mean(rows.map((row) => row[j])));
  const cov = Array.from({ length: p }, () => Array(p).fill(0) as number[]);
  for (const row of rows) {
    for (let i = 0; i < p; i++) {
      for (let j = 0; j < p; j++) {
        cov[i][j] += (row[i] - means[i]) * (row[j] - means[j]);
      }
    }
  }
  for (let i = 0; i < p; i++) {
    for (let j = 0; j < p; j++) cov[i][j] /= n - 1;
  }
  return cov;
}

export function determinant(matrix: number[][]): number {
  const n = matrix.length;
  const a = matrix.map((row) => row.slice());
  let det = 1;
  let sign = 1;
  for (let i = 0; i < n; i++) {
    let pivot = i;
    for (let r = i + 1; r < n; r++) {
      if (Math.abs(a[r][i]) > Math.abs(a[pivot][i])) pivot = r;
    }
    if (Math.abs(a[pivot][i]) < 1e-12) return 0;
    if (pivot !== i) {
      [a[pivot], a[i]] = [a[i], a[pivot]];
      sign *= -1;
    }
    const pivotValue = a[i][i];
    det *= pivotValue;
    for (let r = i + 1; r < n; r++) {
      const factor = a[r][i] / pivotValue;
      for (let c = i; c < n; c++) a[r][c] -= factor * a[i][c];
    }
  }
  return det * sign;
}

export function transpose(matrix: number[][]): number[][] {
  return matrix[0].map((_, c) => matrix.map((row) => row[c]));
}

export function matMul(a: number[][], b: number[][]): number[][] {
  const rows = a.length;
  const cols = b[0].length;
  const inner = b.length;
  const out = Array.from({ length: rows }, () => Array(cols).fill(0) as number[]);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      for (let k = 0; k < inner; k++) out[i][j] += a[i][k] * b[k][j];
    }
  }
  return out;
}

export function trace(matrix: number[][]): number {
  return matrix.reduce((s, row, i) => s + row[i], 0);
}

// ---------- باکس M و موچلی ----------

function covarianceInfoForRepeatedMeasures(lists: Lists) {
  const covMatrices: number[][][] = [];
  const ns: number[] = [];
  for (let g = 0; g < GROUPS; g++) {
    const rows: number[][] = [];
    for (let i = 0; i < GROUP_SIZE; i++) {
      rows.push(lists.map((list) => list[g][i]));
    }
    ns.push(rows.length);
    covMatrices.push(covarianceMatrix(rows));
  }
  const pDim = lists.length;
  const denominator = ns.reduce((s, n) => s + n - 1, 0);
  const pooled = Array.from({ length: pDim }, () => Array(pDim).fill(0) as number[]);
  covMatrices.forEach((cov, index) => {
    const weight = ns[index] - 1;
    for (let i = 0; i < pDim; i++) {
      for (let j = 0; j < pDim; j++) pooled[i][j] += weight * cov[i][j];
    }
  });
  for (let i = 0; i < pDim; i++) {
    for (let j = 0; j < pDim; j++) pooled[i][j] /= denominator;
  }
  return {
    covMatrices,
    ns,
    pooled,
    pDim,
    totalN: ns.reduce((s, n) => s + n, 0),
    groups: ns.length,
    pooledDf: denominator,
  };
}

export function boxMTest(
  lists: Lists
): { valid: boolean; m: number; chi: number; df: number; p: number; message: string } {
  const info = covarianceInfoForRepeatedMeasures(lists);
  const dets = info.covMatrices.map(determinant);
  const detPooled = determinant(info.pooled);
  if (dets.some((det) => det <= 1e-12) || detPooled <= 1e-12) {
    return {
      valid: false,
      m: NaN,
      chi: NaN,
      df: NaN,
      p: NaN,
      message: "حداقل یکی از ماتریس‌های کوواریانس تکین یا نزدیک به تکین است.",
    };
  }
  let m = info.pooledDf * Math.log(detPooled);
  for (let i = 0; i < info.groups; i++) {
    m -= (info.ns[i] - 1) * Math.log(dets[i]);
  }
  if (m < 0 && Math.abs(m) < 1e-9) m = 0;
  const sumInv = info.ns.reduce((s, n) => s + 1 / (n - 1), 0);
  const correction =
    ((2 * info.pDim * info.pDim + 3 * info.pDim - 1) / (6 * (info.pDim + 1) * (info.groups - 1))) *
    (sumInv - 1 / info.pooledDf);
  const chi = Math.max(0, m * (1 - correction));
  const df = (info.groups - 1) * info.pDim * (info.pDim + 1) / 2;
  return { valid: true, m, chi, df, p: chiSquareSurvival(chi, df), message: "p بر اساس تقریب کای‌دو محاسبه شده است." };
}

export function mauchlyTest(
  lists: Lists
): { valid: boolean; w: number; chi: number; df: number; p: number; message: string } {
  const info = covarianceInfoForRepeatedMeasures(lists);
  const levels = lists.length;
  if (levels < 3) {
    return { valid: false, w: NaN, chi: NaN, df: NaN, p: NaN, message: "حداقل ۳ سطح تکرارشده لازم است." };
  }
  const contrast = [
    [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0],
    [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)],
  ];
  const contrastCov = matMul(matMul(contrast, info.pooled), transpose(contrast));
  const detA = determinant(contrastCov);
  const trA = trace(contrastCov);
  if (detA <= 1e-12 || trA <= 1e-12) {
    return {
      valid: false,
      w: NaN,
      chi: NaN,
      df: NaN,
      p: NaN,
      message: "ماتریس کوواریانس تضادها تکین یا نزدیک به تکین است.",
    };
  }
  const w = clamp(detA / Math.pow(trA / (levels - 1), levels - 1), 1e-12, 1);
  const df = (levels * (levels - 1)) / 2 - 1;
  const correction = (2 * levels * levels + levels + 2) / (6 * levels);
  const chi = Math.max(0, -(info.pooledDf - correction) * Math.log(w));
  return { valid: true, w, chi, df, p: chiSquareSurvival(chi, df), message: "p بر اساس تقریب کای‌دو محاسبه شده است." };
}

// ---------- میکس‌آنووا ----------

export type MixedAnovaResult = {
  time: { ss: number; df: number; ms: number; f: number; p: number; eta: number };
  timeGroup: { ss: number; df: number; ms: number; f: number; p: number; eta: number };
  errorTime: { ss: number; df: number; ms: number };
  group: { ss: number; df: number; ms: number; f: number; p: number; eta: number };
};

export function mixedAnovaResults(lists: Lists): MixedAnovaResult {
  const groupCount = GROUPS;
  const timeCount = lists.length;
  const nPerGroup = GROUP_SIZE;
  const totalSubjects = groupCount * nPerGroup;

  const data = Array.from({ length: groupCount }, (_, g) =>
    Array.from({ length: nPerGroup }, (_, s) =>
      Array.from({ length: timeCount }, (_, t) => lists[t][g][s])
    )
  );

  const allValues: number[] = [];
  for (let g = 0; g < groupCount; g++) {
    for (let s = 0; s < nPerGroup; s++) {
      for (let t = 0; t < timeCount; t++) allValues.push(data[g][s][t]);
    }
  }
  const grandMean = mean(allValues);

  const subjectMeans = Array.from({ length: groupCount }, (_, g) =>
    Array.from({ length: nPerGroup }, (_, s) => mean(data[g][s]))
  );
  const groupMeans = Array.from({ length: groupCount }, (_, g) => {
    const values: number[] = [];
    for (let s = 0; s < nPerGroup; s++) for (let t = 0; t < timeCount; t++) values.push(data[g][s][t]);
    return mean(values);
  });
  const timeMeans = Array.from({ length: timeCount }, (_, t) => {
    const values: number[] = [];
    for (let g = 0; g < groupCount; g++) for (let s = 0; s < nPerGroup; s++) values.push(data[g][s][t]);
    return mean(values);
  });
  const cellMeans = Array.from({ length: groupCount }, (_, g) =>
    Array.from({ length: timeCount }, (_, t) => mean(data[g].map((subject) => subject[t])))
  );

  const ssGroup = nPerGroup * timeCount * groupMeans.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  let ssSubjectsWithinGroup = 0;
  for (let g = 0; g < groupCount; g++) {
    for (let s = 0; s < nPerGroup; s++) {
      ssSubjectsWithinGroup += timeCount * (subjectMeans[g][s] - groupMeans[g]) ** 2;
    }
  }
  const ssTime = totalSubjects * timeMeans.reduce((s, m) => s + (m - grandMean) ** 2, 0);
  let ssTimeGroup = 0;
  for (let g = 0; g < groupCount; g++) {
    for (let t = 0; t < timeCount; t++) {
      ssTimeGroup += nPerGroup * (cellMeans[g][t] - groupMeans[g] - timeMeans[t] + grandMean) ** 2;
    }
  }
  let ssWithinSubjects = 0;
  for (let g = 0; g < groupCount; g++) {
    for (let s = 0; s < nPerGroup; s++) {
      for (let t = 0; t < timeCount; t++) {
        ssWithinSubjects += (data[g][s][t] - subjectMeans[g][s]) ** 2;
      }
    }
  }
  let ssErrorTime = ssWithinSubjects - ssTime - ssTimeGroup;
  if (ssErrorTime < 0 && Math.abs(ssErrorTime) < 1e-8) ssErrorTime = 0;

  const dfGroup = groupCount - 1;
  const dfSubjectsWithinGroup = totalSubjects - groupCount;
  const dfTime = timeCount - 1;
  const dfTimeGroup = (timeCount - 1) * (groupCount - 1);
  const dfErrorTime = (totalSubjects - groupCount) * (timeCount - 1);

  const msGroup = ssGroup / dfGroup;
  const msSubjectsWithinGroup = ssSubjectsWithinGroup / dfSubjectsWithinGroup;
  const msTime = ssTime / dfTime;
  const msTimeGroup = ssTimeGroup / dfTimeGroup;
  const msErrorTime = ssErrorTime / dfErrorTime;

  const fTime = msErrorTime > 0 ? msTime / msErrorTime : Infinity;
  const fTimeGroup = msErrorTime > 0 ? msTimeGroup / msErrorTime : Infinity;
  const fGroup = msSubjectsWithinGroup > 0 ? msGroup / msSubjectsWithinGroup : Infinity;

  return {
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
    errorTime: { ss: ssErrorTime, df: dfErrorTime, ms: msErrorTime },
    group: {
      ss: ssGroup,
      df: dfGroup,
      ms: msGroup,
      f: fGroup,
      p: fSurvival(fGroup, dfGroup, dfSubjectsWithinGroup),
      eta: ssGroup / (ssGroup + ssSubjectsWithinGroup),
    },
  };
}

// ---------- بن‌فرونی زوجی ----------

export function pairedBonferroniComparison(
  lists: Lists,
  groupIndex: number,
  iList: number,
  jList: number
): { meanDiff: number; sdDiff: number; p: number } {
  const diffs: number[] = [];
  for (let i = 0; i < GROUP_SIZE; i++) {
    diffs.push(lists[iList][groupIndex][i] - lists[jList][groupIndex][i]);
  }
  const meanDiff = mean(diffs);
  const sdDiff = sampleStd(diffs);
  const se = sdDiff / Math.sqrt(GROUP_SIZE);
  let pRaw: number;
  if (!Number.isFinite(se) || se <= 1e-12) {
    pRaw = Math.abs(meanDiff) <= 1e-12 ? 1 : 0;
  } else {
    const tValue = meanDiff / se;
    pRaw = fSurvival(tValue * tValue, 1, GROUP_SIZE - 1);
  }
  const pBonferroni = clamp(pRaw * 3, 0, 1);
  return { meanDiff, sdDiff, p: pBonferroni };
}
