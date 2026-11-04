import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Clock, Search, Store, X, UtensilsCrossed, MapPin, Package, BedDouble } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store/useUI';
import { apiErrorText } from '../lib/guards';

const QUICK = ['Darjeeling', 'Mirik', 'Momos', 'Tea', 'Homestay', 'Airport taxi'];
const CATEGORY_LINKS = [
  { to: '/explore', label: 'Destinations', icon: MapPin },
  { to: '/hotels', label: 'Hotels', icon: BedDouble },
  { to: '/food', label: 'Food', icon: UtensilsCrossed },
  { to: '/categories', label: 'Shop', icon: Store },
  { to: '/groceries', label: 'Groceries', icon: Package },
];

const KIND_LABEL: Record<string, string> = {
  destination: 'Destination', attraction: 'Attraction', property: 'Stay', restaurant: 'Restaurant',
  food: 'Dish', grocery: 'Grocery item', product: 'Product', store: 'Store', taxi_route: 'Shared taxi',
  package: 'Tour package', experience: 'Experience', cab: 'Cab',
};

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const showToast = useUI((s) => s.showToast);
  const [text, setText] = useState(params.get('q') ?? '');
  const q = text.trim();

  useEffect(() => { setText(params.get('q') ?? ''); }, [params]);

  const recents = useQuery({ queryKey: ['recent-searches'], queryFn: () => client.recentSearches(), retry: false });
  const stores = useQuery({ queryKey: ['recommended-stores'], queryFn: () => client.recommendedStores(), retry: false });
  const results = useQuery({
    queryKey: ['search-page', q],
    queryFn: async () => { const hits = await client.search(q); await client.recordSearch(q).catch(() => undefined); return hits; },
    enabled: q.length > 1,
  });

  const grouped = useMemo(() => {
    const groups = new Map<string, typeof results.data>();
    for (const hit of results.data ?? []) {
      const list = groups.get(hit.kind) ?? [];
      list.push(hit);
      groups.set(hit.kind, list);
    }
    return [...groups.entries()];
  }, [results.data]);

  const submit = () => {
    if (q.length < 2) { showToast('Type at least two characters', 'info'); return; }
    setParams({ q });
    void recents.refetch();
  };

  return (
    <div className="search-page stack">
      <div className="search-field search-field--page" role="search">
        <Search size={18} aria-hidden="true" className="search-field__icon" />
        <input
          className="search-field__input"
          autoFocus
          type="search"
          value={text}
          placeholder="Search destinations, hotels, shops, dishes…"
          aria-label="Search"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
        />
        {text && <button type="button" className="search-field__clear" aria-label="Clear search" onClick={() => { setText(''); setParams({}); }}><X size={16} /></button>}
        <button type="button" className="search-field__submit" onClick={submit}>Search</button>
      </div>

      <div className="chips search-categories">
        {CATEGORY_LINKS.map((c) => <Link key={c.to} to={c.to} className="chip"><c.icon size={13} aria-hidden="true" /> {c.label}</Link>)}
      </div>

      {q.length <= 1 && (
        <>
          {recents.data && recents.data.items.length > 0 && (
            <section className="card">
              <div className="between"><h3 style={{ fontSize: 16 }}>Recent searches</h3><span className="tiny muted">{recents.data.items.length}</span></div>
              <div className="chips" style={{ marginTop: 10 }}>
                {recents.data.items.map((r) => <button key={r} className="chip" onClick={() => { setText(r); setParams({ q: r }); }}><Clock size={12} aria-hidden="true" /> {r}</button>)}
              </div>
            </section>
          )}
          <section className="card">
            <h3 style={{ fontSize: 16 }}>Trending in the hills</h3>
            <div className="chips" style={{ marginTop: 10 }}>
              {QUICK.map((t) => <button key={t} className="chip" onClick={() => { setText(t); setParams({ q: t }); }}>{t}</button>)}
            </div>
          </section>
          <section className="card">
            <h3 style={{ fontSize: 16 }}>Recommended stores</h3>
            <div className="grid-3" style={{ marginTop: 10 }}>
              {((stores.data?.items as Array<{ id: string; name: string; productCount?: number; deliveryCoverageKm?: number }> | undefined) ?? []).slice(0, 3).map((s) => (
                <Link key={s.id} to={`/groceries/${s.id}`} className="card card--hover" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Store size={20} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" />
                  <span className="list-row__body"><span className="list-row__title small">{s.name}</span><span className="list-row__sub tiny muted">{s.productCount ?? 0} products{s.deliveryCoverageKm ? ` · ${s.deliveryCoverageKm} km` : ''}</span></span>
                </Link>
              ))}
              {stores.isLoading && <p className="small muted">Loading stores…</p>}
              {stores.data && (stores.data.items?.length ?? 0) === 0 && <p className="small muted">No stores listed yet.</p>}
            </div>
          </section>
        </>
      )}

      {q.length > 1 && (
        <section aria-live="polite">
          <h3 style={{ fontSize: 16 }}>Results for “{q}”{results.data ? ` · ${results.data.length}` : ''}</h3>

          {results.isLoading && (
            <div className="stack" style={{ marginTop: 12 }}>
              {[0, 1, 2].map((i) => <div key={i} className="card skeleton-row" aria-hidden="true" />)}
              <p className="small muted">Searching GOWAYY…</p>
            </div>
          )}
          {results.isError && (
            <div className="notice notice--info" style={{ marginTop: 12 }} role="alert">
              Search is temporarily unavailable. {apiErrorText(results.error)} <button className="link" onClick={() => void results.refetch()}>Try again</button>
            </div>
          )}
          {results.data && results.data.length === 0 && (
            <div className="empty-state" style={{ marginTop: 16 }}>
              <h3>No matches for “{q}”</h3>
              <p>Try a destination, store, dish or product name — for example “Mirik”, “momos” or “tea”.</p>
              <div className="chips" style={{ justifyContent: 'center', marginTop: 12 }}>{QUICK.slice(0, 4).map((t) => <button key={t} className="chip" onClick={() => { setText(t); setParams({ q: t }); }}>{t}</button>)}</div>
            </div>
          )}

          <div className="stack" style={{ marginTop: 12 }}>
            {grouped.map(([kind, hits]) => (
              <div className="card" key={kind}>
                <div className="between"><strong className="small">{KIND_LABEL[kind] ?? kind.replace(/_/g, ' ')}</strong><span className="badge">{hits?.length ?? 0}</span></div>
                <div className="list" style={{ marginTop: 8 }}>
                  {(hits ?? []).map((hit) => (
                    <button key={`${hit.kind}-${hit.id}`} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => navigate(hit.href)}>
                      <Search size={15} className="muted" aria-hidden="true" />
                      <span className="list-row__body"><span className="list-row__title">{hit.title}</span><span className="list-row__sub">{hit.subtitle}</span></span>
                      <span className="badge">{KIND_LABEL[hit.kind] ?? hit.kind}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
