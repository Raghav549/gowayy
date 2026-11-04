import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Search, CarFront, BedDouble, UtensilsCrossed, ShoppingBasket, Mountain, Sparkles, Ticket, Package, ArrowRight, MapPin,
} from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { formatINR } from '@gowayy/shared-utils';
import { client } from '../lib/client';
import { useJourney } from '../store/useJourney';
import { useSession } from '../store/useSession';
import { usePageMeta } from '../lib/guards';
import { ImageFrame, SectionHead, DemoBanner } from '../components/ui';
import { DestinationCard, useCatalog, ConnectedRecommendations, DataNotice, DemoListingBadge, JourneyQuickStart } from './shared';
import { MapView } from '../components/MapView';

const SERVICES = [
  { to: '/cabs', label: 'Cabs', icon: CarFront }, { to: '/hotels', label: 'Hotels', icon: BedDouble },
  { to: '/food', label: 'Food', icon: UtensilsCrossed }, { to: '/groceries', label: 'Groceries', icon: ShoppingBasket },
  { to: '/tourism', label: 'Tourism', icon: Mountain }, { to: '/experiences', label: 'Experiences', icon: Sparkles },
  { to: '/packages', label: 'Packages', icon: Ticket }, { to: '/parcels', label: 'Parcels', icon: Package },
];

export function Home() {
  usePageMeta('Connected Journeys', 'Book cabs, stays, food, groceries, tourism, experiences and parcel delivery across the Darjeeling Himalaya with one connected journey.');
  const navigate = useNavigate();
  const journey = useJourney((s) => s.journey);
  const ensureJourney = useJourney((s) => s.ensure);
  const [query, setQuery] = useState('');
  const [focused, setFocused] = useState(false);
  const [slide, setSlide] = useState(0);
  const user = useSession((s) => s.user);
  const { isLoading: catalogLoading } = useCatalog();
  const recent = useQuery({ queryKey: ['recently-viewed'], queryFn: () => client.recentlyViewedProducts(), enabled: Boolean(user) });
  const hits = useQuery({ queryKey: ['home-search', query], queryFn: () => client.search(query), enabled: query.trim().length > 1 });

  useEffect(() => { void ensureJourney().catch(() => { /* offline */ }); }, [ensureJourney]);

  const slides = catalogue.destinations.filter((d) => d.images.length > 0 && !d.hiddenGem).slice(0, 4);
  useEffect(() => {
    if (slides.length < 2) return;
    const t = window.setInterval(() => setSlide((s) => (s + 1) % slides.length), 5000);
    return () => window.clearInterval(t);
  }, [slides.length]);

  const recentItems = (recent.data?.items ?? []) as Array<{ slug: string; name: string; brand?: string; pricePaise?: number; image?: unknown }>;

  const activeDestination = journey?.destinationId ? catalogue.destinations.find((d) => d.id === journey.destinationId) : null;
  const destinationId = activeDestination?.id ?? 'dst_darjeeling';
  const inDestination = (id: string) => id === destinationId;

  const submitSearch = () => { if (hits.data?.[0]) navigate(hits.data[0].href); else navigate(`/search?q=${encodeURIComponent(query)}`); };

  return (
    <div>
      <section className="hero">
        <div className="hero__content">
          <div className="eyebrow">Travel · Transport · Local commerce</div>
          <h1>Where would you like to go?</h1>
          <p>One account for cabs, stays, food, groceries, sightseeing and parcels — connected by a single journey.</p>
          <div className="hero__search" style={{ position: 'relative' }}>
            <Search size={19} color="var(--gw-text-muted)" />
            <input aria-label="Universal search" placeholder="Try “Darjeeling”, “momos” or “airport”" value={query}
              onChange={(e) => setQuery(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => window.setTimeout(() => setFocused(false), 160)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitSearch(); }} />
            <button className="btn btn--primary" onClick={submitSearch}>Search</button>
            {focused && query.trim().length > 1 && (
              <div className="hero__suggestions">
                {hits.isLoading && <div className="small muted" style={{ padding: 10 }}>Searching…</div>}
                {hits.data?.slice(0, 6).map((h) => <Link key={`${h.kind}-${h.id}`} to={h.href}><Search size={14} /><span className="list-row__body"><span className="list-row__title">{h.title}</span><span className="list-row__sub">{h.subtitle}</span></span><span className="badge">{h.kind}</span></Link>)}
                {hits.data?.length === 0 && <div className="small muted" style={{ padding: 10 }}>No matches yet.</div>}
              </div>
            )}
          </div>
          <div className="row row--wrap small muted" style={{ marginTop: 16, gap: 14 }}>
            <span>Popular:</span>
            {['Darjeeling', 'Mirik', 'Kalimpong', 'Sandakphu'].map((t) => <button key={t} className="link" onClick={() => setQuery(t)}>{t}</button>)}
          </div>
        </div>
      </section>

      {slides.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <div className="hero-carousel" aria-roledescription="carousel" aria-label="Featured destinations">
            <div className="hero-carousel__track" style={{ transform: `translateX(-${slide * 100}%)` }}>
              {slides.map((d) => (
                <Link key={d.id} to={`/destinations/${d.slug}`} className="hero-carousel__slide">
                  <ImageFrame asset={d.images[0]} variant="16-9" />
                  <div className="hero-carousel__caption"><strong>{d.name}</strong><span className="small">{d.description?.slice(0, 90)}</span></div>
                </Link>
              ))}
            </div>
            <div className="hero-carousel__dots">
              {slides.map((d, i) => <button key={d.id} className={`hero-carousel__dot ${i === slide ? 'hero-carousel__dot--active' : ''}`} aria-label={`Go to slide ${i + 1}`} onClick={() => setSlide(i)} />)}
            </div>
          </div>
        </section>
      )}

      {recentItems.length > 0 && (
        <section className="section" style={{ paddingTop: 0 }}>
          <SectionHead eyebrow="Picked up again" title="Still looking for these?" />
          <div className="h-scroll">
            {recentItems.slice(0, 8).map((p) => (
              <Link key={p.slug} to={`/products/${p.slug}`} className="card card--pad0 card--hover" style={{ display: 'block', minWidth: 180 }}>
                <div style={{ padding: 12 }}><strong className="small">{p.brand}</strong><p className="small" style={{ marginTop: 4 }}>{p.name}</p>
                  {p.pricePaise != null && <p style={{ marginTop: 6, fontWeight: 700 }}>{formatINR(p.pricePaise)}</p>}</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="section">
        <SectionHead eyebrow="Services" title="Everything for the journey" subtitle="Each service works on its own and shares the same journey context." />
        <div className="service-grid">
          {SERVICES.map((s) => (
            <Link key={s.to} to={s.to} className="service-tile"><span className="service-tile__icon"><s.icon size={21} /></span>{s.label}</Link>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="card card--flat">
          <div className="between row--wrap">
            <div>
              <div className="eyebrow">Journey context</div>
              <h3 style={{ marginTop: 4 }}>{journey?.title ?? 'Start a journey'}</h3>
              <p className="small muted" style={{ marginTop: 4 }}>
                {activeDestination ? `Destination: ${activeDestination.name}. Recommendations below stay connected to this trip.` : 'Pick a destination to connect stays, food, attractions and transport.'}
              </p>
            </div>
            {journey && <Link to={`/journey/${journey.id}`} className="btn btn--secondary">Open trip <ArrowRight size={16} /></Link>}
          </div>
          <div style={{ marginTop: 14 }}><JourneyQuickStart /></div>
        </div>
      </section>

      <ConnectedRecommendations destinationId={journey?.destinationId ?? null} />

      <section className="section">
        <SectionHead eyebrow="Discover" title="Popular destinations" subtitle="Verified geography; photographs only where the subject and licence were checked." action={<Link className="link" to="/explore">Explore all →</Link>} />
        <div className="h-scroll">
          {catalogue.destinations.filter((d) => !d.hiddenGem).slice(0, 8).map((d) => <DestinationCard key={d.id} destination={d} />)}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Off the usual route" title="Hidden gems" subtitle="Community-reference locations — coordinates are approximate. Verify locally before travel." action={<Link className="link" to="/explore">View details →</Link>} />
        <div className="h-scroll">
          {catalogue.destinations.filter((d) => d.hiddenGem).slice(0, 6).map((d) => <DestinationCard key={d.id} destination={d} />)}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow={`Near ${activeDestination?.name ?? 'Darjeeling'}`} title="Recommended hotels" action={<Link className="link" to="/hotels">All stays →</Link>} />
        <div className="h-scroll">
          {catalogue.properties.filter((p) => inDestination(p.destinationId)).slice(0, 4).map((p) => (
            <Link key={p.id} to={`/hotels/${p.id}`} className="card card--pad0 card--hover" style={{ display: 'block' }}>
              {p.image && <ImageFrame asset={p.image} variant="16-9" />}
              <div style={{ padding: 14 }}><div className="between"><strong>{p.name}</strong><DemoListingBadge /></div>
                <div className="small muted">{p.propertyType} · from {formatINR(Math.min(...p.rooms.map((r) => r.nightlyRatePaise)))} / night</div></div>
            </Link>
          ))}
          {catalogue.properties.filter((p) => inDestination(p.destinationId)).length === 0 && <div className="card"><p className="small muted">No seeded stays for this destination.</p></div>}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Eat local" title="Nearby restaurants" action={<Link className="link" to="/food">All restaurants →</Link>} />
        <div className="grid-3">
          {catalogue.restaurants.filter((r) => inDestination(r.destinationId)).slice(0, 3).map((r) => (
            <Link key={r.id} to={`/food/${r.id}`} className="card card--hover">
              <div className="between"><strong>{r.name}</strong><DemoListingBadge /></div>
              <p className="small muted" style={{ marginTop: 6 }}>{r.cuisines.join(' · ')} · {r.openingHours}</p>
              <p className="small" style={{ marginTop: 12 }}>{r.menu.slice(0, 2).map((m) => m.name).join(', ')}…</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="section grid-2">
        <div>
          <SectionHead eyebrow="Sightseeing" title="Tourist attractions" action={<Link className="link" to="/tourism">All →</Link>} />
          <div className="list">
            {catalogue.attractions.filter((a) => inDestination(a.destinationId)).slice(0, 4).map((a) => (
              <Link key={a.id} to={`/tourism?attraction=${a.id}`} className="list-row"><Mountain size={17} style={{ color: 'var(--gw-champagne)' }} /><span className="list-row__body"><span className="list-row__title">{a.name}</span><span className="list-row__sub">{a.category} · {a.typicalVisitMinutes} min</span></span><ArrowRight size={15} /></Link>
            ))}
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Do something local" title="Local experiences" action={<Link className="link" to="/experiences">All →</Link>} />
          <div className="list">
            {catalogue.experiences.filter((e) => inDestination(e.destinationId)).slice(0, 4).map((e) => (
              <Link key={e.id} to={`/experiences?offering=${e.id}`} className="list-row"><Sparkles size={17} style={{ color: 'var(--gw-champagne)' }} /><span className="list-row__body"><span className="list-row__title">{e.name}</span><span className="list-row__sub">{e.durationMinutes} min · {formatINR(e.pricePaise)}</span></span><ArrowRight size={15} /></Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section grid-2">
        <div>
          <SectionHead eyebrow="Getting around" title="Available taxi services" action={<Link className="link" to="/cabs">Book a cab →</Link>} />
          <div className="list">
            {catalogue.sharedTaxiRoutes.slice(0, 4).map((r) => (
              <Link key={r.id} to={`/cabs?shared=${r.id}`} className="list-row"><CarFront size={17} style={{ color: 'var(--gw-champagne)' }} /><span className="list-row__body"><span className="list-row__title">{catalogue.places.find((p) => p.id === r.fromId)?.name} → {catalogue.places.find((p) => p.id === r.toId)?.name}</span><span className="list-row__sub">{r.departureTimes.join(' · ')} · {formatINR(r.pricePaise)} / seat</span></span><ArrowRight size={15} /></Link>
            ))}
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Everyday needs" title="Grocery stores & popular food" />
          <div className="list">
            {catalogue.groceryStores.filter((s) => inDestination(s.destinationId)).slice(0, 2).map((s) => (
              <Link key={s.id} to={`/groceries/${s.id}`} className="list-row"><ShoppingBasket size={17} style={{ color: 'var(--gw-champagne)' }} /><span className="list-row__body"><span className="list-row__title">{s.name}</span><span className="list-row__sub">Independent inventory · {s.deliveryCoverageKm} km coverage</span></span></Link>
            ))}
            {catalogue.restaurants.flatMap((r) => r.menu).filter((m) => /momos|tea|thukpa/i.test(m.name)).slice(0, 2).map((m) => (
              <Link key={m.id} to={`/food/${m.restaurantId}`} className="list-row"><UtensilsCrossed size={17} style={{ color: 'var(--gw-champagne)' }} /><span className="list-row__body"><span className="list-row__title">{m.name}</span><span className="list-row__sub">{formatINR(m.pricePaise)} · demo menu</span></span></Link>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Map" title="Explore the region" subtitle="Offline schematic provider using published coordinates. Pins open destination pages." />
        <MapView pins={catalogue.destinations.map((d) => ({ id: d.id, label: d.name, lat: d.coords.lat, lng: d.coords.lng, kind: 'destination' }))}
          onSelect={(pin) => { const d = catalogue.destinations.find((x) => x.id === pin.id); if (d) navigate(`/destinations/${d.slug}`); }} height={380} />
        <div className="row tiny muted" style={{ marginTop: 8 }}><MapPin size={12} /> Hill-road distances are estimates; configure a directions provider for turn-by-turn routes.</div>
      </section>

      <DemoBanner>Backend: local development API (server-authoritative). OTP uses a labelled demo adapter; payments use a signed sandbox webhook. No live Supabase project is connected.</DemoBanner>
      <DataNotice />
      {catalogLoading && <p className="tiny muted" style={{ marginTop: 8 }}>Loading server catalogue…</p>}
    </div>
  );
}

export function SearchResults() {
  const params = new URLSearchParams(window.location.search);
  const q = params.get('q') ?? '';
  const hits = useQuery({ queryKey: ['search-page', q], queryFn: () => client.search(q), enabled: Boolean(q) });
  usePageMeta(`Search: ${q || 'all'}`);
  return (
    <div>
      <SectionHead eyebrow="Universal search" title={`Results for “${q}”`} subtitle="Destinations, stays, food, groceries, routes, packages and experiences." />
      {hits.isLoading && <p className="muted">Searching…</p>}
      {hits.data?.length === 0 && <div className="empty-state"><h3>No matches</h3><p>Try a destination, dish or service name.</p></div>}
      <div className="list">{hits.data?.map((h) => <Link key={`${h.kind}-${h.id}`} to={h.href} className="list-row"><span className="list-row__body"><span className="list-row__title">{h.title}</span><span className="list-row__sub">{h.subtitle}</span></span><span className="badge">{h.kind}</span></Link>)}</div>
    </div>
  );
}
