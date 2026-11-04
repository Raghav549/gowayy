import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { MapPin, ArrowUpRight, Info } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import type { Destination } from '@gowayy/types';
import { client } from '../lib/client';
import { useJourney } from '../store/useJourney';
import { ImageFrame, SectionHead, Spinner } from '../components/ui';
import type { RecommendationGroups } from '@gowayy/api-client';
import { SearchSelect } from '../components/SearchSelect';

export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: () => client.catalog(), staleTime: 5 * 60_000 });
}

/** Catalogue destinations merged with admin-managed database records. */
export function useDestinations(): Destination[] {
  const remote = useQuery({
    queryKey: ['destinations'],
    queryFn: async () => (await client.destinations?.())?.items as Array<Record<string, any>> | undefined,
    staleTime: 60_000,
  });
  return useMemo(() => {
    const records = (remote.data ?? []).filter((d) => d.active !== false);
    const merged = catalogue.destinations.map((base) => {
      const rec = records.find((d) => d.slug === base.slug || d.id === base.id);
      if (!rec) return base;
      const images = (rec.images ?? []).slice().sort((a: any, b: any) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)) || Number(a.order ?? 0) - Number(b.order ?? 0)).filter((i: { status?: string }) => i.status !== 'unavailable').map((i: { path?: string; thumbPath?: string; alt?: string; credit?: string; sourceUrl?: string }) => ({
        status: 'verified', assetPath: String(i.path ?? '').replace(/^\//, ''), thumbPath: String(i.thumbPath ?? i.path ?? '').replace(/^\//, ''),
        alt: i.alt ?? base.name, credit: i.credit, sourceUrl: i.sourceUrl,
      }));
      return {
        ...base,
        name: rec.name ?? base.name,
        region: rec.region ?? base.region,
        description: rec.description || base.description,
        coords: rec.coords ?? base.coords,
        images: images.length ? images : base.images,
      } as Destination;
    });
    const additions = records.filter((r) => !catalogue.destinations.some((b) => b.slug === r.slug)).map((r) => ({
      ...r, id: r.id, slug: r.slug, name: r.name, region: r.region ?? 'Darjeeling Himalaya',
      description: r.description ?? r.summary ?? '', activities: [], coords: r.coords ?? { lat: 27.036, lng: 88.2627 },
      images: (r.images ?? []).map((i: { path?: string; thumbPath?: string; alt?: string; credit?: string; sourceUrl?: string }) => ({ status: 'verified', assetPath: String(i.path ?? '').replace(/^\//, ''), thumbPath: String(i.thumbPath ?? i.path ?? '').replace(/^\//, ''), alt: i.alt ?? r.name, credit: i.credit, sourceUrl: i.sourceUrl })),
    })) as unknown as Destination[];
    return [...merged, ...additions];
  }, [remote.data]);
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



export function DestinationSelect({ value, onChange, label = 'Destination' }: { value: string; onChange: (id: string) => void; label?: string }) {
  const remote = useQuery({
    queryKey: ['destinations'],
    queryFn: async () => (await client.destinations?.())?.items as Array<{ id: string; slug: string; name: string; region?: string; hiddenGem?: boolean; active?: boolean }> | undefined,
    staleTime: 60_000,
  });
  const source = (remote.data?.length ? remote.data : catalogue.destinations.map((d) => ({ id: d.id, slug: d.slug, name: d.name, region: d.region, hiddenGem: d.hiddenGem }))) as Array<{ id: string; slug: string; name: string; region?: string; hiddenGem?: boolean; active?: boolean }>;
  const options = source
    .filter((d) => d.active !== false)
    .map((d) => ({ id: d.id, label: d.name, sub: d.region ?? 'Darjeeling Himalaya', keywords: d.slug }));
  return <SearchSelect label={label} value={value} onChange={onChange} options={options} placeholder="Search destinations…" emptyText="No destination matches that search" />;
}

export function PlaceSelect({ value, onChange, label = 'Pickup' }: { value: string; onChange: (id: string) => void; label?: string }) {
  const options = catalogue.places.map((p) => ({ id: p.id, label: p.name, sub: p.address ?? p.locality ?? '', keywords: p.kind ?? '' }));
  return <SearchSelect label={label} value={value} onChange={onChange} options={options} placeholder={label === 'Pickup' ? 'Search pickup points…' : 'Search destinations…'} emptyText="No place matches that search" />;
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
              {items.length === 0 ? <p className="small muted" style={{ marginTop: 10 }}>No listings for this destination yet.</p> : (
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
