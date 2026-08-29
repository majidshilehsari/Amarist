// ============================================================
// گزارش رگرسیون (متن / docx) — آماریست
// ============================================================

import {
  AlignmentType,
  BorderStyle,
  Document,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import { fmt, fmtP } from "./statistics";
import type { RegressionAnswerKey, RegressionFit } from "./regression";

export type RegressionDescriptive = { label: string; n: number; mean: number; sd: number; min: number; max: number };

export type RegressionReportInput = {
  projectName: string;
  source: "generate" | "real";
  predictorNames: string[];
  outcomeName: string;
  n: number;
  k: number;
  alpha: number;
  descriptives?: RegressionDescriptive[];
  correlations?: number[][];
  fit?: RegressionFit;
  residualNormality?: { w: number; p: number; pass: boolean };
  answerKey?: RegressionAnswerKey;
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

export function buildRegressionReportText(input: RegressionReportInput): string {
  const L: string[] = [];
  L.push("گزارش آماری — آماریست (رگرسیون خطی چندگانه)");
  L.push("==========================================");
  L.push(`پروژه: ${input.projectName} | منبع داده: ${input.source === "generate" ? "تولید تمرینی" : "داده واقعی"}`);
  L.push(`حجم نمونه: ${input.n} | تعداد پیش‌بین‌ها: ${input.k} | α = ${input.alpha}`);
  L.push(`متغیر پیامد: ${input.outcomeName} | پیش‌بین‌ها: ${input.predictorNames.join("، ")}`);
  L.push("");

  L.push("یافته‌های توصیفی:");
  if (input.descriptives && input.descriptives.length) {
    L.push("  متغیر | n | میانگین | انحراف معیار | کمینه | بیشینه");
    input.descriptives.forEach((d) => L.push(`  ${d.label} | ${d.n} | ${fmt(d.mean)} | ${fmt(d.sd)} | ${fmt(d.min)} | ${fmt(d.max)}`));
  }
  if (input.correlations) {
    L.push("  ماتریس همبستگی پیرسون:");
    const header = ["", ...input.predictorNames, input.outcomeName];
    L.push("    " + header.join(" | "));
    input.correlations.forEach((row, i) => {
      L.push(`    ${header[i + 1]} | ${row.map((v) => fmt(v, 2)).join(" | ")}`);
    });
  }
  L.push("");

  L.push("یافته‌های استنباطی:");
  if (input.fit) {
    const f = input.fit;
    L.push(`  R² = ${fmt(f.r2, 3)}، R² تعدیل‌شده = ${fmt(f.adjR2, 3)}`);
    L.push(`  F(${f.k}، ${f.n - f.k - 1}) = ${fmt(f.F)}، p = ${fmtP(f.pF)}${starP(f.pF)}`);
    L.push("  ضرایب مدل (B، خطای معیار، β استاندارد، t، p):");
    L.push(`    عرض از مبدأ: B = ${fmt(f.intercept)} (SE = ${fmt(f.se.length ? f.se[0] : NaN, 3)})`);
    f.coefs.forEach((b, i) => {
      L.push(`    ${input.predictorNames[i] ?? `X${i + 1}`}: B = ${fmt(b)}، SE = ${fmt(f.se[i], 3)}، β = ${fmt(f.stdBetas[i])}، t(${f.n - f.k - 1}) = ${fmt(f.t[i])}، p = ${fmtP(f.p[i])}${starP(f.p[i])}`);
    });
    L.push("  * p < 0.05 ، ** p < 0.01 ، *** p < 0.001");
  } else {
    L.push("  (هنوز تحلیل اجرا نشده است)");
  }
  L.push("");

  L.push("پیش‌فرض‌ها:");
  if (input.residualNormality) {
    L.push(`  نرمال بودن باقیمانده‌ها (شاپیرو-ویلک): W = ${fmt(input.residualNormality.w, 3)}، p = ${fmtP(input.residualNormality.p)} — ${input.residualNormality.pass ? "برقرار" : "برقرار نیست"}`);
  }
  L.push("");

  if (input.answerKey?.targetR2) {
    L.push("کلید پاسخ (مخصوص استاد):");
    L.push(`  R² هدف = ${fmt(input.answerKey.targetR2.target, 3)} | واقعی = ${fmt(input.answerKey.targetR2.actual, 3)}`);
    L.push(`  تعداد تلاش‌های تولید: ${input.answerKey.attempts}`);
    L.push("");
  }

  return L.join("\n");
}

// ---------- docx ----------

const thinBorder = { style: BorderStyle.SINGLE, size: 2, color: "9AA5B1" } as const;

function docP(text: string, opts: { bold?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) {
  return new Paragraph({
    alignment: opts.align ?? AlignmentType.RIGHT,
    spacing: { after: 100 },
    children: [new TextRun({ text, font: FA_FONT, size: opts.size ?? 22, bold: opts.bold })],
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

export function buildRegressionDocx(input: RegressionReportInput): Document {
  const children: (Paragraph | Table)[] = [];
  children.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [new TextRun({ text: "گزارش آماری — آماریست", font: FA_HEAD, size: 40, bold: true, color: "1F3864" })] }));
  children.push(docP(`پروژه: ${input.projectName} | منبع داده: ${input.source === "generate" ? "تولید تمرینی" : "داده واقعی"} | n = ${faNum(input.n)} | α = ${input.alpha}`, { align: AlignmentType.CENTER, bold: true }));

  children.push(docH("یافته‌های توصیفی"));
  if (input.descriptives && input.descriptives.length) {
    children.push(docTable(["متغیر", "n", "میانگین", "انحراف معیار", "کمینه", "بیشینه"], input.descriptives.map((d) => [d.label, d.n, fmt(d.mean), fmt(d.sd), fmt(d.min), fmt(d.max)])));
  }
  if (input.correlations) {
    children.push(docH("ماتریس همبستگی پیرسون"));
    const header = ["متغیر", ...input.predictorNames, input.outcomeName];
    const rows = input.correlations.map((row, i) => [header[i + 1], ...row.map((v) => fmt(v, 2))]);
    children.push(docTable(header, rows));
  }

  children.push(docH("یافته‌های استنباطی"));
  if (input.fit) {
    const f = input.fit;
    children.push(docP(`R² = ${fmt(f.r2, 3)} | R² تعدیل‌شده = ${fmt(f.adjR2, 3)} | F(${f.k}، ${f.n - f.k - 1}) = ${fmt(f.F)} | p = ${fmtP(f.pF)}${starP(f.pF)}`, { bold: true }));
    const rows: (string | number)[][] = [["عرض از مبدأ", fmt(f.intercept), fmt(f.se[0] ?? NaN, 3), "—", "—", "—"]];
    f.coefs.forEach((b, i) => rows.push([input.predictorNames[i] ?? `X${i + 1}`, fmt(b), fmt(f.se[i], 3), fmt(f.stdBetas[i]), fmt(f.t[i]), `${fmtP(f.p[i])}${starP(f.p[i])}`]));
    children.push(docTable(["متغیر", "B", "SE", "β", "t", "p"], rows));
  }

  children.push(docH("پیش‌فرض‌ها"));
  if (input.residualNormality) {
    children.push(docTable(["آزمون", "W", "p", "نتیجه"], [["نرمال بودن باقیمانده‌ها (شاپیرو-ویلک)", fmt(input.residualNormality.w, 3), fmtP(input.residualNormality.p), input.residualNormality.pass ? "برقرار" : "برقرار نیست"]]));
  }

  if (input.answerKey?.targetR2) {
    children.push(docH("کلید پاسخ (مخصوص استاد)"));
    children.push(docTable(["شاخص", "هدف", "واقعی"], [["R²", fmt(input.answerKey.targetR2.target, 3), fmt(input.answerKey.targetR2.actual, 3)], ["تعداد تلاش تولید", input.answerKey.attempts, "—"]]));
  }

  return new Document({ sections: [{ children }] });
}
