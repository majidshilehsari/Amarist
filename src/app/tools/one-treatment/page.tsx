import ErrorBoundary from "@/components/error-boundary";
import ClinicalTool from "@/components/clinical-tool";

export default function OneTreatmentPage() {
  return (
    <ErrorBoundary>
      <ClinicalTool mode="one" />
    </ErrorBoundary>
  );
}
