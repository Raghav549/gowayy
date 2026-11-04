/**
 * Build the five transparent, looping onboarding illustrations as optimized animated
 * WebP. Each frame is rendered from layered 2.5D SVG shapes so the art stays crisp,
 * small, and works on web plus Expo Image without a 3D runtime.
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'assets/onboarding');
const W = 600, H = 420, FRAMES = 36;
const esc = (s) => s;
const wrap = (inside) => `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${defs}<g>${inside}</g></svg>`;
const defs = `<defs>
  <linearGradient id="bag" x2="0" y2="1"><stop stop-color="#B5753E"/><stop offset=".55" stop-color="#92522D"/><stop offset="1" stop-color="#633822"/></linearGradient>
  <linearGradient id="cream" x2=".9" y2="1"><stop stop-color="#FFF7E9"/><stop offset="1" stop-color="#E9D8BF"/></linearGradient>
  <linearGradient id="purple" x2=".9" y2="1"><stop stop-color="#B598D6"/><stop offset=".52" stop-color="#8063B4"/><stop offset="1" stop-color="#573A8C"/></linearGradient>
  <linearGradient id="carbody" x2="0" y2="1"><stop stop-color="#FFB455"/><stop offset=".48" stop-color="#F28C38"/><stop offset="1" stop-color="#CF5F27"/></linearGradient>
  <linearGradient id="glass" x2="1" y2="1"><stop stop-color="#EAF8F4"/><stop offset="1" stop-color="#8FB7B8"/></linearGradient>
  <linearGradient id="leaf" x2=".85" y2="1"><stop stop-color="#A9CF73"/><stop offset="1" stop-color="#568A50"/></linearGradient>
  <linearGradient id="mountain" x2="0" y2="1"><stop stop-color="#BDAADD"/><stop offset="1" stop-color="#8E7DB9"/></linearGradient>
  <linearGradient id="mountain2" x2="0" y2="1"><stop stop-color="#A9C3A5"/><stop offset="1" stop-color="#789A83"/></linearGradient>
  <radialGradient id="sun"><stop stop-color="#FFF5CF"/><stop offset="1" stop-color="#F6C984"/></radialGradient>
  <linearGradient id="tea" x2="0" y2="1"><stop stop-color="#EAB467"/><stop offset="1" stop-color="#B66B38"/></linearGradient>
  <filter id="soft" x="-.25" y="-.25" width="1.5" height="1.7"><feGaussianBlur stdDeviation="9"/></filter>
</defs>`;
const shadow = (cx, cy, rx, ry, opacity = .2) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#40304C" opacity="${opacity}" filter="url(#soft)"/>`;
const leafShape = (x,y,s=1,color='url(#leaf)') => `<path d="M${x} ${y+18*s} C${x+2*s} ${y-10*s} ${x+33*s} ${y-15*s} ${x+38*s} ${y-13*s} C${x+34*s} ${y+15*s} ${x+13*s} ${y+29*s} ${x} ${y+18*s}Z" fill="${color}"/><path d="M${x+3*s} ${y+18*s} Q${x+19*s} ${y+5*s} ${x+34*s} ${y-11*s}" fill="none" stroke="#E5F2C8" stroke-width="2" opacity=".75"/>`;

function groceries(u) {
  const bounce = (n) => Math.sin(u * Math.PI * 2 + n);
  return `${shadow(300,350,184,22,.16)}
  <path d="M195 173 Q207 95 265 98 Q323 98 333 174" fill="none" stroke="#B87948" stroke-width="13" stroke-linecap="round"/>
  <path d="M183 174 Q300 158 417 174 L397 327 Q300 351 202 327Z" fill="url(#bag)" stroke="#70452C" stroke-width="3"/>
  <path d="M192 183 Q300 196 408 183" fill="none" stroke="#D7A36D" stroke-width="8" opacity=".85"/>
  <path d="M206 220 Q300 230 397 220 M203 256 Q300 267 393 256 M200 292 Q300 303 389 292" fill="none" stroke="#D49B64" stroke-width="3" opacity=".55"/>
  <g transform="translate(0 ${bounce(0)*3})"><path d="M222 183 Q211 141 241 118 Q272 136 262 184Z" fill="#F06F55"/><path d="M237 132 Q247 112 259 119" fill="none" stroke="#4C8753" stroke-width="7" stroke-linecap="round"/><ellipse cx="244" cy="150" rx="19" ry="25" fill="#FF9C74" opacity=".45"/></g>
  <g transform="translate(0 ${bounce(2)*4})"><circle cx="299" cy="151" r="40" fill="#F3B74E"/><circle cx="287" cy="140" r="10" fill="#FFE49A" opacity=".7"/><path d="M297 111 Q301 97 314 99" fill="none" stroke="#5D9252" stroke-width="7" stroke-linecap="round"/></g>
  <g transform="translate(0 ${bounce(4)*3})"><path d="M334 186 Q326 143 352 124 Q379 136 375 186Z" fill="#68A966"/><path d="M352 132 Q354 113 367 108" fill="none" stroke="#487D4B" stroke-width="6" stroke-linecap="round"/><path d="M352 151 Q346 169 338 179" fill="none" stroke="#C6E3A4" stroke-width="3"/></g>
  ${leafShape(173,146,.78)}${leafShape(365,111,.82)}
  <g transform="translate(0 ${bounce(1)*2})"><path d="M275 199 Q298 173 322 199 L315 223 Q298 230 281 222Z" fill="#F4DFB6"/><path d="M280 200 Q298 194 317 200" stroke="#C78B4C" stroke-width="3" fill="none"/><circle cx="294" cy="207" r="2" fill="#9D6B40"/><circle cx="305" cy="211" r="2" fill="#9D6B40"/></g>`;
}
function cab(u) {
  const arrive = u < .48 ? u/.48 : u < .77 ? 1 : (1-u)/.23;
  const ease = 1-Math.pow(1-Math.max(0,Math.min(1,arrive)),3);
  const x = 410 - 205*ease;
  const opacity = Math.max(0,Math.min(1,arrive*3));
  const wave = Math.sin(u*Math.PI*6)*20;
  return `${shadow(304,354,220,20,.14)}
  <path d="M72 328 Q300 316 530 328" fill="none" stroke="#BBA8CD" stroke-width="5" stroke-linecap="round" opacity=".65"/>
  <path d="M90 350 H520" stroke="#D9C9B8" stroke-width="3" stroke-dasharray="20 20" opacity=".7"/>
  <g opacity=".55"><path d="M70 259 Q142 155 227 252 Q278 172 353 249 Q408 189 504 267Z" fill="#B9B0D5"/><path d="M70 279 Q160 198 247 278 Q349 205 520 282V325H70Z" fill="#B9D0B0"/></g>
  <g transform="translate(${x},0)" opacity="${opacity}">
    <ellipse cx="215" cy="325" rx="143" ry="14" fill="#55415A" opacity=".17"/>
    <path d="M75 295 Q81 269 107 263 L151 250 L183 210 Q196 193 221 193 H282 Q306 194 323 215 L355 257 L386 270 Q401 277 405 296 L402 321 H76Z" fill="url(#carbody)" stroke="#A9522C" stroke-width="4"/>
    <path d="M166 250 L192 216 Q200 208 219 208 H248 V253Z" fill="url(#glass)" stroke="#D9F0E8" stroke-width="4"/>
    <path d="M258 208 H280 Q296 209 307 225 L328 253 H258Z" fill="url(#glass)" stroke="#D9F0E8" stroke-width="4"/>
    <path d="M252 207 V255" stroke="#A95B39" stroke-width="5"/>
    <path d="M343 266 L369 278" stroke="#FFE2A5" stroke-width="8" stroke-linecap="round"/>
    <path d="M94 278 L120 269" stroke="#FFF1CB" stroke-width="8" stroke-linecap="round"/>
    <path d="M182 280 H209 M278 280 H305" stroke="#B76130" stroke-width="3" opacity=".75"/>
    <circle cx="145" cy="319" r="27" fill="#443544"/><circle cx="145" cy="319" r="14" fill="#E7DCCB"/><circle cx="145" cy="319" r="6" fill="#98877F"/>
    <circle cx="341" cy="319" r="27" fill="#443544"/><circle cx="341" cy="319" r="14" fill="#E7DCCB"/><circle cx="341" cy="319" r="6" fill="#98877F"/>
    <g><circle cx="223" cy="223" r="17" fill="#B8734D"/><path d="M204 223 Q205 199 227 202 Q244 205 241 222Z" fill="#3C3442"/><path d="M205 243 Q226 231 247 247 L254 273 H201Z" fill="#553F80"/><path d="M221 237 Q231 234 241 245" fill="none" stroke="#E7B090" stroke-width="7" stroke-linecap="round"/>
      <g transform="translate(240,246) rotate(${wave})"><path d="M0 0 Q19 -13 35 -29" fill="none" stroke="#B8734D" stroke-width="9" stroke-linecap="round"/><path d="M31 -31 Q33 -41 40 -45 M31 -31 Q40 -36 47 -34 M31 -31 Q40 -29 46 -23" fill="none" stroke="#B8734D" stroke-width="5" stroke-linecap="round"/></g>
    </g>
  </g>`;
}
function hotel(u) {
  const sway = Math.sin(u*Math.PI*2)*9;
  const bag = Math.sin(u*Math.PI*2)*3;
  return `${shadow(300,354,186,19,.16)}
  <circle cx="430" cy="93" r="35" fill="url(#sun)" opacity=".95"/>
  <path d="M107 163 L300 70 L493 163 V332 H107Z" fill="url(#cream)" stroke="#CDBCA5" stroke-width="4"/>
  <path d="M80 165 L300 54 L520 165 L496 181 L300 83 L104 181Z" fill="url(#purple)" stroke="#624789" stroke-width="4"/>
  <path d="M129 180 H471" stroke="#D9C8B2" stroke-width="7"/>
  <rect x="153" y="199" width="117" height="91" rx="9" fill="#B5D0CB" stroke="#8D7C9D" stroke-width="7"/>
  <path d="M210 200 V290" stroke="#FFF8E8" stroke-width="8"/><path d="M154 246 H270" stroke="#FFF8E8" stroke-width="8"/>
  <path d="M163 203 Q186 230 174 283" fill="none" stroke="#9A74B7" stroke-width="17" opacity=".72"/>
  <path d="M260 203 Q239 233 251 283" fill="none" stroke="#9A74B7" stroke-width="17" opacity=".72"/>
  <g transform="rotate(${sway} 170 205)"><path d="M159 197 Q172 213 171 232" fill="none" stroke="#E1CBEA" stroke-width="6" stroke-linecap="round"/></g>
  <g transform="rotate(${-sway} 260 205)"><path d="M256 197 Q245 215 246 231" fill="none" stroke="#E1CBEA" stroke-width="6" stroke-linecap="round"/></g>
  <path d="M322 330 V213 Q322 198 339 198 H432 Q448 198 448 213 V330Z" fill="#8B6E9E"/>
  <path d="M337 330 V219 Q337 213 346 213 H422 Q433 213 433 222 V330Z" fill="#F1D7B2"/>
  <path d="M347 230 H423 V268 H347Z" fill="#B5D0CB"/><path d="M384 230 V268" stroke="#FFF6DF" stroke-width="5"/>
  <path d="M300 330 H466" stroke="#B89E84" stroke-width="8" stroke-linecap="round"/>
  <g transform="translate(0,${bag})"><path d="M278 309 Q277 286 292 283 H314 Q330 286 330 309 L327 337 H280Z" fill="url(#purple)" stroke="#604881" stroke-width="3"/><path d="M291 286 Q294 268 304 268 Q316 268 319 286" fill="none" stroke="#6B4F89" stroke-width="6"/><path d="M283 310 H326" stroke="#D6C3E5" stroke-width="3"/></g>
  <path d="M114 332 H486" stroke="#D2C0A9" stroke-width="7" stroke-linecap="round"/>`;
}
function discovery(u) {
  const step = Math.sin(u*Math.PI*2*2);
  const arm = Math.sin(u*Math.PI*2*2+1.2)*8;
  return `${shadow(300,355,230,18,.12)}
  <circle cx="450" cy="87" r="39" fill="url(#sun)" opacity=".95"/>
  <path d="M36 260 L171 112 L257 214 L331 93 L548 274 V341 H36Z" fill="url(#mountain)"/>
  <path d="M119 171 L171 112 L211 160 L190 151 L174 160 L159 145 L145 166Z" fill="#F8F1FC" opacity=".93"/>
  <path d="M282 161 L331 93 L374 143 L352 135 L334 146 L318 129 L303 154Z" fill="#F8F1FC" opacity=".94"/>
  <path d="M15 279 Q142 203 270 266 Q405 197 585 277 V352 H15Z" fill="url(#mountain2)"/>
  <path d="M30 292 Q145 243 245 285 M289 287 Q413 230 557 291" fill="none" stroke="#D7E2C6" stroke-width="8" opacity=".7"/>
  <path d="M0 340 Q140 300 268 342 Q410 291 600 337 V420 H0Z" fill="#8FAF79"/>
  <path d="M-10 402 Q159 311 288 385 Q418 443 610 331" fill="none" stroke="#E4C994" stroke-width="37" stroke-linecap="round"/>
  <path d="M-10 401 Q159 310 288 384 Q418 442 610 330" fill="none" stroke="#F5E5C7" stroke-width="23" stroke-linecap="round"/>
  <g fill="#668B59" opacity=".85"><path d="M82 314 l16 -43 16 43z M89 299 l9 -31 10 31z"/><path d="M484 309 l17 -49 18 49z M493 293 l9 -34 11 34z"/><path d="M523 321 l14 -39 14 39z"/></g>
  <g transform="translate(299,0)">
    <ellipse cx="0" cy="342" rx="34" ry="10" fill="#43564A" opacity=".25"/>
    <g transform="translate(0,${Math.abs(step)*-2})"><circle cx="0" cy="221" r="21" fill="#B87651"/><path d="M-21 219 Q-19 190 2 194 Q21 197 22 219Z" fill="#48334B"/><path d="M-26 214 Q0 201 28 215" stroke="#D8B17E" stroke-width="7" stroke-linecap="round"/><path d="M-22 244 Q0 229 22 244 L33 296 H-31Z" fill="url(#purple)"/><path d="M-18 249 L-42 276" stroke="#B87651" stroke-width="8" stroke-linecap="round"/><path d="M20 249 L${35+arm} 273" stroke="#B87651" stroke-width="8" stroke-linecap="round"/></g>
    <path d="M-17 293 L${-24+step*6} 326 L${-31+step*6} 340 M15 293 L${23-step*6} 321 L${31-step*6} 337" fill="none" stroke="#473D52" stroke-width="10" stroke-linecap="round"/><path d="M-31 340 H-14 M25 337 H40" stroke="#624D3F" stroke-width="8" stroke-linecap="round"/>
    <path d="M-29 250 L-55 288" stroke="#C7814E" stroke-width="8"/><path d="M-61 285 V340" stroke="#665142" stroke-width="5"/><path d="M-68 340 H-54" stroke="#B28A61" stroke-width="8" stroke-linecap="round"/>
  </g>`;
}
function experience(u) {
  const sway = Math.sin(u*Math.PI*2)*7;
  const steam = (phase, x) => `<path d="M${x} 154 C${x-15} 136 ${x+14} 126 ${x} ${108+phase}" fill="none" stroke="#FFF7EA" stroke-width="5" stroke-linecap="round" opacity="${.3+.55*((Math.sin(u*Math.PI*2+phase)+1)/2)}"/>`;
  return `${shadow(300,355,209,17,.14)}
  <path d="M50 320 Q166 220 285 300 T560 282 V347 H50Z" fill="#A6BE83"/>
  <path d="M47 338 Q169 257 293 322 T563 305" fill="none" stroke="#7E9E67" stroke-width="14"/>
  <path d="M47 358 Q169 276 293 342 T563 325" fill="none" stroke="#BBD092" stroke-width="10"/>
  <g transform="translate(0,${sway})">${leafShape(102,259,1.1)}${leafShape(140,285,.8)}${leafShape(451,253,1.1)}${leafShape(484,281,.8)}</g>
  <g><path d="M124 298 Q124 250 160 248 Q195 249 194 297 L185 335 H134Z" fill="#B87550"/><circle cx="159" cy="222" r="28" fill="#B87550"/><path d="M131 220 Q132 186 162 189 Q190 192 189 221Z" fill="#403449"/><path d="M121 205 Q159 181 199 205 L193 215 Q159 207 128 218Z" fill="#D4A66B"/><path d="M142 247 Q160 259 178 247" stroke="#F6D8B8" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M144 335 L134 353 M177 335 L187 353" stroke="#694A45" stroke-width="9" stroke-linecap="round"/></g>
  <path d="M244 320 Q251 273 280 270 H391 Q421 273 428 320 L420 340 H251Z" fill="url(#cream)" stroke="#B99B79" stroke-width="4"/>
  <path d="M264 300 H408" stroke="#D2BFA6" stroke-width="6"/><path d="M278 317 H394" stroke="#EFE5D6" stroke-width="5"/>
  <g transform="translate(0,${Math.sin(u*Math.PI*2)*2})">
    <path d="M323 270 Q325 237 349 233 Q374 236 377 270Z" fill="url(#tea)" stroke="#9A5F37" stroke-width="4"/>
    <ellipse cx="350" cy="270" rx="27" ry="8" fill="#F3D4A4"/><ellipse cx="350" cy="266" rx="19" ry="5" fill="#B47745"/>
    <path d="M377 244 Q405 235 405 253 Q405 270 378 264" fill="none" stroke="#C18E61" stroke-width="8"/>
    ${steam(0,337)}${steam(13,356)}
  </g>
  <g><path d="M223 265 Q218 239 241 231 Q265 234 264 264Z" fill="#7C503C"/><path d="M222 264 Q244 258 264 264" fill="none" stroke="#E2C090" stroke-width="5"/><path d="M232 239 Q245 249 260 240" stroke="#A8C66D" stroke-width="4" fill="none"/></g>
  <path d="M72 334 Q116 321 136 335 M433 339 Q470 323 520 337" fill="none" stroke="#E2D2AF" stroke-width="5" opacity=".9"/>`;
}
const scenes = [
  ['groceries-animated.webp', groceries],
  ['local-cab-animated.webp', cab],
  ['hotel-stay-animated.webp', hotel],
  ['himalayan-discovery-animated.webp', discovery],
  ['local-experience-animated.webp', experience],
];

mkdirSync(out,{recursive:true});
for (const [name, scene] of scenes) {
  const temp = join(tmpdir(), `gowayy-${process.pid}-${name.replace('.webp','')}`);
  mkdirSync(temp,{recursive:true});
  const paths=[];
  for (let i=0;i<FRAMES;i++) {
    const u=i/(FRAMES-1);
    const svg=wrap(scene(u));
    const png=new Resvg(svg,{fitTo:{mode:'width',value:W},font:{loadSystemFonts:false}}).render().asPng();
    const frame=join(temp,`${String(i).padStart(3,'0')}.png`);
    writeFileSync(frame,png); paths.push(frame);
  }
  // 12 fps, transparent looping WebP; lossy quality keeps all five scenes lightweight.
  execFileSync('convert',['-delay','8','-dispose','background',...paths,'-loop','0','-quality','82','-define','webp:method=5',join(out,name)]);
  rmSync(temp,{recursive:true,force:true});
  console.log(`wrote assets/onboarding/${name}`);
}
