import assert from "node:assert/strict";
import {
  isScoring360ConfigManager,
  parseScoring360LaunchDays,
  scoring360CycleForLaunchDate,
} from "../server/scoring360-policy.mjs";

assert.deepEqual(parseScoring360LaunchDays("", 15), [1, 15]);
assert.deepEqual(parseScoring360LaunchDays("15", 15), [15]);
assert.deepEqual(parseScoring360LaunchDays("15, 1, bad, 32, 1", 15), [1, 15]);

const firstRound = scoring360CycleForLaunchDate(new Date("2026-06-01T07:00:00+08:00"));
assert.equal(firstRound.id, "2026-05-round1-360");
assert.equal(firstRound.label, "2026年5月协同360评分 · 第1轮");
assert.equal(firstRound.startDate, "2026-05-01");
assert.equal(firstRound.endDate, "2026-05-31");
assert.equal(firstRound.round, 1);

const secondRound = scoring360CycleForLaunchDate(new Date("2026-06-15T07:00:00+08:00"));
assert.equal(secondRound.id, "2026-05-round2-360");
assert.equal(secondRound.label, "2026年5月协同360评分 · 第2轮");
assert.equal(secondRound.startDate, "2026-05-01");
assert.equal(secondRound.endDate, "2026-05-31");
assert.equal(secondRound.round, 2);

assert.equal(isScoring360ConfigManager({ openId: "mock_manager", name: "Demo Manager" }), true);
assert.equal(isScoring360ConfigManager({ openId: "", name: "Demo Manager" }), true);
assert.equal(isScoring360ConfigManager({ openId: "", name: "Demo" }), false);
assert.equal(isScoring360ConfigManager({ openId: "", name: "Manager" }), false);
assert.equal(isScoring360ConfigManager({ openId: "", name: "普通同事" }), false);

console.log("scoring360 policy checks passed");
