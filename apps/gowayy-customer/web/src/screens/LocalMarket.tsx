import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { BadgePercent, MapPin, Package, Search, Store, UtensilsCrossed, ShoppingBasket, X } from 'lucide-react';
import { formatINR } from '@gowayy/shared-utils';
import { client } from '../lib/client';
import { EmptyState, ImageFrame, SectionHead } from '../components/ui';
import { apiErrorText, usePageMeta } from '../lib/guards';
import { useServiceArea } from '../store/useServiceArea';

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
  const [focused, setFocused] = useState(false);
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const navigate = useNavigate();
  const pincode = useServiceArea((s) => s.pincode);
  const setPincode = useServiceArea((s) => s.setPincode);
  const categories = useQuery({ queryKey: ['commerce-categories'], queryFn: () => client.commerceCategories() });
  const products = useQuery({ queryKey: ['market-products', kind], queryFn: () => client.commerceProducts() });
  const stores = useQuery({ queryKey: ['commerce-stores'], queryFn: () => client.recommendedStores() });
  const coverage = useQuery({
    queryKey: ['service-coverage', pincode],
    queryFn: () => client.serviceAreaCheck?.(pincode) as unknown as Promise<{ pincode: string; food: { supported: boolean; cities: string[] }; grocery: { supported: boolean; cities: string[] } }>,
    enabled: pincode.length === 6,
    staleTime: 60_000,
  });
  const supported = kind === 'food' ? coverage.data?.food.supported : coverage.data?.grocery.supported;
  const checked = pincode.length === 6 && coverage.isSuccess;

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

  const suggestions = useMemo(() => {
    const term = text.trim().toLowerCase();
    if (term.length < 1) return [] as Array<{ id: string; title: string; subtitle: string; href: string; kind: string }>;
    const products: Array<{ id: string; title: string; subtitle: string; href: string; kind: string }> = scoped
      .filter((p) => `${p.name} ${p.brand} ${p.category} ${(p.tags ?? []).join(' ')}`.toLowerCase().includes(term))
      .slice(0, 5)
      .map((p) => ({ id: p.id, title: p.name, subtitle: `${p.category} · ${formatINR(p.variants?.[0]?.pricePaise ?? 0)}`, href: `/products/${p.slug}`, kind: 'product' }));
    const shops = ((stores.data?.items as StoreView[] | undefined) ?? [])
      .filter((s) => `${s.name} ${s.categoryName ?? ''}`.toLowerCase().includes(term))
      .slice(0, 3)
      .map((s) => ({ id: s.id, title: s.name, subtitle: s.categoryName ?? 'Store', href: `/categories?store=${s.id}`, kind: 'store' }));
    return [...products, ...shops];
  }, [text, scoped, stores.data]);

  const storeList = ((stores.data?.items as StoreView[] | undefined) ?? [])
    .filter((s) => kind === 'groceries' || cfg.match.some((m) => (s.categoryName ?? '').toLowerCase().includes(m.split(' ')[0])))
    .filter((s) => s.productCount > 0)
    .slice(0, 6);

  const Icon = cfg.icon;
  const unavailable = checked && supported === false;
  return (
    <div className="stack">
      <SectionHead eyebrow={cfg.eyebrow} title={cfg.title} subtitle={cfg.blurb} />

      <div className="service-pincode" role="group" aria-label="Check delivery PIN code">
        <MapPin size={17} aria-hidden="true" />
        <div className="service-pincode__copy">
          <strong>Deliver to PIN code</strong>
          <span className="tiny muted">{checked ? (supported ? `Available in ${(kind === 'food' ? coverage.data?.food.cities : coverage.data?.grocery.cities)?.join(', ')}` : `${kind === 'food' ? 'Food' : 'Grocery'} delivery is not available at ${pincode} yet`) : 'Enter your 6-digit PIN code to check this service.'}</span>
        </div>
        <input className="input service-pincode__input" inputMode="numeric" maxLength={6} value={pincode} aria-label="PIN code"
          onChange={(e) => setPincode(e.target.value)} placeholder="734101" />
        {checked && <span className={`badge ${supported ? 'badge--success' : 'badge--danger'}`}>{supported ? 'Available' : 'Unavailable'}</span>}
      </div>

      {unavailable && (
        <EmptyState title="Service unavailable in your area"
          body={`We do not deliver ${kind === 'food' ? 'food' : 'groceries'} to ${pincode} yet. Try another PIN code or browse the Shop.`}
          action={<Link className="btn btn--secondary" to="/categories">Browse Shop</Link>} />
      )}

      {!unavailable && <div className="search-field" role="search">
        <Search size={18} aria-hidden="true" className="search-field__icon" />
        <input className="search-field__input" type="search" value={text} placeholder={`Search ${kind === 'food' ? 'food, tea, honey' : 'groceries, essentials'}…`}
          aria-label={`Search ${cfg.title}`} autoComplete="off"
          aria-expanded={focused && text.trim().length > 0}
          aria-controls="market-suggestions"
          onFocus={() => setFocused(true)}
          onBlur={() => window.setTimeout(() => setFocused(false), 150)}
          onChange={(e) => { setText(e.target.value); setActiveSuggestion(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActiveSuggestion((i) => Math.min(i + 1, Math.max(0, suggestions.length - 1))); }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActiveSuggestion((i) => Math.max(i - 1, 0)); }
            if (e.key === 'Enter' && suggestions[activeSuggestion]) { e.preventDefault(); navigate(suggestions[activeSuggestion].href); }
            if (e.key === 'Escape') setFocused(false);
          }}
        />
        {text && <button type="button" className="search-field__clear" aria-label="Clear search" onClick={() => setText('')}><X size={16} /></button>}
        {focused && text.trim().length > 0 && (
          <div className="search-suggestions" id="market-suggestions" role="listbox" aria-label={`${cfg.title} suggestions`}>
            {suggestions.length === 0 && <div className="search-suggestions__state small muted">No {kind === 'food' ? 'dishes or kitchens' : 'products or stores'} match “{text}”.</div>}
            {suggestions.map((s, i) => (
              <button key={`${s.kind}-${s.id}`} type="button" role="option" aria-selected={i === activeSuggestion} className={`search-suggestion ${i === activeSuggestion ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveSuggestion(i)} onClick={() => navigate(s.href)}>
                <Search size={14} aria-hidden="true" />
                <span className="search-suggestion__body"><span className="search-suggestion__title">{s.title}</span><span className="search-suggestion__sub">{s.subtitle}</span></span>
                <span className="badge">{s.kind}</span>
              </button>
            ))}
          </div>
        )}
      </div>}

      {!unavailable && <div className="chips">
        <button className={`chip ${!category ? 'chip--active' : ''}`} onClick={() => setCategory('')}>All</button>
        {categoryNames.map(([name, count]) => (
          <button key={name} className={`chip ${category === name ? 'chip--active' : ''}`} onClick={() => setCategory(name)}>{name} · {count}</button>
        ))}
      </div>}

      {!unavailable && products.isError && <div className="notice notice--info" role="alert">Products could not be loaded. {apiErrorText(products.error)}</div>}

      {!unavailable && storeList.length > 0 && (
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

      {!unavailable && <section>
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
      </section>}

      <div className="card card--flat row between row--wrap">
        <div><div className="eyebrow">Run a kitchen or store?</div><p className="small muted" style={{ marginTop: 4 }}>Publish your menu, categories and offers from the GOWAYY Partner app; orders arrive verified.</p></div>
        <Link to="/support" className="btn btn--secondary btn--sm">Partner support</Link>
      </div>
    </div>
  );
}

export function Food() { return <Market kind="food" />; }
export function Groceries() { return <Market kind="groceries" />; }
