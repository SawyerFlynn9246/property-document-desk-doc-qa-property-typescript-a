import assert from "node:assert/strict";
import test from "node:test";
import { kindsForQuestion } from "../src/property_knowledge.js";

test("an urgent leak question searches maintenance requests only", () => {
  assert.deepEqual(
    kindsForQuestion("Which urgent kitchen leak is still waiting for repair?"),
    ["maintenance_request"],
  );
});

test("a broad question keeps every property document type in play", () => {
  assert.deepEqual(kindsForQuestion("What changed at Cedar Court this week?"), [
    "maintenance_request",
    "inspection_reminder",
    "tenant_document",
  ]);
});
