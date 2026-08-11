"use client";

import type { VariableSpec } from "@/lib/sem-generator";
import type { PathRow, Role, SemResults } from "@/lib/sem-stats";

const roleCol: Record<Role, number> = { exogenous: 0, mediator: 1, outcome: 2 };

const roleColors: Record<Role, { fill: string; stroke: string; text: string }> = {
  exogenous: { fill: "#eff6ff", stroke: "#2563eb", text: "#1e40af" },
  mediator: { fill: "#fef3c7", stroke: "#d97706", text: "#92400e" },
  outcome: { fill: "#ecfdf5", stroke: "#059669", text: "#065f46" },
};

export default function PathDiagram({
  vars,
  paths,
  results,
}: {
  vars: VariableSpec[];
  paths: PathRow[];
  results?: SemResults | null;
}) {
  const nodeW = 200;
  const nodeH = 46;
  const colGap = 260;

  const nodes = vars.map((v) => {
    const col = roleCol[v.role];
    const idx = vars.filter((x) => x.role === v.role && x.id < v.id).length;
    return {
      id: v.id,
      name: v.name,
      x: 30 + col * colGap,
      y: 40 + idx * 110,
      latent: v.subscales.length > 0,
      color: roleColors[v.role],
    };
  });
  const maxCol = Math.max(
    ...[0, 1, 2].map((c) => vars.filter((v) => roleCol[v.role] === c).length)
  );
  const W = 30 + 2 * colGap + nodeW + 30;
  const H = Math.max(40 + (maxCol - 1) * 110 + nodeH + 40, 160);

  const active = paths.filter((p) => p.active);
  const betaOf = (from: number, to: number) =>
    results?.paths.find((p) => p.from === from && p.to === to)?.std;

  return (
    <div dir="ltr" className="tool-table-wrap overflow-x-auto p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[640px]" role="img" aria-label="دیاگرام مدل">
        <defs>
          <marker
            id="arrow"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
        </defs>

        {active.map((p, i) => {
          const f = nodes.find((n) => n.id === p.from);
          const t = nodes.find((n) => n.id === p.to);
          if (!f || !t) return null;
          const x1 = f.x + nodeW;
          const y1 = f.y + nodeH / 2;
          const x2 = t.x;
          const y2 = t.y + nodeH / 2;
          const beta = betaOf(p.from, p.to);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2 - 8;
          return (
            <g key={i}>
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#64748b"
                strokeWidth={1.8}
                markerEnd="url(#arrow)"
              />
              {beta != null && Number.isFinite(beta) && (
                <g>
                  <rect x={mx - 20} y={my - 11} width={40} height={17} rx={4} fill="#fff" stroke="#cbd5e1" />
                  <text
                    x={mx}
                    y={my + 1}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight={700}
                    fill="#334155"
                  >
                    β={beta.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {nodes.map((n) => {
          const cx = n.x + nodeW / 2;
          const cy = n.y + nodeH / 2;
          return (
            <g key={n.id}>
              {n.latent ? (
                <ellipse
                  cx={cx}
                  cy={cy}
                  rx={nodeW / 2}
                  ry={nodeH / 2 + 6}
                  fill={n.color.fill}
                  stroke={n.color.stroke}
                  strokeWidth={1.6}
                />
              ) : (
                <rect
                  x={n.x}
                  y={n.y}
                  width={nodeW}
                  height={nodeH}
                  rx={10}
                  fill={n.color.fill}
                  stroke={n.color.stroke}
                  strokeWidth={1.6}
                />
              )}
              <text
                x={cx}
                y={cy + 4}
                textAnchor="middle"
                fontSize={11}
                fontWeight={700}
                fill={n.color.text}
              >
                {n.name}
              </text>
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-[11px] text-stone-400">
        بیضی = متغیر پنهان (دارای زیرمقیاس) · مستطیل = متغیر مشاهده‌شده · رنگ‌ها: برون‌زا (آبی) / میانجی (نارنجی) / درون‌زا (سبز)
      </p>
    </div>
  );
}
