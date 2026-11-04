import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Package, Heart, Landmark, Coins, History, ChevronRight, LifeBuoy } from 'lucide-react';
import { client } from '../lib/client';
import { useSession } from '../store/useSession';
import { formatINR } from '@gowayy/shared-utils';
import { SectionHead } from '../components/ui';

/** Account hub (reference pattern: greeting, quick tiles, finance options, recents). */
export function Account() {
  const user = useSession((s) => s.user);
  const orders = useQuery({ queryKey: ['orders'], queryFn: () => client.orders() });
  const wishlist = useQuery({ queryKey: ['wishlist'], queryFn: () => client.wishlist() });
  const recent = useQuery({ queryKey: ['recently-viewed'], queryFn: () => client.recentlyViewedProducts() });
  const payments = useQuery({ queryKey: ['payments'], queryFn: () => client.payments() });

  const tile = (to: string, icon: React.ReactNode, label: string, sub: string) => (
    <Link to={to} className="card card--hover account-tile">
      {icon}<span className="list-row__body"><span className="list-row__title">{label}</span><span className="list-row__sub">{sub}</span></span><ChevronRight size={16} className="muted" />
    </Link>
  );

  return (
    <div className="stack">
      <div className="row between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <div><h1 style={{ fontSize: 26 }}>Hey, {user?.firstName ?? 'traveller'}</h1><p className="small muted">{user?.email}</p></div>
        <Link className="btn btn--secondary btn--sm" to="/support"><LifeBuoy size={15} /> Help</Link>
      </div>

      <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="row" style={{ gap: 8 }}><Coins size={18} style={{ color: 'var(--gw-champagne)' }} /><strong className="small">Your GOWAYY credit balance</strong></span>
        <strong>{formatINR(0)}</strong>
      </div>

      <div className="grid-2">
        {tile('/orders', <Package size={20} style={{ color: 'var(--gw-champagne)' }} />, 'Orders', `${orders.data?.length ?? 0} placed`)}
        {tile('/account/wishlist', <Heart size={20} style={{ color: 'var(--gw-champagne)' }} />, 'Wishlist', `${wishlist.data?.items.length ?? 0} saved`)}
      </div>

      <section>
        <SectionHead eyebrow="Money" title="Finance options" />
        <div className="list">
          <div className="list-row"><span className="list-row__icon"><Landmark size={17} /></span><span className="list-row__body"><span className="list-row__title">Instant credit</span><span className="list-row__sub">Subject to eligibility — not offered in this demo build</span></span></div>
          <div className="list-row"><span className="list-row__icon"><Coins size={17} /></span><span className="list-row__body"><span className="list-row__title">Payments & refunds</span><span className="list-row__sub">{payments.data?.length ?? 0} payment records · refunds issued server-side only</span></span><Link className="link small" to="/orders">View</Link></div>
        </div>
      </section>

      {recent.data && recent.data.items.length > 0 && (
        <section>
          <SectionHead eyebrow="Pick up where you left off" title="Recently viewed" action={<Link className="link small" to="/search">Search</Link>} />
          <div className="hscroll">
            {(recent.data.items as Array<{ id: string; slug: string; name: string; brand: string; variants: Array<{ pricePaise: number }> }>).map((p) => (
              <Link key={p.id} to={`/products/${p.slug}`} className="card hscroll__item" style={{ minWidth: 230 }}>
                <History size={14} className="muted" />
                <strong className="tiny" style={{ color: 'var(--gw-champagne-deep)' }}>{p.brand}</strong>
                <span className="small">{p.name}</span>
                <span style={{ fontWeight: 700 }}>{formatINR(p.variants[0]?.pricePaise ?? 0)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function Wishlist() {
  const q = useQuery({ queryKey: ['wishlist'], queryFn: () => client.wishlist() });
  const items = (q.data?.items ?? []) as Array<{ id: string; slug: string; name: string; brand: string; variants: Array<{ pricePaise: number; stock: number }> }>;
  return (
    <div className="stack">
      <SectionHead eyebrow="Saved" title="Wishlist" />
      {items.length === 0 && <p className="small muted">Nothing saved yet — tap the heart on any product.</p>}
      <div className="grid-3">
        {items.map((p) => (
          <Link key={p.id} to={`/products/${p.slug}`} className="card card--hover">
            <strong className="tiny" style={{ color: 'var(--gw-champagne-deep)' }}>{p.brand}</strong>
            <p className="small" style={{ marginTop: 4 }}>{p.name}</p>
            <p style={{ fontWeight: 700, marginTop: 6 }}>{formatINR(p.variants[0]?.pricePaise ?? 0)}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
