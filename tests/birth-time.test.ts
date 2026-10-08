import assert from "node:assert/strict";
import { test } from "node:test";
import { formatBirthTime, parseBirthTime, type BirthTimeParts } from "../src/lib/birth-time";

test("midnight and noon use 12 with the correct explicit period", () => {
  assert.deepEqual(parseBirthTime("00:00"), { period: "am", hour: "12", minute: "00" });
  assert.deepEqual(parseBirthTime("00:59"), { period: "am", hour: "12", minute: "59" });
  assert.deepEqual(parseBirthTime("12:00"), { period: "pm", hour: "12", minute: "00" });
  assert.deepEqual(parseBirthTime("12:59"), { period: "pm", hour: "12", minute: "59" });
  assert.equal(formatBirthTime({ period: "am", hour: "12", minute: "00" }), "00:00");
  assert.equal(formatBirthTime({ period: "pm", hour: "12", minute: "00" }), "12:00");
});

test("an afternoon birth time maps to visible PM selections and persists HH:mm", () => {
  const selections = { period: "pm", hour: "2", minute: "35" } satisfies BirthTimeParts;
  assert.deepEqual(parseBirthTime("14:35"), selections);
  assert.equal(formatBirthTime(selections), "14:35");
  assert.equal(formatBirthTime({ ...selections, period: "am" }), "02:35");
});

test("every minute across all 24 hours round-trips without changing its instant", () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const original = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const selections = parseBirthTime(original);
      assert.ok(selections);
      assert.equal(formatBirthTime(selections), original);
    }
  }
});

test("missing and malformed stored times never become valid selections", () => {
  for (const value of [undefined, null, "", "2:35", "24:00", "12:60", "-1:00", "12:0", "00:00:00", " 14:35", "14:35 ", "14:35\n", "오후 2:35"]) {
    assert.equal(parseBirthTime(value), null, `unexpected valid time: ${String(value)}`);
  }
});

test("incomplete and out-of-range selections never produce a submitted birth time", () => {
  const valid = { period: "am", hour: "1", minute: "00" } satisfies BirthTimeParts;
  for (const hour of ["", "0", "13", "-1", "1.5", "01", " 1", "1\n"]) {
    assert.equal(formatBirthTime({ ...valid, hour }), null);
  }
  for (const minute of ["", "0", "60", "-1", "1.5", "000", " 00", "00\n"]) {
    assert.equal(formatBirthTime({ ...valid, minute }), null);
  }
  assert.equal(formatBirthTime({ ...valid, period: "other" } as unknown as BirthTimeParts), null);
});
