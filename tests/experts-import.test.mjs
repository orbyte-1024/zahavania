import test from "node:test";
import assert from "node:assert/strict";

const { IMPORT_COLUMNS, expertId, parseCsv, validateExperts } = await import("../lib/experts/import.ts");

const HEADER = IMPORT_COLUMNS.join(",");

function csv(...rows) {
  return [HEADER, ...rows].join("\n");
}

const VALID = 'Test Person,Économiste,"Institut Test, Antananarivo",academic,economy_finance|statistics_demography,mg|fr,analamanga,"Prix du riz, inflation",test@example.org,+261 00 000 00 00,granted,2026-10-01,Entretien du 1er octobre,2026-10-02';

test("a valid row becomes a non-fictional expert with a stable id", () => {
  const { experts, issues } = validateExperts(csv(VALID));
  assert.deepEqual(issues, []);
  assert.equal(experts.length, 1);
  const [expert] = experts;
  assert.equal(expert.is_fictional, false);
  assert.equal(expert.organization, "Institut Test, Antananarivo");
  assert.deepEqual(expert.domains, ["economy_finance", "statistics_demography"]);
  assert.deepEqual(expert.languages, ["mg", "fr"]);
  assert.equal(expert.id, expertId("test  person", "Institut Test, Antananarivo"));
  assert.match(expert.id, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("semicolon files from Excel keep commas inside fields", () => {
  const semicolon = [IMPORT_COLUMNS.join(";"), "Test Person;;;;health;fr;;Santé, vaccination;;;public_info;;Site officiel;2026-10-02"].join("\r\n");
  const { experts, issues } = validateExperts(semicolon);
  assert.deepEqual(issues, []);
  assert.equal(experts[0].bio, "Santé, vaccination");
  assert.equal(experts[0].org_type, null);
  assert.deepEqual(experts[0].regions, []);
});

test("every problem is reported by line and field, and nothing is kept from a bad row", () => {
  const rows = [
    "X,,,robot,cooking,de,atlantis,,not-an-email,,granted,,,2999-01-01",
    VALID,
    VALID.replace("Test Person", "test person"),
  ];
  const { experts, issues } = validateExperts(csv(...rows));
  const at = (line) => issues.filter((issue) => issue.line === line).map((issue) => issue.field).sort();
  assert.deepEqual(at(2), ["consent_date", "contact_email", "domains.0", "full_name", "info_source", "languages.0", "last_verified_at", "org_type", "regions.0"].sort());
  assert.deepEqual(at(4), ["full_name"]);
  assert.match(issues.find((issue) => issue.line === 4).message, /duplicate of line 3/);
  assert.equal(experts.length, 1);
});

test("missing or unknown columns stop the import before any row is read", () => {
  const { experts, issues } = validateExperts("full_name,phone\nA,1");
  assert.equal(experts.length, 0);
  assert.ok(issues.some((issue) => issue.field === "domains" && issue.message === "missing column"));
  assert.ok(issues.some((issue) => issue.field === "phone" && issue.message === "unknown column"));
});

test("the CSV parser handles quotes, escaped quotes, BOM and blank lines", () => {
  assert.deepEqual(parseCsv('﻿a,b\n"x, ""y""",z\n\n'), [["a", "b"], ['x, "y"', "z"]]);
});
