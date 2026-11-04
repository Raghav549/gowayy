import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgePercent, MapPin, Package, Search, Store, UtensilsCrossed, ShoppingBasket, X } from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { client } from '../lib/client';
import { EmptyState, ImageFrame, SectionHead } from '../components/ui';
import { apiErrorText, usePageMeta } from '../lib/guards';

interface ProductView {
  id: string; slug: string; name: string; brand: string; category: string; storeId: string; dataClass: string;
  images?: Array<{ status: string; path?: string; assetPath?: string; alt: string }>;
  variants: Array<{ pricePaise: number; mrpPaise: number; stock: number; discountPercent: number }>;
  tags?: string[];
}
interface StoreView {
  id: string; name: string; categoryName?: string; address?: string; deliveryCoverageKm?: number;
  openingHours?: string; openingHoursVerified?: boolean; productCount: number; verified?: boolean;
  image?: { status: string; assetPath?: string; alt: string } | null;
}

/** Category names that belong to each local-market surface. Kept as data, not as
 *  navigation, because partners create categories from the Partner app. */
const KINDS = {
  food: {
    title: 'Food & local kitchens',
    eyebrow: 'Food delivery',
    blurb: 'Tea, honey, bakery and prepared food from stores listed by partners around Darjeeling.',
    match: ['local foods', 'snacks & beverages', 'dairy & eggs', 'local himalayan products'],
    icon: UtensilsCrossed,
  },
  groceries: {
    title: 'Groceries & daily needs',
    eyebrow: 'Local commerce',
    blurb: 'Everything listed by hill stores — groceries, fresh produce, home essentials and travel supplies.',
    match: [] as string[],
    icon: ShoppingBasket,
  },
} as const;

function imageSrc(image?: { path?: string; assetPath?: string; status?: string }) {
  if (!image || image.status === 'unavailable') return null;
  if (image.path) return image.path;
  if (image.assetPath) return `/${image.assetPath.replace(/^\//, '')}`;
  return null;
}

function Market({ kind }: { kind: 'food' | 'groceries' }) {
  const cfg = KINDS[kind];
  usePageMeta(cfg.title, cfg.blurb);
  const [text, setText] = useState('');
  const [category, setCategory] = useState('');
  const categories = useQuery({ queryKey: ['commerce-categories'], queryFn: () => client.commerceCategories() });
  const products = useQuery({ queryKey: ['market-products', kind], queryFn: () => client.commerceProducts() });
  const stores = useQuery({ queryKey: ['commerce-stores'], queryFn: () => client.recommendedStores() });

  const all = (products.data?.items as ProductView[] | undefined) ?? [];
  const scoped = useMemo(() => {
    if (kind === 'groceries') return all;
    return all.filter((p) => (cfg.match as readonly string[]).includes(p.category.toLowerCase()));
  }, [all, kind, cfg.match]);
  const categoryNames = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of scoped) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [scoped]);
  const visible = scoped.filter((p) =>
    (!category || p.category === category) &&
    (!text || `${p.name} ${p.brand} ${p.category} ${(p.tags ?? []).join(' ')}`.toLowerCase().includes(text.toLowerCase())));

  const storeList = ((stores.data?.items as StoreView[] | undefined) ?? [])
    .filter((s) => kind === 'groceries' || cfg.match.some((m) => (s.categoryName ?? '').toLowerCase().includes(m.split(' ')[0])))
    .filter((s) => s.productCount > 0)
    .slice(0, 6);

  const Icon = cfg.icon;
  return (
    <div className="stack">
      <SectionHead eyebrow={cfg.eyebrow} title={cfg.title} subtitle={cfg.blurb} />

      <div className="search-field" role="search">
        <Search size={18} aria-hidden="true" className="search-field__icon" />
        <input className="search-field__input" type="search" value={text} placeholder={`Search ${kind === 'food' ? 'food, tea, honey' : 'groceries, essentials'}…`}
          aria-label={`Search ${cfg.title}`} onChange={(e) => setText(e.target.value)} />
        {text && <button type="button" className="search-field__clear" aria-label="Clear search" onClick={() => setText('')}><X size={16} /></button>}
      </div>

      <div className="chips">
        <button className={`chip ${!category ? 'chip--active' : ''}`} onClick={() => setCategory('')}>All</button>
        {categoryNames.map(([name, count]) => (
          <button key={name} className={`chip ${category === name ? 'chip--active' : ''}`} onClick={() => setCategory(name)}>{name} · {count}</button>
        ))}
      </div>

      {products.isError && <div className="notice notice--info" role="alert">Products could not be loaded. {apiErrorText(products.error)}</div>}

      {storeList.length > 0 && (
        <section>
          <div className="between"><h3 style={{ fontSize: 18 }}>Stores listing here</h3><Link to="/categories" className="link">All shops</Link></div>
          <div className="grid-3" style={{ marginTop: 12 }}>
            {storeList.map((s) => (
              <Link key={s.id} to={`/categories?store=${s.id}`} className="card card--hover store-card">
                <div className="row" style={{ gap: 12 }}>
                  <span className="store-avatar" aria-hidden="true"><Store size={20} /></span>
                  <div style={{ minWidth: 0 }}><strong>{s.name}</strong><div className="tiny muted">{s.categoryName ?? 'Store'}{s.address ? ` · ${s.address}` : ''}</div></div>
                </div>
                <div className="row tiny muted row--wrap" style={{ gap: 10, marginTop: 12 }}>
                  <span className="row" style={{ gap: 4 }}><Package size={11} /> {s.productCount} products</span>
                  {s.deliveryCoverageKm ? <span className="row" style={{ gap: 4 }}><MapPin size={11} /> {s.deliveryCoverageKm} km</span> : null}
                  {s.openingHoursVerified && s.openingHours ? <span>{s.openingHours}</span> : null}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="between">
          <h3 style={{ fontSize: 18 }}>{category || 'All listings'}</h3>
          {category && <button className="link" onClick={() => setCategory('')}>Clear category</button>}
        </div>
        <div className="grid-3" style={{ marginTop: 12 }}>
          {visible.map((p) => {
            const v = p.variants?.[0];
            const img = imageSrc(p.images?.find((i) => imageSrc(i)));
            return (
              <Link key={p.id} to={`/products/${p.slug}`} className="card card--pad0 card--hover">
                {img ? (
                  <div className="image-frame image-frame--4-3"><img src={img} alt={p.images?.find((i) => imageSrc(i))?.alt ?? p.name} loading="lazy" decoding="async" /></div>
                ) : (
                  <div className="image-frame image-frame--4-3"><div className="image-placeholder"><Icon size={26} aria-hidden="true" /><div className="image-placeholder__text">Photo coming soon</div></div></div>
                )}
                <div style={{ padding: '12px 14px 14px' }}>
                  <div className="between"><span className="tiny product-brand">{p.brand}</span>{(v?.discountPercent ?? 0) > 0 && <span className="badge badge--success"><BadgePercent size={11} /> {v?.discountPercent}%</span>}</div>
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
        {products.isLoading && <p className="small muted" style={{ marginTop: 14 }}>Loading listings…</p>}
        {!products.isLoading && visible.length === 0 && (
          <EmptyState title="No listings match yet" body="Partners publish new products from the GOWAYY Partner app. Try clearing the category or search."
            action={<button className="btn btn--secondary" onClick={() => { setText(''); setCategory(''); }}>Clear filters</button>} />
        )}
      </section>

      <div className="card card--flat row between row--wrap">
        <div><div className="eyebrow">Run a kitchen or store?</div><p className="small muted" style={{ marginTop: 4 }}>Publish your menu, categories and offers from the GOWAYY Partner app; orders arrive verified.</p></div>
        <Link to="/support" className="btn btn--secondary btn--sm">Partner support</Link>
      </div>
    </div>
  );
}

export function Food() { return <Market kind="food" />; }
export function Groceries() { return <Market kind="groceries" />; }
