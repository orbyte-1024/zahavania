import type { Ref } from "react";

export const OVAL_PATH = "M50,6 C88,4 98,22 97,50 C96,82 76,96 49,95 C16,94 3,76 4,48 C5,18 20,7 50,6 Z";

export function HandOval({ pathRef, className = "hand-oval" }: { pathRef?: Ref<SVGPathElement>; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <path ref={pathRef} d={OVAL_PATH} />
    </svg>
  );
}
