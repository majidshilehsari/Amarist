/// <reference lib="webworker" />

import { bootstrapSemMlIndirect, type MlArrow, type MlMeasurementColumns, type MlNode } from "@/lib/sem-ml";

type BootstrapWorkerRequest = {
  nodes: MlNode[];
  arrows: MlArrow[];
  nodeColumns: number[][];
  measurementColumns: MlMeasurementColumns;
  samples: number;
};

type BootstrapWorkerResponse =
  | { type: "progress"; done: number; total: number }
  | {
      type: "done";
      ok: boolean;
      results?: {
        fromVar: number;
        toVar: number;
        viaVar: number | null;
        indirect: number;
        lo: number;
        hi: number;
        p: number;
      }[];
      error?: string;
    };

self.onmessage = (event: MessageEvent<BootstrapWorkerRequest>) => {
  try {
    const { nodes, arrows, nodeColumns, measurementColumns, samples } = event.data;
    const results = bootstrapSemMlIndirect(
      nodes,
      arrows,
      nodeColumns,
      measurementColumns,
      samples,
      undefined,
      (done, total) => {
        const message: BootstrapWorkerResponse = { type: "progress", done, total };
        self.postMessage(message);
      }
    );
    const message: BootstrapWorkerResponse = { type: "done", ok: true, results };
    self.postMessage(message);
  } catch (error) {
    const message: BootstrapWorkerResponse = {
      type: "done",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(message);
  }
};

export {};
