import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Compass, MapPin, Mountain, Route as RouteIcon, ShieldAlert, ExternalLink } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { usePageMeta } from '../lib/guards';
import { SectionHead, ImageFrame } from '../components/ui';
import { DestinationCard, useDestinations } from './shared';
import { MapView } from '../components/MapView';
import { UniversalSearch } from '../components/UniversalSearch';

type Tab = 'all' | 'gems' | 'verified';

export function Explore() {
  usePageMeta('Explore destinations', 'Discover Darjeeling, Kalimpong, Kurseong, Mirik, Siliguri, Sandakphu and verified nearby destinations with stays, food and transport.');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const destinations = useDestinations();

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    return destinations
      .filter((d) => (tab === 'gems' ? d.hiddenGem : tab === 'verified' ? d.images.some((i) => i.status === 'verified') : true))
      .filter((d) => !term || `${d.name} ${d.region} ${d.description} ${d.activities.join(' ')}`.toLowerCase().includes(term));
  }, [query, tab, destinations]);

  return (
    <div className="explore-page">
      <section className="explore-hero">
        <div>
          <div className="eyebrow">Explore · inside GOWAYY</div>
          <h1>Discover the Darjeeling Himalaya</h1>
          <p className="muted">Verified destinations, nearby stays, food, stores and transport — book any of them without leaving the app.</p>
        </div>
      </section>

      <UniversalSearch
        value={query}
        onChange={setQuery}
        scope="destinations"
        variant="compact"
        placeholder="Search destinations, stays and experiences…"
        label="Search destinations"
      />

      <div className="chips explore-filters">
        <button className={`chip ${tab === 'all' ? 'chip--active' : ''}`} onClick={() => setTab('all')}>All destinations</button>
        <button className={`chip ${tab === 'verified' ? 'chip--active' : ''}`} onClick={() => setTab('verified')}>With photographs</button>
        <button className={`chip ${tab === 'gems' ? 'chip--active' : ''}`} onClick={() => setTab('gems')}>Off the usual route</button>
      </div>

      {tab !== 'gems' ? (
        <section className="section" style={{ marginTop: 8 }}>
          <div className="grid-3">
            {matches.map((d) => <DestinationCard key={d.id} destination={d} />)}
          </div>
          {matches.length === 0 && <div className="empty-state"><h3>No destinations found</h3><p>Try another name or clear the filter.</p></div>}
        </section>
      ) : (
        <section className="section" style={{ marginTop: 8 }}>
          <p className="small muted" style={{ marginBottom: 14 }}>Community-reference locations. Coordinates and access notes are approximate — confirm locally before travelling.</p>
          <div className="grid-2">
            {matches.map((d) => {
              const gem = catalogue.hiddenGems.find((g) => g.destinationId === d.id);
              return (
                <div className="card" key={d.id}>
                  <div className="between"><h3>{d.name}</h3><span className="badge badge--accent">Off the usual route</span></div>
                  <p className="small muted" style={{ marginTop: 8 }}>{d.description}</p>
                  <div className="grid-2" style={{ gap: 8, marginTop: 14 }}>
                    <div className="card card--flat"><div className="eyebrow">Coordinates</div><div className="small" style={{ fontFamily: 'var(--gw-mono)', marginTop: 4 }}>{d.coords.lat.toFixed(4)}° N, {d.coords.lng.toFixed(4)}° E</div><div className="tiny muted">Approximate</div></div>
                    <div className="card card--flat"><div className="eyebrow">Best period</div><div className="small" style={{ marginTop: 4 }}>{gem?.bestPeriod ?? d.bestSeason}</div></div>
                  </div>
                  <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                    {gem?.route && <div className="row small"><RouteIcon size={15} aria-hidden="true" /><span>{gem.route}</span></div>}
                    {gem?.accessibility && <div className="row small"><Compass size={15} aria-hidden="true" /><span>{gem.accessibility}</span></div>}
                    {gem?.restrictions && <div className="row small"><ShieldAlert size={15} aria-hidden="true" /><span>{gem.restrictions}</span></div>}
                  </div>
                  <div className="row between" style={{ marginTop: 14 }}>
                    {gem?.source ? <a className="link row" href={gem.source} target="_blank" rel="noreferrer">Reference <ExternalLink size={13} /></a> : <span />}
                    <Link className="btn btn--secondary btn--sm" to={`/destinations/${d.slug}`}>Open destination</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead eyebrow="Map" title="Destination map" subtitle="Tap a pin to open the destination, then book stays and transport from there." />
        <MapView pins={catalogue.destinations.map((d) => ({ id: d.id, label: d.name, ...d.coords, kind: d.hiddenGem ? 'address' : 'destination' }))}
          onSelect={(p) => { const d = catalogue.destinations.find((x) => x.id === p.id); if (d) navigate(`/destinations/${d.slug}`); }} height={380} />
      </section>

      <section className="section">
        <SectionHead eyebrow="Photographs" title="Destinations with verified images" />
        <div className="grid-3">
          {catalogue.destinations.filter((d) => d.images.some((i) => i.status === 'verified')).map((d) => {
            const image = d.images.find((i) => i.status === 'verified');
            return (
              <div key={d.id} className="card card--pad0 card--hover">
                <Link to={`/destinations/${d.slug}`}>
                  {image && <ImageFrame asset={image} variant="16-9" />}
                  <div style={{ padding: 14 }}><strong>{d.name}</strong><div className="tiny muted row" style={{ gap: 4, marginTop: 4 }}><MapPin size={11} /> {d.region}</div></div>
                </Link>
                {image?.credit && (
                  <div className="image-credit" style={{ position: 'static' }}>
                    {image.credit}{image.sourceUrl ? <> · <a href={image.sourceUrl} target="_blank" rel="noreferrer noopener">source</a></> : null}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Sightseeing" title="Popular attractions" />
        <div className="grid-3">
          {catalogue.attractions.slice(0, 9).map((a) => (
            <div className="card" key={a.id}>
              <div className="between"><strong>{a.name}</strong><span className="badge">{a.category}</span></div>
              <p className="small muted" style={{ marginTop: 8 }}>Typical visit {a.typicalVisitMinutes} min</p>
              <div className="row tiny muted" style={{ gap: 5, marginTop: 8 }}><Mountain size={12} /> {catalogue.destinations.find((d) => d.id === a.destinationId)?.name}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
