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
    if (!paymentKey || !orderId || !Number.isSafeInteger(amount) || amount <= 0) { setError("결제 정보가 올바르지 않아요. 주문 내역을 확인해 주세요."); return; }
    if (!request.current) request.current = fetch("/api/payments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paymentKey, orderId, amount }) }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "결제 상태를 확인하지 못했어요.");
      return data as ConfirmResult;
    });
    request.current.then((data) => { if (!cancelled) setResult(data); }).catch((failure: Error) => { if (!cancelled) setError(failure.message); });
    return () => { cancelled = true; };
  }, [paymentKey, orderId, amount, attempt]);

  return <div className="payment-result"><div className="payment-icon">{result ? <Check size={27} strokeWidth={1.5} /> : error ? <Sparkles size={26} strokeWidth={1.2} /> : <LoaderCircle size={27} className="spin" />}</div><h1>{result ? "이야기를 더 이어 가요" : error ? "결제 확인이 필요해요" : "결제를 확인하고 있어요"}</h1><p>{result ? <>대화 5회가 충전되었어요.<br />마음에 남아 있는 이야기를 계속 나눠 주세요.</> : error ? <>충전 여부를 확인하지 못했어요.<br />다시 확인하면 같은 주문은 중복 충전되지 않아요.</> : <>안전하게 결제를 확인한 뒤<br />대화 횟수를 채워 드릴게요.</>}</p>{result && <div className="payment-usage">현재 충전 대화 <strong>{result.usage.paidRemaining}회</strong></div>}{error && <><div className="form-error" role="alert">{error}</div>{paymentKey && orderId && <button className="secondary-button payment-retry" onClick={() => { request.current = null; setError(""); setAttempt((value) => value + 1); }}><RefreshCw size={14} />다시 확인하기</button>}</>}<Link href="/" className="primary-button">{result ? "대화 계속하기" : "별결로 돌아가기"}<ArrowRight size={16} /></Link></div>;
}

export default function PaymentSuccessPage() {
  return <main className="payment-page"><Link href="/" className="payment-brand">✧ 별결</Link><Suspense fallback={<div className="payment-icon"><LoaderCircle size={26} className="spin" /></div>}><PaymentConfirmation /></Suspense><p className="payment-note">결제 확인 후 대화 횟수가 계정에 반영됩니다.</p></main>;
}
