// ============================================================
// موتور تولید داده تمرینی — آماریست
// برگرفته از مدل کاربر: تولید سه لیست ۴۵تایی با سه گروه ۱۵نفره
// ============================================================

import {
  GROUPS,
  GROUP_SIZE,
  clamp,
  mean,
  median,
  sampleVariance,
  shuffle,
  shuffleInPlace,
  randomNormal,
  inverseNormalCDF,
  shapiroWilkTest,
  ksNormalityTest,
  leveneTest,
  boxMTest,
  mauchlyTest,
  mixedAnovaResults,
  pairedBonferroniComparison,
  fmt,
  fmtP,
  type Lists,
} from "./statistics";

// ---------- انواع ----------

export type Direction = "up" | "down" | "random";

export type ChangeConfig = {
  mode: "fixed" | "random";
  direction: Direction;
  minPct: number;
  maxPct: number;
};

export type BonfKey = "12" | "13" | "23";
export type BonfValue = "sig" | "ns" | "any";
export type BonfTarget = Record<BonfKey, BonfValue>;

export type AnalysisTargets = {
  enforce: boolean;
  bonferroni: BonfTarget[];
  effectRange: { min: number; max: number };
};

export type GenCriteria = {
  enforceAssumptions: boolean;
  analysisTargets: AnalysisTargets | null;
};

export type Evaluation = { pass: boolean; score: number; messages: string[] };

export type GenResult = {
  lists: Lists;
  attempts: number;
  evaluation?: Evaluation;
  guaranteed?: boolean;
};

export type Changes = { list2: ChangeConfig[]; list3: ChangeConfig[] };

// ---------- ابزارهای پایه ----------

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function transformByBias(u: number, bias: number): number {
  const strength = Math.abs(bias - 50) / 50;
  const exponent = 1 + strength * 5;
  if (bias < 50) return Math.pow(u, exponent);
  if (bias > 50) return 1 - Math.pow(1 - u, exponent);
  return u;
}

function typicalPercentForConfig(config: ChangeConfig): number {
  return Math.max(0.01, (config.minPct + config.maxPct) / 200);
}

function medianAbsNonZero(values: number[]): number {
  return Math.max(1, median(values.map((x) => Math.abs(x)).filter((x) => x > 0)) || 1);
}

// ---------- لیست پایه ----------

export function generateBaseList(min: number, max: number, bias: number): number[][] {
  const total = GROUPS * GROUP_SIZE;
  const values: number[] = [];
  for (let i = 0; i < total; i++) {
    const u = Math.random();
    const t = transformByBias(u, bias);
    values.push(clamp(Math.round(min + t * (max - min)), min, max));
  }
  values.sort((a, b) => a - b);

  const groups: number[][] = Array.from({ length: GROUPS }, () => []);
  for (let block = 0; block < GROUP_SIZE; block++) {
    const chunk = values.slice(block * GROUPS, block * GROUPS + GROUPS);
    const groupOrder = shuffle([0, 1, 2]);
    for (let j = 0; j < GROUPS; j++) {
      groups[groupOrder[j]].push(chunk[j]);
    }
  }
  groups.forEach(shuffleInPlace);
  return groups;
}

export function generateAssumptionFriendlyBaseList(min: number, max: number, bias: number): number[][] {
  const range = max - min;
  const effectiveBias = clamp(bias, 12, 88);
  const targetMean = min + (effectiveBias / 100) * range;
  const edgeDistance = Math.max(1, Math.min(targetMean - min, max - targetMean));
  const sd = Math.max(1, Math.min(range / 5.8, edgeDistance / 2.15));
  const groups: number[][] = [];
  for (let g = 0; g < GROUPS; g++) {
    const groupShift = randomNormal(Math.random) * sd * 0.08;
    const values: number[] = [];
    for (let i = 0; i < GROUP_SIZE; i++) {
      const q = (i + 0.5) / GROUP_SIZE;
      const z = inverseNormalCDF(q);
      const jitter = randomNormal(Math.random) * 0.16;
      const value = Math.round(targetMean + groupShift + sd * (z + jitter));
      values.push(clamp(value, min, max));
    }
    groups.push(shuffle(values));
  }
  return groups;
}

// ---------- تغییر لیست‌ها ----------

export function applyPercentChange(
  value: number,
  config: ChangeConfig,
  min: number,
  max: number,
  shouldClamp: boolean
): number {
  const percent = randomBetween(config.minPct, config.maxPct) / 100;
  let sign: number;
  if (config.mode === "fixed") {
    sign = config.direction === "up" ? 1 : -1;
  } else {
    sign = Math.random() < 0.5 ? -1 : 1;
    if (shouldClamp && value >= max) sign = -1;
    if (shouldClamp && value <= min) sign = 1;
  }
  let nextValue = Math.round(value * (1 + sign * percent));
  if (sign > 0 && nextValue <= value) nextValue = value + 1;
  if (sign < 0 && nextValue >= value) nextValue = value - 1;
  if (shouldClamp) nextValue = clamp(nextValue, min, max);
  return nextValue;
}

export function makeChangedList(
  previousList: number[][],
  configs: ChangeConfig[],
  min: number,
  max: number,
  shouldClamp: boolean
): number[][] {
  return previousList.map((group, groupIndex) => {
    const config = configs[groupIndex];
    return group.map((value) => applyPercentChange(value, config, min, max, shouldClamp));
  });
}

export function possibleDeltasFromConfig(
  value: number,
  config: ChangeConfig,
  min: number,
  max: number,
  shouldClamp: boolean
): number[] {
  const deltas = new Set<number>();
  const minPct = Math.max(0, config.minPct);
  const maxPct = Math.max(minPct, config.maxPct);
  const stepCount = Math.max(1, Math.ceil((maxPct - minPct) / 0.1));
  const directions = config.mode === "fixed" ? [config.direction === "down" ? -1 : 1] : [-1, 1];
  for (let i = 0; i <= stepCount; i++) {
    const pct = minPct + (maxPct - minPct) * (i / stepCount);
    const p = pct / 100;
    directions.forEach((sign) => {
      let nextValue = Math.round(value * (1 + sign * p));
      if (p > 0 && sign > 0 && nextValue <= value) nextValue = value + 1;
      if (p > 0 && sign < 0 && nextValue >= value) nextValue = value - 1;
      if (shouldClamp) nextValue = clamp(nextValue, min, max);
      deltas.add(nextValue - value);
    });
  }
  return Array.from(deltas);
}

export function chooseClosest(values: number[], target: number): number {
  let best = values[0];
  let bestDistance = Math.abs(values[0] - target);
  for (let i = 1; i < values.length; i++) {
    const distance = Math.abs(values[i] - target);
    if (distance < bestDistance || (distance === bestDistance && Math.random() < 0.5)) {
      best = values[i];
      bestDistance = distance;
    }
  }
  return best;
}

function makeAssumptionFriendlyThirdList(
  list1: number[][],
  list2: number[][],
  configs: ChangeConfig[],
  min: number,
  max: number,
  shouldClamp: boolean
): number[][] {
  const d12: number[] = [];
  for (let g = 0; g < GROUPS; g++) {
    for (let i = 0; i < GROUP_SIZE; i++) d12.push(list2[g][i] - list1[g][i]);
  }
  const meanD12 = mean(d12);
  const varD12 = Math.max(sampleVariance(d12), 0.0001);
  const sdD12 = Math.sqrt(varD12);

  return list2.map((group, groupIndex) =>
    group.map((value, rowIndex) => {
      const optionsRaw = possibleDeltasFromConfig(value, configs[groupIndex], min, max, shouldClamp);
      const options = optionsRaw.length ? optionsRaw : [0];
      if (options.length === 1) return value + options[0];
      const absTypical = medianAbsNonZero(options);
      const currentD12 = list2[groupIndex][rowIndex] - list1[groupIndex][rowIndex];
      const dominantSign =
        Math.abs(meanD12) < 0.35 ? (currentD12 >= meanD12 ? -1 : 1) : meanD12 > 0 ? -1 : 1;
      const baseTarget = dominantSign * absTypical;
      const target = baseTarget - 0.5 * (currentD12 - meanD12) + randomNormal(Math.random) * sdD12 * 0.55;
      let delta: number;
      if (Math.random() < 0.12) {
        delta = options[Math.floor(Math.random() * options.length)];
      } else {
        delta = chooseClosest(options, target);
      }
      return value + delta;
    })
  );
}

function desiredMeanShiftsForGroup(
  groupIndex: number,
  targetMean: number,
  changes: Changes,
  analysisTargets: AnalysisTargets
): number[] {
  const groupTarget = analysisTargets.bonferroni[groupIndex];
  const config2 = changes.list2[groupIndex];
  const sign = config2.mode === "fixed" && config2.direction === "down" ? -1 : 1;
  const d = Math.max(1.2, Math.abs(targetMean * typicalPercentForConfig(config2)));
  const shifts = [0, 0, 0];
  shifts[1] = groupTarget["12"] === "sig" ? sign * d : 0;
  if (groupTarget["13"] === "sig" && groupTarget["23"] === "ns") {
    shifts[2] = shifts[1];
  } else if (groupTarget["13"] === "ns" && groupTarget["23"] === "sig") {
    shifts[2] = 0;
  } else if (groupTarget["13"] === "sig" && groupTarget["23"] === "sig") {
    shifts[2] = shifts[1] + sign * d;
  } else if (groupTarget["13"] === "ns" && groupTarget["23"] === "ns") {
    shifts[2] = 0;
  } else if (groupTarget["13"] === "sig") {
    shifts[2] = sign * d;
  } else if (groupTarget["23"] === "ns") {
    shifts[2] = shifts[1];
  } else {
    shifts[2] = 0;
  }
  return shifts;
}

export function makeModelBasedDataset(
  min: number,
  max: number,
  bias: number,
  changes: Changes,
  analysisTargets: AnalysisTargets
): Lists {
  const range = max - min;
  const effectiveBias = clamp(bias, 20, 80);
  const targetMean = min + (effectiveBias / 100) * range;
  const rawShifts = Array.from({ length: GROUPS }, (_, g) =>
    desiredMeanShiftsForGroup(g, targetMean, changes, analysisTargets)
  );
  const shiftScale = randomBetween(1.45, 2.65);
  const shifts = rawShifts.map((row) => row.map((x) => x * shiftScale));

  const nonZeroShifts = shifts.flat().map(Math.abs).filter((x) => x > 0.05);
  const typicalShift = nonZeroShifts.length ? median(nonZeroShifts) : Math.max(1, range * 0.04);
  const sdWithin = Math.max(0.55, typicalShift * randomBetween(0.34, 0.48));
  const sdBetween = Math.max(1.0, typicalShift * randomBetween(0.35, 0.95));

  const lists: Lists = Array.from({ length: 3 }, () =>
    Array.from({ length: GROUPS }, () => [] as number[])
  );

  for (let g = 0; g < GROUPS; g++) {
    const subjectBases = Array.from({ length: GROUP_SIZE }, () => targetMean + randomNormal(Math.random) * sdBetween);
    const residualMatrix = Array.from({ length: GROUP_SIZE }, () =>
      [randomNormal(Math.random), randomNormal(Math.random), randomNormal(Math.random)].map((z) => z * sdWithin)
    );
    for (let t = 0; t < 3; t++) {
      const residualMean = mean(residualMatrix.map((row) => row[t]));
      for (let i = 0; i < GROUP_SIZE; i++) residualMatrix[i][t] -= residualMean;
    }
    for (let i = 0; i < GROUP_SIZE; i++) {
      for (let t = 0; t < 3; t++) {
        const value = Math.round(subjectBases[i] + shifts[g][t] + residualMatrix[i][t]);
        lists[t][g].push(clamp(value, min, max));
      }
    }
  }
  return lists;
}

export function makeStandardDataset(
  min: number,
  max: number,
  bias: number,
  changes: Changes,
  shouldClamp: boolean
): Lists {
  const list1 = generateBaseList(min, max, bias);
  const list2 = makeChangedList(list1, changes.list2, min, max, shouldClamp);
  const list3 = makeChangedList(list2, changes.list3, min, max, shouldClamp);
  return [list1, list2, list3];
}

// ---------- ارزیابی ----------

function targetLabel(value: BonfValue): string {
  if (value === "sig") return "معنی‌دار";
  if (value === "ns") return "غیرمعنی‌دار";
  return "مهم نیست";
}

function targetMarginForP(pValue: number, target: BonfValue, alpha: number): number {
  if (target === "any") return Infinity;
  if (!Number.isFinite(pValue)) return -Infinity;
  if (target === "sig") return alpha - pValue;
  return pValue - alpha;
}

export function evaluateAssumptionPass(
  lists: Lists,
  alpha: number
): { valid: boolean; pass: boolean; score: number; boxP: number; mauchlyP: number } {
  const pValues: number[] = [];
  let pass = true;
  let valid = true;

  for (let li = 0; li < lists.length; li++) {
    for (let gi = 0; gi < GROUPS; gi++) {
      const sw = shapiroWilkTest(lists[li][gi]);
      const ks = ksNormalityTest(lists[li][gi]);
      if (!sw.valid || !Number.isFinite(sw.p)) {
        valid = false;
        pass = false;
        pValues.push(0);
      } else {
        pValues.push(sw.p);
        if (sw.p < alpha) pass = false;
      }
      if (!ks.valid || !Number.isFinite(ks.p)) {
        valid = false;
        pass = false;
        pValues.push(0);
      } else {
        pValues.push(ks.p);
        if (ks.p < alpha) pass = false;
      }
    }
  }
  for (let li = 0; li < lists.length; li++) {
    const lev = leveneTest(lists[li]);
    if (!lev.valid || !Number.isFinite(lev.p)) {
      valid = false;
      pass = false;
      pValues.push(0);
    } else {
      pValues.push(lev.p);
      if (lev.p < alpha) pass = false;
    }
  }
  const box = boxMTest(lists);
  if (!box.valid || !Number.isFinite(box.p)) {
    valid = false;
    pass = false;
    pValues.push(0);
  } else {
    pValues.push(box.p);
    if (box.p < alpha) pass = false;
  }
  const mauchly = mauchlyTest(lists);
  if (!mauchly.valid || !Number.isFinite(mauchly.p)) {
    valid = false;
    pass = false;
    pValues.push(0);
  } else {
    pValues.push(mauchly.p);
    if (mauchly.p < alpha) pass = false;
  }

  return { valid, pass, score: Math.min(...pValues), boxP: box.p, mauchlyP: mauchly.p };
}

export function evaluateAnalysisTargets(
  lists: Lists,
  analysisTargets: AnalysisTargets,
  alpha: number
): { pass: boolean; score: number; messages: string[]; effects: { label: string; value: number }[] } {
  if (!analysisTargets.enforce) {
    return {
      pass: true,
      score: Infinity,
      messages: [],
      effects: [{ label: "زمان", value: mixedAnovaResults(lists).time.eta }],
    };
  }
  const pairs: { key: BonfKey; i: number; j: number; label: string }[] = [
    { key: "12", i: 0, j: 1, label: "لیست ۱ با لیست ۲" },
    { key: "13", i: 0, j: 2, label: "لیست ۱ با لیست ۳" },
    { key: "23", i: 1, j: 2, label: "لیست ۲ با لیست ۳" },
  ];
  let pass = true;
  let score = Infinity;
  const messages: string[] = [];

  for (let g = 0; g < GROUPS; g++) {
    pairs.forEach((pair) => {
      const target = analysisTargets.bonferroni[g][pair.key];
      if (target === "any") return;
      const result = pairedBonferroniComparison(lists, g, pair.i, pair.j);
      const margin = targetMarginForP(result.p, target, alpha);
      score = Math.min(score, margin);
      if (margin < 0) {
        pass = false;
        messages.push(
          `گروه ${g + 1}، ${pair.label}: هدف ${targetLabel(target)} بود اما p=${fmtP(result.p)} شد.`
        );
      }
    });
  }

  const anova = mixedAnovaResults(lists);
  const effects = [
    { label: "زمان", value: anova.time.eta },
    { label: "زمان*گروه", value: anova.timeGroup.eta },
    { label: "بین گروهی", value: anova.group.eta },
  ];
  effects.forEach((item) => {
    const effectMargin = Math.min(
      item.value - analysisTargets.effectRange.min,
      analysisTargets.effectRange.max - item.value
    );
    score = Math.min(score, effectMargin);
    if (effectMargin < 0) {
      pass = false;
      messages.push(
        `اندازه اثر ${item.label} باید بین ${fmt(analysisTargets.effectRange.min, 3)} تا ${fmt(
          analysisTargets.effectRange.max,
          3
        )} باشد، اما ${fmt(item.value, 3)} شد.`
      );
    }
  });

  return { pass, score, messages, effects };
}

export function evaluateGenerationCriteria(lists: Lists, alpha: number, criteria: GenCriteria): Evaluation {
  let pass = true;
  let score = Infinity;
  const messages: string[] = [];

  if (criteria.enforceAssumptions) {
    const assumption = evaluateAssumptionPass(lists, alpha);
    pass = pass && assumption.pass;
    score = Math.min(score, assumption.score - alpha);
    if (!assumption.pass) messages.push("حداقل یکی از پیش‌فرض‌های آماری برقرار نشد.");
  }
  if (criteria.analysisTargets && criteria.analysisTargets.enforce) {
    const analysis = evaluateAnalysisTargets(lists, criteria.analysisTargets, alpha);
    pass = pass && analysis.pass;
    score = Math.min(score, analysis.score);
    messages.push(...analysis.messages);
  }

  return { pass, score, messages };
}

export function buildGenerationSuggestions(criteria: GenCriteria): string {
  const suggestions: string[] = [];
  const targets = criteria.analysisTargets;
  if (targets && targets.enforce) {
    targets.bonferroni.forEach((groupTarget, index) => {
      const g = index + 1;
      if (groupTarget["12"] === "ns") {
        suggestions.push(
          `برای غیرمعنی‌دار شدن «گروه ${g}: لیست ۱ با لیست ۲»، در بخش ۳ جهت لیست ۲ همان گروه را «رندوم» کنید.`
        );
      }
      if (groupTarget["12"] === "sig") {
        suggestions.push(
          `برای معنی‌دار شدن «گروه ${g}: لیست ۱ با لیست ۲»، در بخش ۳ جهت لیست ۲ همان گروه را ثابت روی «افزایش» یا «کاهش» بگذارید.`
        );
      }
      if (groupTarget["23"] === "ns") {
        suggestions.push(
          `برای غیرمعنی‌دار شدن «گروه ${g}: لیست ۲ با لیست ۳»، در بخش ۳ جهت لیست ۳ همان گروه را «رندوم» کنید.`
        );
      }
      if (groupTarget["23"] === "sig") {
        suggestions.push(
          `برای معنی‌دار شدن «گروه ${g}: لیست ۲ با لیست ۳»، در بخش ۳ جهت لیست ۳ همان گروه را ثابت روی «افزایش» یا «کاهش» بگذارید.`
        );
      }
    });
    suggestions.push(
      "اگر اندازه اثرها کمتر از حداقل هدف شدند، جهت گروه‌هایی که باید معنی‌دار باشند را هم‌جهت و ثابت کنید، مثلاً افزایش/افزایش."
    );
    suggestions.push(
      "اگر اندازه اثرها بیشتر از حداکثر هدف شدند، جهت بعضی گروه‌ها را «رندوم» کنید یا بازه اندازه اثر را کمی بازتر بگذارید."
    );
  }
  suggestions.push("اگر باز هم خروجی پیدا نشد، «حداکثر تلاش» را بیشتر کنید یا سطح α/بازه اندازه اثر را کمی منعطف‌تر کنید.");
  return suggestions.slice(0, 8).join(" | ");
}

// ---------- تولید با قیدها ----------

export function generateDatasetWithAssumptions(
  min: number,
  max: number,
  bias: number,
  changes: Changes,
  shouldClamp: boolean,
  alpha: number,
  maxAttempts: number,
  criteria: GenCriteria
): GenResult {
  let best: { lists: Lists; evaluation: Evaluation; attempts: number } | null = null;
  let attempts = 0;
  const thirdTriesPerBase = criteria.analysisTargets && criteria.analysisTargets.enforce ? 95 : 70;

  while (attempts < maxAttempts) {
    if (criteria.analysisTargets && criteria.analysisTargets.enforce) {
      const lists = makeModelBasedDataset(min, max, bias, changes, criteria.analysisTargets);
      const evaluation = evaluateGenerationCriteria(lists, alpha, criteria);
      attempts++;
      if (!best || evaluation.score > best.evaluation.score) {
        best = { lists, evaluation, attempts };
      }
      if (evaluation.pass) return { lists, attempts, evaluation, guaranteed: true };
      continue;
    }

    const baseAttempt = Math.floor(attempts / thirdTriesPerBase);
    const list1 =
      baseAttempt % 4 === 0 ? generateBaseList(min, max, bias) : generateAssumptionFriendlyBaseList(min, max, bias);
    const list2 = makeChangedList(list1, changes.list2, min, max, shouldClamp);

    for (let t = 0; t < thirdTriesPerBase && attempts < maxAttempts; t++) {
      let list3: number[][];
      if (t === 0) {
        list3 = makeChangedList(list2, changes.list3, min, max, shouldClamp);
      } else {
        list3 = makeAssumptionFriendlyThirdList(list1, list2, changes.list3, min, max, shouldClamp);
      }
      const lists: Lists = [list1, list2, list3];
      const evaluation = evaluateGenerationCriteria(lists, alpha, criteria);
      attempts++;
      if (!best || evaluation.score > best.evaluation.score) {
        best = { lists, evaluation, attempts };
      }
      if (evaluation.pass) return { lists, attempts, evaluation, guaranteed: true };
    }
  }

  const bestScore = best && Number.isFinite(best.evaluation.score) ? fmt(best.evaluation.score, 3) : "-";
  const why =
    best && best.evaluation.messages.length
      ? best.evaluation.messages.slice(0, 3).join(" | ")
      : "شرایط هدف برقرار نشد.";
  const suggestions = buildGenerationSuggestions(criteria);
  throw new Error(
    `با این تنظیمات، در ${maxAttempts} تلاش داده‌ای که همه شرایط را پاس کند پیدا نشد. بهترین امتیاز معیار: ${bestScore}. ${why} پیشنهاد: ${suggestions}`
  );
}
