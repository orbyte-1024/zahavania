export type GrowHandle = {
  measure: () => void;
  set: (t: number, zoom?: number, lift?: number) => void;
};

export function createGrow(el: HTMLElement): GrowHandle | null {
  const line = el.parentElement;
  const pin = line?.closest<HTMLElement>(".pin");
  const inner = el.firstElementChild as HTMLElement | null;
  if (!line || !pin || !inner) return null;

  let xOff = 0;
  let yOff = 0;
  let fontSize = 57;

  return {
    measure() {
      const previous = line.style.transform;
      line.style.transform = "none";
      fontSize = parseFloat(getComputedStyle(line).fontSize) || fontSize;
      let leftW = 0;
      let rightW = 0;
      let seen = false;
      for (const child of Array.from(line.children)) {
        if (child === el) {
          seen = true;
          continue;
        }
        if (!child.classList.contains("hl")) continue;
        const width = (child as HTMLElement).offsetWidth;
        if (seen) rightW += width;
        else leftW += width;
      }
      xOff = (leftW - rightW) / 2;
      const lineRect = line.getBoundingClientRect();
      const pinRect = pin.getBoundingClientRect();
      yOff = lineRect.top - pinRect.top + lineRect.height / 2 - window.innerHeight / 2;
      line.style.transform = previous;
    },
    set(t, zoom = 1, lift = t) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const width = vw * t;
      const height = Math.min(vh, Math.max(width / 1.9, vh * Math.pow(t, 1.6)));
      el.style.width = `${width.toFixed(1)}px`;
      el.style.height = `${height.toFixed(1)}px`;
      const margin = fontSize * 0.13 + Math.min(t * 60, fontSize * 0.12);
      el.style.marginLeft = `${margin.toFixed(1)}px`;
      el.style.marginRight = `${margin.toFixed(1)}px`;
      el.style.borderRadius = t > 0.985 ? "0" : "2px";
      line.style.transform = `translate(${(-xOff * t).toFixed(1)}px, ${(-yOff * lift).toFixed(1)}px)`;
      inner.style.transform = `translate(-50%, -50%) scale(${zoom})`;
    },
  };
}
