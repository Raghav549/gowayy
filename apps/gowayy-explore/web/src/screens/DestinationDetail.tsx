import { useMemo } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, Bookmark, Gem, MapPin, Mountain, UtensilsCrossed, BedDouble, Ticket, Sparkles, CarFront } from 'lucide-react';
import { catalogue, getDestination } from '@gowayy/catalog';
import { client, handoff } from '../lib/client';
import { useUI } from '../store';
import { SectionHead, Skeleton, Badge } from '@gowayy/ui';
import { MascotEmpty } from '@gowayy/ui';

/** Destination page with booking handoffs into the GOWAYY customer app. */
export function DestinationDetail() {
  const { slug = '' } = useParams();
  const showToast = useUI((s) => s.showToast);
  const qc = useQueryClient();
  const d = useMemo(() => getDestination(slug) ?? catalogue.destinations.find((x) => x.slug === slug), [slug]);
  const recs = useQuery({ queryKey: ['recs', d?.id], queryFn: () => client.recommendations(d?.id ?? ''), enabled: Boolean(d) });
  const save = useMutation({
    mutationFn: () => client.savePlace({ placeId: catalogue.places.find((p) => p.name === d?.name)?.id ?? '', label: d?.name ?? '' }),
    onSuccess: () => { showToast('Saved to your places', 'success'); void qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (!d) return <MascotEmpty pose="curious" title="Destination not found" body="This place is not in the verified catalogue." action={<Link className="btn btn--primary" to="/">Back to Explore</Link>} />;
  const attractions = catalogue.attractions.filter((a) => a.destinationId === d.id);
  const gems = catalogue.hiddenGems.filter((g) => g.destinationId === d.id);
  const groups = recs.data as Record<string, Array<{ id: string; title: string; service: string; available: boolean; href: string }>> | undefined;

  const handoffCard = (icon: React.ReactNode, label: string, items: Array<{ id: string; title: string; available: boolean; href: string }> | undefined, fallbackHref: string) => (
    <div className="card">
      <div className="between"><h3 style={{ fontSize: 15, display: 'flex', gap: 8, alignItems: 'center' }}>{icon}{label}</h3><span className="badge">{items?.length ?? 0}</span></div>
      <div className="list" style={{ marginTop: 8 }}>
        {(items ?? []).slice(0, 4).map((it) => (
          <a key={it.id} className="list-row" href={handoff(it.href)} target="_blank" rel="noreferrer">
            <span className="list-row__body"><span className="list-row__title small">{it.title}</span><span className="list-row__sub">{it.available ? 'Seeded availability' : 'Unavailable'} · opens in GOWAYY</span></span>
            <ArrowUpRight size={15} />
          </a>
        ))}
        {!(items ?? []).length && <p className="small muted">Nothing seeded here yet.</p>}
        <a className="list-row" href={handoff(fallbackHref)}><span className="list-row__body"><span className="list-row__title small">Browse all {label.toLowerCase()}</span><span className="list-row__sub">opens in GOWAYY</span></span><ArrowUpRight size={15} /></a>
      </div>
    </div>
  );

  return (
    <div className="stack">
      <div className="card card--pad0" style={{ overflow: 'hidden' }}>
        {d.images[0]?.status === 'verified' && d.images[0].assetPath ? (
          <div className="image-frame image-frame--hero"><img src={`/${d.images[0].assetPath.replace(/^\//, '')}`} alt={d.images[0].alt} /></div>
        ) : (
          <div className="image-frame image-frame--hero"><div className="image-placeholder"><img className="image-placeholder__mark" src="/brand/g-mono-inverse.svg" alt="" /><div className="image-placeholder__text">Photograph unavailable</div><div className="tiny" style={{ maxWidth: 320 }}>{d.images[0]?.verificationNote}</div></div></div>
        )}
        <div style={{ padding: 18 }}>
          <div className="between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <h1 style={{ fontSize: 26 }}>{d.name}</h1>
            <button className="btn btn--secondary btn--sm" onClick={() => save.mutate()}><Bookmark size={14} /> Save place</button>
          </div>
          <p className="small muted" style={{ marginTop: 4 }}>{d.region} · {d.bestSeason} · {d.coordinateAccuracy === 'approximate' ? 'Approximate published coordinates' : 'Published coordinates'}{d.elevationVerified && d.elevationM ? ` · ${d.elevationM} m` : ''}</p>
          <p className="small" style={{ marginTop: 10 }}>{d.description}</p>
          {d.weatherNote && <div className="notice" style={{ marginTop: 10 }}><strong>Weather:</strong> {d.weatherNote}</div>}
        </div>
      </div>

      {attractions.length > 0 && (
        <section>
          <SectionHead eyebrow="See & do" title="Attractions" />
          <div className="grid-3">
            {attractions.map((a: (typeof catalogue.attractions)[number]) => (
              <div className="card" key={a.id}>
                <strong className="small" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Mountain size={14} style={{ color: 'var(--gw-champagne)' }} />{a.name}</strong>
                <p className="tiny muted" style={{ marginTop: 6 }}>{a.category}</p>
                <p className="small" style={{ marginTop: 6 }}>{a.description}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {gems.length > 0 && (
        <section>
          <SectionHead eyebrow="Hidden gems" title="Local secrets" />
          <div className="grid-2">
            {gems.map((g) => (
              <div className="card" key={g.id}>
                <span className="badge badge--accent"><Gem size={11} /> {g.name}</span>
                <p className="small" style={{ marginTop: 8 }}>{g.localTravelGuidance}</p>
                <p className="tiny muted" style={{ marginTop: 6 }}><MapPin size={11} style={{ verticalAlign: -1 }} /> {g.accessibility}</p>
                {g.safetyWarnings && <p className="tiny muted">Safety: {g.safetyWarnings}</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead eyebrow="Plan & book" title="Book through GOWAYY" subtitle="These open the GOWAYY customer app — same account, same backend, same journey." />
        {recs.isLoading ? <Skeleton style={{ height: 200 }} /> : (
          <div className="grid-3">
            {handoffCard(<BedDouble size={16} />, 'Stays', groups?.properties, '/hotels')}
            {handoffCard(<UtensilsCrossed size={16} />, 'Restaurants', groups?.restaurants, '/food')}
            {handoffCard(<Ticket size={16} />, 'Packages', groups?.packages, '/packages')}
            {handoffCard(<Sparkles size={16} />, 'Experiences', groups?.experiences, '/experiences')}
            {handoffCard(<CarFront size={16} />, 'Taxis', groups?.taxiRoutes, '/cabs')}
            {handoffCard(<MapPin size={16} />, 'Attractions', groups?.attractions, '/tourism')}
          </div>
        )}
      </section>
    </div>
  );
}
