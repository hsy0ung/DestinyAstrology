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

export const CITY_GROUPS = [
  "서울특별시", "부산광역시", "대구광역시", "인천광역시", "광주광역시", "대전광역시", "울산광역시", "세종특별자치시",
  "경기도", "강원특별자치도", "충청북도", "충청남도", "전북특별자치도", "전라남도", "경상북도", "경상남도", "제주특별자치도", "해외",
] as const;

// Coordinates represent the selected city's center, not the entire administrative region.
// Keep city values stable so previously saved birth profiles remain selectable.
export const CITIES = [
  { city: "서울", label: "서울특별시", region: "서울특별시", timezone: "Asia/Seoul", latitude: 37.5665, longitude: 126.978 },
  { city: "부산", label: "부산광역시", region: "부산광역시", timezone: "Asia/Seoul", latitude: 35.1796, longitude: 129.0756 },
  { city: "대구", label: "대구광역시", region: "대구광역시", timezone: "Asia/Seoul", latitude: 35.8714, longitude: 128.6014 },
  { city: "인천", label: "인천광역시", region: "인천광역시", timezone: "Asia/Seoul", latitude: 37.4563, longitude: 126.7052 },
  { city: "광주", label: "광주광역시", region: "광주광역시", timezone: "Asia/Seoul", latitude: 35.1595, longitude: 126.8526 },
  { city: "대전", label: "대전광역시", region: "대전광역시", timezone: "Asia/Seoul", latitude: 36.3504, longitude: 127.3845 },
  { city: "울산", label: "울산광역시", region: "울산광역시", timezone: "Asia/Seoul", latitude: 35.5384, longitude: 129.3114 },
  { city: "세종", label: "세종특별자치시", region: "세종특별자치시", timezone: "Asia/Seoul", latitude: 36.4801, longitude: 127.2891 },
  { city: "수원", label: "수원시", region: "경기도", timezone: "Asia/Seoul", latitude: 37.2636, longitude: 127.0286 },
  { city: "춘천", label: "춘천시", region: "강원특별자치도", timezone: "Asia/Seoul", latitude: 37.8813, longitude: 127.7298 },
  { city: "강릉", label: "강릉시", region: "강원특별자치도", timezone: "Asia/Seoul", latitude: 37.7519, longitude: 128.8761 },
  { city: "원주", label: "원주시", region: "강원특별자치도", timezone: "Asia/Seoul", latitude: 37.3422, longitude: 127.9202 },
  { city: "청주", label: "청주시", region: "충청북도", timezone: "Asia/Seoul", latitude: 36.6424, longitude: 127.489 },
  { city: "천안", label: "천안시", region: "충청남도", timezone: "Asia/Seoul", latitude: 36.8151, longitude: 127.1139 },
  { city: "홍성", label: "홍성군", region: "충청남도", timezone: "Asia/Seoul", latitude: 36.6012, longitude: 126.6608 },
  { city: "전주", label: "전주시", region: "전북특별자치도", timezone: "Asia/Seoul", latitude: 35.8242, longitude: 127.148 },
  { city: "목포", label: "목포시", region: "전라남도", timezone: "Asia/Seoul", latitude: 34.8118, longitude: 126.3922 },
  { city: "여수", label: "여수시", region: "전라남도", timezone: "Asia/Seoul", latitude: 34.7604, longitude: 127.6622 },
  { city: "순천", label: "순천시", region: "전라남도", timezone: "Asia/Seoul", latitude: 34.9506, longitude: 127.4872 },
  { city: "포항", label: "포항시", region: "경상북도", timezone: "Asia/Seoul", latitude: 36.019, longitude: 129.3435 },
  { city: "안동", label: "안동시", region: "경상북도", timezone: "Asia/Seoul", latitude: 36.5684, longitude: 128.7294 },
  { city: "경주", label: "경주시", region: "경상북도", timezone: "Asia/Seoul", latitude: 35.8562, longitude: 129.2247 },
  { city: "창원", label: "창원시", region: "경상남도", timezone: "Asia/Seoul", latitude: 35.2286, longitude: 128.6811 },
  { city: "진주", label: "진주시", region: "경상남도", timezone: "Asia/Seoul", latitude: 35.18, longitude: 128.1076 },
  { city: "김해", label: "김해시", region: "경상남도", timezone: "Asia/Seoul", latitude: 35.2285, longitude: 128.8894 },
  { city: "제주", label: "제주시", region: "제주특별자치도", timezone: "Asia/Seoul", latitude: 33.4996, longitude: 126.5312 },
  { city: "서귀포", label: "서귀포시", region: "제주특별자치도", timezone: "Asia/Seoul", latitude: 33.2541, longitude: 126.5601 },
  { city: "도쿄", label: "도쿄", region: "해외", timezone: "Asia/Tokyo", latitude: 35.6762, longitude: 139.6503 },
  { city: "뉴욕", label: "뉴욕", region: "해외", timezone: "America/New_York", latitude: 40.7128, longitude: -74.006 },
  { city: "런던", label: "런던", region: "해외", timezone: "Europe/London", latitude: 51.5074, longitude: -0.1278 },
  { city: "로스앤젤레스", label: "로스앤젤레스", region: "해외", timezone: "America/Los_Angeles", latitude: 34.0522, longitude: -118.2437 },
  { city: "시드니", label: "시드니", region: "해외", timezone: "Australia/Sydney", latitude: -33.8688, longitude: 151.2093 },
] as const;
