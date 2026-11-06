import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

export interface Poster {
  id: string;
  kind: 'food' | 'grocery';
  title: string;
  subtitle?: string;
  cta?: string;
  href: string;
  image?: { path?: string; alt?: string } | null;
}

/**
 * One poster carousel panel. Posters are image-first promotional slides managed
 * from the admin console; the text below the image is only an accessible
 * description, never a replacement for the artwork.
 */
export function PosterCarousel({ title, posters, ctaTo, ctaLabel }: {
  title: string;
  posters: Poster[];
  ctaTo: string;
  ctaLabel: string;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (paused || posters.length < 2) return;
    timer.current = window.setInterval(() => setIndex((i) => (i + 1) % posters.length), 6500);
    return () => { if (timer.current) window.clearInterval(timer.current); };
  }, [paused, posters.length]);

  useEffect(() => { if (index >= posters.length) setIndex(0); }, [index, posters.length]);

  if (!posters.length) return null;
  const active = posters[index] ?? posters[0];

  return (
    <section className="poster-panel" aria-label={title}
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)} onTouchEnd={() => setPaused(false)}>
      <div className="poster-panel__head">
        <h3>{title}</h3>
        <Link className="btn btn--secondary btn--sm" to={ctaTo}>{ctaLabel} <ArrowRight size={13} aria-hidden="true" /></Link>
      </div>
      <div className="poster-panel__viewport">
        <div className="poster-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {posters.map((p) => {
            const src = p.image?.path;
            return (
              <Link key={p.id} to={p.href} className="poster" aria-label={`${p.title}${p.subtitle ? ` — ${p.subtitle}` : ''}`}>
                {src ? (
                  <img src={src} alt={p.image?.alt ?? `${p.title} promotional poster`} loading="lazy" decoding="async" />
                ) : (
                  <div className="poster__fallback"><strong>{p.title}</strong><span>{p.subtitle}</span></div>
                )}
              </Link>
            );
          })}
        </div>
        {posters.length > 1 && (
          <>
            <button type="button" className="poster-arrow poster-arrow--prev" aria-label={`Previous ${title} poster`} onClick={() => setIndex((i) => (i - 1 + posters.length) % posters.length)}><ChevronLeft size={17} /></button>
            <button type="button" className="poster-arrow poster-arrow--next" aria-label={`Next ${title} poster`} onClick={() => setIndex((i) => (i + 1) % posters.length)}><ChevronRight size={17} /></button>
            <div className="poster-dots">
              {posters.map((p, i) => <button key={p.id} type="button" className={i === index ? 'is-active' : ''} aria-label={`Show poster ${i + 1}`} onClick={() => setIndex(i)} />)}
            </div>
          </>
        )}
      </div>
      <p className="visually-hidden" aria-live="polite">{active?.title}</p>
    </section>
  );
}
