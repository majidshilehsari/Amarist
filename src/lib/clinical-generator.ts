// ============================================================
// موتور تولید دادهٔ تمرینی بالینی (کارآزمایی مداخله‌ای) — آماریست
// دو طرح:
//   - «کنترل»: گروه آزمایش/درمان در برابر گروه کنترل؛ پیش‌آزمون و پس‌آزمون
//     (تحلیل با t مستقل روی نمرهٔ تغییر + ANCOVA؛ هدف = d کوهن بین‌گروهی)
//   - «پیگیری»: دو یا سه گروه مستقل × دو یا سه زمان (پیش/پس/پیگیری)
//     (تحلیل با تحلیل واریانس اندازه‌گیری مکرر؛ هدف = مجذور اتای جزئی تعامل زمان*گروه)
// تولید فقط خروجی‌ای را می‌پذیرد که قیود (معناداری، اندازه اثر، پیش‌فرض‌ها) برقرار باشند.
// ============================================================

import { randomNormal, clamp, shapiroWilkTest, leveneTest, type Lists } from "./statistics";
import {
  independentTTest,
  ancova,
  mixedAnova,
  mauchlyPooled,
  type ClinicalRows,
} from "./clinical-stats";

export type ClinicalDesign = "control" | "followup";

export type ClinicalGenConstraints = {
  design: ClinicalDesign;
  /** تعداد گروه‌های مستقل (۲ یا ۳) */
  nGroups: number;
  nPerGroup: number;
  /** تعداد زمان‌های اندازه‌گیری (۲ یا ۳) */
  nTimes: number;
  alpha: number;
  scoreMin: number;
  scoreMax: number;
  /** کنترل: بازهٔ d کوهن برای تفاوت بین‌گروهی در نمرهٔ تغییر (پس − پیش) */
  targetD: { min: number; max: number } | null;
  /** پیگیری: بازهٔ مجذور اتای جزئی برای تعامل زمان*گروه */
  targetInteractionEta2: { min: number; max: number } | null;
  enforceNormality: boolean;
  enforceHomogeneity: boolean;
  enforceSphericity: boolean;
};

export type ClinicalAnswerKey = {
  design: ClinicalDesign;
  targetD?: { target: number; actual: number };
  targetInteractionEta2?: { target: number; actual: number };
  attempts: number;
};

export type ClinicalGenResult = {
  columns: string[];
  rows: (number | null)[][];
  answerKey: ClinicalAnswerKey;
};

export type ClinicalEvaluation = {
  pass: boolean;
  score: number;
  messages: string[];
  d?: number;
  interactionEta2?: number;
};

export function clinicalTimeLabels(design: ClinicalDesign, nTimes: number): string[] {
  if (design === "control" || nTimes === 2) return ["پیش‌آزمون", "پس‌آزمون"];
  return ["پیش‌آزمون", "پس‌آزمون", "پیگیری"];
}

export function clinicalColumns(design: ClinicalDesign, nTimes = design === "control" ? 2 : 3): string[] {
  return ["گروه", ...clinicalTimeLabels(design, nTimes)];
}

// ---------- تولید دادهٔ خام ----------

function controlSample(constraints: ClinicalGenConstraints, groupEffect: number): number[][] {
  const { nPerGroup, scoreMin, scoreMax } = constraints;
  const range = scoreMax - scoreMin;
  const mu0 = (scoreMin + scoreMax) / 2;
  const sdB = Math.max(2, range / 6);
  const sdC = Math.max(2, range / 7);
  const rows: number[][] = [];
  for (let g = 0; g < 2; g++) {
    const eff = g === 0 ? 0 : groupEffect;
    for (let i = 0; i < nPerGroup; i++) {
      const pre = mu0 + randomNormal(Math.random) * sdB;
      const post = pre + eff + randomNormal(Math.random) * sdC;
      rows.push([g + 1, roundClip(pre), roundClip(post)]);
    }
  }
  return rows;

  function roundClip(v: number): number {
    return clamp(Math.round(v), scoreMin, scoreMax);
  }
}

/** بردار اثر زمان برای هر گروه: گروه ۰ (کنترل) روند جزئی طبیعی؛ بقیه با شدت متفاوت. */
function groupTimeEffects(G: number, T: number, slope: number): number[][] {
  const effects: number[][] = [];
  for (let g = 0; g < G; g++) {
    const e = [0];
    if (g === 0) {
      for (let t = 1; t < T; t++) e.push(0.4 + 0.2 * (t - 1));
    } else {
      const mult = G === 2 ? 1 : 0.7 + 0.5 * (g - 1);
      for (let t = 1; t < T; t++) e.push(slope * mult * (1 + 0.2 * (t - 1)));
    }
    effects.push(e);
  }
  return effects;
}

function followupSample(constraints: ClinicalGenConstraints, slope: number): number[][] {
  const { nGroups: G, nPerGroup, nTimes: T, scoreMin, scoreMax } = constraints;
  const range = scoreMax - scoreMin;
  const mu0 = (scoreMin + scoreMax) / 2;
  const sdB = Math.max(2, range / 6);
  const sdW = Math.max(1.5, range / 8);
  const sdS = sdB * 0.65;
  const effects = groupTimeEffects(G, T, slope);
  const rows: number[][] = [];
  for (let g = 0; g < G; g++) {
    for (let i = 0; i < nPerGroup; i++) {
      const base = mu0 + randomNormal(Math.random) * sdS;
      const row: number[] = [g + 1];
      for (let t = 0; t < T; t++) {
        const v = t === 0 ? base + randomNormal(Math.random) * sdW : base + effects[g][t] + randomNormal(Math.random) * sdW;
        row.push(roundClip(v));
      }
      rows.push(row);
    }
  }
  return rows;

  function roundClip(v: number): number {
    return clamp(Math.round(v), scoreMin, scoreMax);
  }
}

// ---------- ارزیابی قیود ----------

function normalityMargin(groupCells: number[][], alpha: number, enforce: boolean): { score: number; messages: string[] } {
  let score = Infinity;
  const messages: string[] = [];
  groupCells.forEach((cell, index) => {
    const sw = shapiroWilkTest(cell);
    if (!sw.valid || !Number.isFinite(sw.p)) {
      score = Math.min(score, -Infinity);
      messages.push(`آزمون نرمال بودن برای سلول ${index + 1} قابل محاسبه نیست.`);
      return;
    }
    if (enforce) {
      score = Math.min(score, sw.p - alpha);
      if (sw.p < alpha) messages.push(`نرمال بودن سلول ${index + 1} برقرار نشد (شاپیرو p=${sw.p.toFixed(3)}).`);
    }
  });
  return { score, messages };
}

function homogeneityMargin(timeGroups: number[][][], alpha: number, enforce: boolean): { score: number; messages: string[] } {
  let score = Infinity;
  const messages: string[] = [];
  timeGroups.forEach((groups, index) => {
    const lev = leveneTest(groups);
    if (!lev.valid || !Number.isFinite(lev.p)) {
      score = Math.min(score, -Infinity);
      messages.push(`آزمون لوین برای زمان ${index + 1} قابل محاسبه نیست.`);
      return;
    }
    if (enforce) {
      score = Math.min(score, lev.p - alpha);
      if (lev.p < alpha) messages.push(`همگنی واریانس زمان ${index + 1} برقرار نشد (لوین p=${lev.p.toFixed(3)}).`);
    }
  });
  return { score, messages };
}

export function evaluateControl(rows: number[][], constraints: ClinicalGenConstraints): ClinicalEvaluation {
  const pre = rows.map((r) => r[1]);
  const post = rows.map((r) => r[2]);
  const group = rows.map((r) => r[0]);
  const change = post.map((p, i) => p - pre[i]);
  const g0 = group.map((g, i) => [g, i] as const).filter(([g]) => g === 1).map(([, i]) => i);
  const g1 = group.map((g, i) => [g, i] as const).filter(([g]) => g === 2).map(([, i]) => i);
  const change0 = g0.map((i) => change[i]);
  const change1 = g1.map((i) => change[i]);

  const t = independentTTest(change0, change1);
  const anc = ancova(group.map((g) => g - 1), pre, post);

  let score = Infinity;
  const messages: string[] = [];
  const d = t.cohensD;

  if (constraints.targetD) {
    const m1 = d - constraints.targetD.min;
    const m2 = constraints.targetD.max - d;
    score = Math.min(score, m1, m2);
    if (m1 < 0) messages.push(`d کوهن (${d.toFixed(2)}) کمتر از حداقل هدف (${constraints.targetD.min}) است.`);
    if (m2 < 0) messages.push(`d کوهن (${d.toFixed(2)}) بیشتر از حداکثر هدف (${constraints.targetD.max}) است.`);
  }
  score = Math.min(score, constraints.alpha - t.p);
  if (t.p >= constraints.alpha) messages.push(`تفاوت بین‌گروهی در نمرهٔ تغییر معنی‌دار نشد (t پ=${t.p.toFixed(4)}).`);
  score = Math.min(score, constraints.alpha - anc.p);
  if (anc.p >= constraints.alpha) messages.push(`ANCOVA معنی‌دار نشد (پ=${anc.p.toFixed(4)}).`);

  const cells = [g0.map((i) => pre[i]), g0.map((i) => post[i]), g1.map((i) => pre[i]), g1.map((i) => post[i])];
  const norm = normalityMargin(cells, constraints.alpha, constraints.enforceNormality);
  score = Math.min(score, norm.score);
  messages.push(...norm.messages);

  const hom = homogeneityMargin(
    [[g0.map((i) => pre[i]), g1.map((i) => pre[i])], [g0.map((i) => post[i]), g1.map((i) => post[i])]],
    constraints.alpha,
    constraints.enforceHomogeneity
  );
  score = Math.min(score, hom.score);
  messages.push(...hom.messages);

  return { pass: score >= 0, score, messages, d };
}

export function evaluateFollowup(rows: number[][], constraints: ClinicalGenConstraints): ClinicalEvaluation {
  const G = constraints.nGroups;
  const T = constraints.nTimes;
  const groupIds = rows.map((r) => Math.round(r[0]) - 1);
  const timeData = rows.map((r) => r.slice(1));
  const grouped: number[][][] = Array.from({ length: G }, () => []);
  groupIds.forEach((gi, i) => grouped[gi].push(timeData[i]));

  const anova = mixedAnova(grouped);
  const interactionEta2 = anova.timeGroup.eta;
  const mauchly = T >= 3 ? mauchlyPooled(grouped) : null;

  let score = Infinity;
  const messages: string[] = [];

  if (constraints.targetInteractionEta2) {
    const m1 = interactionEta2 - constraints.targetInteractionEta2.min;
    const m2 = constraints.targetInteractionEta2.max - interactionEta2;
    score = Math.min(score, m1, m2);
    if (m1 < 0) messages.push(`مجذور اتای تعامل (${interactionEta2.toFixed(3)}) کمتر از حداقل هدف است.`);
    if (m2 < 0) messages.push(`مجذور اتای تعامل (${interactionEta2.toFixed(3)}) بیشتر از حداکثر هدف است.`);
  }
  score = Math.min(score, constraints.alpha - anova.timeGroup.p);
  if (anova.timeGroup.p >= constraints.alpha) messages.push(`تعامل زمان*گروه معنی‌دار نشد (پ=${anova.timeGroup.p.toFixed(4)}).`);
  score = Math.min(score, constraints.alpha - anova.time.p);
  if (anova.time.p >= constraints.alpha) messages.push(`اثر زمان معنی‌دار نشد (پ=${anova.time.p.toFixed(4)}).`);
  score = Math.min(score, constraints.alpha - anova.group.p);
  if (anova.group.p >= constraints.alpha) messages.push(`اثر بین‌گروهی معنی‌دار نشد (پ=${anova.group.p.toFixed(4)}).`);

  const cells: number[][] = [];
  for (let g = 0; g < G; g++) {
    for (let t = 0; t < T; t++) cells.push(grouped[g].map((subj) => subj[t]));
  }
  const norm = normalityMargin(cells, constraints.alpha, constraints.enforceNormality);
  score = Math.min(score, norm.score);
  messages.push(...norm.messages);

  const timeGroups: number[][][] = [];
  for (let t = 0; t < T; t++) timeGroups.push(grouped.map((g) => g.map((s) => s[t])));
  const hom = homogeneityMargin(timeGroups, constraints.alpha, constraints.enforceHomogeneity);
  score = Math.min(score, hom.score);
  messages.push(...hom.messages);

  if (constraints.enforceSphericity && mauchly) {
    score = Math.min(score, mauchly.p - constraints.alpha);
    if (mauchly.p < constraints.alpha) messages.push(`کرویت برقرار نشد (موچلی پ=${mauchly.p.toFixed(4)}).`);
  }

  return { pass: score >= 0, score, messages, interactionEta2 };
}

// ---------- تولید با قیدها ----------

export function generateClinicalData(constraints: ClinicalGenConstraints, maxAttempts: number): ClinicalGenResult {
  if (constraints.design === "control") {
    return generateControl(constraints, maxAttempts);
  }
  return generateFollowup(constraints, maxAttempts);
}

function generateControl(constraints: ClinicalGenConstraints, maxAttempts: number): ClinicalGenResult {
  const range = constraints.scoreMax - constraints.scoreMin;
  const sdC = Math.max(2, range / 7);
  const dMid = constraints.targetD ? (constraints.targetD.min + constraints.targetD.max) / 2 : 0.8;
  let effect = dMid * sdC;
  let best: { rows: number[][]; evaluation: ClinicalEvaluation } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rows = controlSample(constraints, effect);
    const evaluation = evaluateControl(rows, constraints);
    if (!best || evaluation.score > best.evaluation.score) best = { rows, evaluation };
    if (evaluation.pass) {
      return {
        columns: clinicalColumns("control"),
        rows,
        answerKey: {
          design: "control",
          targetD: constraints.targetD ? { target: dMid, actual: evaluation.d ?? NaN } : { target: NaN, actual: evaluation.d ?? NaN },
          attempts: attempt + 1,
        },
      };
    }
    if (constraints.targetD && typeof evaluation.d === "number" && Number.isFinite(evaluation.d) && Math.abs(evaluation.d) > 1e-3) {
      const ratio = dMid / Math.abs(evaluation.d);
      effect = Math.max(0.1, effect * clamp(ratio, 0.5, 1.5));
    }
  }

  throw new Error(buildError(best?.evaluation, constraints, maxAttempts));
}

function generateFollowup(constraints: ClinicalGenConstraints, maxAttempts: number): ClinicalGenResult {
  const etaMid = constraints.targetInteractionEta2 ? (constraints.targetInteractionEta2.min + constraints.targetInteractionEta2.max) / 2 : 0.15;
  const range = constraints.scoreMax - constraints.scoreMin;
  let slope = Math.max(1.5, range * 0.16 * (etaMid / 0.15));
  let best: { rows: number[][]; evaluation: ClinicalEvaluation } | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const rows = followupSample(constraints, slope);
    const evaluation = evaluateFollowup(rows, constraints);
    if (!best || evaluation.score > best.evaluation.score) best = { rows, evaluation };
    if (evaluation.pass) {
      return {
        columns: clinicalColumns(constraints.design, constraints.nTimes),
        rows,
        answerKey: {
          design: "followup",
          targetInteractionEta2: constraints.targetInteractionEta2
            ? { target: etaMid, actual: evaluation.interactionEta2 ?? NaN }
            : { target: NaN, actual: evaluation.interactionEta2 ?? NaN },
          attempts: attempt + 1,
        },
      };
    }
    if (typeof evaluation.interactionEta2 === "number" && Number.isFinite(evaluation.interactionEta2) && evaluation.interactionEta2 > 1e-4) {
      const ratio = etaMid / evaluation.interactionEta2;
      slope = Math.max(0.5, slope * clamp(Math.sqrt(ratio), 0.5, 1.5));
    }
  }

  throw new Error(buildError(best?.evaluation, constraints, maxAttempts));
}

function buildError(evaluation: ClinicalEvaluation | undefined, constraints: ClinicalGenConstraints, maxAttempts: number): string {
  const why = evaluation && evaluation.messages.length ? evaluation.messages.slice(0, 3).join(" | ") : "شرایط هدف برقرار نشد.";
  const suggestions: string[] = [];
  if (constraints.targetD) suggestions.push("بازهٔ d کوهن را بازتر کنید یا حجم نمونهٔ هر گروه را بیشتر کنید.");
  if (constraints.targetInteractionEta2) suggestions.push("بازهٔ مجذور اتای تعامل را بازتر کنید یا حجم نمونه را بیشتر کنید.");
  if (constraints.enforceNormality) suggestions.push("اگر پیش‌فرض نرمال بودن سخت‌گیر است، آن را خاموش کنید.");
  if (constraints.enforceSphericity) suggestions.push("اگر کرویت برقرار نمی‌شود، آن را خاموش کنید (در عمل اصلاحات گرین‌هاوس-گایسر هم رایج است).");
  suggestions.push("بازهٔ نمره را بازتر بگذارید تا فضای تولید بیشتر شود.");
  return `با این تنظیمات در ${maxAttempts} تلاش دادهٔ مطلوب پیدا نشد. ${why} پیشنهاد: ${suggestions.slice(0, 4).join(" ")}`;
}

// ---------- خروجی‌های کمکی برای گزارش ----------

export function clinicalRowsToGrouped(rows: (number | null)[][]): ClinicalRows {
  const groupIds: number[] = [];
  const timeData: number[][] = [];
  rows.forEach((row) => {
    const g = row[0];
    if (g == null || !Number.isFinite(g) || g < 1) return;
    groupIds.push(Math.round(g) - 1);
    timeData.push(row.slice(1).map((v) => (v == null || !Number.isFinite(v) ? NaN : v)));
  });
  return { groupIds, timeData };
}

export type { Lists };
