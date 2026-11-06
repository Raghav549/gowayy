import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Store, ArrowRight, BadgePercent, MapPin, Package } from 'lucide-react';
import { client } from '../lib/client';
import { formatINR } from '@gowayy/shared-utils';
import { ProductCardSkeleton } from '../components/Mascot';
import { SectionHead, EmptyState } from '../components/ui';
import { apiErrorText, usePageMeta } from '../lib/guards';
import { UniversalSearch, useDebouncedValue } from '../components/UniversalSearch';

interface ProductView {
  id: string; slug: string; name: string; brand: string; category: string; storeId: string; dataClass: string;
  images?: Array<{ status: string; path?: string; assetPath?: string; alt: string }>;
  variants: Array<{ pricePaise: number; mrpPaise: number; stock: number; discountPercent: number }>;
  tags?: string[];
}
interface StoreView { id: string; name: string; categoryName?: string; address?: string; deliveryCoverageKm?: number; openingHours?: string; openingHoursVerified?: boolean; productCount: number; verified?: boolean; image?: { status: string; assetPath?: string; alt: string } | null }

function ProductImage({ product }: { product: ProductView }) {
  const first = product.images?.find((i) => (i.path || i.assetPath) && i.status !== 'unavailable');
  const src = first?.path ?? (first?.assetPath ? `/${first.assetPath.replace(/^\//, '')}` : null);
  if (!src) {
    return <div className="image-frame image-frame--4-3"><div className="image-placeholder"><img className="image-placeholder__mark" src="/brand/g-mono-inverse.svg" alt="" /><div className="image-placeholder__text">Photo coming soon</div></div></div>;
  }
  return <div className="image-frame image-frame--4-3"><img src={src} alt={first?.alt ?? product.name} loading="lazy" decoding="async" /></div>;
}

export function Categories() {
  usePageMeta('Shop local stores', 'Shop groceries, travel essentials and local Himalayan products from verified stores around Darjeeling.');
  const [params, setParams] = useSearchParams();
  const activeCategory = params.get('c') ?? '';
  const activeStore = params.get('store') ?? '';
  const [text, setText] = useState(params.get('q') ?? '');
  const query = useDebouncedValue(text.trim());

  const cats = useQuery({ queryKey: ['commerce-categories'], queryFn: () => client.commerceCategories() });
  const products = useQuery({
    queryKey: ['commerce-products', activeCategory, activeStore, query],
    queryFn: () => client.commerceProducts({ category: activeCategory || undefined, storeId: activeStore || undefined, q: query || undefined }),
  });
  const storefront = useQuery({ queryKey: ['storefront'], queryFn: async () => (await client.storefront?.()) as unknown as { stores: StoreView[]; offers: Array<{ id: string; title: string; code?: string | null; kind: string; value: number; minOrderPaise?: number }> } });
  const stores = useQuery({ queryKey: ['recommended-stores'], queryFn: () => client.recommendedStores() });

  const storeList = (storefront.data?.stores?.length ? storefront.data.stores : (stores.data?.items as StoreView[] | undefined) ?? [])
    .filter((s) => !text.trim() || `${s.name} ${s.categoryName ?? ''} ${s.address ?? ''}`.toLowerCase().includes(text.trim().toLowerCase()));

  return (
    <div className="stack shop-page">
      <SectionHead eyebrow="Shop" title="Everything from hill stores" />

      <UniversalSearch
        value={text}
        onChange={setText}
        scope="commerce"
        variant="compact"
        placeholder="Search products and stores — tea, honey, woollens…"
        label="Search products and stores"
      />

      <div className="chips">
        <button className={`chip ${!activeCategory ? 'chip--active' : ''}`} onClick={() => setParams({})}>All products</button>
        {(cats.data?.items ?? []).map((c) => (
          <button key={c.name} className={`chip ${activeCategory === c.name ? 'chip--active' : ''}`} onClick={() => setParams({ c: c.name, ...(activeStore ? { store: activeStore } : {}) })}>{c.name} · {c.count}</button>
        ))}
      </div>

      {(storefront.data?.offers ?? []).length > 0 && (
        <div className="offer-strip">
          {(storefront.data?.offers ?? []).slice(0, 3).map((o) => (
            <div className="offer-chip" key={o.id}>
              <BadgePercent size={16} aria-hidden="true" />
              <div><strong>{o.title}</strong><span>{o.code ? `Use code ${o.code}` : o.kind === 'percent' ? `${o.value}% off` : `₹${o.value} off`}</span></div>
            </div>
          ))}
        </div>
      )}

      <section>
        <div className="between row--wrap">
          <h3 style={{ fontSize: 18 }}>Stores</h3>
          {(activeStore || text) && <button className="link" onClick={() => { setText(''); setParams({}); }}>Clear store filter</button>}
        </div>
        <div className="grid-3" style={{ marginTop: 12 }}>
          {storeList.map((s) => (
            <Link key={s.id} to={`/groceries/${s.id}`} className={`card card--hover store-card ${activeStore === s.id ? 'card--selected' : ''}`}>
              <div className="row" style={{ gap: 12 }}>
                <span className="store-avatar" aria-hidden="true"><Store size={20} /></span>
                <div style={{ minWidth: 0 }}><strong>{s.name}</strong><div className="tiny muted">{s.categoryName ?? 'Store'}{s.address ? ` · ${s.address}` : ''}</div></div>
              </div>
              <div className="row tiny muted row--wrap" style={{ gap: 10, marginTop: 12 }}>
                <span className="row" style={{ gap: 4 }}><Package size={11} /> {s.productCount ?? 0} products</span>
                {s.deliveryCoverageKm ? <span className="row" style={{ gap: 4 }}><MapPin size={11} /> {s.deliveryCoverageKm} km delivery</span> : null}
                {s.openingHoursVerified && s.openingHours ? <span>{s.openingHours}</span> : null}
              </div>
            </Link>
          ))}
          {storeList.length === 0 && <p className="small muted">No stores match this search yet.</p>}
        </div>
      </section>

      <section>
        <div className="between">
          <h3 style={{ fontSize: 18 }}>{activeCategory || 'All products'}</h3>
          {(activeCategory || activeStore) && <button className="link" onClick={() => setParams({})}>Clear filters</button>}
        </div>
        <div className="grid-3" style={{ marginTop: 12 }}>
          {products.isLoading && <><ProductCardSkeleton /><ProductCardSkeleton /><ProductCardSkeleton /></>}
          {products.isError && <div className="notice notice--info" role="alert">Products could not be loaded. {apiErrorText(products.error)}</div>}
          {((products.data?.items as ProductView[] | undefined) ?? []).map((p) => {
            const v = p.variants[0];
            return (
              <Link key={p.id} to={`/products/${p.slug}`} className="card card--pad0 card--hover">
                <ProductImage product={p} />
                <div style={{ padding: '12px 14px 14px' }}>
                  <div className="between"><span className="tiny product-brand">{p.brand}</span>{(p.variants[0]?.discountPercent ?? 0) > 0 && <span className="badge badge--success"><BadgePercent size={11} /> {p.variants[0].discountPercent}%</span>}</div>
                  <p className="small product-name">{p.name}</p>
                  <div className="row" style={{ gap: 8, marginTop: 6 }}>
                    <strong>{formatINR(v?.pricePaise ?? 0)}</strong>
                    {v && v.mrpPaise > v.pricePaise && <span className="tiny muted" style={{ textDecoration: 'line-through' }}>{formatINR(v.mrpPaise)}</span>}
                  </div>
                  <div className="tiny" style={{ marginTop: 6, color: (v?.stock ?? 0) > 0 ? 'var(--gw-success)' : 'var(--gw-danger)' }}>{(v?.stock ?? 0) > 0 ? 'In stock' : 'Out of stock'}</div>
                </div>
              </Link>
            );
          })}
        </div>
        {products.data && (products.data.items as unknown[]).length === 0 && (
          <EmptyState title="No products here yet" body="Try another category or search term — partners add new products from the Partner App." action={<Link className="btn btn--secondary" to="/categories">Show all shops</Link>} />
        )}
      </section>

      <div className="card card--flat row between row--wrap">
        <div><div className="eyebrow">Own a store?</div><p className="small muted" style={{ marginTop: 4 }}>Manage products, categories and offers in the GOWAYY Partner app.</p></div>
        <Link to="/support" className="btn btn--secondary btn--sm">Contact partner support <ArrowRight size={15} /></Link>
      </div>
    </div>
  );
}
