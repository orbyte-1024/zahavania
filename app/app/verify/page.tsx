import { Suspense } from "react";
import { VerifyScreen } from "@/components/workspace/VerifyScreen";

export default function VerifyPage() {
  return (
    <Suspense>
      <VerifyScreen />
    </Suspense>
  );
}
