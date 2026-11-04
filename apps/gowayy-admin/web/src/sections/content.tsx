import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDown, ArrowUp, ImagePlus, MapPin, Plus, Trash2, Upload } from 'lucide-react';
import { admin, client, errorText } from '../lib/client';
import { useUI } from '../store';
import { Badge, Card, Field, Modal, Stat } from '../components/ui';

/* ------------------------------------------------------------------ helpers */

async function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^;]+;base64,/, ''));
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.readAsDataURL(file);
  });
}

/** Uploads a file through the protected /uploads endpoint and returns its path. */
function ImageUpload({ label = 'Image', value, onChange, hint }: { label?: string; value: string; onChange: (path: string) => void; hint?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="field">
      <span className="label">{label}</span>
      <div className="row" style={{ gap: 8 }}>
        <input className="input" value={value} placeholder="/uploads/… or https://…" onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn btn--secondary btn--sm" disabled={busy} onClick={() => input.current?.click()}>
          <Upload size={14} /> {busy ? 'Uploading…' : 'Upload'}
        </button>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true); setError(null);
            try {
              const dataBase64 = await fileToBase64(file);
              const result = await client.uploadImage?.({ dataBase64, mimeType: file.type });
              if (!result?.url) throw new Error('Upload failed');
              onChange(result.url);
            } catch (err) { setError(errorText(err)); } finally { setBusy(false); e.target.value = ''; }
          }} />
      </div>
      {value && <img src={value} alt="Selected preview" className="preview" style={{ marginTop: 8 }} />}
      {error && <span className="error">{error}</span>}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

/* ------------------------------------------------------------------ posters */

interface PosterRecord {
  id: string; kind: 'food' | 'grocery'; title: string; subtitle?: string; cta?: string; href: string;
  image?: { path?: string; alt?: string } | null; order: number; active: boolean; startAt?: string | null; endAt?: string | null;
}

const emptyPoster = { kind: 'grocery' as 'food' | 'grocery', title: '', subtitle: '', cta: 'Shop all', href: '/groceries', image: '', order: 1, active: true, startAt: '', endAt: '' };

export function Posters() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const q = useQuery({ queryKey: ['admin', 'posters'], queryFn: () => admin<{ items: PosterRecord[] }>('/posters') });
  const [kind, setKind] = useState<'grocery' | 'food'>('grocery');
  const [editing, setEditing] = useState<PosterRecord | null>(null);
  const [form, setForm] = useState({ ...emptyPoster });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const posters = (q.data?.items ?? []).filter((p) => p.kind === kind);

  const refresh = async () => { await qc.invalidateQueries({ queryKey: ['admin'] }); await qc.invalidateQueries({ queryKey: ['home-posters'] }); };

  const startCreate = () => { setEditing(null); setForm({ ...emptyPoster, kind, href: kind === 'food' ? '/food' : '/groceries' }); setOpen(true); };
  const startEdit = (p: PosterRecord) => {
    setEditing(p);
    setForm({ kind: p.kind, title: p.title, subtitle: p.subtitle ?? '', cta: p.cta ?? 'Shop all', href: p.href, image: p.image?.path ?? '', order: p.order, active: p.active, startAt: p.startAt ?? '', endAt: p.endAt ?? '' });
    setOpen(true);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = {
        kind: form.kind, title: form.title, subtitle: form.subtitle, cta: form.cta, href: form.href,
        order: Number(form.order), active: form.active, startAt: form.startAt || null, endAt: form.endAt || null,
        image: form.image ? { status: 'verified', path: form.image, alt: form.title } : undefined,
      };
      if (editing) await admin(`/posters/${editing.id}`, { method: 'PATCH', body });
      else await admin('/posters', { method: 'POST', body });
      showToast(editing ? 'Poster updated' : 'Poster created', 'success');
      setOpen(false); await refresh();
    } catch (err) { showToast(errorText(err), 'error'); } finally { setBusy(false); }
  };

  const toggle = async (p: PosterRecord) => {
    try { await admin(`/posters/${p.id}`, { method: 'PATCH', body: { active: !p.active } }); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };
  const remove = async (p: PosterRecord) => {
    if (!window.confirm(`Delete “${p.title}”? The customer carousel updates immediately.`)) return;
    try { await admin(`/posters/${p.id}`, { method: 'DELETE' }); showToast('Poster deleted', 'success'); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };
  const move = async (p: PosterRecord, direction: -1 | 1) => {
    const ordered = posters.slice().sort((a, b) => a.order - b.order);
    const index = ordered.findIndex((x) => x.id === p.id);
    const swap = ordered[index + direction];
    if (!swap) return;
    try {
      await admin(`/posters/${p.id}`, { method: 'PATCH', body: { order: swap.order } });
      await admin(`/posters/${swap.id}`, { method: 'PATCH', body: { order: p.order } });
      await refresh();
    } catch (err) { showToast(errorText(err), 'error'); }
  };

  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <Stat label="Grocery posters" value={(q.data?.items ?? []).filter((p) => p.kind === 'grocery').length} hint="left customer carousel" tone="gold" />
        <Stat label="Food posters" value={(q.data?.items ?? []).filter((p) => p.kind === 'food').length} hint="right customer carousel" />
        <Stat label="Active" value={(q.data?.items ?? []).filter((p) => p.active).length} hint="visible on the customer home" tone="dark" />
      </div>
      <div className="toolbar between">
        <div className="chips">
          {(['grocery', 'food'] as const).map((k) => <button key={k} className={`chip ${kind === k ? 'chip--active' : ''}`} onClick={() => setKind(k)}>{k} offers</button>)}
        </div>
        <button className="btn btn--primary btn--sm" onClick={startCreate}><Plus size={15} /> New poster</button>
      </div>

      {posters.length === 0 && <Card><p className="muted small">No {kind} posters yet. Add a poster to populate the {kind} carousel.</p></Card>}
      <div className="poster-admin-grid">
        {posters.slice().sort((a, b) => a.order - b.order).map((p) => (
          <Card key={p.id}>
            <div className="poster-admin-card">
              <div className="poster-admin-card__image">{p.image?.path ? <img src={p.image.path} alt={p.image.alt ?? p.title} /> : <span className="thumb thumb--empty" />}</div>
              <div className="poster-admin-card__body">
                <div className="between"><strong>{p.title}</strong><Badge tone={p.active ? 'good' : 'neutral'}>{p.active ? 'active' : 'hidden'}</Badge></div>
                <p className="tiny muted">{p.subtitle ?? 'No subtitle'}</p>
                <p className="tiny muted">Order {p.order} · {p.href}</p>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => startEdit(p)}>Edit</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => void toggle(p)}>{p.active ? 'Deactivate' : 'Activate'}</button>
                  <button className="btn btn--ghost btn--sm" aria-label="Move up" onClick={() => void move(p, -1)}><ArrowUp size={14} /></button>
                  <button className="btn btn--ghost btn--sm" aria-label="Move down" onClick={() => void move(p, 1)}><ArrowDown size={14} /></button>
                  <button className="btn btn--ghost btn--sm" onClick={() => void remove(p)}><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          </Card>
        ))}
      </div>

      {open && <Modal title={editing ? 'Edit poster' : 'New poster'} onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={save}>
          <Field label="Carousel"><select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'food' | 'grocery' })}><option value="grocery">Grocery</option><option value="food">Food</option></select></Field>
          <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
          <Field label="Subtitle"><input className="input" value={form.subtitle} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} /></Field>
          <Field label="Button label"><input className="input" value={form.cta} onChange={(e) => setForm({ ...form, cta: e.target.value })} /></Field>
          <Field label="Link"><input className="input" value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} required /></Field>
          <Field label="Order"><input className="input" type="number" min={1} value={form.order} onChange={(e) => setForm({ ...form, order: Number(e.target.value) })} /></Field>
          <ImageUpload label="Poster image" value={form.image} onChange={(path) => setForm({ ...form, image: path })} hint="1200×500 or wider posters look best. PNG, JPEG or WebP up to 2.5 MB." />
          <Field label="Starts (optional)"><input className="input" type="datetime-local" value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></Field>
          <Field label="Ends (optional)"><input className="input" type="datetime-local" value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></Field>
          <label className="row small"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Visible on the customer app</label>
          <div className="form-actions"><button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save poster'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* -------------------------------------------------------------- service areas */

interface ServiceAreaRecord { id: string; city: string; state: string; active: boolean; foodPincodes: string[]; groceryPincodes: string[]; deliveryNote?: string }

const emptyArea = { city: '', state: 'West Bengal', foodPincodes: '', groceryPincodes: '', deliveryNote: '', active: true };

export function ServiceAreas() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const q = useQuery({ queryKey: ['admin', 'service-areas'], queryFn: () => admin<{ items: ServiceAreaRecord[] }>('/service-areas') });
  const [form, setForm] = useState({ ...emptyArea });
  const [editing, setEditing] = useState<ServiceAreaRecord | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const areas = q.data?.items ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });
  const startCreate = () => { setEditing(null); setForm({ ...emptyArea }); setOpen(true); };
  const startEdit = (a: ServiceAreaRecord) => {
    setEditing(a);
    setForm({ city: a.city, state: a.state, foodPincodes: a.foodPincodes.join(', '), groceryPincodes: a.groceryPincodes.join(', '), deliveryNote: a.deliveryNote ?? '', active: a.active });
    setOpen(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = { city: form.city, state: form.state, foodPincodes: form.foodPincodes, groceryPincodes: form.groceryPincodes, deliveryNote: form.deliveryNote, active: form.active };
      if (editing) await admin(`/service-areas/${editing.id}`, { method: 'PATCH', body });
      else await admin('/service-areas', { method: 'POST', body });
      showToast(editing ? 'Service area updated' : 'City added', 'success'); setOpen(false); await refresh();
    } catch (err) { showToast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  const toggle = async (a: ServiceAreaRecord) => {
    try { await admin(`/service-areas/${a.id}`, { method: 'PATCH', body: { active: !a.active } }); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };
  const remove = async (a: ServiceAreaRecord) => {
    if (!window.confirm(`Remove ${a.city}? Customers in this city will see “Service unavailable in your area”.`)) return;
    try { await admin(`/service-areas/${a.id}`, { method: 'DELETE' }); showToast('Service area removed', 'success'); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };

  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <Stat label="Cities" value={areas.length} hint="active delivery markets" tone="gold" />
        <Stat label="Food PIN codes" value={new Set(areas.flatMap((a) => a.foodPincodes)).size} hint="food service coverage" />
        <Stat label="Grocery PIN codes" value={new Set(areas.flatMap((a) => a.groceryPincodes)).size} hint="grocery service coverage" tone="dark" />
      </div>
      <div className="toolbar between">
        <p className="small muted" style={{ margin: 0 }}>Food and grocery coverage are configured independently. Checkout rejects out-of-area orders on the server.</p>
        <button className="btn btn--primary btn--sm" onClick={startCreate}><Plus size={15} /> Add city</button>
      </div>
      <div className="area-grid">
        {areas.map((a) => (
          <Card key={a.id}>
            <div className="between"><h3><MapPin size={16} /> {a.city}</h3><Badge tone={a.active ? 'good' : 'neutral'}>{a.active ? 'active' : 'paused'}</Badge></div>
            <p className="tiny muted">{a.state}</p>
            <div className="area-block"><strong className="tiny">Food PIN codes</strong><div className="chips">{a.foodPincodes.length ? a.foodPincodes.map((p) => <span key={p} className="chip chip--static">{p}</span>) : <span className="tiny muted">None</span>}</div></div>
            <div className="area-block"><strong className="tiny">Grocery PIN codes</strong><div className="chips">{a.groceryPincodes.length ? a.groceryPincodes.map((p) => <span key={p} className="chip chip--static">{p}</span>) : <span className="tiny muted">None</span>}</div></div>
            <div className="row" style={{ gap: 6, marginTop: 10 }}>
              <button className="btn btn--ghost btn--sm" onClick={() => startEdit(a)}>Edit</button>
              <button className="btn btn--ghost btn--sm" onClick={() => void toggle(a)}>{a.active ? 'Deactivate' : 'Activate'}</button>
              <button className="btn btn--ghost btn--sm" onClick={() => void remove(a)}><Trash2 size={14} /></button>
            </div>
          </Card>
        ))}
      </div>
      {open && <Modal title={editing ? `Edit ${editing.city}` : 'Add service area'} onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={save}>
          <Field label="City"><input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></Field>
          <Field label="State"><input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} /></Field>
          <Field label="Food PIN codes" hint="Comma or space separated 6-digit PIN codes."><textarea className="input" rows={3} value={form.foodPincodes} onChange={(e) => setForm({ ...form, foodPincodes: e.target.value })} /></Field>
          <Field label="Grocery PIN codes" hint="Separate from food coverage."><textarea className="input" rows={3} value={form.groceryPincodes} onChange={(e) => setForm({ ...form, groceryPincodes: e.target.value })} /></Field>
          <Field label="Delivery note"><input className="input" value={form.deliveryNote} onChange={(e) => setForm({ ...form, deliveryNote: e.target.value })} /></Field>
          <label className="row small"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Active</label>
          <div className="form-actions"><button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save city'}</button></div>
        </form>
      </Modal>}
    </div>
  );
}

/* ------------------------------------------------------------- destinations */

interface DestImage { id: string; path: string; alt: string; credit?: string; sourceUrl?: string; status: string; primary?: boolean; order?: number }
interface DestinationRecord {
  id: string; slug: string; name: string; region: string; summary?: string; description?: string;
  coords?: { lat: number; lng: number } | null; images: DestImage[]; active: boolean; featured: boolean;
  imagesVerified: number; listings: number; order: number;
}

const emptyDestination = { name: '', slug: '', region: 'Darjeeling Himalaya', summary: '', description: '', lat: '', lng: '', active: true, featured: false };

export function Destinations() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const q = useQuery({ queryKey: ['admin', 'destinations'], queryFn: () => admin<{ items: DestinationRecord[] }>('/destinations') });
  const [editing, setEditing] = useState<DestinationRecord | null>(null);
  const [form, setForm] = useState({ ...emptyDestination });
  const [open, setOpen] = useState(false);
  const [galleryFor, setGalleryFor] = useState<DestinationRecord | null>(null);
  const [newImage, setNewImage] = useState('');
  const [busy, setBusy] = useState(false);

  const rows = q.data?.items ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ['admin'] });

  const startCreate = () => { setEditing(null); setForm({ ...emptyDestination }); setOpen(true); };
  const startEdit = (d: DestinationRecord) => {
    setEditing(d);
    setForm({ name: d.name, slug: d.slug, region: d.region, summary: d.summary ?? '', description: d.description ?? '', lat: d.coords ? String(d.coords.lat) : '', lng: d.coords ? String(d.coords.lng) : '', active: d.active !== false, featured: d.featured });
    setOpen(true);
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const body = {
        name: form.name, slug: form.slug || undefined, region: form.region, summary: form.summary, description: form.description,
        coords: form.lat && form.lng ? { lat: Number(form.lat), lng: Number(form.lng) } : null, active: form.active, featured: form.featured,
      };
      if (editing) await admin(`/destinations/${editing.id}`, { method: 'PATCH', body });
      else await admin('/destinations', { method: 'POST', body });
      showToast(editing ? 'Destination updated' : 'Destination created', 'success'); setOpen(false); await refresh();
    } catch (err) { showToast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  const toggleActive = async (d: DestinationRecord) => {
    try { await admin(`/destinations/${d.id}`, { method: 'PATCH', body: { active: !d.active } }); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };
  const remove = async (d: DestinationRecord) => {
    if (!window.confirm(`Deactivate ${d.name}? Bookings and photos are kept, but customers will no longer see it.`)) return;
    try { await admin(`/destinations/${d.id}`, { method: 'DELETE' }); showToast('Destination deactivated', 'success'); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };
  const addImage = async () => {
    if (!galleryFor || !newImage) return;
    setBusy(true);
    try {
      await admin(`/destinations/${galleryFor.id}/images`, { method: 'POST', body: { image: { status: 'verified', path: newImage, alt: galleryFor.name } } });
      showToast('Image added', 'success'); setNewImage(''); await refresh();
      const updated = (await admin<{ items: DestinationRecord[] }>('/destinations')).items.find((d) => d.id === galleryFor.id) ?? null;
      setGalleryFor(updated);
    } catch (err) { showToast(errorText(err), 'error'); } finally { setBusy(false); }
  };
  const setPrimary = async (d: DestinationRecord, imageId: string) => {
    try { await admin(`/destinations/${d.id}/images/${imageId}`, { method: 'PATCH', body: { primary: true } }); showToast('Cover image updated', 'success'); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };
  const moveImage = async (d: DestinationRecord, imageId: string, direction: -1 | 1) => {
    const ordered = (d.images ?? []).slice().sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));
    const index = ordered.findIndex((i) => i.id === imageId);
    if (index < 0 || index + direction < 0 || index + direction >= ordered.length) return;
    try {
      await admin(`/destinations/${d.id}/images/${imageId}`, { method: 'PATCH', body: { order: index + direction + 1 } });
      await refresh();
      const updated = (await admin<{ items: DestinationRecord[] }>('/destinations')).items.find((x) => x.id === d.id) ?? null;
      setGalleryFor(updated);
    } catch (err) { showToast(errorText(err), 'error'); }
  };
  const replaceImage = async (d: DestinationRecord, imageId: string) => {
    const next = window.prompt('New image path (/images/… or /uploads/…) or an HTTPS URL');
    if (!next) return;
    try {
      await admin(`/destinations/${d.id}/images/${imageId}`, { method: 'PATCH', body: { path: next.trim() } });
      showToast('Image replaced', 'success'); await refresh();
      const updated = (await admin<{ items: DestinationRecord[] }>('/destinations')).items.find((x) => x.id === d.id) ?? null;
      setGalleryFor(updated);
    } catch (err) { showToast(errorText(err), 'error'); }
  };
  const deleteImage = async (d: DestinationRecord, imageId: string) => {
    try { await admin(`/destinations/${d.id}/images/${imageId}`, { method: 'DELETE' }); showToast('Image removed', 'success'); await refresh(); }
    catch (err) { showToast(errorText(err), 'error'); }
  };

  return (
    <div className="stack-lg">
      <div className="stat-grid">
        <Stat label="Destinations" value={rows.length} hint="editable in the database" tone="gold" />
        <Stat label="Active" value={rows.filter((d) => d.active).length} hint="visible to customers" />
        <Stat label="Photographs" value={rows.reduce((n, d) => n + (d.images?.length ?? 0), 0)} hint="with rights recorded" tone="dark" />
      </div>
      <div className="toolbar between">
        <p className="small muted" style={{ margin: 0 }}>Places, descriptions, coordinates and galleries update the customer Explore pages immediately.</p>
        <button className="btn btn--primary btn--sm" onClick={startCreate}><Plus size={15} /> New destination</button>
      </div>
      <Card>
        <div className="dest-admin-list">
          {rows.map((d) => (
            <div className="dest-admin-row" key={d.id}>
              <div className="dest-admin-row__image">{d.images?.[0]?.path ? <img src={d.images[0].path} alt={d.images[0].alt ?? d.name} /> : <span className="thumb thumb--empty" aria-hidden="true" />}</div>
              <div className="dest-admin-row__body">
                <div className="between"><strong>{d.name}</strong><Badge tone={d.active ? 'good' : 'neutral'}>{d.active ? 'active' : 'hidden'}</Badge></div>
                <span className="tiny muted">{d.region} · {d.images?.length ?? 0} images · {d.listings} listings</span>
                <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  <button className="btn btn--ghost btn--sm" onClick={() => startEdit(d)}>Edit</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => setGalleryFor(d)}><ImagePlus size={14} /> Gallery</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => void toggleActive(d)}>{d.active ? 'Hide' : 'Show'}</button>
                  <button className="btn btn--ghost btn--sm" onClick={() => void remove(d)}>Deactivate</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {open && <Modal title={editing ? `Edit ${editing.name}` : 'New destination'} onClose={() => setOpen(false)}>
        <form className="form-grid" onSubmit={save}>
          <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
          <Field label="Slug" hint="Leave blank to generate from the name."><input className="input" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} /></Field>
          <Field label="Region"><input className="input" value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} /></Field>
          <Field label="Summary"><input className="input" value={form.summary} onChange={(e) => setForm({ ...form, summary: e.target.value })} /></Field>
          <Field label="Description"><textarea className="input" rows={5} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
          <div className="row" style={{ gap: 10 }}>
            <Field label="Latitude"><input className="input" value={form.lat} onChange={(e) => setForm({ ...form, lat: e.target.value })} /></Field>
            <Field label="Longitude"><input className="input" value={form.lng} onChange={(e) => setForm({ ...form, lng: e.target.value })} /></Field>
          </div>
          <label className="row small"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Visible to customers</label>
          <label className="row small"><input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })} /> Featured on home</label>
          <div className="form-actions"><button className="btn btn--primary" disabled={busy}>{busy ? 'Saving…' : 'Save destination'}</button></div>
        </form>
      </Modal>}

      {galleryFor && <Modal title={`${galleryFor.name} — image gallery`} onClose={() => { setGalleryFor(null); setNewImage(''); }}>
        <div className="stack">
          <ImageUpload label="Add a photograph" value={newImage} onChange={setNewImage} hint="Use a photo whose licence you have verified; credit is stored with the record." />
          <button type="button" className="btn btn--primary btn--sm" disabled={!newImage || busy} onClick={() => void addImage()}>{busy ? 'Adding…' : 'Add to gallery'}</button>
          <div className="gallery-grid">
            {(galleryFor.images ?? []).map((img) => (
              <div className="gallery-item" key={img.id}>
                <img src={img.path} alt={img.alt} />
                <div className="gallery-item__bar">
                  {img.primary ? <Badge tone="gold">cover</Badge> : <button className="btn btn--ghost btn--sm" onClick={() => void setPrimary(galleryFor, img.id)}>Set cover</button>}
                  <button className="btn btn--ghost btn--sm" aria-label="Move image earlier" disabled={(img.order ?? 1) <= 1} onClick={() => void moveImage(galleryFor, img.id, -1)}><ArrowUp size={14} /></button>
                  <button className="btn btn--ghost btn--sm" aria-label="Move image later" disabled={(img.order ?? 1) >= (galleryFor.images?.length ?? 1)} onClick={() => void moveImage(galleryFor, img.id, 1)}><ArrowDown size={14} /></button>
                  <button className="btn btn--ghost btn--sm" onClick={() => void replaceImage(galleryFor, img.id)}>Replace</button>
                  <button className="btn btn--ghost btn--sm" aria-label="Delete image" onClick={() => void deleteImage(galleryFor, img.id)}><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
          {(galleryFor.images ?? []).length === 0 && <p className="small muted">No photographs yet. Customers see a clean “Photo coming soon” fallback.</p>}
        </div>
      </Modal>}
    </div>
  );
}
