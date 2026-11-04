import { useMemo } from 'react';
import type { Coordinates } from '@gowayy/types';
import { projectPoints } from '@gowayy/location-engine';

export interface MapPin extends Coordinates { id: string; label: string; kind?: string }

const COLOURS: Record<string, string> = {
  airport: '#E8A23A', stand: '#C9BBA3', destination: '#1E6B4F', landmark: '#8A7460',
  business: '#9AA1AA', address: '#F3EAD9', hotel: '#F2C063', restaurant: '#C08A4A', attraction: '#6F8F6B',
};

/** Dependency-free interactive schematic map. Real coordinates, offline fallback provider. */
export function MapView({ pins, route, onSelect, height = 320, showLabels = true }: {
  pins: MapPin[]; route?: Coordinates[]; onSelect?: (pin: MapPin) => void; height?: number; showLabels?: boolean;
}) {
  const width = 800;
  const coords = useMemo(() => {
    const all: Coordinates[] = [...pins.map((p) => ({ lat: p.lat, lng: p.lng })), ...(route ?? [])];
    return all.length >= 2 ? all : [...all, { lat: all[0]?.lat ?? 27.0 + 0.01, lng: all[0]?.lng ?? 88.2 + 0.01 }];
  }, [pins, route]);
  const pinPoints = useMemo(() => projectPoints(pins.map((p) => ({ lat: p.lat, lng: p.lng })), width, height, 70), [pins, width, height]);
  const routePoints = useMemo(() => (route && route.length > 1 ? projectPoints(route, width, height, 70) : []), [route, width, height]);
  const path = routePoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
  return (
    <div className="map">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Schematic map of destinations and route">
        <defs>
          <linearGradient id="routeGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F2C063"/><stop offset="1" stopColor="#B97A1F"/></linearGradient>
        </defs>
        {Array.from({ length: 9 }, (_, i) => <line key={`h${i}`} x1="0" x2={width} y1={i * height / 8} y2={i * height / 8} stroke="rgba(255,255,255,.035)" />)}
        {Array.from({ length: 13 }, (_, i) => <line key={`v${i}`} y1="0" y2={height} x1={i * width / 12} x2={i * width / 12} stroke="rgba(255,255,255,.035)" />)}
        {path && <path d={path} fill="none" stroke="url(#routeGrad)" strokeWidth="4" strokeLinecap="round" strokeDasharray="10 7" opacity=".9" />}
        {pinPoints.map((pt, i) => {
          const pin = pins[i];
          if (!pin) return null;
          const colour = COLOURS[pin.kind ?? ''] ?? '#1E6B4F';
          return (
            <g key={pin.id} className="map__pin" onClick={() => onSelect?.(pin)} role={onSelect ? 'button' : undefined}>
              <circle cx={pt.x} cy={pt.y} r="13" fill={colour} opacity=".14" />
              <circle cx={pt.x} cy={pt.y} r="6" fill={colour} stroke="#33261B" strokeWidth="2" />
              {showLabels && <text x={pt.x + 11} y={pt.y + 4} fill="var(--gw-text)" fontSize="13" fontFamily="system-ui" style={{ paintOrder: 'stroke', stroke: 'rgba(13,15,18,.85)', strokeWidth: 3 }}>{pin.label}</text>}
            </g>
          );
        })}
      </svg>
      <div className="map__legend">
        <span>Offline schematic provider — positions use published coordinates</span>
        {route && <span>Dashed line: estimated route (not turn-by-turn)</span>}
      </div>
    </div>
  );
}
