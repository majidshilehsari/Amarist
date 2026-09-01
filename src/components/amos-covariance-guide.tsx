"use client";

import type { ModelNode, SemResults } from "@/lib/sem-stats";

function estimatedCorrelation(sem: SemResults | null | undefined, leftNode: number, rightNode: number): number | null {
  const row = sem?.exogenousCorrelations?.find(
    (item) =>
      (item.leftNode === leftNode && item.rightNode === rightNode) ||
      (item.leftNode === rightNode && item.rightNode === leftNode)
  );
  return row && Number.isFinite(row.r) ? row.r : null;
}

function sourceLabel(node: ModelNode): string {
  const normalized = node.label.replace(/\s/g, "").toUpperCase();
  if (normalized === "Q1") return "Q1";
  if (normalized === "Q2S1") return "e11";
  if (normalized === "Q2S2") return "e12";
  return node.kind === "total" ? node.label : `منبع ورودیِ «${node.label}»`;
}

export default function AmosCovarianceGuide({
  nodes,
  sem,
}: {
  nodes: ModelNode[];
  sem?: SemResults | null;
}) {
  const exogenous = nodes.filter((node) => node.role === "exogenous");
  const normalizedLabels = new Set(exogenous.map((node) => node.label.replace(/\s/g, "").toUpperCase()));
  const isQ1Q2Example = ["Q1", "Q2S1", "Q2S2"].every((label) => normalizedLabels.has(label));
  const pairs: { left: ModelNode; right: ModelNode; r: number | null }[] = [];
  for (let i = 0; i < exogenous.length; i++) {
    for (let j = i + 1; j < exogenous.length; j++) {
      pairs.push({
        left: exogenous[i],
        right: exogenous[j],
        r: estimatedCorrelation(sem, exogenous[i].nodeId, exogenous[j].nodeId),
      });
    }
  }

  if (!pairs.length) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600 dark:border-stone-700 dark:bg-slate-900 dark:text-stone-300">
        مدل فقط یک پیش‌بین برون‌زا دارد؛ بنابراین کوواریانس برون‌زایی برای رسم در AMOS وجود ندارد.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4 dark:border-violet-800 dark:bg-violet-950/25">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-black text-violet-950 dark:text-violet-100">راهنمای بازسازی همین مدل در AMOS</h4>
          <p className="mt-1 text-[12px] leading-6 text-violet-800 dark:text-violet-200">
            آماریست این {pairs.length.toLocaleString("fa-IR")} کوواریانس را واقعاً آزاد و برآورد می‌کند؛ حذف آن‌ها در AMOS مدل دیگری می‌سازد.
          </p>
        </div>
        <span className="rounded-full bg-violet-700 px-3 py-1 text-[11px] font-black text-white">
          ↔ = کوواریانس آزاد
        </span>
      </div>

      <div className="mt-3 overflow-x-auto rounded-xl border border-violet-200 bg-white dark:border-violet-800 dark:bg-slate-900">
        <table className="w-full min-w-[760px] border-collapse text-right text-[12px]">
          <thead className="bg-violet-100 text-violet-950 dark:bg-violet-950 dark:text-violet-100">
            <tr>
              <th className="border-b border-violet-200 px-3 py-2.5 dark:border-violet-800">رابطهٔ واقعی مدل</th>
              <th className="border-b border-violet-200 px-3 py-2.5 text-center dark:border-violet-800">r برآوردی</th>
              <th className="border-b border-violet-200 px-3 py-2.5 dark:border-violet-800">رسم پیشنهادی در AMOS</th>
              <th className="border-b border-violet-200 px-3 py-2.5 dark:border-violet-800">اگر متغیر مشاهده‌شده منبع ورودی دارد</th>
            </tr>
          </thead>
          <tbody className="text-stone-700 dark:text-stone-200">
            {pairs.map(({ left, right, r }) => (
              <tr key={`${left.nodeId}-${right.nodeId}`} className="border-b border-violet-100 last:border-0 dark:border-violet-900">
                <td className="px-3 py-2.5 font-black" dir="ltr">{left.label} ↔ {right.label}</td>
                <td className="px-3 py-2.5 text-center font-black" dir="ltr">
                  {r == null ? "پس از تحلیل" : r.toFixed(3)}
                </td>
                <td className="px-3 py-2.5" dir="ltr">{left.label} ↔ {right.label}</td>
                <td className="px-3 py-2.5" dir="ltr">{sourceLabel(left)} ↔ {sourceLabel(right)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-xl bg-white/80 px-3 py-2.5 text-[12px] leading-6 text-stone-700 dark:bg-slate-900/80 dark:text-stone-200">
        <strong>{isQ1Q2Example ? "نگاشت دقیق مدل جاری:" : "نمونهٔ معادل‌سازی:"}</strong>{" "}
        <span dir="ltr">Q1 ↔ Q2S1</span> معادل <span dir="ltr">Q1 ↔ e11</span>،{" "}
        <span dir="ltr">Q1 ↔ Q2S2</span> معادل <span dir="ltr">Q1 ↔ e12</span> و{" "}
        <span dir="ltr">Q2S1 ↔ Q2S2</span> معادل <span dir="ltr">e11 ↔ e12</span> است؛
        به شرط آنکه <span dir="ltr">e11</span> و <span dir="ltr">e12</span> همان دایره‌های ورودی Q2S1 و Q2S2 در فایل شما باشند.
        شمارهٔ eها به ترتیب رسم در AMOS وابسته است و باید از خود نمودار خوانده شود.
      </div>
    </div>
  );
}
