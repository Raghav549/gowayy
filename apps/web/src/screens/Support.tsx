import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { LifeBuoy, Plus, ArrowRight } from 'lucide-react';
import { supportTicketSchema } from '@gowayy/validation';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { SectionHead, Field, EmptyState } from '../components/ui';

export function Support() {
  usePageMeta('Customer support');
  const user = useSession((s) => s.user);
  const qc = useQueryClient();
  const showToast = useUI((s) => s.showToast);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const tickets = useQuery({ queryKey: ['tickets'], queryFn: () => client.tickets(), enabled: Boolean(user) });

  const submit = async () => {
    const parsed = supportTicketSchema.safeParse({ subject, body });
    if (!parsed.success) { const e: Record<string, string> = {}; parsed.error.issues.forEach((i) => { e[String(i.path[0])] = i.message; }); setErrors(e); return; }
    setErrors({});
    try { await client.createTicket(parsed.data); setSubject(''); setBody(''); await qc.invalidateQueries({ queryKey: ['tickets'] }); showToast('Support ticket created', 'success'); }
    catch (e) { showToast(e instanceof Error ? e.message : 'Could not create ticket', 'error'); }
  };

  return (
    <div>
      <SectionHead eyebrow="Help" title="Customer support" subtitle="Complaints, refund requests and booking questions are stored with your account." />
      {!user ? <EmptyState title="Sign in to contact support" body="Support tickets are attached to your account." action={<Link className="btn btn--primary" to="/auth/login">Sign in</Link>} /> : (
        <div className="grid-2">
          <div className="card">
            <h3>Raise a ticket</h3>
            <div className="stack" style={{ marginTop: 14 }}>
              <Field label="Subject" error={errors.subject}><input className="input" placeholder="e.g. Refund for cancelled cab" value={subject} onChange={(e) => setSubject(e.target.value)} /></Field>
              <Field label="Details" error={errors.body}><textarea className="textarea" placeholder="Tell us what happened, including the booking reference" value={body} onChange={(e) => setBody(e.target.value)} /></Field>
              <button className="btn btn--primary" onClick={() => void submit()}><Plus size={16} /> Create ticket</button>
              <div className="link small row"><LifeBuoy size={14} /> Refund requests can also be started from <Link to="/bookings">your bookings</Link>.</div>
            </div>
          </div>
          <div className="card">
            <h3>Your tickets</h3>
            <div className="list" style={{ marginTop: 12 }}>
              {tickets.data?.length === 0 && <p className="small muted">No tickets yet.</p>}
              {tickets.data?.map((t) => <div className="card card--flat" key={t.id}>
                <div className="between"><strong className="small">{t.subject}</strong><span className="badge">{t.status}</span></div>
                <p className="small muted" style={{ marginTop: 6 }}>{t.body}</p>
                <p className="tiny muted" style={{ marginTop: 8 }}>{new Date(t.createdAt).toLocaleString()}</p>
              </div>)}
            </div>
            <Link className="link small row" style={{ marginTop: 14 }} to="/bookings">View bookings <ArrowRight size={14} /></Link>
          </div>
        </div>
      )}
    </div>
  );
}
