export type BirthProfile = {
  name: string;
  birthDate: string;
  birthTime: string | null;
  city: string;
  timezone: string;
  latitude: number;
  longitude: number;
};

export type Chart = {
  pillars: { label: string; ganZhi: string; element: string }[];
  dayMaster: string;
  elements: { name: string; count: number }[];
  sun: { sign: string; degree: number };
  moon: { sign: string; degree: number } | null;
  ascendant: { sign: string; degree: number } | null;
  notes: string[];
};

export type Advice = {
  summary: string;
  personality: string;
  saju: string;
  astrology: string;
  integration: string;
  actions: string[];
  followUp: string;
};

export type Conversation = {
  id: string;
  parentId?: string | null;
  question: string;
  mode: "standard" | "deep";
  answer: Advice;
  chart: Chart;
  source: "demo" | "ai";
  createdAt: string;
};

export type SessionState = {
  user: { id: string; name: string; email: string } | null;
  profile: BirthProfile | null;
  usage: { freeRemaining: number; paidRemaining: number; resetsAt: string };
  conversations: Conversation[];
  config: { aiAvailable: boolean; paymentAvailable: boolean; price: number; credits: number };
};

export const CITIES = [
  { city: "서울", timezone: "Asia/Seoul", latitude: 37.5665, longitude: 126.978 },
  { city: "부산", timezone: "Asia/Seoul", latitude: 35.1796, longitude: 129.0756 },
  { city: "인천", timezone: "Asia/Seoul", latitude: 37.4563, longitude: 126.7052 },
  { city: "대구", timezone: "Asia/Seoul", latitude: 35.8714, longitude: 128.6014 },
  { city: "대전", timezone: "Asia/Seoul", latitude: 36.3504, longitude: 127.3845 },
  { city: "광주", timezone: "Asia/Seoul", latitude: 35.1595, longitude: 126.8526 },
  { city: "제주", timezone: "Asia/Seoul", latitude: 33.4996, longitude: 126.5312 },
  { city: "도쿄", timezone: "Asia/Tokyo", latitude: 35.6762, longitude: 139.6503 },
  { city: "뉴욕", timezone: "America/New_York", latitude: 40.7128, longitude: -74.006 },
  { city: "런던", timezone: "Europe/London", latitude: 51.5074, longitude: -0.1278 },
  { city: "로스앤젤레스", timezone: "America/Los_Angeles", latitude: 34.0522, longitude: -118.2437 },
  { city: "시드니", timezone: "Australia/Sydney", latitude: -33.8688, longitude: 151.2093 },
] as const;
