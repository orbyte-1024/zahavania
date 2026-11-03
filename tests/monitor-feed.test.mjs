import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canonicalArticleUrl, decodeEntities, parseFeed, stripMarkup } from "../lib/monitor/feed.ts";
import { MONITOR_DISTRICTS, monitorRegionsWithDistricts } from "../lib/monitor/districts.ts";
import { REGIONS } from "../lib/constants/regions.ts";

const now = new Date("2026-11-03T12:00:00Z");

const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
<title>Exemple &amp; Médias</title>
<item xml:lang="fr">
  <title><![CDATA[Cyclone à Mananjary : trois morts]]></title>
  <link>https://example.org/article?utm_source=rss#top</link>
  <pubDate>Tue, 03 Nov 2026 09:00:00 +0300</pubDate>
  <description><![CDATA[<p>La gendarmerie &amp; le maire ont parlé.</p><script>alert(1)</script>]]></description>
</item>
<item>
  <title>Doublon</title>
  <link>https://example.org/article</link>
  <pubDate>Tue, 03 Nov 2026 09:00:00 +0300</pubDate>
</item>
<item>
  <title>Lien interdit</title>
  <link>javascript:alert(1)</link>
  <pubDate>Tue, 03 Nov 2026 09:00:00 +0300</pubDate>
</item>
<item>
  <title>Sans date</title>
  <link>https://example.org/sans-date</link>
</item>
<item>
  <title>Trop en avance</title>
  <link>https://example.org/futur</link>
  <pubDate>Wed, 04 Nov 2026 12:00:00 +0000</pubDate>
</item>
</channel></rss>`;

test("RSS parsing keeps one clean item per canonical URL", () => {
  const feed = parseFeed(RSS, { now });
  assert.equal(feed.feedTitle, "Exemple & Médias");
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].url, "https://example.org/article");
  assert.equal(feed.items[0].publishedAt, "2026-11-03T06:00:00.000Z");
  assert.match(feed.items[0].excerpt, /gendarmerie & le maire/);
  assert.doesNotMatch(feed.items[0].excerpt, /script|alert|<p>/);
});

test("Atom entries and attribute links are supported", () => {
  const atom = `<feed><title>Fil</title><entry>
    <title>Un titre Atom</title>
    <link rel="alternate" href="https://example.org/atom"/>
    <updated>2026-11-03T08:30:00Z</updated>
    <summary>Résumé &amp; contexte</summary>
  </entry></feed>`;
  const feed = parseFeed(atom, { now });
  assert.equal(feed.items.length, 1);
  assert.equal(feed.items[0].url, "https://example.org/atom");
  assert.equal(feed.items[0].excerpt, "Résumé & contexte");
});

test("markup and entities are decoded without keeping tags", () => {
  assert.equal(decodeEntities("prix &#224; 2&nbsp;000&nbsp;ariary &#x2019;"), "prix à 2 000 ariary ’");
  assert.equal(stripMarkup("<p>Un <b>texte</b><br/>propre</p>"), "Un texte propre");
  assert.equal(canonicalArticleUrl("ftp://example.org/x"), null);
  assert.equal(
    canonicalArticleUrl("https://EXAMPLE.org/x?utm_medium=rss&fbclid=1&id=2"),
    "https://example.org/x?id=2",
  );
});

test("audited sources and districts cover every region defined by the app", () => {
  const sources = JSON.parse(readFileSync(new URL("../data/monitor-sources.json", import.meta.url), "utf8"));
  assert.ok(sources.sources.length >= 5);
  assert.equal(new Set(sources.sources.map((source) => source.id)).size, sources.sources.length);
  for (const source of sources.sources) {
    assert.match(source.feedUrl, /^https:\/\//);
    assert.ok(source.checkedAt);
    assert.ok(["fr", "mg", "en"].includes(source.lang));
  }
  for (const source of sources.sources.filter((entry) => entry.scope === "international")) {
    assert.ok(source.requireTerms.length > 0, `${source.id} requires a Madagascar term filter`);
  }

  assert.equal(MONITOR_DISTRICTS.regions.length, REGIONS.length);
  const districts = MONITOR_DISTRICTS.regions.flatMap((region) => region.districts);
  assert.equal(districts.length, 114);
  assert.equal(new Set(districts.map((district) => district.id)).size, districts.length);
  assert.deepEqual(
    monitorRegionsWithDistricts().map((region) => region.id),
    [...REGIONS],
  );
  for (const region of MONITOR_DISTRICTS.regions) {
    assert.ok(REGIONS.includes(region.id), `unknown region ${region.id}`);
    assert.ok(region.districts.length > 0, `no district in ${region.id}`);
  }
});
