import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import sharp from "sharp";

const { default: manifest } = await import("../app/manifest.ts");
const { BRAND_NAME } = await import("../lib/brand.ts");

test("the manifest makes the app installable with the brand and real icons", async () => {
  const m = manifest();
  assert.equal(m.name, BRAND_NAME);
  assert.equal(m.display, "standalone");
  assert.equal(m.start_url, "/app");
  const sizes = new Set();
  for (const icon of m.icons) {
    const meta = await sharp(readFileSync(new URL(`../public${icon.src}`, import.meta.url))).metadata();
    assert.equal(`${meta.width}x${meta.height}`, icon.sizes);
    sizes.add(`${icon.sizes}:${icon.purpose}`);
  }
  assert.ok(sizes.has("192x192:any") && sizes.has("512x512:any") && sizes.has("512x512:maskable"));
});

function loadWorker({ network }) {
  const listeners = {};
  const store = new Map();
  const cache = {
    addAll: async (urls) => urls.forEach((u) => store.set(u, new Response(`cached ${u}`))),
  };
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (type, fn) => (listeners[type] = fn),
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  };
  const caches = {
    open: async () => cache,
    keys: async () => ["zahavania-offline-v0", "zahavania-offline-v1", "other"],
    delete: async (key) => store.set(`deleted:${key}`, true),
    match: async (url) => store.get(url),
  };
  vm.runInNewContext(readFileSync(new URL("../public/sw.js", import.meta.url), "utf8"), { self, caches, fetch: network, Response, URL, Promise });
  return { listeners, store };
}

async function dispatch(listeners, type, request) {
  let responded = null;
  const waits = [];
  listeners[type]({ request, respondWith: (p) => (responded = p), waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
  return responded ? await responded : null;
}

test("install precaches the offline page and activate drops old caches only", async () => {
  const { listeners, store } = loadWorker({ network: async () => new Response("live") });
  await dispatch(listeners, "install");
  assert.ok(store.has("/offline"));
  await dispatch(listeners, "activate");
  assert.ok(store.has("deleted:zahavania-offline-v0"));
  assert.ok(!store.has("deleted:zahavania-offline-v1") && !store.has("deleted:other"));
});

test("a failed page navigation shows the offline page, a working one goes to the network", async () => {
  const offline = loadWorker({ network: async () => { throw new TypeError("offline"); } });
  await dispatch(offline.listeners, "install");
  const page = await dispatch(offline.listeners, "fetch", { method: "GET", mode: "navigate", url: "https://app.test/app/verify" });
  assert.equal(await page.text(), "cached /offline");

  const online = loadWorker({ network: async () => new Response("live") });
  const live = await dispatch(online.listeners, "fetch", { method: "GET", mode: "navigate", url: "https://app.test/app" });
  assert.equal(await live.text(), "live");
});

test("API calls, non-GET requests and assets are never intercepted", async () => {
  const { listeners } = loadWorker({ network: async () => new Response("live") });
  for (const request of [
    { method: "POST", mode: "cors", url: "https://app.test/api/verify/text" },
    { method: "GET", mode: "navigate", url: "https://app.test/api/verify/text" },
    { method: "GET", mode: "no-cors", url: "https://app.test/_next/static/app.js" },
    { method: "GET", mode: "navigate", url: "https://elsewhere.test/" },
  ]) {
    assert.equal(await dispatch(listeners, "fetch", request), null, request.url);
  }
});
