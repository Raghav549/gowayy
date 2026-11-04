import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BedDouble, CarFront, Compass, Leaf, Sparkles } from 'lucide-react';

const slides = [
  { key:'fresh', title:'Fresh finds, right to your door.', body:'Pick up the good things: market-fresh vegetables, pantry essentials and little everyday treats.', label:'FRESH FOOD & GROCERIES', icon:Leaf },
  { key:'ride', title:'A smoother way to get there.', body:'Find a local ride for the next stop, with your journey and plans all in one place.', label:'LOCAL RIDES, MADE EASY', icon:CarFront },
  { key:'stay', title:'Settle into somewhere lovely.', body:'Discover welcoming stays, thoughtful details and room for the moments in between.', label:'STAYS & GETAWAYS', icon:BedDouble },
  { key:'discover', title:'Find the places worth the trip.', body:'Explore real destinations, local guides and tucked-away corners at your own pace.', label:'DESTINATIONS & GUIDES', icon:Compass },
  { key:'local', title:'Make room for the local story.', body:'Meet the people, tastes and experiences that make every place its own.', label:'LOCAL EXPERIENCES', icon:Sparkles },
];

const artwork = [
  { src: 'groceries', alt: 'Fresh vegetables and fruit bob gently in a dimensional market basket.' },
  { src: 'local-cab', alt: 'A local car arrives while its passenger waves from the open window.' },
  { src: 'hotel-stay', alt: 'A welcoming hotel with softly moving curtains and a traveler’s bag.' },
  { src: 'himalayan-discovery', alt: 'A traveler walks along a trail between layered Himalayan peaks.' },
  { src: 'local-experience', alt: 'A local tea grower shares tea as steam curls above a warm cup.' },
];

function Artwork({ scene, reducedMotion }: { scene: number; reducedMotion: boolean }) {
  const item = artwork[scene];
  const filename = `${item.src}${reducedMotion ? '' : '-animated'}.webp`;
  return <img className="onboarding__art" src={`/images/onboarding/${filename}`} alt={item.alt} loading={scene === 0 ? 'eager' : 'lazy'} decoding="async" draggable={false} />;
}

export function Onboarding({ onFinish }: { onFinish: () => void }) {
  const [reducedMotion, setReducedMotion] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener?.('change', update);
    return () => query.removeEventListener?.('change', update);
  }, []);
  const [index, setIndex] = useState(0);
  const startX = useRef<number | null>(null);
  const slide = slides[index];
  const next = () => { if (index < slides.length - 1) setIndex(index + 1); else onFinish(); };
  const prev = () => setIndex((n) => Math.max(0, n - 1));
  const Icon = slide.icon;
  return <div className="onboarding" onPointerDown={(event) => { startX.current = event.clientX; }} onPointerUp={(event) => {
    if (startX.current === null) return;
    const delta = event.clientX - startX.current;
    if (delta < -60) next(); else if (delta > 60) prev();
    startX.current = null;
  }}>
    <div className="onboarding__top"><div className="onboarding__brand"><img src="/brand/g-symbol.svg" alt="" /><span>GOWAYY</span></div><button className="onboarding__skip" onClick={onFinish}>Skip</button></div>
    <div className="onboarding__stage"><div className="onboarding__slide" key={slide.key}>
      <div className={`onboarding__scene onboarding__scene--${slide.key}`}><Artwork scene={index} reducedMotion={reducedMotion} /><div className="onboarding__scene-chip"><Icon size={15}/>{slide.label}</div></div>
      <div className="onboarding__copy"><span className="eyebrow">{String(index + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}</span><h1>{slide.title}</h1><p>{slide.body}</p></div>
    </div></div>
    <div className="onboarding__bottom"><button className="onboarding__back" onClick={prev} disabled={index === 0} aria-label="Previous page"><ArrowLeft size={19}/></button>
      <div className="onboarding__dots" role="tablist" aria-label="Onboarding pages">{slides.map((item, i) => <button key={item.key} role="tab" className={i === index ? 'on' : ''} onClick={() => setIndex(i)} aria-label={`Go to ${item.label}`} aria-selected={i === index}/>)}</div>
      <button className="onboarding__next" onClick={next}>{index === slides.length - 1 ? 'Get started' : 'Continue'}<ArrowRight size={18}/></button>
    </div>
  </div>;
}
