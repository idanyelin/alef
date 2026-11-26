// Drawn graphics: placeholder story pictures, stickers and the jar.

export const PALETTE = ['#b9cfb4', '#e8bfa8', '#b8d2e3', '#efd9a0', '#d3c5e3', '#efc9c9', '#bfdcd3'];
const DEEP = ['#7fa678', '#d08f6f', '#7aa6c2', '#d4b25a', '#a48fc0', '#d38f8f', '#7fb4a3'];

function rng(seed) {
  let s = seed * 9301 + 49297;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}
const svgURL = svg => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);

// Calm abstract scenes, used until real pictures exist.
export function placeholderPictures(letterIndex, count = 3) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const r = rng(letterIndex * 7 + i * 31 + 3);
    const sky = ['#eaf2f4', '#f6efe3', '#f1ecf5', '#eef4ea'][(letterIndex + i) % 4];
    const c1 = PALETTE[(letterIndex + i) % PALETTE.length];
    const c2 = PALETTE[(letterIndex + i + 3) % PALETTE.length];
    const c3 = DEEP[(letterIndex + i + 1) % DEEP.length];
    const sunX = 120 + r() * 360, sunY = 90 + r() * 70;
    const h1 = 250 + r() * 50, h2 = 300 + r() * 40;
    let shapes = '';
    for (let k = 0; k < 3; k++) {
      const x = 90 + k * 170 + r() * 60, y = 330 + r() * 50, s = 26 + r() * 22;
      shapes += `<circle cx="${x.toFixed(0)}" cy="${y.toFixed(0)}" r="${s.toFixed(0)}" fill="${c3}" opacity=".55"/>`;
    }
    out.push(svgURL(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 450">
        <rect width="600" height="450" fill="${sky}"/>
        <circle cx="${sunX}" cy="${sunY}" r="46" fill="#f3d58e" opacity=".9"/>
        <path d="M0 ${h1} Q150 ${h1 - 70} 300 ${h1} T600 ${h1} V450 H0Z" fill="${c1}"/>
        <path d="M0 ${h2} Q200 ${h2 - 50} 400 ${h2} T800 ${h2} V450 H0Z" fill="${c2}"/>
        ${shapes}
      </svg>`));
  }
  return out;
}

// ---------- stickers ----------
// Every sticker is the same round disc (white rim, soft pastel face);
// only the small picture inside changes. Pictures are drawn in a 100x100
// box and scaled into the centre of the disc.
const MOTIFS = [
  // star
  c => `<path d="M50 8 L61 37 L92 38 L67 57 L76 88 L50 70 L24 88 L33 57 L8 38 L39 37Z" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`,
  // heart
  c => `<path d="M50 86 C20 64 8 46 14 30 C20 14 42 12 50 30 C58 12 80 14 86 30 C92 46 80 64 50 86Z" fill="${c}"/>`,
  // flower
  c => `${[0, 72, 144, 216, 288].map(a => `<circle cx="${(50 + 24 * Math.cos((a - 90) * Math.PI / 180)).toFixed(1)}" cy="${(50 + 24 * Math.sin((a - 90) * Math.PI / 180)).toFixed(1)}" r="19" fill="${c}"/>`).join('')}<circle cx="50" cy="50" r="14" fill="#f3d58e" stroke="#fff" stroke-width="4"/>`,
  // leaf
  c => `<path d="M16 84 C16 40 46 14 86 14 C86 56 60 84 16 84Z" fill="${c}"/><path d="M24 76 L70 30" stroke="#fff" stroke-width="5" stroke-linecap="round" opacity=".8"/>`,
  // sun
  c => `<g stroke="${c}" stroke-width="8" stroke-linecap="round">${[0, 45, 90, 135, 180, 225, 270, 315].map(a => { const r = a * Math.PI / 180; return `<line x1="${(50 + 34 * Math.cos(r)).toFixed(1)}" y1="${(50 + 34 * Math.sin(r)).toFixed(1)}" x2="${(50 + 45 * Math.cos(r)).toFixed(1)}" y2="${(50 + 45 * Math.sin(r)).toFixed(1)}"/>`; }).join('')}</g><circle cx="50" cy="50" r="24" fill="${c}"/>`,
  // fish
  c => `<path d="M10 50 C28 22 64 22 76 50 C64 78 28 78 10 50Z M74 50 L94 30 L94 70Z" fill="${c}" stroke="${c}" stroke-width="4" stroke-linejoin="round"/><circle cx="30" cy="45" r="6" fill="#fff"/>`,
  // moon
  c => `<path d="M62 10 A42 42 0 1 0 90 66 A34 34 0 1 1 62 10Z" fill="${c}"/>`,
  // butterfly
  c => `<path d="M48 48 C34 14 6 16 10 40 C12 54 30 56 48 52Z M52 48 C66 14 94 16 90 40 C88 54 70 56 52 52Z M48 54 C30 58 16 72 26 84 C34 92 46 74 48 60Z M52 54 C70 58 84 72 74 84 C66 92 54 74 52 60Z" fill="${c}"/><rect x="46" y="34" width="8" height="46" rx="4" fill="#8a7a6a" opacity=".7"/>`,
];
export const STICKER_SHAPES = MOTIFS.length;
export const STICKER_COLORS = DEEP.length;
export function stickerSVG(shape, color) {
  const face = PALETTE[color % PALETTE.length];
  const ink = DEEP[color % DEEP.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <circle cx="50" cy="52" r="47" fill="#6b5a48" opacity=".10"/>
    <circle cx="50" cy="50" r="47" fill="#fff"/>
    <circle cx="50" cy="50" r="40" fill="${face}"/>
    <g transform="translate(50 50) scale(.62) translate(-50 -50)">${MOTIFS[shape % MOTIFS.length](ink)}</g>
  </svg>`;
}

// ---------- jar ----------
export const JAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 120" preserveAspectRatio="none">
  <path d="M22 14 H78 V22 C90 28 94 40 94 54 V102 C94 112 86 118 76 118 H24 C14 118 6 112 6 102 V54 C6 40 10 28 22 22Z"
        fill="#ffffff" fill-opacity=".45" stroke="#a9b8bd" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M16 50 C16 40 20 34 26 30" stroke="#ffffff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".9"/>
</svg>`;
export const LID_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 24" preserveAspectRatio="none">
  <rect x="14" y="2" width="72" height="18" rx="6" fill="#d9b48a" stroke="#b8946a" stroke-width="2"/>
  <rect x="14" y="13" width="72" height="3" fill="#c9a379"/>
</svg>`;

// Back arrow (points right: "back" in a right-to-left interface)
export const BACK_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><path d="M18 12 L30 24 L18 36" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
