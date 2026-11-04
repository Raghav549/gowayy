import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MapPin, ArrowUpRight, Info } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import type { Destination } from '@gowayy/types';
import { client } from '../lib/client';
import { useJourney } from '../store/useJourney';
import { ImageFrame, SectionHead, Spinner } from '../components/ui';
import type { RecommendationGroups } from '@gowayy/api-client';

export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
}

export function DestinationCard({ destination, onSelect }: { destination: Destination; onSelect?: () => void }) {
  const image = destination.images[0];
  return (
    <Link to={`/destinations/${destination.slug}`} className="card card--pad0 card--hover" onClick={onSelect} style={{ display: 'block' }}>
      {image && <ImageFrame asset={image} variant="16-9" />}
      <div style={{ padding: '14px 16px 16px' }}>
        <div className="between"><strong>{destination.name}</strong>{destination.hiddenGem && <span className="badge badge--accent">Hidden gem</span>}</div>
        <div className="small muted" style={{ marginTop: 4 }}>
          {destination.elevationVerified && destination.elevationM ? `${destination.elevationM} m · ` : ''}{destination.bestSeason ?? 'Year round'}
        </div>
        <div className="row tiny muted" style={{ marginTop: 10 }}><MapPin size={12} /> {destination.coordinateAccuracy === 'approximate' ? 'Approximate coordinates' : 'Published coordinates'}</div>
      </div>
    </Link>
  );
}

export function DemoListingBadge() {
  return <span className="badge" title="Seeded sample inventory for development, not a live partner offer">Demo listing</span>;
}

export function DataNotice() {
  return (
    <div className="notice" style={{ marginTop: 28 }}>
      <Info size={14} /> <strong>Data status.</strong> Destination geography comes from published references and is flagged where approximate.
      Partner listings, menus, inventory, fares and timetables are <strong>seeded development data</strong> — they are not live offers, and no ratings or availability are invented.
      Place photographs are only shown where the subject and licence were verified; see <Link className="link" to="/credits">image credits</Link>.
    </div>
  );
}

export function DestinationSelect({ value, onChange, label = 'Destination' }: { value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <label className="field" style={{ marginBottom: 0 }}>
      <span className="label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Select a destination</option>
        {catalogue.destinations.map((d) => <option key={d.id} value={d.id}>{d.name}{d.hiddenGem ? ' (hidden gem)' : ''}</option>)}
      </select>
    </label>
  );
}

export function PlaceSelect({ value, onChange, label = 'Pickup' }: { value: string; onChange: (id: string) => void; label?: string }) {
  return (
    <label className="field" style={{ marginBottom: 0 }}>
      <span className="label">{label}</span>
      <select className="select" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Choose a place</option>
        {catalogue.places.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
    </label>
  );
}

const GROUP_META: Array<[keyof RecommendationGroups, string]> = [
  ['properties', 'Stays'], ['restaurants', 'Restaurants'], ['attractions', 'Attractions'],
  ['packages', 'Sightseeing packages'], ['experiences', 'Local experiences'], ['groceries', 'Grocery delivery coverage'], ['taxiRoutes', 'Taxi options'],
];

/** Connected recommendations driven by the server's destination-aware catalogue. */
export function ConnectedRecommendations({ destinationId, title = 'Complete your journey' }: { destinationId: string | null; title?: string }) {
  const q = useQuery({ queryKey: ['recommendations', destinationId], queryFn: () => client.recommendations(destinationId ?? ''), enabled: Boolean(destinationId) });
  const journey = useJourney((s) => s.journey);
  if (!destinationId) return null;
  const destination = catalogue.destinations.find((d) => d.id === destinationId);
  if (q.isLoading) return <Spinner label="Finding connected services…" />;
  const groups = q.data;
  if (!groups) return null;
  const withJourney = (href: string) => `${href}${href.includes('?') ? '&' : '?'}journey=${journey?.id ?? ''}`;
  return (
    <section className="section">
      <SectionHead eyebrow="Connected journey engine" title={title} subtitle={`Services linked to ${destination?.name ?? 'your destination'}. Journey context is preserved when you open any of them.`} />
      <div className="grid-3">
        {GROUP_META.map(([key, label]) => {
          const items = groups[key] ?? [];
          return (
            <div className="card" key={key}>
              <div className="between"><h3 style={{ fontSize: 16 }}>{label}</h3><span className="badge">{items.length}</span></div>
              {items.length === 0 ? <p className="small muted" style={{ marginTop: 10 }}>No seeded records for this destination.</p> : (
                <div className="list" style={{ marginTop: 12 }}>
                  {items.slice(0, 3).map((item) => (
                    <Link key={item.id} to={withJourney(item.href)} className="list-row">
                      <span className="list-row__body"><span className="list-row__title">{item.title}</span><span className="list-row__sub">{item.available ? 'Seeded availability' : 'Currently unavailable'}</span></span>
                      <ArrowUpRight size={15} />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function JourneyQuickStart({ onSet }: { onSet?: (id: string) => void }) {
  const patch = useJourney((s) => s.patch);
  const [busy, setBusy] = useState(false);
  const setDestination = async (id: string) => {
    setBusy(true);
    try { await patch({ destinationId: id, dropoff: catalogue.places.find((p) => p.id === `plc_${catalogue.destinations.find((d) => d.id === id)?.slug}`)?.id ?? null }); }
    finally { setBusy(false); onSet?.(id); }
  };
  return (
    <div className="row row--wrap" style={{ gap: 8 }}>
      {catalogue.destinations.filter((d) => !d.hiddenGem).slice(0, 6).map((d) => (
        <button key={d.id} className="chip" disabled={busy} onClick={() => void setDestination(d.id)}>{d.name}</button>
      ))}
    </div>
  );
}
