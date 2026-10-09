import assert from "node:assert/strict";
import { test } from "node:test";
import { chmod, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import { PassThrough, Writable } from "node:stream";
import { AI_PROVIDERS, SetupCancelledError, readEnvSnapshot, resolveAiSettings, saveAiEnv, updateAiEnv } from "../scripts/ai-env.mjs";
import { promptForInput, runSetup } from "../scripts/setup-ai.mjs";

const settings = { provider: "openai", model: AI_PROVIDERS.openai.model, key: "dummy-key-for-tests" };

async function inDirectory(run: (directory: string, file: string) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), "destiny-ai-env-test-"));
  try { await run(directory, join(directory, ".env.local")); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

function fakeTerminal() {
  let text = "";
  const rawModes: boolean[] = [];
  const input = Object.assign(new PassThrough(), { isTTY: true, setRawMode(value: boolean) { rawModes.push(value); } });
  const output = Object.assign(new Writable({ write(chunk, _encoding, callback) { text += String(chunk); callback(); } }), { isTTY: true });
  return { input, output, rawModes, text: () => text };
}

test("AI defaults match the provider, and existing keys survive only for the same provider", () => {
  for (const provider of ["openai", "gemini", "claude"]) {
    const selected = resolveAiSettings({ provider, model: "", key: "dummy-any-prefix" }, settings);
    assert.equal(selected.model, AI_PROVIDERS[provider as keyof typeof AI_PROVIDERS].model);
    assert.equal(selected.key, "dummy-any-prefix");
  }
  assert.equal(resolveAiSettings({ provider: "openai", model: "", key: "" }, settings).key, settings.key);
  assert.throws(() => resolveAiSettings({ provider: "gemini", model: "", key: "" }, settings), /API 키를 입력/);
  assert.throws(() => resolveAiSettings({ provider: "unknown", model: "", key: "dummy" }), /제공업체/);
  for (const key of ["", "dummy key", "dummy\tkey", "dummy\nkey", "dummy\0key", "dummy\x7fkey"]) {
    assert.throws(() => resolveAiSettings({ ...settings, key }), error => error instanceof Error && !error.message.includes(key || "unexpected-value") && /API 키/.test(error.message));
  }
});

test("dotenv updates preserve comments, unrelated multiline values, BOM and CRLF while removing duplicates", async () => {
  const original = [
    "\uFEFF# 결제 설정은 보존합니다.",
    'ASTRO_TOSS_CLIENT_KEY="dummy-toss" # 결제 주석',
    'PRIVATE_KEY="첫 번째 줄',
    "ASTRO_AI_API_KEY=inside-another-value",
    '마지막 줄"',
    "SINGLE_KEY='여러 줄",
    "ASTRO_AI_PROVIDER=inside-single-quotes",
    "끝'",
    "BACKTICK_KEY=`여러 줄",
    "ASTRO_AI_MODEL=inside-backticks",
    "끝`",
    "NEXT_LINE_KEY=",
    '"다음 줄에서 시작',
    'ASTRO_AI_API_KEY=also-preserved"',
    "export ASTRO_AI_PROVIDER = claude # 제공업체 주석",
    "ASTRO_AI_API_KEY: old-dummy-key # 기존 키 설명",
    "ASTRO_AI_API_KEY='second-dummy-key'",
    "ASTRO_AI_MODEL=old-model",
    "# ASTRO_AI_API_KEY=comment-only",
    "ASTRO_DB_PATH=.data/keep.sqlite",
  ].join("\r\n");
  const result = updateAiEnv(original, { ...settings, key: "dummy$key#suffix" });
  assert.ok(result.startsWith("\uFEFF# 결제 설정은 보존합니다.\r\n"));
  for (const fragment of [
    'ASTRO_TOSS_CLIENT_KEY="dummy-toss" # 결제 주석',
    'PRIVATE_KEY="첫 번째 줄\r\nASTRO_AI_API_KEY=inside-another-value\r\n마지막 줄"',
    "SINGLE_KEY='여러 줄\r\nASTRO_AI_PROVIDER=inside-single-quotes\r\n끝'",
    "BACKTICK_KEY=`여러 줄\r\nASTRO_AI_MODEL=inside-backticks\r\n끝`",
    'NEXT_LINE_KEY=\r\n"다음 줄에서 시작\r\nASTRO_AI_API_KEY=also-preserved"',
    "# 제공업체 주석", "# 기존 키 설명", "# ASTRO_AI_API_KEY=comment-only", "ASTRO_DB_PATH=.data/keep.sqlite",
  ]) assert.ok(result.includes(fragment));
  assert.ok(!result.includes("old-dummy-key"));
  assert.ok(!result.includes("second-dummy-key"));
  assert.ok(!result.includes("old-model"));
  assert.ok(!/(?<!\r)\n/.test(result));

  await inDirectory(async (directory, file) => {
    await writeFile(file, result);
    // Load in a separate native Node process so Next's dotenv state cannot affect other tests.
    const envModule = pathToFileURL(join(process.cwd(), "node_modules/@next/env/dist/index.js")).href;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      import assert from 'node:assert/strict';
      import nextEnv from ${JSON.stringify(envModule)};
      nextEnv.loadEnvConfig(${JSON.stringify(directory)}, true, {info(){}, error(){throw new Error('fixture parse failed');}}, true);
      assert.equal(process.env.ASTRO_AI_PROVIDER, 'openai');
      assert.equal(process.env.ASTRO_AI_MODEL, 'gpt-4o-mini');
      assert.equal(process.env.ASTRO_AI_API_KEY, 'dummy$key#suffix');
      assert.equal(process.env.ASTRO_TOSS_CLIENT_KEY, 'dummy-toss');
      assert.equal(process.env.PRIVATE_KEY, '첫 번째 줄\\nASTRO_AI_API_KEY=inside-another-value\\n마지막 줄');
    `], { encoding: "utf8", env: { PATH: process.env.PATH, NODE_ENV: "development" } });
    assert.equal(child.status, 0, child.stderr);
  });
});

test("unterminated quoted values stop updates instead of removing embedded assignments", () => {
  for (const source of ['OTHER="unfinished\nASTRO_AI_API_KEY=keep\n', 'OTHER=\n"unfinished\nASTRO_AI_API_KEY=keep\n']) {
    assert.throws(() => updateAiEnv(source, settings), /닫히지 않은 따옴표/);
  }
});

test("atomic save creates or replaces a private 0600 file without leftover temporary files", async () => {
  await inDirectory(async (directory, file) => {
    await saveAiEnv(await readEnvSnapshot(file), settings);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(directory), [".env.local"]);
    await writeFile(file, "# 유지\nASTRO_DB_PATH=.data/keep.sqlite\n", { mode: 0o644 });
    await chmod(file, 0o644);
    await saveAiEnv(await readEnvSnapshot(file), { ...settings, provider: "gemini", model: AI_PROVIDERS.gemini.model });
    assert.ok((await readFile(file, "utf8")).includes("ASTRO_DB_PATH=.data/keep.sqlite"));
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.deepEqual(await readdir(directory), [".env.local"]);
  });
});

test("concurrent modification or creation is never overwritten", async () => {
  await inDirectory(async (directory, file) => {
    const missing = await readEnvSnapshot(file);
    await writeFile(file, "# 다른 편집에서 생성\n");
    await assert.rejects(() => saveAiEnv(missing, settings), /변경되었습니다/);
    const original = await readEnvSnapshot(file);
    await writeFile(file, "# 다른 편집에서 수정\n");
    await assert.rejects(() => saveAiEnv(original, settings), /변경되었습니다/);
    assert.equal(await readFile(file, "utf8"), "# 다른 편집에서 수정\n");
    assert.deepEqual(await readdir(directory), [".env.local"]);
  });
});

test("symbolic links, including dangling links, are refused without changing their destinations", async () => {
  await inDirectory(async (directory, file) => {
    const destination = join(directory, "keep.env");
    await writeFile(destination, "# 원본\n");
    await symlink(destination, file);
    await assert.rejects(() => readEnvSnapshot(file), /심볼릭 링크/);
    assert.equal(await readFile(destination, "utf8"), "# 원본\n");
    await rm(file);
    await symlink(join(directory, "missing.env"), file);
    await assert.rejects(() => readEnvSnapshot(file), /심볼릭 링크/);
  });
});

test("cancelled saves leave the original file unchanged", async () => {
  await inDirectory(async (directory, file) => {
    await writeFile(file, "# 취소 전 파일\n");
    const cancellation = new AbortController();
    cancellation.abort();
    const snapshot = await readEnvSnapshot(file);
    await assert.rejects(() => saveAiEnv(snapshot, settings, { signal: cancellation.signal }), SetupCancelledError);
    assert.equal(await readFile(file, "utf8"), "# 취소 전 파일\n");
    assert.deepEqual(await readdir(directory), [".env.local"]);
  });
});

test("secret input stays hidden and the terminal leaves raw mode after entry or Ctrl+C", async () => {
  for (const cancel of [false, true]) {
    const terminal = fakeTerminal();
    const answer = promptForInput("API 키: ", { ...terminal, hidden: true });
    terminal.input.write("dummy-hidden-key");
    terminal.input.write(cancel ? "\x03" : "\r");
    if (cancel) await assert.rejects(answer, SetupCancelledError);
    else assert.equal(await answer, "dummy-hidden-key");
    assert.ok(!terminal.text().includes("dummy-hidden-key"));
    assert.equal(terminal.rawModes.at(-1), false);
    terminal.input.destroy(); terminal.output.destroy();
  }
});

test("non-TTY input and command arguments are rejected before reading or changing files", async () => {
  await inDirectory(async (directory, file) => {
    await writeFile(file, "# 사용자 설정\n");
    for (const argv of [[], ["dummy-key-in-argument"]]) {
      const terminal = fakeTerminal();
      Object.assign(terminal.input, { isTTY: false });
      assert.equal(await runSetup({ ...terminal, projectDir: directory, argv }), 1);
      assert.ok(!terminal.text().includes("dummy-key-in-argument"));
      assert.equal(await readFile(file, "utf8"), "# 사용자 설정\n");
      terminal.input.destroy(); terminal.output.destroy();
    }
  });
});
