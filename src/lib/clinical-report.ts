// ============================================================
// گزارش بالینی (متن / docx / TSV) — آماریست
// ساخت گزارش مشترک برای ابزارهای «اثربخشی یک مداخله» و «مقایسه اثربخشی دو درمان».
// ============================================================

import {
  AlignmentType,
  BorderStyle,
  Document,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { fmt, fmtP } from "./statistics";
import type {
  AncovaResult,
  BoxMResult,
  IndependentTResult,
  MauchlyResult,
  MixedAnovaResult,
  PairedTResult,
  WithinPair,
} from "./clinical-stats";
import type { ClinicalAnswerKey, ClinicalDesign } from "./clinical-generator";

export type ClinicalDescriptive = { label: string; n: number; mean: number; sd: number; min: number; max: number };
export type ClinicalNormality = { label: string; w: number; p: number; pass: boolean };
export type ClinicalHomogeneity = { label: string; f: number; p: number; pass: boolean };

export type ClinicalReportInput = {
  design: ClinicalDesign;
  projectName: string;
  source: "generate" | "real";
  /** نام/عنوان مداخله و نوع آن */
  interventionTitle?: string;
  interventionType?: string;
  /** متغیر وابسته */
  dvName?: string;
  dvMeasure?: string;
  dvLevel?: string;
  groupLabels: string[];
  timeLabels: string[];
  nGroups: number;
  nTimes: number;
  nTotal: number;
  nPerGroup: number[];
  alpha: number;
  independentT?: IndependentTResult;
  ancova?: AncovaResult;
  pairedT?: PairedTResult[];
  mixedAnova?: MixedAnovaResult;
  mauchly?: MauchlyResult;
  boxM?: BoxMResult;
  bonferroni?: { groupLabel: string; pairs: WithinPair[] }[];
  descriptives?: ClinicalDescriptive[];
  normality?: ClinicalNormality[];
  homogeneity?: ClinicalHomogeneity[];
  answerKey?: ClinicalAnswerKey;
};

const FA_FONT = "B Nazanin";
const FA_HEAD = "B Titr";

function faNum(v: string | number): string {
  return String(v).replace(/[0-9]/g, (d) => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

function starP(p: number): string {
  if (!Number.isFinite(p)) return "";
  if (p < 0.001) return "***";
  if (p < 0.01) return "**";
  if (p < 0.05) return "*";
  return "";
}

function dInterpretation(d: number): string {
  const a = Math.abs(d);
  if (a < 0.2) return "ناچیز";
  if (a < 0.5) return "کوچک";
  if (a < 0.8) return "متوسط";
  return "بزرگ";
}

function etaInterpretation(eta: number): string {
  if (eta < 0.01) return "ناچیز";
  if (eta < 0.06) return "کوچک";
  if (eta < 0.14) return "متوسط";
  return "بزرگ";
}

function designLabel(input: ClinicalReportInput): string {
  if (input.design === "control") return "گروه آزمایش/درمان در برابر گروه کنترل (پیش/پس)";
  return `${input.nGroups} گروه مستقل${input.nTimes >= 3 ? " با مرحله پیگیری (پیش/پس/پیگیری)" : " (پیش/پس)"}`;
}

// ---------- متن گزارش ----------

export function buildClinicalReportText(input: ClinicalReportInput): string {
  const L: string[] = [];
  L.push("گزارش آماری — آماریست (کارآزمایی مداخله‌ای)");
  L.push("==========================================");
  L.push(`پروژه: ${input.projectName} | طرح: ${designLabel(input)} | منبع داده: ${input.source === "generate" ? "تولید تمرینی" : "داده واقعی"}`);
  if (input.interventionTitle) L.push(`مداخله: ${input.interventionTitle}${input.interventionType ? ` (نوع: ${input.interventionType})` : ""}`);
  if (input.dvName) L.push(`متغیر وابسته: ${input.dvName}${input.dvMeasure ? ` — ${input.dvMeasure}` : ""}${input.dvLevel ? ` — سطح: ${input.dvLevel}` : ""}`);
  const groupCountLine = input.groupLabels.map((g, i) => `گروه «${g}»: ${input.nPerGroup[i] ?? 0}`).join("، ");
  L.push(`حجم نمونه: ${input.nTotal} (${groupCountLine})`);
  L.push(`سطح معناداری (α): ${input.alpha}`);
  L.push("");

  L.push("یافته‌های توصیفی:");
  if (input.descriptives && input.descriptives.length) {
    L.push("  گروه/زمان | n | میانگین | انحراف معیار | کمینه | بیشینه");
    input.descriptives.forEach((d) => L.push(`  ${d.label} | ${d.n} | ${fmt(d.mean)} | ${fmt(d.sd)} | ${fmt(d.min)} | ${fmt(d.max)}`));
  } else {
    L.push("  (داده توصیفی در دسترس نیست)");
  }
  L.push("");

  L.push("یافته‌های استنباطی:");
  if (input.design === "control" && input.independentT) {
    const t = input.independentT;
    L.push("تحلیل اصلی (گروه آزمایش/درمان در برابر کنترل):");
    L.push(`  نمرهٔ تغییر (پس − پیش): گروه «${input.groupLabels[0]}» = ${fmt(t.mean1)}، گروه «${input.groupLabels[1]}» = ${fmt(t.mean2)}`);
    L.push(`  t(${t.df}) = ${fmt(t.t)}، p = ${fmtP(t.p)}${starP(t.p)}، d کوهن = ${fmt(t.cohensD)} (اثر ${dInterpretation(t.cohensD)})`);
    L.push(`  فاصله اطمینان ۹۵٪ تفاوت میانگین‌ها: ${fmt(t.ciLo)} تا ${fmt(t.ciHi)}`);
    L.push("  * p < 0.05 ، ** p < 0.01 ، *** p < 0.001");
    L.push("");
    if (input.ancova) {
      const a = input.ancova;
      L.push("تحلیل کوواریانس (ANCOVA — کنترل اثر پیش‌آزمون):");
      L.push(`  F(1، ${a.df2}) = ${fmt(a.F)}، p = ${fmtP(a.p)}${starP(a.p)}، مجذور اتای جزئی = ${fmt(a.eta2)} (اثر ${etaInterpretation(a.eta2)})`);
      L.push(`  میانگین‌های تعدیل‌شده: «${input.groupLabels[0]}» = ${fmt(a.adjMeans[0])}، «${input.groupLabels[1]}» = ${fmt(a.adjMeans[1])}`);
      L.push("");
    }
    if (input.pairedT) {
      L.push("تغییر درون‌گروهی:");
      input.pairedT.forEach((p, i) => {
        L.push(`  «${input.groupLabels[i] ?? `گروه ${i + 1}`}»: t(${p.df}) = ${fmt(p.t)}، p = ${fmtP(p.p)}${starP(p.p)}، d = ${fmt(p.cohensDz)}`);
      });
      L.push("");
    }
  }

  if (input.design === "followup" && input.mixedAnova) {
    const a = input.mixedAnova;
    L.push("تحلیل واریانس اندازه‌گیری مکرر (میکس‌آنوا):");
    L.push(`  اثر بین‌گروهی (گروه): F(${a.group.df}، ${a.errorBetween.df}) = ${fmt(a.group.f)}، p = ${fmtP(a.group.p)}${starP(a.group.p)}، η² جزئی = ${fmt(a.group.eta)}`);
    L.push(`  اثر زمان: F(${a.time.df}، ${a.errorTime.df}) = ${fmt(a.time.f)}، p = ${fmtP(a.time.p)}${starP(a.time.p)}، η² جزئی = ${fmt(a.time.eta)}`);
    L.push(`  تعامل زمان*گروه: F(${a.timeGroup.df}، ${a.errorTime.df}) = ${fmt(a.timeGroup.f)}، p = ${fmtP(a.timeGroup.p)}${starP(a.timeGroup.p)}، η² جزئی = ${fmt(a.timeGroup.eta)} (اثر ${etaInterpretation(a.timeGroup.eta)})`);
    L.push("  * p < 0.05 ، ** p < 0.01 ، *** p < 0.001");
    L.push("");
    if (input.bonferroni) {
      L.push("مقایسه‌های زوجی درون‌گروهی (با اصلاح بونفرونی):");
      input.bonferroni.forEach((g) => {
        L.push(`  ${g.groupLabel}:`);
        g.pairs.forEach((p) => {
          L.push(`    ${input.timeLabels[p.i]} − ${input.timeLabels[p.j]}: تفاوت میانگین = ${fmt(p.meanDiff)}، p (بونفرونی) = ${fmtP(p.pBonf)}${starP(p.pBonf)}`);
        });
      });
      L.push("");
    }
  }

  L.push("پیش‌فرض‌ها:");
  if (input.normality && input.normality.length) {
    L.push("  نرمال بودن (شاپیرو-ویلک):");
    input.normality.forEach((n) => L.push(`    ${n.label}: W = ${fmt(n.w, 3)}، p = ${fmtP(n.p)} — ${n.pass ? "برقرار" : "برقرار نیست"}`));
  }
  if (input.homogeneity && input.homogeneity.length) {
    L.push("  همگنی واریانس‌ها (لوین):");
    input.homogeneity.forEach((h) => L.push(`    ${h.label}: F = ${fmt(h.f, 3)}، p = ${fmtP(h.p)} — ${h.pass ? "برقرار" : "برقرار نیست"}`));
  }
  if (input.mauchly) {
    L.push("  کرویت (موچلی):");
    L.push(`    W = ${fmt(input.mauchly.w, 3)}، χ²(${input.mauchly.df}) = ${fmt(input.mauchly.chi, 3)}، p = ${fmtP(input.mauchly.p)} — ${input.mauchly.p >= input.alpha ? "برقرار" : "برقرار نیست"}`);
  }
  if (input.boxM) {
    L.push("  همگنی ماتریس‌های کوواریانس (Box's M):");
    L.push(`    M = ${fmt(input.boxM.m, 3)}، χ²(${input.boxM.df}) = ${fmt(input.boxM.chi, 3)}، p = ${fmtP(input.boxM.p)} — ${input.boxM.p >= input.alpha ? "برقرار" : "برقرار نیست"}`);
  }
  L.push("");

  if (input.answerKey) {
    L.push("کلید پاسخ (مخصوص استاد):");
    if (input.answerKey.targetD) {
      L.push(`  d کوهن هدف = ${fmt(input.answerKey.targetD.target)} | واقعی = ${fmt(input.answerKey.targetD.actual)}`);
    }
    if (input.answerKey.targetInteractionEta2) {
      L.push(`  η² تعامل هدف = ${fmt(input.answerKey.targetInteractionEta2.target)} | واقعی = ${fmt(input.answerKey.targetInteractionEta2.actual)}`);
    }
    L.push(`  تعداد تلاش‌های تولید: ${input.answerKey.attempts}`);
    L.push("");
  }

  return L.join("\n");
}

// ---------- docx ----------

const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: "9AA5B1" } as const;

function docP(text: string, opts: { bold?: boolean; size?: number; color?: string; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.RIGHT,
    spacing: { after: 100 },
    children: [new TextRun({ text, font: FA_FONT, size: opts.size ?? 22, bold: opts.bold, color: opts.color })],
  });
}

function docH(text: string) {
  return new Paragraph({
    spacing: { before: 260, after: 120 },
    children: [new TextRun({ text, font: FA_HEAD, size: 28, bold: true, color: "1F3864" })],
  });
}

function docCell(text: string, opts: { bold?: boolean; fill?: string; width?: number } = {}) {
  return new TableCell({
    width: opts.width ? { size: opts.width, type: WidthType.PERCENTAGE } : undefined,
    shading: opts.fill ? { type: ShadingType.CLEAR, fill: opts.fill } : undefined,
    margins: { top: 60, bottom: 60, left: 80, right: 80 },
    children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: faNum(text), font: FA_FONT, size: 20, bold: opts.bold })] })],
  });
}

function docTable(headers: string[], rows: (string | number)[][]) {
  const w = headers.map(() => Math.floor(100 / headers.length));
  const headerRow = new TableRow({ tableHeader: true, children: headers.map((h, i) => docCell(h, { bold: true, fill: "D9E2F3", width: w[i] })) });
  const body = rows.map((r) => new TableRow({ children: r.map((c, i) => docCell(String(c), { width: w[i] })) }));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: { top: thinBorder, bottom: thinBorder, left: thinBorder, right: thinBorder, insideHorizontal: thinBorder, insideVertical: thinBorder },
    rows: [headerRow, ...body],
  });
}

export function buildClinicalDocx(input: ClinicalReportInput): Document {
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "گزارش آماری — آماریست", font: FA_HEAD, size: 40, bold: true, color: "1F3864" })] }));
  children.push(docP(`پروژه: ${input.projectName} | طرح: ${designLabel(input)} | منبع داده: ${input.source === "generate" ? "تولید تمرینی" : "داده واقعی"}`, { align: AlignmentType.CENTER, bold: true }));
  if (input.interventionTitle) children.push(docP(`مداخله: ${input.interventionTitle}${input.interventionType ? ` (نوع: ${input.interventionType})` : ""}`, { bold: true }));
  if (input.dvName) children.push(docP(`متغیر وابسته: ${input.dvName}${input.dvMeasure ? ` — ${input.dvMeasure}` : ""}`, { bold: true }));
  const groupCountLine = input.groupLabels.map((g, i) => `گروه «${g}»: ${faNum(input.nPerGroup[i] ?? 0)}`).join("، ");
  children.push(docP(`حجم نمونه: ${faNum(input.nTotal)} (${groupCountLine}) | سطح معناداری α = ${input.alpha}`, { bold: true }));

  children.push(docH("یافته‌های توصیفی"));
  if (input.descriptives && input.descriptives.length) {
    children.push(docTable(["گروه / زمان", "n", "میانگین", "انحراف معیار", "کمینه", "بیشینه"], input.descriptives.map((d) => [d.label, d.n, fmt(d.mean), fmt(d.sd), fmt(d.min), fmt(d.max)])));
  } else {
    children.push(docP("(داده توصیفی در دسترس نیست)"));
  }

  children.push(docH("یافته‌های استنباطی"));
  if (input.design === "control" && input.independentT) {
    const t = input.independentT;
    children.push(docH("تحلیل اصلی (گروه آزمایش/درمان در برابر کنترل)"));
    children.push(docTable(["شاخص", "مقدار"], [[`گروه «${input.groupLabels[0]}» — تغییر (پس − پیش)`, fmt(t.mean1)], [`گروه «${input.groupLabels[1]}» — تغییر (پس − پیش)`, fmt(t.mean2)], [`t(${t.df})`, fmt(t.t)], ["p", `${fmtP(t.p)}${starP(t.p)}`], ["d کوهن", `${fmt(t.cohensD)} (${dInterpretation(t.cohensD)})`], ["CI ۹۵٪", `${fmt(t.ciLo)} تا ${fmt(t.ciHi)}`]]));
    if (input.ancova) {
      const a = input.ancova;
      children.push(docH("تحلیل کوواریانس (ANCOVA)"));
      children.push(docTable(["شاخص", "مقدار"], [[`F(1، ${a.df2})`, fmt(a.F)], ["p", `${fmtP(a.p)}${starP(a.p)}`], ["η² جزئی", `${fmt(a.eta2)} (${etaInterpretation(a.eta2)})`], [`میانگین تعدیل‌شده «${input.groupLabels[0]}»`, fmt(a.adjMeans[0])], [`میانگین تعدیل‌شده «${input.groupLabels[1]}»`, fmt(a.adjMeans[1])]]));
    }
    if (input.pairedT) {
      children.push(docH("تغییر درون‌گروهی"));
      const rows: (string | number)[][] = input.pairedT.map((p, i) => [`گروه «${input.groupLabels[i] ?? `گروه ${i + 1}`}»`, `t(${p.df})`, fmt(p.t), `${fmtP(p.p)}${starP(p.p)}`, fmt(p.cohensDz)]);
      children.push(docTable(["گروه", "t", "مقدار", "p", "d (dz)"], rows));
    }
  }

  if (input.design === "followup" && input.mixedAnova) {
    const a = input.mixedAnova;
    children.push(docH("تحلیل واریانس اندازه‌گیری مکرر (میکس‌آنوا)"));
    children.push(docTable(["منبع تغییر", "SS", "df", "MS", "F", "p", "η² جزئی"], [
      ["بین‌گروهی (گروه)", fmt(a.group.ss, 3), a.group.df, fmt(a.group.ms, 3), fmt(a.group.f), `${fmtP(a.group.p)}${starP(a.group.p)}`, fmt(a.group.eta)],
      ["زمان", fmt(a.time.ss, 3), a.time.df, fmt(a.time.ms, 3), fmt(a.time.f), `${fmtP(a.time.p)}${starP(a.time.p)}`, fmt(a.time.eta)],
      ["تعامل زمان*گروه", fmt(a.timeGroup.ss, 3), a.timeGroup.df, fmt(a.timeGroup.ms, 3), fmt(a.timeGroup.f), `${fmtP(a.timeGroup.p)}${starP(a.timeGroup.p)}`, fmt(a.timeGroup.eta)],
      ["خطای بین‌آزمودنی", fmt(a.errorBetween.ss, 3), a.errorBetween.df, fmt(a.errorBetween.ms, 3), "—", "—", "—"],
      ["خطای درون‌آزمودنی (زمان)", fmt(a.errorTime.ss, 3), a.errorTime.df, fmt(a.errorTime.ms, 3), "—", "—", "—"],
    ]));
    if (input.bonferroni) {
      children.push(docH("مقایسه‌های زوجی درون‌گروهی (بونفرونی)"));
      const rows: (string | number)[][] = [];
      input.bonferroni.forEach((g) => {
        g.pairs.forEach((p) => rows.push([g.groupLabel, `${input.timeLabels[p.i]} − ${input.timeLabels[p.j]}`, fmt(p.meanDiff), fmt(p.sdDiff), `${fmtP(p.pBonf)}${starP(p.pBonf)}`]));
      });
      children.push(docTable(["گروه", "مقایسه", "تفاوت میانگین", "SD تفاوت", "p (بونفرونی)"], rows));
    }
  }

  children.push(docH("پیش‌فرض‌ها"));
  if (input.normality && input.normality.length) {
    children.push(docTable(["متغیر", "W", "p", "نتیجه"], input.normality.map((n) => [n.label, fmt(n.w, 3), fmtP(n.p), n.pass ? "برقرار" : "برقرار نیست"])));
  }
  if (input.homogeneity && input.homogeneity.length) {
    children.push(docTable(["متغیر", "F", "p", "نتیجه"], input.homogeneity.map((h) => [h.label, fmt(h.f, 3), fmtP(h.p), h.pass ? "برقرار" : "برقرار نیست"])));
  }
  if (input.mauchly) {
    children.push(docTable(["W", "χ²", "df", "p", "نتیجه"], [[fmt(input.mauchly.w, 3), fmt(input.mauchly.chi, 3), input.mauchly.df, fmtP(input.mauchly.p), input.mauchly.p >= input.alpha ? "برقرار" : "برقرار نیست"]]));
  }
  if (input.boxM) {
    children.push(docTable(["M", "χ²", "df", "p", "نتیجه"], [[fmt(input.boxM.m, 3), fmt(input.boxM.chi, 3), input.boxM.df, fmtP(input.boxM.p), input.boxM.p >= input.alpha ? "برقرار" : "برقرار نیست"]]));
  }

  if (input.answerKey) {
    children.push(docH("کلید پاسخ (مخصوص استاد)"));
    const rows: (string | number)[][] = [];
    if (input.answerKey.targetD) rows.push(["d کوهن هدف", fmt(input.answerKey.targetD.target), "d واقعی", fmt(input.answerKey.targetD.actual)]);
    if (input.answerKey.targetInteractionEta2) rows.push(["η² تعامل هدف", fmt(input.answerKey.targetInteractionEta2.target), "η² واقعی", fmt(input.answerKey.targetInteractionEta2.actual)]);
    rows.push(["تعداد تلاش تولید", input.answerKey.attempts, "", ""]);
    children.push(docTable(["شاخص", "هدف", "واقعی", "—"], rows));
  }

  return new Document({ sections: [{ children }] });
}

// ---------- TSV برای کپی در اکسل ----------

export function clinicalDataTSV(columns: string[], rows: (number | null)[][]): string {
  const lines = [columns.join("\t")];
  rows.forEach((r) => lines.push(r.map((v) => (v == null ? "" : v)).join("\t")));
  return lines.join("\n");
}
