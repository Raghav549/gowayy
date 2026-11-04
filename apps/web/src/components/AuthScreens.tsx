import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Check, Mail } from 'lucide-react';
import { stepOneSchema, stepTwoSchema, loginSchema, forgotSchema, assessPassword, otpSchema, type StepOne, type StepTwo } from '@gowayy/validation';
import { ApiError } from '@gowayy/api-client';
import { client } from '../lib/client';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { GSymbol, Field, DemoBanner } from './ui';

function AuthCard({ children, eyebrow, title, subtitle }: { children: React.ReactNode; eyebrow: string; title: string; subtitle?: string }) {
  return (
    <div className="auth-shell">
      <div className="auth-card">
        <div className="auth-card__brand"><GSymbol size={36} /><span className="eyebrow">GOWAYY</span></div>
        <div className="eyebrow" style={{ color: 'var(--gw-text-muted)' }}>{eyebrow}</div>
        <h2 style={{ marginTop: 6 }}>{title}</h2>
        {subtitle && <p className="muted small" style={{ marginTop: 6 }}>{subtitle}</p>}
        <div style={{ marginTop: 22 }}>{children}</div>
      </div>
    </div>
  );
}

const errorText = (e: unknown, fallback = 'Something went wrong. Please try again.') =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;

export function RegisterFlow() {
  const navigate = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const showToast = useUI((s) => s.showToast);
  const [step, setStep] = useState(1);
  const [names, setNames] = useState<StepOne>({ firstName: '', lastName: '' });
  const [credentials, setCredentials] = useState<StepTwo>({ email: '', password: '', confirmPassword: '' });
  const [registrationId, setRegistrationId] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [demoNotice, setDemoNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const nameForm = useForm<StepOne>({ resolver: zodResolver(stepOneSchema), mode: 'onChange', defaultValues: names });
  const credForm = useForm<StepTwo>({ resolver: zodResolver(stepTwoSchema), mode: 'onChange', defaultValues: credentials });
  const watchedPassword = credForm.watch('password');
  const strength = assessPassword(watchedPassword ?? '', { firstName: names.firstName, lastName: names.lastName, email: credentials.email });

  const submitNames = nameForm.handleSubmit((data) => { setNames(data); setStep(2); });
  const submitCredentials = credForm.handleSubmit(async (data) => {
    setServerError(null); setSubmitting(true);
    try {
      const r = await client.register({ ...names, ...data });
      setCredentials(data); setRegistrationId(r.registrationId);
      setDemoOtp(r.demoOtp ?? ''); setDemoNotice(r.demoNotice);
      setStep(3);
    } catch (e) { setServerError(errorText(e)); }
    finally { setSubmitting(false); }
  });

  return (
    <AuthCard eyebrow={`Step ${step} of 4`} title={['', 'What should we call you?', 'Secure your account', 'Verify your email', 'Your journey starts here'][step] ?? ''}
      subtitle={step === 2 ? 'Your password is hashed on the server and never stored in plain text.' : step === 3 ? 'Enter the six-digit code to continue.' : undefined}>
      <div className="steps">{[1,2,3,4].map((n) => <span key={n} className={`step ${n <= step ? 'done' : ''}`} />)}</div>

      {step === 1 && (
        <form onSubmit={submitNames} noValidate>
          <Field label="First name" error={nameForm.formState.errors.firstName?.message}>
            <input className={`input ${nameForm.formState.errors.firstName ? 'input--error' : ''}`} placeholder="e.g. Aarav" autoComplete="given-name" {...nameForm.register('firstName')} />
          </Field>
          <Field label="Last name" error={nameForm.formState.errors.lastName?.message}>
            <input className={`input ${nameForm.formState.errors.lastName ? 'input--error' : ''}`} placeholder="e.g. Sharma" autoComplete="family-name" {...nameForm.register('lastName')} />
          </Field>
          <button className="btn btn--primary btn--block" disabled={!nameForm.formState.isValid} type="submit">Continue <ArrowRight size={17} /></button>
          <div className="auth-card__footer">Already have an account? <Link className="link" to="/auth/login">Sign in</Link></div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitCredentials} noValidate>
          <Field label="Email address" error={credForm.formState.errors.email?.message}>
            <input className="input" type="email" placeholder="you@example.com" autoComplete="email" {...credForm.register('email')} />
          </Field>
          <Field label="Password" error={credForm.formState.errors.password?.message} hint={strength.suggestion}>
            <div className="password-wrap">
              <input className="input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 10 characters" {...credForm.register('password')} />
              <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            <div className="strength" aria-label={`Password strength: ${strength.label}`}>
              {[1,2,3,4].map((n) => <span key={n} className={n <= strength.score ? `on ${strength.score <= 1 ? 'weak' : strength.score === 2 ? 'fair' : ''}` : ''} />)}
            </div>
            <div className="tiny muted">{strength.label}{strength.issues.length ? ` · ${strength.issues.join(' · ')}` : ''}</div>
          </Field>
          <Field label="Confirm password" error={credForm.formState.errors.confirmPassword?.message}>
            <div className="password-wrap">
              <input className="input" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" {...credForm.register('confirmPassword')} />
              <button type="button" className="password-toggle" aria-label={showConfirm ? 'Hide password' : 'Show password'} onClick={() => setShowConfirm(!showConfirm)}>{showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </Field>
          {serverError && <div className="notice notice--demo" style={{ marginBottom: 12 }} role="alert">{serverError}</div>}
          <div className="row" style={{ gap: 10 }}>
            <button type="button" className="btn btn--secondary" onClick={() => setStep(1)}><ArrowLeft size={17} /> Back</button>
            <button className="btn btn--primary" style={{ flex: 1 }} disabled={!credForm.formState.isValid || !strength.valid || submitting} type="submit">{submitting ? 'Creating account…' : 'Create account'} <ArrowRight size={17} /></button>
          </div>
        </form>
      )}

      {step === 3 && <OtpStep registrationId={registrationId} demoOtp={demoOtp} demoNotice={demoNotice} email={credentials.email} password={credentials.password}
        onBack={() => setStep(2)} onVerified={(user, token) => { setAuth(user, token); setStep(4); }} />}

      {step === 4 && <WelcomeStep onDone={() => { showToast('You are signed in'); navigate('/'); }} />}
    </AuthCard>
  );
}

function OtpStep({ registrationId, demoOtp, demoNotice, email, password, onBack, onVerified }: {
  registrationId: string; demoOtp: string; demoNotice: string; email: string; password: string;
  onBack: () => void; onVerified: (user: import('@gowayy/types').User, token: string) => void;
}) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(30);
  const [expiresIn, setExpiresIn] = useState(300);
  const [currentOtp, setCurrentOtp] = useState(demoOtp);
  const refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    const t = window.setInterval(() => { setResendIn((v) => Math.max(0, v - 1)); setExpiresIn((v) => Math.max(0, v - 1)); }, 1000);
    return () => window.clearInterval(t);
  }, [registrationId]);

  const verify = async (code: string) => {
    if (!otpSchema.safeParse(code).success) { setError('Enter all six digits'); return; }
    setBusy(true); setError(null);
    try {
      const r = await client.verifyOtp(registrationId, code, password || undefined);
      if (!r.verified) { setError(r.message); setDigits(Array(6).fill('')); refs.current[0]?.focus(); }
      else onVerified(r.user, r.session.token);
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };
  const setDigit = (i: number, value: string) => {
    const clean = value.replace(/\D/g, '');
    if (clean.length > 1) { // paste support
      const arr = Array(6).fill('') as string[];
      clean.slice(0, 6).split('').forEach((c, k) => { arr[k] = c; });
      setDigits(arr); refs.current[Math.min(5, clean.length)]?.focus();
      void verify(arr.join('').padEnd(6, '0'));
      return;
    }
    const next = [...digits]; next[i] = clean; setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
    if (next.every((d) => d)) void verify(next.join(''));
  };
  const onKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) { const next = [...digits]; next[i - 1] = ''; setDigits(next); refs.current[i - 1]?.focus(); }
    if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
    if (e.key === 'ArrowRight' && i < 5) refs.current[i + 1]?.focus();
  };
  const resend = async () => {
    if (resendIn > 0) return;
    setBusy(true);
    try { const r = await client.resendOtp(registrationId); setCurrentOtp(r.demoOtp ?? ''); setResendIn(r.resendAfterSeconds ?? 30); setExpiresIn(300); setDigits(Array(6).fill('')); setError(null); refs.current[0]?.focus(); }
    catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  return (
    <div>
      <DemoBanner>{demoNotice} No email has been sent. Swap this adapter for a real email OTP provider before launch.</DemoBanner>
      <div className="notice notice--info" style={{ marginTop: 12 }}>
        <div className="row"><Mail size={16} /> <span>Code for <strong>{email}</strong></span></div>
        <div className="row between" style={{ marginTop: 8 }}>
          <span className="small">Demo code: <strong style={{ fontFamily: 'var(--gw-mono)', fontSize: 18, letterSpacing: 4 }}>{currentOtp}</strong></span>
          <button className="btn btn--ghost btn--sm" onClick={() => { setDigits(currentOtp.split('')); void verify(currentOtp); }}>Autofill</button>
        </div>
      </div>
      <div className="otp" onPaste={(e) => { e.preventDefault(); const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6); const arr = Array(6).fill('') as string[]; text.split('').forEach((c, k) => { arr[k] = c; }); setDigits(arr); if (text.length === 6) void verify(text); }}>
        {digits.map((d, i) => <input key={i} ref={(el) => { refs.current[i] = el; }} className={d ? 'filled' : ''} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} value={d}
          aria-label={`Digit ${i + 1}`} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)} autoFocus={i === 0} />)}
      </div>
      {error && <div className="error" role="alert" style={{ textAlign: 'center', marginBottom: 10 }}>{error}</div>}
      <div className="row between small muted">
        <span>Expires in {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, '0')}</span>
        <button className="link" disabled={resendIn > 0 || busy} onClick={resend}>{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</button>
      </div>
      {busy && <div className="row small muted" style={{ marginTop: 10 }}><span className="anim-spin" style={{ width: 12, height: 12, border: '2px solid var(--gw-border)', borderTopColor: 'var(--gw-champagne)', borderRadius: '50%' }} /> Verifying…</div>}
      <div className="row" style={{ marginTop: 20, gap: 10 }}>
        <button className="btn btn--secondary btn--block" onClick={onBack}><ArrowLeft size={17} /> Back</button>
        <button className="btn btn--primary btn--block" disabled={busy || digits.some((d) => !d)} onClick={() => void verify(digits.join(''))}>Verify <Check size={17} /></button>
      </div>
    </div>
  );
}

function WelcomeStep({ onDone }: { onDone: () => void }) {
  useEffect(() => { const t = window.setTimeout(onDone, 2200); return () => window.clearTimeout(t); }, [onDone]);
  return (
    <div className="welcome">
      <div className="welcome__ring"><GSymbol size={92} /></div>
      <h2>Welcome to GOWAYY</h2>
      <p className="muted" style={{ marginTop: 8 }}>Your account is ready. Let's plan a journey.</p>
      <button className="btn btn--primary btn--block" style={{ marginTop: 24 }} onClick={onDone}>Open home <ArrowRight size={17} /></button>
    </div>
  );
}

export function LoginScreen() {
  const navigate = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const form = useForm<{ email: string; password: string }>({ resolver: zodResolver(loginSchema), mode: 'onChange' });
  const submit = form.handleSubmit(async (d) => {
    setServerError(null);
    try { const r = await client.login(d.email, d.password); setAuth(r.user, r.session.token); navigate('/'); }
    catch (e) { setServerError(errorText(e)); }
  });
  return (
    <AuthCard eyebrow="Welcome back" title="Sign in to GOWAYY" subtitle="Continue with the account you created.">
      <form onSubmit={submit} noValidate>
        <Field label="Email address" error={form.formState.errors.email?.message}>
          <input className="input" type="email" autoComplete="email" placeholder="you@example.com" {...form.register('email')} />
        </Field>
        <Field label="Password" error={form.formState.errors.password?.message}>
          <div className="password-wrap">
            <input className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" {...form.register('password')} />
            <button type="button" className="password-toggle" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
          </div>
        </Field>
        {serverError && <div className="notice notice--demo" style={{ marginBottom: 12 }} role="alert">{serverError}</div>}
        <button className="btn btn--primary btn--block" type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}</button>
      </form>
      <div className="row between auth-card__footer" style={{ textAlign: 'left' }}>
        <Link className="link" to="/auth/forgot">Forgot password?</Link>
        <span>New here? <Link className="link" to="/auth/register">Create account</Link></span>
      </div>
    </AuthCard>
  );
}

export function ForgotScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'request' | 'reset'>('request');
  const [resetId, setResetId] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [notice, setNotice] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), mode: 'onChange' });
  const request = form.handleSubmit(async (d) => {
    setError(null);
    try { const r = await client.forgotPassword(d.email); setEmail(d.email); setResetId(r.resetId); setDemoCode(r.demoCode ?? ''); setNotice(r.demoNotice); setPhase('reset'); }
    catch (e) { setError(errorText(e)); }
  });
  const reset = async () => {
    setError(null);
    if (password.length < 10) { setError('Password must be at least 10 characters'); return; }
    try { await client.resetPassword(resetId, code, password); navigate('/auth/login'); }
    catch (e) { setError(errorText(e)); }
  };
  return (
    <AuthCard eyebrow="Account recovery" title={phase === 'request' ? 'Forgot your password?' : 'Set a new password'} subtitle="Demo reset adapter — no email is sent in this environment.">
      {phase === 'request' ? (
        <form onSubmit={request} noValidate>
          <Field label="Email address" error={form.formState.errors.email?.message}>
            <input className="input" type="email" autoComplete="email" placeholder="you@example.com" {...form.register('email')} />
          </Field>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn btn--primary btn--block" disabled={!form.formState.isValid} type="submit">Send reset code</button>
          <div className="auth-card__footer"><Link className="link" to="/auth/login">Back to sign in</Link></div>
        </form>
      ) : (
        <div>
          <DemoBanner>{notice}</DemoBanner>
          <div className="notice notice--info" style={{ margin: '12px 0' }}>Demo reset code for <strong>{email}</strong>: <strong style={{ fontFamily: 'var(--gw-mono)', letterSpacing: 3 }}>{demoCode}</strong></div>
          <Field label="Reset code"><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
          <Field label="New password" hint={assessPassword(password).suggestion}><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
          {error && <div className="error" role="alert">{error}</div>}
          <button className="btn btn--primary btn--block" onClick={() => void reset()}>Update password</button>
        </div>
      )}
    </AuthCard>
  );
}
