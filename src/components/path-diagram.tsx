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

type Pos = { cx: number; cy: number; w: number; h: number };
type Side = "left" | "right" | "top" | "bottom";

export default function PathDiagram({
  vars,
  nodes,
  arrows,
  results,
}: {
  vars: VariableSpec[];
  nodes: ModelNode[];
  arrows: ModelArrow[];
  results?: SemResults | null;
}) {
  const nodeW = 190;
  const nodeH = 54;
  const colGap = 280;
  const subW = 150;
  const subH = 26;
  const subGap = 36;

  const varsByRole: VariableSpec[][] = [
    vars.filter((v) => v.role === "exogenous"),
    vars.filter((v) => v.role === "mediator"),
    vars.filter((v) => v.role === "outcome"),
  ];

  // سمت زیرمقیاس‌ها: ستون چپ ← چپ، ستون راست ← راست، ستون وسط ← بالا/پایین
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

  const allBoxes: { x: number; y: number; w: number; h: number }[] = [];

  for (let col = 0; col < 3; col++) {
    const colVars = varsByRole[col];
    if (!colVars.length) continue;
    const x = 40 + col * colGap;
    let yCursor = 60;
    for (const v of colVars) {
      const vNodes = nodes.filter((n) => n.varId === v.id);
      const nSub = v.subscales.length;
      const side = sideOf(v);
      const subsOnSide = side === "left" || side === "right";

      if (nSub === 0) {
        const node = vNodes[0];
        const cy = yCursor + nodeH / 2;
        nodePos.set(node.nodeId, { cx: x + nodeW / 2, cy, w: nodeW, h: nodeH });
        allBoxes.push({ x, y: yCursor, w: nodeW, h: nodeH });
        yCursor += nodeH + 40;
      } else if (v.hasTotal) {
        // متغیر جمع‌پذیر: بیضی (کل) + زیرمقیاس‌های نمایشی
        const total = vNodes[0];
        const cy = yCursor + nodeH / 2 + 6;
        nodePos.set(total.nodeId, { cx: x + nodeW / 2, cy, w: nodeW, h: nodeH });
        allBoxes.push({ x, y: yCursor, w: nodeW, h: nodeH + 12 });
        const inds: Pos[] = [];
        if (subsOnSide) {
          const subX = side === "left" ? x - subW - 24 : x + nodeW + 24;
          v.subscales.forEach((_, si) => {
            const cy2 = yCursor + 6 + si * subGap + subH / 2;
            inds.push({ cx: subX + subW / 2, cy: cy2, w: subW, h: subH });
            allBoxes.push({ x: subX, y: cy2 - subH / 2, w: subW, h: subH });
          });
          const subBlockH = Math.max(nSub * subGap, nodeH);
          yCursor += Math.max(nodeH + 40, subBlockH + 30);
        } else {
          const subRows = Math.ceil(nSub / 2);
          const rowW = 2 * subW + 10;
          const place = (baseY: number) =>
            v.subscales.forEach((_, si) => {
              const ci = si % 2;
              const ri = Math.floor(si / 2);
              const sx = x + (nodeW - rowW) / 2 + ci * (subW + 10);
              const sy = baseY + ri * subGap;
              inds.push({ cx: sx + subW / 2, cy: sy + subH / 2, w: subW, h: subH });
              allBoxes.push({ x: sx, y: sy, w: subW, h: subH });
            });
          if (side === "top") {
            const subsTop = yCursor;
            place(subsTop);
            yCursor = subsTop + subRows * subGap + subH + nodeH + 20;
          } else {
            const subsY = yCursor + nodeH + 26;
            place(subsY);
            yCursor = subsY + subRows * subGap + 10;
          }
        }
        indicatorPos.set(v.id, inds);
      } else {
        // غیرجمع‌پذیر: هر زیرمقیاس گره مستقل
        const startY = yCursor;
        const subRows = Math.ceil(nSub / 2);
        if (subsOnSide) {
          const subX = side === "left" ? x - subW - 24 : x + nodeW + 24;
          vNodes.forEach((node, si) => {
            const cy2 = startY + si * subGap + subH / 2;
            nodePos.set(node.nodeId, { cx: subX + subW / 2, cy: cy2, w: subW, h: subH });
            allBoxes.push({ x: subX, y: cy2 - subH / 2, w: subW, h: subH });
          });
          yCursor = startY + Math.max(nSub * subGap, subH) + 30;
        } else {
          const rowW = 2 * subW + 10;
          const place = (baseY: number) =>
            vNodes.forEach((node, si) => {
              const ci = si % 2;
              const ri = Math.floor(si / 2);
              const sx = x + (nodeW - rowW) / 2 + ci * (subW + 10);
              const sy = baseY + ri * subGap;
              nodePos.set(node.nodeId, { cx: sx + subW / 2, cy: sy + subH / 2, w: subW, h: subH });
              allBoxes.push({ x: sx, y: sy, w: subW, h: subH });
            });
          if (side === "top") {
            place(startY);
            yCursor = startY + subRows * subGap + subH + 30;
          } else {
            place(startY);
            yCursor = startY + subRows * subGap + 10;
          }
        }
      }
    }
  }

  // ---------- bounding box واقعی همه عناصر ----------
  const pad = 30;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  allBoxes.forEach((b) => {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  });
  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 400;
    maxY = 300;
  }
  const W = maxX - minX + pad * 2;
  const H = maxY - minY + pad * 2;
  const offX = pad - minX;
  const offY = pad - minY;

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
        style={{ display: "block" }}
      >
        <g transform={`translate(${offX}, ${offY})`}>
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
            <marker id="arrow-sub" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
            </marker>
          </defs>

          {/* فلش‌های مدل بین گره‌ها */}
          {active.map((a, i) => {
            const f = nodePos.get(a.fromNode);
            const t = nodePos.get(a.toNode);
            if (!f || !t) return null;
            const x1 = f.cx + f.w / 2;
            const y1 = f.cy;
            const x2 = t.cx - t.w / 2;
            const y2 = t.cy;
            const beta = betaOf(a.fromNode, a.toNode);
            const mx = (x1 + x2) / 2;
            const my = (y1 + y2) / 2 - 12;
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
                  <ellipse cx={cx} cy={cy} rx={nodeW / 2} ry={nodeH / 2 + 8} fill={color.fill} stroke={color.stroke} strokeWidth={1.6} />
                  <text x={cx} y={cy - (r2 != null && Number.isFinite(r2) ? 1 : 4)} textAnchor="middle" fontSize={11} fontWeight={700} fill={color.text}>
                    {truncate(node.label, 24)}
                  </text>
                  {r2 != null && Number.isFinite(r2) && (
                    <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#475569">
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
                        stroke="#64748b"
                        strokeWidth={1.7}
                        markerEnd="url(#arrow-sub)"
                      />
                      <rect x={sp.cx - subW / 2} y={sp.cy - subH / 2} width={subW} height={subH} rx={6} fill={subFill} stroke={subStroke} strokeWidth={1} />
                      <text x={sp.cx} y={sp.cy + 3.5} textAnchor="middle" fontSize={9} fontWeight={600} fill="#475569">
                        {truncate(v?.subscales[si]?.name ?? "", 20)}
                      </text>
                    </g>
                  ))}
                </g>
              );
            }

            // مستطیل: زیرمقیاس مستقل یا متغیر تک‌نمره
            const w = pos.w;
            const h = pos.h;
            return (
              <g key={node.nodeId}>
                <rect x={cx - w / 2} y={cy - h / 2} width={w} height={h} rx={h > nodeH ? 8 : 10} fill={color.fill} stroke={color.stroke} strokeWidth={1.6} />
                <text x={cx} y={cy - (r2 != null && Number.isFinite(r2) ? 2 : 5)} textAnchor="middle" fontSize={10.5} fontWeight={700} fill={color.text}>
                  {truncate(node.label, 26)}
                </text>
                {r2 != null && Number.isFinite(r2) && (
                  <text x={cx} y={cy + 13} textAnchor="middle" fontSize={9.5} fontWeight={700} fill="#475569">
                    R² = {r2.toFixed(2)}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>
      <p className="mt-2 text-center text-[11px] text-stone-400 dark:text-stone-500">
        بیضی = متغیر پنهان (مکنون) جمع‌پذیر با نمره کل · مستطیل = متغیر مشاهده‌شده یا زیرمقیاس مستقل (غیرجمع‌پذیر) ·
        رنگ‌ها: برون‌زا (آبی) / میانجی (نارنجی) / درون‌زا (سبز) · R² زیر نام گره‌ها
      </p>
    </div>
  );
}
