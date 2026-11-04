import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarFront, MapPin, CheckCircle2, Package, UtensilsCrossed, Truck, Power, History, Wallet } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store';
import { Badge, EmptyState, SectionHead, Skeleton } from '@gowayy/ui';
import { formatINR } from '@gowayy/shared-utils';

const SERVICE_ICON: Record<string, typeof CarFront> = { cab: CarFront, shared_taxi: CarFront, parcel: Package, food: UtensilsCrossed, grocery: Truck, marketplace: Package };

export function DriverMode() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [tab, setTab] = useState<'requests' | 'active' | 'history' | 'money'>('requests');
  const me = useQuery({ queryKey: ['driver-me'], queryFn: () => client.driverMe() });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => client.jobs(), refetchInterval: 10000 });
  const requests = useQuery({ queryKey: ['partner-requests'], queryFn: () => client.partnerRequests(), refetchInterval: 15000 });
  const earnings = useQuery({ queryKey: ['partner-earnings'], queryFn: () => client.partnerEarnings() });
  const settlements = useQuery({ queryKey: ['partner-settlements'], queryFn: () => client.partnerSettlements() });
  const driver = me.data?.driver;

  const toggleOnline = useMutation({
    mutationFn: (online: boolean) => client.updateDriver({ online }),
    onSuccess: async (_r, online) => { showToast(online ? 'You are online and visible for dispatch' : 'You are offline', 'success'); await qc.invalidateQueries({ queryKey: ['driver-me'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const accept = useMutation({
    mutationFn: (id: string) => client.acceptJob(id),
    onSuccess: async () => { showToast('Job accepted — the customer has been notified', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const detailsOf = (b: (typeof requests.data extends undefined ? never : NonNullable<typeof requests.data>)['bookings'][number]) => (b.details ?? {}) as { pickup?: { name?: string }; dropoff?: { name?: string }; destinationName?: string };
  const advance = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => client.transitionBooking(id, status, 'Updated by driver'),
    onSuccess: async () => { showToast('Trip status updated', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const requestPayout = useMutation({
    mutationFn: () => client.requestSettlement(),
    onSuccess: async () => { showToast('Payout requested; finance will process it', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (me.isLoading) return <Skeleton style={{ height: 300 }} />;
  if (!driver) return <EmptyState title="No driver profile yet" body="Complete driver onboarding to receive ride and delivery requests." />;

  const bookings = requests.data?.bookings ?? [];
  const active = bookings.filter((b) => ['confirmed', 'in_progress'].includes(b.status));
  const history = bookings.filter((b) => ['completed', 'cancelled', 'refunded'].includes(b.status));
  const money = earnings.data as { totalNetPaise?: number; pendingPayoutPaise?: number; commissionPercent?: number } | undefined;

  return (
    <div className="stack">
      <SectionHead eyebrow="Driver mode" title="Drive & deliver" subtitle="Accept requests, update trip status and get paid through GOWAYY settlements." />

      <div className="card row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="switch"><input type="checkbox" checked={driver.online} disabled={driver.verification !== 'verified' || toggleOnline.isPending} onChange={(e) => toggleOnline.mutate(e.target.checked)} /><span className="switch__track" /></label>
          <div>
            <strong className="row" style={{ gap: 6 }}><Power size={15} /> {driver.online ? 'Online' : 'Offline'}</strong>
            <div className="tiny muted">Services: {driver.services.join(', ')} · {driver.vehicleClass}</div>
          </div>
        </div>
        <Badge tone={driver.verification === 'verified' ? 'success' : 'warning'}>{driver.verification === 'verified' ? 'documents verified' : 'verification pending'}</Badge>
      </div>
      {driver.verification !== 'verified' && <div className="notice">Your documents are awaiting GOWAYY verification. You will be able to go online once operations approve your account.</div>}

      <div className="chips">
        {(['requests', 'active', 'history', 'money'] as const).map((t) => <button key={t} className={`chip ${tab === t ? 'chip--active' : ''}`} onClick={() => setTab(t)}>{t === 'money' ? 'earnings' : t}</button>)}
      </div>

      {tab === 'requests' && (
        <section>
          <h3 style={{ fontSize: 16 }}>Ride and delivery requests {jobs.data?.items.length ? <Badge tone="accent">{jobs.data.items.length}</Badge> : null}</h3>
          <div className="list" style={{ marginTop: 10 }}>
            {(jobs.data?.items ?? []).length === 0 && <p className="small muted">No open requests. New requests appear here automatically when you are online.</p>}
            {(jobs.data?.items ?? []).map((j) => {
              const Icon = SERVICE_ICON[j.service] ?? Truck;
              return (
                <div className="list-row" key={j.id}>
                  <Icon size={18} style={{ color: 'var(--gw-champagne)' }} />
                  <span className="list-row__body"><span className="list-row__title">{j.service.replace(/_/g, ' ')} · {j.bookingId ? 'passenger ride' : 'delivery'}</span><span className="list-row__sub">opened {new Date(j.createdAt).toLocaleTimeString()}</span></span>
                  <button className="btn btn--primary btn--sm" disabled={accept.isPending || driver.verification !== 'verified'} onClick={() => accept.mutate(j.id)}><CheckCircle2 size={14} /> Accept</button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {tab === 'active' && (
        <section className="stack">
          {active.length === 0 && <EmptyState title="No active job" body="Accepted rides appear here with pickup, drop-off and the passenger's contact." />}
          {active.map((b) => (
            <div className="card stack" key={b.id}>
              <div className="between row--wrap"><strong>{b.reference} · {b.title}</strong><Badge tone={b.status === 'in_progress' ? 'accent' : 'warning'}>{b.status.replace('_', ' ')}</Badge></div>
              <div className="tiny muted row" style={{ gap: 6 }}><MapPin size={13} /> {detailsOf(b).pickup?.name ?? 'Pickup'} → {detailsOf(b).dropoff?.name ?? detailsOf(b).destinationName ?? 'Drop-off'}</div>
              <p className="small">{formatINR(b.price.totalPaise)} · {new Date(b.createdAt).toLocaleString()}</p>
              <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                {b.status === 'confirmed' && <button className="btn btn--primary btn--sm" onClick={() => advance.mutate({ id: b.id, status: 'in_progress' })}>Start trip</button>}
                {b.status === 'in_progress' && <button className="btn btn--primary btn--sm" onClick={() => advance.mutate({ id: b.id, status: 'completed' })}>Complete trip</button>}
                <button className="btn btn--danger btn--sm" onClick={() => advance.mutate({ id: b.id, status: 'cancelled' })}>Cancel</button>
              </div>
            </div>
          ))}
        </section>
      )}

      {tab === 'history' && (
        <section className="card">
          <h3 style={{ fontSize: 16 }}><History size={15} style={{ verticalAlign: -2, marginRight: 5 }} />Trip history</h3>
          <div className="list" style={{ marginTop: 8 }}>
            {history.length === 0 && <p className="small muted">Completed trips will appear here.</p>}
            {history.map((b) => (
              <div className="list-row" key={b.id}>
                <span className="list-row__body"><span className="list-row__title">{b.reference} · {b.title}</span><span className="list-row__sub">{new Date(b.createdAt).toLocaleDateString()} · {formatINR(b.price.totalPaise)}</span></span>
                <Badge tone={b.status === 'completed' ? 'success' : 'danger'}>{b.status}</Badge>
              </div>
            ))}
          </div>
        </section>
      )}

      {tab === 'money' && (
        <section className="stack">
          <div className="grid-3">
            <div className="card"><div className="tiny muted">Net earnings</div><strong>{formatINR(money?.totalNetPaise ?? 0)}</strong></div>
            <div className="card"><div className="tiny muted">Pending payout</div><strong>{formatINR(money?.pendingPayoutPaise ?? 0)}</strong></div>
            <div className="card"><div className="tiny muted">Platform commission</div><strong>{money?.commissionPercent ?? 15}%</strong></div>
          </div>
          <div className="card row between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span className="row" style={{ gap: 8 }}><Wallet size={18} style={{ color: 'var(--gw-champagne)' }} /> Request a payout of your available balance</span>
            <button className="btn btn--primary btn--sm" disabled={(money?.pendingPayoutPaise ?? 0) <= 0 || requestPayout.isPending} onClick={() => requestPayout.mutate()}>{requestPayout.isPending ? 'Requesting…' : 'Request payout'}</button>
          </div>
          <div className="card">
            <h3 style={{ fontSize: 16 }}>Settlement history</h3>
            <div className="list" style={{ marginTop: 8 }}>
              {((settlements.data as { items?: Array<{ id: string; amountPaise: number; status: string; createdAt: string }> } | undefined)?.items ?? []).map((s) => (
                <div className="list-row" key={s.id}><span className="list-row__body"><span className="list-row__title">{formatINR(s.amountPaise)}</span><span className="list-row__sub">{new Date(s.createdAt).toLocaleString()}</span></span><Badge tone={s.status === 'paid' ? 'success' : 'warning'}>{s.status}</Badge></div>
              ))}
              {((settlements.data as { items?: unknown[] } | undefined)?.items ?? []).length === 0 && <p className="small muted">No payouts requested yet.</p>}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
