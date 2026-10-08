"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Moon } from "lucide-react";

function FailureMessage() {
  const params = useSearchParams();
  const cancelled = params.get("code") === "PAY_PROCESS_CANCELED" || params.get("code") === "USER_CANCEL";
  const message = params.get("message")?.slice(0, 300);
  return <div className="payment-result"><div className="payment-icon"><Moon size={28} strokeWidth={1.3} /></div><h1>{cancelled ? "결제가 취소되었습니다" : "결제를 완료하지 못했습니다"}</h1><p>이번 결제로 이용권이 추가되지 않았습니다.<br />원하실 때 다시 진행할 수 있습니다.</p>{message && <div className="form-error" role="alert">{message}</div>}<Link href="/" className="primary-button">별결로 돌아가기<ArrowRight size={16} /></Link></div>;
}

export default function PaymentFailPage() {
  return <main className="payment-page"><Link href="/" className="payment-brand">✧ 별결</Link><Suspense><FailureMessage /></Suspense><p className="payment-note">일반 대화는 매일 3회 무료로 이용할 수 있습니다.</p></main>;
}
