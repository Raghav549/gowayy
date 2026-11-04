import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Compass, Gem, Map, Search, Bookmark } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { client } from '../lib/client';
import type { Destination } from '@gowayy/types';
import { AppShell, Brand, SectionHead, Skeleton } from '@gowayy/ui';
import { Mascot } from '@gowayy/ui';

function DestinationCard({ d }: { d: Destination }) {
  const img = d.images[0];
  return (
    <Link to={`/destinations/${d.slug}`} className="card card--pad0 card--hover" style={{ display: 'block' }}>
      <div className="image-frame image-frame--16-9">
        {img?.status === 'verified' && img.assetPath ? (
          <img src={`/${img.assetPath.replace(/^\//, '')}`} alt={img.alt} loading="lazy" />
        ) : (
          <div className="image-placeholder"><img className="image-placeholder__mark" src="/brand/g-mono-inverse.svg" alt="" /><div className="image-placeholder__text">Photograph unavailable</div></div>
        )}
      </div>
      <div style={{ padding: '12px 14px 14px' }}>
        <div className="between"><strong>{d.name}</strong>{d.hiddenGem && <span className="badge badge--accent"><Gem size={11} /> Hidden gem</span>}</div>
        <p className="tiny muted" style={{ marginTop: 4 }}>{d.region} · {d.bestSeason ?? 'Year round'}{d.elevationVerified && d.elevationM ? ` · ${d.elevationM} m` : ''}</p>
      </div>
    </Link>
  );
}

export function ExploreHome() {
  const q = useQuery({ queryKey: ['explore-destinations'], queryFn: () => client.catalog() });
  const gems = catalogue.hiddenGems;
  return (
    <div className="stack">
      <section className="card" style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <Mascot pose="pointing" size={96} />
        <div style={{ flex: 1, minWidth: 240 }}>
          <div className="eyebrow">GOWAYY EXPLORE</div>
          <h1 style={{ fontSize: 28 }}>Where in the Himalaya next?</h1>
          <p className="small muted">Verified destinations, attractions and hidden gems around Darjeeling, Kalimpong, Kurseong, Mirik and Siliguri — with real, licensed photographs and direct booking handoff to GOWAYY.</p>
          <div className="row row--wrap" style={{ gap: 8, marginTop: 10 }}>
            <Link className="btn btn--primary btn--sm" to="/search"><Search size={14} /> Search places</Link>
            <Link className="btn btn--secondary btn--sm" to="/saved"><Bookmark size={14} /> Saved</Link>
            <Link className="btn btn--secondary btn--sm" to="/destinations"><Map size={14} /> All destinations</Link>
          </div>
        </div>
      </section>

      <section>
        <SectionHead eyebrow="Discover" title="Destinations" subtitle="Real photographs only where the subject and licence were verified." />
        {q.isLoading ? <div className="grid-3"><Skeleton style={{ height: 220 }} /><Skeleton style={{ height: 220 }} /><Skeleton style={{ height: 220 }} /></div> : (
          <div className="grid-3">
            {catalogue.destinations.map((d) => <DestinationCard key={d.id} d={d} />)}
          </div>
        )}
      </section>

      {gems.length > 0 && (
        <section>
          <SectionHead eyebrow="Hidden gems" title="Verified hidden gems" subtitle="Accurate coordinates, routes, seasonality and safety notes only — no fabricated places." />
          <div className="grid-3">
            {gems.slice(0, 6).map((g) => (
              <Link key={g.id} to={`/destinations/${g.destinationId.replace('dst_', '')}`} className="card card--hover">
                <span className="badge badge--accent"><Gem size={11} /> {g.name}</span>
                <p className="small" style={{ marginTop: 8 }}>{g.localTravelGuidance}</p>
                {g.safetyWarnings && <p className="tiny muted" style={{ marginTop: 6 }}>Safety: {g.safetyWarnings}</p>}
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export const NAV = [
  { to: '/', label: 'Home', icon: Compass, end: true },
  { to: '/destinations', label: 'Destinations', icon: Map },
  { to: '/search', label: 'Search', icon: Search },
  { to: '/saved', label: 'Saved', icon: Bookmark },
];

export function Shell({ children }: { children: React.ReactNode }) {
  return <AppShell brand={<Brand symbol="/brand/g-symbol.svg" wordmark="/brand/wordmark.svg" />} nav={NAV}>{children}</AppShell>;
}
