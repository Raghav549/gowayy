import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Clock, Search, Store, X } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store/useUI';
import { ProductCardSkeleton } from '../components/Mascot';

/** Search page with recent searches + recommended stores before results (reference pattern). */
export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [text, setText] = useState(params.get('q') ?? '');
  const q = text.trim();

  useEffect(() => { setText(params.get('q') ?? ''); }, [params]);

  const recents = useQuery({ queryKey: ['recent-searches'], queryFn: () => client.recentSearches() });
  const stores = useQuery({ queryKey: ['recommended-stores'], queryFn: () => client.recommendedStores() });
  const results = useQuery({
    queryKey: ['search-page', q],
    queryFn: async () => { const hits = await client.search(q); await client.recordSearch(q).catch(() => undefined); return hits; },
    enabled: q.length > 1,
  });

  const submit = () => { if (q.length > 1) { setParams({ q }); void qc.invalidateQueries({ queryKey: ['recent-searches'] }); } };

  return (
    <div className="stack">
      <div className="row" style={{ gap: 10 }}>
        <div className="row search-bar">
          <Search size={18} className="muted" />
          <input autoFocus className="input search-bar__input" placeholder="Search destinations, stays, food, products, routes…" value={text}
            onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="Search" />
          {text && <button className="icon-btn" aria-label="Clear" onClick={() => { setText(''); setParams({}); }}><X size={16} /></button>}
        </div>
        <button className="btn btn--primary" onClick={submit}>Search</button>
      </div>

      {q.length <= 1 && (
        <>
          {(!recents.data || recents.data.items.length === 0) && (
            <section className="card">
              <div className="between"><h3 style={{ fontSize: 16 }}>Trending searches</h3></div>
              <div className="chips" style={{ marginTop: 10 }}>
                {['Darjeeling', 'momos', 'tea', 'airport taxi', 'homestay', 'power bank'].map((t) => (
                  <button key={t} className="chip" onClick={() => { setText(t); setParams({ q: t }); }}>{t}</button>
                ))}
              </div>
            </section>
          )}
          {recents.data && recents.data.items.length > 0 && (
            <section className="card">
              <div className="between"><h3 style={{ fontSize: 16 }}>Recent searches</h3><span className="tiny muted">{recents.data.items.length}</span></div>
              <div className="chips" style={{ marginTop: 10 }}>
                {recents.data.items.map((r) => (
                  <button key={r} className="chip" onClick={() => { setText(r); setParams({ q: r }); }}><Clock size={13} /> {r}</button>
                ))}
              </div>
            </section>
          )}
          <section className="card">
            <h3 style={{ fontSize: 16 }}>Recommended stores</h3>
            <div className="grid-3" style={{ marginTop: 10 }}>
              {(stores.data?.items as Array<{ id: string; name: string; productCount: number; slots: string[] }> | undefined ?? []).slice(0, 3).map((s) => (
                <Link key={s.id} to={`/groceries/${s.id}`} className="card card--hover" style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <Store size={20} style={{ color: 'var(--gw-champagne)' }} />
                  <span className="list-row__body"><span className="list-row__title small">{s.name}</span><span className="list-row__sub tiny muted">{s.productCount} products · slots {s.slots.join(', ')}</span></span>
                </Link>
              ))}
            </div>
          </section>
        </>
      )}

      {q.length > 1 && (
        <section>
          <h3 style={{ fontSize: 16 }}>Results for “{q}”</h3>
          {results.isLoading && <div className="grid-3" style={{ marginTop: 12 }}><ProductCardSkeleton /><ProductCardSkeleton /><ProductCardSkeleton /></div>}
          {results.data && results.data.length === 0 && <p className="small muted" style={{ marginTop: 12 }}>No matches in the seeded catalogue. Try “Darjeeling”, “tea” or “taxi”.</p>}
          <div className="list" style={{ marginTop: 12 }}>
            {(results.data ?? []).map((hit) => (
              <button key={`${hit.kind}-${hit.id}`} className="list-row" style={{ width: '100%', textAlign: 'left' }} onClick={() => { showToast(`Opening ${hit.title}`); navigate(hit.href); }}>
                <span className="list-row__body"><span className="list-row__title">{hit.title}</span><span className="list-row__sub">{hit.subtitle}</span></span>
                <span className="badge">{hit.kind.replace('_', ' ')}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
