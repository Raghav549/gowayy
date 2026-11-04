import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { catalogue } from '@gowayy/catalog';
import { client } from '../lib/client';
import { useUI } from '../store';
import { SectionHead, Skeleton, MascotEmpty } from '@gowayy/ui';

export function Destinations() {
  return (
    <div className="stack">
      <SectionHead eyebrow="All" title="Destinations" subtitle="Every verified destination in the region catalogue." />
      <div className="grid-3">
        {catalogue.destinations.map((d) => (
          <Link key={d.id} to={`/destinations/${d.slug}`} className="card card--hover">
            <div className="between"><strong>{d.name}</strong>{d.hiddenGem && <span className="badge badge--accent">Hidden gem</span>}</div>
            <p className="tiny muted" style={{ marginTop: 4 }}>{d.region}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function Search() {
  const [text, setText] = useState('');
  const nav = useNavigate();
  const results = useQuery({ queryKey: ['explore-search', text], queryFn: () => client.search(text), enabled: text.trim().length > 1 });
  return (
    <div className="stack">
      <SectionHead eyebrow="Find" title="Search places & services" />
      <input autoFocus className="input" placeholder="Try “Tiger Hill”, “momos”, “homestay”…" value={text} onChange={(e) => setText(e.target.value)} />
      {text.trim().length <= 1 && <p className="small muted">Search destinations, attractions, stays, restaurants, food and routes.</p>}
      <div className="list">
        {results.data?.map((hit) => (
          <button key={`${hit.kind}-${hit.id}`} className="list-row" onClick={() => nav(hit.href)}>
            <span className="list-row__body"><span className="list-row__title">{hit.title}</span><span className="list-row__sub">{hit.subtitle}</span></span>
            <span className="badge">{hit.kind.replace('_', ' ')}</span>
          </button>
        ))}
        {results.data && results.data.length === 0 && <p className="small muted">No matches.</p>}
      </div>
    </div>
  );
}

export function Saved() {
  const q = useQuery({ queryKey: ['saved-places'], queryFn: () => client.savedPlaces() });
  const items = ((q.data as { items?: unknown[] } | undefined)?.items ?? []) as Array<{ id: string; label: string; place?: { name: string } }>;
  if (q.isLoading) return <Skeleton style={{ height: 160 }} />;
  if (!items.length) return <MascotEmpty pose="curious" title="No saved places yet" body="Tap “Save place” on any destination to keep it here — it syncs with your GOWAYY account." action={<Link className="btn btn--primary" to="/">Explore destinations</Link>} />;
  return (
    <div className="stack">
      <SectionHead eyebrow="Yours" title="Saved places" />
      <div className="list">
        {items.map((s) => (
          <div className="list-row" key={s.id}>
            <span className="list-row__body"><span className="list-row__title">{s.label}</span><span className="list-row__sub">{s.place?.name}</span></span>
          </div>
        ))}
      </div>
    </div>
  );
}
