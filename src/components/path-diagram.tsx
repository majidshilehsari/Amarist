"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import type { VariableSpec } from "@/lib/sem-generator";
import type { ModelArrow, ModelNode, Role, SemResults } from "@/lib/sem-stats";

const roleColors: Record<Role, { fill: string; stroke: string; text: string }> = {
  exogenous: { fill: "#eff6ff", stroke: "#2563eb", text: "#1e40af" },
  mediator: { fill: "#fffbeb", stroke: "#d97706", text: "#92400e" },
  outcome: { fill: "#ecfdf5", stroke: "#059669", text: "#065f46" },
};

const subFill = "#f8fafc";
const subStroke = "#94a3b8";

export type DiagramPoint = { x: number; y: number };
export type DiagramPositions = Record<string, DiagramPoint>;

type Pos = { cx: number; cy: number; w: number; h: number };
type IndicatorSide = "left" | "right" | "top" | "bottom";
type IndicatorLayout = { key: string; label: string; pos: Pos; side: IndicatorSide; ownerNodeId: number };
type Entity = { variable: VariableSpec; node: ModelNode; indicatorLabels: string[] };
type DragState = {
  key: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  snapshot: DiagramPositions;
};

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function nodeDimensions(node: ModelNode): { w: number; h: number } {
  if (node.kind === "sub") return { w: 190, h: 46 };
  return { w: 210, h: 64 };
}

function boundaryPoint(from: Pos, toward: Pos, ellipse: boolean): { x: number; y: number } {
  const dx = toward.cx - from.cx;
  const dy = toward.cy - from.cy;
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return { x: from.cx, y: from.cy };
  const rx = from.w / 2;
  const ry = from.h / 2;
  const scale = ellipse
    ? 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry))
    : 1 / Math.max(Math.abs(dx) / rx, Math.abs(dy) / ry);
  return { x: from.cx + dx * scale, y: from.cy + dy * scale };
}

function sideConnection(owner: Pos, indicator: Pos, side: IndicatorSide) {
  if (side === "left") {
    return { x1: owner.cx - owner.w / 2, y1: owner.cy, x2: indicator.cx + indicator.w / 2, y2: indicator.cy };
  }
  if (side === "right") {
    return { x1: owner.cx + owner.w / 2, y1: owner.cy, x2: indicator.cx - indicator.w / 2, y2: indicator.cy };
  }
  if (side === "top") {
    return { x1: owner.cx, y1: owner.cy - owner.h / 2, x2: indicator.cx, y2: indicator.cy + indicator.h / 2 };
  }
  return { x1: owner.cx, y1: owner.cy + owner.h / 2, x2: indicator.cx, y2: indicator.cy - indicator.h / 2 };
}

function entitiesForRole(role: Role, vars: VariableSpec[], nodes: ModelNode[]): Entity[] {
  return vars
    .filter((variable) => variable.role === role)
    .flatMap((variable) => {
      const variableNodes = nodes
        .filter((node) => node.varId === variable.id)
        .sort((left, right) => left.nodeId - right.nodeId);
      if (variable.hasTotal && variable.subscales.length) {
        const total = variableNodes.find((node) => node.kind === "total") ?? variableNodes[0];
        return total ? [{ variable, node: total, indicatorLabels: variable.subscales.map((item) => item.name) }] : [];
      }
      return variableNodes.map((node) => ({ variable, node, indicatorLabels: [] }));
    });
}

export default function PathDiagram({
  vars,
  nodes,
  arrows,
  results,
  showCovariances = true,
  editable = false,
  positions = {},
  onPositionsChange,
}: {
  vars: VariableSpec[];
  nodes: ModelNode[];
  arrows: ModelArrow[];
  results?: SemResults | null;
  /** نمایش بصریِ کوواریانس‌هایی که موتور بین همهٔ گره‌های برون‌زا آزاد می‌کند. */
  showCovariances?: boolean;
  /** در حالت ویرایش، گره‌ها و شاخص‌ها با drag یا کلیدهای جهت جابه‌جا می‌شوند. */
  editable?: boolean;
  positions?: DiagramPositions;
  onPositionsChange?: (positions: DiagramPositions) => void;
}) {
  const markerPrefix = useId().replace(/:/g, "");
  const arrowMarkerId = `${markerPrefix}-arrow`;
  const subArrowMarkerId = `${markerPrefix}-arrow-sub`;
  const covarianceMarkerId = `${markerPrefix}-covariance-arrow`;
  const shadowFilterId = `${markerPrefix}-shadow`;
  const gridPatternId = `${markerPrefix}-grid`;
  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [draggingKey, setDraggingKey] = useState<string | null>(null);

  const exogenousEntities = entitiesForRole("exogenous", vars, nodes);
  const mediatorEntities = entitiesForRole("mediator", vars, nodes);
  const outcomeEntities = entitiesForRole("outcome", vars, nodes);
  const indicatorW = 154;
  const indicatorH = 32;
  const indicatorGap = 42;
  const entityGap = 52;

  const sideBlockHeight = (entity: Entity) => {
    const dimensions = nodeDimensions(entity.node);
    return entity.indicatorLabels.length
      ? Math.max(dimensions.h, entity.indicatorLabels.length * indicatorGap - (indicatorGap - indicatorH))
      : dimensions.h;
  };
  const groupHeight = (entities: Entity[]) =>
    entities.reduce((sum, entity) => sum + sideBlockHeight(entity), 0) + Math.max(0, entities.length - 1) * entityGap;
  const maxMediatorOffset = mediatorEntities.length
    ? 190 + Math.floor((mediatorEntities.length - 1) / 2) * 190
    : 0;
  const canvasW = 1580;
  const canvasH = Math.max(
    760,
    groupHeight(exogenousEntities) + 180,
    groupHeight(outcomeEntities) + 180,
    maxMediatorOffset ? 2 * (maxMediatorOffset + 180) : 0
  );
  const centerY = canvasH / 2;
  const exogenousX = 365;
  const mediatorX = 790;
  const outcomeX = 1215;
  const leftIndicatorX = 125;
  const rightIndicatorX = 1455;

  const nodeKeyById = new Map<number, string>();
  vars.forEach((variable) => {
    nodes
      .filter((node) => node.varId === variable.id)
      .sort((left, right) => left.nodeId - right.nodeId)
      .forEach((node, index) => nodeKeyById.set(node.nodeId, `node:${variable.id}:${index}`));
  });

  const nodePos = new Map<number, Pos>();
  const indicatorLayouts: IndicatorLayout[] = [];

  const placeSide = (entities: Entity[], x: number, indicatorX: number, side: "left" | "right") => {
    const totalHeight = groupHeight(entities);
    let cursor = centerY - totalHeight / 2;
    entities.forEach((entity) => {
      const blockHeight = sideBlockHeight(entity);
      const dimensions = nodeDimensions(entity.node);
      const auto = { cx: x, cy: cursor + blockHeight / 2, ...dimensions };
      const key = nodeKeyById.get(entity.node.nodeId) ?? `node:${entity.node.nodeId}`;
      const custom = positions[key];
      nodePos.set(entity.node.nodeId, custom ? { ...auto, cx: custom.x, cy: custom.y } : auto);
      if (entity.indicatorLabels.length) {
        const startY = cursor + (blockHeight - (entity.indicatorLabels.length * indicatorGap - (indicatorGap - indicatorH))) / 2;
        entity.indicatorLabels.forEach((label, index) => {
          const indicatorKey = `indicator:${entity.variable.id}:${index}`;
          const indicatorAuto: Pos = {
            cx: indicatorX,
            cy: startY + index * indicatorGap + indicatorH / 2,
            w: indicatorW,
            h: indicatorH,
          };
          const indicatorCustom = positions[indicatorKey];
          indicatorLayouts.push({
            key: indicatorKey,
            label,
            pos: indicatorCustom ? { ...indicatorAuto, cx: indicatorCustom.x, cy: indicatorCustom.y } : indicatorAuto,
            side,
            ownerNodeId: entity.node.nodeId,
          });
        });
      }
      cursor += blockHeight + entityGap;
    });
  };

  placeSide(exogenousEntities, exogenousX, leftIndicatorX, "left");
  placeSide(outcomeEntities, outcomeX, rightIndicatorX, "right");

  mediatorEntities.forEach((entity, index) => {
    const distance = 190 + Math.floor(index / 2) * 190;
    const above = index % 2 === 0;
    const cy = centerY + (above ? -distance : distance);
    const dimensions = nodeDimensions(entity.node);
    const key = nodeKeyById.get(entity.node.nodeId) ?? `node:${entity.node.nodeId}`;
    const custom = positions[key];
    nodePos.set(entity.node.nodeId, custom ? { cx: custom.x, cy: custom.y, ...dimensions } : { cx: mediatorX, cy, ...dimensions });

    if (entity.indicatorLabels.length) {
      const columns = Math.min(3, entity.indicatorLabels.length);
      const rows = Math.ceil(entity.indicatorLabels.length / columns);
      entity.indicatorLabels.forEach((label, indicatorIndex) => {
        const row = Math.floor(indicatorIndex / columns);
        const column = indicatorIndex % columns;
        const itemsInRow = Math.min(columns, entity.indicatorLabels.length - row * columns);
        const rowWidth = itemsInRow * indicatorW + Math.max(0, itemsInRow - 1) * 12;
        const rowStartX = mediatorX - rowWidth / 2 + indicatorW / 2;
        const rowFromNode = above ? rows - 1 - row : row;
        const indicatorKey = `indicator:${entity.variable.id}:${indicatorIndex}`;
        const indicatorAuto: Pos = {
          cx: rowStartX + column * (indicatorW + 12),
          cy: cy + (above ? -1 : 1) * (dimensions.h / 2 + 28 + rowFromNode * indicatorGap + indicatorH / 2),
          w: indicatorW,
          h: indicatorH,
        };
        const indicatorCustom = positions[indicatorKey];
        indicatorLayouts.push({
          key: indicatorKey,
          label,
          pos: indicatorCustom ? { ...indicatorAuto, cx: indicatorCustom.x, cy: indicatorCustom.y } : indicatorAuto,
          side: above ? "top" : "bottom",
          ownerNodeId: entity.node.nodeId,
        });
      });
    }
  });

  const active = arrows.filter((arrow) => arrow.active);
  const exogenousNodes = nodes.filter((node) => node.role === "exogenous" && nodePos.has(node.nodeId));
  const covariancePairs: { left: ModelNode; right: ModelNode; index: number }[] = [];
  for (let i = 0; i < exogenousNodes.length; i++) {
    for (let j = i + 1; j < exogenousNodes.length; j++) {
      covariancePairs.push({ left: exogenousNodes[i], right: exogenousNodes[j], index: covariancePairs.length });
    }
  }

  const betaOf = (from: number, to: number) =>
    results?.paths.find((path) => path.from === from && path.to === to)?.std;
  const r2Of = (id: number) => results?.r2[id];
  const correlationOf = (leftNode: number, rightNode: number) =>
    results?.exogenousCorrelations?.find(
      (item) =>
        (item.leftNode === leftNode && item.rightNode === rightNode) ||
        (item.leftNode === rightNode && item.rightNode === leftNode)
    )?.r;

  const svgPoint = (event: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: event.clientX, y: event.clientY };
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
  };

  const startDrag = (event: PointerEvent<SVGGElement>, key: string, pos: Pos) => {
    if (!editable || !onPositionsChange || !svgRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    const matrix = svgRef.current.getScreenCTM();
    const point = matrix
      ? new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
      : { x: event.clientX, y: event.clientY };
    dragRef.current = {
      key,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originX: pos.cx,
      originY: pos.cy,
      width: pos.w,
      height: pos.h,
      snapshot: positions,
    };
    svgRef.current.setPointerCapture(event.pointerId);
    setDraggingKey(key);
  };

  const moveWithKeyboard = (event: KeyboardEvent<SVGGElement>, key: string, pos: Pos) => {
    if (!editable || !onPositionsChange) return;
    const step = event.shiftKey ? 24 : 8;
    const delta =
      event.key === "ArrowLeft" ? { x: -step, y: 0 } :
      event.key === "ArrowRight" ? { x: step, y: 0 } :
      event.key === "ArrowUp" ? { x: 0, y: -step } :
      event.key === "ArrowDown" ? { x: 0, y: step } : null;
    if (!delta) return;
    event.preventDefault();
    onPositionsChange({
      ...positions,
      [key]: {
        x: Math.max(pos.w / 2 + 20, Math.min(canvasW - pos.w / 2 - 20, pos.cx + delta.x)),
        y: Math.max(pos.h / 2 + 20, Math.min(canvasH - pos.h / 2 - 20, pos.cy + delta.y)),
      },
    });
  };

  const handlePointerMove = (event: PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || !onPositionsChange) return;
    event.preventDefault();
    const point = svgPoint(event);
    const x = Math.max(drag.width / 2 + 20, Math.min(canvasW - drag.width / 2 - 20, drag.originX + point.x - drag.startX));
    const y = Math.max(drag.height / 2 + 20, Math.min(canvasH - drag.height / 2 - 20, drag.originY + point.y - drag.startY));
    onPositionsChange({ ...drag.snapshot, [drag.key]: { x, y } });
  };

  const finishDrag = (event: PointerEvent<SVGSVGElement>) => {
    if (!dragRef.current) return;
    if (svgRef.current?.hasPointerCapture(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    setDraggingKey(null);
  };

  return (
    <div dir="ltr" className="w-full overflow-auto rounded-xl bg-white dark:bg-slate-900">
      {editable && (
        <div dir="rtl" className="sticky left-0 top-0 z-10 border-b border-indigo-100 bg-indigo-50/95 px-3 py-2 text-center text-[11px] font-bold text-indigo-700 backdrop-blur dark:border-indigo-900 dark:bg-indigo-950/90 dark:text-indigo-200">
          هر گره یا زیرمقیاس را بکشید؛ برای تنظیم دقیق‌تر، آن را انتخاب و از کلیدهای جهت استفاده کنید (Shift = حرکت سریع).
        </div>
      )}
      <svg
        ref={svgRef}
        width={canvasW}
        height={canvasH}
        viewBox={`0 0 ${canvasW} ${canvasH}`}
        role="img"
        aria-label="دیاگرام مدل معادلات ساختاری"
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        style={{
          display: "block",
          width: "100%",
          minWidth: editable ? 1200 : 1060,
          height: "auto",
          touchAction: editable ? "none" : "auto",
          userSelect: "none",
        }}
      >
        <defs>
          <marker id={arrowMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
          </marker>
          <marker id={subArrowMarkerId} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#64748b" />
          </marker>
          <marker id={covarianceMarkerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#7c3aed" />
          </marker>
          <filter id={shadowFilterId} x="-20%" y="-30%" width="140%" height="160%">
            <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.12" />
          </filter>
          <pattern id={gridPatternId} width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#c7d2fe" opacity="0.7" />
          </pattern>
        </defs>

        <rect x={0} y={0} width={canvasW} height={canvasH} fill={editable ? `url(#${gridPatternId})` : "transparent"} />
        {editable && (
          <line x1={235} y1={centerY} x2={1325} y2={centerY} stroke="#cbd5e1" strokeWidth={1} strokeDasharray="5 8" />
        )}

        {/* کوواریانس‌های آزاد؛ در سمت راستِ ستون برون‌زا تا با زیرمقیاس‌های سمت چپ تداخل نکنند. */}
        {showCovariances && covariancePairs.map(({ left, right, index }) => {
          const from = nodePos.get(left.nodeId);
          const to = nodePos.get(right.nodeId);
          if (!from || !to) return null;
          const mostlyVertical = Math.abs(from.cy - to.cy) >= Math.abs(from.cx - to.cx) * 0.65;
          const x1 = mostlyVertical ? from.cx + from.w / 2 : from.cx;
          const y1 = mostlyVertical ? from.cy : from.cy - from.h / 2;
          const x2 = mostlyVertical ? to.cx + to.w / 2 : to.cx;
          const y2 = mostlyVertical ? to.cy : to.cy - to.h / 2;
          const controlX = mostlyVertical ? Math.max(x1, x2) + 62 + index * 16 : (x1 + x2) / 2;
          const controlY = mostlyVertical ? (y1 + y2) / 2 : Math.min(y1, y2) - 54 - index * 14;
          const labelX = (x1 + 2 * controlX + x2) / 4;
          const labelY = (y1 + 2 * controlY + y2) / 4;
          const correlation = correlationOf(left.nodeId, right.nodeId);
          return (
            <g key={`cov-${left.nodeId}-${right.nodeId}`}>
              <path
                d={`M ${x1} ${y1} Q ${controlX} ${controlY} ${x2} ${y2}`}
                fill="none"
                stroke="#7c3aed"
                strokeWidth={2}
                markerStart={`url(#${covarianceMarkerId})`}
                markerEnd={`url(#${covarianceMarkerId})`}
              />
              <rect x={labelX - 29} y={labelY - 12} width={58} height={22} rx={7} fill="#f5f3ff" stroke="#c4b5fd" />
              <text x={labelX} y={labelY + 3} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#6d28d9">
                {correlation != null && Number.isFinite(correlation) ? `r=${correlation.toFixed(2)}` : "cov"}
              </text>
            </g>
          );
        })}

        {/* مسیرهای ساختاری: اثر مستقیم X→Y همیشه مستقیم است و میانجی‌ها بیرون از محور میانی قرار دارند. */}
        {active.map((arrow, index) => {
          const from = nodePos.get(arrow.fromNode);
          const to = nodePos.get(arrow.toNode);
          if (!from || !to) return null;
          const fromNode = nodes.find((node) => node.nodeId === arrow.fromNode);
          const toNode = nodes.find((node) => node.nodeId === arrow.toNode);
          if (!fromNode || !toNode) return null;
          const start = boundaryPoint(from, to, fromNode.kind === "total");
          const end = boundaryPoint(to, from, toNode.kind === "total");
          const directToOutcome = fromNode.role === "exogenous" && toNode.role === "outcome";
          const beta = betaOf(arrow.fromNode, arrow.toNode);
          const mx = (start.x + end.x) / 2;
          const my = (start.y + end.y) / 2 - 16 - (directToOutcome ? index % 2 * 4 : 0);
          return (
            <g key={arrow.id || index}>
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={directToOutcome ? "#334155" : "#64748b"}
                strokeWidth={directToOutcome ? 2.35 : 2}
                markerEnd={`url(#${arrowMarkerId})`}
              />
              {beta != null && Number.isFinite(beta) && (
                <g>
                  <rect x={mx - 27} y={my - 12} width={54} height={21} rx={6} fill="#ffffff" stroke="#cbd5e1" />
                  <text x={mx} y={my + 2} textAnchor="middle" fontSize={10.5} fontWeight={800} fill="#334155">
                    β={beta.toFixed(2)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* پیکان‌های مدل اندازه‌گیری */}
        {indicatorLayouts.map((indicator) => {
          const owner = nodePos.get(indicator.ownerNodeId);
          if (!owner) return null;
          const edge = sideConnection(owner, indicator.pos, indicator.side);
          return (
            <line
              key={`edge-${indicator.key}`}
              {...edge}
              stroke="#94a3b8"
              strokeWidth={1.7}
              markerEnd={`url(#${subArrowMarkerId})`}
            />
          );
        })}

        {/* گره‌های ساختاری */}
        {nodes.map((node) => {
          const pos = nodePos.get(node.nodeId);
          if (!pos) return null;
          const key = nodeKeyById.get(node.nodeId) ?? `node:${node.nodeId}`;
          const color = roleColors[node.role];
          const r2 = r2Of(node.nodeId);
          const dragging = draggingKey === key;
          return (
            <g
              key={node.nodeId}
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              aria-label={editable ? `جابه‌جایی ${node.label}` : undefined}
              onPointerDown={(event) => startDrag(event, key, pos)}
              onKeyDown={(event) => moveWithKeyboard(event, key, pos)}
              style={{ cursor: editable ? (dragging ? "grabbing" : "grab") : "default", outline: "none" }}
            >
              <title>{node.label}</title>
              {node.kind === "total" ? (
                <ellipse
                  cx={pos.cx}
                  cy={pos.cy}
                  rx={pos.w / 2}
                  ry={pos.h / 2}
                  fill={color.fill}
                  stroke={dragging ? "#4f46e5" : color.stroke}
                  strokeWidth={dragging ? 3 : 1.8}
                  filter={`url(#${shadowFilterId})`}
                />
              ) : (
                <rect
                  x={pos.cx - pos.w / 2}
                  y={pos.cy - pos.h / 2}
                  width={pos.w}
                  height={pos.h}
                  rx={11}
                  fill={color.fill}
                  stroke={dragging ? "#4f46e5" : color.stroke}
                  strokeWidth={dragging ? 3 : 1.8}
                  filter={`url(#${shadowFilterId})`}
                />
              )}
              <text
                x={pos.cx}
                y={pos.cy - (r2 != null && Number.isFinite(r2) ? 3 : 0)}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={node.kind === "sub" ? 10.5 : 11.5}
                fontWeight={800}
                fill={color.text}
                pointerEvents="none"
              >
                {truncate(node.label, node.kind === "sub" ? 27 : 29)}
              </text>
              {r2 != null && Number.isFinite(r2) && (
                <text x={pos.cx} y={pos.cy + 17} textAnchor="middle" fontSize={10} fontWeight={800} fill="#475569" pointerEvents="none">
                  R² = {r2.toFixed(2)}
                </text>
              )}
            </g>
          );
        })}

        {/* شاخص‌ها / زیرمقیاس‌های نمایشی */}
        {indicatorLayouts.map((indicator) => {
          const dragging = draggingKey === indicator.key;
          return (
            <g
              key={indicator.key}
              role={editable ? "button" : undefined}
              tabIndex={editable ? 0 : undefined}
              aria-label={editable ? `جابه‌جایی زیرمقیاس ${indicator.label}` : undefined}
              onPointerDown={(event) => startDrag(event, indicator.key, indicator.pos)}
              onKeyDown={(event) => moveWithKeyboard(event, indicator.key, indicator.pos)}
              style={{ cursor: editable ? (dragging ? "grabbing" : "grab") : "default", outline: "none" }}
            >
              <title>{indicator.label}</title>
              <rect
                x={indicator.pos.cx - indicator.pos.w / 2}
                y={indicator.pos.cy - indicator.pos.h / 2}
                width={indicator.pos.w}
                height={indicator.pos.h}
                rx={7}
                fill={subFill}
                stroke={dragging ? "#4f46e5" : subStroke}
                strokeWidth={dragging ? 2.5 : 1.2}
                filter={`url(#${shadowFilterId})`}
              />
              <text x={indicator.pos.cx} y={indicator.pos.cy + 3.5} textAnchor="middle" fontSize={9.2} fontWeight={650} fill="#475569" pointerEvents="none">
                {truncate(indicator.label, 24)}
              </text>
            </g>
          );
        })}
      </svg>
      <p dir="rtl" className="border-t border-stone-100 px-3 py-2 text-center text-[11px] leading-6 text-stone-400 dark:border-stone-800 dark:text-stone-500">
        چیدمان استاندارد: پیش‌بین‌ها در چپ، پیامدها در راست، میانجی‌ها بیرون از محور اثر مستقیم ·
        بیضی = متغیر پنهان جمع‌پذیر · مستطیل = متغیر مشاهده‌شده/زیرمقیاس مستقل ·
        آبی = برون‌زا / نارنجی = میانجی / سبز = درون‌زا
        {showCovariances && covariancePairs.length > 0 ? " · فلش دوطرفهٔ بنفش = کوواریانس آزاد" : ""}
      </p>
    </div>
  );
}
