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
  chi2df: number;
  cfi: number;
  tli: number;
  rmsea: number;
  srmr: number;
  message?: string;
};

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

export function estimateSem(nodes: ModelNode[], arrows: ModelArrow[], nodeCols: number[][]): SemResults {
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
      chi2df: NaN,
      cfi: NaN,
      tli: NaN,
      rmsea: NaN,
      srmr: NaN,
      message: "برازش مدل قابل محاسبه نیست (ماتریس کوواریانس تکین است).",
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
        chi2df: NaN,
        cfi: NaN,
        tli: NaN,
        rmsea: NaN,
        srmr: NaN,
        message: "برازش مدل قابل محاسبه نیست (ماتریس کوواریانس مدل تکین است).",
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

      fit = {
        valid: true,
        chi2,
        df,
        chi2df: df > 0 ? chi2 / df : NaN,
        cfi: clamp(cfi, 0, 1),
        tli: clamp(tli, 0, 1),
        rmsea,
        srmr,
      };
      if (df === 0) {
        warnings.push("مدل اشباع‌شده است؛ شاخص‌های برازش کامل (CFI=1 و RMSEA=0) محاسبه می‌شوند.");
      }
    }
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
    const lo = effects[Math.max(0, Math.floor(nn * 0.025))];
    const hi = effects[Math.min(nn - 1, Math.floor(nn * 0.975))];
    const p = clamp(
      2 * Math.min(
        effects.filter((x) => x <= 0).length / nn,
        effects.filter((x) => x >= 0).length / nn
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
            const aCoefs = ols(xNodes.map((x) => boot(x.nodeId)), boot(mNode.nodeId)).coefs;
            for (const yNode of yNodes) {
              const bCoefs = ols([...xNodes.map((x) => boot(x.nodeId)), boot(mNode.nodeId)], boot(yNode.nodeId)).coefs;
              const bCoef = bCoefs[bCoefs.length - 1] ?? 0;
              for (let i = 1; i < aCoefs.length; i++) sum += aCoefs[i] * bCoef;
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
              const aCoefs = ols(xNodes.map((x) => boot(x.nodeId)), boot(mNode.nodeId)).coefs;
              for (const yNode of yNodes) {
                const bCoefs = ols([...xNodes.map((x) => boot(x.nodeId)), boot(mNode.nodeId)], boot(yNode.nodeId)).coefs;
                const bCoef = bCoefs[bCoefs.length - 1] ?? 0;
                for (let i = 1; i < aCoefs.length; i++) sum += aCoefs[i] * bCoef;
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
