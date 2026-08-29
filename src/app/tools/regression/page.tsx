import ErrorBoundary from "@/components/error-boundary";
import RegressionTool from "@/components/regression-tool";

export default function RegressionPage() {
  return (
    <ErrorBoundary>
      <RegressionTool />
    </ErrorBoundary>
  );
}
