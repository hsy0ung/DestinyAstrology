import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateChart, validateBirthProfile } from "../src/lib/chart";
import { generateAdvice } from "../src/lib/advice";
import type { Advice, BirthProfile } from "../src/lib/types";

const base: BirthProfile = {
  name: "민감이름테스트",
  birthDate: "2005-12-23",
  birthTime: "08:37",
  city: "상하이",
  timezone: "Asia/Shanghai",
  latitude: 31.2304,
  longitude: 121.4737,
};

test("solar-calendar pillars match the lunar library's published 2005 fixture", () => {
  const chart = calculateChart(base);
  assert.deepEqual(chart.pillars.map((pillar) => pillar.ganZhi), ["乙酉", "戊子", "辛巳", "壬辰"]);
  assert.equal(chart.dayMaster, "신금(辛金)");
  assert.equal(chart.elements.reduce((total, element) => total + element.count, 0), 8);
});

test("Korean solar-term boundary uses the instant instead of Beijing's wall-clock hour", () => {
  const before = calculateChart({ ...base, birthDate: "2024-02-04", birthTime: "17:26", timezone: "Asia/Seoul" });
  const after = calculateChart({ ...base, birthDate: "2024-02-04", birthTime: "17:28", timezone: "Asia/Seoul" });
  assert.equal(before.pillars[0].ganZhi, "癸卯");
  assert.equal(after.pillars[0].ganZhi, "甲辰");
  assert.notEqual(before.pillars[1].ganZhi, after.pillars[1].ganZhi);
  assert.equal(before.pillars[2].ganZhi, after.pillars[2].ganZhi);
});

test("day and hour pillars use a consistent civil midnight rollover", () => {
  const late = calculateChart({ ...base, birthDate: "1988-02-15", birthTime: "23:30" });
  const nextDay = calculateChart({ ...base, birthDate: "1988-02-16", birthTime: "00:30" });
  assert.equal(late.pillars[2].ganZhi, "庚子");
  assert.equal(late.pillars[3].ganZhi, "丙子");
  assert.equal(nextDay.pillars[2].ganZhi, "辛丑");
  assert.equal(nextDay.pillars[3].ganZhi, "戊子");
});

test("J2000 tropical Sun/Moon longitudes match the documented astronomical epoch", () => {
  const greenwich = { ...base, birthDate: "2000-01-01", birthTime: "12:00", timezone: "Europe/London", latitude: 0, longitude: 0 };
  const chart = calculateChart(greenwich);
  assert.equal(chart.sun.sign, "염소자리");
  assert.ok(Math.abs(chart.sun.degree - 10.37) < 0.02);
  assert.equal(chart.moon?.sign, "전갈자리");
  assert.ok(Math.abs((chart.moon?.degree ?? 0) - 13.32) < 0.02);
  // At this epoch and equatorial Greenwich, the eastern ecliptic horizon is in Aries.
  assert.equal(chart.ascendant?.sign, "양자리");
  assert.ok(Math.abs((chart.ascendant?.degree ?? 0) - 11.38) < 0.15);
  const seoul = calculateChart({ ...greenwich, birthTime: "21:00", timezone: "Asia/Seoul", latitude: 37.5665, longitude: 126.978 });
  assert.deepEqual(seoul.sun, chart.sun);
  assert.deepEqual(seoul.moon, chart.moon);
  assert.notDeepEqual(seoul.ascendant, chart.ascendant);
});

test("unknown time omits hour/ascendant and omits Moon on a lunar sign transition day", () => {
  const stable = calculateChart({ ...base, birthDate: "2000-01-01", birthTime: null, timezone: "Europe/London" });
  const transition = calculateChart({ ...base, birthDate: "2000-01-02", birthTime: null, timezone: "Europe/London" });
  assert.equal(stable.pillars.length, 3);
  assert.equal(stable.ascendant, null);
  assert.equal(stable.moon?.sign, "전갈자리");
  assert.equal(transition.moon, null);
  assert.ok(transition.notes.some((note) => note.includes("달 별자리를 확정할 수 없습니다")));
  assert.equal(stable.elements.reduce((total, element) => total + element.count, 0), 6);
});

test("invalid calendars, future dates, DST gaps and ambiguous offsets are rejected", () => {
  assert.throws(() => validateBirthProfile({ ...base, birthDate: "2023-02-29" }), /실제 양력/);
  assert.throws(() => validateBirthProfile({ ...base, birthDate: "2999-01-01" }), /미래/);
  assert.throws(() => validateBirthProfile({ ...base, birthDate: "2024-03-10", birthTime: "02:30", timezone: "America/New_York" }), /존재하지 않는/);
  assert.throws(() => validateBirthProfile({ ...base, birthDate: "2024-11-03", birthTime: "01:30", timezone: "America/New_York" }), /두 번 존재/);
  assert.throws(() => validateBirthProfile({ ...base, timezone: "Not/A_Timezone" }), /시간대/);
  assert.throws(() => validateBirthProfile({ ...base, latitude: 100 }), /출생 도시/);
  assert.equal(validateBirthProfile({ ...base, birthDate: "2024-02-29", birthTime: null }).birthDate, "2024-02-29");
});

test("demo answers disclose the source and adapt chart interpretation and concrete actions", async () => {
  const previous = process.env.ASTRO_AI_API_KEY;
  delete process.env.ASTRO_AI_API_KEY;
  try {
    const answer = await generateAdvice("이직이 고민이에요", "deep", base, calculateChart(base), []);
    assert.equal(answer.source, "demo");
    assert.match(answer.answer.summary, /실제 AI 대화가 아닌/);
    assert.match(answer.answer.saju, /신금/);
    assert.doesNotMatch(answer.answer.personality, /신금\(辛金\)와/);
    assert.ok(answer.answer.actions.some((action) => action.includes("실제 공고")));
    assert.equal(answer.answer.actions.length, 4);
    const aries = await generateAdvice("새로운 일이 고민입니다", "standard", base, { ...calculateChart(base), sun: { sign: "양자리", degree: 15 } }, []);
    assert.doesNotMatch(`${aries.answer.personality} ${aries.answer.integration}`, /시도을/);
    await assert.rejects(() => generateAdvice("고민", "standard", base, calculateChart(base), []), /5~2,000자/);
    await assert.rejects(() => generateAdvice("가".repeat(2001), "standard", base, calculateChart(base), []), /5~2,000자/);
  } finally {
    if (previous === undefined) delete process.env.ASTRO_AI_API_KEY;
    else process.env.ASTRO_AI_API_KEY = previous;
  }
});

test("all providers parse structured answers without transmitting the birth profile", async (t) => {
  const valid: Advice = { summary: "고민의 방향", personality: "가능한 성향", saju: "일간 근거", astrology: "태양 근거", integration: "관점 통합", actions: ["실행 1", "실행 2"], followUp: "무엇이 중요한가요?" };
  const originalFetch = globalThis.fetch;
  const oldKey = process.env.ASTRO_AI_API_KEY;
  const oldProvider = process.env.ASTRO_AI_PROVIDER;
  const oldModel = process.env.ASTRO_AI_MODEL;
  process.env.ASTRO_AI_API_KEY = "test-placeholder";
  delete process.env.ASTRO_AI_MODEL;
  try {
    for (const provider of ["openai", "gemini", "claude"]) {
      await t.test(provider, async () => {
        process.env.ASTRO_AI_PROVIDER = provider;
        globalThis.fetch = async (_url, options) => {
          const sent = String(options?.body);
          assert.ok(!sent.includes(base.name));
          assert.ok(!sent.includes(base.birthDate));
          assert.ok(!sent.includes(base.birthTime!));
          assert.match(sent, /고민/);
          const body = provider === "openai" ? { choices: [{ message: { content: JSON.stringify(valid) } }] }
            : provider === "gemini" ? { candidates: [{ content: { parts: [{ text: JSON.stringify(valid) }] } }] }
            : { content: [{ type: "tool_use", name: "deliver_advice", input: valid }] };
          return new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });
        };
        assert.deepEqual(await generateAdvice("고민을 정리하고 싶어요", "standard", base, calculateChart(base), []), { answer: valid, source: "ai" });
      });
    }
    process.env.ASTRO_AI_PROVIDER = "openai";
    globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ summary: "invalid" }) } }] }));
    await assert.rejects(() => generateAdvice("고민이 있습니다", "standard", base, calculateChart(base), []), /답변 형식/);
    globalThis.fetch = async () => new Response("sensitive provider body", { status: 401 });
    await assert.rejects(() => generateAdvice("고민이 있습니다", "standard", base, calculateChart(base), []), /연결 설정/);
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of [["ASTRO_AI_API_KEY", oldKey], ["ASTRO_AI_PROVIDER", oldProvider], ["ASTRO_AI_MODEL", oldModel]]) {
      if (value === undefined) delete process.env[name!];
      else process.env[name!] = value;
    }
  }
});
