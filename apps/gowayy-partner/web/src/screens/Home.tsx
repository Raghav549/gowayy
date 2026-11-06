import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CarFront, Inbox, Wallet, ShieldCheck, FileCheck, ArrowRight } from 'lucide-react';
import { client } from '../lib/client';
import { formatINR } from '@gowayy/shared-utils';
import { Badge, SectionHead, Skeleton, SkeletonMetrics, SkeletonList, Stat, MascotEmpty } from '@gowayy/ui';

export function Home() {
  const overview = useQuery({ queryKey: ['partner-overview'], queryFn: () => client.partnerOverview(), refetchInterval: 15000 });
  const o = overview.data as Record<string, any> | undefined;
  if (overview.isLoading) return <div className="stack"><Skeleton style={{ height: 22, width: 180, borderRadius: 8 }} /><SkeletonMetrics count={3} /><div className="grid-2"><Skeleton style={{ height: 84, borderRadius: 16 }} /><Skeleton style={{ height: 84, borderRadius: 16 }} /></div><SkeletonList rows={3} /></div>;
  if (!o) return <MascotEmpty pose="error-retry" title="Could not load your dashboard" body="Pull to retry." />;
  const roles: string[] = o.roles ?? [];
  const verification = String(o.verification ?? 'unverified');
  return (
    <div className="stack">
      <SectionHead eyebrow="GOWAYY PARTNER" title="Partner home" subtitle={`Roles: ${roles.join(', ') || 'none yet'} · verification: ${verification}`} />
      {verification !== 'verified' && (
        <div className="notice notice--info"><FileCheck size={15} /> <span><strong>Verification pending.</strong> Upload documents from Profile to activate partner features. <Link className="link" to="/profile">Open profile</Link></span></div>
      )}
      <div className="grid-3">
        <div className="card"><Stat label="Open requests" value={o.counts?.openRequests ?? 0} /></div>
        <div className="card"><Stat label="Bookings" value={o.counts?.bookings ?? 0} /></div>
        <div className="card"><Stat label="Orders" value={o.counts?.orders ?? 0} /></div>
      </div>
      <div className="grid-2">
        <Link to="/driver" className="card card--hover" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <CarFront size={22} style={{ color: 'var(--gw-champagne)' }} />
          <span className="list-row__body"><span className="list-row__title">Driver mode</span><span className="list-row__sub">Go online, accept rides & deliveries, track active job</span></span><ArrowRight size={16} className="muted" />
        </Link>
        <Link to="/inbox" className="card card--hover" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Inbox size={22} style={{ color: 'var(--gw-champagne)' }} />
          <span className="list-row__body"><span className="list-row__title">Requests inbox</span><span className="list-row__sub">Accept bookings and advance orders</span></span><ArrowRight size={16} className="muted" />
        </Link>
        <Link to="/manage" className="card card--hover" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <ShieldCheck size={22} style={{ color: 'var(--gw-champagne)' }} />
          <span className="list-row__body"><span className="list-row__title">Manage my business</span><span className="list-row__sub">Menu, inventory, rooms, availability, tours</span></span><ArrowRight size={16} className="muted" />
        </Link>
        <Link to="/earnings" className="card card--hover" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Wallet size={22} style={{ color: 'var(--gw-champagne)' }} />
          <span className="list-row__body"><span className="list-row__title">Earnings & settlements</span><span className="list-row__sub">Pending payout {formatINR(o.earnings?.pendingPayoutPaise ?? 0)}</span></span><ArrowRight size={16} className="muted" />
        </Link>
      </div>
      <div className="card">
        <div className="between"><h3 style={{ fontSize: 16 }}>Latest earnings</h3><Badge tone="accent">{o.earnings?.commissionPercent ?? 15}% platform commission</Badge></div>
        <div className="list" style={{ marginTop: 8 }}>
          {(o.earnings?.rows ?? []).slice(0, 5).map((r: any, i: number) => (
            <div className="list-row" key={i}><span className="list-row__body"><span className="list-row__title">{r.ref} · {r.service}</span><span className="list-row__sub">gross {formatINR(r.grossPaise)} → net {formatINR(r.netPaise)}</span></span><span className="small">{new Date(r.at).toLocaleDateString()}</span></div>
          ))}
          {!(o.earnings?.rows ?? []).length && <p className="small muted">No earnings yet — they appear here after captured payments.</p>}
        </div>
      </div>
    </div>
  );
}
