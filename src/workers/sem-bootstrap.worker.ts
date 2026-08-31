/// <reference lib="webworker" />

import {
  bootstrapSemMlIndirectSamples,
  type MlArrow,
  type MlBootstrapSeed,
  type MlIndirectBootstrapSamples,
  type MlMeasurementColumns,
  type MlNode,
} from "@/lib/sem-ml";

/**
 * درخواستِ بوت‌استرپ. برای اجرای موازی، هر Worker تنها سهمِ خود از نمونه‌ها را
 * می‌گیرد و نمونه‌های خام را برمی‌گرداند؛ ادغام و محاسبهٔ فاصلهٔ اطمینان در رشتهٔ
 * اصلی انجام می‌شود تا نتیجه با اجرای تک‌رشته‌ای کاملاً یکسان باشد.
 */
type BootstrapWorkerRequest = {
  nodes: MlNode[];
  arrows: MlArrow[];
  nodeColumns: number[][];
  measurementColumns: MlMeasurementColumns;
  samples: number;
  /** برآوردِ نمونهٔ کامل برای شروعِ گرم (اختیاری اما strongly recommended) */
  seed?: MlBootstrapSeed;
};

type BootstrapWorkerResponse =
  | { type: "progress"; done: number; total: number }
  | { type: "done"; ok: boolean; samples?: MlIndirectBootstrapSamples; error?: string };

self.onmessage = (event: MessageEvent<BootstrapWorkerRequest>) => {
  try {
    const { nodes, arrows, nodeColumns, measurementColumns, samples, seed } = event.data;
    const collected = bootstrapSemMlIndirectSamples(
      nodes,
      arrows,
      nodeColumns,
      measurementColumns,
      samples,
      seed,
      (done, total) => {
        const message: BootstrapWorkerResponse = { type: "progress", done, total };
        self.postMessage(message);
      }
    );
    const message: BootstrapWorkerResponse = { type: "done", ok: true, samples: collected };
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
