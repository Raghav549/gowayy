import { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck, Eye, EyeOff, ArrowRight, ArrowLeft, Store, TrendingUp, Package, Users, Check, Mail, Sparkles } from 'lucide-react';
import { client } from '../lib/client';
import { useSession, useUI } from '../store';


/* ── Partner Auth Layout — premium, responsive, keyboard-safe ── */
function PartnerAuthShell({ step, title, subtitle, kicker, children }: { step?: number; title: string; subtitle: string; kicker?: string; children: React.ReactNode }) {
  const steps = [
    { label: 'Partner details' },
    { label: 'Verify email' },
  ];
  return (
    <div className="partner-auth">
      <aside className="partner-auth__aside" aria-hidden="true">
        <Link to="/" className="partner-auth__brand"><img src="/brand/g-symbol.svg" width={32} height={32} alt="" /><span>GOWAYY <em>PARTNER</em></span></Link>
        <div className="partner-auth__hero">
          {kicker && <div className="eyebrow" style={{ color: '#FFC44D' }}>{kicker}</div>}
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
        {step !== undefined && (
          <ol className="partner-auth__steps" aria-label="Registration progress">
            {steps.map((s, i) => (
              <li key={s.label} className={i < step ? 'is-done' : i === step ? 'is-current' : ''}>
                <span>{i < step ? <Check size={13} /> : i + 1}</span>
                {s.label}
              </li>
            ))}
          </ol>
        )}
        <div className="partner-auth__benefits">
          <div className="partner-auth__benefit"><span className="partner-auth__benefit-icon"><Store size={16} /></span><div><strong>Manage everything</strong><small>Stores, products, orders & payouts</small></div></div>
          <div className="partner-auth__benefit"><span className="partner-auth__benefit-icon"><TrendingUp size={16} /></span><div><strong>Track earnings</strong><small>Daily settlements, clear payouts</small></div></div>
          <div className="partner-auth__benefit"><span className="partner-auth__benefit-icon"><Users size={16} /></span><div><strong>Grow audience</strong><small>Reach customers across GOWAYY</small></div></div>
        </div>
        <p className="partner-auth__legal"><ShieldCheck size={13} /> Secure partner access · One GOWAYY identity everywhere</p>
      </aside>
      <main className="partner-auth__panel">
        <Link to="/" className="partner-auth__mobile-brand"><img src="/brand/g-symbol.svg" width={30} height={30} alt="" /><span>GOWAYY PARTNER</span></Link>
        {children}
        <p className="partner-auth__footnote">By continuing you agree to GOWAYY Partner terms and privacy policy.</p>
      </main>
    </div>
  );
}

/** Shared-identity auth: the same GOWAYY account works in GOWAYY, PARTNER and EXPLORE. */
export function Login() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const showToast = useUI((s) => s.showToast);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({ email: false, password: false });
  const emailError = !email ? 'Email is required' : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'Enter a valid email' : '';
  const passwordError = !password ? 'Password is required' : '';
  const login = useMutation({
    mutationFn: async () => {
      const r = await client.login(email, password);
      const roles = (r.user.roles ?? []) as string[];
      const partnerRoles = ['restaurant', 'grocery', 'seller', 'property', 'tour_operator', 'driver', 'admin'];
      if (!roles.some((role) => partnerRoles.includes(role))) {
        throw new Error('This account has no partner access. Use a partner or the shared demo account.');
      }
      return r;
    },
    onSuccess: (r) => { setAuth(r.user, r.session.token); nav('/'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const canSubmit = !!email && !!password && !emailError && !login.isPending;
  return (
    <PartnerAuthShell title="Welcome back, partner" subtitle="Sign in with your GOWAYY account — manage stores, orders and payouts in one place." kicker="GOWAYY PARTNER">
      <form className="partner-auth__form" noValidate onSubmit={(e) => { e.preventDefault(); if (canSubmit) login.mutate(); }}>
        <div className="partner-auth__head">
          <h2>Sign in to Partner</h2>
          <p>Access your dashboard across restaurants, groceries, stays and experiences.</p>
        </div>

        <label className="field">
          <span className="label">Email address</span>
          <input
            className={`input ${touched.email && emailError ? 'input--error' : ''}`}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched({ ...touched, email: true })}
            autoComplete="email"
            placeholder="you@example.com"
            autoFocus
          />
          {touched.email && emailError && <span className="error" role="alert">{emailError}</span>}
        </label>

        <label className="field">
          <span className="label">Password</span>
          <div className="password-wrap">
            <input
              className={`input ${touched.password && passwordError ? 'input--error' : ''}`}
              type={show ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => setTouched({ ...touched, password: true })}
              autoComplete="current-password"
              placeholder="Your password"
            />
            <button className="password-toggle" type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
              {show ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          {touched.password && passwordError && <span className="error" role="alert">{passwordError}</span>}
        </label>

        <button className="btn btn--primary btn--block" disabled={!canSubmit} type="submit">
          {login.isPending ? (<><span className="anim-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Signing in…</>) : (<>Sign in <ArrowRight size={17} /></>)}
        </button>

        <div className="partner-auth__links">
          <Link className="link" to="/auth/forgot">Forgot password?</Link>
          <span>New here? <Link className="link" to="/auth/register">Create a partner account</Link></span>
        </div>
        <div className="notice notice--info" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 4 }}>
          <Sparkles size={16} style={{ flexShrink: 0, marginTop: 1 }} /> <span className="small">Your GOWAYY account works everywhere — GOWAYY, PARTNER and EXPLORE share one identity. Darjeeling demo: use your seeded partner credentials.</span>
        </div>
      </form>
    </PartnerAuthShell>
  );
}

export function Register() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const showToast = useUI((s) => s.showToast);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '' });
  const [regId, setRegId] = useState(''); const [demoOtp, setDemoOtp] = useState(''); const [code, setCode] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const strength = form.password.length >= 12 && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) && /[^A-Za-z0-9]/.test(form.password) ? 'Strong' : form.password.length >= 8 ? 'Medium' : 'Weak';
  const strengthScore = strength === 'Strong' ? 3 : strength === 'Medium' ? 2 : 1;
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email);
  const canSend = !!form.firstName.trim() && !!form.lastName.trim() && emailValid && form.password.length >= 8 && form.password === form.confirmPassword;
  const send = useMutation({
    mutationFn: () => client.register(form),
    onSuccess: (r) => { setRegId(r.registrationId); if (r.demoOtp) setDemoOtp(r.demoOtp); setStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const verify = useMutation({
    mutationFn: () => client.verifyOtp(regId, code, form.password),
    onSuccess: (r) => { if (r.verified) { setAuth(r.user, r.session.token); nav('/onboarding'); } else showToast(r.message, 'error'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });

  if (step === 1) {
    return (
      <PartnerAuthShell step={1} title="Verify your email" subtitle="We sent a secure code to activate your partner workspace." kicker="Step 2 of 2">
        <div className="partner-auth__form">
          <div className="partner-auth__head">
            <button type="button" className="partner-auth__back" onClick={() => { setStep(0); setCode(''); }}><ArrowLeft size={16} /> Back</button>
            <h2>Check your inbox</h2>
            <p className="small muted"><Mail size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />Code sent to <strong>{form.email}</strong> — expires in 5 minutes.</p>
          </div>
          {import.meta.env.DEV && demoOtp && (
            <details className="notice notice--info" style={{ }}>
              <summary className="small"><ShieldCheck size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Development verification code</summary>
              <p className="small" style={{ marginTop: 6 }}>No email provider connected. Test code: <strong style={{ fontFamily: 'var(--gw-mono)' }}>{demoOtp}</strong></p>
              <button type="button" className="btn btn--secondary btn--sm" style={{ marginTop: 8 }} onClick={() => setCode(demoOtp)}>Autofill code</button>
            </details>
          )}
          <label className="field">
            <span className="label">Verification code</span>
            <input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="••••••" style={{ fontFamily: 'var(--gw-mono)', fontSize: 22, letterSpacing: 8, textAlign: 'center' }} autoFocus />
            <span className="hint">Six-digit code — paste supported.</span>
          </label>
          <button className="btn btn--primary btn--block" disabled={code.length !== 6 || verify.isPending} onClick={() => verify.mutate()}>
            {verify.isPending ? (<><span className="anim-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Verifying…</>) : (<>Verify & continue <ArrowRight size={17} /></>)}
          </button>
          <button className="btn btn--ghost btn--sm" onClick={() => send.mutate()} disabled={send.isPending}>Resend code</button>
        </div>
      </PartnerAuthShell>
    );
  }

  return (
    <PartnerAuthShell step={0} title="Grow with GOWAYY" subtitle="One partner account for stores, kitchens, stays and experiences across the Darjeeling Himalaya." kicker="Join GOWAYY PARTNER — Step 1 of 2">
      <form className="partner-auth__form" noValidate onSubmit={(e) => { e.preventDefault(); if (canSend) send.mutate(); }}>
        <div className="partner-auth__head">
          <h2>Create your partner account</h2>
          <p>Your account works across GOWAYY, PARTNER and EXPLORE — one identity, every app.</p>
        </div>

        <div className="partner-auth__grid2">
          <label className="field">
            <span className="label">First name</span>
            <input className={`input ${touched.firstName && !form.firstName.trim() ? 'input--error' : ''}`} value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} onBlur={() => setTouched({ ...touched, firstName: true })} placeholder="Aarav" autoComplete="given-name" />
            {touched.firstName && !form.firstName.trim() && <span className="error" role="alert">First name is required</span>}
          </label>
          <label className="field">
            <span className="label">Last name</span>
            <input className={`input ${touched.lastName && !form.lastName.trim() ? 'input--error' : ''}`} value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} onBlur={() => setTouched({ ...touched, lastName: true })} placeholder="Sharma" autoComplete="family-name" />
            {touched.lastName && !form.lastName.trim() && <span className="error" role="alert">Last name is required</span>}
          </label>
        </div>

        <label className="field">
          <span className="label">Work email</span>
          <input className={`input ${touched.email && !emailValid ? 'input--error' : ''}`} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => setTouched({ ...touched, email: true })} placeholder="you@business.com" autoComplete="email" />
          {touched.email && !emailValid && form.email && <span className="error" role="alert">Enter a valid email</span>}
          <span className="hint">We will send a verification code to this address.</span>
        </label>

        <label className="field">
          <span className="label">Password</span>
          <div className="password-wrap">
            <input className="input" type={show ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} onBlur={() => setTouched({ ...touched, password: true })} placeholder="At least 8 characters" autoComplete="new-password" />
            <button className="password-toggle" type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          <div className="strength" aria-label={`Strength: ${strength}`}>
            {[1, 2, 3].map((n) => <span key={n} className={n <= strengthScore ? `on ${strength === 'Weak' ? 'weak' : strength === 'Medium' ? 'fair' : ''}` : ''} />)}
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--gw-text-muted)', flex: 1 }}>{strength} {form.password.length > 0 && `· ${form.password.length} characters`}</span>
          </div>
        </label>

        <label className="field">
          <span className="label">Confirm password</span>
          <div className="password-wrap">
            <input className={`input ${touched.confirmPassword && form.confirmPassword !== form.password ? 'input--error' : ''}`} type={show ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} onBlur={() => setTouched({ ...touched, confirmPassword: true })} placeholder="Repeat password" autoComplete="new-password" />
            <button className="password-toggle" type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
          {touched.confirmPassword && form.confirmPassword !== form.password && <span className="error" role="alert">Passwords do not match</span>}
        </label>

        <button className="btn btn--primary btn--block" disabled={!canSend || send.isPending} type="submit">
          {send.isPending ? (<><span className="anim-spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,.35)', borderTopColor: '#fff', borderRadius: '50%', display: 'inline-block' }} /> Sending code…</>) : (<>Continue <ArrowRight size={17} /></>)}
        </button>
        <p className="partner-auth__links-center">Already have an account? <Link className="link" to="/auth/login">Sign in</Link></p>

        <div className="partner-auth__trust">
          <span className="tiny muted" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span style={{ width: 28, height: 28, borderRadius: 999, background: '#F1EAF8', display: 'grid', placeItems: 'center' }}><Package size={14} /></span> One identity across GOWAYY, GOWAYY PARTNER and GOWAYY EXPLORE</span>
        </div>
      </form>
    </PartnerAuthShell>
  );
}
