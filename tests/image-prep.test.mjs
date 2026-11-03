import test from "node:test";
import assert from "node:assert/strict";
import { fitWithin, toDeviceExif, UPLOAD_MAX_BYTES, UPLOAD_MAX_EDGE } from "../lib/browser/image-prep.ts";
import { summarizeExifTags } from "../lib/exif-summary.ts";

test("images are scaled down to the max edge, never up, keeping the ratio", () => {
  assert.deepEqual(fitWithin(4000, 3000, 2000), { width: 2000, height: 1500 });
  assert.deepEqual(fitWithin(3000, 4000, 2000), { width: 1500, height: 2000 });
  assert.deepEqual(fitWithin(800, 600, 2000), { width: 800, height: 600 });
  assert.equal(UPLOAD_MAX_EDGE, 2000);
  assert.ok(UPLOAD_MAX_BYTES < 4.5 * 1000 * 1000, "must stay under the Vercel request limit");
});

test("device EXIF keeps dates as stored and only says whether GPS exists", () => {
  const exif = toDeviceExif({
    DateTimeOriginal: "2026:10:30 08:12:00",
    Make: "samsung",
    Model: "SM-A155F",
    GPSLatitude: [18, 54, 32.1],
    GPSLongitude: [47, 31, 12.4],
    latitude: -18.9089,
    longitude: 47.52,
  });
  assert.deepEqual(exif, {
    dateTaken: "2026:10:30 08:12:00",
    creationDate: null,
    camera: "samsung SM-A155F",
    software: null,
    hasGPS: true,
  });
  assert.ok(!JSON.stringify(exif).includes("47.52") && !JSON.stringify(exif).includes("18.9"));
});

test("no EXIF or empty EXIF gives nothing to send", () => {
  assert.equal(toDeviceExif(undefined), null);
  assert.equal(toDeviceExif({}), null);
  assert.equal(toDeviceExif({ Software: "   " }), null);
});

test("the browser and the server summarize the same tags the same way", () => {
  const tags = { CreateDate: "2026:01:02 10:00:00", Make: "Canon", Model: "Canon EOS 90D", Software: "GIMP 2.10" };
  const server = summarizeExifTags(tags);
  const device = toDeviceExif(tags);
  assert.equal(device.camera, "Canon EOS 90D");
  assert.deepEqual({ ...device, available: true }, server);
});
