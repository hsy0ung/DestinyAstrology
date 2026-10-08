"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, Compass, CreditCard, Heart, History, LoaderCircle, LogOut, Menu, MessageCircle, Moon, Plus, Settings2, ShieldCheck, Sparkles, Sun, Telescope, Trash2, UserRound, X } from "lucide-react";
import { CITIES, CITY_GROUPS, type Advice, type BirthProfile, type Conversation, type SessionState } from "@/lib/types";
import { Modal } from "@/components/modal";
import { StarWheel } from "@/components/star-wheel";
import { BirthTimeInput } from "@/components/birth-time-input";

type ModalName = "auth" | "profile" | "premium" | "settings" | "delete" | "about" | null;
type ChatResult = { conversation: Conversation; usage: SessionState["usage"] };
type Order = { orderId: string; amount: number; orderName: string; clientKey: string; customerKey: string };
type TossPayment = { payment: (options: { customerKey: string }) => { requestPayment: (options: Record<string, unknown>) => Promise<void> } };
declare global { interface Window { TossPayments?: (clientKey: string) => TossPayment } }

const prompts = [
  { icon: Compass, name: "일과 커리어", question: "지금 하는 일이 나와 잘 맞는지 모르겠어요. 제 강점을 살릴 방향을 찾고 싶어요.", description: "강점과 직무 적합성 살펴보기", color: "sage" },
  { icon: Heart, name: "사랑과 관계", question: "관계에서 자꾸 비슷한 갈등이 반복돼요. 제 성향을 이해하고 더 건강하게 소통하고 싶어요.", description: "관계에서 반복되는 갈등 정리하기", color: "rose" },
  { icon: UserRound, name: "나에 대한 이해", question: "제가 무엇을 원하고 어떤 사람인지 더 깊이 이해하고 싶어요. 제 성향과 강점을 알려 주세요.", description: "성향과 행동 패턴 분석하기", color: "lavender" },
  { icon: Telescope, name: "선택과 변화", question: "새로운 도전을 앞두고 걱정이 많아요. 제 성향에 맞게 결정을 준비하는 방법을 알고 싶어요.", description: "선택의 기준과 다음 행동 정하기", color: "sand" },
];

const sampleAnswer: Advice = {
  summary: "이직 여부를 바로 결정하기보다, 현재 업무의 적합성과 관심 분야의 실제 업무를 먼저 비교해 보세요.",
  personality: "이 예시는 준비와 안정성을 중요하게 여기는 사람을 가정합니다. 신중함은 강점이지만, 조건을 모두 갖추려다 결정을 미루는 경향이 있는지 확인할 필요가 있습니다.",
  saju: "예시 사주의 목(木)은 성장, 토(土)는 안정과 관련된 상징으로 해석합니다. 새로운 분야에 대한 관심과 현재 기반을 유지하려는 요구를 함께 살펴볼 수 있습니다.",
  astrology: "예시 차트의 태양은 자기 표현, 달은 정서적 안정을 살펴보는 상징으로 사용합니다. 업무에서 원하는 인정과 실패에 대한 부담을 구분하면 선택 기준을 정리하는 데 도움이 됩니다.",
  integration: "두 해석을 종합하면, 현재 일을 유지하면서 관심 분야를 작게 경험해 보는 방안을 검토할 수 있습니다. 실제 직무, 소득과 생활 조건을 비교한 뒤 결정해 주세요.",
  actions: ["이번 주에 관심 분야 종사자 한 명과 20분 동안 실제 업무와 진입 조건을 확인해 보세요.", "현재 업무에서 집중이 잘되는 일과 부담이 큰 일을 3일 동안 기록해 보세요.", "관심 분야의 작은 프로젝트를 2시간 진행하고, 업무 적합성과 필요한 역량을 정리해 보세요."],
  followUp: "현재 업무에서 유지하고 싶은 조건과 바꾸고 싶은 조건은 각각 무엇인가요?",
};

async function api<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: method ?? (body ? "POST" : "GET"), headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."), { code: data.code, status: response.status });
  return data as T;
}

function Brand({ small = false }: { small?: boolean }) {
  return <div className={`brand ${small ? "brand-small" : ""}`}><span className="brand-symbol"><Sparkles size={23} strokeWidth={1.3} /></span><span>별결<span className="brand-latin">BYEOLGYEOL</span></span></div>;
}

function ancestors(conversations: Conversation[], id: string): Conversation[] {
  const byId = new Map(conversations.map((item) => [item.id, item]));
  const chain: Conversation[] = [];
  const visited = new Set<string>();
  let current = byId.get(id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id); chain.unshift(current);
    current = current.parentId ? byId.get(current.parentId) : undefined;
  }
  return chain;
}

function threads(conversations: Conversation[]) {
  const groups = new Map<string, { root: Conversation; latest: Conversation }>();
  for (const item of conversations) {
    const root = ancestors(conversations, item.id)[0] ?? item;
    const existing = groups.get(root.id);
    if (!existing || item.createdAt > existing.latest.createdAt) groups.set(root.id, { root, latest: item });
  }
  return [...groups.values()].sort((a, b) => b.latest.createdAt.localeCompare(a.latest.createdAt));
}

function Exchange({ conversation }: { conversation: Conversation }) {
  return <div className="conversation-exchange"><div className="user-message"><span className="question-label">질문</span><p>{conversation.question}</p></div><div className="assistant-message"><div className="assistant-heading"><span className="assistant-avatar"><Sparkles size={19} strokeWidth={1.4} /></span><strong>별결</strong><span>사주 · 점성술 통합 해석</span></div><Answer answer={conversation.answer} sample={conversation.source === "demo"} mode={conversation.mode} /><details className="chart-details"><summary>해석 범위와 출생 시간 안내<ChevronDown size={13} /></summary><div className="pillar-row">{conversation.chart.pillars.map((pillar) => <div key={pillar.label}><span>{pillar.label}</span><strong>{pillar.ganZhi}</strong><small>{pillar.element}</small></div>)}</div><ul>{conversation.chart.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details><p className="answer-disclaimer">사주와 점성술의 해석은 자기 이해를 위한 참고 자료입니다. 실제 상황과 경험을 함께 고려해 주세요.</p></div></div>;
}

function Answer({ answer, sample, mode }: { answer: Advice; sample?: boolean; mode?: string }) {
  return <div className="answer-content">
    {sample && <div className="sample-label"><Sparkles size={13} />예시 답변 · AI 연결 전</div>}
    <p className="answer-lead">{answer.summary}</p>
    <section className="answer-section"><h3><UserRound size={16} /> 성향 분석</h3><p>{answer.personality}</p></section>
    <div className="reading-pair"><section><div className="reading-label"><span className="saju-mark">木</span> 사주 해석</div><p>{answer.saju}</p></section><section><div className="reading-label"><Moon size={15} /> 점성술 해석</div><p>{answer.astrology}</p></section></div>
    <section className="answer-section integration-section"><h3><Sparkles size={16} /> 통합 해석</h3><p>{answer.integration}</p></section>
    <section className="answer-section"><h3><Compass size={16} /> 실행 계획</h3><ol className="action-list">{answer.actions.map((action, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>)}</ol></section>
    <div className="follow-up"><MessageCircle size={17} /><p>{answer.followUp}</p></div>
    {mode === "deep" && <div className="response-meta"><Sparkles size={12} /> 심화 대화</div>}
  </div>;
}

export default function Home() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<ModalName>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [showSample, setShowSample] = useState(false);
  const [question, setQuestion] = useState("");
  const [mode, setMode] = useState<"standard" | "deep">("standard");
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [unknownTime, setUnknownTime] = useState(false);
  const [consent, setConsent] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"toss" | "kakao" | "card">("card");
  const composer = useRef<HTMLTextAreaElement>(null);
  const drawer = useRef<HTMLElement>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const retry = useRef<{ question: string; mode: string; parentId: string | null; id: string } | null>(null);
  const active = session?.conversations.find((conversation) => conversation.id === activeId);
  const activeChain = activeId ? ancestors(session?.conversations ?? [], activeId) : [];
  const conversationThreads = threads(session?.conversations ?? []);
  const chart = active?.chart;
  const closeModal = useCallback(() => { setModal(null); setFormError(""); }, []);

  useEffect(() => {
    const controller = new AbortController();
    api<SessionState>("/api/session", undefined, undefined, controller.signal).then((next) => { if (!controller.signal.aborted) setSession((previous) => previous?.user ? previous : next); }).catch((err: Error) => { if (!controller.signal.aborted) setError(err.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => { if (activeId || sending) bottom.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [activeId, sending]);
  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const controls = () => Array.from(drawer.current?.querySelectorAll<HTMLButtonElement>("button:not([disabled])") ?? []);
    controls()[0]?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawerOpen(false);
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0]; const last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); previous?.focus(); };
  }, [drawerOpen]);
  useEffect(() => {
    if (!session || sending || busy) return;
    const controller = new AbortController();
    const refresh = () => { api<SessionState>("/api/session", undefined, undefined, controller.signal).then((next) => { if (!controller.signal.aborted) setSession(next); }).catch(() => {}); };
    window.addEventListener("focus", refresh);
    const resetTime = Date.parse(session.usage.resetsAt);
    const timer = session.user && Number.isFinite(resetTime) ? window.setTimeout(refresh, Math.max(1000, resetTime - Date.now() + 1000)) : null;
    return () => { controller.abort(); window.removeEventListener("focus", refresh); if (timer !== null) window.clearTimeout(timer); };
  }, [session, sending, busy]);

  function open(name: ModalName) {
    setFormError("");
    if (name === "profile") { setUnknownTime(session?.profile ? !session.profile.birthTime : false); setConsent(false); }
    if (name === "auth") setConsent(false);
    setModal(name); setDrawerOpen(false);
  }
  function newChat() { retry.current = null; setActiveId(null); setShowSample(false); setQuestion(""); setMode("standard"); setError(""); setDrawerOpen(false); composer.current?.focus(); }
  function choosePrompt(value: string) { setQuestion(value); setShowSample(false); setActiveId(null); composer.current?.focus(); }

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError("");
    const values = new FormData(event.currentTarget);
    try {
      const next = await api<SessionState>("/api/auth", { action: authMode, email: values.get("email"), password: values.get("password"), name: values.get("name"), consent });
      retry.current = null; setSession(next); setModal(next.profile ? null : "profile"); setConsent(false); setUnknownTime(false);
    } catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  }

  async function handleProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setFormError("");
    const values = new FormData(event.currentTarget);
    const city = CITIES.find((item) => item.city === values.get("city")) ?? CITIES[0];
    const profile: BirthProfile = { name: String(values.get("name") ?? ""), birthDate: String(values.get("birthDate") ?? ""), birthTime: unknownTime ? null : String(values.get("birthTime") ?? "") || null, city: city.city, timezone: city.timezone, latitude: city.latitude, longitude: city.longitude };
    try { setSession(await api<SessionState>("/api/profile", { profile, consent })); retry.current = null; setActiveId(null); setShowSample(false); setModal(null); composer.current?.focus(); }
    catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  }

  async function handleSend(event?: FormEvent) {
    event?.preventDefault(); const text = question.trim();
    if (!text || sending || loading) return;
    if (!session?.user) { open("auth"); return; }
    if (!session.profile) { open("profile"); return; }
    if ((mode === "deep" && session.usage.paidRemaining < 1) || (mode === "standard" && session.usage.freeRemaining + session.usage.paidRemaining < 1)) { open("premium"); return; }
    setSending(true); setError(""); setShowSample(false);
    if (!retry.current || retry.current.question !== text || retry.current.mode !== mode || retry.current.parentId !== activeId) retry.current = { question: text, mode, parentId: activeId, id: crypto.randomUUID() };
    try {
      const result = await api<ChatResult>("/api/chat", { question: text, mode, parentId: activeId, requestId: retry.current.id });
      setSession((previous) => previous ? { ...previous, usage: result.usage, conversations: [result.conversation, ...previous.conversations.filter((item) => item.id !== result.conversation.id)] } : previous);
      setActiveId(result.conversation.id); setQuestion(""); retry.current = null;
    } catch (err) {
      const failure = err as Error & { status?: number };
      setError(failure.message);
      if (failure.status === 401) open("auth");
      if (failure.status === 402) open("premium");
    } finally { setSending(false); }
  }

  async function logout() {
    setBusy(true); setFormError("");
    try { setSession(await api<SessionState>("/api/auth", { action: "logout" })); retry.current = null; setActiveId(null); setModal(null); setShowSample(false); setMode("standard"); }
    catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  }

  async function deleteAccount(event: FormEvent) {
    event.preventDefault(); setBusy(true); setFormError("");
    try { await api("/api/account", { confirmation: "DELETE" }, "DELETE"); setSession(await api<SessionState>("/api/session")); retry.current = null; setActiveId(null); setModal(null); setShowSample(false); setQuestion(""); }
    catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  }

  async function purchase() {
    if (!session?.user) { open("auth"); return; }
    if (!session.config.paymentAvailable) return;
    setBusy(true); setFormError("");
    try {
      const order = await api<Order>("/api/orders", {});
      if (!window.TossPayments) await new Promise<void>((resolve, reject) => {
        const script = document.createElement("script"); script.src = "https://js.tosspayments.com/v2/standard"; script.async = true;
        script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(new Error("결제 창을 불러오지 못했습니다. 다시 시도해 주세요.")); }; document.head.appendChild(script);
      });
      if (!window.TossPayments) throw new Error("결제 서비스를 연결하지 못했습니다.");
      const card = paymentMethod === "toss" ? { flowMode: "DIRECT", easyPay: "토스페이" } : paymentMethod === "kakao" ? { flowMode: "DIRECT", easyPay: "카카오페이" } : { flowMode: "DEFAULT" };
      await window.TossPayments(order.clientKey).payment({ customerKey: order.customerKey }).requestPayment({ method: "CARD", card, amount: { currency: "KRW", value: order.amount }, orderId: order.orderId, orderName: order.orderName, successUrl: `${window.location.origin}/payment/success`, failUrl: `${window.location.origin}/payment/fail` });
    } catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  }

  const profile = session?.profile;
  const free = session?.usage.freeRemaining ?? 3;
  const paid = session?.usage.paidRemaining ?? 0;
  const sidebar = <>
    <div className="sidebar-brand"><Brand /><button className="icon-button drawer-close" aria-label="메뉴 닫기" onClick={() => setDrawerOpen(false)}><X size={20} /></button></div>
    <button className="new-chat-button" onClick={newChat}><Plus size={17} />새 대화</button>
    <div className="sidebar-history"><div className="sidebar-label">나의 대화 <History size={13} /></div>
      {conversationThreads.length ? <div className="conversation-list">{conversationThreads.map(({ root, latest }) => <button key={root.id} className={`conversation-item ${activeChain[0]?.id === root.id ? "selected" : ""}`} onClick={() => { setActiveId(latest.id); setShowSample(false); setDrawerOpen(false); setError(""); }}><MessageCircle size={15} /><span>{root.question}</span>{latest.mode === "deep" && <Sparkles size={12} />}</button>)}</div> : <div className="empty-history"><span className="history-orbit"><MessageCircle size={18} strokeWidth={1.25} /></span><p>고민을 입력하면<br />대화를 시작할 수 있습니다.</p><span>대화 기록은 여기에 표시됩니다.</span></div>}
    </div>
    <div className="sidebar-bottom"><div className="credit-card"><div className="credit-card-title"><span><Sparkles size={14} /> 오늘 무료 대화</span><span>{free}<small> / 3</small></span></div><div className="credit-dots">{[0, 1, 2].map((index) => <span key={index} className={index < free ? "available" : ""} />)}</div><p>매일 한국 시간 자정에 3회 제공</p>{paid > 0 && <div className="paid-balance">대화 이용권 <strong>{paid}회</strong></div>}<button onClick={() => open("premium")}>대화 이용권 구매 <ArrowUp size={14} /></button></div>
      <button className="sidebar-account" onClick={() => open(session?.user ? "settings" : "auth")}><span className="avatar">{session?.user?.name?.slice(0, 1) || <UserRound size={17} />}</span><span>{session?.user?.name ?? "회원가입 또는 로그인"}<small>{session?.user ? "내 계정 관리" : "무료로 시작하기"}</small></span><Settings2 size={16} /></button>
      <button className="sidebar-about" onClick={() => open("about")}><ShieldCheck size={12} />별결과 개인정보 안내 <ChevronRight size={12} /></button>
    </div>
  </>;

  return <div className="app-shell">
    <aside className="sidebar desktop-sidebar">{sidebar}</aside>
    {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}><aside ref={drawer} role="dialog" aria-modal="true" aria-label="대화 메뉴" className="sidebar mobile-sidebar" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div>}
    <div className="workspace"><header className="workspace-header"><div className="header-left"><button className="icon-button mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="메뉴 열기"><Menu size={21} /></button><span className="header-context"><span className="status-dot" />사주 · 점성술 통합 상담</span><Brand small /></div><div className="header-right"><button className="privacy-indicator" onClick={() => open("about")}><ShieldCheck size={14} />개인정보 안내</button><button className="header-profile" onClick={() => open(session?.user ? "profile" : "auth")}>{profile ? `${profile.name}님의 출생 정보` : "출생 정보 입력"}<ChevronDown size={13} /></button></div></header>
      <div className="workspace-body"><main className="chat-main">
        <div className="chat-scroll">
          {!active && !showSample && <section className="welcome"><div className="welcome-illustration"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-star star-one">✧</span><span className="orbit-star star-two">✦</span><span className="orbit-star star-three">·</span><div className="welcome-symbol"><Moon size={38} strokeWidth={1.1} /><span>✦</span></div></div><div className="eyebrow">SAJU & ASTROLOGY</div><h1>사주와 점성술로<br /><span>성향 분석과 고민 상담</span></h1><p className="welcome-description">출생 정보를 바탕으로 두 해석을 비교하고,<br />고민에 맞는 판단 기준과 실행 계획을 제안합니다.</p><div className="welcome-divider"><span /><Sparkles size={14} /><span /></div><div className="prompt-heading"><span>어떤 고민을 상담하고 싶으신가요?</span><span>주제를 선택하거나 직접 입력하세요</span></div><div className="prompt-grid">{prompts.map(({ icon: Icon, name, question: prompt, description, color }) => <button key={name} className="prompt-card" onClick={() => choosePrompt(prompt)}><span className={`prompt-icon ${color}`}><Icon size={19} strokeWidth={1.5} /></span><span className="prompt-text"><strong>{name}</strong><small>{description}</small></span><ArrowRight size={15} /></button>)}</div><button className="sample-button" onClick={() => { setShowSample(true); setActiveId(null); }}><MessageCircle size={13} />답변 구성 확인하기 <span>예시 대화 보기 <ArrowRight size={12} /></span></button></section>}
          {(active || showSample) && <section className="conversation-view">{showSample && <div className="preview-banner"><Sparkles size={14} /><span><strong>예시 대화</strong> · 가상의 인물에 대한 예시입니다. 대화 횟수는 차감되지 않습니다.</span><button className="icon-button" aria-label="예시 닫기" onClick={() => setShowSample(false)}><X size={16} /></button></div>}{showSample ? <><div className="user-message"><span className="question-label">질문</span><p>지금 하는 일이 맞는지 모르겠어요. 새로운 도전을 해도 괜찮을까요?</p></div><div className="assistant-message"><div className="assistant-heading"><span className="assistant-avatar"><Sparkles size={19} strokeWidth={1.4} /></span><strong>별결</strong><span>사주 · 점성술 통합 해석</span></div><Answer answer={sampleAnswer} sample /><p className="answer-disclaimer">가상의 인물에 대한 예시입니다. 실제 출생 정보로 계산한 해석이 아닙니다.</p></div></> : activeChain.map((conversation) => <Exchange key={conversation.id} conversation={conversation} />)}</section>}
          {sending && <div className="thinking"><div className="assistant-avatar"><Sparkles size={19} /></div><div><strong>사주와 점성술을 함께 분석하고 있습니다</strong><span>질문과 계산된 차트 정보를 검토하고 있습니다<span className="thinking-dots">···</span></span></div></div>}
          <div ref={bottom} />
        </div>
        <div className="composer-area">{error && <div className="notice-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="알림 닫기" onClick={() => setError("")}><X size={15} /></button></div>}{session && !session.config.aiAvailable && <div className="connection-note"><span />AI 연결 전 · 현재는 답변 구성을 확인하는 예시 모드입니다.</div>}<form className={`composer ${sending ? "composer-busy" : ""}`} onSubmit={handleSend}><textarea ref={composer} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={2} aria-label="고민 입력" placeholder="고민과 현재 상황, 원하는 변화를 구체적으로 적어 주세요." disabled={sending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSend(); } }} /><div className="composer-tools"><button type="button" className={`mode-button ${mode === "deep" ? "mode-deep" : ""}`} onClick={() => { if (mode === "deep") setMode("standard"); else if (session?.user && paid > 0) setMode("deep"); else open("premium"); }} disabled={sending}><Sparkles size={14} />{mode === "deep" ? "심화 대화" : "일반 대화"}<ChevronDown size={12} /></button><div className="composer-right"><span className="composer-hint">Shift + Enter 줄바꿈</span><button type="submit" className="send-button" disabled={sending || loading || !question.trim()} aria-label="고민 보내기">{sending || loading ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={20} />}</button></div></div></form><div className="composer-caption"><span><Moon size={11} />질문은 5~2,000자로 입력해 주세요.</span><span>{session?.user ? <>오늘 무료 <strong>{free}회</strong> 남음{paid > 0 && <> · 이용권 <strong>{paid}회</strong></>}</> : "매일 무료 대화 3회"}</span></div></div>
      </main><aside className="insight-panel"><div className="insight-heading"><span>출생 차트</span><Sparkles size={15} /></div><div className="chart-caption"><span className="eyebrow">BIRTH CHART</span><h2>{active ? "대화에 사용한 차트" : profile ? `${profile.name}님의 출생 정보` : "사주와 점성술 차트"}</h2><p>{active ? "대화 당시 출생 정보로 계산한 차트" : profile ? `${profile.birthDate.replaceAll("-", ".")} · ${profile.birthTime ?? "시간 미상"} · ${profile.city}` : "출생 정보를 저장하고 대화를 시작해 주세요."}</p></div><div className="wheel-container"><StarWheel chart={chart} /></div>{profile ? <><div className="chart-facts"><div><span><Sun size={14} /> 태양 별자리</span><strong>{chart?.sun.sign ?? "대화에서 확인"}</strong></div><div><span><Moon size={14} /> 달 별자리</span><strong>{chart?.moon?.sign ?? (chart ? "시간 정보 필요" : "대화에서 확인")}</strong></div><div><span className="fact-symbol">木</span><span> 사주 일간</span><strong>{chart?.dayMaster ?? "대화에서 확인"}</strong></div></div>{chart && chart.notes.length > 0 && <p className="chart-note">{chart.notes[0]}</p>}<button className="profile-edit" onClick={() => open("profile")}>출생 정보 수정 <ChevronRight size={13} /></button></> : <><div className="chart-legend"><span><i className="legend-saju" />사주</span><span><i className="legend-astro" />점성술</span></div><div className="profile-invitation"><p>생년월일, 출생 시간과 지역을 입력하면<br />사주와 점성술 차트를 계산합니다.</p><button onClick={() => open(session?.user ? "profile" : "auth")}>출생 정보 입력 <ArrowRight size={14} /></button><span><ShieldCheck size={11} />동의한 출생 정보만 저장합니다</span></div></>}<div className="insight-separator" /><div className="gentle-note"><span>✧</span><p>성향 분석 → 두 해석 비교 → 실행 계획<br />답변은 이 순서로 구성됩니다.</p><small>ANALYSIS & ACTION PLAN</small></div><div className="insight-footer"><span className="status-dot" />사주 · 점성술 해석을 함께 제공</div></aside></div>
    </div>

    {modal === "auth" && <Modal title={authMode === "register" ? "회원가입" : "로그인"} subtitle={authMode === "register" ? "계정당 매일 일반 대화 3회를 무료로 제공합니다." : "저장한 출생 정보와 대화 기록을 확인하세요."} onClose={closeModal}><div className="auth-tabs"><button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setFormError(""); }}>회원가입</button><button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setFormError(""); }}>로그인</button></div><form className="form-stack" onSubmit={handleAuth}>{authMode === "register" && <label>이름 또는 닉네임<input name="name" autoComplete="name" placeholder="이름 또는 닉네임" minLength={1} maxLength={30} required /></label>}<label>이메일<input name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required /></label><label>비밀번호<input name="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} placeholder="12자 이상 입력해 주세요" minLength={12} maxLength={128} required /></label>{authMode === "register" && <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>계정과 출생 정보, 대화 내용을 서비스 제공을 위해 저장하는 데 동의합니다. 계정 관리에서 전체 데이터를 삭제할 수 있습니다.</span></label>}{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button" disabled={busy || (authMode === "register" && !consent)}>{busy ? <LoaderCircle size={17} className="spin" /> : <>{authMode === "register" ? "무료로 시작하기" : "로그인"}<ArrowRight size={16} /></>}</button></form><p className="form-note"><ShieldCheck size={13} />출생 정보는 다음 단계에서 입력합니다.</p></Modal>}

    {modal === "profile" && <Modal title="출생 정보 입력" subtitle="사주와 점성술 계산에 사용할 정보를 입력해 주세요." onClose={closeModal}><form className="form-stack" onSubmit={handleProfile}><label>이름 또는 닉네임<input name="name" defaultValue={profile?.name ?? session?.user?.name ?? ""} maxLength={30} required /></label><label>생년월일 <span className="field-tag">양력</span><input name="birthDate" type="date" defaultValue={profile?.birthDate} min="1900-01-01" max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })} required /></label><p className="field-help">현재는 양력 생일만 지원합니다. 음력 생일은 양력으로 변환해서 입력해 주세요.</p><BirthTimeInput defaultValue={profile?.birthTime} disabled={unknownTime} /><label className="checkbox-label compact-check"><input type="checkbox" checked={unknownTime} onChange={(event) => setUnknownTime(event.target.checked)} /><span>출생 시간을 모릅니다.</span></label><label>출생 지역<select name="city" defaultValue={profile?.city ?? "서울"}>{CITY_GROUPS.map((region) => <optgroup key={region} label={region}>{CITIES.filter((city) => city.region === region).map((city) => <option key={city.city} value={city.city}>{city.label}</option>)}</optgroup>)}</select></label><p className="field-help">국내 17개 시·도의 주요 지역을 지원하며, 선택한 지역의 중심 좌표와 시간대를 사용합니다. 출생 시간을 모르면 시주와 상승점은 제외하고, 달의 별자리가 불확실할 경우 안내합니다.</p><label className="checkbox-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>출생 정보와 대화 내용의 저장에 동의합니다. AI 기능이 연결된 경우 질문, 계산된 차트 정보와 최근 대화가 AI 제공업체로 전달됩니다.</span></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button" disabled={busy || !consent}>{busy ? <LoaderCircle size={17} className="spin" /> : <>출생 정보 저장<Sparkles size={16} /></>}</button></form></Modal>}

    {modal === "premium" && <Modal title="대화 이용권 구매" subtitle="무료 대화를 모두 사용했거나 심화 대화가 필요할 때 구매하세요." onClose={closeModal}><div className="premium-card"><div className="premium-badge"><Sparkles size={13} />대화 이용권</div><div className="premium-price"><strong>{(session?.config.price ?? 5000).toLocaleString("ko-KR")}<span>원</span></strong><span>이용권 <b>{session?.config.credits ?? 5}회</b></span></div><div className="premium-divider" /><ul><li><Check size={15} />무료 횟수 소진 후 일반 대화에 사용</li><li><Check size={15} />심화 대화에서 더 자세한 분석 제공</li><li><Check size={15} />한 번 결제 · 자동 구독 없음</li></ul></div><div className="quota-explanation"><p><strong>매일 무료 3회</strong><span>한국 시간 자정에 다시 제공됩니다.</span></p><p><strong>심화 대화 1회</strong><span>무료 횟수와 별개로 대화 이용권 1회를 사용합니다.</span></p><p><strong>답변당 1회 사용</strong><span>요청 시 차감하며 답변 실패 시 횟수를 복구합니다.</span></p></div><fieldset className="payment-methods"><legend>결제 방법</legend><div>{([{ id: "toss", label: "토스페이", symbol: "toss" }, { id: "kakao", label: "카카오페이", symbol: "pay" }, { id: "card", label: "신용·체크카드", symbol: "card" }] as const).map((item) => <button type="button" key={item.id} className={paymentMethod === item.id ? "selected" : ""} aria-pressed={paymentMethod === item.id} onClick={() => setPaymentMethod(item.id)} disabled={busy || !session?.config.paymentAvailable}>{item.symbol === "card" ? <CreditCard size={19} /> : <span className={`pay-symbol pay-${item.id}`}>{item.symbol}</span>}<span>{item.label}</span></button>)}</div><p>간편결제 수단은 가맹점 계약과 설정에 따라 달라질 수 있습니다.</p></fieldset>{!session?.config.paymentAvailable && <div className="payment-unavailable"><ShieldCheck size={16} /><p>결제 서비스는 준비 중입니다.<br /><span>현재는 이용권을 구매할 수 없습니다.</span></p></div>}{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button" onClick={purchase} disabled={busy || !session?.config.paymentAvailable}>{busy ? <LoaderCircle size={17} className="spin" /> : <>{session?.config.paymentAvailable ? "대화 이용권 5회 구매" : "결제 서비스 준비 중"}<ArrowRight size={16} /></>}</button><p className="form-note">일반 대화는 무료 횟수를 먼저 사용합니다.</p></Modal>}

    {modal === "settings" && <Modal title="나의 계정" subtitle="출생 정보와 대화 기록을 관리하세요." onClose={closeModal}><div className="account-summary"><span className="avatar">{session?.user?.name.slice(0, 1)}</span><div><strong>{session?.user?.name}</strong><p>{session?.user?.email}</p></div></div><div className="settings-list"><button onClick={() => open("profile")}><UserRound size={18} /><span>출생 정보 수정</span><ChevronRight size={16} /></button><button onClick={() => open("premium")}><Sparkles size={18} /><span>대화 이용권 {paid}회 · 구매하기</span><ChevronRight size={16} /></button><button onClick={logout} disabled={busy}><LogOut size={18} /><span>{busy ? "로그아웃 중…" : "로그아웃"}</span><ChevronRight size={16} /></button></div>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="delete-account-link" onClick={() => { setDeleteConfirmation(""); open("delete"); }}><Trash2 size={13} />계정과 모든 기록 삭제</button></Modal>}

    {modal === "delete" && <Modal title="계정을 삭제할까요?" subtitle="이 작업은 되돌릴 수 없습니다." onClose={closeModal}><div className="delete-description">출생 정보, 대화 기록, 계정과 남은 대화 이용권이 삭제됩니다. 진행하려면 아래에 <strong>삭제</strong>를 입력해 주세요.</div><form className="form-stack" onSubmit={deleteAccount}><label>삭제 확인<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="삭제" required /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button danger-button" disabled={busy || deleteConfirmation !== "삭제"}>{busy ? <LoaderCircle size={17} className="spin" /> : "계정과 기록 영구 삭제"}</button><button type="button" className="secondary-button" onClick={() => open("settings")}>내 계정으로 돌아가기</button></form></Modal>}

    {modal === "about" && <Modal title="서비스와 개인정보 안내" subtitle="해석 범위, 정보 사용과 이용 요금을 확인하세요." onClose={closeModal}><div className="about-copy"><h3>사주와 점성술 통합 해석</h3><p>계산된 사주와 서양 점성술 차트를 질문과 연결해 성향, 판단 기준과 실행 계획을 제안합니다. 해석은 자기 이해를 위한 참고 자료이며, 확정적인 미래 예측은 제공하지 않습니다.</p><h3>출생 정보와 대화의 저장</h3><p>동의한 출생 정보와 대화는 계정에 저장됩니다. AI가 연결된 경우 질문, 계산된 차트 정보와 최근 대화 최대 3개가 AI 제공업체로 전달됩니다. 이름, 이메일과 정확한 생년월일·출생 시간은 AI 요청에 자동으로 포함되지 않지만, 질문에 직접 적은 정보는 전송됩니다. 계정 관리에서 출생 정보를 수정하거나 계정과 기록을 삭제할 수 있습니다.</p><h3>이용 횟수와 결제</h3><p>한국 시간 기준 매일 일반 대화 3회를 무료로 제공합니다. 대화 이용권 5회는 5,000원이며 자동 구독은 없습니다. 심화 대화는 대화 이용권 1회를 사용합니다. AI와 결제 서비스 연결 전에는 구매할 수 없습니다.</p><h3>현재 제공 범위</h3><p>양력 생일과 국내 17개 시·도의 주요 지역 및 일부 해외 도시를 지원합니다. 선택한 지역의 중심 좌표를 사용합니다. 정확한 출생 시간을 모르면 시주와 상승점 등 일부 차트 요소가 제외됩니다. AI 연결 전 답변에는 예시 표시가 나타납니다.</p></div><button className="primary-button" onClick={closeModal}>확인했습니다<Check size={16} /></button></Modal>}
  </div>;
}
