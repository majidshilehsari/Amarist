/// <reference lib="webworker" />

import {
  generateSemData,
  type SemGenInput,
  type SemGenOutput,
  type SemGenProgress,
} from "@/lib/sem-generator";

export type SemGeneratorWorkerRequest =
  | {
      type: "generate";
      input: SemGenInput;
      options: { maxAttempts: number; verifyBootSamples: number; maxVerifications?: number };
    }
  | { type: "cancel" };

export type SemGeneratorWorkerResponse =
  | { type: "progress"; progress: SemGenProgress }
  | { type: "done"; output: SemGenOutput }
  | { type: "error"; message: string };

let cancelRequested = false;

self.onmessage = async (event: MessageEvent<SemGeneratorWorkerRequest>) => {
  const data = event.data;
  if (data.type === "cancel") {
    cancelRequested = true;
    return;
  }
  if (data.type !== "generate") return;

  cancelRequested = false;
  try {
    const output = await generateSemData(data.input, {
      maxAttempts: data.options.maxAttempts,
      verifyBootSamples: data.options.verifyBootSamples,
      maxVerifications: data.options.maxVerifications,
      shouldCancel: () => cancelRequested,
      onProgress: (progress) => {
        const message: SemGeneratorWorkerResponse = { type: "progress", progress };
        self.postMessage(message);
      },
    });
    const done: SemGeneratorWorkerResponse = { type: "done", output };
    self.postMessage(done);
  } catch (error) {
    const failure: SemGeneratorWorkerResponse = {
      type: "error",
      message: error instanceof Error ? error.message : String(error),
    };
    self.postMessage(failure);
  }
};

export {};
