import { Suspense } from "react";
import { AnglesScreen } from "@/components/workspace/AnglesScreen";

export default function AnglesPage() {
  return (
    <Suspense>
      <AnglesScreen />
    </Suspense>
  );
}
