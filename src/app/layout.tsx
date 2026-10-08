import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "별결 — 사주와 점성술 통합 상담",
  description: "사주와 점성술을 함께 분석해 사용자의 성향과 고민에 맞는 판단 기준, 실행 계획을 제안합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
