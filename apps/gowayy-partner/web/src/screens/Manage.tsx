import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, CalendarDays } from 'lucide-react';
import { catalogue } from '@gowayy/catalog';
import { client } from '../lib/client';
import { useUI } from '../store';
import { useSession } from '../store';
import { Field, SectionHead, Skeleton } from '@gowayy/ui';
import { formatINR } from '@gowayy/shared-utils';

type Tab = 'menu' | 'inventory' | 'rooms' | 'tours';

/** Business management: restaurant menu, grocery inventory, property rooms/availability, tours. */
export function Manage() {
  const user = useSession((s) => s.user);
  const roles = user?.roles ?? [];
  const tabs: Tab[] = roles.includes('restaurant') ? ['menu'] : [];
  if (roles.includes('grocery')) tabs.push('inventory');
  if (roles.includes('property')) tabs.push('rooms');
  if (roles.includes('tour_operator') || roles.includes('property')) tabs.push('tours');
  const [tab, setTab] = useState<Tab>(tabs[0] ?? 'menu');
  if (!tabs.length) return <p className="small muted" style={{ marginTop: 40 }}>Claim a business in onboarding to manage it here.</p>;
  return (
    <div className="stack">
      <SectionHead eyebrow="Business management" title="Manage" subtitle="Changes sync to the customer apps through the shared backend." />
      <div className="chips">
        {tabs.map((t) => <button key={t} className={`chip ${tab === t ? 'chip--active' : ''}`} onClick={() => setTab(t)}>{t}</button>)}
      </div>
      {tab === 'menu' && <MenuMgmt />}
      {tab === 'inventory' && <InventoryMgmt />}
      {tab === 'rooms' && <RoomsMgmt />}
      {tab === 'tours' && <ToursMgmt />}
    </div>
  );
}

function MenuMgmt() {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const menu = useQuery({ queryKey: ['partner-menu'], queryFn: () => client.partnerMenu() });
  const [name, setName] = useState(''); const [price, setPrice] = useState('');
  const add = useMutation({
    mutationFn: () => client.addMenuItem({ name, pricePaise: Math.round(Number(price) * 100) }),
    onSuccess: async () => { setName(''); setPrice(''); showToast('Menu item added', 'success'); await qc.invalidateQueries({ queryKey: ['partner-menu'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const toggle = useMutation({
    mutationFn: (item: any) => client.updateMenuItem(item.id, { available: !item.available }),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['partner-menu'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (menu.isLoading) return <Skeleton style={{ height: 200 }} />;
  return (
    <div className="stack">
      <div className="card grid-2" style={{ gap: 10 }}>
        <Field label="Item name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Price (₹)"><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <button className="btn btn--primary" style={{ gridColumn: '1 / -1' }} disabled={!name || !price || add.isPending} onClick={() => add.mutate()}><Plus size={15} /> Add menu item</button>
      </div>
      <div className="card"><h3 style={{ fontSize: 16 }}>Menu</h3>
        <div className="list" style={{ marginTop: 8 }}>
          {(menu.data?.items as any[] ?? []).map((m) => (
            <div className="list-row" key={m.id}>
              <span className="list-row__body"><span className="list-row__title">{m.name}</span><span className="list-row__sub">{formatINR(m.pricePaise)}</span></span>
              <button className={`badge ${m.available ? 'badge--success' : 'badge--danger'}`} onClick={() => toggle.mutate(m)}>{m.available ? 'Available' : 'Unavailable'}</button>
            </div>
          ))}
          {!(menu.data?.items as any[] ?? []).length && <p className="small muted">No items yet.</p>}
        </div>
      </div>
    </div>
  );
}

function InventoryMgmt() {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const inv = useQuery({ queryKey: ['partner-inventory'], queryFn: () => client.partnerInventory(), refetchInterval: 15000 });
  const adjust = useMutation({
    mutationFn: (p: any) => client.adjustInventory({ listingId: p.storeId, productId: p.id, delta: 5 }),
    onSuccess: async () => { showToast('Stock updated — customers see it immediately', 'success'); await qc.invalidateQueries({ queryKey: ['partner-inventory'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (inv.isLoading) return <Skeleton style={{ height: 200 }} />;
  return (
    <div className="card">
      <h3 style={{ fontSize: 16 }}>Inventory (live stock)</h3>
      <table className="table" style={{ marginTop: 10 }}>
        <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th /></tr></thead>
        <tbody>
          {(inv.data?.items as any[] ?? []).map((p) => (
            <tr key={p.id}>
              <td>{p.name}<div className="tiny muted">{p.category} · {p.unit}</div></td>
              <td>{formatINR(p.pricePaise)}</td>
              <td><strong style={{ color: p.stock > 0 ? 'var(--gw-success)' : 'var(--gw-danger)' }}>{p.stock}</strong></td>
              <td><button className="btn btn--secondary btn--sm" onClick={() => adjust.mutate(p)}><Pencil size={13} /> +5 stock</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RoomsMgmt() {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const rooms = useQuery({ queryKey: ['partner-rooms'], queryFn: () => client.partnerRooms() });
  const [name, setName] = useState(''); const [price, setPrice] = useState(''); const [count, setCount] = useState('2');
  const [avail, setAvail] = useState({ roomId: '', date: new Date().toISOString().slice(0, 10), delta: 1 });
  const add = useMutation({
    mutationFn: () => client.addRoom({ name, pricePerNightPaise: Math.round(Number(price) * 100), totalRooms: Number(count) }),
    onSuccess: async () => { setName(''); showToast('Room added', 'success'); await qc.invalidateQueries({ queryKey: ['partner-rooms'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const setA = useMutation({
    mutationFn: () => client.setAvailability(avail),
    onSuccess: async () => { showToast('Availability updated for customers', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (rooms.isLoading) return <Skeleton style={{ height: 200 }} />;
  return (
    <div className="stack">
      <div className="card grid-3" style={{ gap: 10 }}>
        <Field label="Room name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Price/night (₹)"><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Rooms"><input className="input" inputMode="numeric" value={count} onChange={(e) => setCount(e.target.value)} /></Field>
        <button className="btn btn--primary" style={{ gridColumn: '1 / -1' }} disabled={!name || !price || add.isPending} onClick={() => add.mutate()}><Plus size={15} /> Add room</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 16 }}>Rooms & availability</h3>
        <div className="list" style={{ marginTop: 8 }}>
          {(rooms.data?.items as any[] ?? []).map((r) => (
            <div className="list-row" key={r.id}>
              <span className="list-row__body"><span className="list-row__title">{r.name}</span><span className="list-row__sub">{formatINR(r.pricePerNightPaise)}/night · {r.totalRooms} rooms</span></span>
              <button className="btn btn--secondary btn--sm" onClick={() => setAvail({ ...avail, roomId: r.id })}>Select</button>
            </div>
          ))}
        </div>
        <div className="row" style={{ gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Field label="Date"><input className="input" type="date" value={avail.date} onChange={(e) => setAvail({ ...avail, date: e.target.value })} /></Field>
          <Field label="Rooms released"><input className="input" type="number" value={avail.delta} onChange={(e) => setAvail({ ...avail, delta: Number(e.target.value) })} /></Field>
          <button className="btn btn--primary btn--sm" disabled={!avail.roomId || setA.isPending} onClick={() => setA.mutate()}><CalendarDays size={14} /> Set availability</button>
        </div>
      </div>
    </div>
  );
}

function ToursMgmt() {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const tours = useQuery({ queryKey: ['partner-tours'], queryFn: () => client.partnerTours() });
  const [name, setName] = useState(''); const [dest, setDest] = useState(''); const [price, setPrice] = useState(''); const [hours, setHours] = useState('4'); const [cap, setCap] = useState('8');
  const add = useMutation({
    mutationFn: () => client.addTour({ name, destinationId: dest, pricePaise: Math.round(Number(price) * 100), durationHours: Number(hours), capacity: Number(cap) }),
    onSuccess: async () => { setName(''); showToast('Tour package created', 'success'); await qc.invalidateQueries({ queryKey: ['partner-tours'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (tours.isLoading) return <Skeleton style={{ height: 200 }} />;
  return (
    <div className="stack">
      <div className="card grid-3" style={{ gap: 10 }}>
        <Field label="Tour name"><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Destination"><select className="select" value={dest} onChange={(e) => setDest(e.target.value)}><option value="">Select…</option>{catalogue.destinations.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Price (₹)"><input className="input" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} /></Field>
        <Field label="Hours"><input className="input" inputMode="numeric" value={hours} onChange={(e) => setHours(e.target.value)} /></Field>
        <Field label="Capacity"><input className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value)} /></Field>
        <button className="btn btn--primary" style={{ gridColumn: '1 / -1' }} disabled={!name || !dest || !price || add.isPending} onClick={() => add.mutate()}><Plus size={15} /> Create package</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 16 }}>My packages</h3>
        <div className="list" style={{ marginTop: 8 }}>
          {(tours.data?.items as any[] ?? []).map((t) => (
            <div className="list-row" key={t.id}>
              <span className="list-row__body"><span className="list-row__title">{t.name}</span><span className="list-row__sub">{formatINR(t.pricePaise)} · {t.durationHours}h · capacity {t.capacity}</span></span>
              <span className={`badge ${t.active ? 'badge--success' : 'badge--danger'}`}>{t.active ? 'Active' : 'Inactive'}</span>
            </div>
          ))}
          {!(tours.data?.items as any[] ?? []).length && <p className="small muted">No packages yet.</p>}
        </div>
      </div>
    </div>
  );
}
