/// <reference lib="webworker" />

import { bootstrapSemMlIndirect, type MlArrow, type MlMeasurementColumns, type MlNode } from "@/lib/sem-ml";

type BootstrapWorkerRequest = {
  nodes: MlNode[];
  arrows: MlArrow[];
  nodeColumns: number[][];
  measurementColumns: MlMeasurementColumns;
  samples: number;
};

self.onmessage = (event: MessageEvent<BootstrapWorkerRequest>) => {
  try {
    const { nodes, arrows, nodeColumns, measurementColumns, samples } = event.data;
    const results = bootstrapSemMlIndirect(nodes, arrows, nodeColumns, measurementColumns, samples);
    self.postMessage({ ok: true, results });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

export {};
