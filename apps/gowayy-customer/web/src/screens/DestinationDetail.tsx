import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Mountain, CalendarDays, Clock3, MapPin, Accessibility, CarFront, BedDouble,
  UtensilsCrossed, ShoppingBasket, Ticket, Sparkles, ArrowRight, ShieldCheck,
} from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { formatINR } from '@gowayy/shared-utils';
import { haversineKm } from '@gowayy/location-engine';
import { usePageMeta } from '../lib/guards';
import { ImageFrame, SectionHead, EmptyState } from '../components/ui';
import { MapView } from '../components/MapView';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';
import { ConnectedRecommendations, useDestinations } from './shared';

export function DestinationDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const destinations = useDestinations();
  const destination = destinations.find((d) => d.slug === slug);
  const patch = useJourney((s) => s.patch);
  const showToast = useUI((s) => s.showToast);
  usePageMeta(destination ? `${destination.name} — stays, food & transport` : 'Destination', destination?.description);

  if (!destination) return <EmptyState title="Destination not found" body="This destination is not in the catalogue." action={<Link className="btn btn--primary" to="/explore">Explore destinations</Link>} />;

  const attractions = catalogue.attractions.filter((a) => a.destinationId === destination.id);
  const stays = catalogue.properties.filter((p) => p.destinationId === destination.id);
  const restaurants = catalogue.restaurants.filter((r) => r.destinationId === destination.id);
  const stores = catalogue.groceryStores.filter((s) => s.destinationId === destination.id);
  const packages = catalogue.tourPackages.filter((p) => p.destinationId === destination.id);
  const experiences = catalogue.experiences.filter((e) => e.destinationId === destination.id);
  const nearPlaces = catalogue.places.filter((p) => p.locality === destination.name);
  const bagdogra = catalogue.places.find((p) => p.id === 'plc_bagdogra');
  const siliguri = catalogue.places.find((p) => p.id === 'plc_siliguri');
  const km = (place?: { lat: number; lng: number }) => place ? Math.round(haversineKm(place, destination.coords) * 1.35) : null;
  const cabRoutes = catalogue.sharedTaxiRoutes.filter((r) => nearPlaces.some((p) => p.id === r.fromId || p.id === r.toId));
  const nearbyDestinations = destinations.filter((d) => d.id !== destination.id && !d.hiddenGem && haversineKm(d.coords, destination.coords) < 45).slice(0, 4);

  const connect = async (href: string, label: string) => {
    try { await patch({ destinationId: destination.id, dropoff: nearPlaces[0]?.id ?? null, title: `My ${destination.name} trip` }); }
    catch { /* offline: continue */ }
    showToast(`Journey set to ${destination.name} — ${label}`, 'success');
    navigate(href);
  };

  return (
    <div className="destination-page">
      <button className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}><ArrowLeft size={16} aria-hidden="true" /> Back</button>

      <section className="destination-hero">
        <div className="destination-hero__media">{destination.images[0] && <ImageFrame asset={destination.images[0]} variant="hero" showCredit />}</div>
        <div className="destination-hero__body">
          <div className="eyebrow">{destination.hiddenGem ? 'Off the usual route' : 'Destination'} · {destination.region}</div>
          <h1>{destination.name}</h1>
          <p className="muted">{destination.description}</p>
          <div className="row row--wrap" style={{ gap: 10, marginTop: 16 }}>
            <button className="btn btn--primary" onClick={() => void connect('/hotels', 'stays')}><BedDouble size={17} /> Find a stay</button>
            <button className="btn btn--secondary" onClick={() => void connect('/cabs', 'transport')}><CarFront size={17} /> Book transport</button>
          </div>
          <div className="row row--wrap tiny muted" style={{ gap: 14, marginTop: 14 }}>
            {km(bagdogra) && <span className="row" style={{ gap: 4 }}><MapPin size={12} /> ~{km(bagdogra)} km from Bagdogra Airport</span>}
            {km(siliguri) && <span className="row" style={{ gap: 4 }}><MapPin size={12} /> ~{km(siliguri)} km from Siliguri</span>}
            <span className="row" style={{ gap: 4 }}><Clock3 size={12} /> {destination.estimatedVisitHours ?? '—'} h suggested</span>
          </div>
        </div>
      </section>

      <section className="section grid-4">
        <div className="card card--flat"><Mountain size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value">{destination.elevationM ? `${destination.elevationM} m` : 'Not verified'}</span><span className="stat__label">Elevation</span></div></div>
        <div className="card card--flat"><CalendarDays size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value" style={{ fontSize: 14 }}>{destination.bestSeason ?? 'Not specified'}</span><span className="stat__label">Best season</span></div></div>
        <div className="card card--flat"><MapPin size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value" style={{ fontSize: 12, fontFamily: 'var(--gw-mono)' }}>{destination.coords.lat.toFixed(3)}, {destination.coords.lng.toFixed(3)}</span><span className="stat__label">{destination.coordinateAccuracy} coordinates</span></div></div>
        <div className="card card--flat"><Accessibility size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value" style={{ fontSize: 13 }}>{destination.accessibility?.slice(0, 46) ?? 'Not verified'}</span><span className="stat__label">Accessibility</span></div></div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Stay here" title={`Hotels & homestays in ${destination.name}`} action={<Link className="btn btn--secondary btn--sm" to="/hotels">All stays <ArrowRight size={14} /></Link>} />
        <div className="grid-3">
          {stays.map((p) => (
            <Link key={p.id} to={`/hotels/${p.id}?journey=${destination.id}`} className="card card--pad0 card--hover">
              {p.image && <ImageFrame asset={p.image} variant="16-9" />}
              <div className="listing-card__body">
                <div className="between"><strong>{p.name}</strong><span className="badge">{p.propertyType}</span></div>
                <p className="small muted">{p.amenities.slice(0, 3).join(' · ')}</p>
                <p className="small" style={{ marginTop: 8, fontWeight: 700 }}>from {formatINR(Math.min(...p.rooms.map((r) => r.nightlyRatePaise)))} / night</p>
              </div>
            </Link>
          ))}
          {stays.length === 0 && <p className="small muted">No stays are listed here yet.</p>}
        </div>
      </section>

      <section className="section grid-2 home-two-col">
        <div>
          <SectionHead eyebrow="Eat" title="Restaurants & food delivery" action={<Link className="btn btn--secondary btn--sm" to="/food">All food <ArrowRight size={14} /></Link>} />
          <div className="list">
            {restaurants.map((r) => (
              <Link key={r.id} to={`/food/${r.id}`} className="list-row">
                <UtensilsCrossed size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" />
                <span className="list-row__body"><span className="list-row__title">{r.name}</span><span className="list-row__sub">{r.cuisines.join(' · ')} · {r.openingHours}</span></span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
            {restaurants.length === 0 && <p className="small muted">No restaurants listed yet.</p>}
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Stock up" title="Grocery & local stores" action={<Link className="btn btn--secondary btn--sm" to="/groceries">All stores <ArrowRight size={14} /></Link>} />
          <div className="list">
            {stores.map((s) => (
              <Link key={s.id} to={`/groceries/${s.id}`} className="list-row">
                <ShoppingBasket size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" />
                <span className="list-row__body"><span className="list-row__title">{s.name}</span><span className="list-row__sub">{s.products.length} products · {s.deliveryCoverageKm} km delivery</span></span>
                <ArrowRight size={15} aria-hidden="true" />
              </Link>
            ))}
            {stores.length === 0 && <p className="small muted">No stores listed yet.</p>}
          </div>
        </div>
      </section>

      <section className="section grid-2 home-two-col">
        <div>
          <SectionHead eyebrow="Sightseeing" title="Tour packages" action={<Link className="btn btn--secondary btn--sm" to="/packages">See all <ArrowRight size={14} /></Link>} />
          <div className="list">
            {packages.map((p) => (
              <Link key={p.id} to={`/packages?offering=${p.id}`} className="list-row">
                <Ticket size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" />
                <span className="list-row__body"><span className="list-row__title">{p.name}</span><span className="list-row__sub">{p.durationHours} h · {p.includes.slice(0, 2).join(', ')}</span></span>
                <span className="small">{formatINR(p.pricePaise)}</span>
              </Link>
            ))}
            {packages.length === 0 && <p className="small muted">No packages listed yet.</p>}
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Local" title="Experiences" action={<Link className="btn btn--secondary btn--sm" to="/experiences">See all <ArrowRight size={14} /></Link>} />
          <div className="list">
            {experiences.map((e) => (
              <Link key={e.id} to={`/experiences?offering=${e.id}`} className="list-row">
                <Sparkles size={17} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" />
                <span className="list-row__body"><span className="list-row__title">{e.name}</span><span className="list-row__sub">{e.durationMinutes} min</span></span>
                <span className="small">{formatINR(e.pricePaise)}</span>
              </Link>
            ))}
            {experiences.length === 0 && <p className="small muted">No experiences listed yet.</p>}
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Getting here" title="Cabs & shared taxis" action={<Link className="btn btn--secondary btn--sm" to="/cabs">Book a cab <ArrowRight size={14} /></Link>} />
        <div className="grid-2">
          <div className="card">
            <div className="row" style={{ gap: 10 }}><CarFront size={18} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" /><strong>Private cab & airport transfer</strong></div>
            <p className="small muted" style={{ marginTop: 6 }}>Choose Bagdogra Airport or Siliguri as pickup, {destination.name} as destination.</p>
            <button className="btn btn--secondary btn--sm" style={{ marginTop: 12 }} onClick={() => void connect('/cabs', 'private cab')}>Plan this cab</button>
          </div>
          <div className="card">
            <div className="row" style={{ gap: 10 }}><CarFront size={18} style={{ color: 'var(--gw-champagne)' }} aria-hidden="true" /><strong>Shared taxi routes</strong></div>
            <div className="list" style={{ marginTop: 8 }}>
              {(cabRoutes.length ? cabRoutes : catalogue.sharedTaxiRoutes).slice(0, 3).map((r) => (
                <Link key={r.id} to={`/cabs?shared=${r.id}`} className="list-row">
                  <span className="list-row__body"><span className="list-row__title small">{catalogue.places.find((p) => p.id === r.fromId)?.name} → {catalogue.places.find((p) => p.id === r.toId)?.name}</span><span className="list-row__sub tiny muted">{r.stand} · {formatINR(r.pricePaise)} / seat</span></span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="See" title={`Attractions in ${destination.name}`} />
        <div className="grid-3">
          {attractions.map((a) => (
            <div key={a.id} className="card">
              <div className="between"><strong>{a.name}</strong><span className="badge">{a.category}</span></div>
              <p className="small muted" style={{ marginTop: 8 }}>{a.description}</p>
              <p className="tiny muted" style={{ marginTop: 10 }}>Typical visit {a.typicalVisitMinutes ?? '—'} min</p>
            </div>
          ))}
          {attractions.length === 0 && <p className="small muted">Attractions for this destination are still being verified.</p>}
        </div>
      </section>

      {destination.images.length > 1 && <section className="section">
        <SectionHead eyebrow="Gallery" title="Photographs" />
        <div className="grid-3">{destination.images.map((img, i) => <ImageFrame key={`${img.alt}-${i}`} asset={img} variant="4-3" showCredit />)}</div>
      </section>}

      <section className="section grid-2 home-two-col">
        <div className="card">
          <SectionHead eyebrow="Plan your visit" title="Good to know" />
          <div className="stack">
            <div><div className="eyebrow">Safety</div><p className="small muted" style={{ marginTop: 4 }}>{destination.safety}</p></div>
            <div><div className="eyebrow">Weather & season</div><p className="small muted" style={{ marginTop: 4 }}>{destination.weatherNote}</p></div>
            <div><div className="eyebrow">Accessibility</div><p className="small muted" style={{ marginTop: 4 }}>{destination.accessibility}</p></div>
            <div className="row tiny muted" style={{ gap: 6 }}><ShieldCheck size={13} /> General guidance, not an on-site audit.</div>
          </div>
        </div>
        <div>
          <SectionHead eyebrow="Map" title="Location & nearby pins" />
          <MapView pins={[{ id: destination.id, label: destination.name, ...destination.coords, kind: 'destination' },
            ...attractions.slice(0, 8).map((a) => ({ id: a.id, label: a.name, ...a.coords, kind: 'attraction' }))]} height={300} />
        </div>
      </section>

      {nearbyDestinations.length > 0 && <section className="section">
        <SectionHead eyebrow="Keep going" title="Nearby destinations" />
        <div className="h-scroll">
          {nearbyDestinations.map((d) => (
            <Link key={d.id} to={`/destinations/${d.slug}`} className="card card--pad0 card--hover" style={{ display: 'block' }}>
              {d.images[0] && <ImageFrame asset={d.images[0]} variant="16-9" />}
              <div style={{ padding: 14 }}><strong>{d.name}</strong><div className="tiny muted">{Math.round(haversineKm(d.coords, destination.coords))} km away</div></div>
            </Link>
          ))}
        </div>
      </section>}

      <section className="section">
        <SectionHead eyebrow="Everything in one place" title={`Book around ${destination.name}`} />
        <div className="grid-4">
          {[
            { label: 'Hotels', href: '/hotels', icon: BedDouble },
            { label: 'Restaurants', href: '/food', icon: UtensilsCrossed },
            { label: 'Groceries', href: '/groceries', icon: ShoppingBasket },
            { label: 'Tours', href: '/packages', icon: Ticket },
          ].map((x) => <button key={x.href} className="service-tile" onClick={() => void connect(x.href, x.label.toLowerCase())}><span className="service-tile__icon"><x.icon size={20} /></span>{x.label}</button>)}
        </div>
      </section>
    </div>
  );
}
