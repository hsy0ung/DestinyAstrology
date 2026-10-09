import { constants } from "node:fs";
import { lstat, open, link, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

export const AI_PROVIDERS = Object.freeze({
  openai: { label: "OpenAI", model: "gpt-4o-mini" },
  gemini: { label: "Gemini", model: "gemini-2.5-flash" },
  claude: { label: "Claude", model: "claude-sonnet-4-20250514" },
});
const AI_KEYS = new Set(["ASTRO_AI_PROVIDER", "ASTRO_AI_MODEL", "ASTRO_AI_API_KEY"]);

export class AiSetupError extends Error {}

export class SetupCancelledError extends AiSetupError {
  constructor() { super("설정을 취소했습니다. 파일은 변경하지 않았습니다."); }
}

function checkCancellation(signal) {
  if (signal?.aborted) throw new SetupCancelledError();
}

export function resolveAiSettings(input, existing = {}) {
  const provider = input.provider;
  if (!Object.hasOwn(AI_PROVIDERS, provider)) throw new AiSetupError("AI 제공업체는 openai, gemini, claude 중에서 선택해 주세요.");
  const sameProvider = provider === (existing.provider || "openai");
  const model = input.model || (sameProvider && existing.model) || AI_PROVIDERS[provider].model;
  const key = input.key || (sameProvider ? existing.key : "");
  if (typeof model !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(model)) throw new AiSetupError("모델 이름에는 영문, 숫자와 모델 식별 기호만 사용할 수 있습니다.");
  if (typeof key !== "string" || !key) throw new AiSetupError("선택한 AI 제공업체의 API 키를 입력해 주세요.");
  if (/[\s\x00-\x1f\x7f-\x9f]/u.test(key)) throw new AiSetupError("API 키에 공백이나 제어 문자가 포함되어 있습니다. 키만 다시 입력해 주세요.");
  return { provider, model, key };
}

function envValue(value) {
  // Next expands dollar references even in quoted values; escape literal dollars.
  const escaped = value.replaceAll("$", "\\$");
  if (!escaped.includes("'")) return `'${escaped}'`;
  if (!escaped.includes("`")) return `\`${escaped}\``;
  if (!escaped.includes('"') && !/\\[nr]/.test(escaped)) return `"${escaped}"`;
  throw new AiSetupError("API 키에 환경 설정 파일로 안전하게 저장할 수 없는 따옴표 조합이 있습니다.");
}

export function updateAiEnv(source, input) {
  const settings = resolveAiSettings(input);
  const bom = source.startsWith("\uFEFF") ? "\uFEFF" : "";
  const body = source.slice(bom.length);
  // Match logical dotenv assignments, including multiline quotes. Values inside
  // another variable's quotes must never be mistaken for AI assignments.
  const assignment = /^([ \t]*(?:export[ \t]+)?([\w.-]+)(?:[ \t]*=[ \t]*|:[ \t]+))(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?[ \t]*(?:#.*)?$/dgm;
  const removals = [];
  for (const match of body.matchAll(assignment)) {
    const value = (match[3] || "").trim();
    const nextValue = value || body.slice(match.indices[1][1]).trimStart();
    if ((["'", '"', "`"].includes(value[0]) && value.at(-1) !== value[0])
      || (!value && ["'", '"', "`"].includes(nextValue[0]))) {
      throw new AiSetupError("기존 환경 설정에 닫히지 않은 따옴표가 있습니다. 해당 설정을 확인한 뒤 다시 실행해 주세요.");
    }
    if (AI_KEYS.has(match[2])) removals.push([match.indices[0][0], match.indices[3]?.[1] ?? match.indices[1][1]]);
  }
  let preserved = "";
  let offset = 0;
  for (const [start, end] of removals) {
    preserved += body.slice(offset, start);
    offset = end;
  }
  preserved += body.slice(offset);
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  if (preserved && !/[\r\n]$/.test(preserved)) preserved += newline;
  return bom + preserved + [
    `ASTRO_AI_PROVIDER=${settings.provider}`,
    `ASTRO_AI_MODEL=${envValue(settings.model)}`,
    `ASTRO_AI_API_KEY=${envValue(settings.key)}`,
    "",
  ].join(newline);
}

function sameFile(first, second) {
  return first.dev === second.dev && first.ino === second.ino && first.size === second.size
    && first.mtimeMs === second.mtimeMs && first.ctimeMs === second.ctimeMs;
}

export async function readEnvSnapshot(path) {
  let before;
  try { before = await lstat(path); }
  catch (error) {
    if (error?.code === "ENOENT") return { path, exists: false, content: "" };
    throw new AiSetupError("환경 설정 파일을 확인할 수 없습니다. 폴더와 파일의 읽기 권한을 확인해 주세요.");
  }
  if (before.isSymbolicLink() || !before.isFile()) throw new AiSetupError(".env.local은 일반 파일이어야 합니다. 심볼릭 링크나 폴더는 사용할 수 없습니다.");
  let handle;
  try {
    handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const stat = await handle.stat();
    const content = await handle.readFile("utf8");
    const after = await lstat(path);
    if (!sameFile(before, stat) || !sameFile(stat, after) || after.isSymbolicLink()) throw new Error("changed");
    return { path, exists: true, content, stat };
  } catch {
    throw new AiSetupError("환경 설정 파일이 변경되었거나 읽을 수 없습니다. 다른 편집을 마친 뒤 다시 실행해 주세요.");
  } finally { await handle?.close(); }
}

async function assertUnchanged(snapshot) {
  const current = await readEnvSnapshot(snapshot.path);
  if (snapshot.exists !== current.exists || snapshot.content !== current.content
    || (snapshot.exists && !sameFile(snapshot.stat, current.stat))) {
    throw new AiSetupError("설정 중 .env.local이 변경되었습니다. 기존 파일을 덮어쓰지 않았습니다. 다시 실행해 주세요.");
  }
}

export async function saveAiEnv(snapshot, settings, { signal } = {}) {
  checkCancellation(signal);
  const content = updateAiEnv(snapshot.content, settings);
  await assertUnchanged(snapshot);
  const temporary = join(dirname(snapshot.path), `${basename(snapshot.path)}.${randomUUID()}.tmp`);
  let handle;
  try {
    handle = await open(temporary, "wx", 0o600);
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close(); handle = undefined;
    checkCancellation(signal);
    await assertUnchanged(snapshot);
    checkCancellation(signal);
    if (snapshot.exists) await rename(temporary, snapshot.path);
    else await link(temporary, snapshot.path); // Atomic creation cannot overwrite a concurrently created file.
  } catch (error) {
    if (error instanceof AiSetupError) throw error;
    throw new AiSetupError("AI 설정 파일을 저장하지 못했습니다. 폴더 권한과 기존 파일의 변경 여부를 확인해 주세요.");
  } finally {
    await handle?.close();
    await unlink(temporary).catch(() => {});
  }
}
