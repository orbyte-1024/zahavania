import "server-only";
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { readIntEnv } from "@/lib/env";

const fetchTimeoutMs = (): number => readIntEnv("URL_FETCH_TIMEOUT_MS", 12_000, 3_000, 20_000);
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_PORTS = new Set(["", "80", "443"]);
const ALLOWED_CONTENT_TYPES = ["text/html", "text/plain", "application/xhtml+xml"];

export type SafeFetchErrorCode =
  | "invalid_url"
  | "blocked_destination"
  | "timeout"
  | "too_large"
  | "too_many_redirects"
  | "bad_status"
  | "unsupported_content"
  | "network_error";

export class SafeFetchError extends Error {
  readonly code: SafeFetchErrorCode;

  constructor(code: SafeFetchErrorCode, detail: string) {
    super(detail);
    this.name = "SafeFetchError";
    this.code = code;
  }
}

export type SafeFetchResult = {
  finalUrl: string;
  contentType: string;
  body: string;
};

const blockedRanges = new net.BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedRanges.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedRanges.addSubnet(network, prefix, "ipv6");
}

export function isBlockedIp(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blockedRanges.check(address, "ipv4");
  if (family === 6) return blockedRanges.check(address, "ipv6");
  return true;
}

export function validatePublicUrl(raw: string): URL {
  if (!URL.canParse(raw)) throw new SafeFetchError("invalid_url", "unparseable URL");
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new SafeFetchError("invalid_url", `protocol ${url.protocol} not allowed`);
  }
  if (url.username || url.password) throw new SafeFetchError("invalid_url", "credentials in URL");
  if (!ALLOWED_PORTS.has(url.port)) throw new SafeFetchError("blocked_destination", `port ${url.port}`);

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new SafeFetchError("blocked_destination", "localhost");
  }
  if (net.isIP(hostname) && isBlockedIp(hostname)) {
    throw new SafeFetchError("blocked_destination", "private IP literal");
  }
  return url;
}

const safeLookup: net.LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, "", 0);
    const blocked = addresses.length === 0 || addresses.some((entry) => isBlockedIp(entry.address));
    if (blocked) return callback(new SafeFetchError("blocked_destination", "resolves to private IP"), "", 0);
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
};

type RawResponse = { status: number; location: string | null; contentType: string; body: Buffer | null };

function requestOnce(url: URL, signal: AbortSignal): Promise<RawResponse> {
  const transport = url.protocol === "https:" ? https : http;

  return new Promise((resolve, reject) => {
    const req = transport.request(
      url,
      {
        method: "GET",
        lookup: safeLookup,
        agent: false,
        signal,
        headers: {
          "User-Agent": "ZahavaniaVerifier/1.0 (+fact-checking for journalists)",
          Accept: "text/html,application/xhtml+xml,text/plain;q=0.9",
        },
      },
      (res) => {
        const status = res.statusCode ?? 0;
        const contentType = String(res.headers["content-type"] ?? "").toLowerCase();

        if (status >= 300 && status < 400) {
          res.resume();
          return resolve({ status, location: res.headers.location ?? null, contentType, body: null });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new SafeFetchError("bad_status", `status ${status}`));
        }
        if (!ALLOWED_CONTENT_TYPES.some((type) => contentType.startsWith(type))) {
          res.resume();
          return reject(new SafeFetchError("unsupported_content", contentType || "missing content-type"));
        }
        if (Number(res.headers["content-length"] ?? "0") > MAX_BYTES) {
          res.destroy();
          return reject(new SafeFetchError("too_large", "declared content-length"));
        }

        const chunks: Buffer[] = [];
        let received = 0;
        res.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > MAX_BYTES) {
            res.destroy();
            reject(new SafeFetchError("too_large", "body exceeds limit"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, location: null, contentType, body: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

function decodeBody(body: Buffer, contentType: string): string {
  const charset = /charset=([^;]+)/.exec(contentType)?.[1]?.trim().replace(/"/g, "") ?? "utf-8";
  try {
    return new TextDecoder(charset).decode(body);
  } catch {
    return new TextDecoder("utf-8").decode(body);
  }
}

function toSafeFetchError(error: unknown, signal: AbortSignal): SafeFetchError {
  if (error instanceof SafeFetchError) return error;
  if (signal.aborted) return new SafeFetchError("timeout", `no response within ${fetchTimeoutMs()} ms`);
  if (error instanceof AggregateError) {
    const codes = error.errors.map((inner: unknown) => (inner instanceof Error ? inner.message : String(inner)));
    return new SafeFetchError("network_error", codes.join("; ") || "connection failed");
  }
  return new SafeFetchError("network_error", error instanceof Error ? error.message : "unknown error");
}

export async function safeFetchText(rawUrl: string): Promise<SafeFetchResult> {
  const signal = AbortSignal.timeout(fetchTimeoutMs());
  let url = validatePublicUrl(rawUrl);

  for (let redirects = 0; ; redirects += 1) {
    let response: RawResponse;
    try {
      response = await requestOnce(url, signal);
    } catch (error) {
      throw toSafeFetchError(error, signal);
    }

    if (response.body) {
      return { finalUrl: url.toString(), contentType: response.contentType, body: decodeBody(response.body, response.contentType) };
    }
    if (!response.location) throw new SafeFetchError("bad_status", `redirect ${response.status} without location`);
    if (redirects >= MAX_REDIRECTS) throw new SafeFetchError("too_many_redirects", `more than ${MAX_REDIRECTS}`);
    url = validatePublicUrl(new URL(response.location, url).toString());
  }
}
