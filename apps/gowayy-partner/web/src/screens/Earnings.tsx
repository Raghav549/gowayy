import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Download, Wallet } from 'lucide-react';
import { client } from '../lib/client';
import { useUI } from '../store';
import { SectionHead, Skeleton, Stat, Badge } from '@gowayy/ui';
import { formatINR } from '@gowayy/shared-utils';

export function Earnings() {
  const qc = useQueryClient(); const showToast = useUI((s) => s.showToast);
  const earnings = useQuery({ queryKey: ['partner-earnings'], queryFn: () => client.partnerEarnings(), refetchInterval: 15000 });
  const settlements = useQuery({ queryKey: ['partner-settlements'], queryFn: () => client.partnerSettlements() });
  const request = useMutation({
    mutationFn: () => client.requestSettlement(),
    onSuccess: async (r) => { showToast('Settlement requested', 'success'); await qc.invalidateQueries(); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  if (earnings.isLoading) return <Skeleton style={{ height: 260 }} />;
  const e = earnings.data as any;
  return (
    <div className="stack">
      <SectionHead eyebrow="Money" title="Earnings & settlements" subtitle={`${e.commissionPercent}% platform commission is deducted at capture; payouts settle separately.`} />
      <div className="grid-3">
        <div className="card"><Stat label="Gross captured" value={formatINR(e.totalGrossPaise)} /></div>
        <div className="card"><Stat label="Your net" value={formatINR(e.totalNetPaise)} /></div>
        <div className="card"><Stat label="Pending payout" value={formatINR(e.pendingPayoutPaise)} /></div>
      </div>
      <div className="card row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span className="row" style={{ gap: 8 }}><Wallet size={18} style={{ color: 'var(--gw-champagne)' }} /><strong>Request settlement of {formatINR(e.pendingPayoutPaise)}</strong></span>
        <button className="btn btn--primary btn--sm" disabled={e.pendingPayoutPaise <= 0 || request.isPending} onClick={() => request.mutate()}><Download size={14} /> Request payout</button>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 16 }}>Earnings ledger</h3>
        <table className="table" style={{ marginTop: 10 }}>
          <thead><tr><th>Reference</th><th>Service</th><th>Gross</th><th>Commission</th><th>Net</th><th>Date</th></tr></thead>
          <tbody>
            {(e.rows ?? []).map((r: any, i: number) => (
              <tr key={i}><td>{r.ref}</td><td>{r.service}</td><td>{formatINR(r.grossPaise)}</td><td>{formatINR(r.commissionPaise)}</td><td>{formatINR(r.netPaise)}</td><td>{new Date(r.at).toLocaleDateString()}</td></tr>
            ))}
            {!(e.rows ?? []).length && <tr><td colSpan={6} className="muted small">No captured payments yet.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="card">
        <h3 style={{ fontSize: 16 }}>Settlements</h3>
        <div className="list" style={{ marginTop: 8 }}>
          {((settlements.data as any)?.items ?? []).map((s: any) => (
            <div className="list-row" key={s.id}><span className="list-row__body"><span className="list-row__title">{formatINR(s.amountPaise)}</span><span className="list-row__sub">{new Date(s.createdAt).toLocaleString()}</span></span><Badge tone={s.status === 'paid' ? 'success' : 'warning'}>{s.status}</Badge></div>
          ))}
          {!(settlements.data as any)?.items?.length && <p className="small muted">No settlements requested yet.</p>}
        </div>
      </div>
    </div>
  );
}
