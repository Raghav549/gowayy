import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Plus, Pencil, CalendarDays, ImagePlus, PackageCheck, Tag, Clock3, MapPin, Trash2 } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { client } from '../lib/client';
import { uploadImageFile } from '../lib/uploads';
import { useSession, useUI } from '../store';
import { Field, SectionHead, Skeleton, SkeletonList, SkeletonTable, Badge, EmptyState } from '@gowayy/ui';
import { formatINR } from '@gowayy/shared-utils';
import type { ExperienceSlot } from '@gowayy/types';

type Tab = 'store' | 'catalog' | 'orders' | 'offers' | 'rooms' | 'tours';

type StoreImage = { path?: string; alt?: string } | string | null;
interface Store { id: string; name: string; description: string; address: string; phone: string; openingHours: string; deliveryCoverageKm: number; status: string; verified: boolean; image: StoreImage; logo: StoreImage; banner: StoreImage }
interface Category { id: string; name: string; image?: string | null }
interface Variant { id?: string; label: string; pricePaise: number; mrpPaise: number; stock: number }
interface Product { id: string; storeId?: string; name: string; description: string; category: string; categoryId: string; images: string[]; variants: Variant[]; tags: string[]; published: boolean; active: boolean; couponEligible: boolean }
interface Offer { id: string; title: string; code?: string; active: boolean; kind?: 'percent' | 'flat'; value?: number; scope?: string; discountPercent?: number; discountPaise?: number; minSubtotalPaise?: number; ownerUserId?: string | null }
interface PartnerOrder { id: string; reference: string; status: string; service: string; items: Array<{ name: string; quantity: number }>; price: { totalPaise: number }; deliveryAddress?: { line?: string; city?: string } }
interface Tour { id: string; kind: 'experience' | 'package'; name: string; destinationId: string; description: string; meetingPoint: string; requirements: string; pricePaise: number; durationHours: number; capacity: number; active: boolean }

function localDateTimeValue(date: Date) {
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function initialSlotStart() {
  const date = new Date(); date.setDate(date.getDate() + 2); date.setHours(9, 0, 0, 0);
  return localDateTimeValue(date);
}

const NEXT_STATUS: Record<string, Array<{ to: string; label: string }>> = {
  created: [{ to: 'accepted', label: 'Accept order' }, { to: 'cancelled', label: 'Reject' }],
  accepted: [{ to: 'preparing', label: 'Start preparing' }],
  preparing: [{ to: 'packed', label: 'Mark packed' }],
  packed: [{ to: 'out_for_delivery', label: 'Out for delivery' }],
};

export function Manage() {
  const user = useSession((s) => s.user);
  const roles = user?.roles ?? [];
  const tabs = useMemo(() => {
    const list: Tab[] = ['store', 'catalog', 'orders', 'offers'];
    if (roles.includes('property')) list.push('rooms');
    if (roles.includes('tour_operator')) list.push('tours');
    return list;
  }, [roles]);
  const [tab, setTab] = useState<Tab>('store');
  return (
    <div className="stack">
      <SectionHead eyebrow="Business workspace" title="Manage your business" subtitle="Everything you publish here appears in the GOWAYY customer app immediately." />
      <div className="chips" role="tablist">
        {tabs.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`chip ${tab === t ? 'chip--active' : ''}`} onClick={() => setTab(t)}>{t === 'catalog' ? 'Products' : t}</button>)}
      </div>
      {tab === 'store' && <StorePanel />}
      {tab === 'catalog' && <CatalogPanel />}
      {tab === 'orders' && <OrdersPanel />}
      {tab === 'offers' && <OffersPanel />}
      {tab === 'rooms' && <RoomsPanel />}
      {tab === 'tours' && <ToursPanel />}
    </div>
  );
}

function StorePanel() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const stores = useQuery({ queryKey: ['partner-stores'], queryFn: () => client.partnerStores?.() as unknown as Promise<{ items: Store[] }> });
  const [activeStoreId, setActiveStoreId] = useState<string | null>(null);
  const store = stores.data?.items.find((s) => s.id === activeStoreId) ?? stores.data?.items[0];
  const [draft, setDraft] = useState<Partial<Store> | null>(null);
  const [uploading, setUploading] = useState(false);
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await client.updatePartnerStore?.(store!.id, body)) ?? {},
    onSuccess: async () => { showToast('Store updated — customers see the change now', 'success'); setDraft(null); await qc.invalidateQueries({ queryKey: ['partner-stores'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const imagePath = (value: StoreImage | undefined) => (typeof value === 'string' ? value : value?.path ?? '');
  const upload = async (file: File, field: 'logo' | 'banner' | 'image') => {
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setDraft((d) => ({ ...d, [field]: url }));
      showToast(field === 'logo' ? 'Store logo uploaded — save to publish' : 'Store banner uploaded — save to publish', 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Upload failed', 'error'); }
    finally { setUploading(false); }
  };
  if (stores.isLoading) return <div className="stack" aria-hidden="true" aria-label="Loading stores"><Skeleton style={{ height: 22, width: 140 }} /><div className="grid-2"><Skeleton style={{ height: 120, borderRadius: 16 }} /><Skeleton style={{ height: 120, borderRadius: 16 }} /></div></div>;
  if (!store) return <EmptyState title="No store yet" body="Create your real store profile with its destination and actual coordinates, then add products here." action={<Link className="btn btn--primary" to="/onboarding">Create a store</Link>} />;
  const value = { ...store, ...draft };
  return (
    <div className="grid-2">
      <div className="card stack">
        {(stores.data?.items.length ?? 0) > 1 && (
          <div className="stack" style={{ gap: 6 }}>
            <span className="label">Your stores</span>
            <div className="chips" role="tablist" aria-label="Select a store">
              {stores.data!.items.map((s) => (
                <button key={s.id} role="tab" aria-selected={s.id === store.id} className={`chip ${s.id === store.id ? 'chip--active' : ''}`} onClick={() => { setActiveStoreId(s.id); setDraft(null); }}>{s.name}</button>
              ))}
            </div>
          </div>
        )}
        <div className="row between"><h3 style={{ fontSize: 16 }}>Store profile</h3><Badge tone={store.verified ? 'success' : 'warning'}>{store.verified ? 'verified' : 'verification pending'}</Badge></div>
        <div className="store-brand-preview">
          <div className="store-brand-preview__banner">
            {imagePath(value.banner) || imagePath(value.image) ? <img src={imagePath(value.banner) || imagePath(value.image)} alt="Store banner preview" /> : <span className="tiny muted">No banner yet — customers see a neutral lavender cover</span>}
          </div>
          <div className="store-brand-preview__logo">
            {imagePath(value.logo) ? <img src={imagePath(value.logo)} alt="Store logo preview" /> : <ImagePlus size={18} aria-hidden="true" />}
          </div>
        </div>
        <Field label="Store name"><input className="input" value={value.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></Field>
        <Field label="Description"><textarea className="input" rows={3} value={value.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></Field>
        <Field label="Address"><input className="input" value={value.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></Field>
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label="Opening hours"><input className="input" value={value.openingHours} onChange={(e) => setDraft({ ...draft, openingHours: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={value.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></Field>
          <Field label="Service area (km)"><input className="input" type="number" min={1} max={40} value={value.deliveryCoverageKm} onChange={(e) => setDraft({ ...draft, deliveryCoverageKm: Number(e.target.value) })} /></Field>
          <Field label="Status"><select className="input" value={value.status} onChange={(e) => setDraft({ ...draft, status: e.target.value })}><option value="active">Open</option><option value="paused">Paused</option></select></Field>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <label className="btn btn--secondary btn--sm" style={{ cursor: 'pointer' }}>
            <ImagePlus size={15} /> {uploading ? 'Uploading…' : 'Upload logo'}
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'logo'); }} />
          </label>
          <label className="btn btn--secondary btn--sm" style={{ cursor: 'pointer' }}>
            <ImagePlus size={15} /> Upload banner
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'banner'); }} />
          </label>
          <label className="btn btn--ghost btn--sm" style={{ cursor: 'pointer' }}>
            Legacy cover
            <input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f, 'image'); }} />
          </label>
        </div>
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label="Logo URL" hint="Or paste an existing /images or /uploads path."><input className="input" value={imagePath(value.logo)} onChange={(e) => setDraft({ ...draft, logo: e.target.value })} placeholder="/uploads/… or https://…" /></Field>
          <Field label="Banner URL" hint="Wide cover used on the customer store card."><input className="input" value={imagePath(value.banner)} onChange={(e) => setDraft({ ...draft, banner: e.target.value })} placeholder="/uploads/… or https://…" /></Field>
        </div>
        <p className="tiny muted">Logo appears as a small square; banner is the wide cover on store cards. Anything you upload or paste is saved to the store record and shown in the customer app after you save.</p>
        <button className="btn btn--primary" disabled={!draft || save.isPending} onClick={() => draft && save.mutate({ ...draft, id: undefined })}>{save.isPending ? 'Saving…' : 'Save store'}</button>
      </div>
      <div className="card stack">
        <h3 style={{ fontSize: 16 }}>Store facts</h3>
        <div className="list">
          <div className="list-row"><Clock3 size={16} /><span className="list-row__body"><span className="list-row__title">{store.openingHours}</span><span className="list-row__sub">Opening hours shown to customers</span></span></div>
          <div className="list-row"><MapPin size={16} /><span className="list-row__body"><span className="list-row__title">{store.deliveryCoverageKm} km</span><span className="list-row__sub">Delivery/service coverage</span></span></div>
          <div className="list-row"><PackageCheck size={16} /><span className="list-row__body"><span className="list-row__title">{store.status === 'active' ? 'Accepting orders' : 'Paused'}</span><span className="list-row__sub">Server-side availability</span></span></div>
        </div>
        <p className="tiny muted">Customers see your name, photo, category, location, opening hours, delivery coverage and verification state. Only GOWAYY operations can mark a store verified.</p>
      </div>
    </div>
  );
}

function CatalogPanel() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const stores = useQuery({ queryKey: ['partner-stores'], queryFn: () => client.partnerStores?.() as unknown as Promise<{ items: Store[] }> });
  const products = useQuery({ queryKey: ['partner-products'], queryFn: () => client.partnerProducts?.() as unknown as Promise<{ items: Product[] }> });
  const categories = useQuery({ queryKey: ['partner-categories'], queryFn: () => client.partnerCategories?.() as unknown as Promise<{ items: Category[]; mine: Category[] }> });
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const store = stores.data?.items.find((item) => item.id === selectedStoreId) ?? stores.data?.items[0];
  const empty = { name: '', description: '', categoryId: '', newCategory: '', newCategoryImage: '', price: '', mrp: '', stock: '', tags: '', images: [] as string[], variantLabel: '', variantPrice: '', couponEligible: true, published: true };
  const [form, setForm] = useState(empty);
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newCategoryImage, setNewCategoryImage] = useState('');

  const uploadFiles = async (files: FileList) => {
    setUploading(true);
    try {
      const urls: string[] = [];
      for (const file of Array.from(files).slice(0, 5 - form.images.length)) urls.push(await uploadImageFile(file));
      setForm((f) => ({ ...f, images: [...f.images, ...urls].slice(0, 5) }));
      showToast(`${urls.length} image(s) uploaded`, 'success');
    } catch (e) { showToast(e instanceof Error ? e.message : 'Upload failed', 'error'); }
    finally { setUploading(false); }
  };
  const uploadCategoryImage = async (file: File) => {
    setUploading(true);
    try {
      const url = await uploadImageFile(file);
      setNewCategoryImage(url); setForm((f) => ({ ...f, newCategoryImage: url }));
    } catch (e) { showToast(e instanceof Error ? e.message : 'Upload failed', 'error'); }
    finally { setUploading(false); }
  };

  const create = useMutation({
    mutationFn: async () => {
      if (!store) throw new Error('Create your store first');
      let categoryId = form.categoryId;
      if (!categoryId && form.newCategory.trim()) {
        const created = await client.createPartnerCategory?.({ name: form.newCategory.trim(), image: newCategoryImage || undefined }) as { category?: Category } | undefined;
        categoryId = created?.category?.id ?? '';
      }
      const pricePaise = Math.round(Number(form.price) * 100);
      const mrpPaise = Math.round(Number(form.mrp || form.price) * 100);
      const stock = Number(form.stock || 0);
      const variants: Variant[] = [{ id: 'var_1', label: 'Default', pricePaise, mrpPaise, stock }];
      if (form.variantLabel && form.variantPrice) variants.push({ id: 'var_2', label: form.variantLabel, pricePaise: Math.round(Number(form.variantPrice) * 100), mrpPaise: Math.round(Number(form.variantPrice) * 100), stock });
      return client.createPartnerProduct?.({
        storeId: store.id, name: form.name, description: form.description, categoryId: categoryId || undefined,
        images: form.images, pricePaise, mrpPaise, stock, variants,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean), couponEligible: form.couponEligible, published: form.published,
      });
    },
    onSuccess: async () => {
      showToast('Product published to the customer Shop', 'success');
      setForm(empty); setShowForm(false);
      await qc.invalidateQueries({ queryKey: ['partner-products'] });
      await qc.invalidateQueries({ queryKey: ['partner-categories'] });
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => (await client.updatePartnerProduct?.(id, body)) ?? {},
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['partner-products'] }); showToast('Product updated', 'success'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const setStock = (p: Product, delta: number) => {
    const v = p.variants[0];
    if (!v) return;
    toggle.mutate({ id: p.id, body: { stock: Math.max(0, v.stock + delta) } });
  };

  const visibleProducts = (products.data?.items ?? []).filter((product) => !store || !product.storeId || product.storeId === store.id);
  if (products.isLoading) return <div className="stack" aria-hidden="true" aria-label="Loading products"><Skeleton style={{ height: 22, width: 140 }} /><Skeleton style={{ height: 220, borderRadius: 16 }} /><Skeleton style={{ height: 160, borderRadius: 16 }} /></div>;
  return (
    <div className="stack">
      {!store && <div className="notice">No store is linked to your account yet. <Link to="/onboarding">Create a store</Link>.</div>}
      {(stores.data?.items.length ?? 0) > 1 && <Field label="Store"><select className="select" value={store?.id ?? ''} onChange={(event) => setSelectedStoreId(event.target.value)}>{stores.data!.items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
      <div className="between row--wrap">
        <p className="small muted">{visibleProducts.length} products · {visibleProducts.filter((p) => p.published).length} published</p>
        <button className="btn btn--primary btn--sm" disabled={!store} onClick={() => setShowForm(!showForm)}><Plus size={15} /> Add product</button>
      </div>

      {showForm && (
        <form className="card stack" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
          <h3 style={{ fontSize: 16 }}>New product</h3>
          <div className="grid-2" style={{ gap: 10 }}>
            <Field label="Product name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
            <Field label="Category"><select className="input" value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">Choose an existing category</option>
              {(categories.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></Field>
            <Field label="Or create a new category"><input className="input" placeholder="Category name" value={form.newCategory} onChange={(e) => setForm({ ...form, newCategory: e.target.value, categoryId: '' })} /></Field>
            <Field label="Category image" hint="Shown on the customer category tile.">
              <div className="row"><label className="btn btn--secondary btn--sm" style={{ cursor: 'pointer' }}><ImagePlus size={14} /> Upload<input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadCategoryImage(f); }} /></label>{newCategoryImage && <img src={newCategoryImage} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />}</div>
            </Field>
            <Field label="Price (₹)"><input className="input" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} required /></Field>
            <Field label="Discount price / MRP (₹)"><input className="input" inputMode="decimal" value={form.mrp} onChange={(e) => setForm({ ...form, mrp: e.target.value })} /></Field>
            <Field label="Inventory"><input className="input" type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required /></Field>
            <Field label="Tags" hint="Comma separated, e.g. organic, gift, local"><input className="input" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></Field>
            <Field label="Second variant label (optional)"><input className="input" placeholder="e.g. 500 g / Large" value={form.variantLabel} onChange={(e) => setForm({ ...form, variantLabel: e.target.value })} /></Field>
            <Field label="Second variant price (₹)"><input className="input" inputMode="decimal" value={form.variantPrice} onChange={(e) => setForm({ ...form, variantPrice: e.target.value })} /></Field>
          </div>
          <Field label="Description"><textarea className="input" rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <Field label={`Product images (${form.images.length}/5)`} hint="First image is the cover. JPEG, PNG or WebP up to 2.5 MB.">
            <div className="row row--wrap">
              {form.images.map((src, i) => (
                <span key={src} className="image-chip"><img src={src} alt={`Product image ${i + 1}`} /><button type="button" aria-label="Remove image" onClick={() => setForm({ ...form, images: form.images.filter((x) => x !== src) })}><Trash2 size={12} /></button></span>
              ))}
              {form.images.length < 5 && <label className="image-add"><ImagePlus size={18} /><input type="file" multiple accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { if (e.target.files?.length) void uploadFiles(e.target.files); }} /></label>}
            </div>
          </Field>
          <label className="check"><input type="checkbox" checked={form.couponEligible} onChange={(e) => setForm({ ...form, couponEligible: e.target.checked })} /> Eligible for coupons</label>
          <label className="check"><input type="checkbox" checked={form.published} onChange={(e) => setForm({ ...form, published: e.target.checked })} /> Publish immediately</label>
          <div className="row" style={{ gap: 8 }}><button className="btn btn--primary" disabled={create.isPending || uploading}>{create.isPending ? 'Publishing…' : 'Publish product'}</button><button type="button" className="btn btn--ghost" onClick={() => setShowForm(false)}>Cancel</button></div>
        </form>
      )}

      <div className="grid-3">
        {visibleProducts.map((p) => (
          <div className="card stack" key={p.id}>
            {p.images?.[0] ? <img src={p.images[0]} alt="" style={{ width: '100%', height: 120, objectFit: 'cover', borderRadius: 12 }} /> : <div className="image-empty">No photo</div>}
            <div className="between"><strong className="small">{p.name}</strong><Badge tone={p.published ? 'success' : 'warning'}>{p.published ? 'live' : 'draft'}</Badge></div>
            <div className="between small"><span>{formatINR(p.variants?.[0]?.pricePaise ?? 0)}</span><span className="muted">stock {p.variants?.[0]?.stock ?? 0}</span></div>
            <div className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn--secondary btn--sm" onClick={() => toggle.mutate({ id: p.id, body: { published: !p.published } })}>{p.published ? 'Unpublish' : 'Publish'}</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setStock(p, 5)}>+5 stock</button>
              <button className="btn btn--ghost btn--sm" onClick={() => setStock(p, -1)}>−1</button>
            </div>
            {p.tags.length > 0 && <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>{p.tags.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
          </div>
        ))}
        {visibleProducts.length === 0 && <p className="small muted">No products for this store yet. Add your first product above.</p>}
      </div>
    </div>
  );
}

function OrdersPanel() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const inbox = useQuery({ queryKey: ['partner-requests'], queryFn: () => client.partnerRequests(), refetchInterval: 15000 });
  const deliveries = useQuery({ queryKey: ['partner-deliveries'], queryFn: () => client.partnerDeliveries?.() as unknown as Promise<{ items: Array<{ orderId: string; reference: string; status: string; masked?: string; verified: boolean }> }> });
  const [codes, setCodes] = useState<Record<string, string>>({});
  const orders = (inbox.data?.orders ?? []) as PartnerOrder[];
  const deliveryItems = (deliveries.data?.items ?? []).filter((delivery) => delivery.status === 'out_for_delivery');
  const move = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => (await client.updatePartnerOrderStatus?.(id, status)) ?? {},
    onSuccess: async () => { showToast('Order status updated; the customer is notified', 'success'); await qc.invalidateQueries({ queryKey: ['partner-requests'] }); await qc.invalidateQueries({ queryKey: ['partner-deliveries'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const verify = useMutation({
    mutationFn: async ({ orderId, code }: { orderId: string; code: string }) => (await client.verifyDelivery?.(orderId, code)) ?? {},
    onSuccess: async () => { showToast('Delivery code verified — order completed', 'success'); await qc.invalidateQueries({ queryKey: ['partner-requests'] }); await qc.invalidateQueries({ queryKey: ['partner-deliveries'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (inbox.isLoading) return <SkeletonList rows={4} />;
  return (
    <div className="stack">
      <div className="card">
        <h3 style={{ fontSize: 16 }}>Delivery codes</h3>
        <p className="tiny muted">Ask the customer for their six-digit code at handover. Orders cannot be marked delivered without it.</p>
        <div className="list" style={{ marginTop: 10 }}>
          {deliveryItems.map((d) => (
            <div className="list-row" key={d.orderId}>
              <PackageCheck size={16} />
              <span className="list-row__body"><span className="list-row__title">{d.reference}</span><span className="list-row__sub">{d.verified ? 'verified' : d.masked ?? 'code issued'}</span></span>
              {!d.verified && (
                <div className="row" style={{ gap: 6 }}>
                  <input className="input" style={{ width: 110 }} inputMode="numeric" maxLength={6} placeholder="6 digits" value={codes[d.orderId] ?? ''} onChange={(e) => setCodes({ ...codes, [d.orderId]: e.target.value.replace(/\D/g, '') })} aria-label={`Delivery code for ${d.reference}`} />
                  <button className="btn btn--primary btn--sm" disabled={codes[d.orderId]?.length !== 6 || verify.isPending} onClick={() => verify.mutate({ orderId: d.orderId, code: codes[d.orderId] })}>Verify</button>
                </div>
              )}
            </div>
          ))}
          {deliveryItems.length === 0 && <p className="small muted">No out-for-delivery orders awaiting verification.</p>}
        </div>
      </div>
      <div className="stack">
        {orders.length === 0 && <EmptyState title="No orders yet" body="New customer orders appear here automatically." />}
        {orders.map((o) => (
          <div className="card stack" key={o.id}>
            <div className="between row--wrap">
              <div><strong>{o.reference}</strong><div className="tiny muted">{o.items.map((i) => `${i.quantity}× ${i.name}`).join(', ').slice(0, 90)}</div></div>
              <Badge tone={o.status === 'delivered' ? 'success' : 'warning'}>{o.status.replace(/_/g, ' ')}</Badge>
            </div>
            <div className="between small"><span>{formatINR(o.price.totalPaise)}</span><span className="muted">{o.deliveryAddress?.line}{o.deliveryAddress?.city ? `, ${o.deliveryAddress.city}` : ''}</span></div>
            {(NEXT_STATUS[o.status] ?? []).length > 0 && (
              <div className="row row--wrap" style={{ gap: 8 }}>
                {(NEXT_STATUS[o.status] ?? []).map((n) => <button key={n.to} className={`btn btn--sm ${n.to === 'cancelled' ? 'btn--danger' : 'btn--primary'}`} disabled={move.isPending} onClick={() => move.mutate({ id: o.id, status: n.to })}>{n.label}</button>)}
              </div>
            )}
            {o.status === 'out_for_delivery' && <p className="tiny muted">Use the delivery code above to complete this order.</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

function OffersPanel() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const offers = useQuery({ queryKey: ['partner-offers'], queryFn: () => client.partnerOffers?.() as unknown as Promise<{ items: Offer[] }> });
  const coupons = useQuery({ queryKey: ['partner-coupons'], queryFn: () => client.partnerCoupons?.() as unknown as Promise<{ items: Array<{ code: string; kind: string; valuePercent?: number; valuePaise?: number; active: boolean }> }> });
  const stores = useQuery({ queryKey: ['partner-stores'], queryFn: () => client.partnerStores?.() as unknown as Promise<{ items: Store[] }> });
  const categories = useQuery({ queryKey: ['partner-categories'], queryFn: () => client.partnerCategories?.() as unknown as Promise<{ items: Category[] }> });
  const products = useQuery({ queryKey: ['partner-products'], queryFn: () => client.partnerProducts?.() as unknown as Promise<{ items: Product[] }> });
  const emptyForm = { title: '', code: '', kind: 'percent', value: '', min: '', scope: 'store', storeId: '', categoryId: '', productId: '' };
  const [form, setForm] = useState(emptyForm);
  const selectedStoreId = form.storeId || stores.data?.items[0]?.id || '';
  const targetReady = form.scope === 'store' ? Boolean(selectedStoreId) : form.scope === 'category' ? Boolean(form.categoryId) : Boolean(form.productId);
  const create = useMutation({
    mutationFn: async () => {
      if (!targetReady) throw new Error(`Choose a ${form.scope} for this offer`);
      const amount = Number(form.value);
      if (!Number.isFinite(amount) || amount <= 0 || (form.kind === 'percent' && amount > 90)) throw new Error('Enter a valid discount (up to 90%)');
      return (await client.createPartnerOffer?.({
        title: form.title.trim(), code: form.code.trim() || undefined, kind: form.kind, scope: form.scope,
        storeId: form.scope === 'store' ? selectedStoreId : undefined,
        categoryIds: form.scope === 'category' ? [form.categoryId] : [],
        productIds: form.scope === 'product' ? [form.productId] : [],
        valuePercent: form.kind === 'percent' ? amount : undefined,
        valuePaise: form.kind === 'flat' ? Math.round(amount * 100) : undefined,
        minSubtotalPaise: form.min ? Math.round(Number(form.min) * 100) : 0,
      })) ?? {};
    },
    onSuccess: async () => { showToast('Offer created', 'success'); setForm(emptyForm); await qc.invalidateQueries({ queryKey: ['partner-offers'] }); await qc.invalidateQueries({ queryKey: ['partner-coupons'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const toggle = useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => (await client.updatePartnerOffer?.(id, { active })) ?? {},
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['partner-offers'] }); showToast('Offer updated', 'success'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  return (
    <div className="stack">
      <form className="card stack" onSubmit={(e) => { e.preventDefault(); create.mutate(); }}>
        <h3 style={{ fontSize: 16 }}>New offer or coupon</h3>
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label="Offer title"><input className="input" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></Field>
          <Field label="Coupon code (optional)"><input className="input" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} /></Field>
          <Field label="Type"><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}><option value="percent">Percent off</option><option value="flat">Flat amount off</option></select></Field>
          <Field label={form.kind === 'percent' ? 'Percent (%)' : 'Amount (₹)'}><input className="input" required inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} /></Field>
          <Field label="Minimum order (₹)"><input className="input" inputMode="decimal" value={form.min} onChange={(e) => setForm({ ...form, min: e.target.value })} /></Field>
          <Field label="Offer scope"><select className="input" value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value, categoryId: '', productId: '' })}><option value="store">Whole store</option><option value="category">Category</option><option value="product">Product</option></select></Field>
          {form.scope === 'store' && <Field label="Store"><select className="input" value={selectedStoreId} onChange={(e) => setForm({ ...form, storeId: e.target.value })}>{(stores.data?.items ?? []).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></Field>}
          {form.scope === 'category' && <Field label="Category"><select className="input" required value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">Choose…</option>{(categories.data?.items ?? []).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></Field>}
          {form.scope === 'product' && <Field label="Product"><select className="input" required value={form.productId} onChange={(e) => setForm({ ...form, productId: e.target.value })}><option value="">Choose…</option>{(products.data?.items ?? []).map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></Field>}
        </div>
        <button className="btn btn--primary" disabled={create.isPending || !form.title.trim() || !form.value || !targetReady}>{create.isPending ? 'Creating…' : <><Tag size={15} /> Create offer</>}</button>
      </form>
      <div className="grid-2">
        <div className="card stack">
          <h3 style={{ fontSize: 16 }}>Offers visible to your customers</h3>
          {(offers.data?.items ?? []).map((o) => (
            <div className="list-row" key={o.id}><Tag size={16} /><span className="list-row__body"><span className="list-row__title">{o.title}</span><span className="list-row__sub">{o.code ?? 'no code'} · {o.kind ? (o.kind === 'percent' ? `${o.value ?? 0}%` : formatINR(o.value ?? 0)) : o.discountPercent ? `${o.discountPercent}%` : formatINR(o.discountPaise ?? 0)} · {o.scope ?? 'store'}</span></span>
              {o.ownerUserId == null ? <Badge>platform</Badge> : <button className={`badge ${o.active ? 'badge--success' : 'badge--danger'}`} disabled={toggle.isPending} onClick={() => toggle.mutate({ id: o.id, active: !o.active })}>{o.active ? 'active' : 'paused'}</button>}
            </div>
          ))}
          {(offers.data?.items ?? []).length === 0 && <p className="small muted">No offers yet.</p>}
        </div>
        <div className="card stack">
          <h3 style={{ fontSize: 16 }}>Coupons</h3>
          {(coupons.data?.items ?? []).map((c) => <div className="between small" key={c.code}><span><code>{c.code}</code> · {c.kind === 'percent' ? `${c.valuePercent}% off` : `${formatINR(c.valuePaise ?? 0)} off`}</span><Badge tone={c.active ? 'success' : 'warning'}>{c.active ? 'active' : 'paused'}</Badge></div>)}
          {(coupons.data?.items ?? []).length === 0 && <p className="small muted">No coupons yet.</p>}
        </div>
      </div>
    </div>
  );
}

function RoomsPanel() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const rooms = useQuery({ queryKey: ['partner-rooms'], queryFn: () => client.partnerRooms() });
  const [name, setName] = useState(''); const [price, setPrice] = useState(''); const [count, setCount] = useState('2');
  const [avail, setAvail] = useState({ roomId: '', date: new Date().toISOString().slice(0, 10), delta: 1 });
  const add = useMutation({
    mutationFn: () => client.addRoom({ name, pricePerNightPaise: Math.round(Number(price) * 100), totalRooms: Number(count) }),
    onSuccess: async () => { setName(''); showToast('Room type added', 'success'); await qc.invalidateQueries({ queryKey: ['partner-rooms'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const setA = useMutation({
    mutationFn: () => client.setAvailability(avail),
    onSuccess: async () => { showToast('Availability updated for customers', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (rooms.isLoading) return <div className="stack"><Skeleton style={{ height: 22, width: 140 }} /><Skeleton style={{ height: 160, borderRadius: 16 }} /></div>;
  return (
    <div className="stack">
      <div className="card grid-3" style={{ gap: 10 }}>
        <Field label="Room name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Price/night (₹)"><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Rooms"><input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <button className="btn btn--primary" style={{ gridColumn: '1 / -1' }} disabled={!name || !price || add.isPending} onClick={() => add.mutate()}><Plus size={15} /> Add room type</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 16 }}>Rooms, calendar & guests</h3>
        <div className="list" style={{ marginTop: 8 }}>
          {(rooms.data?.items as Array<{ id: string; name: string; pricePerNightPaise: number; totalRooms: number }> ?? []).map((r) => (
            <div className="list-row" key={r.id}>
              <span className="list-row__body"><span className="list-row__title">{r.name}</span><span className="list-row__sub">{formatINR(r.pricePerNightPaise)}/night · {r.totalRooms} rooms</span></span>
              <button className="btn btn--secondary btn--sm" onClick={() => setAvail({ ...avail, roomId: r.id })}>Select</button>
            </div>
          ))}
          {!(rooms.data?.items as unknown[] ?? []).length && <p className="small muted">No rooms yet.</p>}
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Field label="Date"><input className="input" type="date" value={avail.date} onChange={(e) => setAvail({ ...avail, date: e.target.value })} /></Field>
          <Field label="Rooms released"><input className="input" type="number" value={avail.delta} onChange={(e) => setAvail({ ...avail, delta: Number(e.target.value) })} /></Field>
          <button className="btn btn--primary btn--sm" disabled={!avail.roomId || setA.isPending} onClick={() => setA.mutate()}><CalendarDays size={14} /> Set availability</button>
        </div>
        <p className="tiny muted" style={{ marginTop: 10 }}>Guest details for confirmed stays appear in your inbox; the customer receives the confirmation and invoice from GOWAYY.</p>
      </div>
    </div>
  );
}

function ToursPanel() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const tours = useQuery({ queryKey: ['partner-tours'], queryFn: () => client.partnerTours() });
  const empty = { kind: 'experience' as 'experience' | 'package', name: '', destinationId: '', price: '', durationHours: '2', capacity: '8', description: '', meetingPoint: '', requirements: '' };
  const [form, setForm] = useState(empty);
  const [selectedId, setSelectedId] = useState('');
  const items = (tours.data?.items as Tour[] | undefined) ?? [];
  const selected = items.find((tour) => tour.id === selectedId) ?? null;
  const add = useMutation({
    mutationFn: () => {
      const pricePaise = Math.round(Number(form.price) * 100);
      const durationHours = Number(form.durationHours); const capacity = Number(form.capacity);
      if (form.name.trim().length < 2 || !form.destinationId || !Number.isInteger(pricePaise) || pricePaise < 0 || !Number.isFinite(durationHours) || durationHours <= 0 || !Number.isInteger(capacity) || capacity < 1) throw new Error('Enter a valid name, destination, price, duration and capacity');
      return client.addTour({
        kind: form.kind, name: form.name.trim(), destinationId: form.destinationId, pricePaise, durationHours, capacity,
        description: form.description.trim(), meetingPoint: form.meetingPoint.trim(), requirements: form.requirements.trim(),
      });
    },
    onSuccess: async (result) => {
      setForm(empty); setSelectedId((result.tour as Tour).id);
      showToast('Offering saved. Add future slots to make it bookable.', 'success');
      await qc.invalidateQueries({ queryKey: ['partner-tours'] });
    },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const toggle = useMutation({
    mutationFn: (tour: Tour) => client.updateTour(tour.id, { active: !tour.active }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['partner-tours'] }); showToast('Offering visibility updated', 'success'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (tours.isLoading) return <div className="stack"><Skeleton style={{ height: 22, width: 140 }} /><Skeleton style={{ height: 160, borderRadius: 16 }} /></div>;
  return (
    <div className="stack">
      <form className="card stack" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
        <div><h3 style={{ fontSize: 16, marginBottom: 4 }}>Create an experience or package</h3><p className="tiny muted" style={{ margin: 0 }}>Only active offerings from verified hosts appear to customers. A real future slot is required before booking.</p></div>
        <div className="grid-3" style={{ gap: 10 }}>
          <Field label="Offering type"><select className="select" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'experience' | 'package' })}><option value="experience">Local experience</option><option value="package">Sightseeing package</option></select></Field>
          <Field label="Name"><input className="input" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Destination"><select className="select" required value={form.destinationId} onChange={(e) => setForm({ ...form, destinationId: e.target.value })}><option value="">Select…</option>{catalogue.destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
          <Field label="Price per guest (₹)"><input className="input" required min={0} type="number" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} /></Field>
          <Field label="Duration (hours)"><input className="input" required min={0.25} step={0.25} type="number" inputMode="decimal" value={form.durationHours} onChange={(e) => setForm({ ...form, durationHours: e.target.value })} /></Field>
          <Field label="Maximum guests per slot"><input className="input" required min={1} step={1} type="number" inputMode="numeric" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} /></Field>
        </div>
        <Field label="Description"><textarea className="input" rows={3} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What guests will actually do" /></Field>
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label="Meeting point"><input className="input" maxLength={300} value={form.meetingPoint} onChange={(e) => setForm({ ...form, meetingPoint: e.target.value })} placeholder="Exact place or host instructions" /></Field>
          <Field label="Guest requirements"><input className="input" maxLength={1000} value={form.requirements} onChange={(e) => setForm({ ...form, requirements: e.target.value })} placeholder="Fitness, clothing, age or safety requirements" /></Field>
        </div>
        <button className="btn btn--primary" disabled={add.isPending}><Plus size={15} /> {add.isPending ? 'Saving…' : 'Create offering'}</button>
      </form>

      <div className="card stack">
        <h3 style={{ fontSize: 16, margin: 0 }}>My offerings</h3>
        {items.map((tour) => <div className="card stack" key={tour.id} style={{ padding: 14 }}>
          <div className="between row--wrap" style={{ gap: 8 }}><div style={{ minWidth: 0 }}><strong style={{ overflowWrap: 'anywhere' }}>{tour.name}</strong><div className="tiny muted">{tour.kind === 'package' ? 'Package' : 'Experience'} · {formatINR(tour.pricePaise)} / guest · {tour.durationHours}h · up to {tour.capacity}</div></div><span className={`badge ${tour.active ? 'badge--success' : 'badge--danger'}`}>{tour.active ? 'Active' : 'Inactive'}</span></div>
          {tour.meetingPoint && <p className="tiny muted" style={{ margin: 0 }}><MapPin size={12} /> {tour.meetingPoint}</p>}
          <div className="row row--wrap" style={{ gap: 8 }}><button className="btn btn--secondary btn--sm" onClick={() => setSelectedId(selectedId === tour.id ? '' : tour.id)}><CalendarDays size={14} /> {selectedId === tour.id ? 'Hide schedule' : 'Manage slots'}</button><button className="btn btn--ghost btn--sm" disabled={toggle.isPending} onClick={() => toggle.mutate(tour)}>{tour.active ? 'Deactivate' : 'Activate'}</button></div>
        </div>)}
        {items.length === 0 && <EmptyState title="No offerings yet" body="Create an experience or package above, then publish real future slots." />}
      </div>
      {selected && <TourSlots key={selected.id} tour={selected} />}
    </div>
  );
}

function TourSlots({ tour }: { tour: Tour }) {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const slots = useQuery({ queryKey: ['partner-experience-slots', tour.id], queryFn: () => client.partnerExperienceSlots(tour.id) });
  const [startAt, setStartAt] = useState(initialSlotStart());
  const [capacity, setCapacity] = useState(String(tour.capacity));
  const add = useMutation({
    mutationFn: () => {
      const start = new Date(startAt); const count = Number(capacity);
      if (!Number.isFinite(start.getTime()) || start.getTime() <= Date.now()) throw new Error('Choose a future date and time');
      if (!Number.isInteger(count) || count < 1 || count > tour.capacity) throw new Error(`Capacity must be between 1 and ${tour.capacity}`);
      return client.addExperienceSlot({ offeringId: tour.id, startAt: start.toISOString(), capacity: count });
    },
    onSuccess: async () => { showToast('Slot published with real capacity', 'success'); await qc.invalidateQueries({ queryKey: ['partner-experience-slots', tour.id] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const remove = useMutation({
    mutationFn: (id: string) => client.deleteExperienceSlot(id),
    onSuccess: async () => { showToast('Slot deactivated', 'success'); await qc.invalidateQueries({ queryKey: ['partner-experience-slots', tour.id] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  return (
    <div className="card stack">
      <div><h3 style={{ fontSize: 16, marginBottom: 4 }}>Schedule · {tour.name}</h3><p className="tiny muted" style={{ margin: 0 }}>Saving the same start time updates that slot. Capacity can never be reduced below guests already booked.</p></div>
      <form className="grid-3" style={{ gap: 10 }} onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
        <Field label="Start date & time"><input className="input" type="datetime-local" required min={localDateTimeValue(new Date())} value={startAt} onChange={(e) => setStartAt(e.target.value)} /></Field>
        <Field label="Slot capacity"><input className="input" type="number" min={1} max={tour.capacity} step={1} required value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <button className="btn btn--primary" style={{ alignSelf: 'end' }} disabled={add.isPending}><Plus size={15} /> {add.isPending ? 'Publishing…' : 'Publish slot'}</button>
      </form>
      {slots.isLoading && <div style={{ display: 'flex', gap: 8 }}><Skeleton style={{ height: 72, width: 120, borderRadius: 12 }} /><Skeleton style={{ height: 72, width: 120, borderRadius: 12 }} /><Skeleton style={{ height: 72, width: 120, borderRadius: 12 }} /></div>}
      <div className="list">
        {((slots.data?.items ?? []) as ExperienceSlot[]).map((slot) => <div className="list-row" key={slot.id} style={{ flexWrap: 'wrap' }}>
          <Clock3 size={16} /><span className="list-row__body" style={{ minWidth: 180 }}><span className="list-row__title">{new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(slot.startsAt))}</span><span className="list-row__sub">Ends {new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(slot.endsAt))} · {slot.booked}/{slot.capacity} booked</span></span>
          <span className={`badge ${slot.active === false ? 'badge--danger' : 'badge--success'}`}>{slot.active === false ? 'Inactive' : `${slot.available} available`}</span>
          {slot.active !== false && <button className="btn btn--ghost btn--sm" disabled={remove.isPending} onClick={() => remove.mutate(slot.id)}><Trash2 size={14} /> Deactivate</button>}
        </div>)}
      </div>
      {!slots.isLoading && (slots.data?.items.length ?? 0) === 0 && <p className="small muted">No slots yet. This offering is not bookable until you publish one.</p>}
    </div>
  );
}
