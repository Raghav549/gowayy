import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
import { client } from '../lib/client';
import { useSession } from '../store';
import { useUI } from '../store';
import { Field, Brand } from '@gowayy/ui';
import { Mascot } from '@gowayy/ui';

/** Shared-identity auth: the same GOWAYY account works in GOWAYY, PARTNER and EXPLORE. */
export function Login() {
  const nav = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const showToast = useUI((s) => s.showToast);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [show, setShow] = useState(false);
  const login = useMutation({
    mutationFn: () => client.login(email, password),
    onSuccess: (r) => { setAuth(r.user, r.session.token); nav('/'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  return (
    <div className="stack" style={{ maxWidth: 420, margin: '6vh auto' }}>
      <Brand />
      <h1 style={{ fontSize: 26 }}>Welcome back, partner</h1>
      <p className="small muted">Sign in with your GOWAYY account — one identity across GOWAYY, GOWAYY PARTNER and GOWAYY EXPLORE.</p>
      <Field label="Email"><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
      <Field label="Password"><div className="row"><input className="input" type={show ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" style={{ flex: 1 }} /><button className="icon-btn" type="button" onClick={() => setShow(!show)} aria-label="Toggle password visibility">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div></Field>
      <button className="btn btn--primary btn--block" disabled={!email || !password || login.isPending} onClick={() => login.mutate()}>{login.isPending ? 'Signing in…' : 'Sign in'}</button>
      <p className="small muted">New here? <Link className="link" to="/auth/register">Create a partner account</Link></p>
    </div>
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
  const strength = form.password.length >= 12 && /[A-Z]/.test(form.password) && /[0-9]/.test(form.password) && /[^A-Za-z0-9]/.test(form.password) ? 'Strong' : form.password.length >= 8 ? 'Medium' : 'Weak';
  const send = useMutation({
    mutationFn: () => client.register(form),
    onSuccess: (r) => { setRegId(r.registrationId); if (r.demoOtp) setDemoOtp(r.demoOtp); setStep(1); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  const verify = useMutation({
    mutationFn: () => client.verifyOtp(regId, code),
    onSuccess: (r) => { if (r.verified) { setAuth(r.user, r.session.token); nav('/onboarding'); } else showToast(r.message, 'error'); },
    onError: (e: Error) => showToast(e.message, 'error'),
  });
  return (
    <div className="stack" style={{ maxWidth: 420, margin: '6vh auto' }}>
      <Brand />
      {step === 0 ? (
        <>
          <h1 style={{ fontSize: 26 }}>Create your partner account</h1>
          <Field label="First name"><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
          <Field label="Last name"><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
          <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Password" hint={`Strength: ${strength}`}>
            <div className="row"><input className="input" type={show ? 'text' : 'password'} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} style={{ flex: 1 }} /><button className="icon-btn" type="button" onClick={() => setShow(!show)}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
          </Field>
          <Field label="Confirm password" error={form.confirmPassword && form.confirmPassword !== form.password ? 'Passwords do not match' : undefined}>
            <input className="input" type={show ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })} />
          </Field>
          <button className="btn btn--primary btn--block" disabled={!form.firstName || !form.lastName || !form.email || form.password !== form.confirmPassword || form.password.length < 8 || send.isPending} onClick={() => send.mutate()}>{send.isPending ? 'Sending code…' : 'Continue'}</button>
          <p className="small muted">Already have an account? <Link className="link" to="/auth/login">Sign in</Link></p>
        </>
      ) : (
        <>
          <h1 style={{ fontSize: 26 }}>Verify your email</h1>
          <p className="small muted">Enter the six-digit code sent to {form.email}.</p>
          {demoOtp && <details className="notice notice--info" style={{ marginTop: 10 }}><summary className="small"><ShieldCheck size={14} /> Development verification code</summary><p className="small" style={{ marginTop: 6 }}>No email provider is connected in this build. Test code: <strong style={{ fontFamily: 'var(--gw-mono)' }}>{demoOtp}</strong></p></details>}
          <Field label="Verification code"><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ fontFamily: 'var(--gw-mono)', fontSize: 22, letterSpacing: 8, textAlign: 'center' }} /></Field>
          <button className="btn btn--primary btn--block" disabled={code.length !== 6 || verify.isPending} onClick={() => verify.mutate()}>{verify.isPending ? 'Verifying…' : 'Verify & continue'}</button>
          <button className="btn btn--ghost btn--sm" onClick={() => send.mutate()}>Resend code</button>
        </>
      )}
      <div className="row" style={{ gap: 10, marginTop: 10 }}><Mascot pose="welcoming" size={64} /><p className="tiny muted">Kanchu welcomes you. Your account works across all three GOWAYY apps.</p></div>
    </div>
  );
}
