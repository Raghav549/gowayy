import { useParams, Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Mountain, CalendarDays, Clock3, MapPin, ShieldCheck, Accessibility, CarFront, BedDouble, UtensilsCrossed, ArrowRight } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { usePageMeta } from '../lib/guards';
import { ImageFrame, SectionHead, EmptyState } from '../components/ui';
import { ConnectedRecommendations, DataNotice } from './shared';
import { MapView } from '../components/MapView';
import { useJourney } from '../store/useJourney';
import { useUI } from '../store/useUI';

export function DestinationDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const destination = catalogue.destinations.find((d) => d.slug === slug);
  const patch = useJourney((s) => s.patch);
  const showToast = useUI((s) => s.showToast);
  usePageMeta(destination?.name ?? 'Destination', destination?.description);
  if (!destination) return <EmptyState title="Destination not found" body="This destination is not in the catalogue." action={<Link className="btn btn--primary" to="/explore">Explore destinations</Link>} />;

  const attractions = catalogue.attractions.filter((a) => a.destinationId === destination.id);
  const places = catalogue.places.filter((p) => p.locality === destination.name);
  const connect = async (href: string) => {
    await patch({ destinationId: destination.id, dropoff: places[0]?.id ?? null, title: `My ${destination.name} trip` });
    showToast(`Journey context set to ${destination.name}`, 'success');
    navigate(href);
  };

  return (
    <div>
      <button className="btn btn--ghost btn--sm" onClick={() => navigate(-1)}><ArrowLeft size={16} /> Back</button>
      <div style={{ marginTop: 12 }}>
        {destination.images[0] && <ImageFrame asset={destination.images[0]} variant="hero" showCredit />}
      </div>
      <div className="between row--wrap" style={{ marginTop: 22 }}>
        <div>
          <div className="eyebrow">{destination.hiddenGem ? 'Hidden gem · community reference' : 'Destination'}</div>
          <h1 style={{ marginTop: 6 }}>{destination.name}</h1>
          <p className="muted" style={{ marginTop: 8, maxWidth: 620 }}>{destination.description}</p>
        </div>
        <button className="btn btn--primary" onClick={() => void connect('/cabs')}>Plan this trip <ArrowRight size={17} /></button>
      </div>

      <section className="section grid-4">
        <div className="card card--flat"><Mountain size={17} style={{ color: 'var(--gw-champagne)' }} /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value">{destination.elevationM ? `${destination.elevationM} m` : 'Not verified'}</span><span className="stat__label">Elevation{destination.elevationVerified ? '' : ' (unverified)'}</span></div></div>
        <div className="card card--flat"><CalendarDays size={17} style={{ color: 'var(--gw-champagne)' }} /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value" style={{ fontSize: 15 }}>{destination.bestSeason ?? 'Not specified'}</span><span className="stat__label">Best visiting season</span></div></div>
        <div className="card card--flat"><Clock3 size={17} style={{ color: 'var(--gw-champagne)' }} /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value">{destination.estimatedVisitHours ?? '—'} h</span><span className="stat__label">Estimated visit</span></div></div>
        <div className="card card--flat"><MapPin size={17} style={{ color: 'var(--gw-champagne)' }} /><div className="stat" style={{ marginTop: 8 }}><span className="stat__value" style={{ fontSize: 13, fontFamily: 'var(--gw-mono)' }}>{destination.coords.lat.toFixed(4)}, {destination.coords.lng.toFixed(4)}</span><span className="stat__label">{destination.coordinateAccuracy} coordinates</span></div></div>
      </section>

      <section className="section grid-2">
        <div className="card">
          <SectionHead eyebrow="Plan your visit" title="What to do" />
          <div className="chips">{destination.activities.map((a) => <span className="chip active" key={a} style={{ cursor: 'default' }}>{a}</span>)}</div>
          <div className="divider" />
          <div className="stack">
            <div><div className="eyebrow">Accessibility</div><p className="small muted" style={{ marginTop: 5 }}>{destination.accessibility}</p></div>
            <div><div className="eyebrow">Safety</div><p className="small muted" style={{ marginTop: 5 }}>{destination.safety}</p></div>
            <div><div className="eyebrow">Weather</div><p className="small muted" style={{ marginTop: 5 }}>{destination.weatherNote}</p></div>
          </div>
        </div>
        <div className="card">
          <SectionHead eyebrow="Sources" title="Information status" />
          <p className="small muted">{destination.infoStatus === 'published-reference' ? 'Geography from published references.' : 'Community reference; details pending verification.'} {destination.dataSourceNote}</p>
          <div className="stack" style={{ marginTop: 14 }}>
            {destination.sources.map((s) => <a key={s} className="link small" href={s} target="_blank" rel="noreferrer">{s}</a>)}
          </div>
          <div className="divider" />
          <div className="row small"><ShieldCheck size={15} /> No live weather provider is configured in this build.</div>
          <div className="row small"><Accessibility size={15} /> Accessibility details are general guidance, not an on-site audit.</div>
        </div>
      </section>

      {destination.images.length > 1 && <section className="section">
        <SectionHead eyebrow="Gallery" title="Verified photographs" />
        <div className="grid-3">{destination.images.map((img, i) => <ImageFrame key={i} asset={img} variant="4-3" showCredit />)}</div>
      </section>}

      <section className="section">
        <SectionHead eyebrow="Attractions" title={`Places in ${destination.name}`} subtitle="Only records present in the catalogue are listed." />
        <div className="grid-3">
          {attractions.map((a) => <Link key={a.id} to={`/tourism?attraction=${a.id}`} className="card card--hover">
            <div className="between"><strong>{a.name}</strong><span className="badge">{a.category}</span></div>
            <p className="small muted" style={{ marginTop: 8 }}>{a.description}</p>
            <p className="tiny muted" style={{ marginTop: 10 }}>Typical visit: {a.typicalVisitMinutes ?? '—'} min · {a.infoStatus === 'community-reference' ? 'community reference' : 'published reference'}</p>
          </Link>)}
          {attractions.length === 0 && <p className="small muted">No attraction records for this destination yet.</p>}
        </div>
      </section>

      <section className="section">
        <SectionHead eyebrow="Map" title="Location & nearby pins" />
        <MapView pins={[{ id: destination.id, label: destination.name, ...destination.coords, kind: 'destination' },
          ...attractions.slice(0, 8).map((a) => ({ id: a.id, label: a.name, ...a.coords, kind: 'attraction' }))]} height={340} />
      </section>

      <section className="section">
        <SectionHead eyebrow="Complete your journey" title={`Book around ${destination.name}`} subtitle="Open any service without re-entering the destination." />
        <div className="grid-4">
          {[
            { label: 'Airport pickup / cab', href: '/cabs', icon: CarFront },
            { label: 'Hotels & homestays', href: '/hotels', icon: BedDouble },
            { label: 'Restaurants', href: '/food', icon: UtensilsCrossed },
            { label: 'Sightseeing', href: '/packages', icon: Mountain },
          ].map((x) => <button key={x.href} className="service-tile" onClick={() => void connect(x.href)}><span className="service-tile__icon"><x.icon size={21} /></span>{x.label}</button>)}
        </div>
      </section>

      <ConnectedRecommendations destinationId={destination.id} title={`Connected services in ${destination.name}`} />
      <DataNotice />
    </div>
  );
}
