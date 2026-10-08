"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, ArrowUp, Check, ChevronDown, ChevronRight, Compass, CreditCard, Heart, History, LoaderCircle, LogOut, Menu, MessageCircle, Moon, Plus, Settings2, ShieldCheck, Sparkles, Sun, Telescope, Trash2, UserRound, X } from "lucide-react";
import { CITIES, type Advice, type BirthProfile, type Conversation, type SessionState } from "@/lib/types";
import { Modal } from "@/components/modal";
import { StarWheel } from "@/components/star-wheel";

type ModalName = "auth" | "profile" | "premium" | "settings" | "delete" | "about" | null;
type ChatResult = { conversation: Conversation; usage: SessionState["usage"] };
type Order = { orderId: string; amount: number; orderName: string; clientKey: string; customerKey: string };
type TossPayment = { payment: (options: { customerKey: string }) => { requestPayment: (options: Record<string, unknown>) => Promise<void> } };
declare global { interface Window { TossPayments?: (clientKey: string) => TossPayment } }

const prompts = [
  { icon: Compass, name: "일과 커리어", question: "지금 하는 일이 나와 잘 맞는지 모르겠어요. 제 강점을 살릴 방향을 찾고 싶어요.", description: "나에게 맞는 방향을 찾고 싶을 때", color: "sage" },
  { icon: Heart, name: "사랑과 관계", question: "관계에서 자꾸 비슷한 갈등이 반복돼요. 제 성향을 이해하고 더 건강하게 소통하고 싶어요.", description: "나와 상대를 더 이해하고 싶을 때", color: "rose" },
  { icon: UserRound, name: "나에 대한 이해", question: "제가 무엇을 원하고 어떤 사람인지 더 깊이 이해하고 싶어요. 제 성향과 강점을 알려 주세요.", description: "내 안의 가능성이 궁금할 때", color: "lavender" },
  { icon: Telescope, name: "선택과 변화", question: "새로운 도전을 앞두고 걱정이 많아요. 제 성향에 맞게 결정을 준비하는 방법을 알고 싶어요.", description: "새로운 시작 앞에서 망설일 때", color: "sand" },
];

const sampleAnswer: Advice = {
  summary: "지금 필요한 건 더 큰 확신보다, 작게 확인해 볼 수 있는 경험이에요.",
  personality: "이 예시의 주인공은 충분히 준비한 뒤 움직일 때 편안함을 느낍니다. 신중함은 강점이지만, 모든 조건이 갖춰지길 기다리면 시작이 늦어질 수 있어요.",
  saju: "예시 사주에서 목(木)은 성장의 욕구, 토(土)는 안정의 욕구로 읽습니다. 새로운 일을 해 보고 싶은 마음과 익숙한 기반을 지키고 싶은 마음이 함께 있다고 해석할 수 있어요.",
  astrology: "예시 차트의 태양은 자기 표현을, 달은 정서적 안정을 살펴보는 상징입니다. 인정받고 싶은 마음과 실패하고 싶지 않은 마음을 구분해 보면 선택이 더 선명해질 수 있어요.",
  integration: "두 관점을 함께 보면, 모든 것을 바꾸는 선택보다 안전한 기반 위에서 작은 실험을 하는 접근이 어울립니다. 이것이 정해진 운명이라는 뜻은 아니에요. 실제 경험으로 나에게 맞는지 확인해 보세요.",
  actions: ["이번 주에 관심 있는 일을 실제로 하는 사람 한 명과 20분 이야기해 보세요.", "현재 일에서 에너지가 생기는 순간과 소진되는 순간을 3일 동안 기록해 보세요.", "관심 분야를 주말 2시간짜리 작은 프로젝트로 경험한 뒤, 다음 걸음을 결정해 보세요."],
  followUp: "지금 하는 일에서 가장 즐거운 순간과 가장 지치는 순간은 각각 언제인가요?",
};

async function api<T>(path: string, body?: unknown, method?: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { method: method ?? (body ? "POST" : "GET"), headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "요청을 처리하지 못했어요. 잠시 후 다시 시도해 주세요."), { code: data.code, status: response.status });
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
  return <div className="conversation-exchange"><div className="user-message"><span className="question-label">나의 이야기</span><p>{conversation.question}</p></div><div className="assistant-message"><div className="assistant-heading"><span className="assistant-avatar"><Sparkles size={19} strokeWidth={1.4} /></span><strong>별결</strong><span>당신의 마음을 함께 읽어요</span></div><Answer answer={conversation.answer} sample={conversation.source === "demo"} mode={conversation.mode} /><details className="chart-details"><summary>해석 범위와 출생 시간 안내<ChevronDown size={13} /></summary><div className="pillar-row">{conversation.chart.pillars.map((pillar) => <div key={pillar.label}><span>{pillar.label}</span><strong>{pillar.ganZhi}</strong><small>{pillar.element}</small></div>)}</div><ul>{conversation.chart.notes.map((note, index) => <li key={index}>{note}</li>)}</ul></details><p className="answer-disclaimer">사주와 점성술의 해석은 자기 이해를 위한 참고 자료예요. 선택의 주인은 언제나 당신입니다.</p></div></div>;
}

function Answer({ answer, sample, mode }: { answer: Advice; sample?: boolean; mode?: string }) {
  return <div className="answer-content">
    {sample && <div className="sample-label"><Sparkles size={13} />예시 답변 · AI 연결 전</div>}
    <p className="answer-lead">{answer.summary}</p>
    <section className="answer-section"><h3><UserRound size={16} /> 당신을 이해하는 실마리</h3><p>{answer.personality}</p></section>
    <div className="reading-pair"><section><div className="reading-label"><span className="saju-mark">木</span> 사주의 시선</div><p>{answer.saju}</p></section><section><div className="reading-label"><Moon size={15} /> 별자리의 시선</div><p>{answer.astrology}</p></section></div>
    <section className="answer-section integration-section"><h3><Sparkles size={16} /> 두 시선을 하나로</h3><p>{answer.integration}</p></section>
    <section className="answer-section"><h3><Compass size={16} /> 지금 해 볼 수 있는 것</h3><ol className="action-list">{answer.actions.map((action, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span><p>{action}</p></li>)}</ol></section>
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
    const profile: BirthProfile = { name: String(values.get("name") ?? ""), birthDate: String(values.get("birthDate") ?? ""), birthTime: unknownTime ? null : String(values.get("birthTime") ?? "") || null, ...city };
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
        script.onload = () => resolve(); script.onerror = () => { script.remove(); reject(new Error("결제 창을 불러오지 못했어요. 다시 시도해 주세요.")); }; document.head.appendChild(script);
      });
      if (!window.TossPayments) throw new Error("결제 서비스를 연결하지 못했어요.");
      const card = paymentMethod === "toss" ? { flowMode: "DIRECT", easyPay: "토스페이" } : paymentMethod === "kakao" ? { flowMode: "DIRECT", easyPay: "카카오페이" } : { flowMode: "DEFAULT" };
      await window.TossPayments(order.clientKey).payment({ customerKey: order.customerKey }).requestPayment({ method: "CARD", card, amount: { currency: "KRW", value: order.amount }, orderId: order.orderId, orderName: order.orderName, successUrl: `${window.location.origin}/payment/success`, failUrl: `${window.location.origin}/payment/fail` });
    } catch (err) { setFormError((err as Error).message); } finally { setBusy(false); }
  }

  const profile = session?.profile;
  const free = session?.usage.freeRemaining ?? 3;
  const paid = session?.usage.paidRemaining ?? 0;
  const sidebar = <>
    <div className="sidebar-brand"><Brand /><button className="icon-button drawer-close" aria-label="메뉴 닫기" onClick={() => setDrawerOpen(false)}><X size={20} /></button></div>
    <button className="new-chat-button" onClick={newChat}><Plus size={17} />새로운 대화<span>⌘</span></button>
    <div className="sidebar-history"><div className="sidebar-label">나의 대화 <History size={13} /></div>
      {conversationThreads.length ? <div className="conversation-list">{conversationThreads.map(({ root, latest }) => <button key={root.id} className={`conversation-item ${activeChain[0]?.id === root.id ? "selected" : ""}`} onClick={() => { setActiveId(latest.id); setShowSample(false); setDrawerOpen(false); setError(""); }}><MessageCircle size={15} /><span>{root.question}</span>{latest.mode === "deep" && <Sparkles size={12} />}</button>)}</div> : <div className="empty-history"><span className="history-orbit"><MessageCircle size={18} strokeWidth={1.25} /></span><p>마음에 담아 둔 이야기를<br />이곳에서 천천히 나눠 보세요.</p><span>대화가 시작되면 여기에 모아 드릴게요.</span></div>}
    </div>
    <div className="sidebar-bottom"><div className="credit-card"><div className="credit-card-title"><span><Sparkles size={14} /> 오늘의 대화</span><span>{free}<small> / 3</small></span></div><div className="credit-dots">{[0, 1, 2].map((index) => <span key={index} className={index < free ? "available" : ""} />)}</div><p>매일 자정, 새로운 이야기 3회</p>{paid > 0 && <div className="paid-balance">충전 대화 <strong>{paid}회</strong></div>}<button onClick={() => open("premium")}>조금 더 깊이 이야기하기 <ArrowUp size={14} /></button></div>
      <button className="sidebar-account" onClick={() => open(session?.user ? "settings" : "auth")}><span className="avatar">{session?.user?.name?.slice(0, 1) || <UserRound size={17} />}</span><span>{session?.user?.name ?? "나만의 이야기를 시작하세요"}<small>{session?.user ? "내 계정 관리" : "무료로 시작하기"}</small></span><Settings2 size={16} /></button>
      <button className="sidebar-about" onClick={() => open("about")}><ShieldCheck size={12} />별결과 개인정보 안내 <ChevronRight size={12} /></button>
    </div>
  </>;

  return <div className="app-shell">
    <aside className="sidebar desktop-sidebar">{sidebar}</aside>
    {drawerOpen && <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)}><aside ref={drawer} role="dialog" aria-modal="true" aria-label="대화 메뉴" className="sidebar mobile-sidebar" onClick={(event) => event.stopPropagation()}>{sidebar}</aside></div>}
    <div className="workspace"><header className="workspace-header"><div className="header-left"><button className="icon-button mobile-menu" onClick={() => setDrawerOpen(true)} aria-label="메뉴 열기"><Menu size={21} /></button><span className="header-context"><span className="status-dot" />사주와 별자리, 두 가지 시선</span><Brand small /></div><div className="header-right"><span className="privacy-indicator"><ShieldCheck size={14} />우리만의 대화</span><button className="header-profile" onClick={() => open(session?.user ? "profile" : "auth")}>{profile ? `${profile.name}님의 별결` : "내 별결 만들기"}<ChevronDown size={13} /></button></div></header>
      <div className="workspace-body"><main className="chat-main">
        <div className="chat-scroll">
          {!active && !showSample && <section className="welcome"><div className="welcome-illustration"><span className="orbit orbit-one" /><span className="orbit orbit-two" /><span className="orbit-star star-one">✧</span><span className="orbit-star star-two">✦</span><span className="orbit-star star-three">·</span><div className="welcome-symbol"><Moon size={38} strokeWidth={1.1} /><span>✦</span></div></div><div className="eyebrow">A LITTLE CLOSER TO YOURSELF</div><h1>복잡한 마음에,<br /><span>나를 읽는 새로운 시선.</span></h1><p className="welcome-description">사주가 들려주는 나의 기질과 별자리가 비추는 마음.<br />두 이야기를 함께 읽고, 지금의 고민을 풀어 가요.</p><div className="welcome-divider"><span /><Sparkles size={14} /><span /></div><div className="prompt-heading"><span>오늘은 어떤 이야기를 나눠 볼까요?</span><span>천천히 시작해도 괜찮아요</span></div><div className="prompt-grid">{prompts.map(({ icon: Icon, name, question: prompt, description, color }) => <button key={name} className="prompt-card" onClick={() => choosePrompt(prompt)}><span className={`prompt-icon ${color}`}><Icon size={19} strokeWidth={1.5} /></span><span className="prompt-text"><strong>{name}</strong><small>{description}</small></span><ArrowRight size={15} /></button>)}</div><button className="sample-button" onClick={() => { setShowSample(true); setActiveId(null); }}><MessageCircle size={13} />별결의 대화가 궁금하다면 <span>샘플 대화 보기 <ArrowRight size={12} /></span></button></section>}
          {(active || showSample) && <section className="conversation-view">{showSample && <div className="preview-banner"><Sparkles size={14} /><span><strong>샘플 대화</strong> · 가상의 인물로 구성한 예시예요. 대화 횟수는 차감되지 않아요.</span><button className="icon-button" aria-label="샘플 닫기" onClick={() => setShowSample(false)}><X size={16} /></button></div>}{showSample ? <><div className="user-message"><span className="question-label">나의 이야기</span><p>지금 하는 일이 맞는지 모르겠어요. 새로운 도전을 해도 괜찮을까요?</p></div><div className="assistant-message"><div className="assistant-heading"><span className="assistant-avatar"><Sparkles size={19} strokeWidth={1.4} /></span><strong>별결</strong><span>당신의 마음을 함께 읽어요</span></div><Answer answer={sampleAnswer} sample /><p className="answer-disclaimer">가상의 인물을 위한 샘플이에요. 실제 출생 정보로 계산한 해석이 아닙니다.</p></div></> : activeChain.map((conversation) => <Exchange key={conversation.id} conversation={conversation} />)}</section>}
          {sending && <div className="thinking"><div className="assistant-avatar"><Sparkles size={19} /></div><div><strong>두 시선을 함께 읽고 있어요</strong><span>당신의 이야기와 태어난 순간을 연결하고 있습니다<span className="thinking-dots">···</span></span></div></div>}
          <div ref={bottom} />
        </div>
        <div className="composer-area">{error && <div className="notice-banner" role="alert"><span>{error}</span><button className="icon-button" aria-label="알림 닫기" onClick={() => setError("")}><X size={15} /></button></div>}{session && !session.config.aiAvailable && <div className="connection-note"><span />AI 연결 전 · 현재는 해석 형식을 보여 주는 예시 모드예요.</div>}<form className={`composer ${sending ? "composer-busy" : ""}`} onSubmit={handleSend}><textarea ref={composer} value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={2000} rows={2} aria-label="고민 입력" placeholder="지금 마음에 머무는 고민을 들려주세요…" disabled={sending} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void handleSend(); } }} /><div className="composer-tools"><button type="button" className={`mode-button ${mode === "deep" ? "mode-deep" : ""}`} onClick={() => { if (mode === "deep") setMode("standard"); else if (session?.user && paid > 0) setMode("deep"); else open("premium"); }} disabled={sending}><Sparkles size={14} />{mode === "deep" ? "심화 대화" : "기본 대화"}<ChevronDown size={12} /></button><div className="composer-right"><span className="composer-hint">Shift + Enter 줄바꿈</span><button type="submit" className="send-button" disabled={sending || loading || !question.trim()} aria-label="고민 보내기">{sending || loading ? <LoaderCircle size={18} className="spin" /> : <ArrowUp size={20} />}</button></div></div></form><div className="composer-caption"><span><Moon size={11} />당신의 속도로, 당신의 이야기를.</span><span>{session?.user ? <>오늘 무료 <strong>{free}회</strong> 남음{paid > 0 && <> · 충전 <strong>{paid}회</strong></>}</> : "매일 무료 대화 3회"}</span></div></div>
      </main><aside className="insight-panel"><div className="insight-heading"><span>나의 작은 우주</span><Sparkles size={15} /></div><div className="chart-caption"><span className="eyebrow">BORN UNDER THE STARS</span><h2>{active ? "이 대화의 별결" : profile ? `${profile.name}님의 별결` : "당신만의 결을 찾아요"}</h2><p>{active ? "대화 당시 출생 정보로 계산한 차트" : profile ? `${profile.birthDate.replaceAll("-", ".")} · ${profile.birthTime ?? "시간 미상"} · ${profile.city}` : "당신이 태어난 순간의 이야기를 담아"}</p></div><div className="wheel-container"><StarWheel chart={chart} /></div>{profile ? <><div className="chart-facts"><div><span><Sun size={14} /> 태양 별자리</span><strong>{chart?.sun.sign ?? "대화에서 확인"}</strong></div><div><span><Moon size={14} /> 달 별자리</span><strong>{chart?.moon?.sign ?? (chart ? "시간 정보 필요" : "대화에서 확인")}</strong></div><div><span className="fact-symbol">木</span><span> 사주 일간</span><strong>{chart?.dayMaster ?? "대화에서 확인"}</strong></div></div>{chart && chart.notes.length > 0 && <p className="chart-note">{chart.notes[0]}</p>}<button className="profile-edit" onClick={() => open("profile")}>태어난 순간 수정하기 <ChevronRight size={13} /></button></> : <><div className="chart-legend"><span><i className="legend-saju" />사주의 기질</span><span><i className="legend-astro" />별자리의 마음</span></div><div className="profile-invitation"><p>태어난 날과 장소를 알려 주시면<br />두 시선으로 당신을 읽어 드려요.</p><button onClick={() => open(session?.user ? "profile" : "auth")}>내 별결 만들기 <ArrowRight size={14} /></button><span><ShieldCheck size={11} />출생 정보는 동의 후 저장해요</span></div></>}<div className="insight-separator" /><div className="gentle-note"><span>✧</span><p>별은 답을 정해 주기보다,<br />미처 보지 못했던 나를<br />발견하게 해 주니까요.</p><small>THE ANSWER BEGINS WITH YOU</small></div><div className="insight-footer"><span className="status-dot" />동양의 지혜와 서양의 별을 함께</div></aside></div>
    </div>

    {modal === "auth" && <Modal title={authMode === "register" ? "당신의 이야기가 시작되는 곳" : "다시 만나 반가워요"} subtitle={authMode === "register" ? "내 별결을 만들고, 매일 3번 무료로 이야기하세요." : "지난 이야기와 당신의 별결이 기다리고 있어요."} onClose={closeModal}><div className="auth-tabs"><button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setFormError(""); }}>회원가입</button><button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setFormError(""); }}>로그인</button></div><form className="form-stack" onSubmit={handleAuth}>{authMode === "register" && <label>어떻게 불러 드릴까요?<input name="name" autoComplete="name" placeholder="이름 또는 닉네임" minLength={1} maxLength={30} required /></label>}<label>이메일<input name="email" type="email" autoComplete="email" placeholder="you@example.com" maxLength={254} required /></label><label>비밀번호<input name="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} placeholder="12자 이상 입력해 주세요" minLength={12} maxLength={128} required /></label>{authMode === "register" && <label className="checkbox-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>계정과 출생 정보, 대화 내용을 서비스 제공을 위해 저장하는 데 동의합니다. 계정 관리에서 전체 데이터를 삭제할 수 있어요.</span></label>}{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button" disabled={busy || (authMode === "register" && !consent)}>{busy ? <LoaderCircle size={17} className="spin" /> : <>{authMode === "register" ? "무료로 시작하기" : "로그인"}<ArrowRight size={16} /></>}</button></form><p className="form-note"><ShieldCheck size={13} />출생 정보는 다음 단계에서 입력할 수 있어요.</p></Modal>}

    {modal === "profile" && <Modal title="당신이 태어난 순간" subtitle="사주와 점성술을 함께 읽는 첫 번째 실마리예요." onClose={closeModal}><form className="form-stack" onSubmit={handleProfile}><label>이름 또는 닉네임<input name="name" defaultValue={profile?.name ?? session?.user?.name ?? ""} maxLength={30} required /></label><label>생년월일 <span className="field-tag">양력</span><input name="birthDate" type="date" defaultValue={profile?.birthDate} min="1900-01-01" max={new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Seoul" })} required /></label><p className="field-help">현재는 양력 생일만 지원해요. 음력 생일은 양력으로 변환해서 입력해 주세요.</p><label>태어난 시간 <span className="optional-label">선택</span><input name="birthTime" type="time" defaultValue={profile?.birthTime ?? undefined} disabled={unknownTime} /></label><label className="checkbox-label compact-check"><input type="checkbox" checked={unknownTime} onChange={(event) => setUnknownTime(event.target.checked)} /><span>정확한 시간을 몰라요</span></label><label>태어난 도시<select name="city" defaultValue={profile?.city ?? "서울"}>{CITIES.map((city) => <option key={city.city} value={city.city}>{city.city}</option>)}</select></label><p className="field-help">지원되는 도시의 시간대와 좌표를 사용해요. 시간이 없으면 시주와 상승궁은 제외하고, 달의 위치는 불확실성을 표시해요.</p><label className="checkbox-label"><input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} required /><span>출생 정보와 대화 내용의 저장에 동의합니다. AI 기능이 연결된 경우 질문과 차트 해석 정보가 AI 제공업체로 전달됩니다.</span></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button" disabled={busy || !consent}>{busy ? <LoaderCircle size={17} className="spin" /> : <>내 별결 저장하기<Sparkles size={16} /></>}</button></form></Modal>}

    {modal === "premium" && <Modal title="마음에 한 걸음 더 가까이" subtitle="이야기가 더 필요할 때, 필요한 만큼만 충전하세요." onClose={closeModal}><div className="premium-card"><div className="premium-badge"><Sparkles size={13} />별결 대화 충전</div><div className="premium-price"><strong>{(session?.config.price ?? 5000).toLocaleString("ko-KR")}<span>원</span></strong><span>대화 기회 <b>{session?.config.credits ?? 5}회</b></span></div><div className="premium-divider" /><ul><li><Check size={15} />기본 대화를 계속 이어 갈 수 있어요</li><li><Check size={15} />심화 대화로 고민을 더 구체적으로 살펴봐요</li><li><Check size={15} />한 번 결제 · 자동 구독 없음</li></ul></div><div className="quota-explanation"><p><strong>매일 무료 3회</strong><span>한국 시간 자정에 새로 채워져요.</span></p><p><strong>심화 대화 1회</strong><span>무료 횟수와 별개로 충전 대화 1회를 사용해요.</span></p><p><strong>답변당 1회 사용</strong><span>요청 시 예약하며 답변 실패 시 횟수를 복구해요.</span></p></div><fieldset className="payment-methods"><legend>결제 방법</legend><div>{([{ id: "toss", label: "토스페이", symbol: "toss" }, { id: "kakao", label: "카카오페이", symbol: "pay" }, { id: "card", label: "신용·체크카드", symbol: "card" }] as const).map((item) => <button type="button" key={item.id} className={paymentMethod === item.id ? "selected" : ""} aria-pressed={paymentMethod === item.id} onClick={() => setPaymentMethod(item.id)} disabled={busy || !session?.config.paymentAvailable}>{item.symbol === "card" ? <CreditCard size={19} /> : <span className={`pay-symbol pay-${item.id}`}>{item.symbol}</span>}<span>{item.label}</span></button>)}</div><p>간편결제 수단은 가맹점 계약과 설정에 따라 달라질 수 있어요.</p></fieldset>{!session?.config.paymentAvailable && <div className="payment-unavailable"><ShieldCheck size={16} /><p>결제 서비스는 준비 중이에요.<br /><span>지금은 실제 결제와 충전을 할 수 없어요.</span></p></div>}{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button" onClick={purchase} disabled={busy || !session?.config.paymentAvailable}>{busy ? <LoaderCircle size={17} className="spin" /> : <>{session?.config.paymentAvailable ? "대화 5회 충전하기" : "결제 서비스 준비 중"}<ArrowRight size={16} /></>}</button><p className="form-note">기본 대화는 무료 횟수를 먼저 사용해요.</p></Modal>}

    {modal === "settings" && <Modal title="나의 계정" subtitle="출생 정보와 대화 기록을 관리하세요." onClose={closeModal}><div className="account-summary"><span className="avatar">{session?.user?.name.slice(0, 1)}</span><div><strong>{session?.user?.name}</strong><p>{session?.user?.email}</p></div></div><div className="settings-list"><button onClick={() => open("profile")}><UserRound size={18} /><span>출생 정보 수정</span><ChevronRight size={16} /></button><button onClick={() => open("premium")}><Sparkles size={18} /><span>충전 대화 {paid}회 · 충전하기</span><ChevronRight size={16} /></button><button onClick={logout} disabled={busy}><LogOut size={18} /><span>{busy ? "로그아웃 중…" : "로그아웃"}</span><ChevronRight size={16} /></button></div>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="delete-account-link" onClick={() => { setDeleteConfirmation(""); open("delete"); }}><Trash2 size={13} />계정과 모든 기록 삭제</button></Modal>}

    {modal === "delete" && <Modal title="계정을 삭제할까요?" subtitle="이 작업은 되돌릴 수 없어요." onClose={closeModal}><div className="delete-description">출생 정보, 대화 기록, 계정과 남은 대화 이용권이 삭제됩니다. 진행하려면 아래에 <strong>삭제</strong>를 입력해 주세요.</div><form className="form-stack" onSubmit={deleteAccount}><label>삭제 확인<input value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} placeholder="삭제" required /></label>{formError && <p className="form-error" role="alert">{formError}</p>}<button className="primary-button danger-button" disabled={busy || deleteConfirmation !== "삭제"}>{busy ? <LoaderCircle size={17} className="spin" /> : "계정과 기록 영구 삭제"}</button><button type="button" className="secondary-button" onClick={() => open("settings")}>내 계정으로 돌아가기</button></form></Modal>}

    {modal === "about" && <Modal title="별결이 당신의 이야기를 읽는 법" subtitle="나를 이해하고, 다음 걸음을 선택하는 작은 공간." onClose={closeModal}><div className="about-copy"><h3>두 관점을 함께 읽어요</h3><p>사주의 기질과 서양 점성술의 상징을 질문과 연결합니다. 확정적인 미래 예측보다 나의 성향을 돌아보고 실천할 수 있는 방향을 제안해요.</p><h3>출생 정보와 대화의 저장</h3><p>동의한 출생 정보와 대화는 계정에 저장됩니다. AI가 연결된 경우 질문과 계산된 차트 정보가 AI 제공업체로 전달돼요. 계정 관리에서 출생 정보를 수정하거나 계정과 기록을 삭제할 수 있습니다.</p><h3>이용 횟수와 결제</h3><p>한국 시간 기준 매일 기본 대화 3회를 무료로 제공합니다. 충전 대화 5회는 5,000원이며 자동 구독은 없습니다. 심화 답변은 충전 대화 1회를 사용해요. 결제 연결 전에는 구매할 수 없습니다.</p><h3>현재 제공 범위</h3><p>양력 생일과 목록에 있는 도시를 지원합니다. 정확한 태어난 시간을 모르면 일부 차트 요소가 제외됩니다. AI 연결 전 답변에는 예시 표시가 나타나요.</p></div><button className="primary-button" onClick={closeModal}>이해했어요<Check size={16} /></button></Modal>}
  </div>;
}
