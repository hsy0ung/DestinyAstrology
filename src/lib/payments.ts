import { getOrder, creditOrder, getUsage } from "./db";
import { AppError } from "./http";

type Payment = { orderId: string; paymentKey: string; totalAmount: number; status: string; currency: string };

function authorization() {
  // Proxy-backed credentials must be passed unchanged, rather than base64-encoding a placeholder.
  if (process.env.ASTRO_TOSS_AUTH_HEADER) return process.env.ASTRO_TOSS_AUTH_HEADER;
  if (process.env.TOSS_SECRET_KEY) return `Basic ${Buffer.from(process.env.TOSS_SECRET_KEY + ":").toString("base64")}`;
  throw new AppError("결제 서비스가 아직 준비되지 않았습니다.", 503, "PAYMENT_UNAVAILABLE");
}

async function providerRequest(path: string, init: RequestInit = {}) {
  const response = await fetch(`https://api.tosspayments.com${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: authorization(), ...init.headers },
    signal: AbortSignal.timeout(20_000),
  });
  const payload = await response.json() as Payment & { code?: string };
  return { response, payload };
}

export async function confirmPayment(userId: string, orderId: string, paymentKey: string, amount: number) {
  const order = getOrder(userId, orderId);
  if (!order) throw new AppError("결제 주문을 찾을 수 없습니다.", 404);
  if (amount !== order.amount) throw new AppError("결제 금액이 주문 금액과 일치하지 않습니다.");
  if (order.status === "paid") {
    if (order.paymentKey !== paymentKey) throw new AppError("이미 처리된 주문입니다.", 409);
    return getUsage(userId);
  }
  let { response, payload } = await providerRequest("/v1/payments/confirm", {
    method: "POST",
    headers: { "Idempotency-Key": order.id },
    body: JSON.stringify({ orderId, paymentKey, amount: order.amount }),
  });
  if (!response.ok && payload.code === "ALREADY_PROCESSED_PAYMENT") {
    ({ response, payload } = await providerRequest(`/v1/payments/${encodeURIComponent(paymentKey)}`));
  }
  if (!response.ok) throw new AppError("결제 승인을 확인하지 못했습니다. 다시 시도해 주세요.", 502, "PAYMENT_FAILED");
  if (payload.status !== "DONE" || payload.orderId !== order.id || payload.paymentKey !== paymentKey || payload.totalAmount !== order.amount || payload.currency !== "KRW") {
    throw new AppError("결제 정보가 주문과 일치하지 않습니다. 이용권을 지급하지 않았습니다.", 502, "PAYMENT_MISMATCH");
  }
  creditOrder(userId, orderId, paymentKey);
  return getUsage(userId);
}
