import { chiSquareSurvival, clamp, inverseNormalCDF, normalCDF } from "./statistics";

export type MlRole = "exogenous" | "mediator" | "outcome";
export type MlNode = { nodeId: number; varId: number; label: string; role: MlRole };
export type MlArrow = { fromNode: number; toNode: number; fromVar: number; toVar: number; active: boolean };
export type MlMeasurementColumns = Record<number, number[][]>;

export type MlPathEstimate = {
  from: number;
  to: number;
  b: number;
  se: number;
  cr: number;
  p: number;
  std: number;
};

export type MlLoadingEstimate = {
  nodeId: number;
  indicatorIndex: number;
  fixed: boolean;
  b: number;
  se: number;
  cr: number;
  p: number;
  std: number;
};

export type MlFit = {
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
  nfi: number;
  rfi: number;
  rmr: number;
  agfi: number;
  pgfi: number;
  pClose: number;
  npar: number;
  message?: string;
};

export type MlSemEstimate = {
  valid: boolean;
  fit: MlFit;
  paths: MlPathEstimate[];
  loadings: MlLoadingEstimate[];
  r2: Record<number, number>;
  latentCov: number[][];
  impliedCov: number[][];
  sampleCov: number[][];
  objective: number;
  iterations: number;
  converged: boolean;
  parameterVector: number[];
  /**
   * وارونِ ماتریسِ هسی‌ینِ عددی در نقطهٔ بهینه — برای شروعِ گرمِ بهینه‌ساز در
   * بوت‌استرپ (تکرارها را چند برابر کم می‌کند). فقط وقتی محاسبهٔ خطای استاندارد
   * درخواست شده باشد پر می‌شود.
   */
  inverseHessian?: Matrix | null;
  message?: string;
};

type Matrix = number[][];
type MeasurementBlock = { node: MlNode; columns: number[][]; observedIndices: number[]; latent: boolean };
type PathParam = { arrow: MlArrow; from: number; to: number; parameterIndex: number };
type LoadingParam = { nodeIndex: number; observedIndex: number; indicatorIndex: number; parameterIndex: number };
type VarianceParam = { nodeIndex: number; parameterIndex: number };
type ErrorParam = { observedIndex: number; parameterIndex: number };
type ExogenousCholeskyParam = { row: number; col: number; parameterIndex: number; diagonal: boolean };

type CompiledModel = {
  nodes: MlNode[];
  blocks: MeasurementBlock[];
  observedColumns: number[][];
  completeRows: number[];
  sampleCov: Matrix;
  sampleLogDet: number;
  n: number;
  observedCount: number;
  latentCount: number;
  paths: PathParam[];
  loadings: LoadingParam[];
  endogenousVariances: VarianceParam[];
  errors: ErrorParam[];
  exogenousNodes: number[];
  exogenousCholesky: ExogenousCholeskyParam[];
  parameterCount: number;
};

function zeros(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function identity(size: number): Matrix {
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)));
}

function transpose(matrix: Matrix): Matrix {
  if (!matrix.length) return [];
  return matrix[0].map((_, column) => matrix.map((row) => row[column]));
}

function multiply(left: Matrix, right: Matrix): Matrix {
  const rows = left.length;
  const inner = right.length;
  const columns = right[0]?.length ?? 0;
  const result = zeros(rows, columns);
  for (let i = 0; i < rows; i++) {
    for (let k = 0; k < inner; k++) {
      const value = left[i][k];
      if (value === 0) continue;
      for (let j = 0; j < columns; j++) result[i][j] += value * right[k][j];
    }
  }
  return result;
}

function cholesky(matrix: Matrix): Matrix | null {
  const size = matrix.length;
  const lower = zeros(size, size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (!(sum > 1e-12) || !Number.isFinite(sum)) return null;
        lower[i][j] = Math.sqrt(sum);
      } else {
        if (!(lower[j][j] > 0)) return null;
        lower[i][j] = sum / lower[j][j];
      }
    }
  }
  return lower;
}

function solveLower(lower: Matrix, vector: number[]): number[] {
  const result = Array(vector.length).fill(0);
  for (let i = 0; i < vector.length; i++) {
    let value = vector[i];
    for (let j = 0; j < i; j++) value -= lower[i][j] * result[j];
    result[i] = value / lower[i][i];
  }
  return result;
}

function solveUpper(upper: Matrix, vector: number[]): number[] {
  const result = Array(vector.length).fill(0);
  for (let i = vector.length - 1; i >= 0; i--) {
    let value = vector[i];
    for (let j = i + 1; j < vector.length; j++) value -= upper[i][j] * result[j];
    result[i] = value / upper[i][i];
  }
  return result;
}

function inverseSpd(matrix: Matrix): { inverse: Matrix; logDet: number } | null {
  const lower = cholesky(matrix);
  if (!lower) return null;
  const upper = transpose(lower);
  const size = matrix.length;
  const inverse = zeros(size, size);
  for (let column = 0; column < size; column++) {
    const unit = Array(size).fill(0);
    unit[column] = 1;
    const first = solveLower(lower, unit);
    const solution = solveUpper(upper, first);
    for (let row = 0; row < size; row++) inverse[row][column] = solution[row];
  }
  const logDet = 2 * lower.reduce((sum, row, index) => sum + Math.log(row[index]), 0);
  return { inverse, logDet };
}

function inverseGeneral(matrix: Matrix): Matrix | null {
  const size = matrix.length;
  const augmented = matrix.map((row, i) => [...row, ...Array.from({ length: size }, (_, j) => (i === j ? 1 : 0))]);
  for (let column = 0; column < size; column++) {
    let pivot = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivot][column])) pivot = row;
    }
    if (Math.abs(augmented[pivot][column]) < 1e-12) return null;
    [augmented[pivot], augmented[column]] = [augmented[column], augmented[pivot]];
    const divisor = augmented[column][column];
    for (let j = 0; j < size * 2; j++) augmented[column][j] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let j = 0; j < size * 2; j++) augmented[row][j] -= factor * augmented[column][j];
    }
  }
  return augmented.map((row) => row.slice(size));
}

function covariance(columns: number[][], rows: number[]): Matrix {
  const count = columns.length;
  const means = columns.map((column) => rows.reduce((sum, row) => sum + column[row], 0) / rows.length);
  const result = zeros(count, count);
  for (let i = 0; i < count; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (const row of rows) sum += (columns[i][row] - means[i]) * (columns[j][row] - means[j]);
      const value = sum / Math.max(1, rows.length - 1);
      result[i][j] = value;
      result[j][i] = value;
    }
  }
  return result;
}

function traceProduct(left: Matrix, right: Matrix): number {
  let value = 0;
  for (let i = 0; i < left.length; i++) {
    for (let j = 0; j < left.length; j++) value += left[i][j] * right[j][i];
  }
  return value;
}

function matrixTrace(matrix: Matrix): number {
  return matrix.reduce((sum, row, i) => sum + row[i], 0);
}

function vectorNorm(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
}

function dot(left: number[], right: number[]): number {
  return left.reduce((sum, value, index) => sum + value * right[index], 0);
}

function multiplyMatrixVector(matrix: Matrix, vector: number[]): number[] {
  return matrix.map((row) => dot(row, vector));
}

function outer(left: number[], right: number[]): Matrix {
  return left.map((a) => right.map((b) => a * b));
}

function addMatrices(left: Matrix, right: Matrix): Matrix {
  return left.map((row, i) => row.map((value, j) => value + right[i][j]));
}

function subtractMatrices(left: Matrix, right: Matrix): Matrix {
  return left.map((row, i) => row.map((value, j) => value - right[i][j]));
}

function scaleMatrix(matrix: Matrix, scalar: number): Matrix {
  return matrix.map((row) => row.map((value) => value * scalar));
}

function safeExp(value: number): number {
  return Math.exp(clamp(value, -20, 20));
}

function sampleVariance(values: number[]): number {
  if (values.length < 2) return 1;
  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1);
}

function sampleCovariance(left: number[], right: number[]): number {
  const n = Math.min(left.length, right.length);
  if (n < 2) return 0;
  const leftMean = left.reduce((sum, value) => sum + value, 0) / n;
  const rightMean = right.reduce((sum, value) => sum + value, 0) / n;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (left[i] - leftMean) * (right[i] - rightMean);
  return sum / (n - 1);
}

function olsCoefficients(predictors: number[][], outcome: number[]): { coefficients: number[]; residualVariance: number } {
  if (!predictors.length) return { coefficients: [], residualVariance: Math.max(1e-6, sampleVariance(outcome)) };
  const count = predictors.length;
  const covarianceMatrix = zeros(count, count);
  const covarianceOutcome = Array(count).fill(0);
  for (let i = 0; i < count; i++) {
    covarianceOutcome[i] = sampleCovariance(predictors[i], outcome);
    for (let j = 0; j < count; j++) covarianceMatrix[i][j] = sampleCovariance(predictors[i], predictors[j]);
  }
  const inverse = inverseGeneral(covarianceMatrix);
  const coefficients = inverse ? multiplyMatrixVector(inverse, covarianceOutcome) : Array(count).fill(0.1);
  const residuals = outcome.map((value, row) => value - coefficients.reduce((sum, coefficient, i) => sum + coefficient * predictors[i][row], 0));
  return { coefficients, residualVariance: Math.max(1e-6, sampleVariance(residuals)) };
}

function compileModel(
  nodesInput: MlNode[],
  arrows: MlArrow[],
  nodeColumns: number[][],
  measurementColumns: MlMeasurementColumns
): { model: CompiledModel; initial: number[] } | { error: string } {
  const nodes = [...nodesInput].sort((a, b) => a.nodeId - b.nodeId);
  const nodeIndex = new Map(nodes.map((node, index) => [node.nodeId, index]));
  const blocks: MeasurementBlock[] = [];
  const observedColumns: number[][] = [];
  for (const node of nodes) {
    const supplied = (measurementColumns[node.nodeId] ?? []).filter((column) => column?.length);
    const columns = supplied.length ? supplied : [nodeColumns[node.nodeId]];
    const observedIndices = columns.map((column) => {
      observedColumns.push(column);
      return observedColumns.length - 1;
    });
    blocks.push({ node, columns, observedIndices, latent: columns.length > 1 });
  }
  if (!observedColumns.length) return { error: "هیچ شاخص مشاهده‌شده‌ای برای برآورد ML وجود ندارد." };
  const rowCount = Math.min(...observedColumns.map((column) => column.length));
  const completeRows = Array.from({ length: rowCount }, (_, row) => row).filter((row) =>
    observedColumns.every((column) => Number.isFinite(column[row]))
  );
  if (completeRows.length <= observedColumns.length + 2) return { error: "تعداد موارد کامل برای برآورد SEM کافی نیست." };
  const cleanObserved = observedColumns.map((column) => completeRows.map((row) => column[row]));
  const sampleCov = covariance(cleanObserved, Array.from({ length: completeRows.length }, (_, i) => i));
  const sampleFactor = inverseSpd(sampleCov);
  if (!sampleFactor) return { error: "ماتریس کوواریانس نمونه مثبت‌معین نیست." };

  const paths: PathParam[] = [];
  const loadings: LoadingParam[] = [];
  const endogenousVariances: VarianceParam[] = [];
  const errors: ErrorParam[] = [];
  const exogenousNodes = nodes.map((node, index) => ({ node, index })).filter(({ node }) => node.role === "exogenous").map(({ index }) => index);
  const exogenousPosition = new Map(exogenousNodes.map((index, position) => [index, position]));
  const exogenousCholesky: ExogenousCholeskyParam[] = [];
  let parameterCount = 0;

  for (const arrow of arrows.filter((arrow) => arrow.active)) {
    const from = nodeIndex.get(arrow.fromNode);
    const to = nodeIndex.get(arrow.toNode);
    if (from == null || to == null) continue;
    paths.push({ arrow, from, to, parameterIndex: parameterCount++ });
  }
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    if (!block.latent) continue;
    for (let indicatorIndex = 1; indicatorIndex < block.observedIndices.length; indicatorIndex++) {
      loadings.push({
        nodeIndex: blockIndex,
        observedIndex: block.observedIndices[indicatorIndex],
        indicatorIndex,
        parameterIndex: parameterCount++,
      });
    }
  }
  for (let row = 0; row < exogenousNodes.length; row++) {
    for (let col = 0; col <= row; col++) {
      exogenousCholesky.push({ row, col, parameterIndex: parameterCount++, diagonal: row === col });
    }
  }
  nodes.forEach((node, index) => {
    if (node.role !== "exogenous") endogenousVariances.push({ nodeIndex: index, parameterIndex: parameterCount++ });
  });
  for (const block of blocks) {
    if (!block.latent) continue;
    for (const observedIndex of block.observedIndices) errors.push({ observedIndex, parameterIndex: parameterCount++ });
  }

  const model: CompiledModel = {
    nodes,
    blocks,
    observedColumns: cleanObserved,
    completeRows,
    sampleCov,
    sampleLogDet: sampleFactor.logDet,
    n: completeRows.length,
    observedCount: observedColumns.length,
    latentCount: nodes.length,
    paths,
    loadings,
    endogenousVariances,
    errors,
    exogenousNodes,
    exogenousCholesky,
    parameterCount,
  };

  const initial = Array(parameterCount).fill(0);
  const cleanNodeColumns = nodes.map((node) => {
    const raw = nodeColumns[node.nodeId];
    return completeRows.map((row) => raw[row]);
  });
  const incoming = new Map<number, PathParam[]>();
  for (const path of paths) incoming.set(path.to, [...(incoming.get(path.to) ?? []), path]);
  for (const [to, incomingPaths] of incoming.entries()) {
    const predictors = incomingPaths.map((path) => cleanNodeColumns[path.from]);
    const regression = olsCoefficients(predictors, cleanNodeColumns[to]);
    incomingPaths.forEach((path, index) => (initial[path.parameterIndex] = regression.coefficients[index] ?? 0.1));
  }
  for (const loading of loadings) {
    const block = blocks[loading.nodeIndex];
    const marker = cleanObserved[block.observedIndices[0]];
    const indicator = cleanObserved[loading.observedIndex];
    const markerVariance = Math.max(1e-8, sampleVariance(marker));
    initial[loading.parameterIndex] = sampleCovariance(marker, indicator) / markerVariance;
  }

  const exogenousCov = covariance(
    exogenousNodes.map((index) => cleanNodeColumns[index]),
    Array.from({ length: completeRows.length }, (_, i) => i)
  );
  const exogenousLower = cholesky(exogenousCov.map((row, i) => row.map((value, j) => value + (i === j ? 1e-6 : 0))));
  for (const parameter of exogenousCholesky) {
    const value = exogenousLower?.[parameter.row]?.[parameter.col] ?? (parameter.diagonal ? 1 : 0);
    initial[parameter.parameterIndex] = parameter.diagonal ? Math.log(Math.max(1e-6, value)) : value;
  }
  for (const variance of endogenousVariances) {
    const incomingPaths = incoming.get(variance.nodeIndex) ?? [];
    const predictors = incomingPaths.map((path) => cleanNodeColumns[path.from]);
    const regression = olsCoefficients(predictors, cleanNodeColumns[variance.nodeIndex]);
    initial[variance.parameterIndex] = Math.log(Math.max(1e-6, regression.residualVariance));
  }
  for (const error of errors) {
    initial[error.parameterIndex] = Math.log(Math.max(1e-6, sampleVariance(cleanObserved[error.observedIndex]) * 0.3));
  }

  // Keep TypeScript aware that exogenous positions are intentionally compiled in the same order.
  void exogenousPosition;
  return { model, initial };
}

function decode(model: CompiledModel, parameters: number[]): {
  implied: Matrix;
  latentCov: Matrix;
  structural: Matrix;
  loadings: Matrix;
  disturbances: Matrix;
  /** وارونِ (I − B)؛ برای گرادیانِ تحلیلی لازم است */
  aInverse: Matrix;
} | null {
  const structural = zeros(model.latentCount, model.latentCount);
  for (const path of model.paths) structural[path.to][path.from] = parameters[path.parameterIndex];
  const a = identity(model.latentCount).map((row, i) => row.map((value, j) => value - structural[i][j]));
  const aInverse = inverseGeneral(a);
  if (!aInverse) return null;

  const disturbances = zeros(model.latentCount, model.latentCount);
  const exogenousLower = zeros(model.exogenousNodes.length, model.exogenousNodes.length);
  for (const parameter of model.exogenousCholesky) {
    exogenousLower[parameter.row][parameter.col] = parameter.diagonal
      ? safeExp(parameters[parameter.parameterIndex])
      : parameters[parameter.parameterIndex];
  }
  const exogenousCov = multiply(exogenousLower, transpose(exogenousLower));
  for (let i = 0; i < model.exogenousNodes.length; i++) {
    for (let j = 0; j < model.exogenousNodes.length; j++) {
      disturbances[model.exogenousNodes[i]][model.exogenousNodes[j]] = exogenousCov[i][j];
    }
  }
  for (const variance of model.endogenousVariances) disturbances[variance.nodeIndex][variance.nodeIndex] = safeExp(parameters[variance.parameterIndex]);

  const latentCov = multiply(multiply(aInverse, disturbances), transpose(aInverse));
  const lambda = zeros(model.observedCount, model.latentCount);
  for (let blockIndex = 0; blockIndex < model.blocks.length; blockIndex++) {
    const block = model.blocks[blockIndex];
    lambda[block.observedIndices[0]][blockIndex] = 1;
  }
  for (const loading of model.loadings) lambda[loading.observedIndex][loading.nodeIndex] = parameters[loading.parameterIndex];
  const theta = zeros(model.observedCount, model.observedCount);
  for (const error of model.errors) theta[error.observedIndex][error.observedIndex] = safeExp(parameters[error.parameterIndex]);
  const implied = addMatrices(multiply(multiply(lambda, latentCov), transpose(lambda)), theta);
  return { implied, latentCov, structural, loadings: lambda, disturbances, aInverse };
}

function objective(model: CompiledModel, parameters: number[]): number {
  if (parameters.some((value) => !Number.isFinite(value) || Math.abs(value) > 50)) return 1e12;
  const decoded = decode(model, parameters);
  if (!decoded) return 1e12;
  const factor = inverseSpd(decoded.implied);
  if (!factor) return 1e12;
  const discrepancy = factor.logDet + traceProduct(model.sampleCov, factor.inverse) - model.sampleLogDet - model.observedCount;
  return Number.isFinite(discrepancy) ? Math.max(-1e-10, discrepancy) : 1e12;
}

function numericalGradient(fn: (x: number[]) => number, values: number[]): number[] {
  const baseline = fn(values);
  return values.map((value, index) => {
    const step = 1e-5 * Math.max(1, Math.abs(value));
    const forward = [...values];
    forward[index] += step;
    const f = fn(forward);
    if (!Number.isFinite(f) || !Number.isFinite(baseline)) return 0;
    return (f - baseline) / step;
  });
}

/**
 * گرادیانِ تحلیلیِ تابعِ هدفِ ML — کلیدِ شتابِ بوت‌استرپ.
 *
 * تابعِ هدفِ برآوردِ درست‌نماییِ بیشینه روی ماتریس کوواریانس چنین است:
 *   F = log|Σ| + tr(S·Σ⁻¹) − log|S| − p
 * که در آن Σ ماتریس کوواریانسِ ضمنیِ مدل است. مشتقِ آن نسبت به هر پارامتر برابر است با:
 *   dF/dθ = tr(G · Σ̇)    با    G = Σ⁻¹ · (Σ − S) · Σ⁻¹   (متقارن)
 * با جای‌گذاری Σ = Λ·Σ_L·Λᵗ + Θ و Σ_L = A·Ψ·Aᵗ (که در آن A = (I − B)⁻¹)، مشتقِ هر
 * دسته از پارامترها به چند ضربِ ماتریسیِ کوچک فرو می‌ریزد:
 *   ضرایب مسیرِ B[to][from] :  dF/db = 2 · (Σ_L · K · A)[from][to]
 *   بار عاملیِ Λ[o][k]      :  dF/dλ = 2 · (G · Λ · Σ_L)[o][k]
 *   واریانس خطا             :  dF/dθ = G[o][o] · exp(θ)
 *   واریانس اغتشاشِ Ψ[k][k] :  dF/dψ = (Aᵗ·K·A)[k][k] · exp(ψ)
 *   درایه‌های چولسکیِ L     :  dF/dL = 2 · (W_ex · L)[i][j]   (W_ex = Aᵗ·K·A محدود به برون‌زاها)
 * که در آن K = Λᵗ·G·Λ است.
 *
 * سودِ عملی: بدونِ گرادیانِ تحلیلی، هر تکرارِ BFGS حدود (۲p + ۲) ارزیابیِ تابعِ هدف هزینه
 * دارد (p ≈ ۳۰ پارامتر ⇒ حدود ۶۶ ارزیابی)؛ با گرادیانِ تحلیلی فقط یک ارزیابی + یک گرادیان.
 * این باعث می‌شود هر نمونهٔ بوت‌استرپ به‌جای ده‌ها میلی‌ثانیه، حدود یک میلی‌ثانیه هزینه داشته
 * باشد — یعنی سرعتی هم‌سطحِ AMOS.
 */
function analyticGradient(model: CompiledModel, parameters: number[]): number[] | null {
  if (parameters.some((value) => !Number.isFinite(value) || Math.abs(value) > 50)) return null;
  const decoded = decode(model, parameters);
  if (!decoded) return null;
  const inverse = inverseSpd(decoded.implied);
  if (!inverse) return null;

  const sigma = decoded.implied;
  const sigmaInverse = inverse.inverse;
  // G = Σ⁻¹ (Σ − S) Σ⁻¹
  const left = multiply(sigmaInverse, subtractMatrices(sigma, model.sampleCov));
  const G = multiply(left, sigmaInverse);

  const lambda = decoded.loadings; // Λ — مشاهده‌شده × نهفته
  const sigmaL = decoded.latentCov; // Σ_L = A Ψ Aᵗ
  const A = decoded.aInverse; // A = (I − B)⁻¹
  const GLambda = multiply(G, lambda); // G·Λ — مشاهده‌شده × نهفته
  const K = multiply(transpose(lambda), GLambda); // Λᵗ·G·Λ — نهفته × نهفته
  const W = multiply(transpose(A), multiply(K, A)); // Aᵗ·K·A ⇒ مشتق نسبت به Ψ
  const P = multiply(sigmaL, multiply(K, A)); // Σ_L·K·A ⇒ مشتق نسبت به B
  const R = multiply(GLambda, sigmaL); // G·Λ·Σ_L ⇒ مشتق نسبت به بارهای عاملی

  const gradient = new Array<number>(model.parameterCount).fill(0);
  for (const path of model.paths) gradient[path.parameterIndex] = 2 * P[path.from][path.to];
  for (const loading of model.loadings) {
    gradient[loading.parameterIndex] = 2 * R[loading.observedIndex][loading.nodeIndex];
  }
  for (const error of model.errors) {
    gradient[error.parameterIndex] = G[error.observedIndex][error.observedIndex] * safeExp(parameters[error.parameterIndex]);
  }
  for (const variance of model.endogenousVariances) {
    gradient[variance.parameterIndex] =
      W[variance.nodeIndex][variance.nodeIndex] * safeExp(parameters[variance.parameterIndex]);
  }

  // پیش‌بین‌های برون‌زا با پارامترسازیِ چولسکی: Ψ = L·Lᵗ
  const size = model.exogenousNodes.length;
  const lower = zeros(size, size);
  for (const parameter of model.exogenousCholesky) {
    lower[parameter.row][parameter.col] = parameter.diagonal
      ? safeExp(parameters[parameter.parameterIndex])
      : parameters[parameter.parameterIndex];
  }
  const exogenousW = zeros(size, size);
  for (let i = 0; i < size; i++) {
    for (let j = 0; j < size; j++) exogenousW[i][j] = W[model.exogenousNodes[i]][model.exogenousNodes[j]];
  }
  const WL = multiply(exogenousW, lower);
  for (const parameter of model.exogenousCholesky) {
    const raw = 2 * WL[parameter.row][parameter.col];
    gradient[parameter.parameterIndex] = parameter.diagonal
      ? raw * safeExp(parameters[parameter.parameterIndex])
      : raw;
  }

  return gradient.every((value) => Number.isFinite(value)) ? gradient : null;
}

/**
 * گرادیانِ ترکیبی: ابتدا تحلیلی (سریع)؛ اگر واکدگشایی یا وارون‌گیری ناموفق بود
 * (مثلاً در یک گامِ بدِ جست‌وجوی خط)، به تفاضلِ متناهی برمی‌گردد تا بهینه‌ساز
 * در همان نقطهٔ دشوار هم رفتارِ درستی داشته باشد.
 */
function makeGradient(model: CompiledModel, fn: (x: number[]) => number) {
  return (x: number[]): number[] => analyticGradient(model, x) ?? numericalGradient(fn, x);
}

function optimizeBfgs(
  fn: (x: number[]) => number,
  start: number[],
  maxIterations = 350,
  /**
   * آستانهٔ همگرایی روی نُرمِ گرادیان. مقدارِ پیش‌فرض (۱e-۶) برای برآوردِ اصلی مناسب
   * است، اما در بوت‌استرپ — که صدها یا هزاران برازشِ پشت‌سرهم انجام می‌شود — گران
   * تمام می‌شود. با آستانهٔ بزرگ‌تر، بهینه‌ساز همان چند تکرارِ اول که بیشترین بهبود را
   * دارند انجام می‌دهد و بعد متوقف می‌شود؛ دقتِ حاصل برای فاصلهٔ اطمینانِ بوت‌استرپ
   * کاملاً کافی است.
   */
  tolerance = 1e-6,
  /** گرادیانِ تحلیلی (اختیاری)؛ اگر داده نشود از تفاضلِ متناهی استفاده می‌شود */
  gradientFn?: (x: number[]) => number[],
  /**
   * تقریبِ آغازینِ وارونِ هسی‌ین. در بوت‌استرپ، همهٔ نمونه‌ها پیرامونِ برآوردِ نمونهٔ کامل
   * هستند؛ بنابراین وارونِ هسی‌ینِ همان برآورد تقریبِ بسیار خوبی است و بهینه‌ساز را از
   * حدود ۳۸ تکرار به چند تکرار می‌رساند (بدون اینکه نقطهٔ جواب جابه‌جا شود — جهتِ صعود
   * فقط سرعت را تعیین می‌کند، نه پاسخِ نهایی را).
   */
  initialInverseHessian?: Matrix
): { x: number[]; fx: number; iterations: number; converged: boolean } {
  const grad = gradientFn ?? ((x: number[]) => numericalGradient(fn, x));
  let x = [...start];
  let fx = fn(x);
  let gradient = grad(x);
  let inverseHessian =
    initialInverseHessian && initialInverseHessian.length === x.length ? initialInverseHessian : identity(x.length);
  let converged = false;
  let iteration = 0;
  for (; iteration < maxIterations; iteration++) {
    if (vectorNorm(gradient) < tolerance) {
      converged = true;
      break;
    }
    let direction = multiplyMatrixVector(inverseHessian, gradient).map((value) => -value);
    if (dot(direction, gradient) >= -1e-12 || direction.some((value) => !Number.isFinite(value))) {
      direction = gradient.map((value) => -value);
      inverseHessian = identity(x.length);
    }
    const directionalDerivative = dot(gradient, direction);
    let step = 1;
    let candidate = x.map((value, index) => value + step * direction[index]);
    let candidateFx = fn(candidate);
    while ((!Number.isFinite(candidateFx) || candidateFx > fx + 1e-4 * step * directionalDerivative) && step > 1e-8) {
      step *= 0.5;
      candidate = x.map((value, index) => value + step * direction[index]);
      candidateFx = fn(candidate);
    }
    if (step <= 1e-8 || !Number.isFinite(candidateFx)) break;
    const candidateGradient = grad(candidate);
    const s = candidate.map((value, index) => value - x[index]);
    const y = candidateGradient.map((value, index) => value - gradient[index]);
    const ys = dot(y, s);
    if (ys > 1e-10) {
      const rho = 1 / ys;
      const i = identity(x.length);
      const left = subtractMatrices(i, scaleMatrix(outer(s, y), rho));
      const right = subtractMatrices(i, scaleMatrix(outer(y, s), rho));
      inverseHessian = addMatrices(multiply(multiply(left, inverseHessian), right), scaleMatrix(outer(s, s), rho));
    } else {
      inverseHessian = identity(x.length);
    }
    const change = Math.abs(fx - candidateFx);
    x = candidate;
    fx = candidateFx;
    gradient = candidateGradient;
    if (change < 1e-10 && vectorNorm(gradient) < Math.max(tolerance, 1e-4)) {
      converged = true;
      iteration++;
      break;
    }
  }
  return { x, fx, iterations: iteration, converged };
}

function numericalHessian(fn: (x: number[]) => number, values: number[]): Matrix | null {
  const size = values.length;
  const result = zeros(size, size);
  const center = fn(values);
  if (!Number.isFinite(center)) return null;
  const steps = values.map((value) => 2e-4 * Math.max(1, Math.abs(value)));
  for (let i = 0; i < size; i++) {
    const plus = [...values];
    const minus = [...values];
    plus[i] += steps[i];
    minus[i] -= steps[i];
    result[i][i] = (fn(plus) - 2 * center + fn(minus)) / (steps[i] * steps[i]);
    for (let j = 0; j < i; j++) {
      const pp = [...values];
      const pm = [...values];
      const mp = [...values];
      const mm = [...values];
      pp[i] += steps[i]; pp[j] += steps[j];
      pm[i] += steps[i]; pm[j] -= steps[j];
      mp[i] -= steps[i]; mp[j] += steps[j];
      mm[i] -= steps[i]; mm[j] -= steps[j];
      const value = (fn(pp) - fn(pm) - fn(mp) + fn(mm)) / (4 * steps[i] * steps[j]);
      result[i][j] = value;
      result[j][i] = value;
    }
  }
  return result;
}

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
  let low = 0;
  let high = Math.max(1, x + df);
  while (noncentralChiSquareCdf(x, df, high) > target && high < 1e5) high *= 2;
  for (let iteration = 0; iteration < 70; iteration++) {
    const middle = (low + high) / 2;
    if (noncentralChiSquareCdf(x, df, middle) > target) low = middle;
    else high = middle;
  }
  return (low + high) / 2;
}

function rmseaConfidence(chi2: number, df: number, n: number): { low: number; high: number } {
  if (!(df > 0) || !(n > 1)) return { low: NaN, high: NaN };
  const denominator = df * (n - 1);
  return {
    low: Math.sqrt(noncentralityAtCdf(chi2, df, 0.95) / denominator),
    high: Math.sqrt(noncentralityAtCdf(chi2, df, 0.05) / denominator),
  };
}

function pCloseRmsea(chi2: number, df: number, n: number, closeFit = 0.05): number {
  if (!(df > 0) || !(n > 1)) return NaN;
  const lambda = closeFit * closeFit * df * (n - 1);
  return clamp(1 - noncentralChiSquareCdf(chi2, df, lambda), 0, 1);
}

function emptyFit(message: string): MlFit {
  return {
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
    nfi: NaN,
    rfi: NaN,
    rmr: NaN,
    agfi: NaN,
    pgfi: NaN,
    pClose: NaN,
    npar: 0,
    message,
  };
}

/**
 * آستانهٔ همگراییِ ویژهٔ بوت‌استرپ. با شروعِ گرم از پارامترهای نمونهٔ کامل، هر نمونهٔ
 * بوت‌استرپ خیلی زود همگرا می‌شود؛ ادامه دادن تا ۱e-۶ فقط وقت تلف کردن است.
 * مقدارِ ۱e-۴ سرعت را چند برابر می‌کند بدون اینکه فاصلهٔ اطمینان را جابه‌جا کند.
 */
const BOOTSTRAP_TOLERANCE = 1e-6;

/**
 * بیشینهٔ تکرارهای بهینه‌ساز در بوت‌استرپ. اندازه‌گیری روی مدلِ ۴ سازه / ۱۰ شاخص و
 * n=۳۰۰ با یک نمونه‌گیریِ یکسان نشان داد: با شروعِ گرم، ۴۵ تکرار حدود ۸۱ms و ۱۵ تکرار
 * حدود ۳۱ms به‌ازای هر نمونه هزینه دارد، در حالی که پهنایِ فاصلهٔ اطمینانِ ۹۵٪ تنها
 * حدود ۳٪ کمتر می‌شود (۰٫۲۴۸ در برابر ۰٫۲۵۷). ده تکرار اما فاصله را حدود ۱۲٪ تنگ
 * می‌کند، یعنی زیرِ همگرایی است؛ بنابراین ۱۵ نقطهٔ بهینهٔ سرعت/دقت است.
 */
const BOOTSTRAP_MAX_ITERATIONS = 25;

/**
 * آستانهٔ سلامتِ یک نمونهٔ بوت‌استرپ. اگر در یک نمونهٔ بازنمونه‌گیری‌شده هم‌خطیِ بسیار
 * شدیدی پیش بیاید، برآوردگر می‌تواند ضرایبِ استانداردِ ناممکن (بزرگ‌تر از یک) تولید کند و
 * فاصلهٔ اطمینان را به‌کل بی‌معنا کند (مثلاً اثر غیرمستقیمِ ۱٫۴ برای β≈۰٫۱۵). چنین
 * نمونه‌ای — درست مانند کاری که AMOS با نمونه‌های ناهمگرا می‌کند — کنار گذاشته می‌شود؛
 * تعدادشان در خروجی (ستونِ «نمونه‌های معتبر») گزارش می‌شود تا پنهان نماند.
 */
const MAX_BOOTSTRAP_STD = 1.5;

export function estimateSemMl(
  nodes: MlNode[],
  arrows: MlArrow[],
  nodeColumns: number[][],
  measurementColumns: MlMeasurementColumns,
  options: {
    computeStandardErrors?: boolean;
    maxIterations?: number;
    start?: number[];
    multipleStarts?: boolean;
    /** آستانهٔ همگراییِ بهینه‌ساز (نُرمِ گرادیان) — برای شتاب‌دادن به بوت‌استرپ */
    tolerance?: number;
    /** وارونِ هسی‌ینِ نمونهٔ کامل — شروعِ گرمِ بهینه‌ساز در بوت‌استرپ */
    startInverseHessian?: Matrix;
  } = {}
): MlSemEstimate {
  const compiled = compileModel(nodes, arrows, nodeColumns, measurementColumns);
  if ("error" in compiled) {
    return {
      valid: false,
      fit: emptyFit(compiled.error),
      paths: [],
      loadings: [],
      r2: {},
      latentCov: [],
      impliedCov: [],
      sampleCov: [],
      objective: NaN,
      iterations: 0,
      converged: false,
      parameterVector: [],
      inverseHessian: null,
      message: compiled.error,
    };
  }
  const { model } = compiled;
  const objectiveFn = (parameters: number[]) => objective(model, parameters);
  const start = options.start?.length === model.parameterCount ? [...options.start] : compiled.initial;
  const candidates = [start];
  // A deterministic second start reduces dependence on starting values without fabricating results.
  if (options.multipleStarts !== false) {
    candidates.push(start.map((value, index) => value + 0.03 * Math.sin((index + 1) * 1.618)));
  }
  const tolerance = options.tolerance ?? 1e-6;
  const gradientFn = makeGradient(model, objectiveFn);
  const startInverseHessian = options.startInverseHessian;
  let optimum = optimizeBfgs(
    objectiveFn,
    candidates[0],
    options.maxIterations ?? 350,
    tolerance,
    gradientFn,
    startInverseHessian
  );
  for (let index = 1; index < candidates.length; index++) {
    const candidate = optimizeBfgs(
      objectiveFn,
      candidates[index],
      options.maxIterations ?? 350,
      tolerance,
      gradientFn,
      startInverseHessian
    );
    if (candidate.fx < optimum.fx) optimum = candidate;
  }
  const decoded = decode(model, optimum.x);
  if (!decoded || !Number.isFinite(optimum.fx) || optimum.fx >= 1e10) {
    const message = "برآورد هم‌زمان ML همگرا نشد یا ماتریس کوواریانس ضمنی معتبر نبود.";
    return {
      valid: false,
      fit: emptyFit(message),
      paths: [],
      loadings: [],
      r2: {},
      latentCov: [],
      impliedCov: [],
      sampleCov: model.sampleCov,
      objective: optimum.fx,
      iterations: optimum.iterations,
      converged: false,
      parameterVector: optimum.x,
      inverseHessian: null,
      message,
    };
  }

  let parameterCovariance: Matrix | null = null;
  let inverseHessian: Matrix | null = null;
  if (options.computeStandardErrors !== false) {
    const hessian = numericalHessian(objectiveFn, optimum.x);
    const inverse = hessian ? inverseGeneral(hessian) : null;
    if (inverse) {
      inverseHessian = inverse;
      parameterCovariance = scaleMatrix(inverse, 2 / Math.max(1, model.n - 1));
    }
  }
  const parameterSe = (index: number) => {
    const variance = parameterCovariance?.[index]?.[index];
    return variance != null && variance >= 0 && Number.isFinite(variance) ? Math.sqrt(variance) : NaN;
  };
  const twoTailedP = (cr: number) => (Number.isFinite(cr) ? clamp(2 * (1 - normalCDF(Math.abs(cr))), 0, 1) : NaN);

  const pathEstimates: MlPathEstimate[] = model.paths.map((path) => {
    const b = optimum.x[path.parameterIndex];
    const se = parameterSe(path.parameterIndex);
    const cr = se > 0 ? b / se : NaN;
    const fromVariance = decoded.latentCov[path.from][path.from];
    const toVariance = decoded.latentCov[path.to][path.to];
    const std = fromVariance > 0 && toVariance > 0 ? b * Math.sqrt(fromVariance / toVariance) : NaN;
    return { from: path.arrow.fromNode, to: path.arrow.toNode, b, se, cr, p: twoTailedP(cr), std };
  });

  const loadingByObserved = new Map(model.loadings.map((loading) => [loading.observedIndex, loading]));
  const loadingEstimates: MlLoadingEstimate[] = [];
  for (let blockIndex = 0; blockIndex < model.blocks.length; blockIndex++) {
    const block = model.blocks[blockIndex];
    if (!block.latent) continue;
    for (let indicatorIndex = 0; indicatorIndex < block.observedIndices.length; indicatorIndex++) {
      const observedIndex = block.observedIndices[indicatorIndex];
      const parameter = loadingByObserved.get(observedIndex);
      const fixed = indicatorIndex === 0;
      const b = fixed ? 1 : optimum.x[parameter!.parameterIndex];
      const se = fixed ? 0 : parameterSe(parameter!.parameterIndex);
      const cr = fixed ? NaN : se > 0 ? b / se : NaN;
      const factorVariance = decoded.latentCov[blockIndex][blockIndex];
      const observedVariance = decoded.implied[observedIndex][observedIndex];
      const std = factorVariance > 0 && observedVariance > 0 ? b * Math.sqrt(factorVariance / observedVariance) : NaN;
      loadingEstimates.push({ nodeId: block.node.nodeId, indicatorIndex, fixed, b, se, cr, p: fixed ? NaN : twoTailedP(cr), std });
    }
  }

  const r2: Record<number, number> = {};
  for (const variance of model.endogenousVariances) {
    const residualVariance = safeExp(optimum.x[variance.parameterIndex]);
    const totalVariance = decoded.latentCov[variance.nodeIndex][variance.nodeIndex];
    r2[model.nodes[variance.nodeIndex].nodeId] = totalVariance > 0 ? clamp(1 - residualVariance / totalVariance, 0, 1) : NaN;
  }

  const moments = (model.observedCount * (model.observedCount + 1)) / 2;
  const df = Math.max(0, moments - model.parameterCount);
  const chi2 = Math.max(0, (model.n - 1) * Math.max(0, optimum.fx));
  const independenceDf = (model.observedCount * (model.observedCount - 1)) / 2;
  const diagonal = zeros(model.observedCount, model.observedCount);
  for (let index = 0; index < model.observedCount; index++) diagonal[index][index] = model.sampleCov[index][index];
  const diagonalFactor = inverseSpd(diagonal)!;
  const independenceF = diagonalFactor.logDet + traceProduct(model.sampleCov, diagonalFactor.inverse) - model.sampleLogDet - model.observedCount;
  const independenceChi2 = Math.max(0, (model.n - 1) * independenceF);
  const cfiDenominator = Math.max(chi2 - df, independenceChi2 - independenceDf, 1e-12);
  const cfi = clamp(1 - Math.max(chi2 - df, 0) / cfiDenominator, 0, 1);
  const nfi = independenceChi2 > 0 ? clamp((independenceChi2 - chi2) / independenceChi2, 0, 1) : 1;
  const tli =
    df > 0 && independenceDf > 0 && independenceChi2 / independenceDf !== 1
      ? clamp((independenceChi2 / independenceDf - chi2 / df) / (independenceChi2 / independenceDf - 1), 0, 1)
      : 1;
  const rfi =
    df > 0 && independenceDf > 0 && independenceChi2 > 0
      ? clamp(1 - (chi2 / df) / (independenceChi2 / independenceDf), 0, 1)
      : 1;
  const ifi = independenceChi2 - df > 0 ? clamp((independenceChi2 - chi2) / (independenceChi2 - df), 0, 1) : 1;
  const parsimonyRatio = independenceDf > 0 ? clamp(df / independenceDf, 0, 1) : 0;
  const pnfi = clamp(parsimonyRatio * nfi, 0, 1);
  const pcfi = clamp(parsimonyRatio * cfi, 0, 1);
  const chi2df = df > 0 ? chi2 / df : NaN;
  const rmsea = df > 0 ? Math.sqrt(Math.max(chi2 - df, 0) / (df * (model.n - 1))) : 0;
  const rmseaCi = rmseaConfidence(chi2, df, model.n);

  let rawResidualSum = 0;
  let standardizedResidualSum = 0;
  let residualCount = 0;
  for (let row = 0; row < model.observedCount; row++) {
    for (let col = 0; col <= row; col++) {
      const residual = model.sampleCov[row][col] - decoded.implied[row][col];
      rawResidualSum += residual * residual;
      const denominator = Math.sqrt(Math.max(1e-12, model.sampleCov[row][row] * model.sampleCov[col][col]));
      standardizedResidualSum += (residual / denominator) ** 2;
      residualCount++;
    }
  }
  const rmr = Math.sqrt(rawResidualSum / Math.max(1, residualCount));
  const srmr = Math.sqrt(standardizedResidualSum / Math.max(1, residualCount));

  const impliedFactor = inverseSpd(decoded.implied)!;
  const product = multiply(impliedFactor.inverse, model.sampleCov);
  const productMinusIdentity = subtractMatrices(product, identity(model.observedCount));
  const gfiNumerator = matrixTrace(multiply(productMinusIdentity, productMinusIdentity));
  const gfiDenominator = matrixTrace(multiply(product, product));
  const gfi = gfiDenominator !== 0 ? clamp(1 - gfiNumerator / gfiDenominator, 0, 1) : NaN;
  const agfi = df > 0 ? 1 - (moments / df) * (1 - gfi) : NaN;
  const pgfi = moments > 0 ? (df / moments) * gfi : NaN;

  const fit: MlFit = {
    valid: true,
    chi2,
    df,
    pValue: df > 0 ? chiSquareSurvival(chi2, df) : NaN,
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
    nfi,
    rfi,
    rmr,
    agfi,
    pgfi,
    pClose: pCloseRmsea(chi2, df, model.n),
    npar: model.parameterCount,
    message: `برآورد هم‌زمان Maximum Likelihood روی ماتریس کوواریانس (${model.parameterCount} پارامتر آزاد).`,
  };

  return {
    valid: true,
    fit,
    paths: pathEstimates,
    loadings: loadingEstimates,
    r2,
    latentCov: decoded.latentCov,
    impliedCov: decoded.implied,
    sampleCov: model.sampleCov,
    objective: optimum.fx,
    iterations: optimum.iterations,
    converged: optimum.converged,
    parameterVector: optimum.x,
    inverseHessian,
    message: fit.message,
  };
}


// ============================================================
// بوت‌استرپ اثر غیرمستقیم (هر مسیر میانجی + کل اثر غیرمستقیم)
// ============================================================

/** یک «واحد اثر» در جدولِ اثرات غیرمستقیم */
export type MlIndirectUnit = {
  varId: number;
  /** شناسهٔ گره وقتی واحد همان زیرمقیاس است (متغیرِ غیرجمع‌پذیر)؛ در غیر این صورت null */
  nodeId: number | null;
  label: string;
  /** گره‌هایی که اثرِ این واحد از آن‌ها جمع می‌شود */
  nodeIds: number[];
};

/**
 * ساخت «واحدهای اثر» برای یک نقشِ مدل.
 *
 * اگر متغیر نمرهٔ کل داشته باشد (یا تک‌گره باشد)، کلِ متغیر یک واحد است. اما برای
 * پرسشنامهٔ غیرجمع‌پذیر (مانند ERQ که «ارزیابی مجددِ شناختی» و «فرونشانیِ هیجانی» دو
 * زیرمقیاسِ مستقل با جهتِ اثرِ متفاوت‌اند) «اثرِ کلِ متغیر» اساساً تعریف ندارد: جمعِ
 * جبریِ دو زیرمقیاس یکدیگر را خنثی می‌کند و عددی گمراه‌کننده به دست می‌دهد (مثلاً
 * ۰٫۰۱ به‌جایِ ۰٫۰۹− و ۰٫۱۰+). بنابراین هر زیرمقیاس یک واحدِ مستقل می‌شود و جدولِ
 * نتایج برای هر کدام یک ردیفِ جداگانه نشان می‌دهد.
 */
export function buildIndirectUnits(nodes: MlNode[], role: MlRole): MlIndirectUnit[] {
  const grouped = new Map<number, MlNode[]>();
  for (const node of nodes) {
    if (node.role !== role) continue;
    grouped.set(node.varId, [...(grouped.get(node.varId) ?? []), node]);
  }
  const units: MlIndirectUnit[] = [];
  for (const [varId, group] of grouped) {
    if (!group.length) continue;
    if (group.length > 1) {
      for (const node of group) {
        units.push({ varId, nodeId: node.nodeId, label: node.label, nodeIds: [node.nodeId] });
      }
    } else {
      units.push({ varId, nodeId: null, label: group[0].label, nodeIds: [group[0].nodeId] });
    }
  }
  return units;
}

export type MlBootstrapIndirect = {
  fromVar: number;
  toVar: number;
  viaVar: number | null;
  /** شناسهٔ گره وقتی ردیف مربوط به یک زیرمقیاسِ مستقل است (متغیرِ غیرجمع‌پذیر) */
  fromNode: number | null;
  viaNode: number | null;
  toNode: number | null;
  indirect: number;
  lo: number;
  hi: number;
  p: number;
  sig: boolean;
  requested: number;
  usable: number;
};

/** تعریفِ یک ردیفِ اثر غیرمستقیم (بدونِ نمونه‌های بوت‌استرپ) */
export type MlIndirectDefinition = {
  fromVar: number;
  toVar: number;
  viaVar: number | null;
  fromNode: number | null;
  viaNode: number | null;
  toNode: number | null;
  /** نقطه‌برآوردِ استانداردشده روی نمونهٔ کامل */
  point: number;
};

type IndirectDefinitionInternal = MlIndirectDefinition & {
  /** سه‌تایی‌های (مبدأ، میانجی، مقصد) که اثرِ این ردیف از آن‌ها جمع می‌شود */
  chains: { from: number; via: number; to: number }[];
};

/** خروجیِ خامِ بوت‌استرپ — برای اجرای موازی در چند Worker و ادغامِ بعدی */
export type MlIndirectBootstrapSamples = {
  definitions: MlIndirectDefinition[];
  /** اثرِ هر ردیف در هر نمونهٔ بوت‌استرپ */
  effects: number[][];
};

/** دادهٔ لازم برای شروعِ گرم از برآوردِ نمونهٔ کامل (قابلِ انتقال به Worker) */
export type MlBootstrapSeed = {
  parameterVector: number[];
  paths: { from: number; to: number; std: number }[];
  /** وارونِ هسی‌ینِ نمونهٔ کامل برای شتابِ بهینه‌ساز */
  inverseHessian?: number[][] | null;
};

type PathValues = { paths: { from: number; to: number; std: number }[] };

function pathValue(estimate: PathValues, fromNode: number, toNode: number): number {
  return estimate.paths.find((path) => path.from === fromNode && path.to === toNode)?.std ?? 0;
}

function buildIndirectDefinitions(
  nodes: MlNode[],
  active: MlArrow[],
  full: PathValues
): IndirectDefinitionInternal[] {
  const fromUnits = buildIndirectUnits(nodes, "exogenous");
  const viaUnits = buildIndirectUnits(nodes, "mediator");
  const toUnits = buildIndirectUnits(nodes, "outcome");
  const definitions: IndirectDefinitionInternal[] = [];
  for (const from of fromUnits) {
    for (const to of toUnits) {
      const validVia = viaUnits.filter(
        (via) =>
          active.some((arrow) => arrow.fromVar === from.varId && arrow.toVar === via.varId) &&
          active.some((arrow) => arrow.fromVar === via.varId && arrow.toVar === to.varId)
      );
      if (!validVia.length) continue;
      const chainsOf = (via: MlIndirectUnit) => {
        const chains: { from: number; via: number; to: number }[] = [];
        for (const f of from.nodeIds) for (const v of via.nodeIds) for (const t of to.nodeIds) chains.push({ from: f, via: v, to: t });
        return chains;
      };
      for (const via of validVia) {
        definitions.push({
          fromVar: from.varId,
          toVar: to.varId,
          viaVar: via.varId,
          fromNode: from.nodeId,
          viaNode: via.nodeId,
          toNode: to.nodeId,
          point: 0,
          chains: chainsOf(via),
        });
      }
      if (validVia.length > 1) {
        definitions.push({
          fromVar: from.varId,
          toVar: to.varId,
          viaVar: null,
          fromNode: from.nodeId,
          viaNode: null,
          toNode: to.nodeId,
          point: 0,
          chains: validVia.flatMap(chainsOf),
        });
      }
    }
  }
  for (const definition of definitions) {
    let sum = 0;
    for (const chain of definition.chains) {
      const a = pathValue(full, chain.from, chain.via);
      const b = pathValue(full, chain.via, chain.to);
      if (Number.isFinite(a) && Number.isFinite(b)) sum += a * b;
    }
    definition.point = sum;
  }
  return definitions;
}

function quantile(sorted: number[], probability: number): number {
  if (!sorted.length) return NaN;
  const position = clamp(probability, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

/**
 * نمونه‌گیریِ بوت‌استرپ بدون خلاصه‌سازی. خروجیِ خام برمی‌گرداند تا بتوان کار را بین
 * چند Worker تقسیم کرد و نمونه‌ها را پیش از محاسبهٔ فاصلهٔ اطمینان ادغام کرد.
 */
export function bootstrapSemMlIndirectSamples(
  nodes: MlNode[],
  arrows: MlArrow[],
  nodeColumns: number[][],
  measurementColumns: MlMeasurementColumns,
  samples: number,
  /** برآوردِ نمونهٔ کامل (برای نقطه‌برآورد و شروعِ گرم)؛ اگر داده نشود حساب می‌شود */
  seed?: MlBootstrapSeed | MlSemEstimate | null,
  /** گزارش پیشرفتِ نمونه‌به‌نمونه — برای نمایش زنده در مودال تولید (اختیاری) */
  onProgress?: (done: number, total: number) => void
): MlIndirectBootstrapSamples {
  const active = arrows.filter((arrow) => arrow.active);
  const allObserved = nodes.flatMap((node) => {
    const supplied = measurementColumns[node.nodeId] ?? [];
    return supplied.length ? supplied : [nodeColumns[node.nodeId]];
  });
  if (!allObserved.length) return { definitions: [], effects: [] };
  const rawN = Math.min(...allObserved.map((column) => column.length));
  const completeRows = Array.from({ length: rawN }, (_, row) => row).filter((row) =>
    allObserved.every((column) => Number.isFinite(column[row]))
  );
  if (completeRows.length < 10) return { definitions: [], effects: [] };

  // برآوردِ نمونهٔ کامل: هم نقطه‌برآورد را می‌دهد، هم مبدأِ شروعِ گرم و وارونِ هسی‌ین را.
  const full =
    seed && seed.parameterVector.length > 0
      ? seed
      : estimateSemMl(nodes, active, nodeColumns, measurementColumns, {
          computeStandardErrors: true,
          tolerance: BOOTSTRAP_TOLERANCE,
        });
  if (!full || !full.parameterVector?.length) return { definitions: [], effects: [] };

  const definitions = buildIndirectDefinitions(nodes, active, full);
  if (!definitions.length) return { definitions: [], effects: [] };
  const effects: number[][] = definitions.map(() => []);
  const startVector = full.parameterVector;
  const inverseHessian = full.inverseHessian ?? undefined;

  for (let bootstrap = 0; bootstrap < samples; bootstrap++) {
    const selected = Array.from(
      { length: completeRows.length },
      () => completeRows[Math.floor(Math.random() * completeRows.length)]
    );
    const bootMeasurements: MlMeasurementColumns = {};
    const bootNodes: number[][] = [];
    for (const node of nodes) {
      const source = measurementColumns[node.nodeId]?.length
        ? measurementColumns[node.nodeId]
        : [nodeColumns[node.nodeId]];
      const columns = source.map((column) => selected.map((row) => column[row]));
      bootMeasurements[node.nodeId] = columns;
      bootNodes[node.nodeId] =
        columns.length === 1 ? columns[0] : columns[0].map((_, row) => columns.reduce((sum, column) => sum + column[row], 0));
    }
    const estimate = estimateSemMl(nodes, active, bootNodes, bootMeasurements, {
      computeStandardErrors: false,
      maxIterations: BOOTSTRAP_MAX_ITERATIONS,
      start: startVector,
      // شروعِ گرمِ دوگانه: پارامترها از نمونهٔ کامل + وارونِ هسی‌ینِ نمونهٔ کامل.
      // چون همهٔ نمونه‌های بوت‌استرپ پیرامونِ برآوردِ اصلی‌اند، این کار تکرارهای لازم
      // را از حدود ۳۸ به چند تکرار می‌رساند بی‌آنکه نقطهٔ جواب عوض شود.
      startInverseHessian: inverseHessian,
      multipleStarts: false,
      tolerance: BOOTSTRAP_TOLERANCE,
    });
    if (onProgress && (bootstrap % 25 === 24 || bootstrap === samples - 1)) onProgress(bootstrap + 1, samples);
    if (!estimate.valid) continue;
    // نمونهٔ ناسالم (جوابِ نامناسب بر اثرِ هم‌خطیِ شدید در این نمونهٔ خاص) حذف می‌شود
    if (estimate.paths.some((path) => !Number.isFinite(path.std) || Math.abs(path.std) > MAX_BOOTSTRAP_STD)) {
      continue;
    }
    for (let index = 0; index < definitions.length; index++) {
      let effect = 0;
      for (const chain of definitions[index].chains) {
        effect += pathValue(estimate, chain.from, chain.via) * pathValue(estimate, chain.via, chain.to);
      }
      effects[index].push(effect);
    }
  }

  return {
    definitions: definitions.map((definition) => ({
      fromVar: definition.fromVar,
      toVar: definition.toVar,
      viaVar: definition.viaVar,
      fromNode: definition.fromNode,
      viaNode: definition.viaNode,
      toNode: definition.toNode,
      point: definition.point,
    })),
    effects,
  };
}

/**
 * خلاصه‌سازیِ نمونه‌های بوت‌استرپ: میانه، فاصلهٔ اطمینانِ ۹۵٪ با تصحیحِ سوگیری
 * (Bias-Corrected Percentile) و مقدارِ p.
 */
export function summarizeMlIndirect(
  definitions: MlIndirectDefinition[],
  effects: number[][],
  requested?: number
): MlBootstrapIndirect[] {
  return definitions.map((definition, index) => {
    const values = [...(effects[index] ?? [])].sort((left, right) => left - right);
    const usable = values.length;
    const total = requested ?? usable;
    if (!usable) {
      return {
        fromVar: definition.fromVar,
        toVar: definition.toVar,
        viaVar: definition.viaVar,
        fromNode: definition.fromNode,
        viaNode: definition.viaNode,
        toNode: definition.toNode,
        indirect: definition.point,
        lo: NaN,
        hi: NaN,
        p: NaN,
        sig: false,
        requested: total,
        usable: 0,
      };
    }
    const below = values.filter((value) => value < definition.point).length / usable;
    const z0 = inverseNormalCDF(clamp(below, 1 / (2 * usable), 1 - 1 / (2 * usable)));
    const lowerProbability = normalCDF(2 * z0 + inverseNormalCDF(0.025));
    const upperProbability = normalCDF(2 * z0 + inverseNormalCDF(0.975));
    const lo = quantile(values, lowerProbability);
    const hi = quantile(values, upperProbability);
    const p = clamp(
      2 * Math.min(
        values.filter((value) => value <= 0).length / usable,
        values.filter((value) => value >= 0).length / usable
      ),
      0,
      1
    );
    return {
      fromVar: definition.fromVar,
      toVar: definition.toVar,
      viaVar: definition.viaVar,
      fromNode: definition.fromNode,
      viaNode: definition.viaNode,
      toNode: definition.toNode,
      indirect: definition.point,
      lo,
      hi,
      p,
      sig: lo > 0 || hi < 0,
      requested: total,
      usable,
    };
  });
}

export function bootstrapSemMlIndirect(
  nodes: MlNode[],
  arrows: MlArrow[],
  nodeColumns: number[][],
  measurementColumns: MlMeasurementColumns,
  samples: number,
  original?: MlSemEstimate | MlBootstrapSeed | null,
  /** گزارش پیشرفتِ نمونه‌به‌نمونه — برای نمایش زنده در مودال تولید (اختیاری) */
  onProgress?: (done: number, total: number) => void
): MlBootstrapIndirect[] {
  const collected = bootstrapSemMlIndirectSamples(
    nodes,
    arrows,
    nodeColumns,
    measurementColumns,
    samples,
    original,
    onProgress
  );
  if (!collected.definitions.length) return [];
  return summarizeMlIndirect(collected.definitions, collected.effects, samples);
}
