// انواع داده‌های پروژه‌های پیش‌فرض (الگوهای سناریوی پژوهشی)
// این فایل قرارداد (contract) داده‌ای تمام پروژه‌های پیش‌فرض را تعریف می‌کند.
// هیچ وابستگی به دیتابیس یا بک‌اند ندارد؛ این داده‌ها فقط در مرورگر (localStorage)
// و در زمان تولید داده‌ی تمرینی مصرف می‌شوند.

/** برچسب‌های درجات یک طیف لیکرت. فقط درجاتی که منبع مشخص کرده آورده می‌شود. */
export type LikertAnchors = Partial<Record<number, string>>;

export interface LikertScale {
  kind: "likert";
  /** تعداد درجات (مثلاً ۵ یا ۷) */
  points: number;
  min: number;
  max: number;
  /** مثلاً { 1: "به‌ندرت", 5: "همیشه" } */
  anchors: LikertAnchors;
}

/** خرده‌مقیاس (زیرمقیاس) یک پرسشنامه. */
export interface Subscale {
  id: string;
  name: string;
  /** شماره گویه‌ها (یک‌بنیان، از ۱ تا n) */
  itemIndices: number[];
  /** یادداشت از جمله نیاز به بازبینی ترتیب گویه‌ها */
  note?: string;
}

/** اطلاعات نمره‌دهی و تفسیر یک پرسشنامه. */
export interface ScoringInfo {
  /** آیا پرسشنامه نمره کل دارد؟ (مثلاً ERQ نمره کل ندارد) */
  hasTotalScore: boolean;
  minTotal?: number;
  maxTotal?: number;
  /** گویه‌هایی که معکوس نمره‌دهی می‌شوند */
  reversedItemIndices?: number[];
  /** بازه‌های تفسیر (مثل OGAI: متوسط / دچار مشکل / مشکلات جدی) */
  interpretationBands?: { label: string; min: number; max: number }[];
  notes?: string;
}

/** پایایی (آلفای کرونباخ) نسخه اصلی و فارسی. */
export interface ReliabilityInfo {
  cronbachOriginal?: string;
  cronbachFarsi?: string;
  note?: string;
}

/** تعریف کامل یک پرسشنامه. */
export interface Questionnaire {
  id: string;
  /** نام کامل فارسی */
  name: string;
  /** اختصار انگلیسی: OGAI / ERQ / AQ / FS */
  abbreviation: string;
  authors: string;
  reference: string;
  itemCount: number;
  scale: LikertScale;
  scoring: ScoringInfo;
  subscales: Subscale[];
  reliability: ReliabilityInfo;
  constructValidityNote?: string;
}

/** یک فقره از پرسشنامه جمعیت‌شناختی محقق‌ساخته. */
export interface DemographicField {
  id: string;
  label: string;
  type: "number" | "text" | "select";
  options?: string[];
  unit?: string;
  note?: string;
}

export type ResearchDesign =
  | "SEM"
  | "regression"
  | "clinical-one-group"
  | "clinical-two-group";

/** متغیرهای مدل پژوهش و پرسشنامه‌ای که آن را می‌سنجد. */
export interface ModelVariable {
  role: "predictor" | "mediator" | "outcome" | "covariate";
  name: string;
  /** شناسه پرسشنامه مربوط (مثلاً "ogai") */
  measuredBy: string;
}

/** یک پروژه پیش‌فرض (الگوی سناریوی پژوهشی قابل بارگذاری). */
export interface DefaultProject {
  id: string;
  /** مثلاً «پروژه پیش‌فرض ۳» */
  name: string;
  slug: string;
  summary: string;
  design: ResearchDesign;
  /** برچسب فارسی طرح پژوهش */
  designLabel: string;
  population: string;
  sample: {
    /** حجم نمونه نهایی معتبر */
    targetValidN: number;
    /** تعداد پرسشنامه توزیع‌شده (با احتساب مازاد) */
    distributedN: number;
    method: string;
    notes?: string;
  };
  model?: {
    description: string;
    variables: ModelVariable[];
  };
  demographic: DemographicField[];
  questionnaires: Questionnaire[];
  ethicsNote?: string;
  analysisNote?: string;
  /** ارجاع به منبع (مثلاً فصل سوم پایان‌نامه) */
  source: string;
}
