import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Store, ArrowRight, BadgePercent } from 'lucide-react';
import { client } from '../lib/client';
import { formatINR } from '@gowayy/shared-utils';
import { ProductCardSkeleton } from '../components/Mascot';
import { SectionHead } from '../components/ui';

export function Categories() {
  const [params, setParams] = useSearchParams();
  const active = params.get('c') ?? '';
  const cats = useQuery({ queryKey: ['commerce-categories'], queryFn: () => client.commerceCategories() });
  const products = useQuery({ queryKey: ['commerce-products', active], queryFn: () => client.commerceProducts(active ? { category: active } : {}) });
  const stores = useQuery({ queryKey: ['recommended-stores'], queryFn: () => client.recommendedStores() });
  const recent = useQuery({ queryKey: ['recently-viewed'], queryFn: () => client.recentlyViewedProducts() });

  return (
    <div className="stack">
      <SectionHead eyebrow="Marketplace" title="All categories" subtitle="Local Himalayan products and travel essentials from partner stores." />
      <div className="row row--wrap" style={{ gap: 8 }}>
        <button className={`chip ${active === '' ? 'chip--active' : ''}`} onClick={() => setParams({})}>All</button>
        {(cats.data?.items ?? []).map((c) => (
          <button key={c.name} className={`chip ${active === c.name ? 'chip--active' : ''}`} onClick={() => setParams({ c: c.name })}>{c.name} · {c.count}</button>
        ))}
      </div>

      <section>
        <div className="grid-3">
          {products.isLoading && <><ProductCardSkeleton /><ProductCardSkeleton /><ProductCardSkeleton /></>}
          {(products.data?.items as Array<Record<string, never>> | undefined ?? []).map((p) => {
            const v = (p as unknown as { variants: Array<{ pricePaise: number; mrpPaise: number; stock: number; discountPercent: number }>; slug: string; name: string; brand: string; dataClass: string; rating: { average: number; count: number } | null }).variants[0];
            return (
              <Link key={p.id as string} to={`/products/${p.slug as string}`} className="card card--hover card--pad0" style={{ display: 'block' }}>
                <div className="image-frame image-frame--4-3"><div className="image-placeholder"><img className="image-placeholder__mark" src="/brand/g-mono-inverse.svg" alt="" /><div className="image-placeholder__text">Product image unavailable</div></div></div>
                <div style={{ padding: '12px 14px 14px' }}>
                  <div className="between"><span className="tiny" style={{ color: 'var(--gw-champagne-deep)', fontWeight: 700 }}>{p.brand as string}</span>{p.dataClass === 'demo-listing' && <span className="badge">Demo</span>}</div>
                  <p className="small" style={{ marginTop: 4, minHeight: 40 }}>{p.name as string}</p>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <strong>{formatINR(v?.pricePaise ?? 0)}</strong>
                    {v && v.mrpPaise > v.pricePaise && <span className="tiny muted" style={{ textDecoration: 'line-through' }}>{formatINR(v.mrpPaise)}</span>}
                    {v && v.discountPercent > 0 && <span className="badge badge--success"><BadgePercent size={12} /> {v.discountPercent}%</span>}
                  </div>
                  <div className="tiny" style={{ marginTop: 6, color: (v?.stock ?? 0) > 0 ? 'var(--gw-success)' : 'var(--gw-danger)' }}>{(v?.stock ?? 0) > 0 ? 'In stock' : 'Out of stock'}</div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {recent.data && recent.data.items.length > 0 && (
        <section>
          <SectionHead eyebrow="For you" title="Recently viewed" />
          <div className="hscroll">
            {(recent.data.items as Array<{ id: string; slug: string; name: string; brand: string; variants: Array<{ pricePaise: number }> }>).map((p) => (
              <Link key={p.id} to={`/products/${p.slug}`} className="card hscroll__item" style={{ minWidth: 220 }}>
                <strong className="tiny" style={{ color: 'var(--gw-champagne-deep)' }}>{p.brand}</strong>
                <span className="small">{p.name}</span>
                <span style={{ fontWeight: 700 }}>{formatINR(p.variants[0]?.pricePaise ?? 0)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <SectionHead eyebrow="Stores" title="Recommended stores" action={<Link className="link small" to="/groceries">All grocery stores <ArrowRight size={13} style={{ verticalAlign: -2 }} /></Link>} />
        <div className="grid-3">
          {(stores.data?.items as Array<{ id: string; name: string; productCount: number; deliveryCoverageKm: number; slots: string[]; image: { status: string; alt: string } }> | undefined ?? []).map((s) => (
            <Link key={s.id} to={`/groceries/${s.id}`} className="card card--hover">
              <div className="between"><span className="row" style={{ gap: 8 }}><Store size={16} style={{ color: 'var(--gw-champagne)' }} /><strong className="small">{s.name}</strong></span><span className="badge">{s.productCount} products</span></div>
              <p className="tiny muted" style={{ marginTop: 6 }}>Delivery within {s.deliveryCoverageKm} km · slots {s.slots.join(', ')}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
