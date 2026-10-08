"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import type { SessionState } from "@/lib/types";

type ConfirmResult = { usage: SessionState["usage"] };

function PaymentConfirmation() {
  const params = useSearchParams();
  const paymentKey = params.get("paymentKey");
  const orderId = params.get("orderId");
  const amount = Number(params.get("amount"));
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const request = useRef<Promise<ConfirmResult> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!paymentKey || !orderId || !Number.isSafeInteger(amount) || amount <= 0) { setError("결제 정보가 올바르지 않습니다. 주문 내역을 확인해 주세요."); return; }
    if (!request.current) request.current = fetch("/api/payments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentKey, orderId, amount }) }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "결제 상태를 확인하지 못했습니다.");
      return data as ConfirmResult;
    });
    request.current.then((data) => { if (!cancelled) setResult(data); }).catch((failure: Error) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [paymentKey, orderId, amount, attempt]);

  return <div className="payment-result"><div className="payment-icon">{result ? <Check size={27} strokeWidth={1.5} /> : error ? <Sparkles size={26} strokeWidth={1.2} /> : <LoaderCircle size={27} className="spin" />}</div><h1>{result ? "결제가 완료되었습니다" : error ? "결제 확인이 필요합니다" : "결제를 확인하고 있습니다"}</h1><p>{result ? <>대화 이용권 5회가 추가되었습니다.<br />일반 대화 또는 심화 대화에 사용할 수 있습니다.</> : error ? <>이용권 지급 여부를 확인하지 못했습니다.<br />다시 확인해도 같은 주문으로 중복 지급되지 않습니다.</> : <>결제 승인 상태를 확인한 뒤<br />대화 이용권을 계정에 반영합니다.</>}</p>{result && <div className="payment-usage">남은 대화 이용권 <strong>{result.usage.paidRemaining}회</strong></div>}{error && <><div className="form-error" role="alert">{error}</div>{paymentKey && orderId && <button className="secondary-button payment-retry" onClick={() => { request.current = null; setError(""); setAttempt((value) => value + 1); }}><RefreshCw size={14} />다시 확인하기</button>}</>}<Link href="/" className="primary-button">{result ? "대화 계속하기" : "별결로 돌아가기"}<ArrowRight size={16} /></Link></div>;
}

export default function PaymentSuccessPage() {
  return <main className="payment-page"><Link href="/" className="payment-brand">✧ 별결</Link><Suspense fallback={<div className="payment-icon"><LoaderCircle size={26} className="spin" /></div>}><PaymentConfirmation /></Suspense><p className="payment-note">결제 확인 후 대화 이용권이 계정에 반영됩니다.</p></main>;
}
