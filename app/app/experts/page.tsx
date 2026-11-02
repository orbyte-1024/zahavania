import { Suspense } from "react";
import { ExpertsScreen } from "@/components/workspace/ExpertsScreen";

export default function ExpertsPage() {
  return (
    <Suspense>
      <ExpertsScreen />
    </Suspense>
  );
}
