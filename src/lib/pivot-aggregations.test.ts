import assert from "node:assert/strict";

import { aggregatePercentage } from "./pivot-aggregations";

function run() {
  const weighted = aggregatePercentage([
    { numerator: 200, denominator: 1000 },
    { numerator: 90, denominator: 300 },
  ]);
  assert.equal(weighted, 22.31);

  const noData = aggregatePercentage([]);
  assert.equal(noData, null);

  const zeroDenominator = aggregatePercentage([{ numerator: 10, denominator: 0 }]);
  assert.equal(zeroDenominator, null);

  const winnerPct = aggregatePercentage([
    { numerator: 500, denominator: 1000 },
    { numerator: 200, denominator: 800 },
  ]);
  assert.equal(winnerPct, 38.89);

  const marginPct = aggregatePercentage([
    { numerator: 100, denominator: 1000 },
    { numerator: 40, denominator: 500 },
  ]);
  assert.equal(marginPct, 9.33);
}

run();
