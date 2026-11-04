import { useQuery } from '@tanstack/react-query';
import { ExternalLink, Camera, ShieldCheck } from 'lucide-react';
import { client } from '../lib/client';
import { usePageMeta } from '../lib/guards';
import { SectionHead, Spinner } from '../components/ui';

export function Credits() {
  usePageMeta('Image credits & licensing');
  const q = useQuery({ queryKey: ['credits'], queryFn: () => client.credits() });
  return (
    <div>
      <SectionHead eyebrow="Real image research" title="Image credits & licensing" subtitle="Only verified, permissibly licensed photographs of the exact named place are displayed." />
      <div className="notice notice--info"><ShieldCheck size={15} /> {q.data?.policy ?? 'Licensing policy loaded from the server.'}</div>
      {q.isLoading && <div style={{ marginTop: 16 }}><Spinner /></div>}
      <section className="section">
        <div className="grid-2">
          {(q.data?.credits ?? []).map((c, i) => (
            <div className="card" key={`${c.place}-${i}`}>
              <div className="between"><strong>{c.place}</strong><span className="badge badge--success">Verified</span></div>
              <p className="small muted" style={{ marginTop: 8 }}>{c.alt}</p>
              <div className="divider" />
              <div className="stack tiny">
                <div><strong>Author / credit:</strong> {c.credit}</div>
                <div><strong>Licence:</strong> {c.license}</div>
                <div className="row"><Camera size={13} /><a className="link" href={c.sourceUrl} target="_blank" rel="noreferrer">Source page <ExternalLink size={12} /></a></div>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section className="section card">
        <h3>Places without a usable licensed photograph</h3>
        <p className="small muted" style={{ marginTop: 8 }}>These destinations show a designed “Photograph unavailable” state. No unrelated or AI-generated photograph stands in for them.</p>
        <div className="chips" style={{ marginTop: 14 }}>{(q.data?.unavailablePlaces ?? []).map((p) => <span className="chip" key={p}>{p}</span>)}</div>
      </section>
      <section className="section card">
        <h3>Research workflow</h3>
        <ol className="small muted" style={{ marginTop: 10, paddingLeft: 20, lineHeight: '26px' }}>
          <li>Search for the exact destination or place.</li><li>Confirm the photograph depicts that exact place.</li>
          <li>Read the source licensing section (Wikimedia Commons file pages or publisher attribution).</li>
          <li>Download only permitted images; record source, author, licence and date.</li>
          <li>Optimise locally into responsive WebP derivatives and preserve the original.</li>
          <li>Connect the verified asset to its destination record and display the credit.</li>
          <li>Mark unavailable when no usable licensed image is found.</li>
        </ol>
        <p className="tiny muted" style={{ marginTop: 12 }}>Full manifest: <code>assets/images/IMAGE_SOURCES.json</code> · attribution: <code>assets/images/ATTRIBUTION.md</code>.</p>
      </section>
    </div>
  );
}
