import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, ChevronDown, ChevronUp, Heart, Minus, Plus, ShieldCheck, Star, Truck, BadgePercent, Info } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store/useUI';
import { formatINR } from '@gowayy/shared-utils';
import { MascotState, PageSkeleton } from '../components/Mascot';
import { EmptyState, SectionHead } from '../components/ui';

interface VariantView { id: string; label: string; pricePaise: number; mrpPaise: number; stock: number; discountPercent: number }
interface ProductView {
  id: string; slug: string; brand: string; name: string; category: string; dataClass: string;
  rating: { average: number; count: number; source: string } | null;
  highlights: string[]; highlightsNote?: string; description: string;
  specifications: Array<{ label: string; value: string }>; inTheBox: string[]; warranty?: string;
  faq: Array<{ q: string; a: string }>; images: Array<{ status: string; alt: string; verificationNote?: string }>;
  variants: VariantView[]; protectionPlans: Array<{ id: string; provider: string; demo?: boolean; title: string; pricePaise: number; mrpPaise?: number; perMonthPaise?: number; coverage: string[]; terms: string; exclusions: string[] }>;
  relatedProducts: Array<{ id: string; slug: string; name: string; brand: string; pricePaise: number; image: unknown; dataClass: string }>;
  deliveryNote: string;
}

function Collapse({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="collapse">
      <button className="collapse__head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <strong>{title}</strong>{open ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
      </button>
      {open && <div className="collapse__body">{children}</div>}
    </div>
  );
}

export function ProductDetail() {
  const { slug = '' } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [variantId, setVariantId] = useState<string>('');
  const [qty, setQty] = useState(1);
  const [planId, setPlanId] = useState<string | null>(null);
  const [galleryIdx, setGalleryIdx] = useState(0);

  const q = useQuery({ queryKey: ['product', slug], queryFn: () => client.productDetail(slug) });
  useEffect(() => { if (q.data) { const p = q.data.product as ProductView; setVariantId(p.variants.find((v) => v.stock > 0)?.id ?? p.variants[0]?.id ?? ''); void client.recordProductView(slug); } }, [q.data, slug]);

  const product = q.data?.product as ProductView | undefined;
  const variant = useMemo(() => product?.variants.find((v) => v.id === variantId) ?? product?.variants[0], [product, variantId]);

  const addToCart = useMutation({
    mutationFn: () => client.addToCart({ productId: product!.id, variantId: variant!.id, quantity: qty, protectionPlanId: planId }),
    onSuccess: async () => { showToast('Added to cart'); await qc.invalidateQueries({ queryKey: ['cart'] }); },
    onError: (e: Error) => showToast(e.message),
  });
  const buyNow = useMutation({
    mutationFn: async () => {
      await client.addToCart({ productId: product!.id, variantId: variant!.id, quantity: qty, protectionPlanId: planId });
      navigate('/cart');
    },
    onError: (e: Error) => showToast(e.message),
  });
  const wish = useMutation({
    mutationFn: () => client.addToWishlist(product!.id),
    onSuccess: () => showToast('Saved to wishlist'),
    onError: (e: Error) => showToast(e.message),
  });

  if (q.isLoading) return <PageSkeleton />;
  if (!product) return <MascotState pose="error-retry" title="Product unavailable" body="This product could not be loaded. It may have been removed by the store." action={<Link className="btn btn--primary" to="/categories">Browse categories</Link>} />;

  return (
    <div className="stack">
      <div className="crumbs small muted"><Link className="link" to="/categories">Categories</Link> / <Link className="link" to={`/categories?c=${encodeURIComponent(product.category)}`}>{product.category}</Link> / <span>{product.brand}</span></div>
      <div className="pdp">
        <div>
          <div className="pdp__gallery card card--pad0">
            {product.images[0]?.status === 'verified' ? <img src="/placeholder" alt={product.images[0].alt} /> : (
              <div className="image-placeholder" role="img" aria-label={product.images[0]?.alt}>
                <img className="image-placeholder__mark" src="/brand/g-mono-inverse.png" alt="" />
                <div className="image-placeholder__text">Product image unavailable</div>
                <div className="tiny muted" style={{ maxWidth: 280 }}>{product.images[0]?.verificationNote}</div>
              </div>
            )}
          </div>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            {product.images.map((img, i) => (
              <button key={i} className={`thumb ${i === galleryIdx ? 'thumb--active' : ''}`} onClick={() => setGalleryIdx(i)} aria-label={`Image ${i + 1}`}>{i + 1}</button>
            ))}
          </div>
        </div>
        <div className="stack">
          <div className="small" style={{ color: 'var(--gw-champagne-deep)' }}><strong>Brand:</strong> {product.brand} {product.dataClass === 'demo-listing' && <span className="badge" style={{ marginLeft: 8 }}>Demo listing</span>}</div>
          <h1 style={{ fontSize: 22 }}>{product.name}</h1>
          {product.rating && (
            <div className="row" style={{ gap: 8 }}>
              <strong>{product.rating.average.toFixed(1)}</strong>
              <span className="row" style={{ gap: 1 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={15} fill={i <= Math.round(product.rating!.average) ? 'var(--gw-champagne)' : 'none'} color={i <= Math.round(product.rating!.average) ? 'var(--gw-champagne)' : 'var(--gw-muted-silver)'} />)}</span>
              <span className="small muted">({product.rating.count.toLocaleString('en-IN')} verified ratings)</span>
            </div>
          )}
          <div className="row" style={{ gap: 10, alignItems: 'baseline', flexWrap: 'wrap' }}>
            {variant && <><span style={{ fontSize: 30, fontWeight: 800 }}>{formatINR(variant.pricePaise)}</span>
              {variant.mrpPaise > variant.pricePaise && <><span className="muted" style={{ textDecoration: 'line-through' }}>{formatINR(variant.mrpPaise)}</span><span className="badge badge--success"><BadgePercent size={13} /> {variant.discountPercent}% off</span></>}
              <span className={variant.stock > 0 ? 'badge badge--success' : 'badge badge--danger'}>{variant.stock > 0 ? `In stock (${variant.stock})` : 'Out of stock'}</span></>}
          </div>
          <p className="small muted"><Truck size={14} style={{ verticalAlign: -2, marginRight: 4 }} />{product.deliveryNote}</p>

          {product.variants.length > 1 && (
            <div>
              <div className="eyebrow">Variant</div>
              <div className="row row--wrap" style={{ gap: 8, marginTop: 6 }}>
                {product.variants.map((v) => (
                  <button key={v.id} className={`variant ${v.id === variantId ? 'variant--active' : ''}`} onClick={() => setVariantId(v.id)} disabled={v.stock === 0}>
                    <strong>{v.label}</strong><span className="small">{formatINR(v.pricePaise)}</span>{v.stock === 0 && <span className="tiny muted">Out of stock</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="row" style={{ gap: 10, alignItems: 'center' }}>
            <span className="label">Quantity</span>
            <div className="qty">
              <button aria-label="Decrease quantity" onClick={() => setQty((x) => Math.max(1, x - 1))}><Minus size={15} /></button>
              <span>{qty}</span>
              <button aria-label="Increase quantity" onClick={() => setQty((x) => Math.min(variant?.stock ?? 10, x + 1))}><Plus size={15} /></button>
            </div>
          </div>

          <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
            <button className="btn btn--primary" style={{ flex: 1, minWidth: 180 }} disabled={!variant || variant.stock === 0 || addToCart.isPending} onClick={() => addToCart.mutate()}>{addToCart.isPending ? 'Adding…' : 'Add to cart'}</button>
            <button className="btn btn--accent" style={{ flex: 1, minWidth: 180 }} disabled={!variant || variant.stock === 0 || buyNow.isPending} onClick={() => buyNow.mutate()}>Buy now</button>
            <button className="btn btn--secondary" onClick={() => wish.mutate()} aria-label="Save to wishlist"><Heart size={17} /></button>
          </div>
        </div>
      </div>

      <section className="card">
        <h3 style={{ fontSize: 17 }}>Top highlights</h3>
        <ul className="ticks" style={{ marginTop: 10 }}>
          {product.highlights.map((h) => <li key={h}><Check size={15} /> {h}</li>)}
        </ul>
        {product.highlightsNote && <p className="tiny muted" style={{ marginTop: 8 }}><Info size={12} style={{ verticalAlign: -1 }} /> {product.highlightsNote}</p>}
      </section>

      <section className="card">
        <div className="eyebrow">Ask about this product</div>
        <div className="chips" style={{ marginTop: 8 }}>
          {product.faq.map((f) => <a key={f.q} className="chip" href={`#faq-${f.q.length}`}>{f.q}</a>)}
        </div>
      </section>

      {product.protectionPlans.length > 0 && (
        <section className="card">
          <h3 style={{ fontSize: 17 }}><ShieldCheck size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Optional protection</h3>
          <p className="small muted" style={{ marginTop: 4 }}>Only plans with real provider terms are shown. Review the terms before adding.</p>
          {product.protectionPlans.map((p) => (
            <div key={p.id} className={`plan ${planId === p.id ? 'plan--active' : ''}`} style={{ marginTop: 10 }}>
              <div className="between">
                <div><strong>{p.title}</strong> <span className="tiny muted">by {p.provider}{p.demo ? ' · demo plan' : ''}</span></div>
                <button className={`btn btn--sm ${planId === p.id ? 'btn--secondary' : 'btn--primary'}`} onClick={() => setPlanId(planId === p.id ? null : p.id)}>{planId === p.id ? 'Remove' : 'Add'}</button>
              </div>
              <div className="row" style={{ gap: 10, marginTop: 6 }}>
                <strong>{formatINR(p.pricePaise)}</strong>{p.mrpPaise && <span className="muted small" style={{ textDecoration: 'line-through' }}>{formatINR(p.mrpPaise)}</span>}{p.perMonthPaise && <span className="tiny muted">({formatINR(p.perMonthPaise)}/month)</span>}
              </div>
              <ul className="ticks small" style={{ marginTop: 8 }}>{p.coverage.map((c) => <li key={c}><Check size={13} /> {c}</li>)}</ul>
              <details style={{ marginTop: 8 }}><summary className="small link">Terms & exclusions</summary><p className="tiny muted" style={{ marginTop: 6 }}>{p.terms}</p><p className="tiny muted">Not covered: {p.exclusions.join('; ')}.</p></details>
            </div>
          ))}
        </section>
      )}

      <Collapse title="Product specifications" defaultOpen>
        <table className="spec-table"><tbody>{product.specifications.map((s) => <tr key={s.label}><td className="muted">{s.label}</td><td>{s.value}</td></tr>)}</tbody></table>
      </Collapse>
      <Collapse title="What's in the box"><ul className="ticks">{product.inTheBox.map((x) => <li key={x}><Check size={14} /> {x}</li>)}</ul></Collapse>
      {product.warranty && <Collapse title="Warranty details"><p className="small">{product.warranty}</p></Collapse>}
      <Collapse title="Frequently asked questions">
        {product.faq.map((f, i) => <div key={f.q} id={`faq-${f.q.length}`} style={{ marginBottom: 10 }}><strong className="small">{f.q}</strong><p className="small muted" style={{ marginTop: 4 }}>{f.a}</p></div>)}
        {product.faq.length === 0 && <p className="small muted">No questions yet for this product.</p>}
      </Collapse>

      {product.relatedProducts.length > 0 && (
        <section>
          <SectionHead eyebrow="Related products" title="Accessories and similar items" />
          <div className="grid-3">
            {product.relatedProducts.map((r) => (
              <Link key={r.id} to={`/products/${r.slug}`} className="card card--hover" style={{ display: 'block' }}>
                <div className="between"><strong className="small">{r.brand}</strong>{r.dataClass === 'demo-listing' && <span className="badge">Demo</span>}</div>
                <p className="small" style={{ marginTop: 6 }}>{r.name}</p>
                <p style={{ marginTop: 8, fontWeight: 700 }}>{formatINR(r.pricePaise)}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <div className="pdp-stickybar" aria-hidden="false">
        <div className="pdp-stickybar__price">{variant ? formatINR(variant.pricePaise) : ''}
          {variant && variant.mrpPaise > variant.pricePaise && <span className="tiny muted" style={{ textDecoration: 'line-through', marginLeft: 6 }}>{formatINR(variant.mrpPaise)}</span>}
        </div>
        <button className="btn btn--secondary" disabled={!variant || variant.stock === 0 || addToCart.isPending} onClick={() => addToCart.mutate()}>Add to cart</button>
        <button className="btn btn--accent" disabled={!variant || variant.stock === 0 || buyNow.isPending} onClick={() => buyNow.mutate()}>Buy now</button>
      </div>
      <div style={{ height: 64 }} aria-hidden="true" />
    </div>
  );
}
