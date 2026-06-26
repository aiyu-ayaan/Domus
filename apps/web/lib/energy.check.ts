// Runnable self-check for the tariff/cost math (money path). Run: `bun run apps/web/lib/energy.check.ts`
import { computeCost, type FlatTariff, type TieredTariff } from "./energy";
import assert from "node:assert";

const flat: FlatTariff = { type: "flat", currency: "₹", rate: 8, fixedCharge: 50 };
assert.strictEqual(computeCost(250, flat), 2050); // 250*8 + 50

const tiered: TieredTariff = {
  type: "tiered",
  currency: "₹",
  fixedCharge: 0,
  tiers: [
    { upTo: 100, rate: 3 },
    { upTo: 300, rate: 5 },
    { upTo: null, rate: 7 },
  ],
};
assert.strictEqual(computeCost(40, tiered), 120); // 40*3
assert.strictEqual(computeCost(250, tiered), 1050); // 100*3 + 150*5
assert.strictEqual(computeCost(400, tiered), 2000); // 100*3 + 200*5 + 100*7
assert.strictEqual(computeCost(0, tiered), 0);

console.log("energy.check OK");
