import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/verify/image/route";

const URL_UNDER_TEST = "http://localhost/api/verify/image";

let calls = 0;

/** Each request gets its own client IP: the shared rate limiter allows 10/minute per IP. */
function baseHeaders(contentType?: string): Record<string, string> {
  calls += 1;
  const headers: Record<string, string> = {
    "x-forwarded-for": `10.9.${Math.floor(calls / 250)}.${calls % 250}`,
  };
  if (contentType) headers["content-type"] = contentType;
  return headers;
}

async function send(init: RequestInit) {
  const request = new NextRequest(
    URL_UNDER_TEST,
    init as ConstructorParameters<typeof NextRequest>[1],
  );
  const response = await POST(request);
  return { status: response.status, body: await response.json() };
}

/** Source bytes may be backed by SharedArrayBuffer; File and BodyInit only take ArrayBuffer. */
function bytesFor(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  return copy;
}

export function postForm(form: FormData) {
  return send({ method: "POST", body: form, headers: baseHeaders() });
}

export function postRaw(body: Uint8Array, contentType: string) {
  return send({
    method: "POST",
    body: bytesFor(body),
    headers: baseHeaders(contentType),
  });
}

/** Sends a chunked body with no Content-Length, so only the streaming guard can stop it. */
export function postStream(body: Uint8Array, contentType: string) {
  const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
    start(controller) {
      controller.enqueue(bytesFor(body));
      controller.close();
    },
  });
  const init: RequestInit & { duplex: "half" } = {
    method: "POST",
    body: stream,
    headers: baseHeaders(contentType),
    duplex: "half",
  };
  return send(init);
}

export function fileOf(bytes: Uint8Array, name: string, type: string): File {
  return new File([bytesFor(bytes)], name, { type });
}

export function formWith(bytes: Uint8Array, name: string, type: string) {
  const form = new FormData();
  form.append("image", fileOf(bytes, name, type));
  return form;
}

export function multipart(
  boundary: string,
  bytes: Uint8Array,
  filename = "upload.bin",
  declaredType = "application/octet-stream",
): Uint8Array {
  const head = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="image"; filename="${filename}"\r\n` +
      `Content-Type: ${declaredType}\r\n\r\n`,
  );
  const tail = Buffer.from(`\r\n--${boundary}--\r\n`);
  return Buffer.concat([head, Buffer.from(bytes), tail]);
}

export function fixture(name: string): Buffer {
  return readFileSync(new URL(`../fixtures/${name}`, import.meta.url));
}
