import { loadEnvConfig } from "@next/env";
import { calculateChart } from "../src/lib/chart";
import { AiProviderError, generateAdvice } from "../src/lib/advice";
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
  if (error instanceof AiProviderError) {
    console.error(`AI 연결 확인 실패 (HTTP ${error.providerStatus})${error.providerCode ? ` · ${error.providerCode}` : ""}`);
    if (error.providerStatus === 401) {
      console.error("API 키가 인증되지 않았습니다. 선택한 AI 제공업체에서 발급한 키인지 확인하고, npm run setup:ai로 다시 입력해 주세요.");
    } else if (error.providerStatus === 403) {
      console.error(error.providerCode === "unsupported_country_region_territory"
        ? "AI 제공업체가 현재 접속 지역을 지원하지 않습니다. 제공업체의 공식 지원 지역을 확인해 주세요."
        : "AI 제공업체에서 접근이 거부되었습니다. API 키의 모델 호출 권한, 프로젝트 권한 및 지원 지역을 확인해 주세요.");
    } else if (error.providerStatus === 429) {
      console.error(error.providerCode === "insufficient_quota"
        ? "AI 제공업체의 API 잔액·결제 상태·사용 한도를 확인해 주세요. 같은 명령을 반복하기 전에 해당 설정을 확인해야 합니다."
        : error.providerCode === "rate_limit_exceeded"
          ? "AI 제공업체의 요청 한도에 도달했습니다. 잠시 기다린 뒤 다시 시도해 주세요."
          : "AI 제공업체의 요청 한도 또는 사용 한도에 도달했습니다. 요청 제한과 결제·잔액을 확인한 뒤 다시 시도해 주세요.");
    } else if (error.providerStatus === 404) {
      console.error("모델 이름과 해당 계정의 모델 접근 권한을 확인해 주세요. npm run setup:ai에서 선택한 제공업체에 맞는 모델을 설정할 수 있습니다.");
    } else {
      console.error("AI 제공업체의 서비스 상태와 모델 설정을 확인해 주세요.");
    }
    console.error("API 키나 .env.local 내용은 공유하지 마세요. 도움이 필요하면 위 HTTP 상태와 안내 문구만 알려 주세요.");
  } else {
    console.error(error instanceof Error ? error.message : "AI 연결을 확인하지 못했습니다. 설정을 확인해 주세요.");
  }
  process.exitCode = 1;
});
