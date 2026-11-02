import { clamp } from "@/lib/motion/scroll";

export type DrawHandle = {
  set: (hidden: number) => void;
  measure: () => void;
};

export function createDraw(path: SVGPathElement): DrawHandle {
  let length = 1;
  let hidden = 1;

  const apply = () => {
    path.style.strokeDashoffset = String(length * hidden);
    path.style.opacity = hidden >= 0.999 ? "0" : "1";
  };

  const measure = () => {
    const svg = path.ownerSVGElement;
    if (!svg) return;
    const box = svg.viewBox.baseVal;
    const sx = (svg.clientWidth || 100) / (box?.width || 100);
    const sy = (svg.clientHeight || 100) / (box?.height || 100);
    length = path.getTotalLength() * Math.max(sx, sy, 1) * 1.25;
    path.style.strokeDasharray = String(length);
    apply();
  };

  measure();

  return {
    measure,
    set(value: number) {
      hidden = clamp(value, 0, 1);
      apply();
    },
  };
}
