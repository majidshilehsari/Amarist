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
  return { implied, latentCov, structural, loadings: lambda, disturbances };
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

function optimizeBfgs(
  fn: (x: number[]) => number,
  start: number[],
  maxIterations = 350
): { x: number[]; fx: number; iterations: number; converged: boolean } {
  let x = [...start];
  let fx = fn(x);
  let gradient = numericalGradient(fn, x);
  let inverseHessian = identity(x.length);
  let converged = false;
  let iteration = 0;
  for (; iteration < maxIterations; iteration++) {
    if (vectorNorm(gradient) < 1e-6) {
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
    const candidateGradient = numericalGradient(fn, candidate);
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
    if (change < 1e-10 && vectorNorm(gradient) < 1e-4) {
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

export function estimateSemMl(
  nodes: MlNode[],
  arrows: MlArrow[],
  nodeColumns: number[][],
  measurementColumns: MlMeasurementColumns,
  options: { computeStandardErrors?: boolean; maxIterations?: number; start?: number[]; multipleStarts?: boolean } = {}
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
  let optimum = optimizeBfgs(objectiveFn, candidates[0], options.maxIterations ?? 350);
  for (let index = 1; index < candidates.length; index++) {
    const candidate = optimizeBfgs(objectiveFn, candidates[index], options.maxIterations ?? 350);
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
      message,
    };
  }

  let parameterCovariance: Matrix | null = null;
  if (options.computeStandardErrors !== false) {
    const hessian = numericalHessian(objectiveFn, optimum.x);
    const inverse = hessian ? inverseGeneral(hessian) : null;
    if (inverse) parameterCovariance = scaleMatrix(inverse, 2 / Math.max(1, model.n - 1));
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
    message: fit.message,
  };
}

export type MlBootstrapIndirect = {
  fromVar: number;
  toVar: number;
  viaVar: number | null;
  indirect: number;
  lo: number;
  hi: number;
  p: number;
  sig: boolean;
  requested: number;
  usable: number;
};

function quantile(sorted: number[], probability: number): number {
  if (!sorted.length) return NaN;
  const position = clamp(probability, 0, 1) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

export function bootstrapSemMlIndirect(
  nodes: MlNode[],
  arrows: MlArrow[],
  nodeColumns: number[][],
  measurementColumns: MlMeasurementColumns,
  samples: number,
  original?: MlSemEstimate
): MlBootstrapIndirect[] {
  const active = arrows.filter((arrow) => arrow.active);
  const allObserved = nodes.flatMap((node) => {
    const supplied = measurementColumns[node.nodeId] ?? [];
    return supplied.length ? supplied : [nodeColumns[node.nodeId]];
  });
  if (!allObserved.length) return [];
  const rawN = Math.min(...allObserved.map((column) => column.length));
  const completeRows = Array.from({ length: rawN }, (_, row) => row).filter((row) =>
    allObserved.every((column) => Number.isFinite(column[row]))
  );
  if (completeRows.length < 10) return [];
  const full = original?.valid
    ? original
    : estimateSemMl(nodes, active, nodeColumns, measurementColumns, { computeStandardErrors: false });
  if (!full.valid) return [];

  const pathValue = (estimate: MlSemEstimate, fromNode: number, toNode: number) =>
    estimate.paths.find((path) => path.from === fromNode && path.to === toNode)?.std ?? 0;
  const definitions: { fromVar: number; toVar: number; viaVar: number | null; effects: number[]; point: number }[] = [];
  const exogenousVars = [...new Set(nodes.filter((node) => node.role === "exogenous").map((node) => node.varId))];
  const mediatorVars = [...new Set(nodes.filter((node) => node.role === "mediator").map((node) => node.varId))];
  const outcomeVars = [...new Set(nodes.filter((node) => node.role === "outcome").map((node) => node.varId))];
  for (const fromVar of exogenousVars) {
    for (const toVar of outcomeVars) {
      const fromNodes = nodes.filter((node) => node.varId === fromVar);
      const toNodes = nodes.filter((node) => node.varId === toVar);
      const validMediators = mediatorVars.filter((viaVar) =>
        active.some((arrow) => arrow.fromVar === fromVar && arrow.toVar === viaVar) &&
        active.some((arrow) => arrow.fromVar === viaVar && arrow.toVar === toVar)
      );
      for (const viaVar of validMediators) {
        const viaNodes = nodes.filter((node) => node.varId === viaVar);
        let point = 0;
        for (const from of fromNodes) {
          for (const via of viaNodes) {
            for (const to of toNodes) point += pathValue(full, from.nodeId, via.nodeId) * pathValue(full, via.nodeId, to.nodeId);
          }
        }
        definitions.push({ fromVar, toVar, viaVar, effects: [], point });
      }
      if (validMediators.length > 1) {
        const point = definitions
          .filter((definition) => definition.fromVar === fromVar && definition.toVar === toVar && definition.viaVar != null)
          .reduce((sum, definition) => sum + definition.point, 0);
        definitions.push({ fromVar, toVar, viaVar: null, effects: [], point });
      }
    }
  }
  if (!definitions.length) return [];

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
      bootNodes[node.nodeId] = columns.length === 1
        ? columns[0]
        : columns[0].map((_, row) => columns.reduce((sum, column) => sum + column[row], 0));
    }
    const estimate = estimateSemMl(nodes, active, bootNodes, bootMeasurements, {
      computeStandardErrors: false,
      maxIterations: 45,
      start: full.parameterVector,
      multipleStarts: false,
    });
    if (!estimate.valid) continue;
    for (const definition of definitions) {
      const fromNodes = nodes.filter((node) => node.varId === definition.fromVar);
      const toNodes = nodes.filter((node) => node.varId === definition.toVar);
      const mediators = definition.viaVar == null
        ? mediatorVars.filter((viaVar) =>
            active.some((arrow) => arrow.fromVar === definition.fromVar && arrow.toVar === viaVar) &&
            active.some((arrow) => arrow.fromVar === viaVar && arrow.toVar === definition.toVar)
          )
        : [definition.viaVar];
      let effect = 0;
      for (const viaVar of mediators) {
        for (const from of fromNodes) {
          for (const via of nodes.filter((node) => node.varId === viaVar)) {
            for (const to of toNodes) {
              effect += pathValue(estimate, from.nodeId, via.nodeId) * pathValue(estimate, via.nodeId, to.nodeId);
            }
          }
        }
      }
      definition.effects.push(effect);
    }
  }

  return definitions.map((definition) => {
    const effects = [...definition.effects].sort((left, right) => left - right);
    const usable = effects.length;
    if (!usable) {
      return {
        fromVar: definition.fromVar,
        toVar: definition.toVar,
        viaVar: definition.viaVar,
        indirect: definition.point,
        lo: NaN,
        hi: NaN,
        p: NaN,
        sig: false,
        requested: samples,
        usable: 0,
      };
    }
    const below = effects.filter((effect) => effect < definition.point).length / usable;
    const z0 = inverseNormalCDF(clamp(below, 1 / (2 * usable), 1 - 1 / (2 * usable)));
    const lowerProbability = normalCDF(2 * z0 + inverseNormalCDF(0.025));
    const upperProbability = normalCDF(2 * z0 + inverseNormalCDF(0.975));
    const lo = quantile(effects, lowerProbability);
    const hi = quantile(effects, upperProbability);
    const p = clamp(
      2 * Math.min(
        effects.filter((effect) => effect <= 0).length / usable,
        effects.filter((effect) => effect >= 0).length / usable
      ),
      0,
      1
    );
    return {
      fromVar: definition.fromVar,
      toVar: definition.toVar,
      viaVar: definition.viaVar,
      indirect: definition.point,
      lo,
      hi,
      p,
      sig: lo > 0 || hi < 0,
      requested: samples,
      usable,
    };
  });
}
