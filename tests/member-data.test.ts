import { test } from "node:test";
import assert from "node:assert/strict";
import { seedDemo } from "../src/lib/demo";
import { memberSnapshot } from "../src/lib/member-data";
test("member portal payload includes only own records, even for admin identity", () => {
  const data = seedDemo();
  for (const id of ["demo-0", "demo-1"]) {
    const result = memberSnapshot(data, id);
    assert.equal(result.member.id, id);
    assert.ok(result.purchases.every((p) => p.member_id === id));
    assert.ok(result.bonuses.every((b) => b.member_id === id));
    assert.equal("members" in result, false);
    assert.equal("audits" in result, false);
    assert.equal("centers" in result, false);
  }
});
