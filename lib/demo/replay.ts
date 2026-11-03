import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export type DemoRoute = "verify-text" | "sources-suggest" | "editorial-angles";

export type DemoFallbackMode = "off" | "on_error" | "always";

export type DemoRecording<T> = {
  route: DemoRoute;
  recordedAt: string;
  payload: T;
};

export const DEMO_DIR = path.join(process.cwd(), "data", "demo");

const KEY_PATTERN = /^[a-f0-9]{64}$/;

export function demoFallbackMode(): DemoFallbackMode {
  const value = process.env.DEMO_FALLBACK;
  return value === "on_error" || value === "always" ? value : "off";
}

export function isDemoRecording(): boolean {
  return process.env.DEMO_RECORD === "true" && process.env.NODE_ENV !== "production";
}

function recordingPath(route: DemoRoute, key: string, dir: string): string {
  if (!KEY_PATTERN.test(key)) throw new Error("invalid demo key");
  return path.join(dir, `${route}-${key}.json`);
}

export async function readDemoRecording<T>(
  route: DemoRoute,
  key: string,
  dir: string = DEMO_DIR,
): Promise<DemoRecording<T> | null> {
  try {
    const parsed: unknown = JSON.parse(await readFile(recordingPath(route, key, dir), "utf8"));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      (parsed as DemoRecording<T>).route !== route ||
      typeof (parsed as DemoRecording<T>).recordedAt !== "string" ||
      !("payload" in parsed)
    ) {
      return null;
    }
    return parsed as DemoRecording<T>;
  } catch {
    return null;
  }
}

export async function writeDemoRecording<T>(
  route: DemoRoute,
  key: string,
  payload: T,
  dir: string = DEMO_DIR,
): Promise<void> {
  const recording: DemoRecording<T> = { route, recordedAt: new Date().toISOString(), payload };
  await mkdir(dir, { recursive: true });
  await writeFile(recordingPath(route, key, dir), `${JSON.stringify(recording, null, 2)}\n`, "utf8");
}
