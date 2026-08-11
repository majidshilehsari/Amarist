"use client";

import type { VariableSpec } from "@/lib/sem-generator";
import type { ModelArrow, ModelNode, Role, SemResults } from "@/lib/sem-stats";

const roleColors: Record<Role, { fill: string; stroke: string; text: string }> = {
  exogenous: { fill: "#eff6ff", stroke: "#2563eb", text: "#1e40af" },
  mediator: { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  outcome: { fill: "#ecfdf5", stroke: "#059669", text: "#065f46" },
};

const subFill = "#f8fafc";
const subStroke = "#94a3b8";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

type Pos = { cx: number; cy: number };
type Side = "left" | "right" | "top" | "bottom";

export default function PathDiagram({
  vars,
  nodes,
  arrows,
  results,
  large = false,
}: {
  vars: VariableSpec[];
  nodes: ModelNode[];
  arrows: ModelArrow[];
  results?: SemResults | null;
  large?: boolean;
}) {
  const scale = large ? 1.3 : 1;
  const nodeW = 190 * scale;
  const nodeH = 54 * scale;
  const colGap = 265 * scale;
  const subW = 145 * scale;
  const subH = 26 * scale;
  const subGap = 34 * scale;

  const varsByRole: VariableSpec[][] = [
    vars.filter((v) => v.role === "exogenous"),
    vars.filter((v) => v.role === "mediator"),
    vars.filter((v) => v.role === "outcome"),
  ];
  // سمت قرارگیری زیرمقیاس‌ها: ستون چپ → چپ، ستون راست → راست،
  // ستون وسط (میانجی‌ها) → متغیرهای بالایی بالا، متغیرهای پایینی پایین
  const sideOf = (v: VariableSpec): Side => {
    const col = varsByRole.findIndex((arr) => arr.includes(v));
    if (col === 0) return "left";
    if (col === 2) return "right";
    const colVars = varsByRole[1];
    const idx = colVars.findIndex((x) => x.id === v.id);
    return idx < Math.ceil(colVars.length / 2) ? "top" : "bottom";
  };

  const nodePos = new Map<number, Pos>();
  /** زیرمقیاس‌های نمایشی متغیرهای جمع‌پذیر */
  const indicatorPos = new Map<number, Pos[]>();
  let W = 40;
  let H = 60;

  for (let col = 0; col < 3; col++) {
    const colVars = varsByRole[col];
    if (!colVars.length) continue;
    const x = 40 + col * colGap;
    let yCursor = 60;
    let colH = 60;
    for (const v of colVars) {
      const vNodes = nodes.filter((n) => n.varId === v.id);
      const nSub = v.subscales.length;
      const side = sideOf(v);
      const subsOnSide = side === "left" || side === "right";

      if (nSub === 0) {
        const node = vNodes[0];
        nodePos.set(node.nodeId, { cx: x + nodeW / 2, cy: yCursor + nodeH / 2 });
        yCursor += nodeH + 40 * scale;
      } else if (v.hasTotal) {
        const total = vNodes[0];
        const cy = yCursor + nodeH / 2 + 6 * scale;
        nodePos.set(total.nodeId, { cx: x + nodeW / 2, cy });
        const inds: Pos[] = [];
        if (subsOnSide) {
          // زیرمقیاس‌ها در سمت چپ/راست، یک ستون عمودی هم‌قد گره
          const subX = side === "left" ? x - subW - 26 * scale : x + nodeW + 26 * scale;
          v.subscales.forEach((_, si) => {
            inds.push({ cx: subX + subW / 2, cy: yCursor + 6 * scale + si * subGap });
          });
          const subBlockH = Math.max(nSub * subGap, nodeH);
          yCursor += Math.max(nodeH + 40 * scale, subBlockH + 30 * scale);
        } else {
          // بالا یا پایین برای ستون وسط
          const subRows = Math.ceil(nSub / 2);
          const rowW = 2 * subW + 10 * scale;
          const place = (baseY: number) =>
            v.subscales.forEach((_, si) => {
              const ci = si % 2;
              const ri = Math.floor(si / 2);
              const sx = x + (nodeW - rowW) / 2 + ci * (subW + 10 * scale);
              inds.push({ cx: sx + subW / 2, cy: baseY + ri * subGap + subH / 2 });
            });
          if (side === "top") {
            const subsTop = yCursor;
            place(subsTop);
            // گره بعد از زیرمقیاس‌ها
            const blockH = subRows * subGap + subH;
            yCursor = subsTop + blockH + nodeH + 20 * scale;
          } else {
            const subsY = yCursor + nodeH + 26 * scale;
            place(subsY);
            yCursor = subsY + subRows * subGap + 10 * scale;
          }
        }
        indicatorPos.set(v.id, inds);
      } else {
        // غیرجمع‌پذیر: هر زیرمقیاس گره مستقل
        const startY = yCursor;
        if (subsOnSide) {
          const subX = side === "left" ? x - subW - 26 * scale : x + nodeW + 26 * scale;
          vNodes.forEach((node, si) => {
            nodePos.set(node.nodeId, { cx: subX + subW / 2, cy: startY + si * subGap + subH / 2 });
          });
          const subBlockH = Math.max(nSub * subGap, subH);
          yCursor = startY + subBlockH + 30 * scale;
        } else {
          const rowW = 2 * subW + 10 * scale;
          const subRows = Math.ceil(nSub / 2);
          const placeNodes = (baseY: number) =>
            vNodes.forEach((node, si) => {
              const ci = si % 2;
              const ri = Math.floor(si / 2);
              const sx = x + (nodeW - rowW) / 2 + ci * (subW + 10 * scale);
              nodePos.set(node.nodeId, { cx: sx + subW / 2, cy: baseY + ri * subGap + subH / 2 });
            });
          if (side === "top") {
            placeNodes(startY);
            const blockH = subRows * subGap + subH;
            yCursor = startY + blockH + 30 * scale;
          } else {
            placeNodes(startY);
            yCursor = startY + subRows * subGap + 10 * scale;
          }
        }
      }
      colH = Math.max(colH, yCursor - 60);
    }
    H = Math.max(H, colH + 90);
    W = Math.max(W, x + nodeW + 40);
  }

  const active = arrows.filter((a) => a.active);
  const betaOf = (from: number, to: number) =>
    results?.paths.find((p) => p.from === from && p.to === to)?.std;
  const r2Of = (id: number) => results?.r2[id];

  return (
    <div dir="ltr" className="w-full overflow-auto">
      <svg
        width={W}
        height={H}
        role="img"
        aria-label="دیاگرام مدل"
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
          <marker id="arrow-sub" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* فلش‌های مدل بین گره‌ها */}
        {active.map((a, i) => {
          const f = nodePos.get(a.fromNode);
          const t = nodePos.get(a.toNode);
          if (!f || !t) return null;
          const x1 = f.cx + nodeW / 2;
          const y1 = f.cy;
          const x2 = t.cx - nodeW / 2;
          const y2 = t.cy;
          const beta = betaOf(a.fromNode, a.toNode);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 - 12 * scale;
          return (
            <g key={i}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#64748b" strokeWidth={1.8} markerEnd="url(#arrow)" />
              {beta != null && Number.isFinite(beta) && (
                <g>
                  <rect x={mx - 24} y={my - 12} width={48} height={19} rx={5} fill="#fff" stroke="#cbd5e1" />
                  <text x={mx} y={my + 1} textAnchor="middle" fontSize={10.5} fontWeight={700} fill="#334155">
                    β={beta.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* گره‌ها */}
        {nodes.map((node) => {
          const pos = nodePos.get(node.nodeId);
          if (!pos) return null;
          const cx = pos.cx;
          const cy = pos.cy;
          const color = roleColors[node.role];
          const r2 = r2Of(node.nodeId);

          if (node.kind === "total") {
            const inds = indicatorPos.get(node.varId) ?? [];
            const v = vars.find((x) => x.id === node.varId);
            return (
              <g key={node.nodeId}>
                <ellipse cx={cx} cy={cy} rx={nodeW / 2} ry={nodeH / 2 + 8 * scale} fill={color.fill} stroke={color.stroke} strokeWidth={1.6} />
                <text x={cx} y={cy - (r2 != null && Number.isFinite(r2) ? 1 : 4)} textAnchor="middle" fontSize={11 * scale} fontWeight={700} fill={color.text}>
                  {truncate(node.label, 24)}
                </text>
                {r2 != null && Number.isFinite(r2) && (
                  <text x={cx} y={cy + 14 * scale} textAnchor="middle" fontSize={10 * scale} fontWeight={700} fill="#475569">
                    R² = {r2.toFixed(2)}
                  </text>
                )}
                {inds.map((sp, si) => (
                  <g key={si}>
                    <line
                      x1={cx}
                      y1={cy + nodeH / 2}
                      x2={sp.cx}
                      y2={sp.cy - subH / 2}
                      stroke="#cbd5e1"
                      strokeWidth={1.1}
                      markerEnd="url(#arrow-sub)"
                    />
                    <rect x={sp.cx - subW / 2} y={sp.cy - subH / 2} width={subW} height={subH} rx={6} fill={subFill} stroke={subStroke} strokeWidth={1} />
                    <text x={sp.cx} y={sp.cy + 3.5} textAnchor="middle" fontSize={9 * scale} fontWeight={600} fill="#475569">
                      {truncate(v?.subscales[si]?.name ?? "", 20)}
                    </text>
                  </g>
                ))}
              </g>
            );
          }

          // مستطیل: زیرمقیاس مستقل یا متغیر تک‌نمره
          return (
            <g key={node.nodeId}>
              <rect x={cx - nodeW / 2} y={cy - nodeH / 2} width={nodeW} height={nodeH} rx={10} fill={color.fill} stroke={color.stroke} strokeWidth={1.6} />
              <text x={cx} y={cy - (r2 != null && Number.isFinite(r2) ? 2 : 5)} textAnchor="middle" fontSize={10.5 * scale} fontWeight={700} fill={color.text}>
                {truncate(node.label, 26)}
              </text>
              {r2 != null && Number.isFinite(r2) && (
                <text x={cx} y={cy + 13 * scale} textAnchor="middle" fontSize={9.5 * scale} fontWeight={700} fill="#475569">
                  R² = {r2.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-[11px] text-stone-400 dark:text-stone-500">
        بیضی = متغیر پنهان (مکنون) جمع‌پذیر با نمره کل · مستطیل = متغیر مشاهده‌شده یا زیرمقیاس مستقل (غیرجمع‌پذیر) ·
        رنگ‌ها: برون‌زا (آبی) / میانجی (نارنجی) / درون‌زا (سبز) · R² زیر نام گره‌ها
      </p>
    </div>
  );
}
