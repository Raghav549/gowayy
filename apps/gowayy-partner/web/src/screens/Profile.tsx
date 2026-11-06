import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileCheck, LifeBuoy, LogOut, Trash2 } from 'lucide-react';
import { client } from '../lib/client';
import { useSession } from '../store';
import { useUI } from '../store';
import { Field, SectionHead, Skeleton, Badge } from '@gowayy/ui';

export function Profile() {
  const nav = useNavigate(); const qc = useQueryClient();
  const user = useSession((s) => s.user); const clear = useSession((s) => s.clear);
  const showToast = useUI((s) => s.showToast);
  const [doc, setDoc] = useState({ type: 'pan', number: '' });
  const verification = useQuery({ queryKey: ['partner-verification'], queryFn: () => client.partnerVerification() });
  const profile = useQuery({ queryKey: ['partner-profile'], queryFn: () => client.partnerProfile() });
  const [biz, setBiz] = useState({ businessName: '', phone: '', address: '', gstin: '', description: '' });
  const savedProfile = (profile.data as { profile?: typeof biz } | undefined)?.profile;
  useEffect(() => {
    if (!savedProfile) return;
    setBiz({
      businessName: savedProfile.businessName ?? '', phone: savedProfile.phone ?? '',
      address: savedProfile.address ?? '', gstin: savedProfile.gstin ?? '',
      description: savedProfile.description ?? '',
    });
  }, [savedProfile]);
  const saveProfile = useMutation({
    mutationFn: () => client.updatePartnerProfile(biz),
    onSuccess: async () => { showToast('Business profile saved', 'success'); await qc.invalidateQueries({ queryKey: ['partner-profile'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const uploadDoc = useMutation({
    mutationFn: () => client.uploadPartnerDocument(doc),
    onSuccess: async (r: any) => { showToast('Document uploaded — verification pending', 'info'); setDoc({ ...doc, number: '' }); await qc.invalidateQueries({ queryKey: ['partner-verification'] }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const del = useMutation({
    mutationFn: () => client.deleteAccount(),
    onSuccess: () => { clear(); nav('/auth/login'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (!user) return null;
  return (
    <div className="stack">
      <SectionHead eyebrow="Account" title={`${user.firstName} ${user.lastName}`} subtitle={user.email} />
      <div className="card stack" style={{ gap: 10 }}>
        <h3 style={{ fontSize: 16 }}>Business profile</h3>
        <div className="grid-2" style={{ gap: 10 }}>
          <Field label="Business name"><input className="input" value={biz.businessName} onChange={(e) => setBiz({ ...biz, businessName: e.target.value })} /></Field>
          <Field label="Phone"><input className="input" value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} /></Field>
          <Field label="Address"><input className="input" value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} /></Field>
          <Field label="GSTIN (optional)"><input className="input" value={biz.gstin} onChange={(e) => setBiz({ ...biz, gstin: e.target.value })} /></Field>
        </div>
        <button className="btn btn--primary btn--sm" style={{ alignSelf: 'start' }} disabled={saveProfile.isPending} onClick={() => saveProfile.mutate()}>Save profile</button>
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h3 style={{ fontSize: 16 }}><FileCheck size={16} style={{ verticalAlign: -2, marginRight: 6 }} />Document verification</h3>
        {verification.isLoading ? <Skeleton style={{ height: 60 }} /> : (
          <>
            <div className="chips">
              {(verification.data as any)?.documents?.map((d: any) => <span key={d.id} className="badge badge--warning">{d.type} · {d.status}</span>)}
              {!(verification.data as any)?.documents?.length && <span className="small muted">No documents uploaded.</span>}
            </div>
            <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
              <select className="select" style={{ maxWidth: 200 }} value={doc.type} onChange={(e) => setDoc({ ...doc, type: e.target.value })}>
                {['pan', 'gst', 'fssai', 'trade_licence', 'driving_licence', 'vehicle_registration', 'insurance', 'permit'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className="input" style={{ maxWidth: 240 }} placeholder="Document number" value={doc.number} onChange={(e) => setDoc({ ...doc, number: e.target.value })} />
              <button className="btn btn--secondary btn--sm" disabled={!doc.number || uploadDoc.isPending} onClick={() => uploadDoc.mutate()}>Upload</button>
            </div>
            <p className="tiny muted">Development adapter: uploads are stored as PENDING. Production requires real document review.</p>
          </>
        )}
      </div>

      <div className="card stack" style={{ gap: 10 }}>
        <h3 style={{ fontSize: 16 }}>Support & account</h3>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <a className="btn btn--secondary btn--sm" href="mailto:support@gowayy.example"><LifeBuoy size={14} /> Contact support</a>
          <button className="btn btn--secondary btn--sm" onClick={() => { void client.logout().finally(() => { clear(); nav('/auth/login'); }); }}><LogOut size={14} /> Sign out</button>
          <button className="btn btn--ghost btn--sm" style={{ color: 'var(--gw-danger)' }} onClick={() => { if (window.confirm('Delete your account permanently?')) del.mutate(); }}><Trash2 size={14} /> Delete account</button>
        </div>
      </div>
    </div>
  );
}
