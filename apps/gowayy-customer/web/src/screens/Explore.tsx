import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Compass, ShieldAlert, Route as RouteIcon, ExternalLink } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { usePageMeta } from '../lib/guards';
import { SectionHead, ImageFrame } from '../components/ui';
import { DestinationCard, DataNotice } from './shared';
import { MapView } from '../components/MapView';

export function Explore() {
  usePageMeta('Explore destinations', 'Discover Darjeeling, Kalimpong, Kurseong, Mirik, Siliguri, Sandakphu and verified hidden gems with maps and travel guidance.');
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<'all' | 'gems'>('all');
  const destinations = catalogue.destinations.filter((d) => (tab === 'gems' ? d.hiddenGem : true))
    .filter((d) => `${d.name} ${d.region} ${d.description}`.toLowerCase().includes(query.toLowerCase()));
  const gems = catalogue.hiddenGems;

  return (
    <div>
      <SectionHead eyebrow="Destination discovery" title="Explore the Darjeeling Himalaya" subtitle="Fifteen data-driven destination records. Add more through the catalogue JSON without changing application code." />
      <div className="row row--wrap" style={{ gap: 10, marginBottom: 18 }}>
        <div className="row" style={{ flex: 1, minWidth: 220, position: 'relative' }}><Search size={17} /><input className="input" placeholder="Filter destinations…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <div className="chips"><button className={`chip ${tab === 'all' ? 'active' : ''}`} onClick={() => setTab('all')}>All destinations</button><button className={`chip ${tab === 'gems' ? 'active' : ''}`} onClick={() => setTab('gems')}>Hidden gems</button></div>
      </div>

      {tab === 'all' && <section className="section" style={{ marginTop: 0 }}>
        <div className="grid-3">{destinations.map((d) => <DestinationCard key={d.id} destination={d} />)}</div>
        {destinations.length === 0 && <div className="empty-state"><h3>No destinations found</h3><p>Try another name.</p></div>}
      </section>}

      {tab === 'gems' && <section className="section" style={{ marginTop: 0 }}>
        <div className="notice notice--info" style={{ marginBottom: 16 }}>
          <strong>Verification note.</strong> Hidden-gem records are community references: coordinates are approximate and permit information is not verified. Do not use these coordinates for navigation; confirm routes, access and restrictions locally.
        </div>
        <div className="grid-2">
          {destinations.map((d) => {
            const gem = gems.find((g) => g.destinationId === d.id);
            return (
              <div className="card" key={d.id}>
                <div className="between"><h3>{d.name}</h3><span className="badge badge--accent">Hidden gem</span></div>
                <p className="small muted" style={{ marginTop: 8 }}>{d.description}</p>
                <div className="grid-2" style={{ gap: 8, marginTop: 14 }}>
                  <div className="card card--flat"><div className="eyebrow">Coordinates</div><div className="small" style={{ fontFamily: 'var(--gw-mono)', marginTop: 4 }}>{d.coords.lat.toFixed(4)}° N, {d.coords.lng.toFixed(4)}° E</div><div className="tiny muted">Approximate — not field verified</div></div>
                  <div className="card card--flat"><div className="eyebrow">Best period</div><div className="small" style={{ marginTop: 4 }}>{gem?.bestPeriod ?? d.bestSeason}</div></div>
                </div>
                <div className="stack" style={{ marginTop: 12, gap: 8 }}>
                  <div className="row small"><RouteIcon size={15} /><span>{gem?.route}</span></div>
                  <div className="row small"><Compass size={15} /><span>{gem?.accessibility}</span></div>
                  <div className="row small"><ShieldAlert size={15} /><span>{gem?.restrictions}</span></div>
                  <div className="row small muted"><span>{gem?.localTravelGuidance} {gem?.safetyWarnings}</span></div>
                </div>
                <div className="row between" style={{ marginTop: 14 }}>
                  <a className="link row" href={gem?.source ?? '#'} target="_blank" rel="noreferrer">Source <ExternalLink size={13} /></a>
                  <Link className="btn btn--secondary btn--sm" to={`/destinations/${d.slug}`}>Open destination</Link>
                </div>
              </div>
            );
          })}
        </div>
        {destinations.length === 0 && <div className="empty-state"><h3>No hidden gems found</h3><p>Try another name.</p></div>}
      </section>}

      <section className="section">
        <SectionHead eyebrow="Map" title="Destination map" subtitle="Click a pin to open its destination profile." />
        <MapView pins={catalogue.destinations.map((d) => ({ id: d.id, label: d.name, ...d.coords, kind: d.hiddenGem ? 'address' : 'destination' }))}
          onSelect={(p) => { const d = catalogue.destinations.find((x) => x.id === p.id); if (d) navigate(`/destinations/${d.slug}`); }} height={420} />
      </section>

      <section className="section">
        <SectionHead eyebrow="Verified photography" title="Places with checked images" />
        <div className="grid-3">
          {catalogue.destinations.filter((d) => d.images.some((i) => i.status === 'verified')).map((d) => {
            const image = d.images.find((i) => i.status === 'verified');
            return <Link key={d.id} to={`/destinations/${d.slug}`} className="card card--pad0 card--hover">{image && <ImageFrame asset={image} variant="16-9" showCredit />}<div style={{ padding: 14 }}><strong>{d.name}</strong></div></Link>;
          })}
        </div>
      </section>
      <DataNotice />
    </div>
  );
}
