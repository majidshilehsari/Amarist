"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Play,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { fmt, mean, sampleStd } from "@/lib/statistics";
import { cronbachAlpha, pearson, correlationMatrixWithP } from "@/lib/sem-stats";
import ToolHeader from "@/components/tool-header";

// ------------------------------------------------------------
// ثابت‌های استایل
// ------------------------------------------------------------

const inputCls =
  "w-full rounded-xl border border-stone-300 bg-[#fbfdff] px-3 py-2 text-sm outline-none transition focus:border-indigo-400 focus:ring-4 focus:ring-indigo-100 dark:border-stone-600 dark:bg-slate-800 dark:text-stone-100";
const labelCls = "mb-1 block text-[12px] font-bold text-stone-600 dark:text-stone-300";
const tinyCls = "mt-1 text-[11px] leading-5 text-stone-400 dark:text-stone-500";
const cardCls = "rounded-2xl border p-5 shadow-sm sm:p-6";
const btnPrimary =
  "inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-extrabold text-white shadow-md shadow-indigo-600/20 transition hover:bg-indigo-500 active:translate-y-0 disabled:opacity-50";
const btnSecondary =
  "inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-extrabold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 disabled:opacity-50";
const btnLight =
  "inline-flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-4 py-2 text-sm font-bold text-stone-600 transition hover:bg-stone-100 dark:border-stone-700 dark:bg-slate-800 dark:text-stone-300 dark:hover:bg-slate-700 disabled:opacity-50";

const sectionTones = [
  "border-blue-300 bg-blue-50/50 dark:border-blue-900 dark:bg-slate-900",
  "border-amber-300 bg-amber-50/50 dark:border-amber-900 dark:bg-slate-900",
  "border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-slate-900",
  "border-violet-300 bg-violet-50/50 dark:border-violet-900 dark:bg-slate-900",
];

type Questionnaire = {
  id: number;
  name: string;
  itemCount: number;
  itemMin: number;
  itemMax: number;
};

function alphaInterpretation(a: number): { label: string; ok: boolean } {
  if (!Number.isFinite(a)) return { label: "نامشخص", ok: false };
  if (a >= 0.9) return { label: "عالی", ok: true };
  if (a >= 0.8) return { label: "خوب", ok: true };
  if (a >= 0.7) return { label: "قابل قبول", ok: true };
  if (a >= 0.6) return { label: "مورد بحث", ok: false };
  return { label: "ضعیف", ok: false };
}

function standardizedAlpha(cols: number[][]): number {
  const k = cols.length;
  if (k < 2) return NaN;
  const corr = correlationMatrixWithP(cols).r;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      sum += corr[i][j];
      count++;
    }
  }
  if (!count) return NaN;
  const rBar = sum / count;
  return (k * rBar) / (1 + (k - 1) * rBar);
}

function Cell({ value, onCommit }: { value: number | null; onCommit: (v: number | null) => void }) {
  const [txt, setTxt] = useState(value == null ? "" : String(value));
  const [lastValue, setLastValue] = useState(value);
  if (lastValue !== value) {
    setLastValue(value);
    setTxt(value == null ? "" : String(value));
  }
  return (
    <input
      dir="ltr"
      className="w-16 rounded border border-transparent bg-transparent px-1 py-0.5 text-center text-[13px] tabular-nums outline-none transition hover:border-stone-200 focus:border-indigo-400 focus:bg-white dark:hover:border-stone-600 dark:focus:bg-slate-800"
      value={txt}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const t = txt.trim();
        if (t === "") onCommit(null);
        else {
          const num = Number(t);
          onCommit(Number.isFinite(num) ? num : null);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
      }}
    />
  );
}

export default function AlphaTool() {
  const [source, setSource] = useState<"generate" | "real">("generate");
  const [questionnaires, setQuestionnaires] = useState<Questionnaire[]>([
    { id: 0, name: "پرسشنامه نمونه", itemCount: 8, itemMin: 1, itemMax: 5 },
  ]);
  const [n, setN] = useState("120");
  const [alphaMin, setAlphaMin] = useState("0.7");
  const [alphaMax, setAlphaMax] = useState("0.9");
  const [columns, setColumns] = useState<string[]>([]);
  const [rows, setRows] = useState<(number | null)[][]>([]);
  const [status, setStatus] = useState<{ text: string; kind: "" | "ok" | "err" }>({
    text: "هنوز داده‌ای تولید نشده است.",
    kind: "",
  });
  const fileRef = useRef<HTMLInputElement>(null);

  const allItemCount = questionnaires.reduce((s, q) => s + q.itemCount, 0);

  const updateQ = (id: number, patch: Partial<Questionnaire>) => {
    setQuestionnaires((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  };

  const addQ = () => {
    const id = questionnaires.length ? Math.max(...questionnaires.map((q) => q.id)) + 1 : 0;
    setQuestionnaires((prev) => [
      ...prev,
      { id, name: `پرسشنامه ${prev.length + 1}`, itemCount: 6, itemMin: 1, itemMax: 5 },
    ]);
  };

  const removeQ = (id: number) => {
    setQuestionnaires((prev) => prev.filter((q) => q.id !== id));
  };

  // ---------- تولید داده ----------
  const generate = useCallback(() => {
    try {
      const nn = Math.round(Number(n));
      const aMin = Number(alphaMin);
      const aMax = Number(alphaMax);
      if (!Number.isFinite(nn) || nn < 10) throw new Error("حجم نمونه باید حداقل ۱۰ باشد.");
      if (!Number.isFinite(aMin) || !Number.isFinite(aMax) || aMin >= aMax || aMin < 0 || aMax > 1) {
        throw new Error("بازه آلفای هدف معتبر نیست (بین ۰ تا ۱ و حداقل کوچک‌تر از حداکثر).");
      }
      if (allItemCount === 0) throw new Error("حداقل یک پرسشنامه با تعداد گویه تعریف کنید.");

      const cols: number[][] = [];
      const colNames: string[] = [];
      // لامبدا از سقف بازه گرفته می‌شود تا گرد شدن به اعداد صحیح، آلفا را از بازه بیرون نبرد
      const targetAlpha = Math.min(0.97, aMax + 0.05);

      for (const q of questionnaires) {
        const k = q.itemCount;
        if (k < 2) throw new Error(`پرسشنامه «${q.name}» باید حداقل ۲ گویه داشته باشد.`);
        // بار عاملی معادل برای رسیدن به آلفای هدف (مدل tau-equivalent)
        let lam = Math.sqrt(targetAlpha / (k - (k - 1) * targetAlpha));
        lam = Math.max(0.35, Math.min(0.95, lam));
        const mn = q.itemMin;
        const mx = q.itemMax;
        const mid = (mn + mx) / 2;
        const sd = Math.max(0.6, (mx - mn) / 5);

        let attempt = 0;
        let alpha = NaN;
        let qCols: number[][] = [];
        const maxTries = 200;
        do {
          const latent = Array.from({ length: nn }, () => {
            let u = 0;
            let v = 0;
            while (u === 0) u = Math.random();
            while (v === 0) v = Math.random();
            return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
          });
          qCols = Array.from({ length: k }, () =>
            latent.map(
              (z) =>
                Math.round(
                  Math.min(
                    mx,
                    Math.max(mn, mid + sd * (lam * z + Math.sqrt(1 - lam * lam) * (() => {
                      let u = 0;
                      let v = 0;
                      while (u === 0) u = Math.random();
                      while (v === 0) v = Math.random();
                      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
                    })()))
                  )
                )
            )
          );
          alpha = cronbachAlpha(qCols);
          attempt++;
        } while ((!Number.isFinite(alpha) || alpha < aMin || alpha > aMax) && attempt < maxTries);

        if (!Number.isFinite(alpha) || alpha < aMin || alpha > aMax) {
          throw new Error(
            `برای پرسشنامه «${q.name}» با ${k} گویه در بازه آلفای ${aMin} تا ${aMax} داده قابل قبول پیدا نشد؛ تعداد گویه‌ها را بیشتر کنید یا بازه را بازتر کنید.`
          );
        }
        qCols.forEach((c, i) => {
          cols.push(c);
          colNames.push(`${q.name} — گویه ${i + 1}`);
        });
      }

      const dataRows: (number | null)[][] = Array.from({ length: nn }, (_, i) =>
        cols.map((c) => c[i])
      );
      setColumns(colNames);
      setRows(dataRows);
      setStatus({ text: `داده تولید شد: ${nn} نفر × ${allItemCount} گویه.`, kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  }, [n, alphaMin, alphaMax, questionnaires, allItemCount]);

  const generateRef = useRef(generate);
  useEffect(() => {
    generateRef.current = generate;
  });
  useEffect(() => {
    const t = setTimeout(() => generateRef.current(), 80);
    return () => clearTimeout(t);
  }, []);

  // ---------- ایمپورت ----------
  const handleImport = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      if (!ws) throw new Error("فایل اکسل خالی است.");
      const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null }) as unknown[][];
      if (!aoa.length) throw new Error("فایل اکسل خالی است.");
      const first = aoa[0] ?? [];
      const hasHeader = first.some((v) => typeof v === "string" && !/^-?\d+(\.\d+)?$/.test(v.trim()));
      const headers: string[] = [];
      let dataRows = aoa;
      if (hasHeader) {
        headers.push(...first.map((v, i) => String(v ?? `ستون ${i + 1}`)));
        dataRows = aoa.slice(1);
      } else {
        headers.push(...first.map((_, i) => `ستون ${i + 1}`));
      }
      const parsed = dataRows.map((r) =>
        Array.from({ length: headers.length }, (_, j) => {
          const v = (r as unknown[])[j];
          if (v == null || v === "") return null;
          const num = Number(String(v).replace(/[،]/g, "").trim());
          return Number.isFinite(num) ? num : null;
        })
      );
      setSource("real");
      setColumns(headers);
      setRows(parsed);
      setStatus({ text: `داده وارد شد: ${parsed.length} مورد × ${headers.length} ستون.`, kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const updateCell = (ri: number, ci: number, value: number | null) => {
    setRows((prev) => prev.map((r, i) => (i === ri ? r.map((v, j) => (j === ci ? value : v)) : r)));
  };

  // ---------- نتایج ----------
  const results = useMemo(() => {
    if (!rows.length) return null;
    // گروه‌بندی ستون‌ها بر اساس پرسشنامه (برای داده واقعی: همه ستون‌ها یک پرسشنامه «داده واردشده»)
    const groups: { name: string; cols: number[][] }[] = [];
    if (source === "real") {
      groups.push({
        name: "داده واردشده (همه گویه‌ها)",
        cols: columns.map((_, ci) => rows.map((r) => r[ci] as number)),
      });
    } else {
      let colIdx = 0;
      for (const q of questionnaires) {
        const cols: number[][] = [];
        for (let i = 0; i < q.itemCount; i++) {
          cols.push(rows.map((r) => r[colIdx + i] as number));
        }
        colIdx += q.itemCount;
        groups.push({ name: q.name, cols });
      }
    }

    return groups.map((g) => {
      const k = g.cols.length;
      const items = g.cols.map((col, i) => {
        const rest = g.cols.filter((_, j) => j !== i);
        const restTotal = rest[0]?.map((_, ri) => rest.reduce((s, c) => s + (c[ri] ?? 0), 0)) ?? [];
        const corr = pearson(col, restTotal);
        return {
          name: source === "real" ? columns[i] : `گویه ${i + 1}`,
          mean: mean(col),
          sd: sampleStd(col),
          itemTotal: corr.r,
          alphaIfDeleted: cronbachAlpha(rest),
        };
      });
      const alpha = cronbachAlpha(g.cols);
      const stdAlpha = standardizedAlpha(g.cols);
      const interp = alphaInterpretation(alpha);
      return { name: g.name, k, items, alpha, stdAlpha, interp };
    });
  }, [rows, columns, source, questionnaires]);

  // ---------- خروجی‌ها ----------
  const buildReport = () => {
    const L: string[] = [];
    L.push("گزارش آلفای کرونباخ — آماریست");
    L.push("==================================");
    L.push(`تعداد موارد: ${rows.length} | منبع: ${source === "generate" ? "تولید تمرینی" : "داده واقعی"}`);
    L.push("");
    if (!results) {
      L.push("داده‌ای موجود نیست.");
      return L.join("\n");
    }
    results.forEach((g) => {
      L.push(`پرسشنامه: ${g.name} (${g.k} گویه)`);
      L.push("  گویه | میانگین | انحراف معیار | همبستگی گویه-کل | آلفا اگر حذف شود");
      g.items.forEach((it) => {
        L.push(
          `  ${it.name} | ${fmt(it.mean)} | ${fmt(it.sd)} | ${fmt(it.itemTotal)} | ${fmt(it.alphaIfDeleted)}`
        );
      });
      L.push(`  آلفای کرونباخ: ${fmt(g.alpha)} (${g.interp.label}) | آلفای استانداردشده: ${fmt(g.stdAlpha)}`);
      L.push("");
    });
    L.push("معیار تفسیر: ≥0.9 عالی، 0.8-0.9 خوب، 0.7-0.8 قابل قبول، 0.6-0.7 مورد بحث، <0.6 ضعیف");
    return L.join("\n");
  };

  const exportExcel = () => {
    try {
      if (!rows.length) throw new Error("داده‌ای برای خروجی وجود ندارد.");
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet([columns, ...rows.map((r) => r.map((v) => (v == null ? "" : v)))]),
        "داده"
      );
      if (results) {
        const header = ["پرسشنامه", "گویه", "میانگین", "انحراف معیار", "همبستگی گویه-کل", "آلفا اگر حذف شود", "آلفای کل", "آلفای استاندارد", "تفسیر"];
        const aoa: (string | number)[][] = [header];
        results.forEach((g) => {
          g.items.forEach((it, i) => {
            aoa.push([
              g.name,
              it.name,
              Number(it.mean.toFixed(2)),
              Number(it.sd.toFixed(2)),
              Number(it.itemTotal.toFixed(3)),
              Number(it.alphaIfDeleted.toFixed(3)),
              i === 0 ? Number(g.alpha.toFixed(3)) : "",
              i === 0 ? Number(g.stdAlpha.toFixed(3)) : "",
              i === 0 ? g.interp.label : "",
            ]);
          });
        });
        XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), "نتایج آلفا");
      }
      XLSX.utils.book_append_sheet(
        wb,
        XLSX.utils.aoa_to_sheet(buildReport().split("\n").map((l) => [l])),
        "گزارش"
      );
      XLSX.writeFile(wb, "amarist-alpha.xlsx");
      setStatus({ text: "فایل اکسل دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const downloadTemplate = () => {
    try {
      const headers: string[] = [];
      questionnaires.forEach((q) => {
        for (let i = 1; i <= q.itemCount; i++) headers.push(`${q.name} — گویه ${i}`);
      });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([headers]), "قالب داده");
      const guide: (string | number)[][] = [
        ["پرسشنامه", "تعداد گویه", "حداقل نمره گویه", "حداکثر نمره گویه"],
        ...questionnaires.map((q) => [q.name, q.itemCount, q.itemMin, q.itemMax]),
      ];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(guide), "راهنما");
      XLSX.writeFile(wb, "amarist-alpha-template.xlsx");
      setStatus({ text: "قالب داده دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const exportDocx = async () => {
    try {
      const doc = new Document({
        sections: [
          {
            children: buildReport()
              .split("\n")
              .map(
                (l) =>
                  new Paragraph({
                    children: [new TextRun({ text: l, font: "Tahoma", size: 22 })],
                    spacing: { after: 80 },
                  })
              ),
          },
        ],
      });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-alpha-report.docx";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "گزارش docx دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const exportTxt = () => {
    try {
      const blob = new Blob(["\uFEFF" + buildReport()], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "amarist-alpha-report.txt";
      a.click();
      URL.revokeObjectURL(url);
      setStatus({ text: "گزارش txt دانلود شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  const copyReport = async () => {
    try {
      const text = buildReport();
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      }
      setStatus({ text: "گزارش کپی شد.", kind: "ok" });
    } catch (err) {
      setStatus({ text: (err as Error).message, kind: "err" });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/70 via-[#f5f7fb] to-[#f5f7fb] pb-32 dark:from-slate-950 dark:via-slate-900 dark:to-slate-900">
      <ToolHeader
        title="اندازه‌گیری و تحلیل آلفای کرونباخ"
        subtitle="تحلیل تعقیبی قابلیت اعتماد پرسشنامه‌ها"
        actions={
          <a
            href="/tools/sem"
            className="inline-flex items-center gap-1.5 rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-[12px] font-extrabold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-800 dark:bg-indigo-950 dark:text-indigo-300"
          >
            بازگشت به SEM
          </a>
        }
      />

      <div className="mx-auto max-w-[1200px] px-4">
        {/* ---------- ۱) تعریف پرسشنامه‌ها ---------- */}
        <section className={`${cardCls} mt-6 ${sectionTones[0]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۱) تعریف پرسشنامه‌ها</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                برای هر پرسشنامه مشخص کنید چند گویه دارد و نمره هر گویه از چند تا چند است.
              </p>
            </div>
            <button type="button" className={btnLight} onClick={addQ}>
              <Plus className="h-4 w-4" />
              افزودن پرسشنامه
            </button>
          </div>

          <div className="mt-4 grid gap-3">
            {questionnaires.map((q) => (
              <div key={q.id} className="grid gap-3 rounded-2xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_140px_120px_120px_44px] dark:border-stone-700 dark:bg-slate-800">
                <div>
                  <label className={labelCls}>نام پرسشنامه</label>
                  <input
                    className={inputCls}
                    value={q.name}
                    onChange={(e) => updateQ(q.id, { name: e.target.value })}
                  />
                </div>
                <div>
                  <label className={labelCls}>تعداد گویه</label>
                  <input
                    type="number"
                    min={2}
                    className={inputCls}
                    value={q.itemCount}
                    onChange={(e) => updateQ(q.id, { itemCount: Math.max(2, Number(e.target.value)) })}
                  />
                </div>
                <div>
                  <label className={labelCls}>حداقل نمره گویه</label>
                  <input
                    type="number"
                    dir="ltr"
                    className={inputCls}
                    value={q.itemMin}
                    onChange={(e) => updateQ(q.id, { itemMin: Number(e.target.value) })}
                  />
                </div>
                <div>
                  <label className={labelCls}>حداکثر نمره گویه</label>
                  <input
                    type="number"
                    dir="ltr"
                    className={inputCls}
                    value={q.itemMax}
                    onChange={(e) => updateQ(q.id, { itemMax: Number(e.target.value) })}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={() => removeQ(q.id)}
                    className="flex h-10 w-10 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-600 transition hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-400"
                    title="حذف پرسشنامه"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ---------- ۲) منبع داده و تولید ---------- */}
        <section className={`${cardCls} mt-4 ${sectionTones[1]}`}>
          <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۲) منبع داده</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => setSource("generate")}
              className={`rounded-2xl border-2 p-4 text-start transition ${
                source === "generate"
                  ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40"
                  : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"
              }`}
            >
              <p className="font-extrabold text-stone-900 dark:text-stone-100">تولید داده تمرینی</p>
              <p className="mt-1 text-[12px] text-stone-500 dark:text-stone-400">
                داده‌ای می‌سازد که آلفای هر پرسشنامه داخل بازه هدف بیفتد.
              </p>
            </button>
            <button
              type="button"
              onClick={() => setSource("real")}
              className={`rounded-2xl border-2 p-4 text-start transition ${
                source === "real"
                  ? "border-blue-600 bg-blue-100/60 dark:border-blue-500 dark:bg-blue-950/40"
                  : "border-stone-200 bg-white hover:border-blue-300 dark:border-stone-700 dark:bg-slate-800"
              }`}
            >
              <p className="font-extrabold text-stone-900 dark:text-stone-100">داده واقعی خودم</p>
              <p className="mt-1 text-[12px] text-stone-500 dark:text-stone-400">
                فایل اکسل گویه‌ها را در بخش ۳ وارد کنید.
              </p>
            </button>
          </div>

          {source === "generate" && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>حجم نمونه</label>
                <input type="number" className={inputCls} value={n} onChange={(e) => setN(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>حداقل آلفای هدف</label>
                <input
                  type="number"
                  step={0.05}
                  dir="ltr"
                  className={inputCls}
                  value={alphaMin}
                  onChange={(e) => setAlphaMin(e.target.value)}
                />
              </div>
              <div>
                <label className={labelCls}>حداکثر آلفای هدف</label>
                <input
                  type="number"
                  step={0.05}
                  dir="ltr"
                  className={inputCls}
                  value={alphaMax}
                  onChange={(e) => setAlphaMax(e.target.value)}
                />
              </div>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {source === "generate" && (
              <button type="button" className={btnPrimary} onClick={generate}>
                <Play className="h-4 w-4" />
                تولید داده و محاسبه آلفا
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleImport(f);
                e.target.value = "";
              }}
            />
            <button type="button" className={btnSecondary} onClick={() => fileRef.current?.click()}>
              <Upload className="h-4 w-4" />
              ایمپورت اکسل
            </button>
            <button type="button" className={btnSecondary} onClick={downloadTemplate}>
              <FileSpreadsheet className="h-4 w-4" />
              دانلود قالب داده
            </button>
            <span
              className={`inline-flex min-h-6 items-center gap-2 text-[13px] ${
                status.kind === "ok"
                  ? "font-bold text-emerald-700 dark:text-emerald-400"
                  : status.kind === "err"
                    ? "font-bold text-red-700 dark:text-red-400"
                    : "text-stone-400"
              }`}
            >
              {status.kind === "ok" ? "✓" : status.kind === "err" ? "✗" : "•"} {status.text}
            </span>
          </div>
        </section>

        {/* ---------- ۳) جدول داده ---------- */}
        <section className={`${cardCls} mt-4 ${sectionTones[2]}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۳) جدول داده</h2>
              <p className="mt-1 text-[13px] leading-6 text-stone-500 dark:text-stone-400">
                هر ستون یک گویه است؛ سلول‌ها قابل ویرایش‌اند.
              </p>
            </div>
            <button type="button" className={btnSecondary} onClick={exportExcel}>
              <Download className="h-4 w-4" />
              اکسپورت اکسل
            </button>
          </div>

          {rows.length > 0 ? (
            <div className="tool-table-wrap tool-table-scroll mt-4">
              <table className="tool-table" style={{ minWidth: Math.max(640, columns.length * 90) }}>
                <thead>
                  <tr>
                    <th>ردیف</th>
                    {columns.map((c, i) => (
                      <th key={i}>{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td className="row-index">{i + 1}</td>
                      {r.map((v, j) => (
                        <td key={j}>
                          <Cell value={v} onCommit={(nv) => updateCell(i, j, nv)} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
              هنوز داده‌ای وجود ندارد؛ «تولید داده و محاسبه آلفا» را بزنید یا فایل اکسل وارد کنید.
            </div>
          )}
        </section>

        {/* ---------- ۴) نتایج ---------- */}
        <section className={`${cardCls} mt-4 ${sectionTones[3]}`}>
          <h2 className="text-lg font-extrabold text-stone-900 dark:text-stone-100">۴) نتایج آلفای کرونباخ</h2>
          {!results ? (
            <div className="mt-4 rounded-xl border border-dashed border-stone-300 p-8 text-center text-sm text-stone-400 dark:border-stone-600 dark:text-stone-500">
              بعد از تولید یا ورود داده، نتایج نمایش داده می‌شود.
            </div>
          ) : (
            <div className="mt-4 space-y-6">
              {results.map((g, gi) => (
                <div key={gi} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-extrabold text-stone-800 dark:text-stone-200">
                      {g.name} <span className="text-[12px] font-bold text-stone-400">({g.k} گویه)</span>
                    </h3>
                    <div className="flex flex-wrap gap-2 text-[12px] font-bold">
                      <span className="rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300">
                        آلفای کرونباخ: {fmt(g.alpha)}
                      </span>
                      <span className="rounded-full bg-sky-50 px-3 py-1 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                        آلفای استانداردشده: {fmt(g.stdAlpha)}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 ${
                          g.interp.ok
                            ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"
                        }`}
                      >
                        تفسیر: {g.interp.label}
                      </span>
                    </div>
                  </div>

                  <div className="tool-table-wrap mt-3">
                    <table className="tool-table">
                      <thead>
                        <tr>
                          <th>گویه</th>
                          <th>میانگین</th>
                          <th>انحراف معیار</th>
                          <th>همبستگی گویه-کل (تصحیح‌شده)</th>
                          <th>آلفا اگر گویه حذف شود</th>
                          <th>نتیجه</th>
                        </tr>
                      </thead>
                      <tbody>
                        {g.items.map((it, i) => (
                          <tr key={i}>
                            <td>{it.name}</td>
                            <td className="number-cell">{fmt(it.mean)}</td>
                            <td className="number-cell">{fmt(it.sd)}</td>
                            <td className="number-cell">{fmt(it.itemTotal)}</td>
                            <td className="number-cell">{fmt(it.alphaIfDeleted)}</td>
                            <td
                              dangerouslySetInnerHTML={{
                                __html:
                                  it.itemTotal >= 0.3
                                    ? '<span class="assumption-badge assumption-ok">مطلوب</span>'
                                    : '<span class="assumption-badge assumption-bad">ضعیف</span>',
                              }}
                            />
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className={`${tinyCls} mt-2`}>
                    معیار: همبستگی گویه-کل تصحیح‌شده ≥ 0.30 مطلوب است؛ اگر «آلفا اگر گویه حذف شود» از آلفای کل بزرگ‌تر
                    باشد، حذف آن گویه آلفا را بالا می‌برد.
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* ---------- فوتر ثابت خروجی ---------- */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-stone-200 bg-white/95 shadow-[0_-6px_24px_rgba(24,32,51,0.08)] backdrop-blur dark:border-stone-700 dark:bg-slate-900/95">
        <div className="mx-auto flex max-w-[1200px] flex-col items-center gap-1.5 px-4 py-2.5">
          <p className="text-center text-[12px] text-stone-500 dark:text-stone-400">
            برای دریافت خروجی مورد نظر روی دکمه مربوطه کلیک کنید؛ اکسل شامل «داده»، «نتایج آلفا» و «گزارش» است.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button type="button" className={btnPrimary} onClick={exportExcel}>
              <Download className="h-4 w-4" />
              دانلود اکسل کامل
            </button>
            <button type="button" className={btnLight} onClick={exportDocx}>
              <FileText className="h-4 w-4" />
              گزارش docx
            </button>
            <button type="button" className={btnLight} onClick={exportTxt}>
              <FileText className="h-4 w-4" />
              گزارش txt
            </button>
            <button type="button" className={btnLight} onClick={copyReport}>
              <Copy className="h-4 w-4" />
              کپی گزارش
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
