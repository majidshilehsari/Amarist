"use client";

import type { VariableSpec } from "@/lib/sem-generator";
import type { PathRow, Role, SemResults } from "@/lib/sem-stats";

const roleCol: Record<Role, number> = { exogenous: 0, mediator: 1, outcome: 2 };

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
  const nodeH = 56;
  const colGap = 270;
  const subW = 150;
  const subH = 26;
  const subColGap = 12;
  const subRowGap = 30;
  const subCols = 2;

  const ordered = [...vars].sort((a, b) => roleCol[a.role] - roleCol[b.role]);
  const nodes = ordered.map((v, idx) => ({
    id: v.id,
    name: truncate(v.name, 24),
    latent: v.subscales.length > 0,
    x: 30 + idx * colGap,
    y: 60,
    color: roleColors[v.role],
  }));

  const W = 30 + (ordered.length - 1) * colGap + nodeW + 30;
  const maxSubRows = Math.max(
    0,
    ...vars.map((v) => Math.ceil(v.subscales.length / subCols))
  );
  const H = Math.max(60 + nodeH + 40 + maxSubRows * subRowGap + 30, 200);

  const active = paths.filter((p) => p.active);
  const betaOf = (from: number, to: number) =>
    results?.paths.find((p) => p.from === from && p.to === to)?.std;
  const r2Of = (id: number) => results?.r2[id];

  return (
    <div dir="ltr" className="tool-table-wrap overflow-x-auto p-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full min-w-[680px]" role="img" aria-label="دیاگرام مدل">
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
          <marker
            id="arrow-sub"
            viewBox="0 0 10 10"
            refX="9"
            refY="5"
            markerWidth="5"
            markerHeight="5"
            orient="auto-start-reverse"
          >
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
          </marker>
        </defs>

        {/* فلش‌های بین متغیرهای اصلی */}
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
          const my = (y1 + y2) / 2 - 10;
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

        {/* گره‌ها و زیرمقیاس‌ها */}
        {nodes.map((n) => {
          const cx = n.x + nodeW / 2;
          const cy = n.y + nodeH / 2;
          const r2 = r2Of(n.id);
          const subs = vars.find((v) => v.id === n.id)?.subscales ?? [];
          const subRows = Math.ceil(subs.length / subCols);
          return (
            <g key={n.id}>
              {n.latent ? (
                <ellipse cx={cx} cy={cy} rx={nodeW / 2} ry={nodeH / 2 + 8} fill={n.color.fill} stroke={n.color.stroke} strokeWidth={1.6} />
              ) : (
                <rect x={n.x} y={n.y} width={nodeW} height={nodeH} rx={10} fill={n.color.fill} stroke={n.color.stroke} strokeWidth={1.6} />
              )}
              <text x={cx} y={cy - (r2 != null && Number.isFinite(r2) ? 1 : 4)} textAnchor="middle" fontSize={11} fontWeight={700} fill={n.color.text}>
                {n.name}
              </text>
              {r2 != null && Number.isFinite(r2) && (
                <text x={cx} y={cy + 14} textAnchor="middle" fontSize={10} fontWeight={700} fill="#475569">
                  R² = {r2.toFixed(2)}
                </text>
              )}

              {/* زیرمقیاس‌ها در دو ستون */}
              {subs.map((s, si) => {
                const colIdx = si % subCols;
                const rowIdx = Math.floor(si / subCols);
                const sy = n.y + nodeH + 34 + rowIdx * subRowGap;
                const totalRowW = subCols * subW + (subCols - 1) * subColGap;
                const sx = n.x + (nodeW - totalRowW) / 2 + colIdx * (subW + subColGap);
                const startY = n.y + nodeH + (n.latent ? 10 : 0);
                const subCx = sx + subW / 2;
                return (
                  <g key={si}>
                    <line
                      x1={cx}
                      y1={startY}
                      x2={subCx}
                      y2={sy - 2}
                      stroke="#cbd5e1"
                      strokeWidth={1.1}
                      markerEnd="url(#arrow-sub)"
                    />
                    <rect x={sx} y={sy} width={subW} height={subH} rx={6} fill={subFill} stroke={subStroke} strokeWidth={1} />
                    <text x={subCx} y={sy + subH / 2 + 3.5} textAnchor="middle" fontSize={9} fontWeight={600} fill="#475569">
                      {truncate(s.name, 20)}
                    </text>
                  </g>
                );
              })}

              {/* خط اتصال افقی بین ستون‌های زیرمقیاس */}
              {subRows > 1 && (
                <line
                  x1={cx}
                  y1={n.y + nodeH + 10}
                  x2={cx}
                  y2={n.y + nodeH + 34 + (subRows - 1) * subRowGap}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
              )}
            </g>
          );
        })}
      </svg>
      <p className="mt-2 text-center text-[11px] text-stone-400 dark:text-stone-500">
        بیضی = متغیر پنهان (مکنون) · مستطیل = متغیر مشاهده‌شده · رنگ‌ها: برون‌زا (آبی) / میانجی (نارنجی) / درون‌زا (سبز) · R² زیر نام متغیرهای درون‌زا
      </p>
    </div>
  );
}
