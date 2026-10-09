import { loadEnvConfig } from "@next/env";
import { calculateChart } from "../src/lib/chart";
import { generateAdvice } from "../src/lib/advice";
import type { BirthProfile } from "../src/lib/types";

let envError = false;
loadEnvConfig(process.cwd(), process.env.NODE_ENV !== "production", {
  info() {},
  error() { envError = true; },
});

async function main() {
  if (envError) throw new Error("환경 설정 파일을 읽지 못했습니다. .env.local의 형식과 읽기 권한을 확인해 주세요.");
  if (!process.env.ASTRO_AI_API_KEY?.trim()) {
    throw new Error("AI API 키가 없습니다. 프로젝트 폴더에서 npm run setup:ai를 먼저 실행해 주세요.");
  }

  console.log("가상의 출생 정보와 질문으로 AI 응답 1회를 확인합니다. API 사용료가 발생합니다.");
  const profile: BirthProfile = {
    name: "연결 확인용 가상 프로필",
    birthDate: "1995-08-11",
    birthTime: "14:35",
    city: "서울",
    timezone: "Asia/Seoul",
    latitude: 37.5665,
    longitude: 126.978,
  };
  const result = await generateAdvice(
    "업무의 우선순위를 정하고 이번 주에 실천할 행동을 알려 주세요.",
    "standard",
    profile,
    calculateChart(profile),
    [],
  );
  if (result.source !== "ai") throw new Error("실제 AI 응답을 확인하지 못했습니다.");
  console.log("AI 연결 확인 성공: 성향·사주·점성술·통합 해석·실행 계획·후속 질문 형식이 모두 유효합니다.");
  console.log("개발 서버를 실행하고 브라우저에서 새 질문을 보내 실제 대화를 확인해 주세요.");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "AI 연결을 확인하지 못했습니다. 설정을 확인해 주세요.");
  process.exitCode = 1;
});
