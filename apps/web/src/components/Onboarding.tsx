import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { GSymbol } from './ui';

const C = { ink: '#0D0F12', charcoal: '#14161A', graphite: '#2B2F36', silver: '#B6BCC4', ivory: '#EDE6D8', warm: '#F5F1E8', gold: '#C9A86A', goldLight: '#D9BE86', goldDeep: '#8B7245' };

function IntroScene() {
  return (
    <svg viewBox="0 0 600 300" className="onboarding__art" role="img" aria-label="Animated Himalayan landscape with the GOWAYY symbol">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#20242B"/><stop offset="1" stopColor="#0D0F12"/></linearGradient>
        <linearGradient id="hill1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B4049"/><stop offset="1" stopColor="#20242B"/></linearGradient>
        <linearGradient id="hill2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#4A463C"/><stop offset="1" stopColor="#262A31"/></linearGradient>
        <radialGradient id="sun"><stop offset="0" stopColor={C.goldLight} stopOpacity=".85"/><stop offset="1" stopColor={C.gold} stopOpacity="0"/></radialGradient>
      </defs>
      <rect width="600" height="300" fill="url(#sky)"/>
      <circle className="anim-glow" cx="430" cy="80" r="90" fill="url(#sun)"/>
      <g className="anim-cloud" opacity=".3" fill={C.silver}>
        <ellipse cx="140" cy="70" rx="58" ry="12"/><ellipse cx="185" cy="62" rx="38" ry="10"/>
        <ellipse cx="470" cy="120" rx="46" ry="9"/>
      </g>
      <path d="M0 230 L110 140 L190 200 L290 110 L400 215 L500 150 L600 230 V300 H0 Z" fill="url(#hill1)"/>
      <path d="M0 260 L120 195 L240 255 L360 180 L480 260 L600 210 V300 H0 Z" fill="url(#hill2)"/>
      <path d="M0 268 Q150 240 300 268 T600 262 V300 H0 Z" fill="#171A1F"/>
      <g className="anim-float" style={{ transformOrigin: '300px 150px' }}>
        <image href="/brand/g-symbol.png" x="248" y="92" width="104" height="104"/>
      </g>
      <path d="M60 274 H540" stroke={C.gold} strokeOpacity=".35" strokeWidth="2" strokeDasharray="8 12" className="anim-road"/>
    </svg>
  );
}

function ScooterScene() {
  return (
    <svg viewBox="0 0 600 300" className="onboarding__art" role="img" aria-label="Animated 2.5D delivery scooter with rider">
      <defs>
        <linearGradient id="sbox" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.goldLight}/><stop offset="1" stopColor={C.goldDeep}/></linearGradient>
        <linearGradient id="sbody" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E9E1D0"/><stop offset="1" stopColor="#8A919B"/></linearGradient>
      </defs>
      <rect width="600" height="300" fill="none"/>
      <path d="M0 235 Q120 215 260 232 T600 226" stroke="#3B4049" strokeWidth="2" fill="none" opacity=".6"/>
      <path d="M0 262 H600" stroke="#2B2F36" strokeWidth="26"/>
      <path d="M0 262 H600" stroke={C.gold} strokeOpacity=".5" strokeWidth="3" className="anim-road"/>
      <g className="anim-bob" style={{ transformOrigin: '300px 200px' }}>
        {/* delivery box */}
        <path d="M196 128 L232 118 L268 128 L268 180 L232 192 L196 180 Z" fill="url(#sbox)" stroke={C.ink} strokeWidth="2"/>
        <path d="M196 128 L232 140 L268 128" fill="none" stroke={C.ink} strokeOpacity=".4" strokeWidth="2"/>
        <path d="M232 140 V192" stroke={C.ink} strokeOpacity=".35" strokeWidth="2"/>
        <text x="232" y="168" fontSize="16" textAnchor="middle" fill={C.ink} fontWeight="800">G</text>
        {/* scooter body */}
        <path d="M268 186 Q300 172 340 186 L380 190 L404 214 L286 214 L262 200 Z" fill="url(#sbody)" stroke={C.ink} strokeWidth="2"/>
        <path d="M286 214 H404" stroke={C.ink} strokeWidth="3"/>
        <path d="M382 188 L404 150 L416 152" stroke={C.silver} strokeWidth="6" fill="none" strokeLinecap="round"/>
        <path d="M268 188 L258 160" stroke={C.silver} strokeWidth="5" strokeLinecap="round"/>
        {/* rider */}
        <circle cx="330" cy="120" r="18" fill={C.ivory} stroke={C.ink} strokeWidth="2"/>
        <path d="M312 116 Q330 96 348 116" fill={C.graphite} stroke={C.ink} strokeWidth="2"/>
        <path d="M330 138 Q348 142 352 172 L312 178 Q308 152 330 138 Z" fill={C.gold} stroke={C.ink} strokeWidth="2"/>
        <path d="M350 150 L386 156" stroke={C.ivory} strokeWidth="7" strokeLinecap="round"/>
        <path d="M318 174 L292 196" stroke={C.graphite} strokeWidth="8" strokeLinecap="round"/>
        {/* wheels */}
        {[288, 396].map((x) => <g key={x}>
          <circle cx={x} cy="220" r="24" fill="#171A1F" stroke={C.silver} strokeWidth="3"/>
          <g className="anim-spin" style={{ transformOrigin: `${x}px 220px` }}>
            <path d={`M${x-16} 220 H${x+16} M${x} 204 V236`} stroke={C.goldLight} strokeWidth="3"/>
          </g>
          <circle cx={x} cy="220" r="5" fill={C.silver}/>
        </g>)}
      </g>
    </svg>
  );
}

function CarScene() {
  return (
    <svg viewBox="0 0 600 300" className="onboarding__art" role="img" aria-label="Animated dimensional car with a waving driver wearing sunglasses">
      <defs>
        <linearGradient id="carTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.warm}/><stop offset="1" stopColor="#9AA1AA"/></linearGradient>
        <linearGradient id="carSide" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={C.gold}/><stop offset="1" stopColor={C.goldDeep}/></linearGradient>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#3B4049"/><stop offset="1" stopColor="#171A1F"/></linearGradient>
      </defs>
      <path d="M0 258 H600" stroke="#2B2F36" strokeWidth="30"/>
      <path d="M0 258 H600" stroke={C.gold} strokeOpacity=".45" strokeWidth="3" className="anim-road"/>
      <g className="anim-bob" style={{ transformOrigin: '300px 190px' }}>
        {/* dimensional body */}
        <path d="M120 206 L164 152 L370 142 L462 196 L486 218 L120 218 Z" fill="url(#carTop)" stroke={C.ink} strokeWidth="2"/>
        <path d="M164 152 L370 142 L382 166 L176 178 Z" fill="url(#glass)" stroke={C.ink} strokeWidth="2"/>
        <path d="M120 206 L486 218 L486 240 L120 240 Z" fill="url(#carSide)" stroke={C.ink} strokeWidth="2"/>
        <path d="M120 206 L176 178 L382 166 L486 218" fill="none" stroke={C.ivory} strokeOpacity=".45" strokeWidth="2"/>
        <path d="M380 166 L462 196" stroke={C.ink} strokeOpacity=".4" strokeWidth="2"/>
        {/* headlight glow */}
        <circle cx="474" cy="220" r="9" fill={C.goldLight} className="anim-glow"/>
        {/* driver */}
        <circle cx="270" cy="130" r="20" fill={C.ivory} stroke={C.ink} strokeWidth="2"/>
        <path d="M250 126 H290 L288 134 H252 Z" fill={C.ink}/>
        <path d="M256 126 H270 M276 126 H290" stroke={C.silver} strokeWidth="2"/>
        <path d="M254 112 Q270 100 288 112" stroke={C.ink} strokeWidth="5" fill="none" strokeLinecap="round"/>
        <path d="M270 150 L270 176" stroke={C.graphite} strokeWidth="18" strokeLinecap="round"/>
        <g className="anim-wave" style={{ transformOrigin: '272px 158px' }}>
          <path d="M272 158 L302 138" stroke={C.ivory} strokeWidth="9" strokeLinecap="round"/>
          <circle cx="306" cy="134" r="8" fill={C.ivory} stroke={C.ink} strokeWidth="2"/>
        </g>
        {[175, 425].map((x) => <g key={x}>
          <circle cx={x} cy="240" r="27" fill="#171A1F" stroke={C.silver} strokeWidth="3"/>
          <g className="anim-spin" style={{ transformOrigin: `${x}px 240px` }}>
            <path d={`M${x-18} 240 H${x+18} M${x} 222 V258`} stroke={C.goldLight} strokeWidth="3"/>
          </g>
          <circle cx={x} cy="240" r="6" fill={C.silver}/>
        </g>)}
      </g>
    </svg>
  );
}

function HotelScene() {
  return (
    <svg viewBox="0 0 600 300" className="onboarding__art" role="img" aria-label="Animated traveller with a trolley suitcase outside a hotel">
      <defs>
        <linearGradient id="hotelFront" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3B4049"/><stop offset="1" stopColor="#171A1F"/></linearGradient>
        <linearGradient id="hotelSide" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor={C.goldDeep}/><stop offset="1" stopColor="#4A463C"/></linearGradient>
      </defs>
      <path d="M0 262 H600" stroke="#2B2F36" strokeWidth="26"/>
      <g className="anim-float" style={{ transformOrigin: '360px 150px' }}>
        <path d="M180 92 L390 72 L430 92 L430 262 L180 262 Z" fill="url(#hotelFront)" stroke={C.ink} strokeWidth="2"/>
        <path d="M390 72 L448 100 L448 262 L430 262 L430 92 Z" fill="url(#hotelSide)" stroke={C.ink} strokeWidth="2"/>
        <path d="M180 92 L390 72 L448 100 L238 122 Z" fill={C.gold} opacity=".55" stroke={C.ink} strokeWidth="2"/>
        {[0,1,2].map((r) => [0,1,2,3].map((c) => (
          <rect key={`${r}-${c}`} x={202 + c * 48} y={128 + r * 42} width="28" height="26" rx="2" fill={(r + c) % 3 === 0 ? C.goldLight : '#2A2E35'} stroke={C.ink} strokeWidth="1.5" className={(r + c) % 3 === 0 ? 'anim-glow' : ''}/>
        )))}
        <path d="M278 204 H326 V262 H278 Z" fill={C.gold} opacity=".85" stroke={C.ink} strokeWidth="2"/>
        <circle cx="318" cy="234" r="2.5" fill={C.ink}/>
        <path d="M236 122 L236 88 H360 L360 108" fill="none" stroke={C.goldLight} strokeWidth="3" opacity=".8"/>
      </g>
      {/* traveller */}
      <g className="anim-bob" style={{ transformOrigin: '110px 200px' }}>
        <circle cx="108" cy="160" r="17" fill={C.ivory} stroke={C.ink} strokeWidth="2"/>
        <path d="M92 154 Q108 138 124 154" fill={C.graphite}/>
        <path d="M108 177 V222 M108 186 L88 204 M108 186 L128 202 M108 222 L94 258 M108 222 L124 258" stroke={C.warm} strokeWidth="9" strokeLinecap="round" fill="none"/>
        <path d="M128 202 L146 218" stroke={C.warm} strokeWidth="7" strokeLinecap="round"/>
        {/* trolley suitcase */}
        <rect x="140" y="214" width="48" height="44" rx="5" fill={C.gold} stroke={C.ink} strokeWidth="2"/>
        <path d="M150 210 V196 H178 V210" fill="none" stroke={C.silver} strokeWidth="3"/>
        <path d="M164 214 V258" stroke={C.ink} strokeOpacity=".35" strokeWidth="2"/>
        <circle cx="148" cy="262" r="4" fill={C.silver}/><circle cx="180" cy="262" r="4" fill={C.silver}/>
      </g>
      <path d="M0 268 H600" stroke={C.gold} strokeOpacity=".35" strokeWidth="2" strokeDasharray="8 12" className="anim-road"/>
    </svg>
  );
}

const SLIDES = [
  { key: 'intro', title: 'GOWAYY', body: 'One account. One connected journey.', art: <IntroScene />, sceneLabel: 'Introduction' },
  { key: 'food', title: 'Food & Groceries', body: 'Order what you need.', art: <ScooterScene />, sceneLabel: 'Food and groceries' },
  { key: 'cab', title: 'Book Cabs', body: 'Choose your next destination.', art: <CarScene />, sceneLabel: 'Cab booking' },
  { key: 'stay', title: 'Book Your Stay', body: 'Find a place to stay.', art: <HotelScene />, sceneLabel: 'Hotel and stay' },
];

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const slide = SLIDES[index] ?? SLIDES[0];
  const next = () => { if (index < SLIDES.length - 1) setIndex(index + 1); else onFinish(); };
  const prev = () => setIndex(Math.max(0, index - 1));
  return (
    <div className="onboarding" onPointerDown={(e) => { startX.current = e.clientX; }} onPointerUp={(e) => {
      if (startX.current === null) return;
      const dx = e.clientX - startX.current;
      if (dx < -60) next(); else if (dx > 60) prev();
      startX.current = null;
    }}>
      <div className="onboarding__top">
        <div className="row"><GSymbol size={30} /><span className="eyebrow" style={{ color: 'var(--gw-text-muted)' }}>{slide.sceneLabel}</span></div>
        <button className="btn btn--ghost btn--sm" onClick={onFinish}>Skip</button>
      </div>
      <div className="onboarding__stage">
        <div className="onboarding__slide" key={slide.key}>
          {slide.art}
          <h1>{slide.title}</h1>
          <p>{slide.body}</p>
        </div>
      </div>
      <div className="onboarding__bottom">
        <button className="btn btn--secondary" onClick={prev} disabled={index === 0} aria-label="Previous"><ChevronLeft size={18} /> Prev</button>
        <div className="onboarding__dots" role="tablist" aria-label="Onboarding pages">
          {SLIDES.map((s, i) => <span key={s.key} className={i === index ? 'on' : ''} role="tab" aria-selected={i === index} aria-label={`Page ${i + 1}`} />)}
        </div>
        <button className="btn btn--primary" onClick={next}>{index === SLIDES.length - 1 ? 'Get started' : 'Next'} <ChevronRight size={18} /></button>
      </div>
    </div>
  );
}
