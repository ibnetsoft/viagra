import { test } from "node:test";
import assert from "node:assert/strict";
import { allocateBonus, terms, rank } from "../src/lib/domain";
import { demoCredit, seedDemo } from "../src/lib/demo";
test("only remaining 20,000 is paid; excess 70,000 expires", () => {
  assert.deepEqual(allocateBonus(90000, 1500000, 1480000), {
    gross: 90000,
    paid: 20000,
    expired: 70000,
  });
  assert.deepEqual(allocateBonus(90000, 1500000, 1500000), {
    gross: 90000,
    paid: 0,
    expired: 90000,
  });
});
test("topups only credit PV without orders, cap or bonuses", () => {
  assert.equal(terms.initial.cap, 1500000);
  assert.equal(terms.repeat.cap, 1500000);
  const original = seedDemo(),
    id = crypto.randomUUID();
  const updated = demoCredit(original, "demo-0", "입금 확인", id);
  assert.equal(updated.members[0].pv, 500000);
  assert.equal(updated.members[0].bonus_limit, original.members[0].bonus_limit);
  assert.deepEqual(updated.bonuses, original.bonuses);
  assert.deepEqual(updated.purchases, original.purchases);
  assert.equal(updated.topups?.length, 8);

  const retried = demoCredit(updated, "demo-0", "재시도", id);
  assert.deepEqual(updated, retried);
});
test("invalid financial amounts rejected", () => {
  for (const n of [-1, 1.5, NaN, Infinity])
    assert.throws(() => allocateBonus(n, 1500000, 0));
});
test("center owner is displayed as center grade", () => {
  const data = seedDemo();
  assert.equal(rank(data.members[0], data.members, data.centers), "센터");
  assert.equal(rank(data.members[1], data.members, data.centers), "에이전트");
});
