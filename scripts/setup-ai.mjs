import nextEnv from "@next/env";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AI_PROVIDERS, AiSetupError, SetupCancelledError, readEnvSnapshot, resolveAiSettings, saveAiEnv } from "./ai-env.mjs";

/**
 * @param {string} question
 * @param {{input: import('node:stream').Readable, output: import('node:stream').Writable, signal?: AbortSignal, hidden?: boolean}} options
 */
export function promptForInput(question, { input, output, signal, hidden = false }) {
  if (signal?.aborted) return Promise.reject(new SetupCancelledError());
  return new Promise((accept, reject) => {
    const terminalOutput = hidden ? new Writable({ write(_chunk, _encoding, callback) { callback(); } }) : output;
    const reader = createInterface({ input, output: terminalOutput, terminal: true });
    let finished = false;
    const finish = (error, answer) => {
      if (finished) return;
      finished = true;
      reader.close();
      signal?.removeEventListener("abort", cancel);
      if (hidden) output.write("\n");
      if (error) reject(error); else accept(answer);
    };
    const cancel = () => finish(new SetupCancelledError());
    reader.once("SIGINT", cancel);
    reader.once("close", cancel);
    signal?.addEventListener("abort", cancel, { once: true });
    if (hidden) output.write(question);
    reader.question(hidden ? "" : question, answer => finish(null, answer));
  });
}

/** @param {{input?: import('node:stream').Readable & {isTTY?: boolean}, output?: import('node:stream').Writable & {isTTY?: boolean}, argv?: string[], projectDir?: string}} options */
export async function runSetup({
  input = process.stdin, output = process.stdout, argv = process.argv.slice(2),
  projectDir = resolve(dirname(fileURLToPath(import.meta.url)), ".."),
} = {}) {
  const cancellation = new AbortController();
  const cancel = () => cancellation.abort();
  process.once("SIGINT", cancel);
  try {
    if (argv.length) throw new AiSetupError("명령줄 인수는 받지 않습니다. npm run setup:ai로 실행하고 API 키는 숨김 입력창에 입력해 주세요.");
    if (!input.isTTY || !output.isTTY) throw new AiSetupError("이 설정은 터미널에서 직접 실행해야 합니다. API 키를 명령줄 인수나 파이프로 전달하지 마세요.");
    const snapshot = await readEnvSnapshot(join(projectDir, ".env.local"));
    nextEnv.loadEnvConfig(projectDir, true, { info() {}, error() { throw new AiSetupError("기존 환경 설정을 읽지 못했습니다. 설정 파일 문법을 확인해 주세요."); } }, true);
    const existing = {
      provider: (process.env.ASTRO_AI_PROVIDER || "openai").toLowerCase(),
      model: process.env.ASTRO_AI_MODEL,
      key: process.env.ASTRO_AI_API_KEY,
    };
    const defaultProvider = Object.hasOwn(AI_PROVIDERS, existing.provider) ? existing.provider : "openai";
    output.write("AI 제공업체를 선택하고 API 키를 입력하면 이 컴퓨터의 .env.local에 저장합니다. 키는 화면에 표시되지 않습니다.\n");
    const prompt = (question, hidden = false) => promptForInput(question, { input, output, signal: cancellation.signal, hidden });
    const provider = (await prompt(`제공업체 (openai / gemini / claude) [${defaultProvider}]: `)).trim().toLowerCase() || defaultProvider;
    if (!Object.hasOwn(AI_PROVIDERS, provider)) throw new AiSetupError("AI 제공업체는 openai, gemini, claude 중에서 선택해 주세요.");
    const defaultModel = provider === existing.provider && existing.model ? existing.model : AI_PROVIDERS[provider].model;
    const model = (await prompt(`모델 [${defaultModel}]: `)).trim() || defaultModel;
    const canKeepKey = provider === existing.provider && !!existing.key;
    const key = await prompt(`API 키${canKeepKey ? " (Enter: 기존 키 유지)" : ""}: `, true);
    const settings = resolveAiSettings({ provider, model, key }, existing);
    await saveAiEnv(snapshot, settings, { signal: cancellation.signal });
    output.write(`${AI_PROVIDERS[provider].label} 연결 설정을 저장했습니다. npm run check:ai로 연결을 확인한 뒤 개발 서버를 다시 시작해 주세요.\n`);
    return 0;
  } catch (error) {
    output.write(`${error instanceof AiSetupError ? error.message : "AI 설정을 완료하지 못했습니다. 다시 실행해 주세요."}\n`);
    return error instanceof SetupCancelledError ? 130 : 1;
  } finally { process.removeListener("SIGINT", cancel); }
}

if (typeof import.meta.url === "string" && process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runSetup().then(code => { process.exitCode = code; });
}
