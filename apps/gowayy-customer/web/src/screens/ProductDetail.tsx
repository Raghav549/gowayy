import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Heart, Minus, Plus, ShieldCheck, Truck, BadgePercent, Store, ChevronLeft, ChevronRight } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store/useUI';
import { formatINR } from '@gowayy/shared-utils';
import { MascotState, PageSkeleton } from '../components/Mascot';
import { SectionHead } from '../components/ui';

interface VariantView { id: string; label: string; pricePaise: number; mrpPaise: number; stock: number; discountPercent: number }
interface ProductView {
  id: string; slug: string; brand: string; name: string; category: string; dataClass: string;
  rating: { average: number; count: number; source: string } | null;
  highlights: string[]; description: string;
  specifications: Array<{ label: string; value: string }>; inTheBox: string[]; warranty?: string;
  faq: Array<{ q: string; a: string }>;
  images: Array<{ status: string; path?: string; assetPath?: string; alt: string; verificationNote?: string; credit?: string }>;
  variants: VariantView[];
  protectionPlans: Array<{ id: string; provider: string; demo?: boolean; title: string; pricePaise: number; coverage: string[]; terms: string }>;
  relatedProducts: Array<{ id: string; slug: string; name: string; brand: string; pricePaise: number; dataClass: string }>;
  deliveryNote: string; tags?: string[];
  store?: { id: string; name: string; address?: string; openingHours?: string } | null;
  offers?: Array<{ id: string; title: string; code?: string | null; kind: string; value: number }>;
}

function Collapse({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapse">
      <button type="button" className="collapse__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{title}</strong>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="collapse__body">{children}</div>}
    </div>
  );
}

function imageSrc(image?: { path?: string; assetPath?: string }) {
  if (!image) return null;
  if (image.path) return image.path;
  if (image.assetPath) return `/${image.assetPath.replace(/^\//, '')}`;
  return null;
}

export function ProductDetail() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [variantId, setVariantId] = useState('');
  const [qty, setQty] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);
  const touchX = useRef<number | null>(null);

  const q = useQuery({ queryKey: ['product', slug], queryFn: () => client.productDetail(slug) });
  useEffect(() => {
    if (!q.data) return;
    const p = q.data.product as ProductView;
    setVariantId(p.variants.find((v) => v.stock > 0)?.id ?? p.variants[0]?.id ?? '');
    setGalleryIdx(0);
    void client.recordProductView(slug).catch(() => undefined);
  }, [q.data, slug]);

  const product = q.data?.product as ProductView | undefined;
  const variant = useMemo(() => product?.variants.find((v) => v.id === variantId) ?? product?.variants[0], [product, variantId]);

  const addToCart = useMutation({
    mutationFn: () => client.addToCart({ productId: product!.id, variantId: variant!.id, quantity: qty, protectionPlanId: planId }),
    onSuccess: async () => { showToast('Added to cart', 'success'); await qc.invalidateQueries({ queryKey: ['cart'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const buyNow = useMutation({
    mutationFn: async () => {
      await client.addToCart({ productId: product!.id, variantId: variant!.id, quantity: qty, protectionPlanId: planId });
      await qc.invalidateQueries({ queryKey: ['cart'] });
      navigate(`/checkout?step=address&product=${encodeURIComponent(product!.id)}&variant=${encodeURIComponent(variant!.id)}&qty=${qty}`);
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const wish = useMutation({
    mutationFn: () => client.addToWishlist(product!.id),
    onSuccess: () => showToast('Saved to wishlist', 'success'),
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (q.isLoading) return <PageSkeleton />;
  if (!product) return <MascotState pose="error-retry" title="Product unavailable" body="This product could not be loaded. It may have been removed by the store." action={<Link className="btn btn--primary" to="/categories">Browse shops</Link>} />;

  const images = (product.images ?? []).filter((i) => imageSrc(i)).slice(0, 5);
  const activeImage = images[galleryIdx] ?? images[0];

  return (
    <div className="stack pdp-page">
      <div className="crumbs small muted">
        <Link className="link" to="/categories">Shop</Link> / <Link className="link" to={`/categories?c=${encodeURIComponent(product.category)}`}>{product.category}</Link> / <span>{product.brand}</span>
      </div>

      <div className="pdp">
        <div className="pdp__media">
          <div
            className="pdp__gallery card card--pad0"
            onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
            onTouchEnd={(e) => {
              if (touchX.current == null || images.length < 2) return;
              const delta = e.changedTouches[0].clientX - touchX.current;
              if (Math.abs(delta) > 40) setGalleryIdx((i) => (i + (delta < 0 ? 1 : -1) + images.length) % images.length);
              touchX.current = null;
            }}
          >
            {activeImage ? (
              <img src={imageSrc(activeImage) ?? ''} alt={activeImage.alt} className="pdp__image" />
            ) : (
              <div className="image-placeholder pdp__placeholder" role="img" aria-label={`${product.name} photograph coming soon`}>
                <img className="image-placeholder__mark" src="/brand/g-mono-inverse.svg" alt="" />
                <div className="image-placeholder__text">Photograph coming soon</div>
                <div className="tiny muted">The store has not uploaded a photo yet.</div>
              </div>
            )}
            {images.length > 1 && (
              <>
                <button type="button" className="gallery-nav gallery-nav--prev" aria-label="Previous image" onClick={() => setGalleryIdx((i) => (i - 1 + images.length) % images.length)}><ChevronLeft size={18} /></button>
                <button type="button" className="gallery-nav gallery-nav--next" aria-label="Next image" onClick={() => setGalleryIdx((i) => (i + 1) % images.length)}><ChevronRight size={18} /></button>
                <span className="gallery-count">{galleryIdx + 1} / {images.length}</span>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="pdp__thumbs">
              {images.map((img, i) => (
                <button key={`${img.alt}-${i}`} type="button" className={`pdp__thumb ${i === galleryIdx ? 'is-active' : ''}`} onClick={() => setGalleryIdx(i)} aria-label={`Show image ${i + 1}`}>
                  <img src={imageSrc(img) ?? ''} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="pdp__info">
          <div className="between"><span className="eyebrow">{product.brand}</span>{product.dataClass === 'verified-listing' && <span className="badge badge--success">Verified listing</span>}</div>
          <h1 className="pdp__title">{product.name}</h1>
          {product.store && <div className="row small muted" style={{ gap: 6, marginTop: 6 }}><Store size={14} aria-hidden="true" /> {product.store.name}{product.store.address ? ` · ${product.store.address}` : ''}</div>}

          <div className="pdp__price-row">
            <strong className="pdp__price">{variant ? formatINR(variant.pricePaise) : '—'}</strong>
            {variant && variant.mrpPaise > variant.pricePaise && <span className="pdp__mrp">{formatINR(variant.mrpPaise)}</span>}
            {variant && variant.discountPercent > 0 && <span className="badge badge--success"><BadgePercent size={12} /> {variant.discountPercent}% off</span>}
          </div>
          <p className="small" style={{ color: (variant?.stock ?? 0) > 0 ? 'var(--gw-success)' : 'var(--gw-danger)' }}>
            {variant ? (variant.stock > 0 ? `In stock · ${variant.stock} available` : 'Currently out of stock') : 'Choose an option'}
          </p>

          {(product.offers ?? []).length > 0 && (
            <div className="pdp__offers">
              {product.offers!.map((o) => <span className="badge badge--accent" key={o.id}><BadgePercent size={11} /> {o.title}{o.code ? ` · ${o.code}` : ''}</span>)}
            </div>
          )}

          {product.variants.length > 1 && (
            <div className="stack" style={{ gap: 8 }}>
              <span className="label">Choose an option</span>
              <div className="chips">
                {product.variants.map((v) => (
                  <button key={v.id} type="button" className={`chip ${variant?.id === v.id ? 'chip--active' : ''}`} disabled={v.stock === 0} onClick={() => setVariantId(v.id)}>
                    {v.label}{v.stock === 0 ? ' · out of stock' : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="pdp__qty">
            <span className="label">Quantity</span>
            <div className="qty-control">
              <button type="button" onClick={() => setQty((n) => Math.max(1, n - 1))} aria-label="Decrease quantity"><Minus size={15} /></button>
              <span aria-live="polite">{qty}</span>
              <button type="button" onClick={() => setQty((n) => Math.min(variant?.stock ?? 1, n + 1))} aria-label="Increase quantity"><Plus size={15} /></button>
            </div>
          </div>

          <div className="pdp__actions">
            <button className="btn btn--secondary" disabled={!variant || variant.stock === 0 || addToCart.isPending} onClick={() => addToCart.mutate()}>{addToCart.isPending ? 'Adding…' : 'Add to cart'}</button>
            <button className="btn btn--primary" disabled={!variant || variant.stock === 0 || buyNow.isPending} onClick={() => buyNow.mutate()}>{buyNow.isPending ? 'Starting…' : 'Buy now'}</button>
            <button className="btn btn--ghost icon-only" aria-label="Save product" onClick={() => wish.mutate()}><Heart size={18} /></button>
          </div>

          <div className="pdp__trust">
            <span className="row" style={{ gap: 6 }}><Truck size={14} /> {product.deliveryNote}</span>
            <span className="row" style={{ gap: 6 }}><ShieldCheck size={14} /> Secure payment · server-verified</span>
          </div>
        </div>
      </div>

      <div className="grid-2 pdp__details">
        <div className="card">
          <SectionHead eyebrow="About" title="Product details" />
          <p className="small muted">{product.description}</p>
          {product.highlights.length > 0 && <ul className="pdp__highlights">{product.highlights.map((h) => <li key={h}>{h}</li>)}</ul>}
        </div>
        <div className="card">
          <SectionHead eyebrow="Specifications" title="At a glance" />
          <div className="spec-table">
            {product.specifications.map((s) => <div className="spec-table__row" key={s.label}><span>{s.label}</span><strong>{s.value}</strong></div>)}
            {product.specifications.length === 0 && <p className="small muted">The store has not added specifications yet.</p>}
          </div>
          {product.inTheBox.length > 0 && <><div className="divider" /><div className="eyebrow">In the box</div><p className="small">{product.inTheBox.join(' · ')}</p></>}
        </div>
      </div>

      {product.protectionPlans.length > 0 && (
        <section className="section">
          <SectionHead eyebrow="Optional" title="Protection plans" />
          <div className="grid-3">
            <button type="button" className={`card ${planId === null ? 'card--selected' : ''}`} onClick={() => setPlanId(null)}><strong>No plan</strong><p className="small muted">Buy the product on its own.</p></button>
            {product.protectionPlans.map((plan) => (
              <button type="button" key={plan.id} className={`card ${planId === plan.id ? 'card--selected' : ''}`} onClick={() => setPlanId(plan.id)}>
                <div className="between"><strong>{plan.title}</strong><span className="badge">{formatINR(plan.pricePaise)}</span></div>
                <p className="small muted">{plan.terms}</p>
              </button>
            ))}
          </div>
        </section>
      )}

      {product.faq.length > 0 && (
        <section className="section">
          <SectionHead eyebrow="Questions" title="Frequently asked" />
          {product.faq.map((f) => <Collapse key={f.q} title={f.q}><p className="small muted">{f.a}</p></Collapse>)}
        </section>
      )}

      {product.relatedProducts.length > 0 && (
        <section className="section">
          <SectionHead eyebrow="Related" title="You may also like" />
          <div className="grid-3">
            {product.relatedProducts.map((r) => (
              <Link key={r.id} to={`/products/${r.slug}`} className="card card--hover">
                <span className="tiny product-brand">{r.brand}</span>
                <p className="small" style={{ marginTop: 4 }}>{r.name}</p>
                <p style={{ marginTop: 8, fontWeight: 700 }}>{formatINR(r.pricePaise)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="pdp-stickybar">
        <div className="pdp-stickybar__price">{variant ? formatINR(variant.pricePaise) : ''}
          {variant && variant.mrpPaise > variant.pricePaise && <span className="tiny muted" style={{ textDecoration: 'line-through', marginLeft: 6 }}>{formatINR(variant.mrpPaise)}</span>}
        </div>
        <button className="btn btn--secondary btn--sm" disabled={!variant || variant.stock === 0 || addToCart.isPending} onClick={() => addToCart.mutate()}>Add to cart</button>
        <button className="btn btn--primary btn--sm" disabled={!variant || variant.stock === 0 || buyNow.isPending} onClick={() => buyNow.mutate()}>Buy now</button>
      </div>
    </div>
  );
}
