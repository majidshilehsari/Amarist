"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Copy, Download, Play, RefreshCw, Sigma } from "lucide-react";
import {
  GROUPS,
  GROUP_SIZE,
  fmt,
  fmtP,
  mean,
  sampleStd,
  stdPopulation,
  variancePopulation,
  shapiroWilkTest,
  ksNormalityTest,
  leveneTest,
  boxMTest,
  mauchlyTest,
  mixedAnovaResults,
  pairedBonferroniComparison,
  type Lists,
} from "@/lib/statistics";
import {
  generateDatasetWithAssumptions,
  makeStandardDataset,
  type AnalysisTargets,
  type BonfTarget,
  type BonfValue,
  type Changes,
  type Direction,
} from "@/lib/generator";

// ------------------------------------------------------------
// توابع ساخت HTML جدول‌ها (برگرفته از مدل اصلی)
// ------------------------------------------------------------

function pctClass(value: number): string {
  if (!Number.isFinite(value) || Math.abs(value) < 0.000001) return "flat";
  return value > 0 ? "up" : "down";
}

function fmtSignedInteger(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (value > 0) return "+" + value;
  return String(value);
}

function pctText(value: number): string {
  if (!Number.isFinite(value)) return "-";
  if (Math.abs(value) < 0.000001) return "بدون تغییر (0%)";
  return `<span class="${pctClass(value)}">${value > 0 ? "افزایش" : "کاهش"} ${fmt(Math.abs(value), 2)}%</span>`;
}

function assumptionBadgeFromP(pValue: number, alpha: number): string {
  if (!Number.isFinite(pValue)) return '<span class="assumption-badge assumption-warn">نامشخص</span>';
  if (pValue >= alpha) return '<span class="assumption-badge assumption-ok">برقرار</span>';
  return '<span class="assumption-badge assumption-bad">برقرار نیست</span>';
}

function assumptionBadgeFromBool(pass: boolean, valid = true): string {
  if (!valid) return '<span class="assumption-badge assumption-warn">نامشخص</span>';
  if (pass) return '<span class="assumption-badge assumption-ok">برقرار</span>';
  return '<span class="assumption-badge assumption-bad">برقرار نیست</span>';
}

function bonferroniBadge(pValue: number, alpha: number): string {
  if (!Number.isFinite(pValue)) return '<span class="assumption-badge assumption-warn">نامشخص</span>';
  if (pValue < alpha) return `<span class="assumption-badge assumption-ok">معنی‌دار؛ p=${fmtP(pValue)}</span>`;
  return `<span class="assumption-badge assumption-bad">غیرمعنی‌دار؛ p=${fmtP(pValue)}</span>`;
}

function statsOf(values: number[]) {
  return {
    n: values.length,
    mean: mean(values),
    variance: variancePopulation(values),
    std: stdPopulation(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function buildDataTable(lists: Lists): string {
  let html = "";
  for (let row = 0; row < GROUP_SIZE; row++) {
    html += "<tr>";
    html += `<td class="row-index">${row + 1}</td>`;
    for (let g = 0; g < GROUPS; g++) {
      html += `<td class="number-cell">${lists[0][g][row]}</td>`;
    }
    for (let g = 0; g < GROUPS; g++) {
      const delta = lists[1][g][row] - lists[0][g][row];
      html += `<td class="number-cell">${lists[1][g][row]}</td>`;
      html += `<td class="delta-cell ${pctClass(delta)}">${fmtSignedInteger(delta)}</td>`;
    }
    for (let g = 0; g < GROUPS; g++) {
      const delta = lists[2][g][row] - lists[1][g][row];
      html += `<td class="number-cell">${lists[2][g][row]}</td>`;
      html += `<td class="delta-cell ${pctClass(delta)}">${fmtSignedInteger(delta)}</td>`;
    }
    html += "</tr>";
  }
  return html;
}

function buildStatsHtml(lists: Lists): string {
  let html = "";
  lists.forEach((list, li) => {
    list.forEach((group, gi) => {
      const s = statsOf(group);
      html += "<tr>";
      html += `<td>لیست ${li + 1}${li === 0 ? " (پایه)" : ""}</td>`;
      html += `<td>گروه ${gi + 1}</td>`;
      html += `<td class="number-cell">${s.n}</td>`;
      html += `<td class="number-cell">${fmt(s.mean)}</td>`;
      html += `<td class="number-cell">${fmt(s.variance)}</td>`;
      html += `<td class="number-cell">${fmt(s.std)}</td>`;
      html += `<td class="number-cell">${s.min}</td>`;
      html += `<td class="number-cell">${s.max}</td>`;
      html += "</tr>";
    });
    const overall = statsOf(list.flat());
    html += '<tr style="background:#f8fafc;font-weight:900;">';
    html += `<td>لیست ${li + 1}</td>`;
    html += "<td>کل ۴۵ عدد</td>";
    html += `<td class="number-cell">${overall.n}</td>`;
    html += `<td class="number-cell">${fmt(overall.mean)}</td>`;
    html += `<td class="number-cell">${fmt(overall.variance)}</td>`;
    html += `<td class="number-cell">${fmt(overall.std)}</td>`;
    html += `<td class="number-cell">${overall.min}</td>`;
    html += `<td class="number-cell">${overall.max}</td>`;
    html += "</tr>";
  });
  return html;
}

function buildCompareHtml(lists: Lists): string {
  const groupNames = ["اول", "دوم", "سوم"];
  const comparisons = [
    {
      title: "لیست ۲ نسبت به لیست ۱",
      rows: [
        { targetList: 1, baseList: 0, group: 0 },
        { targetList: 1, baseList: 0, group: 1 },
        { targetList: 1, baseList: 0, group: 2 },
      ],
    },
    {
      title: "لیست ۳ نسبت به لیست ۱",
      rows: [
        { targetList: 2, baseList: 0, group: 0 },
        { targetList: 2, baseList: 0, group: 1 },
        { targetList: 2, baseList: 0, group: 2 },
      ],
    },
    {
      title: "لیست ۳ نسبت به لیست ۲",
      rows: [
        { targetList: 2, baseList: 1, group: 0 },
        { targetList: 2, baseList: 1, group: 1 },
        { targetList: 2, baseList: 1, group: 2 },
      ],
    },
  ];
  let html = "";
  comparisons.forEach((section) => {
    html += `<tr style="background:#f8fafc;font-weight:900;"><td colspan="5">${section.title}</td></tr>`;
    section.rows.forEach((item) => {
      const baseStats = statsOf(lists[item.baseList][item.group]);
      const targetStats = statsOf(lists[item.targetList][item.group]);
      const diffMean = targetStats.mean - baseStats.mean;
      const diffPct = baseStats.mean === 0 ? NaN : ((targetStats.mean - baseStats.mean) / baseStats.mean) * 100;
      html += "<tr>";
      html += `<td>لیست ${item.targetList + 1} گروه ${groupNames[item.group]} نسبت به لیست ${item.baseList + 1} گروه ${groupNames[item.group]}</td>`;
      html += `<td class="number-cell">${fmt(baseStats.mean)}</td>`;
      html += `<td class="number-cell">${fmt(targetStats.mean)}</td>`;
      html += `<td class="number-cell ${pctClass(diffMean)}">${diffMean > 0 ? "+" : ""}${fmt(diffMean)}</td>`;
      html += `<td>${pctText(diffPct)}</td>`;
      html += "</tr>";
    });
  });
  return html;
}

type NormalityAgg = { valid: boolean; shapiroPass: boolean; ksPass: boolean; minShapiro: number; minKs: number };
type LeveneAgg = { valid: boolean; pass: boolean; minP: number };

function buildNormalityHtml(lists: Lists, alpha: number): { html: string; agg: NormalityAgg } {
  let html = "";
  let minShapiro = Infinity;
  let minKs = Infinity;
  let shapiroPass = true;
  let ksPass = true;
  let allValid = true;
  lists.forEach((list, li) => {
    list.forEach((group, gi) => {
      const sd = sampleStd(group);
      const sw = shapiroWilkTest(group);
      const ks = ksNormalityTest(group);
      const swOk = sw.valid && sw.p >= alpha;
      const ksOk = ks.valid && ks.p >= alpha;
      if (sw.valid) minShapiro = Math.min(minShapiro, sw.p);
      else allValid = false;
      if (ks.valid) minKs = Math.min(minKs, ks.p);
      else allValid = false;
      if (!swOk) shapiroPass = false;
      if (!ksOk) ksPass = false;
      html += "<tr>";
      html += `<td>لیست ${li + 1}${li === 0 ? " (پایه)" : ""}</td>`;
      html += `<td>گروه ${gi + 1}</td>`;
      html += `<td class="number-cell">${group.length}</td>`;
      html += `<td class="number-cell">${fmt(mean(group))}</td>`;
      html += `<td class="number-cell">${fmt(sd)}</td>`;
      html += `<td class="number-cell">${sw.valid ? fmt(sw.w, 4) : "-"}</td>`;
      html += `<td class="number-cell">${fmtP(sw.p)}</td>`;
      html += `<td>${assumptionBadgeFromP(sw.p, alpha)}</td>`;
      html += `<td class="number-cell">${ks.valid ? fmt(ks.d, 4) : "-"}</td>`;
      html += `<td class="number-cell">${fmtP(ks.p)}</td>`;
      html += `<td>${assumptionBadgeFromP(ks.p, alpha)}</td>`;
      html += `<td>${assumptionBadgeFromBool(swOk && ksOk, sw.valid && ks.valid)}</td>`;
      html += "</tr>";
    });
  });
  return {
    html,
    agg: {
      valid: allValid,
      shapiroPass,
      ksPass,
      minShapiro: Number.isFinite(minShapiro) ? minShapiro : NaN,
      minKs: Number.isFinite(minKs) ? minKs : NaN,
    },
  };
}

function buildLeveneHtml(lists: Lists, alpha: number): { html: string; agg: LeveneAgg } {
  let html = "";
  let minP = Infinity;
  let allPass = true;
  let allValid = true;
  lists.forEach((list, li) => {
    const result = leveneTest(list);
    if (result.valid) minP = Math.min(minP, result.p);
    else allValid = false;
    if (!(result.valid && result.p >= alpha)) allPass = false;
    html += "<tr>";
    html += `<td>لیست ${li + 1}${li === 0 ? " (پایه)" : ""}</td>`;
    html += "<td>گروه ۱، گروه ۲، گروه ۳</td>";
    html += `<td class="number-cell">${Number.isFinite(result.f) ? fmt(result.f, 4) : "-"}</td>`;
    html += `<td class="number-cell">${result.df1}</td>`;
    html += `<td class="number-cell">${result.df2}</td>`;
    html += `<td class="number-cell">${fmtP(result.p)}</td>`;
    html += `<td>${assumptionBadgeFromP(result.p, alpha)}</td>`;
    html += "</tr>";
  });
  return {
    html,
    agg: { valid: allValid, pass: allPass, minP: Number.isFinite(minP) ? minP : NaN },
  };
}

function buildBoxHtml(lists: Lists, alpha: number): { html: string; agg: { valid: boolean; pass: boolean; p: number } } {
  const result = boxMTest(lists);
  let html = "<tr>";
  html += "<td>Box's M</td>";
  html += `<td class="number-cell">${result.valid ? fmt(result.m, 4) : "-"}</td>`;
  html += `<td class="number-cell">${result.valid ? fmt(result.chi, 4) : "-"}</td>`;
  html += `<td class="number-cell">${result.valid ? fmt(result.df, 0) : "-"}</td>`;
  html += `<td class="number-cell">${fmtP(result.p)}</td>`;
  html += `<td>${assumptionBadgeFromP(result.p, alpha)}</td>`;
  html += `<td>${result.message}</td>`;
  html += "</tr>";
  return { html, agg: { valid: result.valid, pass: result.valid && result.p >= alpha, p: result.p } };
}

function buildMauchlyHtml(
  lists: Lists,
  alpha: number
): { html: string; agg: { valid: boolean; pass: boolean; p: number } } {
  const result = mauchlyTest(lists);
  let html = "<tr>";
  html += "<td>لیست ۱، لیست ۲، لیست ۳</td>";
  html += `<td class="number-cell">${result.valid ? fmt(result.w, 4) : "-"}</td>`;
  html += `<td class="number-cell">${result.valid ? fmt(result.chi, 4) : "-"}</td>`;
  html += `<td class="number-cell">${result.valid ? fmt(result.df, 0) : "-"}</td>`;
  html += `<td class="number-cell">${fmtP(result.p)}</td>`;
  html += `<td>${assumptionBadgeFromP(result.p, alpha)}</td>`;
  html += `<td>${result.message}</td>`;
  html += "</tr>";
  return { html, agg: { valid: result.valid, pass: result.valid && result.p >= alpha, p: result.p } };
}

function buildAssumptionSummaryHtml(
  normality: NormalityAgg,
  levene: LeveneAgg,
  box: { valid: boolean; pass: boolean; p: number },
  mauchly: { valid: boolean; pass: boolean; p: number },
  alpha: number
): string {
  const rows = [
    { assumption: "نرمال بودن", method: "Shapiro-Wilk", scope: "۹ ترکیب لیست × گروه", p: normality.minShapiro, valid: normality.valid, pass: normality.shapiroPass },
    { assumption: "نرمال بودن", method: "Kolmogorov-Smirnov", scope: "۹ ترکیب لیست × گروه", p: normality.minKs, valid: normality.valid, pass: normality.ksPass },
    { assumption: "همگنی واریانس‌ها", method: "Levene's Test", scope: "برای هر لیست بین سه گروه", p: levene.minP, valid: levene.valid, pass: levene.pass },
    { assumption: "همگنی ماتریس‌های کوواریانس", method: "Box's M", scope: "ماتریس کوواریانس سه لیست در سه گروه", p: box.p, valid: box.valid, pass: box.pass },
    { assumption: "کرویت", method: "Mauchly's Test", scope: "عامل تکرارشده لیست ۱ تا ۳", p: mauchly.p, valid: mauchly.valid, pass: mauchly.pass },
  ];
  const overallValid = rows.every((row) => row.valid);
  const overallPass = rows.every((row) => row.valid && row.pass);
  let html = rows
    .map(
      (row) =>
        "<tr>" +
        `<td>${row.assumption}</td>` +
        `<td>${row.method}</td>` +
        `<td>${row.scope}</td>` +
        `<td class="number-cell">${fmtP(row.p)}</td>` +
        `<td>${assumptionBadgeFromBool(row.pass, row.valid)}</td>` +
        "</tr>"
    )
    .join("");
  html += '<tr style="background:#f8fafc;font-weight:900;">';
  html += "<td>نتیجه کلی</td>";
  html += `<td>همه آزمون‌ها با α = ${fmt(alpha, 3)}</td>`;
  html += "<td>تمام پیش‌فرض‌های بالا</td>";
  html += "<td>-</td>";
  html += `<td>${assumptionBadgeFromBool(overallPass, overallValid)}</td>`;
  html += "</tr>";
  return html;
}

function buildMixedAnovaHtml(lists: Lists): string {
  const result = mixedAnovaResults(lists);
  const rows = [
    { source: "زمان", data: result.time, isError: false },
    { source: "زمان*گروه", data: result.timeGroup, isError: false },
    { source: "خطا", data: result.errorTime, isError: true },
    { source: "بین گروهی", data: result.group, isError: false },
  ] as const;
  let html = "";
  rows.forEach((row) => {
    html += "<tr>";
    html += "<td>متغیر تولیدی</td>";
    html += `<td>${row.source}</td>`;
    html += `<td class="number-cell">${fmt(row.data.ss, 3)}</td>`;
    html += `<td class="number-cell">${fmt(row.data.df, 0)}</td>`;
    html += `<td class="number-cell">${fmt(row.data.ms, 3)}</td>`;
    html += `<td class="number-cell">${row.isError ? "-" : fmt((row.data as { f: number }).f, 3)}</td>`;
    html += `<td class="number-cell">${row.isError ? "-" : fmtP((row.data as { p: number }).p)}</td>`;
    html += `<td class="number-cell">${row.isError ? "-" : fmt((row.data as { eta: number }).eta, 3)}</td>`;
    html += "</tr>";
  });
  return html;
}

function buildBonferroniHtml(lists: Lists, alpha: number): string {
  const listPairs = [
    [0, 1],
    [0, 2],
    [1, 0],
    [1, 2],
    [2, 0],
    [2, 1],
  ];
  let html = "";
  for (let g = 0; g < GROUPS; g++) {
    listPairs.forEach((pair, index) => {
      const [iList, jList] = pair;
      const result = pairedBonferroniComparison(lists, g, iList, jList);
      html += "<tr>";
      if (index === 0) html += `<td rowspan="6" style="font-weight:900;">گروه ${g + 1}</td>`;
      if (index % 2 === 0) html += `<td rowspan="2">لیست ${iList + 1}</td>`;
      html += `<td>لیست ${jList + 1}</td>`;
      html += `<td class="number-cell ${pctClass(result.meanDiff)}">${result.meanDiff > 0 ? "+" : ""}${fmt(result.meanDiff, 3)}</td>`;
      html += `<td class="number-cell">${fmt(result.sdDiff, 3)}</td>`;
      html += `<td>${bonferroniBadge(result.p, alpha)}</td>`;
      html += "</tr>";
    });
  }
  return html;
}

function buildFinalOutputHtml(lists: Lists): string {
  const columns = lists.map((list) => {
    const values: number[] = [];
    for (let g = 0; g < GROUPS; g++) {
      for (let i = 0; i < GROUP_SIZE; i++) values.push(list[g][i]);
    }
    return values;
  });
  let html = "";
  for (let i = 0; i < GROUPS * GROUP_SIZE; i++) {
    const groupStartStyle = i > 0 && i % GROUP_SIZE === 0 ? ' style="border-top:3px solid #cbd5e1;"' : "";
    html += `<tr${groupStartStyle}>`;
    html += `<td class="number-cell">${columns[0][i]}</td>`;
    html += `<td class="number-cell">${columns[1][i]}</td>`;
    html += `<td class="number-cell">${columns[2][i]}</td>`;
    html += "</tr>";
  }
  return html;
}

// ------------------------------------------------------------
// خروجی TSV برای کپی در اکسل
// ------------------------------------------------------------

function makeDataTSV(lists: Lists): string {
  const headers = [
    "ردیف",
    "لیست 1 - گروه 1",
    "لیست 1 - گروه 2",
    "لیست 1 - گروه 3",
    "لیست 2 - گروه 1",
    "تغییر لیست 2 نسبت به 1 - گروه 1",
    "لیست 2 - گروه 2",
    "تغییر لیست 2 نسبت به 1 - گروه 2",
    "لیست 2 - گروه 3",
    "تغییر لیست 2 نسبت به 1 - گروه 3",
    "لیست 3 - گروه 1",
    "تغییر لیست 3 نسبت به 2 - گروه 1",
    "لیست 3 - گروه 2",
    "تغییر لیست 3 نسبت به 2 - گروه 2",
    "لیست 3 - گروه 3",
    "تغییر لیست 3 نسبت به 2 - گروه 3",
  ];
  const rows = [headers.join("\t")];
  for (let i = 0; i < GROUP_SIZE; i++) {
    const row = [i + 1];
    for (let g = 0; g < GROUPS; g++) row.push(lists[0][g][i]);
    for (let g = 0; g < GROUPS; g++) {
      row.push(lists[1][g][i]);
      row.push(lists[1][g][i] - lists[0][g][i]);
    }
    for (let g = 0; g < GROUPS; g++) {
      row.push(lists[2][g][i]);
      row.push(lists[2][g][i] - lists[1][g][i]);
    }
    rows.push(row.join("\t"));
  }
  return rows.join("\n");
}

function makeStatsTSV(lists: Lists): string {
  const rows: (string | number)[][] = [["لیست", "گروه", "تعداد", "میانگین", "واریانس جامعه", "انحراف معیار جامعه", "کمینه", "بیشینه"]];
  lists.forEach((list, li) => {
    list.forEach((group, gi) => {
      const s = statsOf(group);
      rows.push([`لیست ${li + 1}${li === 0 ? " پایه" : ""}`, `گروه ${gi + 1}`, s.n, fmt(s.mean), fmt(s.variance), fmt(s.std), s.min, s.max]);
    });
    const overall = statsOf(list.flat());
    rows.push([`لیست ${li + 1}`, "کل 45 عدد", overall.n, fmt(overall.mean), fmt(overall.variance), fmt(overall.std), overall.min, overall.max]);
  });
  return rows.map((r) => r.join("\t")).join("\n");
}

function makeFinalOutputTSV(lists: Lists): string {
  const columns = lists.map((list) => {
    const values: number[] = [];
    for (let g = 0; g < GROUPS; g++) {
      for (let i = 0; i < GROUP_SIZE; i++) values.push(list[g][i]);
    }
    return values;
  });
  const rows: (string | number)[][] = [["لیست 1", "لیست 2", "لیست 3"]];
  for (let i = 0; i < GROUPS * GROUP_SIZE; i++) {
    rows.push([columns[0][i], columns[1][i], columns[2][i]]);
  }
  return rows.map((r) => r.join("\t")).join("\n");
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
  } else {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
  }
}

// ------------------------------------------------------------
// کامپوننت اصلی
// ------------------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-[#fbfdff] px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100";
const labelCls = "mb-1.5 block text-[13px] font-bold text-stone-700";
const tinyCls = "mt-1 text-[12px] leading-5 text-stone-400";
const cardCls = "rounded-2xl border border-stone-200 bg-white p-5 shadow-sm sm:p-6";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 active:translate-y-0";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2.5 text-sm font-extrabold text-indigo-700 transition hover:bg-indigo-100";
const btnLight =
  "inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm font-bold text-stone-600 transition hover:bg-stone-100";

export default function CompareTreatmentsTool() {
  // ---------- وضعیت فرم ----------
  const [minValue, setMinValue] = useState("20");
  const [maxValue, setMaxValue] = useState("50");
  const [clampValues, setClampValues] = useState(true);
  const [forceAssumptions, setForceAssumptions] = useState(true);
  const [maxAttempts, setMaxAttempts] = useState("10000");
  const [enforceTargets, setEnforceTargets] = useState(true);
  const [effectMin, setEffectMin] = useState("0.4");
  const [effectMax, setEffectMax] = useState("0.6");
  const [alpha, setAlpha] = useState("0.05");
  const [dirs2, setDirs2] = useState<Direction[]>(["up", "up", "random"]);
  const [dirs3, setDirs3] = useState<Direction[]>(["random", "random", "random"]);
  const [bonf, setBonf] = useState<BonfTarget[]>([
    { "12": "sig", "13": "sig", "23": "ns" },
    { "12": "sig", "13": "sig", "23": "ns" },
    { "12": "ns", "13": "ns", "23": "ns" },
  ]);
  const [lists, setLists] = useState<Lists | null>(null);
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({
    text: "هنوز خروجی تولید نشده است.",
    kind: "",
  });
  const [tick, setTick] = useState(0);

  // ---------- تولید ----------
  const generateAll = useCallback(() => {
    try {
      const min = Math.round(Number(minValue));
      const max = Math.round(Number(maxValue));
      if (!Number.isFinite(min) || !Number.isFinite(max)) throw new Error("حداقل و حداکثر باید عدد باشند.");
      if (min >= max) throw new Error("حداقل باید کوچک‌تر از حداکثر باشد.");
      setMinValue(String(min));
      setMaxValue(String(max));

      const changes: Changes = {
        list2: dirs2.map((direction) => ({
          mode: direction === "random" ? "random" : "fixed",
          direction,
          minPct: 5,
          maxPct: 10,
        })),
        list3: dirs3.map((direction) => ({
          mode: direction === "random" ? "random" : "fixed",
          direction,
          minPct: 5,
          maxPct: 10,
        })),
      };

      const effectMinNum = Number(effectMin);
      const effectMaxNum = Number(effectMax);
      if (!Number.isFinite(effectMinNum) || !Number.isFinite(effectMaxNum)) {
        throw new Error("بازه اندازه اثر باید عددی باشد.");
      }
      if (effectMinNum < 0 || effectMaxNum > 1 || effectMinNum > effectMaxNum) {
        throw new Error("بازه اندازه اثر باید بین 0 و 1 باشد و حداقل از حداکثر بزرگ‌تر نباشد.");
      }
      const targets: AnalysisTargets = {
        enforce: enforceTargets,
        bonferroni: bonf,
        effectRange: { min: effectMinNum, max: effectMaxNum },
      };

      const alphaNum = Number(alpha);
      const validAlpha = Number.isFinite(alphaNum) && alphaNum > 0 && alphaNum < 1 ? alphaNum : 0.05;
      setAlpha(String(validAlpha));

      const criteria = { enforceAssumptions: forceAssumptions, analysisTargets: targets };
      let result: ReturnType<typeof generateDatasetWithAssumptions> | { lists: Lists; attempts: number };

      if (forceAssumptions || targets.enforce) {
        const maxA = Math.round(Number(maxAttempts));
        const safeAttempts = Number.isFinite(maxA) ? Math.min(20000, Math.max(100, maxA)) : 10000;
        setMaxAttempts(String(safeAttempts));
        result = generateDatasetWithAssumptions(min, max, 50, changes, clampValues, validAlpha, safeAttempts, criteria);
      } else {
        result = { lists: makeStandardDataset(min, max, 50, changes, clampValues), attempts: 1 };
      }

      setLists(result.lists);
      if (forceAssumptions || targets.enforce) {
        const parts: string[] = [];
        if (forceAssumptions) parts.push("پیش‌فرض‌های آماری");
        if (targets.enforce) parts.push("قیود بونفرونی و اندازه اثر");
        setStatus({ text: `خروجی تولید شد و ${parts.join(" و ")} برقرارند. تعداد تلاش: ${result.attempts}`, kind: "ok" });
      } else {
        setStatus({ text: "خروجی با موفقیت تولید شد.", kind: "ok" });
      }
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [minValue, maxValue, dirs2, dirs3, effectMin, effectMax, enforceTargets, bonf, alpha, forceAssumptions, maxAttempts, clampValues]);

  const generateRef = useRef(generateAll);

  useEffect(() => {
    generateRef.current = generateAll;
  });

  useEffect(() => {
    const timer = setTimeout(() => generateRef.current(), 50);
    return () => clearTimeout(timer);
  }, []);

  // ---------- کپی ----------
  const copyData = useCallback(async () => {
    try {
      if (!lists) throw new Error("ابتدا Generate را بزنید.");
      await copyText(makeDataTSV(lists));
      setStatus({ text: "جدول اعداد کپی شد؛ می‌توانید مستقیم در Excel پیست کنید.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [lists]);

  const copyStats = useCallback(async () => {
    try {
      if (!lists) throw new Error("ابتدا Generate را بزنید.");
      await copyText(makeStatsTSV(lists));
      setStatus({ text: "جدول آمار کپی شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [lists]);

  const copyFinalOutput = useCallback(async () => {
    try {
      if (!lists) throw new Error("ابتدا Generate را بزنید.");
      await copyText(makeFinalOutputTSV(lists));
      setStatus({ text: "خروجی نهایی سه‌ستونه کپی شد؛ می‌توانید مستقیم در Excel پیست کنید.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [lists]);

  // ---------- جدول‌های مشتق‌شده ----------
  const alphaNum = Number(alpha) || 0.05;

  const tables = useMemo(() => {
    if (!lists) return null;
    const normality = buildNormalityHtml(lists, alphaNum);
    const levene = buildLeveneHtml(lists, alphaNum);
    const box = buildBoxHtml(lists, alphaNum);
    const mauchly = buildMauchlyHtml(lists, alphaNum);
    return {
      data: buildDataTable(lists),
      stats: buildStatsHtml(lists),
      compare: buildCompareHtml(lists),
      normality: normality.html,
      levene: levene.html,
      box: box.html,
      mauchly: mauchly.html,
      summary: buildAssumptionSummaryHtml(normality.agg, levene.agg, box.agg, mauchly.agg, alphaNum),
      mixedAnova: buildMixedAnovaHtml(lists),
      bonferroni: buildBonferroniHtml(lists, alphaNum),
      finalOutput: buildFinalOutputHtml(lists),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists, alphaNum, tick]);

  const emptyRow = (colspan: number, text: string) =>
    `<tr><td colspan="${colspan}" class="muted">${text}</td></tr>`;

  const updateBonf = (g: number, key: keyof BonfTarget, value: BonfValue) => {
    setBonf((prev) => prev.map((row, i) => (i === g ? { ...row, [key]: value } : row)));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-16">
      <div className="mx-auto max-w-[1280px] px-4">
        {/* ---------- سربرگ ---------- */}
        <header className="mt-6 rounded-[22px] border border-stone-200 bg-white/80 p-6 shadow-lg shadow-stone-900/5 backdrop-blur sm:p-7">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 transition hover:text-indigo-500"
          >
            <ArrowRight className="h-4 w-4" />
            بازگشت به صفحه اصلی
          </Link>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-orange-500 text-white shadow-md">
              <Sigma className="h-6 w-6" strokeWidth={2.5} />
            </span>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-stone-900 sm:text-3xl">
                تولید داده تمرینی — مقایسه اثربخشی دو درمان
              </h1>
              <p className="mt-1 text-sm text-stone-500">حالت «با مرحله پیگیری» — تحلیل واریانس با اندازه‌گیری مکرر</p>
            </div>
          </div>
          <p className="mt-4 max-w-4xl text-sm leading-7 text-stone-600">
            لیست ۱ به‌عنوان لیست پایه ساخته می‌شود. سپس لیست ۲ از روی لیست ۱ و لیست ۳ از روی لیست ۲ با جهت تغییر هر
            گروه ساخته می‌شوند. خروجی به صورت ستون‌های کنار هم آماده می‌شود؛ برای لیست‌های ۲ و ۳ ستون تغییرات هم کنار هر
            گروه قرار دارد تا مستقیم در Excel کپی شود.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {["۳ گروه", "۱۵ عدد در هر گروه", "۳ لیست × ۴۵ عدد", "اعداد صحیح", "کپی مستقیم برای اکسل"].map((pill) => (
              <span
                key={pill}
                className="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-stone-600"
              >
                {pill}
              </span>
            ))}
          </div>
        </header>

        {/* ---------- ۱) محدوده لیست پایه ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۱) محدوده لیست پایه</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            حداقل و حداکثر عددی را مشخص کنید. تمام اعداد لیست پایه در همین بازه ساخته می‌شوند.
          </p>
          <div className="mt-4 grid gap-4 sm:grid-cols-4">
            <div>
              <label htmlFor="minValue" className={labelCls}>حداقل عدد</label>
              <input id="minValue" type="number" step={1} className={inputCls} value={minValue} onChange={(e) => setMinValue(e.target.value)} />
              <p className={tinyCls}>مثال سن: 20</p>
            </div>
            <div>
              <label htmlFor="maxValue" className={labelCls}>حداکثر عدد</label>
              <input id="maxValue" type="number" step={1} className={inputCls} value={maxValue} onChange={(e) => setMaxValue(e.target.value)} />
              <p className={tinyCls}>مثال سن: 50</p>
            </div>
            <div>
              <label htmlFor="groupSize" className={labelCls}>تعداد هر گروه</label>
              <input id="groupSize" type="number" value={15} disabled className={`${inputCls} opacity-60`} />
              <p className={tinyCls}>طبق درخواست شما ثابت روی ۱۵ نفر است.</p>
            </div>
            <div>
              <label htmlFor="groupCount" className={labelCls}>تعداد گروه</label>
              <input id="groupCount" type="number" value={3} disabled className={`${inputCls} opacity-60`} />
              <p className={tinyCls}>سه گروه: گروه ۱، گروه ۲، گروه ۳.</p>
            </div>
          </div>
        </section>

        {/* ---------- ۳) جهت تغییرات ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۳) جهت تغییرات لیست ۲ و ۳</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            در این بخش فقط جهت تغییر را تعیین می‌کنید. درصدها حذف شده‌اند تا برنامه بتواند راحت‌تر داده‌هایی بسازد که
            پیش‌فرض‌های آماری، بونفرونی و اندازه اثر دلخواه را رعایت کنند.
          </p>
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {/* لیست ۲ نسبت به لیست ۱ */}
            <div className="rounded-2xl border border-stone-200 bg-[#fbfdff] p-4">
              <h3 className="font-extrabold text-stone-800">لیست ۲ نسبت به لیست ۱</h3>
              <p className={tinyCls}>برای هر گروه مشخص کنید تغییر لیست ۲ نسبت به لیست ۱ در همان گروه افزایشی، کاهشی یا رندوم باشد.</p>
              {[0, 1, 2].map((g) => (
                <div key={g} className="mt-3 grid grid-cols-2 items-end gap-3 border-t border-dashed border-stone-200 pt-3">
                  <div>
                    <p className="font-black text-stone-600">گروه {g + 1}</p>
                    <p className={tinyCls}>جهت تغییر گروه {g + 1} در لیست ۲ نسبت به گروه {g + 1} در لیست ۱.</p>
                  </div>
                  <div>
                    <label className={labelCls}>جهت</label>
                    <select
                      className={inputCls}
                      value={dirs2[g]}
                      onChange={(e) => setDirs2((prev) => prev.map((d, i) => (i === g ? (e.target.value as Direction) : d)))}
                    >
                      <option value="up">افزایش</option>
                      <option value="down">کاهش</option>
                      <option value="random">رندوم</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
            {/* لیست ۳ نسبت به لیست ۲ */}
            <div className="rounded-2xl border border-stone-200 bg-[#fbfdff] p-4">
              <h3 className="font-extrabold text-stone-800">لیست ۳ نسبت به لیست ۲</h3>
              <p className={tinyCls}>برای هر گروه مشخص کنید تغییر لیست ۳ نسبت به لیست ۲ در همان گروه افزایشی، کاهشی یا رندوم باشد.</p>
              {[0, 1, 2].map((g) => (
                <div key={g} className="mt-3 grid grid-cols-2 items-end gap-3 border-t border-dashed border-stone-200 pt-3">
                  <div>
                    <p className="font-black text-stone-600">گروه {g + 1}</p>
                    <p className={tinyCls}>جهت تغییر گروه {g + 1} در لیست ۳ نسبت به گروه {g + 1} در لیست ۲.</p>
                  </div>
                  <div>
                    <label className={labelCls}>جهت</label>
                    <select
                      className={inputCls}
                      value={dirs3[g]}
                      onChange={(e) => setDirs3((prev) => prev.map((d, i) => (i === g ? (e.target.value as Direction) : d)))}
                    >
                      <option value="up">افزایش</option>
                      <option value="down">کاهش</option>
                      <option value="random">رندوم</option>
                    </select>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
            <input type="checkbox" checked={clampValues} onChange={(e) => setClampValues(e.target.checked)} className="mt-1.5 h-4 w-4 accent-indigo-600" />
            <span>
              <span className="block text-sm font-extrabold text-stone-800">نگه‌داشتن اعداد لیست ۲ و ۳ داخل محدوده حداقل/حداکثر</span>
              <span className={tinyCls}>اگر فعال باشد، بعد از اعمال تغییر، عددها از بازه حداقل/حداکثری که تعیین کرده‌اید خارج نمی‌شوند.</span>
            </span>
          </label>
        </section>

        {/* ---------- ۳-ب) قیود نتایج نهایی ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۳-ب) قیود نتایج نهایی</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            در این بخش تعیین می‌کنید خروجی نهایی از نظر آزمون تعقیبی بن‌فرونی و اندازه اثر چه شرایطی را حتماً رعایت کند.
            اگر گزینه رعایت قیود فعال باشد، Generate فقط خروجی‌ای را قبول می‌کند که این شرایط برقرار باشد.
          </p>
          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
            <input type="checkbox" checked={enforceTargets} onChange={(e) => setEnforceTargets(e.target.checked)} className="mt-1.5 h-4 w-4 accent-indigo-600" />
            <span>
              <span className="block text-sm font-extrabold text-stone-800">رعایت اجباری تنظیمات بونفرونی و اندازه اثر</span>
              <span className={tinyCls}>اگر فعال باشد، علاوه بر پیش‌فرض‌های آماری، نتیجه آزمون بن‌فرونی و بازه اندازه اثر هم هنگام تولید داده کنترل می‌شود.</span>
            </span>
          </label>

          <h3 className="mt-5 font-extrabold text-stone-800">تنظیم معنی‌داری مقایسه‌های بن‌فرونی</h3>
          <p className={tinyCls}>
            برای هر گروه مشخص کنید مقایسه هر دو لیست باید معنی‌دار باشد یا غیرمعنی‌دار. پیش‌فرض: در گروه‌های ۱ و ۲، لیست ۱
            با ۲ و لیست ۱ با ۳ معنی‌دارند و لیست ۲ با ۳ معنی‌دار نیست؛ در گروه ۳ هیچ مقایسه‌ای معنی‌دار نیست.
          </p>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table" style={{ minWidth: 720 }}>
              <thead>
                <tr>
                  <th>گروه</th>
                  <th>لیست ۱ با لیست ۲</th>
                  <th>لیست ۱ با لیست ۳</th>
                  <th>لیست ۲ با لیست ۳</th>
                </tr>
              </thead>
              <tbody>
                {[0, 1, 2].map((g) => (
                  <tr key={g}>
                    <td style={{ fontWeight: 900 }}>گروه {g + 1}</td>
                    {(["12", "13", "23"] as const).map((key) => (
                      <td key={key}>
                        <select
                          className={`${inputCls} !py-1.5`}
                          value={bonf[g][key]}
                          onChange={(e) => updateBonf(g, key, e.target.value as BonfValue)}
                        >
                          <option value="sig">معنی‌دار باشد</option>
                          <option value="ns">معنی‌دار نباشد</option>
                          <option value="any">مهم نیست</option>
                        </select>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h3 className="mt-5 font-extrabold text-stone-800">بازه اندازه اثر دلخواه</h3>
          <p className={tinyCls}>
            این بازه روی هر سه اندازه اثر جدول میکس‌آنوا اعمال می‌شود: زمان، زمان*گروه و بین گروهی. اندازه اثر به صورت
            Partial Eta Squared محاسبه می‌شود.
          </p>
          <div className="mt-3 grid max-w-md grid-cols-2 gap-4">
            <div>
              <label htmlFor="effectMin" className={labelCls}>حداقل اندازه اثر</label>
              <input id="effectMin" type="number" min={0} max={1} step={0.001} className={inputCls} value={effectMin} onChange={(e) => setEffectMin(e.target.value)} />
            </div>
            <div>
              <label htmlFor="effectMax" className={labelCls}>حداکثر اندازه اثر</label>
              <input id="effectMax" type="number" min={0} max={1} step={0.001} className={inputCls} value={effectMax} onChange={(e) => setEffectMax(e.target.value)} />
            </div>
          </div>
        </section>

        {/* ---------- ۴) تولید و کپی خروجی ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۴) تولید و کپی خروجی</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            با زدن «Generate»، سه لیست ساخته می‌شود. در جدول، لیست ۱ شامل سه ستون گروه‌هاست و در لیست‌های ۲ و ۳ کنار هر
            گروه یک ستون «تغییر» هم نمایش داده می‌شود. دکمه کپی، همین ساختار ستونی را با Tab جدا می‌کند تا مستقیم در
            Excel Paste شود.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button className={btnPrimary} onClick={generateAll}>
              <Play className="h-4 w-4" />
              Generate / تولید
            </button>
            <button className={btnSecondary} onClick={copyData}>
              <Copy className="h-4 w-4" />
              کپی مستقیم به Excel
            </button>
            <button className={btnLight} onClick={copyStats}>
              کپی جدول آمار
            </button>
            <span
              className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                status.kind === "ok" ? "font-bold text-emerald-700" : status.kind === "err" ? "font-bold text-red-700" : "text-stone-400"
              }`}
            >
              {status.kind === "ok" ? "✓" : status.kind === "err" ? "✗" : "•"} {status.text}
            </span>
          </div>

          <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-xl border border-stone-200 bg-[#fbfdff] p-3">
            <input type="checkbox" checked={forceAssumptions} onChange={(e) => setForceAssumptions(e.target.checked)} className="mt-1.5 h-4 w-4 accent-indigo-600" />
            <span className="w-full">
              <span className="block text-sm font-extrabold text-stone-800">تولید قطعی بر اساس پیش‌فرض‌های آماری</span>
              <span className={tinyCls}>
                اگر فعال باشد، نرم‌افزار فقط وقتی خروجی را قبول می‌کند که نرمال بودن، لوین، Box&apos;s M و موچلی همگی با α
                انتخاب‌شده برقرار باشند. اگر با تنظیمات فعلی پیدا نشود، پیام خطا می‌دهد و باید جهت‌ها، قیود بونفرونی یا بازه
                اندازه اثر را ملایم‌تر کنید.
              </span>
              <div className="mt-3 grid max-w-sm">
                <div>
                  <label htmlFor="maxAssumptionAttempts" className={labelCls}>حداکثر تلاش برای پیدا کردن داده قابل قبول</label>
                  <input
                    id="maxAssumptionAttempts"
                    type="number"
                    min={100}
                    max={20000}
                    step={100}
                    className={inputCls}
                    value={maxAttempts}
                    onChange={(e) => setMaxAttempts(e.target.value)}
                  />
                  <p className={tinyCls}>عدد بیشتر احتمال موفقیت را بالا می‌برد، ولی زمان تولید بیشتر می‌شود.</p>
                </div>
              </div>
            </span>
          </label>
        </section>

        {/* ---------- جدول اصلی اعداد ---------- */}
        <section className={`${cardCls} mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">جدول اصلی اعداد</h2>
              <p className="mt-1 text-[13px] text-stone-500">سه لیست عمودی کنار هم قرار گرفته‌اند. هر لیست شامل سه گروه ۱۵تایی است.</p>
            </div>
            <button className={btnSecondary} onClick={copyData}>
              <Copy className="h-4 w-4" />
              کپی مستقیم همین جدول به Excel
            </button>
          </div>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th rowSpan={2}>ردیف</th>
                  <th colSpan={3} className="group-head-1">لیست ۱: پایه</th>
                  <th colSpan={6} className="group-head-2">لیست ۲: از روی لیست ۱</th>
                  <th colSpan={6} className="group-head-3">لیست ۳: از روی لیست ۲</th>
                </tr>
                <tr>
                  {[0, 1, 2].map((g) => (
                    <th key={`l1g${g}`} className="group-head-1">گروه {g + 1}</th>
                  ))}
                  {[0, 1, 2].map((g) => (
                    <th key={`l2g${g}`} className="group-head-2">گروه {g + 1}</th>
                  ))}
                  {[0, 1, 2].map((g) => (
                    <th key={`l2d${g}`} className="group-head-2">تغییر ۲-۱</th>
                  ))}
                  {[0, 1, 2].map((g) => (
                    <th key={`l3g${g}`} className="group-head-3">گروه {g + 1}</th>
                  ))}
                  {[0, 1, 2].map((g) => (
                    <th key={`l3d${g}`} className="group-head-3">تغییر ۳-۲</th>
                  ))}
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.data : emptyRow(16, "برای ساخت جدول، دکمه Generate را بزنید.") }} />
            </table>
          </div>
        </section>

        {/* ---------- آمار و مقایسه ---------- */}
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <section className={cardCls}>
            <h2 className="text-lg font-extrabold text-stone-900">آمار هر گروه</h2>
            <p className="mt-1 text-[13px] text-stone-500">
              میانگین، واریانس و انحراف معیار با فرمول جامعه محاسبه شده‌اند؛ یعنی تقسیم بر n، نه n-1.
            </p>
            <div className="tool-table-wrap mt-3">
              <table className="tool-table">
                <thead>
                  <tr>
                    <th>لیست</th><th>گروه</th><th>تعداد</th><th>میانگین</th><th>واریانس</th><th>انحراف معیار</th><th>کمینه</th><th>بیشینه</th>
                  </tr>
                </thead>
                <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.stats : emptyRow(8, "هنوز آماری وجود ندارد.") }} />
              </table>
            </div>
          </section>

          <section className={cardCls}>
            <h2 className="text-lg font-extrabold text-stone-900">خلاصه نسبت‌ها و تغییرات</h2>
            <p className="mt-1 text-[13px] text-stone-500">
              مقایسه‌ها بر اساس میانگین همان گروه انجام می‌شود؛ یعنی مثلاً میانگین «لیست ۲ - گروه اول» با میانگین «لیست ۱ -
              گروه اول» مقایسه می‌شود.
            </p>
            <div className="tool-table-wrap mt-3">
              <table className="tool-table">
                <thead>
                  <tr>
                    <th>مقایسه</th><th>میانگین مبنا</th><th>میانگین مقایسه</th><th>تفاوت میانگین</th><th>درصد تغییر</th>
                  </tr>
                </thead>
                <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.compare : emptyRow(5, "بعد از تولید نمایش داده می‌شود.") }} />
              </table>
            </div>
          </section>
        </div>

        {/* ---------- ۵) بررسی پیش‌فرض‌ها ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">۵) بررسی پیش‌فرض‌ها</h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            این بخش پیش‌فرض‌های آماری را واقعاً روی داده‌های تولیدشده محاسبه می‌کند. معیار تصمیم‌گیری این است: اگر p-value
            بزرگ‌تر یا مساوی α باشد، آن پیش‌فرض «برقرار» در نظر گرفته می‌شود؛ اگر کوچک‌تر از α باشد، «برقرار نیست».
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-4">
            <div className="w-44">
              <label htmlFor="alphaValue" className={labelCls}>سطح معنی‌داری α</label>
              <input
                id="alphaValue"
                type="number"
                min={0.001}
                max={0.2}
                step={0.001}
                className={inputCls}
                value={alpha}
                onChange={(e) => setAlpha(e.target.value)}
              />
              <p className={tinyCls}>پیش‌فرض رایج: 0.05</p>
            </div>
            <button
              className={btnSecondary}
              onClick={() => {
                setTick((t) => t + 1);
                setStatus({ text: "بررسی پیش‌فرض‌ها بر اساس داده‌های فعلی به‌روزرسانی شد.", kind: "ok" });
              }}
            >
              <RefreshCw className="h-4 w-4" />
              اجرای بررسی پیش‌فرض‌ها
            </button>
            <span className="text-xs text-stone-400">با هر بار Generate، این جدول‌ها هم خودکار به‌روزرسانی می‌شوند.</span>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {["Normality: Shapiro-Wilk", "Normality: Kolmogorov-Smirnov", "Levene", "Box's M", "Mauchly"].map((pill) => (
              <span key={pill} className="inline-flex rounded-full border border-stone-200 bg-[#f8fafc] px-3 py-1.5 text-xs font-bold text-stone-600">
                {pill}
              </span>
            ))}
          </div>

          {/* الف) نرمال بودن */}
          <h3 className="assumption-section-title mt-5 border-t border-dashed border-stone-200 pt-4 font-extrabold text-stone-800">
            الف) نرمال بودن توزیع داده‌ها
          </h3>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            برای هر ترکیب «لیست × گروه» جداگانه آزمون Shapiro-Wilk و Kolmogorov-Smirnov اجرا می‌شود. در آزمون KS، نرمال
            بودن نسبت به توزیع نرمال برازش‌شده با میانگین و انحراف معیار همان نمونه بررسی می‌شود.
          </p>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>لیست</th><th>گروه</th><th>n</th><th>میانگین</th><th>SD نمونه</th>
                  <th>Shapiro W</th><th>p شاپیرو</th><th>نتیجه شاپیرو</th>
                  <th>KS D</th><th>p کولموگروف</th><th>نتیجه KS</th><th>نتیجه کلی</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.normality : emptyRow(12, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>

          {/* ب) لوین */}
          <h3 className="assumption-section-title mt-5 border-t border-dashed border-stone-200 pt-4 font-extrabold text-stone-800">
            ب) همگنی واریانس‌ها — Levene&apos;s Test
          </h3>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            برای هر لیست، واریانس سه گروه با آزمون Levene مقایسه می‌شود. در این پیاده‌سازی، انحراف مطلق از میانگین هر گروه
            مبنای آزمون است.
          </p>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>لیست</th><th>گروه‌های مقایسه‌شده</th><th>F</th><th>df1</th><th>df2</th><th>p-value</th><th>نتیجه</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.levene : emptyRow(7, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>

          {/* ج) باکس M */}
          <h3 className="assumption-section-title mt-5 border-t border-dashed border-stone-200 pt-4 font-extrabold text-stone-800">
            ج) همگنی ماتریس‌های کوواریانس — Box&apos;s M
          </h3>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            برای هر گروه، سه لیست به‌عنوان سه متغیر تکرارشده در نظر گرفته می‌شوند و ماتریس کوواریانس گروه‌ها با آزمون Box&apos;s
            M مقایسه می‌شود.
          </p>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>آزمون</th><th>Box&apos;s M</th><th>χ² تقریبی</th><th>df</th><th>p-value</th><th>نتیجه</th><th>توضیح</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.box : emptyRow(7, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>

          {/* د) موچلی */}
          <h3 className="assumption-section-title mt-5 border-t border-dashed border-stone-200 pt-4 font-extrabold text-stone-800">
            د) فرض کرویت — Mauchly&apos;s Test of Sphericity
          </h3>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            کرویت برای عامل تکرارشده «لیست ۱، لیست ۲، لیست ۳» بررسی می‌شود. محاسبه بر اساس ماتریس کوواریانس تجمیعی
            درون‌گروهی انجام می‌شود.
          </p>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>عامل تکرارشده</th><th>Mauchly W</th><th>χ² تقریبی</th><th>df</th><th>p-value</th><th>نتیجه</th><th>توضیح</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.mauchly : emptyRow(7, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>

          {/* ه) خلاصه */}
          <h3 className="assumption-section-title mt-5 border-t border-dashed border-stone-200 pt-4 font-extrabold text-stone-800">
            ه) خلاصه نهایی پیش‌فرض‌ها
          </h3>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>پیش‌فرض</th><th>آزمون / روش</th><th>دامنه بررسی</th><th>p-value معیار</th><th>نتیجه</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.summary : emptyRow(5, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>
        </section>

        {/* ---------- ۶) میکس‌آنووا ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">
            ۶) نتایج آزمون تحلیل واریانس اندازه‌گیری‌های مکرر در متن میکس‌آنوا
          </h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            این جدول نتایج Mixed ANOVA را برای سه مرحله اندازه‌گیری، یعنی لیست ۱، لیست ۲ و لیست ۳، گزارش می‌کند. عامل
            درون‌آزمودنی «زمان» و عامل بین‌آزمودنی «گروه» است.
          </p>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>متغیر</th><th>منبع تغییرات</th><th>مجموع مجذورات</th><th>درجه آزادی</th><th>میانگین مجذورات</th><th>آماره F</th><th>مقدار P</th><th>اندازه اثر</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.mixedAnova : emptyRow(8, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>
          <p className={tinyCls}>
            اندازه اثر به صورت Partial Eta Squared محاسبه می‌شود. برای ردیف بین‌گروهی، آماره F با خطای بین‌آزمودنی محاسبه
            می‌شود.
          </p>
        </section>

        {/* ---------- ۷) بن‌فرونی ---------- */}
        <section className={`${cardCls} mt-4`}>
          <h2 className="text-lg font-extrabold text-stone-900">
            ۷) نتایج آزمون تعقیبی بن‌فرونی جهت بررسی پایداری اثرات در مراحل سنجش
          </h2>
          <p className="mt-1 text-[13px] leading-6 text-stone-500">
            برای هر گروه، لیست‌ها به‌صورت زوجی مقایسه می‌شوند. سطح معنی‌داری با اصلاح Bonferroni گزارش می‌شود؛ رنگ سبز یعنی
            معنی‌دار و رنگ قرمز یعنی غیرمعنی‌دار.
          </p>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table">
              <thead>
                <tr>
                  <th>گروه</th><th>(I) لیست</th><th>(J) لیست</th><th>تفاوت میانگین</th><th>انحراف استاندارد</th><th>سطح معنی‌داری</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.bonferroni : emptyRow(6, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>
          <p className={tinyCls}>
            تفاوت میانگین به صورت I منهای J محاسبه شده است. انحراف استاندارد مربوط به تفاوت‌های زوجی همان دو لیست است.
          </p>
        </section>

        {/* ---------- ۸) خروجی نهایی ---------- */}
        <section className={`${cardCls} mt-4`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900">۸) خروجی نهایی</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500">
                این خروجی فقط سه ستون دارد: لیست ۱، لیست ۲ و لیست ۳. در هر ستون ۴۵ عدد قرار می‌گیرد؛ ۱۵ عدد اول گروه ۱، ۱۵
                عدد دوم گروه ۲، و ۱۵ عدد آخر گروه ۳ است.
              </p>
            </div>
            <button className={btnSecondary} onClick={copyFinalOutput}>
              <Download className="h-4 w-4" />
              کپی خروجی نهایی برای Excel
            </button>
          </div>
          <div className="tool-table-wrap mt-3">
            <table className="tool-table" style={{ minWidth: 420 }}>
              <thead>
                <tr>
                  <th>لیست ۱</th><th>لیست ۲</th><th>لیست ۳</th>
                </tr>
              </thead>
              <tbody dangerouslySetInnerHTML={{ __html: tables ? tables.finalOutput : emptyRow(3, "بعد از تولید داده‌ها نمایش داده می‌شود.") }} />
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
