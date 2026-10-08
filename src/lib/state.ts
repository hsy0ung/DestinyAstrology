import { getProfile, getConversations, getUsage, type User } from "./db";
import type { SessionState } from "./types";

export function aiAvailable() { return !!process.env.ASTRO_AI_API_KEY?.trim(); }
export function paymentAvailable() {
  return aiAvailable() && !!process.env.ASTRO_TOSS_CLIENT_KEY?.trim() && !!(process.env.ASTRO_TOSS_AUTH_HEADER?.trim() || process.env.TOSS_SECRET_KEY?.trim());
}

export function sessionState(user: User | null): SessionState {
  return {
    user: user ? { id: user.id, name: user.name, email: user.email } : null,
    profile: user ? getProfile(user.id) : null,
    usage: user ? getUsage(user.id) : { freeRemaining: 3, paidRemaining: 0, resetsAt: "" },
    conversations: user ? getConversations(user.id) : [],
    config: { aiAvailable: aiAvailable(), paymentAvailable: paymentAvailable(), price: 5000, credits: 5 },
  };
}
