import { DateTime, IANAZone } from "luxon";
import { Solar } from "lunar-javascript";
import { EclipticGeoMoon, MakeTime, SiderealTime, SunPosition, e_tilt } from "astronomy-engine";
import { z } from "zod";
import type { BirthProfile, Chart } from "./types";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(40),
  birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  birthTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable(),
  city: z.string().trim().min(1).max(60),
  timezone: z.string().max(80),
  latitude: z.number().finite().min(-89).max(89),
  longitude: z.number().finite().min(-180).max(180),
}).strict();

const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const STEM_ELEMENTS = ["목", "목", "화", "화", "토", "토", "금", "금", "수", "수"];
const BRANCH_ELEMENTS = ["수", "토", "목", "목", "토", "화", "화", "토", "금", "금", "토", "수"];
const DAY_MASTERS = ["갑목(甲木)", "을목(乙木)", "병화(丙火)", "정화(丁火)", "무토(戊土)", "기토(己土)", "경금(庚金)", "신금(辛金)", "임수(壬水)", "계수(癸水)"];
const SIGNS = ["양자리", "황소자리", "쌍둥이자리", "게자리", "사자자리", "처녀자리", "천칭자리", "전갈자리", "사수자리", "염소자리", "물병자리", "물고기자리"];

function localDateTime(profile: BirthProfile): DateTime {
  return DateTime.fromISO(`${profile.birthDate}T${profile.birthTime ?? "12:00"}`, { zone: profile.timezone });
}

/** Solar calendar inputs. Reject invalid dates and DST normalization instead of guessing. */
export function validateBirthProfile(raw: unknown): BirthProfile {
  const result = profileSchema.safeParse(raw);
  if (!result.success) throw new Error("이름, 양력 생년월일, 출생 시간과 출생 도시를 확인해 주세요.");
  const profile = result.data;
  if (!IANAZone.isValidZone(profile.timezone)) throw new Error("유효한 출생 지역의 시간대를 선택해 주세요.");
  const date = DateTime.fromISO(profile.birthDate, { zone: profile.timezone });
  if (!date.isValid || date.toISODate() !== profile.birthDate || date.year < 1900) {
    throw new Error("생년월일은 1900년 이후의 실제 양력 날짜로 입력해 주세요.");
  }
  const local = localDateTime(profile);
  if (!local.isValid || local.toFormat("yyyy-MM-dd") !== profile.birthDate || (profile.birthTime && local.toFormat("HH:mm") !== profile.birthTime)) {
    throw new Error("해당 지역의 일광절약시간 전환으로 존재하지 않는 출생 시간입니다. 출생 기록을 확인해 주세요.");
  }
  if (profile.birthTime && local.getPossibleOffsets().length > 1) {
    throw new Error("일광절약시간 종료로 두 번 존재하는 시간입니다. 정확한 시각을 구분할 수 없으므로 출생 시간을 ‘모름’으로 선택해 주세요.");
  }
  const now = DateTime.now().setZone(profile.timezone);
  if (date.startOf("day") > now.startOf("day") || (profile.birthTime && local > now)) {
    throw new Error("미래의 날짜나 시간을 생년월일로 사용할 수 없어요.");
  }
  return profile;
}

function eightChar(date: DateTime) {
  const result = Solar.fromYmdHms(date.year, date.month, date.day, date.hour, date.minute, date.second).getLunar().getEightChar();
  result.setSect(2); // civil midnight day rollover, rather than a 23:00 day rollover
  return result;
}

function zodiac(longitude: number): { sign: string; degree: number } {
  const normalized = ((longitude % 360) + 360) % 360;
  return { sign: SIGNS[Math.floor(normalized / 30)], degree: Math.min(29.99, Math.round((normalized % 30) * 100) / 100) };
}

/** Eastern intersection of the ecliptic with the geometric local horizon (no refraction). */
function ascendant(date: Date, latitude: number, longitude: number): { sign: string; degree: number } {
  const radians = Math.PI / 180;
  const theta = (SiderealTime(date) * 15 + longitude) * radians;
  const epsilon = e_tilt(MakeTime(date)).tobl * radians;
  const phi = latitude * radians;
  let lambda = Math.atan2(-Math.cos(theta), Math.sin(theta) * Math.cos(epsilon) + Math.tan(phi) * Math.sin(epsilon));
  const east = -Math.sin(theta) * Math.cos(lambda) + Math.cos(theta) * Math.cos(epsilon) * Math.sin(lambda);
  if (east < 0) lambda += Math.PI;
  return zodiac(lambda / radians);
}

export function calculateChart(input: BirthProfile): Chart {
  const profile = validateBirthProfile(input);
  const local = localDateTime(profile);
  const date = local.toJSDate();
  // lunar-javascript's solar terms are expressed in China civil time (UTC+08).
  // Year/month compare the actual instant against those terms; day/hour use the user's civil date.
  const termEight = eightChar(local.setZone("UTC+8"));
  const localEight = eightChar(local);
  const day = localEight.getDay();
  const stemIndex = STEMS.indexOf(day[0]);
  const pillarPairs: [string, string][] = [["연주", termEight.getYear()], ["월주", termEight.getMonth()], ["일주", day]];
  if (profile.birthTime) {
    // Derive the hour stem from the chosen midnight day convention consistently, including late 子.
    const hourBranch = Math.floor((local.hour + 1) / 2) % 12;
    const hourStem = ((stemIndex % 5) * 2 + hourBranch) % 10;
    pillarPairs.push(["시주", STEMS[hourStem] + BRANCHES[hourBranch]]);
  }
  const counts = new Map(["목", "화", "토", "금", "수"].map((name) => [name, 0]));
  const pillars = pillarPairs.map(([label, ganZhi]) => {
    const stemElement = STEM_ELEMENTS[STEMS.indexOf(ganZhi[0])];
    const branchElement = BRANCH_ELEMENTS[BRANCHES.indexOf(ganZhi[1])];
    counts.set(stemElement, (counts.get(stemElement) ?? 0) + 1);
    counts.set(branchElement, (counts.get(branchElement) ?? 0) + 1);
    return { label, ganZhi, element: `${stemElement} · ${branchElement}` };
  });

  const sun = zodiac(SunPosition(date).elon);
  let moon: Chart["moon"] = zodiac(EclipticGeoMoon(date).lon);
  const notes = [
    "양력 입력 · 연주/월주는 입춘과 절입의 실제 시각 기준 · 일주/시주는 출생지의 현지 표준시와 일광절약시간 기준, 자정에 날짜 변경. 진태양시 보정은 적용하지 않습니다.",
    "서양 점성술은 지구 중심의 열대황도(춘분점 기준)를 사용합니다. 상승점은 기하학적 동쪽 지평선 기준이며 하우스·행성 각도·트랜싯은 계산하지 않습니다.",
    "오행 수는 천간·지지의 대표 오행을 단순 집계합니다. 지장간·강약·용신·대운은 판정하지 않으므로 수치만으로 유불리를 단정할 수 없습니다.",
  ];
  if (!profile.birthTime) {
    const start = local.startOf("day");
    const end = start.plus({ days: 1 }).minus({ milliseconds: 1 });
    const moonStart = zodiac(EclipticGeoMoon(start.toJSDate()).lon);
    const moonEnd = zodiac(EclipticGeoMoon(end.toJSDate()).lon);
    if (moonStart.sign !== moonEnd.sign) moon = null;
    const sunStart = zodiac(SunPosition(start.toJSDate()).elon);
    const sunEnd = zodiac(SunPosition(end.toJSDate()).elon);
    notes.push("출생 시간을 모르면 시주와 상승점을 제외합니다. 태양과 달의 도수는 현지 정오 기준 참고값이며, 당일 달자리가 바뀌면 달자리도 제외합니다.");
    if (sunStart.sign !== sunEnd.sign) notes.push(`이 날 태양이 ${sunStart.sign}에서 ${sunEnd.sign}로 이동합니다. 표시된 태양자리는 정오 기준이며 정확한 출생 시간이 있어야 확정할 수 있습니다.`);
    if (!moon) notes.push(`이 날 달이 ${moonStart.sign}에서 ${moonEnd.sign}로 이동하므로 출생 시간 없이 달자리를 확정할 수 없습니다.`);
    const termStart = eightChar(start.setZone("UTC+8"));
    const termEnd = eightChar(end.setZone("UTC+8"));
    if (termStart.getYear() !== termEnd.getYear() || termStart.getMonth() !== termEnd.getMonth()) {
      notes.push("이 날 절입 경계를 지나므로 연주 또는 월주가 달라질 수 있습니다. 현재 표시는 현지 정오 기준이며 출생 시간 확인이 필요합니다.");
    }
  }
  notes.push("사주와 점성술의 해석은 과학적으로 검증된 성격 진단이나 미래 예측이 아닌 자기 성찰을 위한 참고입니다.");
  return {
    pillars,
    dayMaster: DAY_MASTERS[stemIndex],
    elements: [...counts].map(([name, count]) => ({ name, count })),
    sun,
    moon,
    ascendant: profile.birthTime ? ascendant(date, profile.latitude, profile.longitude) : null,
    notes,
  };
}
