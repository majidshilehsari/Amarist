import type { ModelNode, SemResults } from "@/lib/sem-stats";

export type SemCollinearityRow = {
  dependentNodeId: number;
  dependentLabel: string;
  predictorNodeId: number;
  predictorLabel: string;
  tolerance: number;
  vif: number;
  pass: boolean;
};

export type SemIndependenceRow = {
  dependentNodeId: number;
  dependentLabel: string;
  durbinWatson: number;
  pass: boolean;
};

export type SemRegressionDiagnostics = {
  collinearity: SemCollinearityRow[];
  independence: SemIndependenceRow[];
  collinearityPass: boolean;
  independencePass: boolean;
};

/**
 * دادهٔ آمادهٔ نمایش/گزارش برای دو جدول جداگانهٔ هم‌خطی و استقلال خطاها.
 * ترتیب VIFها دقیقاً با ترتیب مسیرهای ورودیِ برآوردشده در estimateSem یکسان است.
 */
export function buildSemRegressionDiagnostics(
  nodes: ModelNode[],
  sem: SemResults
): SemRegressionDiagnostics {
  const labelOf = (nodeId: number) => {
    const node = nodes.find((candidate) => candidate.nodeId === nodeId);
    if (!node) return `گره ${nodeId}`;
    if (node.kind === "total") return node.label.replace(/\s*\(کل\)\s*$/, "");
    if (node.kind === "sub") return node.label.split(" — ").at(-1) ?? node.label;
    return node.label;
  };
  const collinearity: SemCollinearityRow[] = [];
  const independence: SemIndependenceRow[] = [];

  for (const dependent of nodes) {
    if (dependent.role === "exogenous") continue;
    const incoming = sem.paths.filter((path) => path.to === dependent.nodeId);
    if (!incoming.length) continue;
    const vifs = sem.vifs[dependent.nodeId] ?? [];

    incoming.forEach((path, index) => {
      const vif = vifs[index] ?? NaN;
      const tolerance = Number.isFinite(vif) && vif > 0 ? 1 / vif : NaN;
      collinearity.push({
        dependentNodeId: dependent.nodeId,
        dependentLabel: labelOf(dependent.nodeId),
        predictorNodeId: path.from,
        predictorLabel: labelOf(path.from),
        tolerance,
        vif,
        // VIF < 5 معادلِ تلورانس > 0.20 است.
        pass: Number.isFinite(vif) && vif < 5 && Number.isFinite(tolerance) && tolerance > 0.2,
      });
    });

    const durbinWatson = sem.dw[dependent.nodeId] ?? NaN;
    independence.push({
      dependentNodeId: dependent.nodeId,
      dependentLabel: labelOf(dependent.nodeId),
      durbinWatson,
      pass: Number.isFinite(durbinWatson) && durbinWatson >= 1.5 && durbinWatson <= 2.5,
    });
  }

  return {
    collinearity,
    independence,
    collinearityPass: collinearity.length > 0 && collinearity.every((row) => row.pass),
    independencePass: independence.length > 0 && independence.every((row) => row.pass),
  };
}
