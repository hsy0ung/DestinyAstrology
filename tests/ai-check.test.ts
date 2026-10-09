import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const projectRequire = createRequire(join(process.cwd(), "package.json"));
const tsxCli = projectRequire.resolve("tsx/cli");
const checkScript = resolve("scripts/check-ai.ts");
const dummyKey = "fixture-only-private-key-not-real";
const providerPrivateBody = "provider-private-body-must-not-be-printed";
const validAdvice = {
  summary: "우선순위를 정할 기준을 먼저 확인하세요.",
  personality: "계획을 세우는 방식을 실제 경험과 비교해 보세요.",
  saju: "계산된 일간을 성향을 돌아보는 참고로 사용하세요.",
  astrology: "계산된 태양 별자리의 상징을 경험과 비교해 보세요.",
  integration: "두 관점은 이번 주 작은 행동을 고르는 참고 자료입니다.",
  actions: ["중요한 업무 두 가지를 정해 주세요.", "이번 주 한 가지 행동을 실행하고 결과를 기록하세요."],
  followUp: "현재 가장 중요한 업무는 무엇인가요?",
};

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
type Scenario = "success" | "unauthorized" | "invalid-json";
function runCheck(hasKey: boolean, scenario: Scenario, verify: (result: ReturnType<typeof spawnSync>, calls: Call[], directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "destiny-ai-check-"));
  try {
    const capturePath = join(directory, "requests.jsonl");
    const preloadPath = join(directory, "mock-fetch.mjs");
    writeFileSync(join(directory, ".env.local"), [
      "ASTRO_AI_PROVIDER=openai",
      "ASTRO_AI_MODEL=gpt-4o-mini",
      ...(hasKey ? [`ASTRO_AI_API_KEY=${dummyKey}`] : []),
      "",
    ].join("\n"), { mode: 0o600 });
    // Every fetch is intercepted in the actual CLI process. No external request is possible.
    writeFileSync(preloadPath, `
      import { appendFileSync } from "node:fs";
      const scenario = ${JSON.stringify(scenario)};
      globalThis.fetch = async (input, init) => {
        appendFileSync(${JSON.stringify(capturePath)}, JSON.stringify({
          url: String(input), headers: Object.fromEntries(new Headers(init?.headers)),
          body: JSON.parse(String(init?.body)),
        }) + "\\n");
        if (scenario === "unauthorized") {
          return new Response(JSON.stringify({ error: ${JSON.stringify(providerPrivateBody)}, credential: ${JSON.stringify(dummyKey)} }), { status: 401 });
        }
        if (scenario === "invalid-json") {
          return new Response(JSON.stringify({ choices: [{ message: { content: ${JSON.stringify(providerPrivateBody + ": " + dummyKey)} } }] }), { status: 200 });
        }
        return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(${JSON.stringify(validAdvice)}) } }] }), { status: 200 });
      };
    `);
    // tsx launches the checker in a child Node process, so forward --import through its CLI.
    const result = spawnSync(process.execPath, [tsxCli, "--import", pathToFileURL(preloadPath).href, checkScript], {
      cwd: directory,
      // Do not inherit real credentials, NODE_OPTIONS, user configuration or database paths.
      env: { PATH: process.env.PATH ?? "", NODE_ENV: "development" },
      encoding: "utf8",
      timeout: 15_000,
    });
    assert.equal(result.error, undefined, "the check CLI must complete within its test deadline");
    assert.equal(result.signal, null);
    const calls = existsSync(capturePath) ? readFileSync(capturePath, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line) as Call) : [];
    assert.equal(existsSync(join(directory, ".data")), false, "connection checks must not create account or conversation storage");
    const output = String(result.stdout) + String(result.stderr);
    assert.equal(output.includes(dummyKey), false, "credentials must not appear in CLI output");
    assert.equal(output.includes(providerPrivateBody), false, "provider response bodies must not appear in CLI output");
    verify(result, calls, directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("check:ai without a key fails before any provider request or account storage", () => {
  runCheck(false, "success", (result, calls) => {
    assert.notEqual(result.status, 0);
    assert.match(String(result.stderr), /AI API 키가 없습니다/);
    assert.equal(String(result.stdout).includes("AI 연결 확인 성공"), false);
    assert.equal(calls.length, 0);
  });
});

test("check:ai reads its working directory's .env.local and makes exactly one structured synthetic request", () => {
  runCheck(true, "success", (result, calls) => {
    assert.equal(result.status, 0);
    assert.match(String(result.stdout), /AI 연결 확인 성공/);
    assert.equal(calls.length, 1);
    const call = calls[0];
    assert.equal(call.url, "https://api.openai.com/v1/chat/completions");
    assert.equal(call.headers.authorization, `Bearer ${dummyKey}`, "the key comes from the temporary env fixture rather than the parent environment");
    assert.equal(call.body.model, "gpt-4o-mini");
    const format = call.body.response_format as { type: string; json_schema: { strict: boolean; schema: { additionalProperties: boolean; required: string[]; properties: Record<string, unknown> } } };
    assert.equal(format.type, "json_schema");
    assert.equal(format.json_schema.strict, true);
    assert.equal(format.json_schema.schema.additionalProperties, false);
    assert.deepEqual([...format.json_schema.schema.required].sort(), Object.keys(validAdvice).sort());
    assert.deepEqual(Object.keys(format.json_schema.schema.properties).sort(), Object.keys(validAdvice).sort());
    const messages = call.body.messages as { role: string; content: string }[];
    assert.deepEqual(messages.map((message) => message.role), ["system", "user"]);
    const payload = JSON.parse(messages[1].content);
    assert.equal(payload.question, "업무의 우선순위를 정하고 이번 주에 실천할 행동을 알려 주세요.");
    assert.equal(payload.mode, "standard");
    assert.deepEqual(payload.history, []);
    assert.ok(Array.isArray(payload.chart.pillars));
    assert.ok(payload.chart.sun.sign);
    assert.equal("profile" in payload, false);
    for (const identifier of ["연결 확인용 가상 프로필", "1995-08-11", "14:35"]) {
      assert.equal(messages[1].content.includes(identifier), false, "personal profile values must be excluded from the outbound request");
    }
  });
});

test("check:ai reports unauthorized keys without exposing credentials or provider details", () => {
  runCheck(true, "unauthorized", (result, calls) => {
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 1);
    assert.match(String(result.stderr), /AI 연결 설정을 확인/);
    assert.equal(String(result.stdout).includes("AI 연결 확인 성공"), false);
  });
});

test("check:ai rejects malformed structured replies without claiming success or printing their content", () => {
  runCheck(true, "invalid-json", (result, calls) => {
    assert.notEqual(result.status, 0);
    assert.equal(calls.length, 1);
    assert.match(String(result.stderr), /완전한 답변을 반환하지 못했습니다/);
    assert.equal(String(result.stdout).includes("AI 연결 확인 성공"), false);
  });
});
