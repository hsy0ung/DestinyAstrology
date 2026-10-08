import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "별결 — 나를 이해하는 또 하나의 시선",
  description: "사주와 점성술을 함께 읽고, 당신의 고민을 구체적인 다음 걸음으로 연결합니다.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
