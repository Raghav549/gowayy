import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CarFront, MapPin, CheckCircle2, Package, UtensilsCrossed, Truck } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store';
import { Badge, MascotEmpty, SectionHead, Skeleton } from '@gowayy/ui';
import { formatINR } from '@gowayy/shared-utils';

const SERVICE_ICON: Record<string, typeof CarFront> = { cab: CarFront, shared_taxi: CarFront, parcel: Package, food: UtensilsCrossed, grocery: Truck, marketplace: Package };

export function DriverMode() {
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const me = useQuery({ queryKey: ['driver-me'], queryFn: () => client.driverMe() });
  const jobs = useQuery({ queryKey: ['jobs'], queryFn: () => client.jobs(), refetchInterval: 10000 });
  const driver = me.data?.driver as any;

  const toggleOnline = useMutation({
    mutationFn: (online: boolean) => client.updateDriver({ online }),
    onSuccess: async () => { showToast(driver?.online ? 'You are offline' : 'You are online', 'success'); await qc.invalidateQueries({ queryKey: ['driver-me'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const verifyDemo = useMutation({
    mutationFn: () => client.verifyDriverDemo(),
    onSuccess: async (r) => { showToast(r.demoNotice, 'info'); await qc.invalidateQueries({ queryKey: ['driver-me'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const accept = useMutation({
    mutationFn: (id: string) => client.acceptJob(id),
    onSuccess: async () => { showToast('Job accepted — customer notified', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (me.isLoading) return <Skeleton style={{ height: 300 }} />;
  if (!driver) {
    return <MascotEmpty pose="idle-standing" title="No driver profile yet" body="Register as a driver during onboarding to use driver mode." />;
  }

  return (
    <div className="stack">
      <SectionHead eyebrow="Driver mode" title="Drive & deliver" subtitle="Server-side dispatch rules prevent incompatible simultaneous tasks (e.g. no food delivery while carrying passengers)." />
      <div className="card row between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div className="row" style={{ gap: 12 }}>
          <label className="switch"><input type="checkbox" checked={driver.online} disabled={driver.verification !== 'verified' || toggleOnline.isPending} onChange={(e) => toggleOnline.mutate(e.target.checked)} /><span className="switch__track" /></label>
          <div><strong>{driver.online ? 'Online' : 'Offline'}</strong><div className="tiny muted">Services: {driver.services.join(', ')} · {driver.vehicleClass}</div></div>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <Badge tone={driver.verification === 'verified' ? 'success' : 'warning'}>{driver.verification}</Badge>
          {driver.verification !== 'verified' && <button className="btn btn--secondary btn--sm" onClick={() => verifyDemo.mutate()}>Demo verify</button>}
        </div>
      </div>
      {driver.verification !== 'verified' && <div className="notice notice--demo">Demo verification only — production requires real document review, permits and insurance checks.</div>}

      <section>
        <h3 style={{ fontSize: 17 }}>Open jobs {jobs.data?.items.length ? <Badge tone="accent">{jobs.data.items.length}</Badge> : null}</h3>
        <div className="list" style={{ marginTop: 10 }}>
          {(jobs.data?.items ?? []).length === 0 && <p className="small muted">No open jobs right now. New customer bookings appear here in real time.</p>}
          {(jobs.data?.items ?? []).map((j: any) => {
            const Icon = SERVICE_ICON[j.service] ?? Truck;
            return (
              <div className="list-row" key={j.id}>
                <Icon size={18} style={{ color: 'var(--gw-champagne)' }} />
                <span className="list-row__body"><span className="list-row__title">{j.service.replace('_', ' ')} · {j.bookingId ? 'ride booking' : 'order'}</span><span className="list-row__sub">opened {new Date(j.createdAt).toLocaleTimeString()}</span></span>
                <button className="btn btn--primary btn--sm" disabled={accept.isPending} onClick={() => accept.mutate(j.id)}><CheckCircle2 size={14} /> Accept</button>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <h3 style={{ fontSize: 16 }}><MapPin size={15} style={{ verticalAlign: -2, marginRight: 5 }} />Active job</h3>
        {driver.activeJobId ? <p className="small">Job {driver.activeJobId} is assigned to you. Customer-side tracking updates automatically.</p> : <p className="small muted">No active job.</p>}
      </section>
    </div>
  );
}
