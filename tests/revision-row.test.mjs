import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRevisionRow } from "../src/lib/revision-row.ts";

test("PostgREST revision numeric value is accepted", () => {
  assert.equal(parseRevisionRow({ revisao: 3 }), 3);
  assert.equal(parseRevisionRow({ revisao: 0 }), 0);
});
test("PostgREST revision as numeric string is accepted", () => {
  assert.equal(parseRevisionRow({ revisao: "123" }), 123);
});
test("missing, null, malformed and unsafe revision values are rejected", () => {
  for (const value of [null, undefined, {}, [], { revisao: null }, { revisao: "" }, { revisao: "oops" }, { revisao: -1 }, { revisao: 1.5 }, { revisao: "9007199254740992" }]) {
    assert.equal(parseRevisionRow(value), null);
  }
});
