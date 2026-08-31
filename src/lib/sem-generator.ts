// ============================================================
// موتور تولید داده تمرینی برای مدل معادلات ساختاری (SEM) و تحلیل مسیر — آماریست
// مدل گره‌ای: متغیر جمع‌پذیر (نمره کل) یا غیرجمع‌پذیر (زیرمقیاس‌های مستقل)
// ============================================================

import { clamp, randomNormal } from "./statistics";
import {
  estimateSem,
  bootstrapIndirectEffects,
  correlationMatrixWithP,
  kurtosis,
  skewness,
  type ModelArrow,
  type ModelNode,
  type Role,
  type SemMeasurementColumns,
  type SemResults,
  type IndirectBootRow,
} from "./sem-stats";

/** هر زیرمقیاس می‌تواند دامنه نمره مستقل خودش را داشته باشد */
export type SubscaleSpec = { name: string; min: number; max: number };

export type VariableSpec = {
  id: number;
  name: string;
  role: Role;
  /** جمع‌پذیر بودن: آیا نمره کل دارد؟ */
  hasTotal: boolean;
  totalMin: number;
  totalMax: number;
  subscales: SubscaleSpec[];
};

/** جهتِ رابطهٔ مورد انتظار برای یک مسیر */
export type PathDirection = "pos" | "neg" | "any";

export type PathTarget = {
  sig: "sig" | "ns" | "any";
  betaMin: number | null;
  betaMax: number | null;
  /** جهتِ رابطه؛ اگر تنظیم نشود از دانشِ نظریِ سازه‌ها استنتاج می‌شود */
  dir?: PathDirection;
};

/** بازهٔ پیش‌فرضِ داورپسند برای قدرمطلق ضریب مسیر استانداردشده */
export const DEFAULT_BETA_MIN = 0.1;
export const DEFAULT_BETA_MAX = 0.5;

/**
 * نخستین مقدارِ واقعاً تنظیم‌شده را برمی‌گرداند. `null` یعنی کاربر عمداً فیلد را
 * خالی کرده و قید را برداشته است؛ `undefined` یعنی هنوز تنظیمی انجام نشده و باید
 * به مقدارِ بعدی (در نهایت پیش‌فرض) برسیم. عملگر `??` این تفاوت را از بین می‌برد.
 */
function pickBeta(...values: (number | null | undefined)[]): number | null {
  for (const value of values) if (value !== undefined) return value;
  return null;
}

export type IndirectTarget = "sig" | "ns" | "any";
export type IndirectConstraint = {
  significance: IndirectTarget;
  min: number | null;
  max: number | null;
  /** جهتِ اثر غیرمستقیم؛ undefined یعنی استنتاج خودکار از واحدهای مسیر */
  dir?: PathDirection;
};

export function defaultIndirectConstraint(): IndirectConstraint {
  // کفِ ۰٫۰۶ به‌جای ۰٫۱۰: اثر غیرمستقیم حاصل‌ضربِ دو ضریب است (a×b). وقتی متغیر نتیجه
  // چند پیش‌بین دارد و R² در بازهٔ واقع‌گرایانه (۰٫۳ تا ۰٫۶) مهار می‌شود، هر ضریب حدود
  // ۰٫۳ از آب درمی‌آید و حاصل‌ضرب به‌طور طبیعی حدود ۰٫۰۶ تا ۰٫۱۵ می‌شود. کفِ ۰٫۱۰ در
  // چنین مدل‌هایی عملاً دست‌نیافتنی بود و تولید را بی‌دلیل ناموفق می‌کرد.
  return { significance: "sig", min: 0.06, max: 0.3 };
}

function resolveIndirectConstraint(value: IndirectConstraint | IndirectTarget | undefined): IndirectConstraint {
  if (typeof value === "string") return { ...defaultIndirectConstraint(), significance: value };
  return { ...defaultIndirectConstraint(), ...(value ?? {}) };
}

// ============================================================
// جهتِ رابطه (مثبت / منفی) — استنتاج از دانشِ نظری
// ============================================================

/**
 * کلیدواژه‌های سازه‌های ناسازگار/نامطلوب (افزایش‌شان بد است).
 * ترتیبِ بررسی مهم است: ابتدا این فهرست چک می‌شود تا عبارت‌هایی مانند
 * «تنظیم هیجان — فرونشانی هیجانی» اشتباهاً مثبت تشخیص داده نشوند.
 */
const NEGATIVE_KEYWORDS = [
  "اعتیاد", "وابستگی", "پرخاشگر", "خشم", "خصومت", "ناکامی", "اضطراب", "افسردگ",
  "استرس", "تنهایی", "نشخوار", "فرونشانی", "سرکوب", "اجتناب", "قلدری",
  "فرسودگی", "تکانشگر", "اهمال", "شرم", "ترس", "نگرانی", "پریشانی",
  "ناامیدی", "درماندگی", "بدبینی", "حسادت", "خودانتقادی", "مشکل", "اختلال", "آسیب",
];

/** کلیدواژه‌های سازه‌های سازگار/مطلوب (افزایش‌شان خوب است) */
const POSITIVE_KEYWORDS = [
  "ارزیابی مجدد", "تنظیم هیجان", "تاب‌آور", "تاب آور", "حمایت اجتماعی", "بهزیست",
  "رضایت", "شادکام", "خوش‌بین", "خوش بین", "امیدواری", "خودکارآمد", "خودمختار", "شایستگی",
  "سلامت", "هوش هیجانی", "ذهن‌آگاه", "ذهن آگاه", "بخشایش", "قدردانی", "سپاسگزاری",
  "همدلی", "نوع‌دوست", "نوع دوست", "معنا", "انگیزش", "خودکنترل", "سازگاری", "مهارت",
  "عزت‌نفس", "عزت نفس", "پذیرش", "انعطاف‌پذیر", "شفقت", "حل مسئله", "مقابله",
];

/** قطبیتِ یک سازه: ۱ = سازگار/مطلوب، ۱- = ناسازگار/نامطلوب، ۰ = نامشخص */
export function valenceOfLabel(label: string): 1 | -1 | 0 {
  const text = (label ?? "").trim();
  if (!text) return 0;
  for (const word of NEGATIVE_KEYWORDS) if (text.includes(word)) return -1;
  for (const word of POSITIVE_KEYWORDS) if (text.includes(word)) return 1;
  return 0;
}

/**
 * جهتِ مورد انتظارِ رابطه: دو سازهٔ هم‌قطب رابطهٔ مثبت و دو سازهٔ ناقطب
 * رابطهٔ منفی دارند. مثالِ کلاسیک: «ارزیابی مجددِ شناختی» (سازگار) با
 * «اعتیاد به اینترنت/بازی» (ناسازگار) رابطهٔ معکوس دارد.
 */
export function inferPathDirection(fromLabel: string, toLabel: string): PathDirection {
  const a = valenceOfLabel(fromLabel);
  const b = valenceOfLabel(toLabel);
  if (a === 0 || b === 0) return "any";
  return a === b ? "pos" : "neg";
}

/**
 * جهت خودکار اثر غیرمستقیم. حاصل‌ضرب جهت دو پارهٔ مسیر با جهت نظریِ مبدأ تا مقصد
 * یکسان است؛ اگر قطبیت روشن نباشد «مهم نیست» برمی‌گردد.
 */
export function inferIndirectDirection(fromLabel: string, toLabel: string): PathDirection {
  return inferPathDirection(fromLabel, toLabel);
}

/** حاشیهٔ قبولی قید جهت؛ مقدار منفی یعنی این تلاش باید رد شود. */
export function indirectDirectionMargin(effect: number, direction: PathDirection): number {
  if (direction === "pos") return effect - 1e-6;
  if (direction === "neg") return -effect - 1e-6;
  return Number.POSITIVE_INFINITY;
}

/**
 * کلیدِ قیدِ اختصاصیِ یک فلش. برخلافِ قیدِ سطحِ متغیر که با شناسهٔ عددیِ متغیر ساخته
 * می‌شود، این کلید از «برچسبِ دو گره» ساخته می‌شود (مثلاً
 * «تنظیم هیجان — ارزیابی مجدد شناختی → احساس ناکامی (کل)»). دلیلش این است که شمارهٔ
 * گره‌ها با هر تغییر در فهرستِ متغیرها/زیرمقیاس‌ها عوض می‌شود، اما برچسب پایدار می‌ماند؛
 * بنابراین تنظیمِ اختصاصیِ کاربر با جابه‌جاییِ متغیرها از بین نمی‌رود.
 */
export function nodePathKey(fromLabel: string, toLabel: string): string {
  return `${fromLabel}→${toLabel}`;
}

function nodePathKeyOf(nodes: ModelNode[], arrow: ModelArrow): string {
  const fromLabel = nodes.find((n) => n.nodeId === arrow.fromNode)?.label ?? "";
  const toLabel = nodes.find((n) => n.nodeId === arrow.toNode)?.label ?? "";
  return nodePathKey(fromLabel, toLabel);
}

/**
 * قیدِ مؤثرِ «یک فلشِ مشخص». این نسخه برای متغیرهای غیرجمع‌پذیر لازم است،
 * چون زیرمقیاس‌های یک متغیر می‌توانند جهتِ متفاوتی داشته باشند؛ مثلاً در ERQ،
 * «ارزیابی مجددِ شناختی» (سازگار) با پیامدهای منفی رابطهٔ معکوس دارد، اما
 * «فرونشانیِ هیجانی» (ناسازگار) رابطهٔ مستقیم.
 */
export function resolvePathTargetForArrow(
  constraints: GenConstraints,
  nodes: ModelNode[],
  arrow: ModelArrow
): Required<PathTarget> {
  const explicit = constraints.pathTargets[`${arrow.fromVar}:${arrow.toVar}`];
  const nodeLevel = constraints.nodePathTargets?.[nodePathKeyOf(nodes, arrow)];
  const fromLabel = nodes.find((n) => n.nodeId === arrow.fromNode)?.label ?? "";
  const toLabel = nodes.find((n) => n.nodeId === arrow.toNode)?.label ?? "";
  return {
    sig: nodeLevel?.sig ?? explicit?.sig ?? "sig",
    betaMin: pickBeta(nodeLevel?.betaMin, explicit?.betaMin, DEFAULT_BETA_MIN),
    betaMax: pickBeta(nodeLevel?.betaMax, explicit?.betaMax, DEFAULT_BETA_MAX),
    dir: nodeLevel?.dir ?? explicit?.dir ?? inferPathDirection(fromLabel, toLabel),
  };
}

/** قیدِ مؤثرِ مسیر بر اساسِ کلیدِ جفت‌متغیر (وقتی فلشِ خاصی در دسترس نیست) */
export function resolveAutomaticIndirectDirection(
  constraints: GenConstraints,
  nodes: ModelNode[],
  arrows: ModelArrow[],
  fromNode: number,
  viaNodes: number[],
  toNode: number
): PathDirection {
  const fromLabel = nodes.find((node) => node.nodeId === fromNode)?.label ?? "";
  const toLabel = nodes.find((node) => node.nodeId === toNode)?.label ?? "";
  const fallback = inferIndirectDirection(fromLabel, toLabel);
  const directions = viaNodes.map((viaNode) => {
    const first = arrows.find((arrow) => arrow.fromNode === fromNode && arrow.toNode === viaNode);
    const second = arrows.find((arrow) => arrow.fromNode === viaNode && arrow.toNode === toNode);
    if (!first || !second) return fallback;
    const left = resolvePathTargetForArrow(constraints, nodes, first).dir;
    const right = resolvePathTargetForArrow(constraints, nodes, second).dir;
    if (left === "any" || right === "any") return fallback;
    return left === right ? "pos" : "neg";
  });
  const concrete = directions.filter((direction) => direction !== "any");
  if (!concrete.length) return fallback;
  return concrete.every((direction) => direction === concrete[0]) ? concrete[0] : "any";
}

export function resolvePathTarget(
  constraints: GenConstraints,
  nodes: ModelNode[],
  arrows: ModelArrow[],
  key: string
): Required<PathTarget> {
  const explicit = constraints.pathTargets[key];
  const arrow = arrows.find((a) => `${a.fromVar}:${a.toVar}` === key);
  const fromLabel = arrow ? nodes.find((n) => n.nodeId === arrow.fromNode)?.label ?? "" : "";
  const toLabel = arrow ? nodes.find((n) => n.nodeId === arrow.toNode)?.label ?? "" : "";
  return {
    sig: explicit?.sig ?? "sig",
    betaMin: pickBeta(explicit?.betaMin, DEFAULT_BETA_MIN),
    betaMax: pickBeta(explicit?.betaMax, DEFAULT_BETA_MAX),
    dir: explicit?.dir ?? inferPathDirection(fromLabel, toLabel),
  };
}

// ============================================================
// همبستگیِ واقع‌گرایانه میان پیش‌بین‌های برون‌زا
// ============================================================

/** بازهٔ همبستگیِ دو پیش‌بینِ برون‌زا از دو پرسشنامهٔ متفاوت */
const EXOG_CORR_MIN = 0.28;
const EXOG_CORR_MAX = 0.45;
/**
 * اندازهٔ «بارِ متقاطعِ فرعی»: در دادهٔ واقعی برخی گویه‌ها علاوه بر سازهٔ اصلی، روی
 * سازهٔ دیگری هم بارِ اندکی دارند. اگر داده دقیقاً طبقِ مدل تولید شود، برازش «بیش از حد
 * کامل» می‌شود (CFI≈۰٫۹۹۵ و RMSEA≈۰٫۰۲) که برای دادهٔ تمرینی غیرواقعی است و از سقفِ
 * واقع‌گرایانهٔ قیود عبور می‌کند. این مقدارِ اندک، نابرازشیِ ملایم و واقع‌گرایانه می‌سازد.
 */
const CROSS_LOADING = 0.15;

/** بازهٔ همبستگیِ دو زیرمقیاس از یک پرسشنامهٔ واحد (واریانسِ روشِ مشترک) */
const SAME_VAR_CORR_MIN = 0.25;
const SAME_VAR_CORR_MAX = 0.45;
/** سقفِ محافظه‌کارانهٔ هم‌خطی در ماتریسِ پیش‌بین‌های برون‌زا */
const EXOG_MAX_VIF = 4;

/** تجزیهٔ چولسکیِ پایین‌مثلثی؛ اگر ماتریس مثبت‌معین نباشد null برمی‌گرداند */
export function choleskyLower(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  const lower: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
  for (let i = 0; i < size; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = matrix[i][j];
      for (let k = 0; k < j; k++) sum -= lower[i][k] * lower[j][k];
      if (i === j) {
        if (!(sum > 1e-10)) return null;
        lower[i][j] = Math.sqrt(sum);
      } else {
        lower[i][j] = sum / (lower[j][j] || 1e-10);
      }
    }
  }
  return lower;
}

/** وارون‌سازی گاوس–ژردن؛ برای ماتریس تکین null برمی‌گرداند. */
export function invertMatrix(matrix: number[][]): number[][] | null {
  const size = matrix.length;
  if (!size || matrix.some((row) => row.length !== size)) return null;
  const augmented = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)),
  ]);
  for (let col = 0; col < size; col++) {
    let pivot = col;
    for (let row = col + 1; row < size; row++) {
      if (Math.abs(augmented[row][col]) > Math.abs(augmented[pivot][col])) pivot = row;
    }
    if (Math.abs(augmented[pivot][col]) < 1e-10) return null;
    [augmented[col], augmented[pivot]] = [augmented[pivot], augmented[col]];
    const divisor = augmented[col][col];
    for (let j = 0; j < size * 2; j++) augmented[col][j] /= divisor;
    for (let row = 0; row < size; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      for (let j = 0; j < size * 2; j++) augmented[row][j] -= factor * augmented[col][j];
    }
  }
  return augmented.map((row) => row.slice(size));
}

/** در ماتریس همبستگی، VIF هر پیش‌بین درایهٔ قطریِ ماتریس وارون است. */
export function maxVifOfCorrelation(matrix: number[][]): number {
  if (matrix.length <= 1) return 1;
  const inverse = invertMatrix(matrix);
  if (!inverse) return Number.POSITIVE_INFINITY;
  return Math.max(...inverse.map((row, index) => row[index]));
}

/**
 * ماتریس همبستگیِ پیش‌بین‌های برون‌زا. علامت از قطبیتِ سازه‌ها می‌آید و
 * اندازه از یک بازهٔ واقع‌گرایانه؛ اگر ماتریس مثبت‌معین نبود همبستگی‌ها
 * کوچک می‌شوند تا بشود (و در بدترین حالت به استقلال برمی‌گردیم).
 */
export function buildExogenousCorrelation(labels: string[], varIds: number[]): number[][] {
  const size = labels.length;
  const valence = labels.map(valenceOfLabel);
  for (let shrink = 1; shrink > 0.05; shrink *= 0.85) {
    const matrix: number[][] = Array.from({ length: size }, (_, i) =>
      Array.from({ length: size }, (_, j) => (i === j ? 1 : 0))
    );
    for (let i = 0; i < size; i++) {
      for (let j = i + 1; j < size; j++) {
        let value: number;
        if (varIds[i] === varIds[j]) {
          value = rand(SAME_VAR_CORR_MIN * shrink, SAME_VAR_CORR_MAX * shrink);
        } else {
          const a = valence[i];
          const b = valence[j];
          const sign = a !== 0 && b !== 0 ? a * b : 1;
          value = sign * rand(EXOG_CORR_MIN * shrink, EXOG_CORR_MAX * shrink);
        }
        matrix[i][j] = value;
        matrix[j][i] = value;
      }
    }
    if (size <= 1) return matrix;
    if (choleskyLower(matrix) && maxVifOfCorrelation(matrix) <= EXOG_MAX_VIF) return matrix;
  }
  return Array.from({ length: size }, (_, i) => Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)));
}

export type FitRange = { min: number | null; max: number | null };

export type SemFitConstraints = {
  chi2: FitRange;
  df: FitRange;
  pValue: FitRange;
  cminDf: FitRange;
  rmsea: FitRange;
  rmseaCiHigh: FitRange;
  pnfi: FitRange;
  cfi: FitRange;
  pcfi: FitRange;
  ifi: FitRange;
  gfi: FitRange;
  srmr: FitRange;
};

export function defaultSemFitConstraints(): SemFitConstraints {
  return {
    chi2: { min: null, max: null },
    df: { min: null, max: null },
    pValue: { min: 0.05, max: 0.5 },
    cminDf: { min: 1, max: 3 },
    rmsea: { min: 0.03, max: 0.08 },
    rmseaCiHigh: { min: null, max: 0.1 },
    pnfi: { min: null, max: 0.95 },
    cfi: { min: 0.9, max: 0.99 },
    pcfi: { min: null, max: 0.95 },
    ifi: { min: 0.9, max: 0.99 },
    gfi: { min: 0.9, max: 0.99 },
    srmr: { min: 0.02, max: 0.08 },
  };
}

function resolveSemFitConstraints(constraints: GenConstraints): SemFitConstraints {
  const defaults = defaultSemFitConstraints();
  const legacy = constraints as GenConstraints & {
    cfiMin?: number;
    rmseaMax?: number;
    chi2dfMax?: number;
    srmrMax?: number;
  };
  const fit = Object.fromEntries(
    (Object.keys(defaults) as (keyof SemFitConstraints)[]).map((key) => [
      key,
      { ...defaults[key], ...(constraints.fit?.[key] ?? {}) },
    ])
  ) as SemFitConstraints;
  if (!constraints.fit) {
    if (legacy.cfiMin != null) fit.cfi.min = legacy.cfiMin;
    if (legacy.rmseaMax != null) fit.rmsea.max = legacy.rmseaMax;
    if (legacy.chi2dfMax != null) fit.cminDf.max = legacy.chi2dfMax;
    if (legacy.srmrMax != null) fit.srmr.max = legacy.srmrMax;
  }
  return fit;
}

export type GenConstraints = {
  /** قید مسیرها به شکل «varFrom:varTo» */
  pathTargets: Record<string, PathTarget>;
  /**
   * قیدِ اختصاصیِ مسیرها به شکل «nodeFrom:nodeTo» — برای پرسشنامه‌های غیرجمع‌پذیر.
   * چون زیرمقیاس‌های یک متغیر می‌توانند جهتِ اثرِ متفاوتی داشته باشند (مثلاً در ERQ،
   * «ارزیابی مجددِ شناختی» با پیامدهای منفی رابطهٔ معکوس دارد اما «فرونشانیِ هیجانی»
   * رابطهٔ مستقیم)، این قید اجازه می‌دهد برای هر زیرمقیاس جداگانه تعیین کرد که اثرش
   * مثبت و معنادار باشد یا منفی و معنادار. مقدارِ این کلید بر قیدِ سطحِ متغیر مقدم است.
   */
  nodePathTargets?: Record<string, PathTarget>;
  /** قید اثر غیرمستقیم: «from:to» (کل) و «from:med:to» (هر مسیر میانجی) */
  indirectTargets: Record<string, IndirectConstraint>;
  r2Range: { min: number; max: number } | null;
  fit: SemFitConstraints;
  missingPct: number;
  outlierPct: number;
  enforceNormality: boolean;
  enforceLinearity: boolean;
  /** همبستگیِ همهٔ جفت‌های پیش‌بینِ برون‌زا باید معنادار باشد */
  enforceExogCorr: boolean;
  enforceVif: boolean;
  enforceDw: boolean;
  bootSamples: number;
  /** بیشینهٔ تعداد تلاش‌های تولید؛ کاربر می‌تواند آن را تنظیم کند */
  maxAttempts: number;
};

export type SemGenInput = {
  n: number;
  variables: VariableSpec[];
  arrows: ModelArrow[];
  constraints: GenConstraints;
};

export type SemAnswerKey = {
  pathTargets: { fromNode: number; toNode: number; target: number; actual: number }[];
  fit: SemResults["fit"];
  attempts: number;
  r2Range: { min: number; max: number } | null;
};

export type SemGenOutput = {
  columns: string[];
  rows: (number | null)[][];
  nodes: ModelNode[];
  nodeCols: number[][];
  answerKey: SemAnswerKey;
  /** گزارشِ شفافِ وضعیتِ همهٔ قیود در بهترین خروجی */
  report: SemConstraintReport;
  /** آیا همهٔ قیود در خروجی رعایت شده است؟ */
  success: boolean;
  /** تعداد تلاش‌های مصرف‌شده */
  attempts: number;
  /** آیا کاربر تولید را متوقف کرده است؟ */
  cancelled: boolean;
  /** تعداد راستی‌آزمایی‌های انجام‌شده با بوت‌استرپ ML */
  verifications: number;
  /** آیا قید اثر غیرمستقیم با بوت‌استرپ ML راستی‌آزمایی شده است؟ */
  indirectVerified: boolean;
};

// ---------- ساخت گره‌ها و فلش‌ها ----------

export function buildModelNodes(vars: VariableSpec[]): ModelNode[] {
  const nodes: ModelNode[] = [];
  let nid = 0;
  for (const v of vars) {
    if (v.subscales.length === 0) {
      nodes.push({ nodeId: nid++, varId: v.id, label: v.name, kind: "single", role: v.role });
    } else if (v.hasTotal) {
      nodes.push({ nodeId: nid++, varId: v.id, label: `${v.name} (کل)`, kind: "total", role: v.role });
    } else {
      for (const s of v.subscales) {
        nodes.push({ nodeId: nid++, varId: v.id, label: `${v.name} — ${s.name}`, kind: "sub", role: v.role });
      }
    }
  }
  return nodes;
}

export function buildModelArrows(nodes: ModelNode[]): ModelArrow[] {
  const exogIds = [...new Set(nodes.filter((n) => n.role === "exogenous").map((n) => n.varId))];
  const medIds = [...new Set(nodes.filter((n) => n.role === "mediator").map((n) => n.varId))];
  const outIds = [...new Set(nodes.filter((n) => n.role === "outcome").map((n) => n.varId))];
  const pairs: [number, number][] = [];
  exogIds.forEach((e) => medIds.forEach((m) => pairs.push([e, m])));
  exogIds.forEach((e) => outIds.forEach((o) => pairs.push([e, o])));
  medIds.forEach((m) => outIds.forEach((o) => pairs.push([m, o])));
  const arrows: ModelArrow[] = [];
  let aid = 0;
  for (const [fv, tv] of pairs) {
    const fromNodes = nodes.filter((n) => n.varId === fv);
    const toNodes = nodes.filter((n) => n.varId === tv);
    for (const f of fromNodes) {
      for (const t of toNodes) {
        arrows.push({
          id: `a${aid++}`,
          fromNode: f.nodeId,
          toNode: t.nodeId,
          fromVar: fv,
          toVar: tv,
          active: true,
        });
      }
    }
  }
  return arrows;
}

// ---------- ابزارهای داخلی ----------

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

type Scale = { mn: number; mx: number; mean: number; sd: number };

function scaleOf(v: VariableSpec, s?: { min: number; max: number }): Scale {
  const mn = s ? s.min : v.totalMin;
  const mx = s ? s.max : v.totalMax;
  return { mn, mx, mean: (mn + mx) / 2, sd: Math.max(0.6, (mx - mn) / 5) };
}

function toScale(sc: Scale, z: number): number {
  return Math.round(clamp(sc.mean + z * sc.sd, sc.mn, sc.mx));
}

// ---------- گزارش وضعیت قیود ----------

export type ConstraintGroup =
  | "مسیر مستقیم"
  | "اثر غیرمستقیم"
  | "برازش مدل"
  | "R² متغیر نتیجه"
  | "پیش‌فرض‌های آماری";

export type ConstraintCheck = {
  group: ConstraintGroup;
  label: string;
  requirement: string;
  actual: string;
  /** حاشیهٔ قید: بزرگ‌تر یا مساویِ صفر یعنی قید رعایت شده است */
  margin: number;
  status: "pass" | "fail";
};

export type SemConstraintReport = {
  checks: ConstraintCheck[];
  total: number;
  passed: number;
  failed: number;
  /** کمترین حاشیه در میان همهٔ قیود؛ عدد منفی یعنی دست‌کم یک قید نقض شده است */
  score: number;
  allPassed: boolean;
  estimator: "ml" | "approx";
  bootstrapSamples: number | null;
  bootstrapEstimator: "ml" | "approx" | null;
  /** پیشنهادهای مشخص برای اینکه قیدهای نقض‌شده قابل‌دستیابی شوند */
  hints: string[];
};

export type SemGenStage =
  | "init"
  | "coefficients"
  | "latents"
  | "columns"
  | "missing"
  | "assumptions"
  | "fit"
  | "bootstrap"
  | "evaluate"
  | "verify"
  | "done";

export const SEM_GEN_STAGE_LABELS: Record<SemGenStage, string> = {
  init: "آماده‌سازی مدل",
  coefficients: "تنظیم ضرایب هدف مسیرها",
  latents: "ساخت نمرات نهفته",
  columns: "ساخت ستون‌های مشاهده‌شده",
  missing: "اعمال داده گمشده و داده پرت",
  assumptions: "بررسی پیش‌فرض‌ها (نرمالیتی و خطی بودن)",
  fit: "برازش مدل با برآوردگر ML",
  bootstrap: "بوت‌استرپ اثر غیرمستقیم (غربال)",
  evaluate: "ارزیابی قیود",
  verify: "راستی‌آزمایی نهایی با بوت‌استرپ ML",
  done: "پایان",
};

export type SemGenProgress = {
  /** شمارهٔ تلاش جاری (از ۱) */
  attempt: number;
  maxAttempts: number;
  stage: SemGenStage;
  stageLabel: string;
  /** پیشرفتِ درونِ مرحله؛ برای مراحل فاقد پیشرفتِ مرحله‌ای، null است */
  stageProgress: number | null;
  bestScore: number;
  bestPassed: number;
  bestTotal: number;
  groupSummary: { group: ConstraintGroup; passed: number; total: number }[];
  verificationsDone: number;
  maxVerifications: number;
  message: string;
};

export type SemGenOptions = {
  /** بیشینهٔ تعداد تلاش‌ها؛ اگر داده نشود از constraints.maxAttempts استفاده می‌شود */
  maxAttempts?: number;
  onProgress?: (progress: SemGenProgress) => void;
  shouldCancel?: () => boolean;
  /** تعداد نمونه‌های بوت‌استرپ در راستی‌آزمایی نهایی (سقف خودکار اعمال می‌شود) */
  verifyBootSamples?: number;
  /** بیشینهٔ تعداد راستی‌آزمایی (هر کدام هزینهٔ بوت‌استرپ ML دارد) */
  maxVerifications?: number;
};

/**
 * مقدار پیش‌فرضِ معقول برای تعداد تلاش‌ها.
 * با قیودِ پیش‌فرضِ برنامه (برازش واقع‌گرایانه با سقف برای CFI/IFI و کف برای RMSEA)
 * احتمالِ پذیرشِ هر تلاش حدود ۲ تا ۳ درصد است؛ ۲۰۰ تلاش شانسِ موفقیت را به حدود ۹۹٪ می‌رساند
 * و در بدترین حالت حدود نیم تا یک دقیقه زمان می‌گیرد (با مودالِ پیشرفت و دکمهٔ توقف).
 */
export const DEFAULT_MAX_ATTEMPTS = 300;
export const MIN_MAX_ATTEMPTS = 1;
export const MAX_MAX_ATTEMPTS = 2000;

/** سقف نمونه‌های بوت‌استرپ در مرحلهٔ غربال ( برآوردگر سریع) */
const SCREEN_BOOT_CAP = 300;
/** سقف نمونه‌های بوت‌استرپ در راستی‌آزمایی نهایی (برآوردگر ML) */
const VERIFY_BOOT_CAP = 300;

/**
 * تلورانسِ عددی برای مقایسهٔ مرزها؛ جلوگیری از مردود شدن به‌خاطر خطای ممیز شناور
 * (مثلاً R² = ۰٫۶۰۰۰۰۰۰۰۰۱ در برابر شرطِ «حداکثر ۰٫۶»).
 */
const MARGIN_EPS = 1e-9;

function fmtNum(value: number, digits = 3): string {
  if (!Number.isFinite(value)) return "—";
  let text = value.toFixed(digits);
  if (text.includes(".")) text = text.replace(/0+$/, "").replace(/\.$/, "");
  return text;
}

function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** واحدِ اثرِ یک متغیر: کلِ متغیر جمع‌پذیر، یا هر زیرمقیاسِ مستقل. */
export type IndirectUnit = {
  varId: number;
  nodeId: number | null;
  label: string;
  nodeIds: number[];
};

/**
 * قانونِ جهانیِ «واحد اثر». متغیرِ چندگرهی نمرهٔ کل ندارد و فقط زیرمقیاس‌هایش
 * واحدهای معتبرند؛ بنابراین در هیچ جایگاهِ مبدأ/میانجی/مقصد ردیفِ کلی نمی‌سازیم.
 */
export function indirectUnitsOfVar(nodes: ModelNode[], varId: number): IndirectUnit[] {
  const group = nodes.filter((node) => node.varId === varId);
  if (!group.length) return [];
  if (group.length > 1) {
    return group.map((node) => ({ varId, nodeId: node.nodeId, label: node.label, nodeIds: [node.nodeId] }));
  }
  return [{ varId, nodeId: null, label: group[0].label, nodeIds: [group[0].nodeId] }];
}

/** کلیدِ پایدارِ قیدِ غیرمستقیم؛ برچسب‌محور تا با جابه‌جاییِ متغیرها از بین نرود. */
export function indirectUnitKey(fromLabel: string, viaLabel: string | null, toLabel: string): string {
  return viaLabel == null
    ? `t∷${fromLabel}∷${toLabel}`
    : `p∷${fromLabel}∷${viaLabel}∷${toLabel}`;
}

function stdPathOf(sem: SemResults, from: number, to: number): number {
  return sem.paths.find((path) => path.from === from && path.to === to)?.std ?? NaN;
}

/** نقطه‌برآوردِ استانداردشدهٔ اثر غیرمستقیمِ ML (همان فرمولِ بوت‌استرپ ML) */
function mlIndirectPoint(
  nodes: ModelNode[],
  sem: SemResults,
  fromVar: number,
  toVar: number,
  viaVar: number | null,
  mediatorVarIds: number[],
  /** محدودسازیِ اختیاریِ هر سه جایگاه به یک زیرمقیاسِ مستقل */
  fromNodeId: number | null = null,
  viaNodeId: number | null = null,
  toNodeId: number | null = null
): number {
  const fromNodes = nodes.filter(
    (node) => node.varId === fromVar && (fromNodeId == null || node.nodeId === fromNodeId)
  );
  const toNodes = nodes.filter(
    (node) => node.varId === toVar && (toNodeId == null || node.nodeId === toNodeId)
  );
  const viaVars = viaVar == null ? mediatorVarIds : [viaVar];
  let sum = 0;
  for (const via of viaVars) {
    for (const viaNode of nodes.filter(
      (node) => node.varId === via && (viaNodeId == null || node.nodeId === viaNodeId)
    )) {
      for (const from of fromNodes) {
        for (const to of toNodes) {
          const a = stdPathOf(sem, from.nodeId, viaNode.nodeId);
          const b = stdPathOf(sem, viaNode.nodeId, to.nodeId);
          if (Number.isFinite(a) && Number.isFinite(b)) sum += a * b;
        }
      }
    }
  }
  return sum;
}

type IndirectConstraintUnit = {
  key: string;
  legacyKey: string;
  fromVar: number;
  viaVar: number | null;
  toVar: number;
  fromNode: number | null;
  viaNode: number | null;
  toNode: number | null;
  autoDir: PathDirection;
  label: string;
};
type EvalContext = {
  nodes: ModelNode[];
  arrows: ModelArrow[];
  activeArrows: ModelArrow[];
  medVars: VariableSpec[];
  outVars: VariableSpec[];
  constraints: GenConstraints;
  fitTargets: SemFitConstraints;
  indirectConstraintUnits: IndirectConstraintUnit[];
};

/**
 * ارزیابیِ یک دادهٔ تولیدشده در برابر همهٔ قیود.
 * نکتهٔ کلیدی: ارزیابی باید با همان برآوردگری انجام شود که برنامه در تحلیل نهایی
 * نشان می‌دهد (ML)، وگرنه قیود در خروجیِ نهایی نقض می‌شوند.
 */
function evaluateAttempt(
  ctx: EvalContext,
  sem: SemResults,
  nodeCols: number[][],
  boot: IndirectBootRow[] | null,
  bootEstimator: "ml" | "approx",
  opts?: { skipPaths?: boolean }
): { checks: ConstraintCheck[]; score: number; allPassed: boolean } {
  const { nodes, arrows, activeArrows, medVars, outVars, constraints, fitTargets, indirectConstraintUnits } = ctx;
  const checks: ConstraintCheck[] = [];
  const push = (group: ConstraintGroup, label: string, requirement: string, actual: string, margin: number) => {
    checks.push({
      group,
      label,
      requirement,
      actual,
      margin: Number.isFinite(margin) ? margin : Number.NEGATIVE_INFINITY,
      status: Number.isFinite(margin) && margin >= -MARGIN_EPS ? "pass" : "fail",
    });
  };

  // ---- قید مسیرهای مستقیم ----
  // رفعِ اشکالِ مهم: پیش‌فرضِ رابط کاربر برای هر مسیر «معنادار باشد» است، بنابراین
  // نبودِ قیدِ صریح هرگز به معنای «چک نکن» نیست؛ قیدِ مؤثر استنتاج و واقعاً سنجیده می‌شود.
  if (!opts?.skipPaths) {
    for (const pr of sem.paths) {
      const arrow = arrows.find((a) => a.fromNode === pr.from && a.toNode === pr.to);
      if (!arrow) continue;
      const t = resolvePathTargetForArrow(constraints, nodes, arrow);
      const fromLabel = nodes.find((n) => n.nodeId === pr.from)?.label ?? "";
      const toLabel = nodes.find((n) => n.nodeId === pr.to)?.label ?? "";
      const label = `${fromLabel} → ${toLabel}`;
      const absBeta = Math.abs(pr.std);
      if (t.sig === "sig") {
        push("مسیر مستقیم", label, "معنادار (p < ۰٫۰۵)", `p = ${fmtNum(pr.p, 4)}`, 0.05 - pr.p);
        // بازهٔ β روی قدرِ مطلق سنجیده می‌شود تا با جهتِ منفی هم سازگار بماند
        if (t.betaMin != null) {
          push("مسیر مستقیم", label, `|β| ≥ ${fmtNum(t.betaMin)}`, `β = ${fmtNum(pr.std)}`, absBeta - t.betaMin);
        }
        if (t.betaMax != null) {
          push("مسیر مستقیم", label, `|β| ≤ ${fmtNum(t.betaMax)}`, `β = ${fmtNum(pr.std)}`, t.betaMax - absBeta);
        }
        // جهتِ رابطه (مثلاً افزایشِ ارزیابی مجددِ شناختی باید اعتیاد را کاهش دهد)
        if (t.dir === "pos") {
          push("مسیر مستقیم", label, "جهتِ رابطه: مثبت (β ≥ ۰٫۰۵)", `β = ${fmtNum(pr.std)}`, pr.std - 0.05);
        } else if (t.dir === "neg") {
          push("مسیر مستقیم", label, "جهتِ رابطه: منفی (β ≤ -۰٫۰۵)", `β = ${fmtNum(pr.std)}`, -pr.std - 0.05);
        }
      } else if (t.sig === "ns") {
        push("مسیر مستقیم", label, "غیرمعنادار (p ≥ ۰٫۰۵)", `p = ${fmtNum(pr.p, 4)}`, pr.p - 0.05);
        push("مسیر مستقیم", label, "|β| ≤ ۰٫۲۰", `β = ${fmtNum(pr.std)}`, 0.2 - absBeta);
      }
    }
  }

  // ---- قید R² ----
  if (constraints.r2Range) {
    for (const v of outVars) {
      for (const node of nodes.filter((x) => x.varId === v.id)) {
        const r2 = sem.r2[node.nodeId] ?? NaN;
        push(
          "R² متغیر نتیجه",
          node.label,
          `بین ${fmtNum(constraints.r2Range.min, 2)} و ${fmtNum(constraints.r2Range.max, 2)}`,
          `R² = ${fmtNum(r2)}`,
          Math.min(r2 - constraints.r2Range.min, constraints.r2Range.max - r2)
        );
      }
    }
  }

  // ---- قید شاخص‌های برازش ----
  const fitRows: { key: keyof SemFitConstraints; label: string; value: number }[] = [
    { key: "chi2", label: "χ²", value: sem.fit.chi2 },
    { key: "df", label: "Df", value: sem.fit.df },
    { key: "pValue", label: "P-value", value: sem.fit.pValue },
    { key: "cminDf", label: "CMIN/df", value: sem.fit.chi2df },
    { key: "rmsea", label: "RMSEA", value: sem.fit.rmsea },
    { key: "rmseaCiHigh", label: "حد بالای CI۹۰٪ RMSEA", value: sem.fit.rmseaHigh },
    { key: "pnfi", label: "PNFI", value: sem.fit.pnfi },
    { key: "cfi", label: "CFI", value: sem.fit.cfi },
    { key: "pcfi", label: "PCFI", value: sem.fit.pcfi },
    { key: "ifi", label: "IFI", value: sem.fit.ifi },
    { key: "gfi", label: "GFI", value: sem.fit.gfi },
    { key: "srmr", label: "SRMR", value: sem.fit.srmr },
  ];
  if (!sem.fit.valid) {
    push("برازش مدل", "برآورد برازش", "مدل باید قابل برآورد باشد", "برآورد نامعتبر", Number.NEGATIVE_INFINITY);
  } else {
    for (const row of fitRows) {
      const range = fitTargets[row.key];
      if (range.min == null && range.max == null) continue;
      const requirement =
        range.min != null && range.max != null
          ? `بین ${fmtNum(range.min)} و ${fmtNum(range.max)}`
          : range.min != null
            ? `≥ ${fmtNum(range.min)}`
            : `≤ ${fmtNum(range.max!)}`;
      const value = row.value;
      const margin = Math.min(
        range.min != null ? value - range.min : Number.POSITIVE_INFINITY,
        range.max != null ? range.max - value : Number.POSITIVE_INFINITY
      );
      push("برازش مدل", row.label, requirement, `= ${fmtNum(value)}`, margin);
    }
  }

  // ---- پیش‌فرض‌های آماری ----
  if (constraints.enforceNormality && constraints.outlierPct === 0) {
    for (const node of nodes) {
      const s = skewness(nodeCols[node.nodeId]);
      const k = kurtosis(nodeCols[node.nodeId]);
      if (Number.isFinite(s)) push("پیش‌فرض‌های آماری", `${node.label} — کجی`, "|کجی| < ۳", `= ${fmtNum(s)}`, 3 - Math.abs(s));
      if (Number.isFinite(k)) push("پیش‌فرض‌های آماری", `${node.label} — کشیدگی`, "|کشیدگی| < ۱۰", `= ${fmtNum(k)}`, 10 - Math.abs(k));
    }
  }

  if (constraints.enforceLinearity) {
    const corr = correlationMatrixWithP(nodeCols);
    for (const a of activeArrows) {
      const fromLabel = nodes.find((n) => n.nodeId === a.fromNode)?.label ?? "";
      const toLabel = nodes.find((n) => n.nodeId === a.toNode)?.label ?? "";
      const p = corr.p[a.fromNode][a.toNode];
      push("پیش‌فرض‌های آماری", `خطی بودن: ${fromLabel} ↔ ${toLabel}`, "همبستگی معنادار (p < ۰٫۰۵)", `p = ${fmtNum(p, 4)}`, 0.05 - p);
    }
  }

  if (constraints.enforceExogCorr) {
    const corr = correlationMatrixWithP(nodeCols);
    const exogenousNodes = nodes.filter((node) => node.role === "exogenous");
    for (let i = 0; i < exogenousNodes.length; i++) {
      for (let j = i + 1; j < exogenousNodes.length; j++) {
        const left = exogenousNodes[i];
        const right = exogenousNodes[j];
        const p = corr.p[left.nodeId]?.[right.nodeId] ?? NaN;
        push(
          "پیش‌فرض‌های آماری",
          `همبستگیِ پیش‌بین‌های برون‌زا: ${left.label} ↔ ${right.label}`,
          "همبستگی معنادار (p < ۰٫۰۵)",
          `p = ${fmtNum(p, 4)}`,
          0.05 - p
        );
      }
    }
  }

  if (constraints.enforceVif) {
    for (const node of nodes) {
      if (node.role === "exogenous") continue;
      const vifs = sem.vifs[node.nodeId] ?? [];
      if (!vifs.length) continue;
      push("پیش‌فرض‌های آماری", `${node.label} — VIF`, "VIF < ۵", `= ${fmtNum(Math.max(...vifs))}`, 5 - Math.max(...vifs));
    }
  }

  if (constraints.enforceDw) {
    for (const node of nodes) {
      if (node.role === "exogenous") continue;
      const dw = sem.dw[node.nodeId];
      push("پیش‌فرض‌های آماری", `${node.label} — دوربین-واتسون`, "بین ۱٫۵ و ۲٫۵", `= ${fmtNum(dw)}`, Math.min(dw - 1.5, 2.5 - dw));
    }
  }

  // ---- قید اثرات غیرمستقیم ----
  const mediatorVarIds = medVars.map((v) => v.id);
  const bootNote = bootEstimator === "ml" ? "بوت‌استرپ ML" : "بوت‌استرپ غربال";
  for (const unit of indirectConstraintUnits) {
    // کلیدِ برچسبی مقدم است؛ کلیدِ عددیِ نسخه‌های قدیمی فقط برای سازگاری خوانده می‌شود.
    const stored = constraints.indirectTargets[unit.key] ?? constraints.indirectTargets[unit.legacyKey];
    const target = resolveIndirectConstraint(stored);
    const point = mlIndirectPoint(
      nodes,
      sem,
      unit.fromVar,
      unit.toVar,
      unit.viaVar,
      mediatorVarIds,
      unit.fromNode,
      unit.viaNode,
      unit.toNode
    );
    if (target.min != null) {
      push("اثر غیرمستقیم", unit.label, `|اثر| ≥ ${fmtNum(target.min)}`, `= ${fmtNum(point)}`, Math.abs(point) - target.min);
    }
    if (target.max != null) {
      push("اثر غیرمستقیم", unit.label, `|اثر| ≤ ${fmtNum(target.max)}`, `= ${fmtNum(point)}`, target.max - Math.abs(point));
    }
    const direction = target.dir ?? unit.autoDir;
    if (direction === "pos") {
      push("اثر غیرمستقیم", unit.label, "جهت اثر: مثبت", `اثر = ${fmtNum(point)}`, indirectDirectionMargin(point, direction));
    } else if (direction === "neg") {
      push("اثر غیرمستقیم", unit.label, "جهت اثر: منفی", `اثر = ${fmtNum(point)}`, indirectDirectionMargin(point, direction));
    }
    if (boot && target.significance !== "any") {
      const bootRow = boot.find(
        (item) =>
          item.fromVar === unit.fromVar &&
          item.toVar === unit.toVar &&
          item.viaVar === unit.viaVar &&
          item.fromNode === unit.fromNode &&
          item.viaNode === unit.viaNode &&
          item.toNode === unit.toNode
      );
      const p = bootRow?.p ?? NaN;
      if (target.significance === "sig") {
        push(
          "اثر غیرمستقیم",
          unit.label,
          `معنادار (${bootNote})`,
          Number.isFinite(p) ? `p = ${fmtNum(p, 4)}` : "بررسی نشد",
          Number.isFinite(p) ? 0.05 - p : Number.NEGATIVE_INFINITY
        );
      } else {
        push(
          "اثر غیرمستقیم",
          unit.label,
          `غیرمعنادار (${bootNote})`,
          Number.isFinite(p) ? `p = ${fmtNum(p, 4)}` : "بررسی نشد",
          Number.isFinite(p) ? p - 0.05 : Number.NEGATIVE_INFINITY
        );
      }
    }
  }

  const score = checks.length ? Math.min(...checks.map((c) => c.margin)) : Number.POSITIVE_INFINITY;
  const allPassed = checks.length > 0 && checks.every((c) => c.status === "pass");
  return { checks, score, allPassed };
}

function summarizeChecks(checks: ConstraintCheck[]): SemConstraintReport {
  const groups: ConstraintGroup[] = [
    "مسیر مستقیم",
    "اثر غیرمستقیم",
    "برازش مدل",
    "R² متغیر نتیجه",
    "پیش‌فرض‌های آماری",
  ];
  const ordered = groups.flatMap((group) => checks.filter((check) => check.group === group));
  const passed = ordered.filter((check) => check.status === "pass").length;
  const score = ordered.length ? Math.min(...ordered.map((check) => check.margin)) : Number.POSITIVE_INFINITY;
  return {
    checks: ordered,
    total: ordered.length,
    passed,
    failed: ordered.length - passed,
    score: Number.isFinite(score) ? score : Number.NEGATIVE_INFINITY,
    allPassed: ordered.length > 0 && passed === ordered.length,
    estimator: "ml",
    bootstrapSamples: null,
    bootstrapEstimator: null,
    hints: [],
  };
}

function buildHints(report: SemConstraintReport): string[] {
  const failed = report.checks.filter((check) => check.status === "fail");
  if (!failed.length) return [];
  const hints: string[] = [];
  for (const check of failed.slice(0, 8)) {
    hints.push(`${check.label}: باید ${check.requirement} باشد اما مقدارِ به‌دست‌آمده ${check.actual} است.`);
  }
  if (failed.some((check) => check.group === "برازش مدل")) {
    hints.push("دامنهٔ شاخص‌های برازش را کمی بازتر کنید (مثلاً بازهٔ RMSEA یا سقف CFI) تا جوابِ قابل‌دستیابی‌تری به دست آید.");
  }
  if (failed.some((check) => check.group === "مسیر مستقیم")) {
    hints.push("برای مسیرهایی که معنادار نشدند، حجم نمونه را بیشتر کنید یا بازهٔ β را جابه‌جا کنید.");
  }
  if (failed.some((check) => check.group === "R² متغیر نتیجه")) {
    hints.push("بازهٔ R² را با مقادیرِ به‌دست‌آمده هماهنگ کنید؛ R² در برآورد ML (تصحیح‌شده برای خطای اندازه‌گیری) بزرگ‌تر از حالتِ نمرهٔ کل است.");
  }
  hints.push("تعداد تلاش‌ها را بیشتر کنید؛ هر تلاش یک دادهٔ تازه می‌سازد و شانسِ رسیدن به همهٔ قیود را بالا می‌برد.");
  return hints;
}

export async function generateSemData(input: SemGenInput, options: SemGenOptions = {}): Promise<SemGenOutput> {
  const { variables, arrows, n, constraints } = input;
  const fitTargets = resolveSemFitConstraints(constraints);
  const nodes = buildModelNodes(variables);
  const activeArrows = arrows.filter((a) => a.active);
  const exogVars = variables.filter((v) => v.role === "exogenous");
  const medVars = variables.filter((v) => v.role === "mediator");
  const outVars = variables.filter((v) => v.role === "outcome");

  if (!exogVars.length || !outVars.length) {
    throw new Error("حداقل یک متغیر برون‌زا و یک متغیر درون‌زا لازم است.");
  }
  for (const [key, range] of Object.entries(fitTargets)) {
    if (range.min != null && range.max != null && range.min > range.max) {
      throw new Error(`در قید برازش «${key}»، حداقل نباید از حداکثر بزرگ‌تر باشد.`);
    }
  }
  const indirectConstraintUnits: IndirectConstraintUnit[] = [];
  for (const exogenous of exogVars) {
    for (const outcome of outVars) {
      const mediatorVariables = medVars.filter(
        (mediator) =>
          activeArrows.some((arrow) => arrow.fromVar === exogenous.id && arrow.toVar === mediator.id) &&
          activeArrows.some((arrow) => arrow.fromVar === mediator.id && arrow.toVar === outcome.id)
      );
      if (!mediatorVariables.length) continue;
      const fromUnits = indirectUnitsOfVar(nodes, exogenous.id);
      const toUnits = indirectUnitsOfVar(nodes, outcome.id);
      const viaUnits = mediatorVariables.flatMap((mediator) => indirectUnitsOfVar(nodes, mediator.id));
      for (const from of fromUnits) {
        for (const to of toUnits) {
          for (const via of viaUnits) {
            indirectConstraintUnits.push({
              key: indirectUnitKey(from.label, via.label, to.label),
              legacyKey: `${from.varId}:${via.varId}:${to.varId}`,
              fromVar: from.varId,
              viaVar: via.varId,
              toVar: to.varId,
              fromNode: from.nodeId,
              viaNode: via.nodeId,
              toNode: to.nodeId,
              autoDir: resolveAutomaticIndirectDirection(constraints, nodes, activeArrows, from.nodeIds[0], [via.nodeIds[0]], to.nodeIds[0]),
              label: `${from.label} ← ${via.label} ← ${to.label}`,
            });
          }
          if (viaUnits.length > 1) {
            indirectConstraintUnits.push({
              key: indirectUnitKey(from.label, null, to.label),
              legacyKey: `${from.varId}:${to.varId}`,
              fromVar: from.varId,
              viaVar: null,
              toVar: to.varId,
              fromNode: from.nodeId,
              viaNode: null,
              toNode: to.nodeId,
              autoDir: resolveAutomaticIndirectDirection(constraints, nodes, activeArrows, from.nodeIds[0], viaUnits.map((via) => via.nodeIds[0]), to.nodeIds[0]),
              label: `کل: ${from.label} ← ${to.label} (${viaUnits.map((via) => via.label).join(" + ")})`,
            });
          }
        }
      }
    }
  }
  for (const unit of indirectConstraintUnits) {
    const stored = constraints.indirectTargets[unit.key] ?? constraints.indirectTargets[unit.legacyKey];
    const target = resolveIndirectConstraint(stored);
    if (target.min != null && target.max != null && target.min > target.max) {
      throw new Error(`در قید اثر غیرمستقیم «${unit.label}»، حداقل نباید از حداکثر بزرگ‌تر باشد.`);
    }
  }

  const requested = Math.round(options.maxAttempts ?? constraints.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const maxAttempts = Math.max(MIN_MAX_ATTEMPTS, Math.min(MAX_MAX_ATTEMPTS, Number.isFinite(requested) ? requested : DEFAULT_MAX_ATTEMPTS));
  const maxVerifications = Math.max(0, options.maxVerifications ?? 2);
  const screenBoot = Math.max(50, Math.min(constraints.bootSamples || 300, SCREEN_BOOT_CAP));
  const verifyBoot = Math.max(50, Math.min(options.verifyBootSamples ?? constraints.bootSamples ?? 500, VERIFY_BOOT_CAP));
  const needsIndirect = indirectConstraintUnits.length > 0;
  /**
   * آیا برای سنجشِ قیدِ مسیرها به خطای معیار (هسین عددی) نیاز داریم؟
   * چون پیش‌فرضِ هر مسیر «معنادار باشد» است، با داشتنِ حداقل یک فلش فعال پاسخ
   * عملاً همیشه مثبت است. هزینه‌اش با ارزیابیِ دومرحله‌ای پایین نگه داشته می‌شود:
   * ابتدا برازشِ ارزانِ بدون خطای معیار، و فقط برای نامزدِ پذیرفته‌شده برازشِ کامل.
   */
  const needsPathChecks = activeArrows.some((a) => {
    const t = resolvePathTargetForArrow(constraints, nodes, a);
    return t.sig === "sig" || t.sig === "ns";
  });

  const ctx: EvalContext = {
    nodes,
    arrows,
    activeArrows,
    medVars,
    outVars,
    constraints,
    fitTargets,
    indirectConstraintUnits,
  };

  type Candidate = {
    score: number;
    columns: string[];
    rows: (number | null)[][];
    nodeCols: number[][];
    measurementCols: SemMeasurementColumns;
    sem: SemResults;
    pathTargets: { fromNode: number; toNode: number; target: number; actual: number }[];
    checks: ConstraintCheck[];
    allPassed: boolean;
    boot: IndirectBootRow[] | null;
    bootEstimator: "ml" | "approx";
    bootSamples: number | null;
    verified: boolean;
  };

  /**
   * بهترین نامزدی که «ارزیابی کامل» (با خطای معیار و قیدِ مسیر) شده است.
   * چون امتیاز برابر است با کمینهٔ حاشیهٔ قیود، نامزدی که قیدهای کمتری دارد امتیازِ
   * بالاتری می‌گیرد و گزارشِ نهایی ناقص از آب درمی‌آید؛ برای همین نامزدِ کامل را جدا
   * نگه می‌داریم تا گزارش همیشه همهٔ گروه‌های قید را نشان بدهد.
   */
  let bestFull: Candidate | null = null;
  let best: Candidate | null = null;
  /** حلقه‌های بازخوردِ مستقل؛ جدا بودنشان مانعِ خنثی‌کردنِ یکدیگر می‌شود. */
  const arrowScale = new Map<string, number>();
  const arrowBoost = new Map<string, number>();
  const arrowTrim = new Map<string, number>();
  const arrowMediation = new Map<string, number>();
  let verificationsDone = 0;
  let cancelled = false;
  let attemptsUsed = 0;

  const emit = (
    attempt: number,
    stage: SemGenStage,
    stageProgress: number | null,
    message: string
  ) => {
    if (!options.onProgress) return;
    const summaryChecks = best?.checks ?? [];
    const groups: ConstraintGroup[] = [
      "مسیر مستقیم",
      "اثر غیرمستقیم",
      "برازش مدل",
      "R² متغیر نتیجه",
      "پیش‌فرض‌های آماری",
    ];
    options.onProgress({
      attempt,
      maxAttempts,
      stage,
      stageLabel: SEM_GEN_STAGE_LABELS[stage],
      stageProgress,
      bestScore: best?.score ?? Number.NEGATIVE_INFINITY,
      bestPassed: summaryChecks.filter((check) => check.status === "pass").length,
      bestTotal: summaryChecks.length,
      groupSummary: groups
        .map((group) => {
          const rows = summaryChecks.filter((check) => check.group === group);
          return { group, passed: rows.filter((check) => check.status === "pass").length, total: rows.length };
        })
        .filter((item) => item.total > 0),
      verificationsDone,
      maxVerifications: needsIndirect ? maxVerifications : 0,
      message,
    });
  };

  emit(0, "init", null, "مدل آماده شد؛ شروع تلاش‌ها.");
  await yieldToEventLoop();

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (options.shouldCancel?.()) {
      cancelled = true;
      break;
    }
    attemptsUsed = attempt + 1;
    emit(attemptsUsed, "coefficients", null, "ضرایب هدفِ مسیرها انتخاب می‌شود.");

    // ---------- ۱) ضرایب هدف هر فلش (از قید سطح متغیر) ----------
    const arrowTarget = new Map<string, number>();
    for (const a of activeArrows) {
      const t = resolvePathTargetForArrow(constraints, nodes, a);
      // میانجیِ نزدیک معمولاً قوی‌ترین پیش‌بینِ نتیجه است (در مدل‌های میانجی‌گری،
      // متغیرِ میانجی نزدیک‌ترین و نیرومندترین پیش‌بین است). اگر همهٔ ضرایب هم‌اندازه
      // کشیده شوند، سهمِ میانجی در R² رقیق می‌شود و اثر غیرمستقیم (a×b) از آستانهٔ
      // متداولِ ۰٫۱۰ پایین می‌افتد.
      const fromIsMediator = variables.some((v) => v.id === a.fromVar && v.role === "mediator");
      const baseLow = fromIsMediator ? 0.45 : 0.34;
      const baseHigh = fromIsMediator ? 0.68 : 0.58;
      let val: number;
      if (t.sig === "ns") val = rand(-0.12, 0.12);
      else if (t.sig === "sig") {
        val = rand(baseLow, baseHigh);
        // بازهٔ β روی قدرِ مطلق اعمال می‌شود تا با جهتِ منفی هم سازگار بماند
        if (t.betaMin != null) val = Math.max(val, Math.abs(t.betaMin));
        if (t.betaMax != null) val = Math.min(val, Math.abs(t.betaMax));
      } else val = Math.random() < 0.5 ? rand(-0.15, 0.45) : rand(0.1, 0.4);
      // اِعمالِ جهتِ رابطه (مثلاً ارزیابی مجددِ بیشتر ⇒ اعتیادِ کمتر)
      if (t.sig !== "ns") {
        if (t.dir === "neg") val = -Math.abs(val);
        else if (t.dir === "pos") val = Math.abs(val);
      }
      const sign = val < 0 ? -1 : 1;
      const observedScale = Math.max(0.35, Math.min(2.5, arrowScale.get(a.id) ?? 1));
      const significanceBoost = arrowBoost.get(a.id) ?? 1;
      const mediationBoost = arrowMediation.get(a.id) ?? 1;
      // ابتدا تقویت‌های معناداری/میانجی در سقفِ بالشتک‌دار مهار می‌شوند؛ سپس
      // اصلاح‌گرِ بازه اعمال می‌شود. این ترتیب نمی‌گذارد یک تقویت، سقف β را بشکند.
      const cushionedMax = t.betaMax == null ? Number.POSITIVE_INFINITY : (Math.abs(t.betaMax) * 1.08) / observedScale;
      const boostedMagnitude = Math.min(
        (Math.abs(val) * significanceBoost * mediationBoost) / observedScale,
        cushionedMax
      );
      const rangeTrim = arrowTrim.get(a.id) ?? 1;
      val = sign * boostedMagnitude * rangeTrim;
      arrowTarget.set(a.id, val);
    }

    // ---------- ۲) نمرات نهفته هر گره ----------
    emit(attemptsUsed, "latents", null, "نمرات نهفتهٔ گره‌ها ساخته می‌شود.");
    const L: Record<number, number[]> = {};
    const nodePos = new Map(nodes.map((node, index) => [node.nodeId, index]));
    const posOf = (id: number) => nodePos.get(id) ?? 0;
    /** ماتریس کوواریانسِ نمرات نهفته؛ همهٔ واریانس‌ها ۱ است ⇒ ضرایب همان β استانداردند */
    const covLat: number[][] = Array.from({ length: nodes.length }, () => Array(nodes.length).fill(0));
    const assigned: number[] = [];

    // ---------- ۲-الف) پیش‌بین‌های برون‌زا: همبسته، نه مستقل ----------
    // دادهٔ واقعی تقریباً هرگز پیش‌بین‌هایِ کاملاً ناهمبسته ندارد؛ همبستگیِ صفر باعث
    // می‌شد پیش‌فرضِ «خطی بودن» بی‌معنا شود و ماتریس همبستگی مصنوعی به نظر برسد.
    const exogNodes = exogVars.flatMap((v) => nodes.filter((x) => x.varId === v.id));
    const exogCorr = buildExogenousCorrelation(
      exogNodes.map((node) => node.label),
      exogNodes.map((node) => node.varId)
    );
    const exogLower = choleskyLower(exogCorr) ?? exogCorr.map((row, i) => row.map((v2, j) => (i === j ? 1 : 0)));
    const exogDraws = exogNodes.map(() => Array.from({ length: n }, () => randomNormal(Math.random)));
    exogNodes.forEach((node, i) => {
      const col = new Array(n).fill(0);
      for (let j = 0; j <= i; j++) {
        const c = exogLower[i]?.[j] ?? 0;
        if (!c) continue;
        for (let row = 0; row < n; row++) col[row] += c * exogDraws[j][row];
      }
      L[node.nodeId] = col;
      const pi = posOf(node.nodeId);
      exogNodes.forEach((other, j) => {
        covLat[pi][posOf(other.nodeId)] = exogCorr[i][j];
      });
      assigned.push(node.nodeId);
    });

    // ---------- ۲-ب) متغیرهای درون‌زا ----------
    let bad = false;
    const order = [...medVars, ...outVars];
    for (const v of order) {
      const vNodes = nodes.filter((x) => x.varId === v.id);
      for (const node of vNodes) {
        const preds = activeArrows.filter((a) => a.toNode === node.nodeId);
        // واریانسِ ترکیبِ خطی با در نظر گرفتنِ همبستگیِ پیش‌بین‌ها
        // (بدون این تصحیح، واریانسِ گره ۱ نمی‌شد و β برآوردی با β هدف فرق می‌کرد)
        let varLin = 0;
        for (const a of preds) {
          const ba = arrowTarget.get(a.id) ?? 0;
          for (const other of preds) {
            const bb = arrowTarget.get(other.id) ?? 0;
            varLin += ba * bb * (covLat[posOf(a.fromNode)]?.[posOf(other.fromNode)] ?? 0);
          }
        }
        // مقیاس‌بندیِ ضرایب این گره: با پیش‌بین‌های همبسته، حاصل‌جمعِ ضرایبِ خام
        // می‌تواند واریانسِ تبیین‌شده را به بیش از ۰٫۹ برساند (غیرواقعی و حتی نامعتبر).
        // اینجا ضرایب را با یک ضریبِ واحد کوچک/بزرگ می‌کنیم تا R² در بازهٔ خواسته‌شده بیفتد،
        // بدون اینکه الگویِ نسبیِ ضرایب (و جهتِ آن‌ها) تغییر کند.
        const r2Range = constraints.r2Range;
        const isOutcome = v.role === "outcome";
        const hi = Math.min(0.9, Math.max(0.1, isOutcome && r2Range ? r2Range.max : 0.7));
        const lo = Math.max(0.05, Math.min(hi - 0.05, isOutcome && r2Range ? r2Range.min : 0.05));
        if (!(varLin >= 0) || varLin > hi || (isOutcome && r2Range && varLin < lo)) {
          if (!(varLin >= 0)) {
            bad = true;
            break;
          }
          // سوگیری به سمتِ نیمهٔ بالای بازهٔ مجاز: هرچه R² بزرگ‌تر، ضرایبِ مسیر و در نتیجه
          // اثر غیرمستقیم (a×b) بزرگ‌تر می‌ماند. انتخابِ یکنواخت از کلِ بازه ضرایب را بیش
          // از حد کوچک می‌کرد و اثر غیرمستقیم به زیرِ آستانهٔ متداول (۰٫۱۰) می‌افتاد.
          const target = lo + (0.6 + 0.4 * Math.random()) * (hi - lo);
          const k = Math.sqrt(target / Math.max(varLin, 1e-9));
          for (const a of preds) arrowTarget.set(a.id, (arrowTarget.get(a.id) ?? 0) * k);
          varLin = target;
        }
        const lin = Array(n).fill(0);
        for (const a of preds) {
          const b = arrowTarget.get(a.id) ?? 0;
          const x = L[a.fromNode];
          for (let i = 0; i < n; i++) lin[i] += b * x[i];
        }
        const sdE = Math.sqrt(1 - varLin);
        L[node.nodeId] = lin.map((x) => x + sdE * randomNormal(Math.random));
        // به‌روزرسانیِ کوواریانسِ این گره با همهٔ گره‌هایِ قبلی
        const pt = posOf(node.nodeId);
        for (const k of assigned) {
          const pk = posOf(k);
          let cv = 0;
          for (const a of preds) cv += (arrowTarget.get(a.id) ?? 0) * (covLat[posOf(a.fromNode)]?.[pk] ?? 0);
          covLat[pt][pk] = cv;
          covLat[pk][pt] = cv;
        }
        covLat[pt][pt] = 1;
        assigned.push(node.nodeId);
      }
      if (bad) break;
    }
    if (bad) continue;

    // ---------- ۳) ستون‌های مشاهده‌شده ----------
    emit(attemptsUsed, "columns", null, "ستون‌های پرسشنامه ساخته می‌شوند.");
    const columns: string[] = [];
    const rows: (number | null)[][] = Array.from({ length: n }, () => []);
    const colScales: Scale[] = [];
    const nodeColsRaw: Record<number, number[]> = {};

    // منبعِ بارِ متقاطع: نمرهٔ نهفتهٔ نخستین متغیر (معمولاً یک متغیر برون‌زا).
    // فقط شاخص‌هایِ متغیرهایِ درون‌زا بارِ متقاطع می‌گیرند، چون کوواریانسِ متغیرهایِ
    // برون‌زا در مدل آزاد است و هر بارِ متقاطعی را بدونِ نابرازشی جذب می‌کند.
    const crossSourceNode = nodes.find((x) => x.varId === variables[0]?.id);
    const crossSource: number[] | null =
      crossSourceNode && L[crossSourceNode.nodeId] ? L[crossSourceNode.nodeId] : null;

    for (const v of variables) {
      const vNodes = nodes.filter((x) => x.varId === v.id);
      const latentFor = (node: ModelNode) => L[node.nodeId];
      if (v.subscales.length) {
        const subCols: number[][] = [];
        v.subscales.forEach((s, subIndex) => {
          const sc = scaleOf(v, s);
          // اگر هر زیرمقیاس خودش یک گرهٔ مستقل است (متغیر غیرجمع‌پذیر)، برآوردگرِ ML آن را
          // «مشاهده‌شدهٔ بدون خطای اندازه‌گیری» می‌بیند. اعمالِ خطای اندازه‌گیری در این حالت
          // باعث می‌شد β برآوردشده ≈ β هدف × λ شود و مسیرها کم‌برآورد و غیرمعنادار از آب دربیایند.
          const lam = v.hasTotal ? rand(0.6, 0.85) : 1;
          const latent = v.hasTotal ? latentFor(vNodes[0]) : latentFor(vNodes[subIndex]);
          // بارِ متقاطعِ فرعی فقط روی آخرین زیرمقیاسِ «متغیر نتیجه».
          // چرا فقط نتیجه؟ چون متغیر نتیجه معمولاً شاخص‌های بیشتری دارد و مدلِ اندازه‌گیریِ
          // آن بیش‌تشخیص‌پذیر است، پس نابرازشیِ ملایم را بدون دستکاریِ مسیرهایِ میانجی
          // (که اثر غیرمستقیم از حاصل‌ضربِ آن‌ها ساخته می‌شود) جذب می‌کند.
          const cross =
            crossSource && v.role === "outcome" && subIndex === v.subscales.length - 1 ? CROSS_LOADING : 0;
          const noiseSd = Math.sqrt(Math.max(0.04, 1 - lam * lam - cross * cross));
          const col = Array.from({ length: n }, (_, i) =>
            toScale(sc, lam * latent[i] + cross * (crossSource ? crossSource[i] : 0) + noiseSd * randomNormal(Math.random))
          );
          subCols.push(col);
          columns.push(`${v.name} — ${s.name}`);
          colScales.push(sc);
        });
        if (v.hasTotal) {
          const totalCol = Array.from({ length: n }, (_, i) => subCols.reduce((s, c) => s + c[i], 0));
          nodeColsRaw[vNodes[0].nodeId] = totalCol;
        } else {
          subCols.forEach((c, si) => {
            nodeColsRaw[vNodes[si].nodeId] = c;
          });
        }
        subCols.forEach((c) => rows.forEach((r, i) => r.push(c[i])));
      } else {
        const sc = scaleOf(v);
        const col = Array.from({ length: n }, (_, i) => toScale(sc, latentFor(vNodes[0])[i]));
        columns.push(v.name);
        colScales.push(sc);
        nodeColsRaw[vNodes[0].nodeId] = col;
        rows.forEach((r, i) => r.push(col[i]));
      }
    }

    // ---------- ۴) داده گمشده و داده پرت ----------
    if (constraints.missingPct > 0 || constraints.outlierPct > 0) {
      emit(attemptsUsed, "missing", null, "داده گمشده و داده پرت اعمال می‌شود.");
    }
    if (constraints.missingPct > 0) {
      const total = n * columns.length;
      const count = Math.min(total, Math.round((constraints.missingPct / 100) * total));
      const cells = new Set<number>();
      while (cells.size < count) cells.add(Math.floor(Math.random() * total));
      cells.forEach((cell) => {
        rows[Math.floor(cell / columns.length)][cell % columns.length] = null;
      });
    }

    if (constraints.outlierPct > 0) {
      const count = Math.round((constraints.outlierPct / 100) * n);
      const chosen = new Set<number>();
      while (chosen.size < count && chosen.size < n) chosen.add(Math.floor(Math.random() * n));
      chosen.forEach((r) => {
        const c = Math.floor(Math.random() * columns.length);
        const sc = colScales[c];
        rows[r][c] = Math.random() < 0.5 ? sc.mx + rand(1, 4) : sc.mn - rand(1, 4);
      });
    }

    // بازسازی nodeCols و شاخص‌های اندازه‌گیری از روی جدول (با null → NaN)
    const nodeCols: number[][] = nodes.map(() => Array(n).fill(NaN));
    const measurementCols: SemMeasurementColumns = {};
    for (const v of variables) {
      const vNodes = nodes.filter((x) => x.varId === v.id);
      if (v.subscales.length) {
        const startCol = columns.findIndex((c) => c.startsWith(v.name + " — "));
        if (v.hasTotal) {
          measurementCols[vNodes[0].nodeId] = v.subscales.map((_, subscaleIndex) =>
            rows.map((row) => {
              const value = row[startCol + subscaleIndex];
              return value != null && Number.isFinite(value) ? value : NaN;
            })
          );
          for (let i = 0; i < n; i++) {
            let sum = 0;
            let ok = true;
            for (let s = 0; s < v.subscales.length; s++) {
              const val = rows[i][startCol + s];
              if (val == null || !Number.isFinite(val)) {
                ok = false;
                break;
              }
              sum += val;
            }
            nodeCols[vNodes[0].nodeId][i] = ok ? sum : NaN;
          }
        } else {
          vNodes.forEach((node, si) => {
            const observed = rows.map((row) => {
              const value = row[startCol + si];
              return value != null && Number.isFinite(value) ? value : NaN;
            });
            measurementCols[node.nodeId] = [observed];
            nodeCols[node.nodeId] = observed;
          });
        }
      } else {
        const startCol = columns.findIndex((c) => c === v.name);
        const observed = rows.map((row) => {
          const value = row[startCol];
          return value != null && Number.isFinite(value) ? value : NaN;
        });
        measurementCols[vNodes[0].nodeId] = [observed];
        nodeCols[vNodes[0].nodeId] = observed;
      }
    }

    // ---------- ۵) ارزیابی با همان برآوردگرِ تحلیل نهایی (ML) ----------
    emit(attemptsUsed, "fit", null, "مدل با برآوردگر ML برازش می‌شود.");
    await yieldToEventLoop();
    // مرحلهٔ اول: برازشِ ارزان و بدون خطای معیار (حدود ۱۸۸ms).
    // خطای معیارِ مسیرها فقط در مرحلهٔ دوم و فقط برای نامزدهای پذیرفته‌شده گرفته می‌شود.
    const sem = estimateSem(nodes, arrows, nodeCols, measurementCols, "ml", { standardErrors: false });

    const multiIndicator = Object.values(measurementCols).some((cols) => cols.length > 1);
    if (multiIndicator && sem.estimator !== "ml") {
      // برنامه در این حالت هم خروجی تقریبی را نمی‌پذیرد؛ این تلاش مردود است.
      const reject: ConstraintCheck[] = [
        {
          group: "برازش مدل",
          label: "برآورد ML",
          requirement: "مدل باید با ML همگرا شود",
          actual: "همگرا نشد",
          margin: Number.NEGATIVE_INFINITY,
          status: "fail",
        },
      ];
      const score = Number.NEGATIVE_INFINITY;
      if (!best || score > best.score) {
        best = {
          score,
          columns,
          rows,
          nodeCols,
          measurementCols,
          sem,
          pathTargets: [],
          checks: reject,
          allPassed: false,
          boot: null,
          bootEstimator: "approx",
          bootSamples: null,
          verified: false,
        };
      }
      continue;
    }

    emit(attemptsUsed, "assumptions", null, "پیش‌فرض‌های آماری بررسی می‌شود.");

    // غربالِ بدون بوت‌استرپ: ارزان است و بیشتر تلاش‌های بد را همان اول حذف می‌کند.
    // قیدِ اثر غیرمستقیم در این مرحله فقط از نظرِ «دامنه» (با نقطه‌برآورد ML) سنجیده می‌شود.
    const { checks: preChecks, score: preScore, allPassed: preAllPassed } = evaluateAttempt(
      ctx,
      sem,
      nodeCols,
      null,
      "approx",
      { skipPaths: true }
    );
    const cheapOk = preChecks.filter((check) => check.group !== "اثر غیرمستقیم").every((check) => check.status === "pass");

    // نسبتِ β برآوردشده به ضریبِ خام برای هر فلش جداست؛ یک مقیاسِ مشترک، فلش‌های
    // دارای خطای اندازه‌گیری متفاوت را بیش‌/کم‌تصحیح می‌کند.
    for (const path of sem.paths) {
      const arrow = activeArrows.find((item) => item.fromNode === path.from && item.toNode === path.to);
      if (!arrow) continue;
      const raw = Math.abs(arrowTarget.get(arrow.id) ?? 0);
      if (raw > 1e-6 && Number.isFinite(path.std)) {
        const ratio = Math.max(0.35, Math.min(2.5, Math.abs(path.std) / raw));
        const oldScale = arrowScale.get(arrow.id) ?? ratio;
        arrowScale.set(arrow.id, 0.7 * oldScale + 0.3 * ratio);
      }
      const target = resolvePathTargetForArrow(constraints, nodes, arrow);
      let trim = arrowTrim.get(arrow.id) ?? 1;
      if (target.betaMax != null && Math.abs(path.std) > target.betaMax + MARGIN_EPS) trim *= 0.9;
      else if (target.betaMin != null && Math.abs(path.std) < target.betaMin - MARGIN_EPS) trim *= 1.08;
      arrowTrim.set(arrow.id, Math.max(0.35, Math.min(1.8, trim)));
    }

    // تقویتِ آرامِ مسیرهای تشکیل‌دهندهٔ اثری که زیرِ کفِ غیرمستقیم مانده است.
    // این کنترل‌کننده هرگز کاهش نمی‌یابد؛ کاهشِ آن در نسخهٔ قبل پیشرفت را خنثی می‌کرد.
    const mediationArrows = new Set<string>();
    for (const unit of indirectConstraintUnits) {
      const target = resolveIndirectConstraint(
        constraints.indirectTargets[unit.key] ?? constraints.indirectTargets[unit.legacyKey]
      );
      if (target.min == null) continue;
      const point = mlIndirectPoint(
        nodes,
        sem,
        unit.fromVar,
        unit.toVar,
        unit.viaVar,
        medVars.map((variable) => variable.id),
        unit.fromNode,
        unit.viaNode,
        unit.toNode
      );
      if (Math.abs(point) + MARGIN_EPS >= target.min) continue;
      for (const arrow of activeArrows) {
        const isFirst =
          arrow.fromVar === unit.fromVar &&
          (unit.viaVar == null ? medVars.some((variable) => variable.id === arrow.toVar) : arrow.toVar === unit.viaVar) &&
          (unit.fromNode == null || arrow.fromNode === unit.fromNode) &&
          (unit.viaNode == null || arrow.toNode === unit.viaNode);
        const isSecond =
          (unit.viaVar == null ? medVars.some((variable) => variable.id === arrow.fromVar) : arrow.fromVar === unit.viaVar) &&
          arrow.toVar === unit.toVar &&
          (unit.viaNode == null || arrow.fromNode === unit.viaNode) &&
          (unit.toNode == null || arrow.toNode === unit.toNode);
        if (isFirst || isSecond) mediationArrows.add(arrow.id);
      }
    }
    for (const id of mediationArrows) {
      arrowMediation.set(id, Math.min(1.5, (arrowMediation.get(id) ?? 1) * 1.05));
    }

    if (cheapOk) {
      // مرحلهٔ دوم: برازشِ کامل با خطای معیار (حدود ۳۳۷ms) تا قیدِ معناداریِ مسیرها هم سنجیده شود.
      // فقط نامزدهایی که از غربالِ ارزان رد شده‌اند این هزینه را می‌پردازند.
      const semFull = needsPathChecks
        ? estimateSem(nodes, arrows, nodeCols, measurementCols, "ml", { standardErrors: true })
        : sem;
      for (const path of semFull.paths) {
        const arrow = activeArrows.find((item) => item.fromNode === path.from && item.toNode === path.to);
        if (!arrow) continue;
        let boost = arrowBoost.get(arrow.id) ?? 1;
        if (path.p > 0.04) boost = Math.min(2.5, boost * 1.12);
        else if (path.p < 0.008) boost = 1 + (boost - 1) * 0.92;
        arrowBoost.set(arrow.id, Math.max(1, boost));
      }
      // برخی تلاش‌ها فقط به‌خاطر قید اثر غیرمستقیم مردودند؛ آن‌ها را با بوت‌استرپ سریع غربال می‌کنیم
      emit(attemptsUsed, "bootstrap", null, "اثر غیرمستقیم با بوت‌استرپ سریع غربال می‌شود.");
      await yieldToEventLoop();
      const screenBootRows = needsIndirect
        ? bootstrapIndirectEffects(nodes, arrows, nodeCols, screenBoot, measurementCols, "approx")
        : [];
      const evaluated = evaluateAttempt(ctx, semFull, nodeCols, needsIndirect ? screenBootRows : null, "approx");

      const candidate: Candidate = {
        score: evaluated.score,
        columns,
        rows,
        nodeCols,
        measurementCols,
        sem: semFull,
        pathTargets: semFull.paths.map((pr) => {
          const a = arrows.find((x) => x.fromNode === pr.from && x.toNode === pr.to);
          return {
            fromNode: pr.from,
            toNode: pr.to,
            target: a ? arrowTarget.get(a.id) ?? 0 : 0,
            actual: pr.std,
          };
        }),
        checks: evaluated.checks,
        allPassed: evaluated.allPassed,
        boot: needsIndirect ? screenBootRows : null,
        bootEstimator: "approx",
        bootSamples: needsIndirect ? screenBoot : null,
        verified: false,
      };

      if (!best || candidate.score > best.score) best = candidate;
      if (!bestFull || candidate.score > bestFull.score) bestFull = candidate;
      emit(attemptsUsed, "evaluate", null, `تلاش ${attemptsUsed}: ${candidate.checks.filter((c) => c.status === "pass").length} از ${candidate.checks.length} قید رعایت شد.`);

      if (candidate.allPassed && (!needsIndirect || verificationsDone >= maxVerifications)) {
        // راستی‌آزمایی لازم نیست یا سهمیه تمام شده
        return finalize(best, attempt + 1, needsIndirect, verificationsDone);
      }

      if (candidate.allPassed && needsIndirect && verificationsDone < maxVerifications) {
        verificationsDone += 1;
        emit(
          attemptsUsed,
          "verify",
          0,
          `راستی‌آزمایی ${verificationsDone} از ${maxVerifications}: بوت‌استرپ ML با ${verifyBoot} نمونه.`
        );
        await yieldToEventLoop();
        const mlBoot = bootstrapIndirectEffects(
          nodes,
          arrows,
          nodeCols,
          verifyBoot,
          measurementCols,
          "ml",
          (done, total) => emit(attemptsUsed, "verify", done / total, `راستی‌آزمایی: ${done} از ${total} نمونهٔ بوت‌استرپ.`)
        );
        const verifiedEval = evaluateAttempt(ctx, sem, nodeCols, mlBoot, "ml");
        const verifiedCandidate: Candidate = { ...candidate, ...verifiedEval, boot: mlBoot, bootEstimator: "ml", bootSamples: verifyBoot, verified: true };
        if (!best || verifiedCandidate.score > best.score || (verifiedCandidate.allPassed && !best.allPassed)) {
          best = verifiedCandidate;
        }
        if (!bestFull || verifiedCandidate.score > bestFull.score) bestFull = verifiedCandidate;
        if (verifiedCandidate.allPassed) {
          return finalize(verifiedCandidate, attempt + 1, true, verificationsDone);
        }
        emit(attemptsUsed, "evaluate", null, "راستی‌آزمایی ناموفق بود؛ تلاش بعدی.");
      }
      continue;
    }

    // تلاشِ مردود در غربالِ اولیه
    const candidate: Candidate = {
      score: preScore,
      columns,
      rows,
      nodeCols,
      measurementCols,
      sem,
      pathTargets: sem.paths.map((pr) => {
        const a = arrows.find((x) => x.fromNode === pr.from && x.toNode === pr.to);
        return {
          fromNode: pr.from,
          toNode: pr.to,
          target: a ? arrowTarget.get(a.id) ?? 0 : 0,
          actual: pr.std,
        };
      }),
      checks: preChecks,
      allPassed: preAllPassed,
      boot: null,
      bootEstimator: "approx",
      bootSamples: null,
      verified: false,
    };
    if (!best || candidate.score > best.score) best = candidate;
    emit(attemptsUsed, "evaluate", null, `تلاش ${attemptsUsed}: ${candidate.checks.filter((c) => c.status === "pass").length} از ${candidate.checks.length} قید رعایت شد.`);
    await yieldToEventLoop();
  }

  if (!best) {
    throw new Error("هیچ داده‌ای تولید نشد؛ تنظیمات مدل را بررسی کنید.");
  }
  // گزارش را از کامل‌ترین نامزد می‌سازیم تا همهٔ گروه‌های قید (از جمله مسیرهای مستقیم) دیده شود
  return finalize(bestFull ?? best, attemptsUsed, needsIndirect, verificationsDone, cancelled);

  function finalize(
    candidate: Candidate,
    attempts: number,
    indirectNeeded: boolean,
    verifications: number,
    wasCancelled = false
  ): SemGenOutput {
    const report = summarizeChecks(candidate.checks);
    report.estimator = candidate.sem.estimator === "ml" ? "ml" : "approx";
    report.bootstrapSamples = candidate.bootSamples;
    report.bootstrapEstimator = candidate.bootEstimator === "ml" || candidate.bootEstimator === "approx" ? candidate.bootEstimator : null;
    report.hints = report.allPassed ? [] : buildHints(report);
    return {
      columns: candidate.columns,
      rows: candidate.rows,
      nodes,
      nodeCols: candidate.nodeCols,
      answerKey: {
        pathTargets: candidate.pathTargets,
        fit: candidate.sem.fit,
        attempts,
        r2Range: constraints.r2Range,
      },
      report,
      success: report.allPassed,
      attempts,
      cancelled: wasCancelled,
      verifications,
      indirectVerified: indirectNeeded ? candidate.verified : true,
    };
  }
}
