import type { Chart } from "@/lib/types";

const glyphs = ["♈︎", "♉︎", "♊︎", "♋︎", "♌︎", "♍︎", "♎︎", "♏︎", "♐︎", "♑︎", "♒︎", "♓︎"];
const signs = ["양자리", "황소자리", "쌍둥이자리", "게자리", "사자자리", "처녀자리", "천칭자리", "전갈자리", "사수자리", "염소자리", "물병자리", "물고기자리"];
const longitude = (body: { sign: string; degree: number }) => Math.max(0, signs.indexOf(body.sign)) * 30 + body.degree;
const point = (degrees: number, radius: number) => {
  const angle = (degrees - 90) * Math.PI / 180;
  // Match SVG attributes across server and browser math implementations.
  return { x: Number((150 + Math.cos(angle) * radius).toFixed(4)), y: Number((150 + Math.sin(angle) * radius).toFixed(4)) };
};

export function StarWheel({ chart }: { chart?: Chart }) {
  const sun = point(chart ? longitude(chart.sun) : 53, 76);
  const moon = chart && !chart.moon ? null : point(chart?.moon ? longitude(chart.moon) : 213, 76);
  const ascendant = chart?.ascendant ? point(longitude(chart.ascendant), 90) : null;
  return <svg viewBox="0 0 300 300" className="star-wheel" role="img" aria-label={chart ? "태양과 달의 황도 위치" : "별자리를 형상화한 장식 일러스트"}>
    <defs><radialGradient id="wheel-glow"><stop offset="0" stopColor="#f0eaf7" /><stop offset="1" stopColor="#faf8f5" /></radialGradient></defs>
    <circle cx="150" cy="150" r="139" fill="url(#wheel-glow)" />
    {[134, 112, 94, 82].map((radius) => <circle key={radius} cx="150" cy="150" r={radius} fill="none" stroke="#ddd5e5" strokeWidth="0.7" />)}
    {glyphs.map((glyph, index) => {
      const inner = point(index * 30, 94); const outer = point(index * 30, 134); const symbol = point(index * 30 + 15, 122);
      return <g key={glyph}><line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} stroke="#ddd5e5" strokeWidth="0.7" /><text x={symbol.x} y={symbol.y + 4} textAnchor="middle" fontSize="14" fill="#9385a5">{glyph}</text></g>;
    })}
    {Array.from({ length: 72 }, (_, index) => { const start = point(index * 5, 109); const end = point(index * 5, index % 6 === 0 ? 102 : 106); return <line key={index} x1={start.x} y1={start.y} x2={end.x} y2={end.y} stroke="#c6bbd1" strokeWidth="0.65" />; })}
    {!chart && moon && <><path d={`M${sun.x},${sun.y} L${moon.x},${moon.y} L${point(325, 76).x},${point(325, 76).y} Z`} fill="none" stroke="#c1aed3" strokeWidth="0.85" opacity="0.7" /><path d={`M${sun.x},${sun.y} L${point(136, 76).x},${point(136, 76).y} L${point(325, 76).x},${point(325, 76).y}`} fill="none" stroke="#c1aed3" strokeWidth="0.85" opacity="0.7" /></>}
    <circle cx={sun.x} cy={sun.y} r="10" fill="#f6ebd4" stroke="#d4b677" strokeWidth="0.7" /><text x={sun.x} y={sun.y + 4} textAnchor="middle" fontSize="14" fill="#ba9450">☉</text>
    {moon && <><circle cx={moon.x} cy={moon.y} r="10" fill="#ede6f4" stroke="#b4a0c9" strokeWidth="0.7" /><text x={moon.x} y={moon.y + 4} textAnchor="middle" fontSize="14" fill="#9b83b6">☾</text></>}
    {ascendant && <text x={ascendant.x} y={ascendant.y + 3} textAnchor="middle" fontSize="8" fill="#97a081">ASC</text>}
    <text x="150" y="145" textAnchor="middle" fill="#8b74a1" fontSize="22" fontFamily="Georgia, serif">✧</text>
    <text x="150" y="169" textAnchor="middle" fill="#ae9dbc" fontSize="7" letterSpacing="2.2">BIRTH CHART</text>
    <circle cx="150" cy="10" r="2" fill="#b99fca" /><circle cx="150" cy="290" r="2" fill="#b99fca" />
  </svg>;
}
