"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ErrorBoundary from "@/components/error-boundary";
import ClinicalTool from "@/components/clinical-tool";

function CompareTool() {
  const searchParams = useSearchParams();
  const f = searchParams.get("followup");
  const initialFollowup = f === "0" ? false : f === "1" ? true : undefined;
  return <ClinicalTool mode="compare" initialFollowup={initialFollowup} />;
}

export default function CompareTreatmentsPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <CompareTool />
      </Suspense>
    </ErrorBoundary>
  );
}
