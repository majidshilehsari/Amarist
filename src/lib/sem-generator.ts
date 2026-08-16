// ============================================================
// موتور تولید داده تمرینی برای مدل معادلات ساختاری (SEM) و تحلیل مسیر — آماریست
// مدل گره‌ای: متغیر جمع‌پذیر (نمره کل) یا غیرجمع‌پذیر (زیرمقیاس‌های مستقل)
// ============================================================

import { clamp, randomNormal } from "./statistics";
import {
  estimateSem,
  bootstrapIndirectEffects,
  correlationMatrixWithP,
  kurtosis,
  skewness,
  type ModelArrow,
  type ModelNode,
  type Role,
  type SemMeasurementColumns,
  type SemResults,
} from "./sem-stats";

/** هر زیرمقیاس می‌تواند دامنه نمره مستقل خودش را داشته باشد */
export type SubscaleSpec = { name: string; min: number; max: number };

export type VariableSpec = {
  id: number;
  name: string;
  role: Role;
  /** جمع‌پذیر بودن: آیا نمره کل دارد؟ */
  hasTotal: boolean;
  totalMin: number;
  totalMax: number;
  subscales: SubscaleSpec[];
};

export type PathTarget = {
  sig: "sig" | "ns" | "any";
  betaMin: number | null;
  betaMax: number | null;
};

export type IndirectTarget = "sig" | "ns" | "any";
export type IndirectConstraint = {
  significance: IndirectTarget;
  min: number | null;
  max: number | null;
};

export function defaultIndirectConstraint(): IndirectConstraint {
  return { significance: "sig", min: 0.1, max: 0.3 };
}

function resolveIndirectConstraint(value: IndirectConstraint | IndirectTarget | undefined): IndirectConstraint {
  if (typeof value === "string") return { ...defaultIndirectConstraint(), significance: value };
  return { ...defaultIndirectConstraint(), ...(value ?? {}) };
}

export type FitRange = { min: number | null; max: number | null };

export type SemFitConstraints = {
  chi2: FitRange;
  df: FitRange;
  pValue: FitRange;
  cminDf: FitRange;
  rmsea: FitRange;
  rmseaCiHigh: FitRange;
  pnfi: FitRange;
  cfi: FitRange;
  pcfi: FitRange;
  ifi: FitRange;
  gfi: FitRange;
  srmr: FitRange;
};

export function defaultSemFitConstraints(): SemFitConstraints {
  return {
    chi2: { min: null, max: null },
    df: { min: null, max: null },
    pValue: { min: 0.05, max: 0.5 },
    cminDf: { min: 1, max: 3 },
    rmsea: { min: 0.03, max: 0.08 },
    rmseaCiHigh: { min: null, max: 0.1 },
    pnfi: { min: 0.5, max: 0.95 },
    cfi: { min: 0.9, max: 0.99 },
    pcfi: { min: 0.5, max: 0.95 },
    ifi: { min: 0.9, max: 0.99 },
    gfi: { min: 0.9, max: 0.99 },
    srmr: { min: 0.02, max: 0.08 },
  };
}

function resolveSemFitConstraints(constraints: GenConstraints): SemFitConstraints {
  const defaults = defaultSemFitConstraints();
  const legacy = constraints as GenConstraints & {
    cfiMin?: number;
    rmseaMax?: number;
    chi2dfMax?: number;
    srmrMax?: number;
  };
  const fit = Object.fromEntries(
    (Object.keys(defaults) as (keyof SemFitConstraints)[]).map((key) => [
      key,
      { ...defaults[key], ...(constraints.fit?.[key] ?? {}) },
    ])
  ) as SemFitConstraints;
  if (!constraints.fit) {
    if (legacy.cfiMin != null) fit.cfi.min = legacy.cfiMin;
    if (legacy.rmseaMax != null) fit.rmsea.max = legacy.rmseaMax;
    if (legacy.chi2dfMax != null) fit.cminDf.max = legacy.chi2dfMax;
    if (legacy.srmrMax != null) fit.srmr.max = legacy.srmrMax;
  }
  return fit;
}

export type GenConstraints = {
  /** قید مسیرها به شکل «varFrom:varTo» */
  pathTargets: Record<string, PathTarget>;
  /** قید اثر غیرمستقیم: «from:to» (کل) و «from:med:to» (هر مسیر میانجی) */
  indirectTargets: Record<string, IndirectConstraint>;
  r2Range: { min: number; max: number } | null;
  fit: SemFitConstraints;
  missingPct: number;
  outlierPct: number;
  enforceNormality: boolean;
  enforceLinearity: boolean;
  enforceVif: boolean;
  enforceDw: boolean;
  bootSamples: number;
};

export type SemGenInput = {
  n: number;
  variables: VariableSpec[];
  arrows: ModelArrow[];
  constraints: GenConstraints;
};

export type SemAnswerKey = {
  pathTargets: { fromNode: number; toNode: number; target: number; actual: number }[];
  fit: SemResults["fit"];
  attempts: number;
  r2Range: { min: number; max: number } | null;
};

export type SemGenOutput = {
  columns: string[];
  rows: (number | null)[][];
  nodes: ModelNode[];
  nodeCols: number[][];
  answerKey: SemAnswerKey;
};

// ---------- ساخت گره‌ها و فلش‌ها ----------

export function buildModelNodes(vars: VariableSpec[]): ModelNode[] {
  const nodes: ModelNode[] = [];
  let nid = 0;
  for (const v of vars) {
    if (v.subscales.length === 0) {
      nodes.push({ nodeId: nid++, varId: v.id, label: v.name, kind: "single", role: v.role });
    } else if (v.hasTotal) {
      nodes.push({ nodeId: nid++, varId: v.id, label: `${v.name} (کل)`, kind: "total", role: v.role });
    } else {
      for (const s of v.subscales) {
        nodes.push({ nodeId: nid++, varId: v.id, label: `${v.name} — ${s.name}`, kind: "sub", role: v.role });
      }
    }
  }
  return nodes;
}

export function buildModelArrows(nodes: ModelNode[]): ModelArrow[] {
  const exogIds = [...new Set(nodes.filter((n) => n.role === "exogenous").map((n) => n.varId))];
  const medIds = [...new Set(nodes.filter((n) => n.role === "mediator").map((n) => n.varId))];
  const outIds = [...new Set(nodes.filter((n) => n.role === "outcome").map((n) => n.varId))];
  const pairs: [number, number][] = [];
  exogIds.forEach((e) => medIds.forEach((m) => pairs.push([e, m])));
  exogIds.forEach((e) => outIds.forEach((o) => pairs.push([e, o])));
  medIds.forEach((m) => outIds.forEach((o) => pairs.push([m, o])));
  const arrows: ModelArrow[] = [];
  let aid = 0;
  for (const [fv, tv] of pairs) {
    const fromNodes = nodes.filter((n) => n.varId === fv);
    const toNodes = nodes.filter((n) => n.varId === tv);
    for (const f of fromNodes) {
      for (const t of toNodes) {
        arrows.push({
          id: `a${aid++}`,
          fromNode: f.nodeId,
          toNode: t.nodeId,
          fromVar: fv,
          toVar: tv,
          active: true,
        });
      }
    }
  }
  return arrows;
}

// ---------- ابزارهای داخلی ----------

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

type Scale = { mn: number; mx: number; mean: number; sd: number };

function scaleOf(v: VariableSpec, s?: { min: number; max: number }): Scale {
  const mn = s ? s.min : v.totalMin;
  const mx = s ? s.max : v.totalMax;
  return { mn, mx, mean: (mn + mx) / 2, sd: Math.max(0.6, (mx - mn) / 5) };
}

function toScale(sc: Scale, z: number): number {
  return Math.round(clamp(sc.mean + z * sc.sd, sc.mn, sc.mx));
}

export function generateSemData(input: SemGenInput): SemGenOutput {
  const { variables, arrows, n, constraints } = input;
  const fitTargets = resolveSemFitConstraints(constraints);
  const nodes = buildModelNodes(variables);
  const activeArrows = arrows.filter((a) => a.active);
  const exogVars = variables.filter((v) => v.role === "exogenous");
  const medVars = variables.filter((v) => v.role === "mediator");
  const outVars = variables.filter((v) => v.role === "outcome");

  if (!exogVars.length || !outVars.length) {
    throw new Error("حداقل یک متغیر برون‌زا و یک متغیر درون‌زا لازم است.");
  }
  for (const [key, range] of Object.entries(fitTargets)) {
    if (range.min != null && range.max != null && range.min > range.max) {
      throw new Error(`در قید برازش «${key}»، حداقل نباید از حداکثر بزرگ‌تر باشد.`);
    }
  }
  const indirectConstraintKeys: string[] = [];
  for (const exogenous of exogVars) {
    for (const outcome of outVars) {
      const mediators = medVars.filter(
        (mediator) =>
          activeArrows.some((arrow) => arrow.fromVar === exogenous.id && arrow.toVar === mediator.id) &&
          activeArrows.some((arrow) => arrow.fromVar === mediator.id && arrow.toVar === outcome.id)
      );
      mediators.forEach((mediator) => indirectConstraintKeys.push(`${exogenous.id}:${mediator.id}:${outcome.id}`));
      if (mediators.length > 1) indirectConstraintKeys.push(`${exogenous.id}:${outcome.id}`);
    }
  }
  for (const key of indirectConstraintKeys) {
    const target = resolveIndirectConstraint(constraints.indirectTargets[key]);
    if (target.min != null && target.max != null && target.min > target.max) {
      throw new Error(`در قید اثر غیرمستقیم «${key}»، حداقل نباید از حداکثر بزرگ‌تر باشد.`);
    }
  }

  const maxAttempts = 6000;

  type Attempt = {
    score: number;
    columns: string[];
    rows: (number | null)[][];
    nodeCols: number[][];
    sem: SemResults;
    boot: ReturnType<typeof bootstrapIndirectEffects>;
    pathTargets: { fromNode: number; toNode: number; target: number; actual: number }[];
  };
  let best: Attempt | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // ---------- ۱) ضرایب هدف هر فلش (از قید سطح متغیر) ----------
    const arrowTarget = new Map<string, number>(); // arrowId → beta هدف
    for (const a of activeArrows) {
      const key = `${a.fromVar}:${a.toVar}`;
      const t = constraints.pathTargets[key] ?? { sig: "sig", betaMin: null, betaMax: null };
      let val: number;
      if (t.sig === "ns") val = rand(-0.12, 0.12);
      else if (t.sig === "sig") {
        val = rand(0.25, 0.5);
        if (t.betaMin != null) val = Math.max(val, t.betaMin);
        if (t.betaMax != null) val = Math.min(val, t.betaMax);
      } else val = Math.random() < 0.5 ? rand(-0.15, 0.45) : rand(0.1, 0.4);
      arrowTarget.set(a.id, val);
    }

    // ---------- ۲) نمرات نهفته هر گره ----------
    const L: Record<number, number[]> = {};
    for (const v of exogVars) {
      for (const node of nodes.filter((x) => x.varId === v.id)) {
        L[node.nodeId] = Array.from({ length: n }, () => randomNormal(Math.random));
      }
    }

    let bad = false;
    const order = [...medVars, ...outVars];
    for (const v of order) {
      const vNodes = nodes.filter((x) => x.varId === v.id);
      for (const node of vNodes) {
        const preds = activeArrows.filter((a) => a.toNode === node.nodeId);
        const lin = Array(n).fill(0);
        let varLin = 0;
        for (const a of preds) {
          const b = arrowTarget.get(a.id) ?? 0;
          const x = L[a.fromNode];
          for (let i = 0; i < n; i++) lin[i] += b * x[i];
          varLin += b * b;
        }
        if (varLin > 0.9) {
          bad = true;
          break;
        }
        const sdE = Math.sqrt(1 - varLin);
        L[node.nodeId] = lin.map((x) => x + sdE * randomNormal(Math.random));
      }
      if (bad) break;
    }
    if (bad) continue;

    // ---------- ۳) ستون‌های مشاهده‌شده ----------
    const columns: string[] = [];
    const rows: (number | null)[][] = Array.from({ length: n }, () => []);
    const colScales: Scale[] = [];
    const nodeColsRaw: Record<number, number[]> = {};

    for (const v of variables) {
      const vNodes = nodes.filter((x) => x.varId === v.id);
      const latentFor = (node: ModelNode) => L[node.nodeId];
      if (v.subscales.length) {
        const subCols: number[][] = [];
        for (const s of v.subscales) {
          const sc = scaleOf(v, s);
          const lam = rand(0.6, 0.85);
          // برای جمع‌پذیر، بار از نهفته کل؛ برای غیرجمع‌پذیر، بار از نهفته همان گره
          const latent = v.hasTotal ? latentFor(vNodes[0]) : latentFor(vNodes[v.subscales.indexOf(s)]);
          const col = Array.from({ length: n }, (_, i) =>
            toScale(sc, lam * latent[i] + Math.sqrt(1 - lam * lam) * randomNormal(Math.random))
          );
          subCols.push(col);
          columns.push(`${v.name} — ${s.name}`);
          colScales.push(sc);
        }
        if (v.hasTotal) {
          // گره «کل» = مجموع زیرمقیاس‌ها
          const totalCol = Array.from({ length: n }, (_, i) =>
            subCols.reduce((s, c) => s + c[i], 0)
          );
          nodeColsRaw[vNodes[0].nodeId] = totalCol;
        } else {
          subCols.forEach((c, si) => {
            nodeColsRaw[vNodes[si].nodeId] = c;
          });
        }
        subCols.forEach((c) => rows.forEach((r, i) => r.push(c[i])));
      } else {
        const sc = scaleOf(v);
        const col = Array.from({ length: n }, (_, i) => toScale(sc, latentFor(vNodes[0])[i]));
        columns.push(v.name);
        colScales.push(sc);
        nodeColsRaw[vNodes[0].nodeId] = col;
        rows.forEach((r, i) => r.push(col[i]));
      }
    }

    // ---------- ۴) داده گمشده و داده پرت ----------
    if (constraints.missingPct > 0) {
      const total = n * columns.length;
      const count = Math.min(total, Math.round((constraints.missingPct / 100) * total));
      const cells = new Set<number>();
      while (cells.size < count) cells.add(Math.floor(Math.random() * total));
      cells.forEach((cell) => {
        rows[Math.floor(cell / columns.length)][cell % columns.length] = null;
      });
    }

    if (constraints.outlierPct > 0) {
      const count = Math.round((constraints.outlierPct / 100) * n);
      const chosen = new Set<number>();
      while (chosen.size < count && chosen.size < n) chosen.add(Math.floor(Math.random() * n));
      chosen.forEach((r) => {
        const c = Math.floor(Math.random() * columns.length);
        const sc = colScales[c];
        rows[r][c] = Math.random() < 0.5 ? sc.mx + rand(1, 4) : sc.mn - rand(1, 4);
      });
    }

    // بازسازی nodeCols و شاخص‌های اندازه‌گیری از روی جدول (با null → NaN)
    const nodeCols: number[][] = nodes.map(() => Array(n).fill(NaN));
    const measurementCols: SemMeasurementColumns = {};
    for (const v of variables) {
      const vNodes = nodes.filter((x) => x.varId === v.id);
      if (v.subscales.length) {
        // ستون‌های زیرمقیاس این متغیر در جدول
        const startCol = columns.findIndex((c) => c.startsWith(v.name + " — "));
        if (v.hasTotal) {
          measurementCols[vNodes[0].nodeId] = v.subscales.map((_, subscaleIndex) =>
            rows.map((row) => {
              const value = row[startCol + subscaleIndex];
              return value != null && Number.isFinite(value) ? value : NaN;
            })
          );
          for (let i = 0; i < n; i++) {
            let sum = 0;
            let ok = true;
            for (let s = 0; s < v.subscales.length; s++) {
              const val = rows[i][startCol + s];
              if (val == null || !Number.isFinite(val)) {
                ok = false;
                break;
              }
              sum += val;
            }
            nodeCols[vNodes[0].nodeId][i] = ok ? sum : NaN;
          }
        } else {
          vNodes.forEach((node, si) => {
            const observed = rows.map((row) => {
              const value = row[startCol + si];
              return value != null && Number.isFinite(value) ? value : NaN;
            });
            measurementCols[node.nodeId] = [observed];
            nodeCols[node.nodeId] = observed;
          });
        }
      } else {
        const startCol = columns.findIndex((c) => c === v.name);
        const observed = rows.map((row) => {
          const value = row[startCol];
          return value != null && Number.isFinite(value) ? value : NaN;
        });
        measurementCols[vNodes[0].nodeId] = [observed];
        nodeCols[vNodes[0].nodeId] = observed;
      }
    }

    // ---------- ۵) ارزیابی ----------
    const sem = estimateSem(nodes, arrows, nodeCols, measurementCols);
    const margins: number[] = [];

    // قید فلش‌ها
    for (const pr of sem.paths) {
      const arrow = arrows.find((a) => a.fromNode === pr.from && a.toNode === pr.to);
      if (!arrow) continue;
      const t = constraints.pathTargets[`${arrow.fromVar}:${arrow.toVar}`];
      if (!t) continue;
      if (t.sig === "sig") {
        margins.push(0.05 - pr.p);
        if (t.betaMin != null) margins.push(pr.std - t.betaMin);
        if (t.betaMax != null) margins.push(t.betaMax - pr.std);
      } else if (t.sig === "ns") {
        margins.push(pr.p - 0.05);
        margins.push(0.2 - Math.abs(pr.std));
      }
    }

    if (constraints.r2Range) {
      for (const v of outVars) {
        for (const node of nodes.filter((x) => x.varId === v.id)) {
          const r2 = sem.r2[node.nodeId] ?? 0;
          margins.push(r2 - constraints.r2Range.min, constraints.r2Range.max - r2);
        }
      }
    }

    if (sem.fit.valid) {
      const addFitRange = (value: number, range: { min: number | null; max: number | null }) => {
        if (range.min == null && range.max == null) return;
        if (!Number.isFinite(value)) {
          margins.push(Number.NEGATIVE_INFINITY);
          return;
        }
        if (range.min != null) margins.push(value - range.min);
        if (range.max != null) margins.push(range.max - value);
      };
      addFitRange(sem.fit.chi2, fitTargets.chi2);
      addFitRange(sem.fit.df, fitTargets.df);
      addFitRange(sem.fit.pValue, fitTargets.pValue);
      addFitRange(sem.fit.chi2df, fitTargets.cminDf);
      addFitRange(sem.fit.rmsea, fitTargets.rmsea);
      addFitRange(sem.fit.rmseaHigh, fitTargets.rmseaCiHigh);
      addFitRange(sem.fit.pnfi, fitTargets.pnfi);
      addFitRange(sem.fit.cfi, fitTargets.cfi);
      addFitRange(sem.fit.pcfi, fitTargets.pcfi);
      addFitRange(sem.fit.ifi, fitTargets.ifi);
      addFitRange(sem.fit.gfi, fitTargets.gfi);
      addFitRange(sem.fit.srmr, fitTargets.srmr);
    } else {
      // برازش غیرقابل‌محاسبه هرگز نباید صرفاً به‌دلیل نبودن حاشیه برازش پذیرفته شود.
      margins.push(Number.NEGATIVE_INFINITY);
    }

    if (constraints.enforceNormality && constraints.outlierPct === 0) {
      for (const node of nodes) {
        const s = skewness(nodeCols[node.nodeId]);
        const k = kurtosis(nodeCols[node.nodeId]);
        if (Number.isFinite(s)) margins.push(3 - Math.abs(s));
        if (Number.isFinite(k)) margins.push(10 - Math.abs(k));
      }
    }

    if (constraints.enforceLinearity) {
      const corr = correlationMatrixWithP(nodeCols);
      for (const a of activeArrows) {
        const p = corr.p[a.fromNode][a.toNode];
        if (Number.isFinite(p)) margins.push(0.05 - p);
      }
    }

    if (constraints.enforceVif) {
      for (const node of nodes) {
        if (node.role === "exogenous") continue;
        const vifs = sem.vifs[node.nodeId] ?? [];
        if (vifs.length) margins.push(5 - Math.max(...vifs));
      }
    }
    if (constraints.enforceDw) {
      for (const node of nodes) {
        if (node.role === "exogenous") continue;
        const dw = sem.dw[node.nodeId];
        if (Number.isFinite(dw)) margins.push(dw - 1.5, 2.5 - dw);
      }
    }

    const scoreBase = margins.length ? Math.min(...margins) : Infinity;

    // بوت‌استرپ اثر غیرمستقیم — فقط وقتی بقیه قیود پاس شده‌اند
    let score = scoreBase;
    let boot: ReturnType<typeof bootstrapIndirectEffects> = [];
    if (scoreBase >= 0 && indirectConstraintKeys.length > 0) {
      // برای غربال تولید، ۱۰۰۰ بازنمونه پایدار و سریع است؛ تحلیل نهایی با تعداد انتخابی کاربر اجرا می‌شود.
      boot = bootstrapIndirectEffects(nodes, arrows, nodeCols, Math.min(constraints.bootSamples, 1000));
      for (const b of boot) {
        const key = b.viaVar === null ? `${b.fromVar}:${b.toVar}` : `${b.fromVar}:${b.viaVar}:${b.toVar}`;
        if (!indirectConstraintKeys.includes(key)) continue;
        const target = resolveIndirectConstraint(constraints.indirectTargets[key]);
        if (target.significance === "sig") score = Math.min(score, 0.05 - b.p);
        else if (target.significance === "ns") score = Math.min(score, b.p - 0.05);
        if (target.min != null) score = Math.min(score, b.indirect - target.min);
        if (target.max != null) score = Math.min(score, target.max - b.indirect);
      }
      const evaluatedKeys = new Set(
        boot.map((b) => (b.viaVar === null ? `${b.fromVar}:${b.toVar}` : `${b.fromVar}:${b.viaVar}:${b.toVar}`))
      );
      if (indirectConstraintKeys.some((key) => !evaluatedKeys.has(key))) score = Number.NEGATIVE_INFINITY;
    }

    const pathTargets = sem.paths.map((pr) => {
      const a = arrows.find((x) => x.fromNode === pr.from && x.toNode === pr.to);
      return {
        fromNode: pr.from,
        toNode: pr.to,
        target: a ? arrowTarget.get(a.id) ?? 0 : 0,
        actual: pr.std,
      };
    });

    const attemptData: Attempt = { score, columns, rows, nodeCols, sem, boot, pathTargets };

    if (score >= 0) {
      return {
        columns,
        rows,
        nodes,
        nodeCols,
        answerKey: {
          pathTargets,
          fit: sem.fit,
          attempts: attempt + 1,
          r2Range: constraints.r2Range,
        },
      };
    }
    if (!best || score > best.score) best = attemptData;
  }

  const scoreText = best ? (Number.isFinite(best.score) ? best.score.toFixed(3) : "-") : "-";
  const messages: string[] = [];
  const sigPaths = Object.entries(constraints.pathTargets)
    .filter(([, t]) => t.sig === "sig")
    .map(([k]) => `مسیر ${k} معنادار`);
  const nsPaths = Object.entries(constraints.pathTargets)
    .filter(([, t]) => t.sig === "ns")
    .map(([k]) => `مسیر ${k} غیرمعنادار`);
  messages.push(...sigPaths, ...nsPaths);
  const indirectMessages = indirectConstraintKeys.map((key) => {
    const target = resolveIndirectConstraint(constraints.indirectTargets[key]);
    const significance =
      target.significance === "sig" ? "معنادار" : target.significance === "ns" ? "غیرمعنادار" : "با هر وضعیت معناداری";
    const range =
      target.min != null && target.max != null
        ? ` و بین ${target.min} تا ${target.max}`
        : target.min != null
          ? ` و حداقل ${target.min}`
          : target.max != null
            ? ` و حداکثر ${target.max}`
            : "";
    return `اثر غیرمستقیم ${key} ${significance}${range}`;
  });
  messages.push(...indirectMessages);
  if (constraints.r2Range) messages.push(`R² بین ${constraints.r2Range.min} تا ${constraints.r2Range.max}`);
  const describeFitRange = (label: string, range: { min: number | null; max: number | null }) => {
    if (range.min != null && range.max != null) return `${label} بین ${range.min} تا ${range.max}`;
    if (range.min != null) return `${label} ≥ ${range.min}`;
    if (range.max != null) return `${label} ≤ ${range.max}`;
    return null;
  };
  const fitMessages = [
    describeFitRange("χ²", fitTargets.chi2),
    describeFitRange("df", fitTargets.df),
    describeFitRange("p برازش", fitTargets.pValue),
    describeFitRange("CMIN/df", fitTargets.cminDf),
    describeFitRange("RMSEA", fitTargets.rmsea),
    describeFitRange("حد بالای CI90% RMSEA", fitTargets.rmseaCiHigh),
    describeFitRange("PNFI", fitTargets.pnfi),
    describeFitRange("CFI", fitTargets.cfi),
    describeFitRange("PCFI", fitTargets.pcfi),
    describeFitRange("IFI", fitTargets.ifi),
    describeFitRange("GFI", fitTargets.gfi),
    describeFitRange("SRMR", fitTargets.srmr),
  ].filter((message): message is string => message != null);
  messages.push(...fitMessages);

  const recommendations: string[] = [];
  const recommendRange = (label: string, value: number, range: { min: number | null; max: number | null }) => {
    if (!Number.isFinite(value)) return;
    const shown = Number(value.toFixed(3));
    if (range.min != null && value < range.min) {
      recommendations.push(`حداقل «${label}» را از ${range.min} به ${shown} یا کمتر کاهش دهید (بهترین مقدار فعلی: ${shown}).`);
    }
    if (range.max != null && value > range.max) {
      recommendations.push(`حداکثر «${label}» را از ${range.max} به ${shown} یا بیشتر افزایش دهید (بهترین مقدار فعلی: ${shown}).`);
    }
  };

  if (best) {
    if (constraints.r2Range) {
      for (const node of nodes.filter((item) => item.role === "outcome")) {
        recommendRange(`R² ${node.label}`, best.sem.r2[node.nodeId] ?? NaN, constraints.r2Range);
      }
    }
    recommendRange("χ²", best.sem.fit.chi2, fitTargets.chi2);
    recommendRange("Df", best.sem.fit.df, fitTargets.df);
    recommendRange("P-value", best.sem.fit.pValue, fitTargets.pValue);
    recommendRange("CMIN/df", best.sem.fit.chi2df, fitTargets.cminDf);
    recommendRange("RMSEA", best.sem.fit.rmsea, fitTargets.rmsea);
    recommendRange("حد بالای CI90% RMSEA", best.sem.fit.rmseaHigh, fitTargets.rmseaCiHigh);
    recommendRange("PNFI", best.sem.fit.pnfi, fitTargets.pnfi);
    recommendRange("CFI", best.sem.fit.cfi, fitTargets.cfi);
    recommendRange("PCFI", best.sem.fit.pcfi, fitTargets.pcfi);
    recommendRange("IFI", best.sem.fit.ifi, fitTargets.ifi);
    recommendRange("GFI", best.sem.fit.gfi, fitTargets.gfi);
    recommendRange("SRMR", best.sem.fit.srmr, fitTargets.srmr);

    for (const [key, target] of Object.entries(constraints.pathTargets)) {
      const [fromVar, toVar] = key.split(":").map(Number);
      const matching = best.sem.paths.filter((path) => {
        const arrow = arrows.find((item) => item.fromNode === path.from && item.toNode === path.to);
        return arrow?.fromVar === fromVar && arrow?.toVar === toVar;
      });
      const path = matching[0];
      if (!path) continue;
      if (target.sig === "sig" && path.p >= 0.05) {
        recommendations.push(`برای مسیر ${key} حجم نمونه را افزایش دهید یا وضعیت معناداری را به «مهم نیست» تغییر دهید (p فعلی=${Number(path.p.toFixed(3))}).`);
      } else if (target.sig === "ns" && path.p < 0.05) {
        recommendations.push(`برای مسیر ${key} وضعیت را از «غیرمعنادار» به «مهم نیست/معنادار» تغییر دهید (p فعلی=${Number(path.p.toFixed(3))}).`);
      }
      recommendRange(`β مسیر ${key}`, path.std, { min: target.betaMin, max: target.betaMax });
    }

    for (const key of indirectConstraintKeys) {
      const target = resolveIndirectConstraint(constraints.indirectTargets[key]);
      const row = best.boot.find((item) =>
        item.viaVar === null
          ? key === `${item.fromVar}:${item.toVar}`
          : key === `${item.fromVar}:${item.viaVar}:${item.toVar}`
      );
      if (!row) continue;
      recommendRange(`اثر غیرمستقیم ${key}`, row.indirect, target);
      if (target.significance === "sig" && row.p >= 0.05) {
        recommendations.push(`برای اثر غیرمستقیم ${key} حجم نمونه یا ضرایب مسیرهای میانجی را افزایش دهید (p بوت‌استرپ فعلی=${Number(row.p.toFixed(3))}).`);
      } else if (target.significance === "ns" && row.p < 0.05) {
        recommendations.push(`برای اثر غیرمستقیم ${key} دامنه ضرایب مسیر را کاهش دهید یا وضعیت را به «مهم نیست» تغییر دهید.`);
      }
    }
  }

  if (!recommendations.length) {
    recommendations.push("ابتدا دامنه R² و شاخص‌های برازش را کمی بازتر کنید؛ سپس در صورت نیاز حجم نمونه را افزایش دهید.");
  }
  throw new Error(
    `با این تنظیمات، در ${maxAttempts} تلاش داده‌ای که همه قیود (${messages.join("، ")}) را پاس کند پیدا نشد. ` +
      `بهترین امتیاز معیار: ${scoreText}. پیشنهادهای مشخص: ${recommendations.slice(0, 6).join(" ")}`
  );
}
