/**
 * GOWAYY mascot generator — "Kanchu the monkey".
 *
 * Produces ONE consistent original 3D-style cartoon character (inspired by the
 * supplied reference traits: big rounded head, dark-brown fur, warm-orange eye
 * mask, large white eyes, big red rounded ears, long beige muzzle, red hands,
 * yellow-orange body) in 12 poses, as lightweight SVG assets with static
 * fallbacks for devices that cannot render 3D. The supplied reference photo is
 * never embedded in any app.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets/mascot');
mkdirSync(out, { recursive: true });

// Palette locked to the reference traits.
const C = {
  fur: '#5A3A22', furDark: '#3E2716', furLight: '#7A5230',
  mask: '#E8862E', ear: '#C63A2E', earInner: '#A02A20',
  eye: '#FFFFFF', pupil: '#241811', muzzle: '#E8C9A0', muzzleDark: '#C9A273',
  body: '#F2A93B', bodyDark: '#D98A24', hand: '#C63A2E', blush: '#E86A4A',
};

function character({ armL = -20, armR = 20, headTilt = 0, brow = 0, mouth = 'smile', blink = false, handChin = false, excited = false }) {
  const eye = (cx, cy, r = 26) => blink
    ? `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="4" fill="${C.pupil}"/>`
    : `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${C.eye}"/><circle cx="${cx + 7}" cy="${cy + 4}" r="11" fill="${C.pupil}"/><circle cx="${cx + 11}" cy="${cy}" r="4" fill="#fff"/>`;
  const mouthPath = {
    smile: 'M 300 330 Q 340 358 380 330',
    o: 'M 340 336 a 14 16 0 1 0 0.1 0',
    think: 'M 312 342 Q 340 334 368 344',
    grin: 'M 296 326 Q 340 366 384 326 Q 340 344 296 326 Z',
  }[mouth];
  const browL = `M ${238 + brow} ${196 - brow} q 26 -12 52 -2`;
  const browR = `M ${390 - brow} ${194 + brow} q 26 -10 52 2`;
  const arm = (side, angle) => {
    const x = side === 'L' ? 210 : 470;
    const flip = side === 'L' ? -1 : 1;
    return `<g transform="rotate(${angle} ${x} 420)">
      <path d="M ${x} 430 q ${flip * -26} 60 ${flip * -8} 118" stroke="${C.fur}" stroke-width="34" stroke-linecap="round" fill="none"/>
      <circle cx="${x + flip * -8}" cy="556" r="24" fill="${C.hand}"/>
      <circle cx="${x + flip * -22}" cy="548" r="8" fill="${C.hand}"/><circle cx="${x + flip * 2}" cy="548" r="8" fill="${C.hand}"/>
    </g>`;
  };
  const chinHand = handChin
    ? `<g transform="rotate(38 380 360)"><path d="M 380 430 q 30 70 -6 118" stroke="${C.fur}" stroke-width="34" stroke-linecap="round" fill="none"/><circle cx="372" cy="556" r="26" fill="${C.hand}"/><circle cx="352" cy="540" r="9" fill="${C.hand}"/><circle cx="372" cy="534" r="9" fill="${C.hand}"/><circle cx="392" cy="542" r="9" fill="${C.hand}"/></g>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 640" role="img" aria-label="Kanchu the GOWAYY monkey mascot">
  <defs>
    <radialGradient id="furG" cx="45%" cy="35%" r="80%"><stop offset="0%" stop-color="${C.furLight}"/><stop offset="100%" stop-color="${C.fur}"/></radialGradient>
    <radialGradient id="bodyG" cx="50%" cy="30%" r="85%"><stop offset="0%" stop-color="#FFC65C"/><stop offset="100%" stop-color="${C.bodyDark}"/></radialGradient>
    <radialGradient id="maskG" cx="50%" cy="42%" r="70%"><stop offset="0%" stop-color="#F49B45"/><stop offset="100%" stop-color="${C.mask}"/></radialGradient>
  </defs>
  <ellipse cx="320" cy="600" rx="150" ry="22" fill="#000" opacity="0.18"/>
  <path d="M 200 620 q -6 -150 40 -210 q 80 -60 160 -60 q 80 0 160 60 q 46 60 40 210 Z" fill="url(#bodyG)"/>
  <g transform="rotate(${headTilt} 320 300)">
    <circle cx="176" cy="240" r="52" fill="${C.ear}"/><circle cx="176" cy="240" r="30" fill="${C.earInner}"/>
    <circle cx="464" cy="240" r="52" fill="${C.ear}"/><circle cx="464" cy="240" r="30" fill="${C.earInner}"/>
    <circle cx="320" cy="270" r="150" fill="url(#furG)"/>
    <path d="M 232 236 q 88 -66 176 0 q -20 -44 -88 -44 q -68 0 -88 44 Z" fill="${C.furDark}"/>
    <ellipse cx="320" cy="292" rx="104" ry="86" fill="url(#maskG)"/>
    ${eye(272, 268)}${eye(368, 268)}
    <path d="${browL}" stroke="${C.furDark}" stroke-width="9" stroke-linecap="round" fill="none"/>
    <path d="${browR}" stroke="${C.furDark}" stroke-width="9" stroke-linecap="round" fill="none"/>
    <ellipse cx="320" cy="330" rx="62" ry="46" fill="${C.muzzle}"/>
    <ellipse cx="320" cy="312" rx="16" ry="11" fill="${C.muzzleDark}"/>
    <path d="M 320 322 v 10" stroke="${C.muzzleDark}" stroke-width="5" stroke-linecap="round"/>
    <path d="${mouthPath}" stroke="${C.pupil}" stroke-width="7" stroke-linecap="round" fill="${mouth === 'grin' ? C.pupil : 'none'}"/>
    <ellipse cx="238" cy="330" rx="12" ry="8" fill="${C.blush}" opacity="0.55"/>
    <ellipse cx="402" cy="330" rx="12" ry="8" fill="${C.blush}" opacity="0.55"/>
  </g>
  ${arm('L', armL)}${arm('R', armR)}${chinHand}
  ${excited ? '<g fill="#C9A86A"><circle cx="120" cy="120" r="8"/><circle cx="520" cy="110" r="8"/><circle cx="560" cy="200" r="6"/><circle cx="90" cy="210" r="6"/></g>' : ''}
</svg>`;
}

const POSES = {
  'idle-standing': { armL: -18, armR: 18, mouth: 'smile' },
  'curious': { armL: -30, armR: 6, headTilt: -8, brow: 6, mouth: 'o' },
  'thinking': { armL: -14, armR: 10, headTilt: 10, brow: -4, mouth: 'think', handChin: true },
  'welcoming': { armL: -95, armR: 95, mouth: 'grin', excited: true },
  'pointing': { armL: -20, armR: -170, headTilt: 6, mouth: 'smile' },
  'excited': { armL: -120, armR: 120, mouth: 'grin', excited: true },
  'waving': { armL: -18, armR: -150, mouth: 'grin' },
  'delivery': { armL: -40, armR: 30, headTilt: -4, mouth: 'smile' },
  'travel': { armL: -60, armR: 60, mouth: 'smile', excited: true },
  'loading': { armL: -18, armR: 18, blink: true, mouth: 'o' },
  'success': { armL: -130, armR: 130, mouth: 'grin', excited: true },
  'error-retry': { armL: -10, armR: 10, headTilt: -6, brow: -6, mouth: 'think' },
};

for (const [name, pose] of Object.entries(POSES)) {
  writeFileSync(join(out, `kanchu-${name}.svg`), character(pose));
}
writeFileSync(join(out, 'MASCOT.md'), `# Kanchu — the GOWAYY monkey mascot

Original character derived from the supplied reference traits (rounded head, dark-brown
fur, orange eye mask, big white eyes, red rounded ears, beige muzzle, red hands,
yellow-orange body). The reference photograph itself is never used in any app.

Poses (SVG, generated by \`scripts/build-mascot.mjs\` — regenerate, don't hand-edit):
${Object.keys(POSES).map((p) => `- \`kanchu-${p}.svg\``).join('\n')}

Usage: onboarding, empty states, loading states, booking confirmations, support entry
points — never on every screen. Static SVG is the universal fallback; a 3D/WebGL variant
may layer on top on capable devices only.
`);
console.log(`mascot: wrote ${Object.keys(POSES).length} pose SVGs to ${out}`);
