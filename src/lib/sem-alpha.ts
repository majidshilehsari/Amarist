import { mean, sampleStd } from "@/lib/statistics";
import { correlationMatrixWithP, cronbachAlpha, pearson } from "@/lib/sem-stats";
import type { VariableSpec } from "@/lib/sem-generator";

export type AlphaItem = { min: number; max: number; sub: string };

/**
 * پیکربندی فشردهٔ گویه‌ها. فیلد items برای داده‌های قدیمی و نسخهٔ materialized حفظ شده است؛
 * منبع اصلی رابط جدید itemCount/assignments/defaultMin/defaultMax/rangeExceptions است.
 */
export type AlphaScale = {
  varId: number;
  name: string;
  hasTotal: boolean;
  subscales: string[];
  itemCount: number;
  assignments: Record<string, string>;
  defaultMin: number;
  defaultMax: number;
  rangeExceptions: string;
  items: AlphaItem[];
};

export type AlphaResultGroup = {
  name: string;
  k: number;
  alpha: number;
  stdAlpha: number;
  items: { name: string; mean: number; sd: number; itemTotal: number; alphaIfDeleted: number }[];
};

function normalizeDigits(value: string): string {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)))
    .replace(/٫/g, ".")
    .trim();
}

function uniqueSorted(values: number[]): number[] {
  return [...new Set(values)].sort((a, b) => a - b);
}

function faNumbers(values: number[]): string {
  return values.length ? values.join("، ") : "—";
}

export function compressItemNumbers(values: number[]): string {
  const sorted = uniqueSorted(values);
  const parts: string[] = [];
  for (let index = 0; index < sorted.length;) {
    let end = index;
    while (end + 1 < sorted.length && sorted[end + 1] === sorted[end] + 1) end++;
    parts.push(end > index ? `${sorted[index]}-${sorted[end]}` : String(sorted[index]));
    index = end + 1;
  }
  return parts.join(",");
}

/** پارس سخت‌گیرانهٔ فهرست/بازه‌ای مانند 1-5,7,9-12. */
export function parseAlphaItemExpression(expression: string, itemCount: number, label: string): number[] {
  const normalized = normalizeDigits(expression).replace(/[،]/g, ",");
  if (!normalized) throw new Error(`فهرست گویه‌های «${label}» خالی است.`);
  const tokens = normalized.split(",").map((token) => token.trim());
  const invalidTokens: string[] = [];
  const values: number[] = [];
  for (const token of tokens) {
    if (!token) {
      invalidTokens.push("بخش خالی");
      continue;
    }
    const single = token.match(/^\d+$/);
    if (single) {
      values.push(Number(single[0]));
      continue;
    }
    const range = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (!range) {
      invalidTokens.push(token);
      continue;
    }
    const start = Number(range[1]);
    const end = Number(range[2]);
    if (start > end) {
      invalidTokens.push(`${token} (بازه نزولی)`);
      continue;
    }
    for (let item = start; item <= end; item++) values.push(item);
  }
  if (invalidTokens.length) {
    throw new Error(`عبارت نامعتبر در گویه‌های «${label}»: ${invalidTokens.join("، ")}. نمونهٔ درست: 1-5,7,9-12`);
  }
  const outside = uniqueSorted(values.filter((item) => item < 1 || item > itemCount));
  if (outside.length) {
    throw new Error(`شمارهٔ گویه خارج از بازهٔ ۱ تا ${itemCount} در «${label}»: ${faNumbers(outside)}.`);
  }
  return values;
}

function parseBound(value: string, label: string): [number, number] {
  const normalized = normalizeDigits(value);
  const match = normalized.match(/^([+-]?\d+(?:\.\d+)?)\s*-\s*([+-]?\d+(?:\.\d+)?)$/);
  if (!match) throw new Error(`دامنهٔ «${label}» نامعتبر است؛ حداقل و حداکثر را مانند 1-5 بنویسید.`);
  const min = Number(match[1]);
  const max = Number(match[2]);
  if (!Number.isInteger(min) || !Number.isInteger(max)) {
    throw new Error(`دامنهٔ «${label}» باید عدد صحیح باشد تا جمع گویه‌ها دقیق بماند.`);
  }
  if (min >= max) throw new Error(`در دامنهٔ «${label}»، حداقل باید از حداکثر کوچک‌تر باشد.`);
  return [min, max];
}

/**
 * ساخت items معتبر از فرم فشرده. استثناها با «انتخاب‌گر=حداقل-حداکثر» و ; جدا می‌شوند؛
 * مثال: 3=0-4; 7-9=1-7
 */
export function materializeAlphaScale(scale: AlphaScale): AlphaScale {
  const count = Number(scale.itemCount);
  if (!Number.isInteger(count) || count < 2 || count > 500) {
    throw new Error(`تعداد کل گویه‌های «${scale.name}» باید عدد صحیح بین ۲ تا ۵۰۰ باشد.`);
  }
  if (!Number.isInteger(scale.defaultMin) || !Number.isInteger(scale.defaultMax) || scale.defaultMin >= scale.defaultMax) {
    throw new Error(`دامنهٔ مشترک «${scale.name}» باید شامل دو عدد صحیح باشد و حداقل از حداکثر کوچک‌تر باشد.`);
  }

  const owners = new Map<number, string[]>();
  if (scale.subscales.length) {
    for (const subscale of scale.subscales) {
      const values = parseAlphaItemExpression(scale.assignments[subscale] ?? "", count, `${scale.name} — ${subscale}`);
      for (const item of values) owners.set(item, [...(owners.get(item) ?? []), subscale]);
    }
  } else {
    for (let item = 1; item <= count; item++) owners.set(item, [""]);
  }

  const duplicates = [...owners.entries()].filter(([, labels]) => labels.length > 1).map(([item]) => item);
  const missing = Array.from({ length: count }, (_, index) => index + 1).filter((item) => !owners.has(item));
  if (duplicates.length || missing.length) {
    const parts: string[] = [];
    if (missing.length) parts.push(`گویه‌های جاافتاده: ${faNumbers(missing)}`);
    if (duplicates.length) {
      parts.push(`گویه‌های تکراری: ${faNumbers(duplicates)} (${duplicates.map((item) => `${item}: ${(owners.get(item) ?? []).join(" / ")}`).join("؛ ")})`);
    }
    throw new Error(`نگاشت گویه‌های «${scale.name}» کامل و یکتا نیست؛ ${parts.join("؛ ")}.`);
  }

  const bounds = new Map<number, [number, number]>();
  const exceptionOwners = new Map<number, string[]>();
  const clauses = normalizeDigits(scale.rangeExceptions ?? "").split(/[;؛\n]+/).map((part) => part.trim()).filter(Boolean);
  for (const clause of clauses) {
    const equal = clause.indexOf("=");
    if (equal <= 0 || equal === clause.length - 1) {
      throw new Error(`استثنای دامنهٔ نامعتبر در «${scale.name}»: ${clause}. نمونهٔ درست: 3=0-4; 7-9=1-7`);
    }
    const selector = clause.slice(0, equal).trim();
    const range = clause.slice(equal + 1).trim();
    const selected = parseAlphaItemExpression(selector, count, `استثنای ${scale.name}`);
    const parsedBound = parseBound(range, `${scale.name}: ${selector}`);
    for (const item of selected) {
      exceptionOwners.set(item, [...(exceptionOwners.get(item) ?? []), clause]);
      bounds.set(item, parsedBound);
    }
  }
  const repeatedExceptions = [...exceptionOwners.entries()].filter(([, labels]) => labels.length > 1).map(([item]) => item);
  if (repeatedExceptions.length) {
    throw new Error(`برای گویه‌های ${faNumbers(repeatedExceptions)} در «${scale.name}» بیش از یک استثنای دامنه نوشته شده است.`);
  }

  const items: AlphaItem[] = Array.from({ length: count }, (_, index) => {
    const item = index + 1;
    const [min, max] = bounds.get(item) ?? [scale.defaultMin, scale.defaultMax];
    return { min, max, sub: owners.get(item)?.[0] ?? "" };
  });
  for (const subscale of scale.subscales) {
    const amount = items.filter((item) => item.sub === subscale).length;
    if (amount < 2) throw new Error(`زیرمقیاس «${scale.name} — ${subscale}» فقط ${amount} گویه دارد؛ برای آلفا حداقل ۲ گویه لازم است.`);
  }
  return { ...scale, itemCount: count, items };
}

export function materializeAlphaScales(scales: AlphaScale[]): AlphaScale[] {
  return scales.map(materializeAlphaScale);
}

function inferredVariableItems(variable: VariableSpec): { counts: number[]; ranges: [number, number][] } {
  const scoreRanges = variable.subscales.length
    ? variable.subscales.map((subscale) => [subscale.min, subscale.max] as const)
    : [[variable.totalMin, variable.totalMax] as const];
  const inferred = scoreRanges.map(([min, max]) => {
    const ratio = min > 1 ? max / min : NaN;
    if (Number.isInteger(min) && Number.isInteger(ratio) && ratio >= 2 && ratio <= 10) {
      return { count: min, range: [1, ratio] as [number, number] };
    }
    const count = 3;
    const itemMax = min === 0 && Number.isInteger(max / count) ? max / count : 5;
    return { count, range: [min === 0 ? 0 : 1, Math.max(min === 0 ? 1 : 2, itemMax)] as [number, number] };
  });
  return { counts: inferred.map((item) => item.count), ranges: inferred.map((item) => item.range) };
}

function mostFrequentRange(items: AlphaItem[]): [number, number] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = `${item.min}\u0000${item.max}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const key = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "1\u00005";
  const [min, max] = key.split("\u0000").map(Number);
  return [min, max];
}

/** همگام‌سازی متغیرها با فرم جدید و مهاجرت خودکار دادهٔ ذخیره‌شدهٔ نسخهٔ قبلی. */
export function alphaScaleForVariable(variable: VariableSpec, existing?: Partial<AlphaScale>): AlphaScale {
  const subscales = variable.subscales.map((subscale) => subscale.name);
  const inferred = inferredVariableItems(variable);
  const inferredCount = inferred.counts.reduce((sum, count) => sum + count, 0);
  const rawLegacyItems = existing?.items?.length ? existing.items : [];
  const hasCompactConfiguration = Number.isInteger(existing?.itemCount) && existing?.assignments != null;
  const legacyMatchesScoreRanges = rawLegacyItems.length > 0 && (variable.subscales.length
    ? variable.subscales.every((subscale) => {
        const group = rawLegacyItems.filter((item) => item.sub === subscale.name);
        return group.length >= 2
          && group.reduce((sum, item) => sum + item.min, 0) === subscale.min
          && group.reduce((sum, item) => sum + item.max, 0) === subscale.max;
      })
    : rawLegacyItems.reduce((sum, item) => sum + item.min, 0) === variable.totalMin
      && rawLegacyItems.reduce((sum, item) => sum + item.max, 0) === variable.totalMax);
  // نگاشت آزمایشی نسخهٔ قبلی (معمولاً سه گویه برای هر زیرمقیاس) با جمع‌های SEM سازگار نبود؛
  // فقط تنظیم قدیمیِ واقعاً سازگار حفظ می‌شود و در غیر این صورت چیدمان معتبر استنتاج می‌گردد.
  const legacyItems = hasCompactConfiguration || legacyMatchesScoreRanges ? rawLegacyItems : [];
  const itemCount = Number.isInteger(existing?.itemCount) && Number(existing?.itemCount) >= 2
    ? Number(existing?.itemCount)
    : legacyItems.length || inferredCount;

  const defaultAssignments: Record<string, string> = {};
  let offset = 0;
  subscales.forEach((subscale, index) => {
    const count = inferred.counts[index] ?? 0;
    defaultAssignments[subscale] = compressItemNumbers(Array.from({ length: count }, (_, item) => offset + item + 1));
    offset += count;
  });
  const legacyAssignments: Record<string, string> = {};
  if (legacyItems.length) {
    for (const subscale of subscales) {
      legacyAssignments[subscale] = compressItemNumbers(
        legacyItems.flatMap((item, index) => item.sub === subscale ? [index + 1] : [])
      );
    }
  }

  const fallbackItems: AlphaItem[] = [];
  subscales.forEach((subscale, subIndex) => {
    const [min, max] = inferred.ranges[subIndex] ?? [1, 5];
    for (let index = 0; index < (inferred.counts[subIndex] ?? 0); index++) fallbackItems.push({ min, max, sub: subscale });
  });
  if (!subscales.length) {
    const [min, max] = inferred.ranges[0] ?? [1, 5];
    for (let index = 0; index < inferredCount; index++) fallbackItems.push({ min, max, sub: "" });
  }
  const sourceItems = legacyItems.length ? legacyItems : fallbackItems;
  const [legacyMin, legacyMax] = mostFrequentRange(sourceItems);
  const defaultMin = Number.isFinite(existing?.defaultMin) ? Number(existing?.defaultMin) : legacyMin;
  const defaultMax = Number.isFinite(existing?.defaultMax) ? Number(existing?.defaultMax) : legacyMax;
  const legacyExceptions = sourceItems
    .flatMap((item, index) => item.min === defaultMin && item.max === defaultMax ? [] : [`${index + 1}=${item.min}-${item.max}`])
    .join("; ");

  const scale: AlphaScale = {
    varId: variable.id,
    name: variable.name,
    hasTotal: variable.hasTotal,
    subscales,
    itemCount,
    assignments: Object.fromEntries(subscales.map((subscale) => [
      subscale,
      existing?.assignments?.[subscale] ?? legacyAssignments[subscale] ?? defaultAssignments[subscale],
    ])),
    defaultMin,
    defaultMax,
    rangeExceptions: existing?.rangeExceptions ?? legacyExceptions,
    items: sourceItems.map((item) => ({ ...item })),
  };
  try {
    return materializeAlphaScale(scale);
  } catch {
    // فرم نیمه‌کاره باید بدون حذف متن کاربر دوباره نمایش داده شود؛ خطای دقیق هنگام ادامه نشان داده می‌شود.
    return scale;
  }
}

export function alphaColumnName(scale: AlphaScale, item: AlphaItem, index: number): string {
  return item.sub
    ? `${scale.name} — ${item.sub} — گویهٔ ${index + 1}`
    : `${scale.name} — گویهٔ ${index + 1}`;
}

function alphaStandardized(cols: number[][]): number {
  const k = cols.length;
  if (k < 2) return NaN;
  const corr = correlationMatrixWithP(cols).r;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
    sum += corr[i][j];
    count++;
  }
  if (!count) return NaN;
  const average = sum / count;
  return (k * average) / (1 + (k - 1) * average);
}

export function alphaUnits(scales: AlphaScale[]): { name: string; indexes: number[] }[] {
  const units: { name: string; indexes: number[] }[] = [];
  let offset = 0;
  for (const scale of scales) {
    if (scale.subscales.length) {
      for (const subscale of scale.subscales) {
        const indexes = scale.items.flatMap((item, index) => item.sub === subscale ? [offset + index] : []);
        units.push({ name: `${scale.name} — ${subscale}`, indexes });
      }
      if (scale.hasTotal) units.push({ name: `${scale.name} (کل)`, indexes: scale.items.map((_, index) => offset + index) });
    } else {
      units.push({ name: scale.name, indexes: scale.items.map((_, index) => offset + index) });
    }
    offset += scale.items.length;
  }
  return units;
}

export function calculateAlphaGroups(
  rows: (number | null)[][],
  columns: string[],
  scales: AlphaScale[]
): AlphaResultGroup[] {
  return alphaUnits(scales).flatMap((unit) => {
    if (unit.indexes.length < 2) return [];
    const completeRows = rows.filter((row) => unit.indexes.every((index) => Number.isFinite(row[index])));
    if (completeRows.length < 2) return [];
    const cols = unit.indexes.map((index) => completeRows.map((row) => Number(row[index])));
    const items = cols.map((col, localIndex) => {
      const rest = cols.filter((_, index) => index !== localIndex);
      const restTotal = rest[0]?.map((_, rowIndex) => rest.reduce((sum, column) => sum + column[rowIndex], 0)) ?? [];
      return {
        name: columns[unit.indexes[localIndex]] ?? `گویه ${localIndex + 1}`,
        mean: mean(col),
        sd: sampleStd(col),
        itemTotal: restTotal.length ? pearson(col, restTotal).r : NaN,
        alphaIfDeleted: rest.length >= 2 ? cronbachAlpha(rest) : NaN,
      };
    });
    return [{
      name: unit.name,
      k: cols.length,
      alpha: cronbachAlpha(cols),
      stdAlpha: alphaStandardized(cols),
      items,
    }];
  });
}

export function alphaTargetKey(varId: number, subscale: string): string {
  return `${varId}\u0000${subscale}`;
}

function alphaValuesForScale(rows: number[][], scale: AlphaScale): { name: string; alpha: number }[] {
  return alphaUnits([scale]).map((unit) => {
    const columns = unit.indexes.map((index) => rows.map((row) => row[index]));
    return { name: unit.name, alpha: cronbachAlpha(columns) };
  });
}

function randomIndex(length: number): number {
  return Math.floor(Math.random() * length);
}

function allocateExactSum(target: number, items: AlphaItem[], noise: number): number[] {
  const mins = items.map((item) => item.min);
  const capacities = items.map((item) => item.max - item.min);
  const minSum = mins.reduce((sum, value) => sum + value, 0);
  const maxSum = items.reduce((sum, item) => sum + item.max, 0);
  if (!Number.isInteger(target) || target < minSum || target > maxSum) {
    throw new Error("TARGET_OUT_OF_RANGE");
  }
  const totalCapacity = capacities.reduce((sum, value) => sum + value, 0);
  const remaining = target - minSum;
  const fraction = totalCapacity > 0 ? remaining / totalCapacity : 0;
  const raw = capacities.map((capacity) => capacity * fraction);
  const values = mins.map((min, index) => min + Math.floor(raw[index]));
  let left = target - values.reduce((sum, value) => sum + value, 0);
  const residualOrder = raw
    .map((value, index) => ({ index, residual: value - Math.floor(value) + Math.random() * Math.min(0.25, noise * 0.08) }))
    .sort((a, b) => b.residual - a.residual);
  for (const candidate of residualOrder) {
    if (left <= 0) break;
    if (values[candidate.index] < items[candidate.index].max) {
      values[candidate.index]++;
      left--;
    }
  }
  while (left > 0) {
    const candidates = values.flatMap((value, index) => value < items[index].max ? [index] : []);
    if (!candidates.length) throw new Error("TARGET_OUT_OF_RANGE");
    values[candidates[randomIndex(candidates.length)]]++;
    left--;
  }

  const tradeCount = Math.round(noise * items.length * (0.5 + Math.random()));
  for (let trade = 0; trade < tradeCount; trade++) {
    const donors = values.flatMap((value, index) => value > items[index].min ? [index] : []);
    const receivers = values.flatMap((value, index) => value < items[index].max ? [index] : []);
    if (!donors.length || !receivers.length) break;
    const donor = donors[randomIndex(donors.length)];
    const choices = receivers.filter((index) => index !== donor);
    if (!choices.length) continue;
    const receiver = choices[randomIndex(choices.length)];
    values[donor]--;
    values[receiver]++;
  }
  return values;
}

type UnitGeneration = { rows: number[][]; alpha: number };

function generateUnitCandidates(
  label: string,
  items: AlphaItem[],
  targets: number[],
  alphaMin: number,
  alphaMax: number
): UnitGeneration[] {
  const candidates: UnitGeneration[] = [];
  let closestAlpha = NaN;
  let closestDistance = Infinity;
  const midpoint = (alphaMin + alphaMax) / 2;
  // این محاسبه فقط یک بار برای هر زیرمقیاس انجام می‌شود؛ بعداً ترکیب‌های پذیرفته‌شده
  // برای کنترل آلفای کل با هم آزموده می‌شوند.
  for (let attempt = 0; attempt < 120; attempt++) {
    const noise = (attempt % 40) * 0.22 + Math.random() * 0.18;
    const rows = targets.map((target) => allocateExactSum(target, items, noise));
    const columns = items.map((_, index) => rows.map((row) => row[index]));
    const alpha = cronbachAlpha(columns);
    const distance = Number.isFinite(alpha) ? Math.abs(alpha - midpoint) : Infinity;
    if (distance < closestDistance) {
      closestAlpha = alpha;
      closestDistance = distance;
    }
    if (Number.isFinite(alpha) && alpha >= alphaMin && alpha <= alphaMax) {
      candidates.push({ rows, alpha });
      if (candidates.length >= 12) break;
    }
  }
  if (!candidates.length) {
    throw new Error(`با جمع‌های موجود، آلفای «${label}» در بازهٔ ${alphaMin.toFixed(2)} تا ${alphaMax.toFixed(2)} ساخته نمی‌شود؛ نزدیک‌ترین مقدار ${Number.isFinite(closestAlpha) ? closestAlpha.toFixed(3) : "تعریف‌نشده"} بود.`);
  }
  return candidates;
}

export type AlphaSemTargets = Record<string, (number | null)[]>;

/**
 * تولید گویه از نمره‌های موجود SEM. جمع هر زیرمقیاس در تک‌تک ردیف‌ها دقیقاً برابر هدف می‌ماند؛
 * اگر جمع/دامنه/آلفا هم‌زمان شدنی نباشند، خروجی ساختگی تحویل داده نمی‌شود.
 */
export function generateAlphaTrainingData(
  sourceScales: AlphaScale[],
  semTargets: AlphaSemTargets,
  alphaMin: number,
  alphaMax: number
): { columns: string[]; rows: (number | null)[][]; result: AlphaResultGroup[]; scales: AlphaScale[] } {
  const scales = materializeAlphaScales(sourceScales);
  const firstSeries = Object.values(semTargets)[0];
  const n = firstSeries?.length ?? 0;
  if (n < 10) throw new Error("دادهٔ SEM موجود باید حداقل ۱۰ پاسخ‌دهنده داشته باشد.");
  if (!Object.values(semTargets).every((series) => series.length === n)) {
    throw new Error("تعداد ردیف‌های نمره‌های SEM با هم یکسان نیست.");
  }
  const columns = scales.flatMap((scale) => scale.items.map((item, index) => alphaColumnName(scale, item, index)));
  const outputRows: number[][] = Array.from({ length: n }, () => Array(columns.length).fill(0));
  let offset = 0;
  const diagnostics: string[] = [];

  for (const scale of scales) {
    const labels = scale.subscales.length ? scale.subscales : [""];
    const unitIndexes = labels.map((subscale) => scale.items.flatMap((item, index) => item.sub === subscale ? [index] : []));
    const targetLists = labels.map((subscale, unitIndex) => {
      const label = subscale ? `${scale.name} — ${subscale}` : scale.name;
      const targets = semTargets[alphaTargetKey(scale.varId, subscale)];
      if (!targets) throw new Error(`نمرهٔ موجود SEM برای «${label}» پیدا نشد؛ ابتدا داده را در مرحلهٔ داده‌های SEM تولید/ایمپورت و نگاشت کنید.`);
      const items = unitIndexes[unitIndex].map((index) => scale.items[index]);
      const minSum = items.reduce((sum, item) => sum + item.min, 0);
      const maxSum = items.reduce((sum, item) => sum + item.max, 0);
      const missingRows = targets.flatMap((value, row) => value == null || !Number.isFinite(value) ? [row + 1] : []);
      if (missingRows.length) {
        throw new Error(`در نمرهٔ SEM «${label}»، ردیف‌های ${faNumbers(missingRows.slice(0, 30))}${missingRows.length > 30 ? " و ..." : ""} خالی/نامعتبرند؛ جمع دقیق گویه‌ها ممکن نیست.`);
      }
      const decimalRows = targets.flatMap((value, row) => !Number.isInteger(value) ? [row + 1] : []);
      if (decimalRows.length) {
        throw new Error(`نمرهٔ SEM «${label}» در ردیف‌های ${faNumbers(decimalRows.slice(0, 30))}${decimalRows.length > 30 ? " و ..." : ""} اعشاری است؛ با دامنهٔ گویهٔ صحیح، جمع دقیق ممکن نیست.`);
      }
      const outsideRows = targets.flatMap((value, row) => Number(value) < minSum || Number(value) > maxSum ? [row + 1] : []);
      if (outsideRows.length) {
        throw new Error(`جمع گویه‌های «${label}» باید بین ${minSum} و ${maxSum} باشد، اما نمرهٔ SEM در ردیف‌های ${faNumbers(outsideRows.slice(0, 30))}${outsideRows.length > 30 ? " و ..." : ""} خارج از این بازه است.`);
      }
      return targets.map(Number);
    });

    let acceptedScaleRows: number[][] | null = null;
    let acceptedResult: AlphaResultGroup[] | null = null;
    let closest = "";
    let closestDistance = Infinity;
    const scaleColumns = scale.items.map((item, index) => alphaColumnName(scale, item, index));
    const scaleUnits = alphaUnits([scale]);
    const candidatePools = labels.map((subscale, unitIndex) => {
      const localIndexes = unitIndexes[unitIndex];
      const label = subscale ? `${scale.name} — ${subscale}` : scale.name;
      return generateUnitCandidates(
        label,
        localIndexes.map((index) => scale.items[index]),
        targetLists[unitIndex],
        alphaMin,
        alphaMax
      );
    });
    const combinationAttempts = scale.hasTotal && labels.length > 1 ? 240 : 1;
    for (let scaleAttempt = 0; scaleAttempt < combinationAttempts; scaleAttempt++) {
      const candidateRows: number[][] = Array.from({ length: n }, () => Array(scale.items.length).fill(0));
      labels.forEach((_, unitIndex) => {
        const localIndexes = unitIndexes[unitIndex];
        const pool = candidatePools[unitIndex];
        const unit = pool[scaleAttempt % Math.max(1, pool.length)] ?? pool[randomIndex(pool.length)];
        // از تلاش دوم به بعد انتخاب تصادفی، تنوع ترکیب آلفای زیرمقیاس‌ها را بیشتر می‌کند.
        const chosen = scaleAttempt === 0 ? unit : pool[randomIndex(pool.length)];
        for (let row = 0; row < n; row++) {
          localIndexes.forEach((itemIndex, localIndex) => { candidateRows[row][itemIndex] = chosen.rows[row][localIndex]; });
        }
      });
      const candidateAlphas = alphaValuesForScale(candidateRows, scale);
      const distance = candidateAlphas.reduce((sum, group) => {
        if (!Number.isFinite(group.alpha)) return sum + 10;
        if (group.alpha < alphaMin) return sum + alphaMin - group.alpha;
        if (group.alpha > alphaMax) return sum + group.alpha - alphaMax;
        return sum;
      }, 0);
      if (distance < closestDistance) {
        closestDistance = distance;
        closest = candidateAlphas.map((group) => `${group.name}: ${group.alpha.toFixed(3)}`).join("؛ ");
      }
      if (candidateAlphas.length === scaleUnits.length && candidateAlphas.every((group) => Number.isFinite(group.alpha) && group.alpha >= alphaMin && group.alpha <= alphaMax)) {
        acceptedScaleRows = candidateRows;
        acceptedResult = calculateAlphaGroups(candidateRows, scaleColumns, [scale]);
        break;
      }
    }
    if (!acceptedScaleRows || !acceptedResult) {
      throw new Error(`قیود جمع دقیق و آلفای ${alphaMin.toFixed(2)} تا ${alphaMax.toFixed(2)} برای «${scale.name}» هم‌زمان سازگار نیستند. نزدیک‌ترین نتیجه: ${closest || "تعریف‌نشده"}. دامنه/تعداد گویه یا بازهٔ آلفا را اصلاح کنید.`);
    }
    for (let row = 0; row < n; row++) {
      acceptedScaleRows[row].forEach((value, index) => { outputRows[row][offset + index] = value; });
    }
    diagnostics.push(...acceptedResult.map((group) => `${group.name}=${group.alpha.toFixed(3)}`));
    offset += scale.items.length;
  }

  const rows: (number | null)[][] = outputRows;
  const result = calculateAlphaGroups(rows, columns, scales);
  const units = alphaUnits(scales);
  if (result.length !== units.length || result.some((group) => !Number.isFinite(group.alpha) || group.alpha < alphaMin || group.alpha > alphaMax)) {
    throw new Error(`کنترل نهایی آلفا ناموفق بود (${diagnostics.join("؛ ")})؛ هیچ دادهٔ ناسازگاری تحویل داده نشد.`);
  }
  return { columns, rows, result, scales };
}
