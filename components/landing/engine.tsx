"use client";

import { gsap } from "gsap";
import Lenis from "lenis";
import { createContext, useContext, useEffect, useState, type ReactNode, type RefObject } from "react";

export type SceneFrame = { rect: DOMRect; vh: number; vw: number; mx: number; my: number };

type Scene = { el: HTMLElement; update: (frame: SceneFrame) => void; measure?: () => void };

export class SceneEngine {
  private scenes = new Set<Scene>();
  private mouse = { x: 0, y: 0, tx: 0, ty: 0 };
  lenis: Lenis | null = null;

  attach(lenis: Lenis | null) {
    this.lenis = lenis;
  }

  add(scene: Scene): () => void {
    this.scenes.add(scene);
    scene.measure?.();
    return () => {
      this.scenes.delete(scene);
    };
  }

  pointer(clientX: number, clientY: number) {
    this.mouse.tx = (clientX / window.innerWidth - 0.5) * 2;
    this.mouse.ty = (clientY / window.innerHeight - 0.5) * 2;
  }

  measure() {
    this.scenes.forEach((scene) => scene.measure?.());
  }

  render() {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    this.mouse.x += (this.mouse.tx - this.mouse.x) * 0.06;
    this.mouse.y += (this.mouse.ty - this.mouse.y) * 0.06;
    this.scenes.forEach((scene) => {
      const rect = scene.el.getBoundingClientRect();
      if (rect.bottom < -vh || rect.top > vh * 2) return;
      scene.update({ rect, vh, vw, mx: this.mouse.x, my: this.mouse.y });
    });
  }

  scrollTo(target: HTMLElement | number, offset = 0) {
    const top = typeof target === "number" ? target : target.getBoundingClientRect().top + window.scrollY;
    if (this.lenis) this.lenis.scrollTo(top + offset, { duration: 1.6 });
    else window.scrollTo({ top: top + offset, behavior: "smooth" });
  }
}

type EngineValue = { engine: SceneEngine; animated: boolean };

const EngineContext = createContext<EngineValue | null>(null);

export function useEngine(): EngineValue {
  const value = useContext(EngineContext);
  if (!value) throw new Error("useEngine must be used inside <EngineProvider>");
  return value;
}

export type SceneFactory = (el: HTMLElement) => Omit<Scene, "el"> | null;

export function useScene(ref: RefObject<HTMLElement | null>, factory: SceneFactory) {
  const { engine, animated } = useEngine();
  useEffect(() => {
    const el = ref.current;
    if (!el || !animated) return;
    const scene = factory(el);
    if (!scene) return;
    return engine.add({ el, ...scene });
  }, [engine, animated, factory, ref]);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function EngineProvider({ children }: { children: ReactNode }) {
  const [engine] = useState(() => new SceneEngine());
  const [animated] = useState(() => !prefersReducedMotion());

  useEffect(() => {
    document.body.classList.toggle("is-static", !animated);
    if (!animated) return;

    const lenis = new Lenis({ lerp: 0.085, smoothWheel: true, syncTouch: false });
    engine.attach(lenis);

    const tick = (time: number) => {
      lenis.raf(time * 1000);
      engine.render();
    };
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const onMove = (event: PointerEvent) => engine.pointer(event.clientX, event.clientY);
    let resizeTimer = 0;
    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => engine.measure(), 160);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("resize", onResize);
    document.fonts?.ready.then(() => engine.measure());

    return () => {
      gsap.ticker.remove(tick);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("resize", onResize);
      window.clearTimeout(resizeTimer);
      lenis.destroy();
      engine.attach(null);
      document.body.classList.remove("is-static");
    };
  }, [animated, engine]);

  return <EngineContext.Provider value={{ engine, animated }}>{children}</EngineContext.Provider>;
}
