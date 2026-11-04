import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, X, ArrowRight, MapPin, BedDouble, UtensilsCrossed, ShoppingBasket, Sparkles,
  Ticket, CarFront, Store, BadgePercent, Clock,
} from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { formatINR } from '@gowayy/shared-utils';
import { client } from '../lib/client';
import { useJourney } from '../store/useJourney';
import { useSession } from '../store/useSession';
import { usePageMeta } from '../lib/guards';
import { ImageFrame, SectionHead, Spinner } from '../components/ui';
import { CategoryArt, CATEGORY_ART } from '../components/CategoryArt';
import { DestinationCard } from './shared';
import { PosterCarousel, type Poster } from '../components/PosterCarousel';

interface StorefrontBanner { id: string; title: string; subtitle?: string; href: string; image?: { assetPath?: string; thumbPath?: string; alt?: string } | null }
interface StorefrontProduct { id: string; slug: string; name: string; brand?: string; category?: string; storeId?: string; images?: Array<{ status: string; path?: string; alt: string; assetPath?: string }>; variants?: Array<{ pricePaise: number; mrpPaise?: number }> }
interface StorefrontStore { id: string; name: string; categoryName?: string; address?: string; deliveryCoverageKm?: number; openingHours?: string; openingHoursVerified?: boolean; image?: { status: string; assetPath?: string; alt: string; path?: string } | null; logo?: { path?: string; alt?: string } | null; banner?: { path?: string; alt?: string } | null; productCount?: number }
interface StorefrontOffer { id: string; title: string; kind: string; value: number; code?: string | null; minOrderPaise?: number }
interface Storefront {
  banners: StorefrontBanner[]; categories: Array<{ id: string; name: string; slug: string }>;
  stores: StorefrontStore[]; featuredProducts: StorefrontProduct[]; newProducts: StorefrontProduct[];
  offers: StorefrontOffer[];
  posters?: { grocery?: Poster[]; food?: Poster[] };
}

const FALLBACK: Storefront = {
  banners: catalogue.destinations.filter((d) => d.images[0]).slice(0, 3).map((d) => ({ id: d.id, title: d.name, subtitle: d.bestSeason ?? '', href: `/destinations/${d.slug}`, image: d.images[0] })),
  categories: [], stores: [], featuredProducts: [], newProducts: [], offers: [], posters: { grocery: [], food: [] },
};

export function Home() {
  usePageMeta('GOWAYY — one journey for travel, stays, food and local shops', 'Book cabs, stays, food, groceries, tourism and local experiences across the Darjeeling Himalaya.');
  const navigate = useNavigate();
  const journey = useJourney((s) => s.journey);
  const ensureJourney = useJourney((s) => s.ensure);
  const user = useSession((s) => s.user);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [slide, setSlide] = useState(0);
  const [paused, setPaused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void ensureJourney().catch(() => { /* offline: catalogue still renders */ }); }, [ensureJourney]);

  const storefrontQuery = useQuery({
    queryKey: ['storefront'],
    queryFn: async () => ((await client.storefront?.()) ?? FALLBACK) as unknown as Storefront,
    staleTime: 60_000,
    placeholderData: FALLBACK,
  });
  const storefront = storefrontQuery.data ?? FALLBACK;
  const posters = useQuery({
    queryKey: ['home-posters'],
    queryFn: async () => ((await client.posters?.()) ?? { items: [], food: [], grocery: [] }) as unknown as { food: Poster[]; grocery: Poster[] },
    staleTime: 30_000,
  });
  const allProducts = useQuery({
    queryKey: ['home-products'],
    queryFn: async () => (await client.commerceProducts()).items as Array<{ id: string; slug: string; name: string; brand: string; category: string; storeId: string; images?: Array<{ status: string; path?: string; assetPath?: string; alt: string }>; variants: Array<{ pricePaise: number; stock: number; mrpPaise?: number }> }>,
    staleTime: 60_000,
  });
  const hits = useQuery({ queryKey: ['home-search', query], queryFn: () => client.search(query), enabled: query.trim().length > 1 });
  const recentSearches = useQuery({ queryKey: ['recent-searches'], queryFn: () => client.recentSearches(), enabled: Boolean(user) });

  const activeDestination = journey?.destinationId ? catalogue.destinations.find((d) => d.id === journey.destinationId) : null;
  const destinationId = activeDestination?.id ?? 'dst_darjeeling';
  const inDestination = (id: string | null | undefined) => id === destinationId;

  const banners = storefront.banners.length ? storefront.banners : FALLBACK.banners;
  useEffect(() => {
    if (paused || banners.length < 2) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % banners.length), 6000);
    return () => window.clearInterval(t);
  }, [banners.length, paused]);
  useEffect(() => { if (slide >= banners.length) setSlide(0); }, [banners.length, slide]);

  const nearbyHotels = catalogue.properties.filter((p) => inDestination(p.destinationId)).slice(0, 4);
  const nearbyRestaurants = catalogue.restaurants.filter((r) => inDestination(r.destinationId)).slice(0, 3);
  const nearbyStores = catalogue.groceryStores.filter((s) => inDestination(s.destinationId)).slice(0, 3);
  const destinations = catalogue.destinations.filter((d) => !d.hiddenGem).slice(0, 8);
  const experiences = catalogue.experiences.filter((e) => inDestination(e.destinationId)).slice(0, 3);
  const packages = catalogue.tourPackages.filter((p) => inDestination(p.destinationId)).slice(0, 3);
  const productList = allProducts.data ?? [];
  const shopStores: StorefrontStore[] = (storefront.stores.length
    ? storefront.stores
    : nearbyStores.map((s) => ({ id: s.id, name: s.name, categoryName: 'Grocery', address: undefined, deliveryCoverageKm: s.deliveryCoverageKm, openingHoursVerified: false, image: s.image, productCount: s.products.length })))
    .filter((s) => (s.productCount ?? 0) > 0)
    .slice(0, 4);
  const foodProducts = useMemo(() => productList.filter((p) => ['local foods', 'snacks & beverages', 'dairy & eggs', 'local himalayan'].some((c) => p.category.toLowerCase().includes(c)) && p.images?.some((i) => i.status !== 'unavailable' && (i.path || i.assetPath))).slice(0, 8), [productList]);
  const popularFood = useMemo(() => [...foodProducts].sort((a, b) => (a.variants?.[0]?.pricePaise ?? 0) - (b.variants?.[0]?.pricePaise ?? 0)).slice(0, 6), [foodProducts]);
  const groceryPosters = posters.data?.grocery?.length ? posters.data.grocery : (storefront.posters?.grocery ?? []);
  const foodPosters = posters.data?.food?.length ? posters.data.food : (storefront.posters?.food ?? []);
  const submitSearch = () => {
    const term = query.trim();
    if (!term) { inputRef.current?.focus(); return; }
    if (hits.data?.[0]) navigate(hits.data[0].href);
    else navigate(`/search?q=${encodeURIComponent(term)}`);
  };

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__copy">
          <div className="eyebrow">Good to see you{user ? `, ${user.firstName}` : ''}</div>
          <h1>Where to next?</h1>
          <p className="muted">Plan a Darjeeling Himalaya journey — stays, cabs, food and local shops in one place.</p>
        </div>

        <div className="search-field" role="search">
          <Search size={18} aria-hidden="true" className="search-field__icon" />
          <input
            ref={inputRef}
            className="search-field__input"
            type="search"
            value={query}
            placeholder="Search destinations, hotels, shops, dishes…"
            aria-label="Search GOWAYY"
            autoComplete="off"
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 160)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); if (e.key === 'Escape') setFocused(false); }}
          />
          {query && <button type="button" className="search-field__clear" aria-label="Clear search" onClick={() => { setQuery(''); inputRef.current?.focus(); }}><X size={16} /></button>}
          <button type="button" className="search-field__submit" onClick={submitSearch}>Search</button>

          {focused && query.trim().length > 1 && (
            <div className="search-suggestions" role="listbox" aria-label="Search suggestions">
              {hits.isLoading && <div className="search-suggestions__state"><Spinner label="Searching…" /></div>}
              {hits.isError && <div className="search-suggestions__state small">Search is unavailable right now. Try again in a moment.</div>}
              {hits.data?.length === 0 && <div className="search-suggestions__state small muted">No matches yet — try a destination, dish or shop.</div>}
              {hits.data?.slice(0, 6).map((h) => (
                <button key={`${h.kind}-${h.id}`} type="button" className="search-suggestion" onClick={() => navigate(h.href)}>
                  <Search size={14} aria-hidden="true" />
                  <span className="search-suggestion__body"><span className="search-suggestion__title">{h.title}</span><span className="search-suggestion__sub">{h.subtitle}</span></span>
                  <span className="badge">{h.kind.replace(/_/g, ' ')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="home-hero__chips">
          {(recentSearches.data?.items.length ? recentSearches.data.items.slice(0, 4) : ['Darjeeling', 'Mirik', 'Momos', 'Homestay']).map((term) => (
            <Link key={term} className="chip" to={`/search?q=${encodeURIComponent(term)}`}><Clock size={12} aria-hidden="true" />{term}</Link>
          ))}
        </div>
      </section>

      {banners.length > 0 && (
        <section className="banner-carousel" aria-label="Featured offers"
          onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
          onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}>
          <div className="banner-carousel__track" style={{ transform: `translateX(-${slide * 100}%)` }}>
            {banners.map((b) => (
              <Link key={b.id} to={b.href} className="banner">
                <div className="banner__media">
                  {b.image?.assetPath ? <img src={`/${b.image.assetPath.replace(/^\//, '')}`} alt={b.image.alt ?? b.title} loading="lazy" decoding="async" /> : <div className="banner__media-fallback" aria-hidden="true" />}
                </div>
                <div className="banner__body"><strong>{b.title}</strong>{b.subtitle && <span>{b.subtitle}</span>}<span className="banner__cta">Explore <ArrowRight size={13} aria-hidden="true" /></span></div>
              </Link>
            ))}
          </div>
          <div className="banner-carousel__dots">
            {banners.map((b, i) => <button key={b.id} className={`banner-carousel__dot ${i === slide ? 'is-active' : ''}`} aria-label={`Show slide ${i + 1}`} onClick={() => setSlide(i)} />)}
          </div>
        </section>
      )}

      <section className="section home-categories" aria-labelledby="cat-heading">
        <h2 id="cat-heading" className="visually-hidden">Services</h2>
        <div className="category-grid">
          {CATEGORY_ART.map((c) => (
            <Link key={c.key} to={c.to} className="category-tile">
              <CategoryArt kind={c.key} />
              <span>{c.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {(groceryPosters.length > 0 || foodPosters.length > 0) && (
        <section className="section offers-duo" aria-labelledby="offers-heading">
          <h2 id="offers-heading" className="visually-hidden">Running offers</h2>
          <PosterCarousel title="Grocery offers" posters={groceryPosters} ctaTo="/groceries" ctaLabel="Shop all" />
          <PosterCarousel title="Food offers" posters={foodPosters} ctaTo="/food" ctaLabel="See all" />
        </section>
      )}

      <section className="section">
        <SectionHead eyebrow={`Near ${activeDestination?.name ?? 'Darjeeling'}`} title="Popular destinations" action={<Link className="link" to="/explore">Explore all →</Link>} />
        <div className="h-scroll">{destinations.map((d) => <DestinationCard key={d.id} destination={d} />)}</div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Verified stays" title="Recommended hotels & homestays" action={<Link className="link" to="/hotels">All stays →</Link>} />
        <div className="grid-3">
          {nearbyHotels.map((p) => (
            <Link key={p.id} to={`/hotels/${p.id}`} className="card card--pad0 card--hover listing-card">
              {p.image && <ImageFrame asset={p.image} variant="16-9" />}
              <div className="listing-card__body">
                <div className="between"><strong>{p.name}</strong><span className="badge">{p.propertyType}</span></div>
                <div className="small muted">{p.amenities.slice(0, 3).join(' · ')}</div>
                <div className="row small" style={{ gap: 6, marginTop: 8 }}><BedDouble size={14} aria-hidden="true" /> from {formatINR(Math.min(...p.rooms.map((r) => r.nightlyRatePaise)))} / night</div>
              </div>
            </Link>
          ))}
          {nearbyHotels.length === 0 && <p className="small muted">No stays listed for this destination yet.</p>}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Local kitchens" title="Food from hill stores" action={<Link className="link" to="/food">All food →</Link>} />
        <div className="grid-3">
          {foodProducts.slice(0, 3).map((p) => {
            const img = p.images?.find((i) => i.status !== 'unavailable' && (i.path || i.assetPath));
            return (
              <Link key={p.id} to={`/products/${p.slug}`} className="media-card">
                <div className="media-card__media">
                  {img ? <img src={img.path ?? `/${String(img.assetPath ?? '').replace(/^\//, '')}`} alt={img.alt || p.name} loading="lazy" decoding="async" /> : <div className="media-card__fallback">Photo coming soon</div>}
                </div>
                <div className="media-card__body">
                  <strong className="media-card__title">{p.name}</strong>
                  <span className="tiny muted">{p.brand} · {p.category}</span>
                  <span className="media-card__price">{formatINR(p.variants?.[0]?.pricePaise ?? 0)}</span>
                </div>
              </Link>
            );
          })}
          {foodProducts.length === 0 && <p className="small muted">Local kitchens have not published dishes yet.</p>}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Everyday needs" title="Grocery & convenience stores near you" action={<Link className="link" to="/groceries">All stores →</Link>} />
        <div className="grid-3">
          {nearbyStores.map((s) => (
            <Link key={s.id} to={`/groceries/${s.id}`} className="card card--hover">
              <div className="row" style={{ gap: 12 }}>
                <span className="store-avatar" aria-hidden="true"><ShoppingBasket size={20} /></span>
                <div style={{ minWidth: 0 }}><strong>{s.name}</strong><div className="tiny muted">Delivers within {s.deliveryCoverageKm} km</div></div>
              </div>
              <div className="mini-dishes">{s.products.slice(0, 3).map((p) => <span key={p.id}>{p.name} · {formatINR(p.pricePaise)}</span>)}</div>
            </Link>
          ))}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Shop" title={shopStores.length ? 'Shops & their products' : 'Local shops'} subtitle="Browse a store and add its actual products to your cart." action={<Link className="link" to="/categories">Open Shop →</Link>} />
        {storefrontQuery.isLoading && <Spinner label="Loading shops…" />}
        <div className="grid-2 store-grid">
          {shopStores.map((s) => {
            const products = productList.filter((p) => p.storeId === s.id).slice(0, 3);
            const fallbackProducts = catalogue.marketplaceProducts.filter((p) => p.storeId === s.id).slice(0, 3);
            const list = products.length ? products : fallbackProducts.map((p) => ({ ...p, category: p.category, brand: p.brand, storeId: s.id }));
            return (
              <article className="card store-card store-card--brand" key={s.id}>
                <div className="store-card__banner">
                  {s.banner?.path ? <img src={s.banner.path} alt={s.banner.alt ?? `${s.name} shopfront`} loading="lazy" decoding="async" /> : <div className="store-card__banner-fallback" aria-hidden="true" />}
                </div>
                <div className="store-card__identity">
                  <span className="store-card__logo" aria-hidden="true">
                    {s.logo?.path ? <img src={s.logo.path} alt="" loading="lazy" decoding="async" /> : <Store size={20} />}
                  </span>
                  <div className="store-card__titles">
                    <strong>{s.name}</strong>
                    <span className="tiny muted">{s.categoryName}{s.address ? ` · ${s.address}` : ''}</span>
                  </div>
                  <Link className="btn btn--secondary btn--sm store-card__visit" to={`/categories?store=${encodeURIComponent(s.id)}`}>Visit store</Link>
                </div>
                <div className="store-card__meta tiny muted">
                  <span className="row" style={{ gap: 4 }}><MapPin size={11} /> Delivers within {s.deliveryCoverageKm ?? 0} km</span>
                  <span>{s.openingHoursVerified && s.openingHours ? s.openingHours : 'Opening hours not verified'}</span>
                  <span>{s.productCount ?? list.length} products</span>
                </div>
                {list.length > 0 && (
                  <div className="store-products store-products--images">
                    {list.map((p) => {
                      const img = ((p.images ?? []) as Array<{ status?: string; path?: string; assetPath?: string }>).find((i) => i.status !== 'unavailable' && (i.path || i.assetPath));
                      return (
                        <Link key={p.id} className="store-product" to={`/products/${p.slug}`}>
                          <span className="store-product__thumb">
                            {img ? <img src={img.path ?? `/${String(img.assetPath ?? '').replace(/^\//, '')}`} alt="" loading="lazy" decoding="async" /> : <Store size={16} aria-hidden="true" />}
                          </span>
                          <span className="store-product__body">
                            <span className="store-product__name">{p.name}</span>
                            <span className="store-product__price">{formatINR(p.variants?.[0]?.pricePaise ?? 0)}</span>
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Most ordered" title="Popular food items" action={<Link className="link" to="/food">Order food →</Link>} />
        <div className="food-grid">
          {popularFood.map((p) => {
            const img = p.images?.find((i) => i.status !== 'unavailable' && (i.path || i.assetPath));
            return (
              <Link key={p.id} to={`/products/${p.slug}`} className="food-card">
                <div className="food-card__media">
                  {img ? <img src={img.path ?? `/${String(img.assetPath ?? '').replace(/^\//, '')}`} alt={img.alt || p.name} loading="lazy" decoding="async" /> : <div className="food-card__fallback"><UtensilsCrossed size={22} aria-hidden="true" /><span>Photo coming soon</span></div>}
                </div>
                <div className="food-card__body">
                  <strong className="food-card__name">{p.name}</strong>
                  <span className="tiny muted food-card__store">{storefront.stores.find((s) => s.id === p.storeId)?.name ?? p.brand}</span>
                  <span className="food-card__price">{formatINR(p.variants?.[0]?.pricePaise ?? 0)}</span>
                </div>
              </Link>
            );
          })}
          {popularFood.length === 0 && <p className="small muted">No food listings yet. Partner kitchens publish dishes from the Partner app.</p>}
        </div>
      </section>

      <section className="section grid-2 home-two-col">
        <div>
          <SectionHead eyebrow="Do something local" title="Local experiences" action={<Link className="link" to="/experiences">All →</Link>} />
          <div className="experience-grid">
            {experiences.map((e) => {
              const dest = catalogue.destinations.find((d) => d.id === e.destinationId);
              const img = dest?.images.find((i) => i.status === 'verified');
              return (
                <Link key={e.id} to={`/experiences?offering=${e.id}`} className="experience-card">
                  <div className="experience-card__media">
                    {img ? <img src={`/${String(img.assetPath ?? '').replace(/^\//, '')}`} alt={img.alt} loading="lazy" decoding="async" /> : <div className="experience-card__fallback"><Sparkles size={22} aria-hidden="true" /></div>}
                  </div>
                  <div className="experience-card__body">
                    <strong>{e.name}</strong>
                    <span className="tiny muted">{dest?.name ?? 'Darjeeling'} · {e.durationMinutes} min</span>
                    <span className="small">{formatINR(e.pricePaise)}</span>
                  </div>
                </Link>
              );
            })}
            {experiences.length === 0 && <p className="small muted">No experiences listed here yet.</p>}
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Curated" title="Tour packages" action={<Link className="link" to="/packages">All →</Link>} />
          <div className="list">
            {packages.map((p) => (
              <Link key={p.id} to={`/packages?offering=${p.id}`} className="list-row">
                <Ticket size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" />
                <span className="list-row__body"><span className="list-row__title">{p.name}</span><span className="list-row__sub">{p.durationHours} h · {p.includes.slice(0, 2).join(', ')}</span></span>
                <span className="small">{formatINR(p.pricePaise)}</span>
              </Link>
            ))}
            {packages.length === 0 && <p className="small muted">No packages listed here yet.</p>}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Getting around" title="Available transport" action={<Link className="link" to="/cabs">Book a cab →</Link>} />
        <div className="grid-3">
          <Link to="/cabs" className="card card--hover transport-card"><CarFront size={20} aria-hidden="true" /><div><strong>Private cabs</strong><span className="small muted">Airport transfers, outstation & tourist taxis</span></div></Link>
          <Link to="/cabs?tab=shared" className="card card--hover transport-card"><CarFront size={20} aria-hidden="true" /><div><strong>Shared taxis</strong><span className="small muted">Fixed routes, per-seat fares from designated stands</span></div></Link>
          <Link to="/parcels" className="card card--hover transport-card"><MapPin size={20} aria-hidden="true" /><div><strong>Parcels</strong><span className="small muted">Send small parcels across the hills</span></div></Link>
        </div>
      </section>
    </div>
  );
}
