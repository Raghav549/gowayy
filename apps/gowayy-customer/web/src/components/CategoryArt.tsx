/**
 * GOWAYY category artwork — lightweight 2.5D illustrated tiles.
 *
 * Hand-built SVG (no external sprites, no heavy 3D runtime) with restrained
 * CSS motion, static fallback and prefers-reduced-motion support.
 */
export type CategoryArtKey =
  | 'cabs' | 'shared' | 'hotels' | 'food' | 'groceries' | 'tourism'
  | 'experiences' | 'packages' | 'shopping' | 'parcels';

const common = {
  role: 'img' as const,
  viewBox: '0 0 64 64',
  'aria-hidden': true as const,
  focusable: 'false' as const,
};

function Cab({ shared = false }: { shared?: boolean }) {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="cabBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F2DFB8" /><stop offset=".55" stopColor="#F0A93B" /><stop offset="1" stopColor="#B96C22" />
        </linearGradient>
        <linearGradient id="cabGlass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3B2C46" /><stop offset="1" stopColor="#17131B" />
        </linearGradient>
      </defs>
      <ellipse cx="32" cy="50" rx="22" ry="5" fill="#1C1B19" opacity=".16" />
      <path d="M9 40h46l-3-10a9 9 0 0 0-8.6-6.4H24.2A9 9 0 0 0 15.6 29L12 40Z" fill="url(#cabBody)" />
      <path d="M22 27h19l4.6 8H18.4L22 27Z" fill="url(#cabGlass)" opacity=".92" />
      <path d="M13 40h38v6a3 3 0 0 1-3 3H16a3 3 0 0 1-3-3v-6Z" fill="#8A4B18" opacity=".55" />
      <circle cx="20" cy="48" r="6" fill="#241C2B" /><circle cx="20" cy="48" r="2.4" fill="#E7DDCE" />
      <circle cx="45" cy="48" r="6" fill="#241C2B" /><circle cx="45" cy="48" r="2.4" fill="#E7DDCE" />
      <rect x="12" y="34" width="5" height="3.2" rx="1.4" fill="#FFF3D2" />
      <rect x="47" y="34" width="5" height="3.2" rx="1.4" fill="#FFD08A" />
      {shared ? (
        <g className="cat-art__extra">
          <circle cx="27" cy="20" r="4.4" fill="#6D3B5E" />
          <circle cx="36" cy="18" r="4.4" fill="#C2502A" />
          <path d="M19 24c3-3 12-3 15 0" stroke="#241C2B" strokeWidth="2" strokeLinecap="round" fill="none" opacity=".55" />
        </g>
      ) : null}
    </svg>
  );
}

function Hotel() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="hotelF" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFF7EC" /><stop offset="1" stopColor="#E6D6C8" /></linearGradient>
        <linearGradient id="hotelS" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#C9AE93" /><stop offset="1" stopColor="#97785C" /></linearGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="22" ry="4" fill="#3B2C46" opacity=".15" />
      <path d="M19 16h20v34H19z" fill="url(#hotelF)" />
      <path d="M39 22l7 4v24h-7z" fill="url(#hotelS)" />
      <path d="M14 50h36v4H14z" fill="#6D3B5E" opacity=".8" />
      <path d="M17 12h24l3 5H14z" fill="#C2502A" />
      <g fill="#E2C892">
        <rect x="23" y="22" width="5" height="5" rx="1" /><rect x="31" y="22" width="5" height="5" rx="1" />
        <rect x="23" y="31" width="5" height="5" rx="1" /><rect x="31" y="31" width="5" height="5" rx="1" />
        <rect x="23" y="40" width="5" height="5" rx="1" /><rect x="31" y="40" width="5" height="5" rx="1" />
      </g>
      <rect x="27" y="43" width="6" height="7" rx="1" fill="#5A4030" />
      <circle cx="18" cy="48" r="4" fill="#2F7A5C" opacity=".85" />
      <circle cx="46" cy="48" r="3.4" fill="#2F7A5C" opacity=".7" />
    </svg>
  );
}

function Food() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="burgerBun" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F5C879" /><stop offset="1" stopColor="#C97B33" /></linearGradient>
        <linearGradient id="pizzaC" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFDC8C" /><stop offset="1" stopColor="#E8A03A" /></linearGradient>
      </defs>
      <ellipse cx="32" cy="53" rx="23" ry="4" fill="#3B2C46" opacity=".14" />
      <g className="cat-art__in cat-art__in--left">
        <path d="M13 40c0-8 6-14 13-14s13 6 13 14H13Z" fill="url(#burgerBun)" />
        <rect x="13" y="40" width="26" height="4" rx="2" fill="#4B7F3A" />
        <rect x="14" y="44" width="24" height="5" rx="2" fill="#8C4B2B" />
        <rect x="13" y="49" width="26" height="4" rx="2" fill="#E0A95A" />
      </g>
      <g className="cat-art__in cat-art__in--right">
        <path d="M37 20l15 6-11 22-14-6z" fill="url(#pizzaC)" />
        <path d="M40 24l9 3.6-7 15-9-3.6z" fill="#F2B84B" opacity=".7" />
        <circle cx="41" cy="31" r="2.1" fill="#C2502A" /><circle cx="45" cy="37" r="1.8" fill="#C2502A" />
        <circle cx="38" cy="38" r="1.6" fill="#4B7F3A" />
      </g>
      <g className="cat-art__steam" stroke="#BDB5C5" strokeWidth="1.6" strokeLinecap="round" fill="none" opacity=".8">
        <path d="M26 18c2-3-2-4 0-7" /><path d="M32 16c2-3-2-4 0-7" />
      </g>
    </svg>
  );
}

function Groceries() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="bagG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F7E6C4" /><stop offset="1" stopColor="#D7B98A" /></linearGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="22" ry="4" fill="#3B2C46" opacity=".15" />
      <path d="M18 26h28l-4 26H22z" fill="url(#bagG)" />
      <path d="M18 26h28l-1.4 8H19.4z" fill="#C29A66" opacity=".65" />
      <path d="M25 26c0-6 14-6 14 0" stroke="#8A6A44" strokeWidth="2" fill="none" strokeLinecap="round" />
      <g className="cat-art__in">
        <circle cx="26" cy="21" r="5.2" fill="#E05A3D" /><path d="M26 15c1.6-2.6 4-2.6 4.8-1" stroke="#3F7B39" strokeWidth="2" fill="none" strokeLinecap="round" />
        <circle cx="36" cy="19" r="4.6" fill="#5E9A4A" /><path d="M36 14.6c.8-2.4 2.6-2.8 3.6-2" stroke="#2F6A34" strokeWidth="1.8" fill="none" strokeLinecap="round" />
        <ellipse cx="44" cy="23" rx="4" ry="5.6" fill="#F2A33C" />
      </g>
      <rect x="27" y="38" width="11" height="4" rx="2" fill="#C2502A" opacity=".65" />
    </svg>
  );
}

function Tourism() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="mtnA" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#6D3B5E" /><stop offset="1" stopColor="#3F2440" /></linearGradient>
        <linearGradient id="mtnB" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#A3788F" /><stop offset="1" stopColor="#6D3B5E" /></linearGradient>
        <linearGradient id="sunG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#FFD87A" /><stop offset="1" stopColor="#F0A93B" /></linearGradient>
      </defs>
      <circle cx="45" cy="18" r="8" fill="url(#sunG)" />
      <path d="M2 52l19-28 14 20 8-10 19 18H2Z" fill="url(#mtnA)" />
      <path d="M20 26l7 9-7 3-6-4z" fill="#FFFCF6" opacity=".9" />
      <path d="M34 52l13-18 15 18H34Z" fill="url(#mtnB)" />
      <path d="M26 52c0-7 4-12 8-12s8 5 8 12" fill="#F6E7D2" opacity=".2" />
      <path d="M30 40v-10" stroke="#F6E7D2" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M30 30l7 3-7 3z" fill="#C2502A" />
      <ellipse cx="32" cy="55" rx="28" ry="3" fill="#3B2C46" opacity=".12" />
    </svg>
  );
}

function Experiences() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="camBody" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#40303F" /><stop offset="1" stopColor="#17131B" /></linearGradient>
        <linearGradient id="lensG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E2C892" /><stop offset="1" stopColor="#C2502A" /></linearGradient>
      </defs>
      <ellipse cx="32" cy="52" rx="21" ry="4" fill="#1C1B19" opacity=".16" />
      <rect x="10" y="20" width="44" height="28" rx="7" fill="url(#camBody)" />
      <rect x="22" y="15" width="13" height="7" rx="2.6" fill="#40303F" />
      <rect x="42" y="15" width="7" height="5" rx="1.6" fill="#E2C892" />
      <circle cx="32" cy="34" r="11" fill="#0F0C12" /><circle cx="32" cy="34" r="8" fill="url(#lensG)" />
      <circle cx="32" cy="34" r="4" fill="#241C2B" /><circle cx="29" cy="31" r="2" fill="#FFF7E4" opacity=".85" />
      <rect x="13" y="24" width="6" height="3" rx="1.5" fill="#E2C892" />
      <path className="cat-art__spark" d="M50 13l1.6 3.4 3.4 1.6-3.4 1.6L50 23l-1.6-3.4L45 18l3.4-1.6z" fill="#F2DFB8" />
    </svg>
  );
}

function Packages() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="caseG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C2502A" /><stop offset="1" stopColor="#7C2C1A" /></linearGradient>
        <linearGradient id="caseF" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E17A4B" /><stop offset="1" stopColor="#A63F22" /></linearGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="21" ry="4" fill="#1C1B19" opacity=".16" />
      <path d="M24 18h16a4 4 0 0 1 4 4v4h-4v-4a1 1 0 0 0-1-1H25a1 1 0 0 0-1 1v4h-4v-4a4 4 0 0 1 4-4Z" fill="#40303F" />
      <rect x="10" y="25" width="44" height="26" rx="6" fill="url(#caseG)" />
      <rect x="10" y="25" width="44" height="8" rx="4" fill="url(#caseF)" />
      <rect x="28" y="33" width="8" height="10" rx="2" fill="#F2DFB8" />
      <rect x="14" y="33" width="4" height="18" rx="2" fill="#F6E7D2" opacity=".35" />
      <rect x="46" y="33" width="4" height="18" rx="2" fill="#F6E7D2" opacity=".2" />
      <circle cx="17" cy="51" r="2.6" fill="#241C2B" /><circle cx="47" cy="51" r="2.6" fill="#241C2B" />
      <path d="M49 15l1.4 3 3 1.4-3 1.4L49 24l-1.4-3.2L44.6 19l3-1.4z" fill="#F2DFB8" />
    </svg>
  );
}

function Shopping() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="shopG" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C6A15B" /><stop offset="1" stopColor="#8B6830" /></linearGradient>
      </defs>
      <ellipse cx="32" cy="54" rx="20" ry="4" fill="#1C1B19" opacity=".16" />
      <path d="M19 24h26l3 26a3 3 0 0 1-3 3H19a3 3 0 0 1-3-3z" fill="url(#shopG)" />
      <path d="M22 24h20l2 22H20z" fill="#8B6830" opacity=".5" />
      <path d="M25 24c0-7 14-7 14 0" stroke="#F2DFB8" strokeWidth="2.4" fill="none" strokeLinecap="round" />
      <path d="M32 32v12M26 38h12" stroke="#F7EBD3" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="15" cy="18" r="2" fill="#E2C892" /><circle cx="50" cy="22" r="1.6" fill="#E2C892" />
      <path d="M49 12l1 2.2 2.2 1-2.2 1-1 2.2-1-2.2-2.2-1 2.2-1z" fill="#FAF3E4" />
    </svg>
  );
}

function Parcels() {
  return (
    <svg {...common} className="cat-art">
      <defs>
        <linearGradient id="boxTop" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#E8C79A" /><stop offset="1" stopColor="#C49A67" /></linearGradient>
        <linearGradient id="boxFront" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#C9A271" /><stop offset="1" stopColor="#9C7443" /></linearGradient>
      </defs>
      <ellipse cx="35" cy="55" rx="19" ry="3.6" fill="#3B2C46" opacity=".15" />
      <g className="cat-art__in">
        <path d="M20 26l14-6 14 6v6L34 38l-14-6z" fill="url(#boxTop)" />
        <path d="M20 32l14 6v16l-14-6z" fill="url(#boxFront)" />
        <path d="M48 32l-14 6v16l14-6z" fill="#855F35" />
        <path d="M34 20v12M34 38v16" stroke="#F6E7D2" strokeWidth="2.2" opacity=".75" />
        <path d="M27 23.5l14 6" stroke="#F6E7D2" strokeWidth="1.4" opacity=".4" />
      </g>
      <g className="cat-art__motion" stroke="#C2502A" strokeWidth="2" strokeLinecap="round" opacity=".75">
        <path d="M8 38h6" /><path d="M6 45h8" /><path d="M10 52h5" />
      </g>
    </svg>
  );
}

const MAP: Record<CategoryArtKey, () => JSX.Element> = {
  cabs: () => <Cab />,
  shared: () => <Cab shared />,
  hotels: Hotel,
  food: Food,
  groceries: Groceries,
  tourism: Tourism,
  experiences: Experiences,
  packages: Packages,
  shopping: Shopping,
  parcels: Parcels,
};

export function CategoryArt({ kind }: { kind: CategoryArtKey }) {
  const Art = MAP[kind] ?? Shopping;
  return <span className={`cat-art-wrap cat-art-wrap--${kind}`}><Art /></span>;
}

export const CATEGORY_ART: Array<{ key: CategoryArtKey; label: string; to: string }> = [
  { key: 'cabs', label: 'Cabs', to: '/cabs' },
  { key: 'shared', label: 'Shared taxis', to: '/cabs?tab=shared' },
  { key: 'hotels', label: 'Hotels', to: '/hotels' },
  { key: 'food', label: 'Food', to: '/food' },
  { key: 'groceries', label: 'Groceries', to: '/groceries' },
  { key: 'tourism', label: 'Tourism', to: '/explore' },
  { key: 'experiences', label: 'Experiences', to: '/experiences' },
  { key: 'packages', label: 'Packages', to: '/packages' },
  { key: 'shopping', label: 'Shop', to: '/categories' },
  { key: 'parcels', label: 'Parcels', to: '/parcels' },
];
