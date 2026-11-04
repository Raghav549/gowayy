import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, EyeOff, Check, Mail, ShieldCheck } from 'lucide-react';
import { stepOneSchema, stepTwoSchema, loginSchema, forgotSchema, assessPassword, otpSchema, type StepOne, type StepTwo } from '@gowayy/validation';
import { ApiError } from '@gowayy/api-client';
import { client } from '../lib/client';
import { useSession } from '../store/useSession';
import { useUI } from '../store/useUI';
import { GSymbol } from './ui';

const STEP_COPY = [
  { kicker: 'Step 1 of 4', title: 'Tell us who you are', hint: 'We use your name on bookings, invoices and delivery updates.' },
  { kicker: 'Step 2 of 4', title: 'Secure your account', hint: 'Use at least 10 characters with a mix of letters and numbers.' },
  { kicker: 'Step 3 of 4', title: 'Verify your email', hint: 'Enter the six-digit code we sent to your inbox.' },
  { kicker: 'Step 4 of 4', title: 'You are all set', hint: 'Your GOWAYY account is ready across travel, stays and shopping.' },
];

const errorText = (e: unknown, fallback = 'Something went wrong. Please try again.') =>
  e instanceof ApiError ? e.message : e instanceof Error ? e.message : fallback;

/** A full-page auth layout: every registration step is its own screen. */
function AuthPage({ step, children }: { step: number; children: React.ReactNode }) {
  const copy = STEP_COPY[step - 1] ?? STEP_COPY[0];
  return (
    <div className={`auth-page auth-page--step${step}`}>
      <aside className="auth-page__aside" aria-hidden="true">
        <Link to="/" className="auth-brand"><GSymbol size={40} /><span>GOWAYY</span></Link>
        <div className="auth-page__aside-copy">
          <div className="eyebrow">{copy.kicker}</div>
          <h1>{copy.title}</h1>
          <p>{copy.hint}</p>
        </div>
        <ol className="auth-steps">
          {STEP_COPY.map((c, i) => (
            <li key={c.kicker} className={i + 1 < step ? 'is-done' : i + 1 === step ? 'is-current' : ''}>
              <span>{i + 1 < step ? <Check size={13} /> : i + 1}</span>
              {c.title}
            </li>
          ))}
        </ol>
        <p className="auth-page__legal">By continuing you agree to the GOWAYY terms and privacy policy.</p>
      </aside>
      <main className="auth-page__panel">
        <div className="auth-page__brand"><GSymbol size={32} /><span className="eyebrow">GOWAYY</span></div>
        {children}
      </main>
    </div>
  );
}

export function RegisterFlow() {
  const navigate = useNavigate();
  const setAuth = useSession((s) => s.setAuth);
  const showToast = useUI((s) => s.showToast);
  const [step, setStep] = useState(1);
  const [names, setNames] = useState<StepOne>({ firstName: '', lastName: '' });
  const [credentials, setCredentials] = useState<StepTwo>({ email: '', password: '', confirmPassword: '' });
  const [registrationId, setRegistrationId] = useState('');
  const [demoOtp, setDemoOtp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const nameForm = useForm<StepOne>({ resolver: zodResolver(stepOneSchema), mode: 'onChange', defaultValues: names });
  const credForm = useForm<StepTwo>({ resolver: zodResolver(stepTwoSchema), mode: 'onChange', defaultValues: credentials });
  const watchedPassword = credForm.watch('password');
  const strength = assessPassword(watchedPassword ?? '', { firstName: names.firstName, lastName: names.lastName, email: credentials.email });
  const goToStep = (next: number) => { setServerError(null); setStep(next); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  const submitNames = nameForm.handleSubmit((data) => { setNames(data); goToStep(2); });
  const submitCredentials = credForm.handleSubmit(async (data) => {
    setServerError(null); setSubmitting(true);
    try {
      const r = await client.register({ ...names, ...data });
      setCredentials(data); setRegistrationId(r.registrationId); setDemoOtp(r.demoOtp ?? '');
      goToStep(3);
    } catch (e) { setServerError(errorText(e)); }
    finally { setSubmitting(false); }
  });

  return (
    <AuthPage step={step}>
      {step === 1 && (
        <form onSubmit={submitNames} noValidate className="auth-form">
          <h2>What should we call you?</h2>
          <p className="muted small">Your first and last name appear on invoices and booking confirmations.</p>
          <label className="field">
            <span className="label">First name</span>
            <input className={`input ${nameForm.formState.errors.firstName ? 'input--error' : ''}`} placeholder="e.g. Aarav" autoComplete="given-name" autoFocus {...nameForm.register('firstName')} />
            {nameForm.formState.errors.firstName && <span className="error" role="alert">{nameForm.formState.errors.firstName.message}</span>}
          </label>
          <label className="field">
            <span className="label">Last name</span>
            <input className={`input ${nameForm.formState.errors.lastName ? 'input--error' : ''}`} placeholder="e.g. Sharma" autoComplete="family-name" {...nameForm.register('lastName')} />
            {nameForm.formState.errors.lastName && <span className="error" role="alert">{nameForm.formState.errors.lastName.message}</span>}
          </label>
          <button className="btn btn--primary btn--block" disabled={!nameForm.formState.isValid} type="submit">Continue <ArrowRight size={17} /></button>
          <p className="auth-footnote">Already have an account? <Link className="link" to="/auth/login">Sign in</Link></p>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={submitCredentials} noValidate className="auth-form">
          <button type="button" className="auth-back" onClick={() => goToStep(1)}><ArrowLeft size={16} /> Back</button>
          <h2>Create your sign-in details</h2>
          <p className="muted small">Signing in as {names.firstName} {names.lastName}.</p>
          <label className="field">
            <span className="label">Email address</span>
            <input className="input" type="email" placeholder="you@example.com" autoComplete="email" autoFocus {...credForm.register('email')} />
            {credForm.formState.errors.email && <span className="error" role="alert">{credForm.formState.errors.email.message}</span>}
          </label>
          <label className="field">
            <span className="label">Password</span>
            <div className="password-wrap">
              <input className="input" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 10 characters" {...credForm.register('password')} />
              <button type="button" className="password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            <div className="strength" aria-label={`Password strength: ${strength.label}`}>
              {[1, 2, 3, 4].map((n) => <span key={n} className={n <= strength.score ? `on ${strength.score <= 1 ? 'weak' : strength.score === 2 ? 'fair' : ''}` : ''} />)}
            </div>
            <span className="hint">{strength.label}{strength.issues.length ? ` · ${strength.issues.join(' · ')}` : ''}</span>
          </label>
          <label className="field">
            <span className="label">Confirm password</span>
            <div className="password-wrap">
              <input className="input" type={showConfirm ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" {...credForm.register('confirmPassword')} />
              <button type="button" className="password-toggle" aria-label={showConfirm ? 'Hide password' : 'Show password'} onClick={() => setShowConfirm(!showConfirm)}>{showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {credForm.formState.errors.confirmPassword && <span className="error" role="alert">{credForm.formState.errors.confirmPassword.message}</span>}
          </label>
          {serverError && <div className="notice notice--info" role="alert">{serverError}</div>}
          <button className="btn btn--primary btn--block" disabled={!credForm.formState.isValid || !strength.valid || submitting} type="submit">{submitting ? 'Creating account…' : 'Continue'} <ArrowRight size={17} /></button>
        </form>
      )}

      {step === 3 && (
        <OtpStep
          registrationId={registrationId} demoOtp={demoOtp} email={credentials.email} password={credentials.password}
          onBack={() => goToStep(2)}
          onVerified={(user, token) => { setAuth(user, token); goToStep(4); }}
        />
      )}

      {step === 4 && (
        <div className="auth-form welcome">
          <div className="welcome__ring"><GSymbol size={86} /></div>
          <h2>Welcome to GOWAYY, {names.firstName}</h2>
          <p className="muted">Your account is verified. Start with a destination, a stay or tonight's dinner.</p>
          <button className="btn btn--primary btn--block" style={{ marginTop: 22 }} onClick={() => { showToast('Welcome to GOWAYY', 'success'); navigate('/'); }}>Continue to the app <ArrowRight size={17} /></button>
        </div>
      )}
    </AuthPage>
  );
}

function OtpStep({ registrationId, demoOtp, email, password, onBack, onVerified }: {
  registrationId: string; demoOtp: string; email: string; password: string;
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
    if (clean.length > 1) {
      const arr = Array(6).fill('') as string[];
      clean.slice(0, 6).split('').forEach((c, k) => { arr[k] = c; });
      setDigits(arr); refs.current[Math.min(5, clean.length)]?.focus();
      if (clean.length === 6) void verify(clean);
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
    try {
      const r = await client.resendOtp(registrationId);
      setCurrentOtp(r.demoOtp ?? ''); setResendIn(r.resendAfterSeconds ?? 30); setExpiresIn(300);
      setDigits(Array(6).fill('')); setError(null); refs.current[0]?.focus();
    } catch (e) { setError(errorText(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-form otp-step">
      <button type="button" className="auth-back" onClick={onBack}><ArrowLeft size={16} /> Back</button>
      <h2>Check your inbox</h2>
      <p className="muted small row" style={{ gap: 6 }}><Mail size={15} /> We sent a six-digit code to <strong>{email}</strong>.</p>

      <div className="otp" onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
        const arr = Array(6).fill('') as string[];
        text.split('').forEach((c, k) => { arr[k] = c; }); setDigits(arr);
        if (text.length === 6) void verify(text);
      }}>
        {digits.map((d, i) => (
          <input key={i} ref={(el) => { refs.current[i] = el; }} className={d ? 'filled' : ''} inputMode="numeric" autoComplete={i === 0 ? 'one-time-code' : 'off'} maxLength={6} value={d}
            aria-label={`Digit ${i + 1}`} onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)} autoFocus={i === 0} />
        ))}
      </div>
      {error && <div className="error" role="alert" style={{ textAlign: 'center' }}>{error}</div>}
      <div className="row between small muted">
        <span>Code expires in {Math.floor(expiresIn / 60)}:{String(expiresIn % 60).padStart(2, '0')}</span>
        <button className="link" disabled={resendIn > 0 || busy} onClick={() => void resend()}>{resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}</button>
      </div>
      {busy && <div className="row small muted" style={{ marginTop: 10 }}><span className="anim-spin" style={{ width: 12, height: 12, border: '2px solid var(--gw-border)', borderTopColor: 'var(--gw-champagne)', borderRadius: '50%' }} /> Verifying…</div>}
      <button className="btn btn--primary btn--block" disabled={busy || digits.some((d) => !d)} onClick={() => void verify(digits.join(''))}>Verify email <Check size={17} /></button>

      {import.meta.env.DEV && currentOtp && (
        <details className="dev-otp">
          <summary>Development test code</summary>
          <p className="small">No email provider is connected in this development build. Test code: <strong>{currentOtp}</strong></p>
          <button type="button" className="btn btn--secondary btn--sm" onClick={() => { setDigits(currentOtp.split('')); void verify(currentOtp); }}>Autofill code</button>
        </details>
      )}
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
    <div className="auth-page auth-page--login">
      <aside className="auth-page__aside" aria-hidden="true">
        <Link to="/" className="auth-brand"><GSymbol size={40} /><span>GOWAYY</span></Link>
        <div className="auth-page__aside-copy">
          <div className="eyebrow">Welcome back</div>
          <h1>One account. Every journey.</h1>
          <p>Stays, cabs, food, groceries and local shops across the Darjeeling Himalaya.</p>
        </div>
        <p className="auth-page__legal"><ShieldCheck size={14} /> Sessions are protected with server-side tokens.</p>
      </aside>
      <main className="auth-page__panel">
        <div className="auth-page__brand"><GSymbol size={32} /><span className="eyebrow">GOWAYY</span></div>
        <form onSubmit={submit} noValidate className="auth-form">
          <h2>Sign in</h2>
          <label className="field"><span className="label">Email address</span><input className="input" type="email" autoComplete="email" placeholder="you@example.com" autoFocus {...form.register('email')} />
            {form.formState.errors.email && <span className="error" role="alert">{form.formState.errors.email.message}</span>}
          </label>
          <label className="field"><span className="label">Password</span>
            <div className="password-wrap">
              <input className="input" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Your password" {...form.register('password')} />
              <button type="button" className="password-toggle" aria-label="Toggle password visibility" onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
            {form.formState.errors.password && <span className="error" role="alert">{form.formState.errors.password.message}</span>}
          </label>
          {serverError && <div className="notice notice--info" role="alert">{serverError}</div>}
          <button className="btn btn--primary btn--block" type="submit" disabled={!form.formState.isValid || form.formState.isSubmitting}>{form.formState.isSubmitting ? 'Signing in…' : 'Sign in'}</button>
          <div className="row between auth-footnote">
            <Link className="link" to="/auth/forgot">Forgot password?</Link>
            <span>New here? <Link className="link" to="/auth/register">Create account</Link></span>
          </div>
        </form>
      </main>
    </div>
  );
}

export function ForgotScreen() {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<'request' | 'reset'>('request');
  const [resetId, setResetId] = useState('');
  const [demoCode, setDemoCode] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ email: string }>({ resolver: zodResolver(forgotSchema), mode: 'onChange' });
  const request = form.handleSubmit(async (d) => {
    setError(null);
    try { const r = await client.forgotPassword(d.email); setEmail(d.email); setResetId(r.resetId); setDemoCode(r.demoCode ?? ''); setPhase('reset'); }
    catch (e) { setError(errorText(e)); }
  });
  const reset = async () => {
    setError(null);
    if (password.length < 10) { setError('Password must be at least 10 characters'); return; }
    try { await client.resetPassword(resetId, code, password); navigate('/auth/login'); }
    catch (e) { setError(errorText(e)); }
  };
  return (
    <div className="auth-page auth-page--login">
      <aside className="auth-page__aside" aria-hidden="true">
        <Link to="/" className="auth-brand"><GSymbol size={40} /><span>GOWAYY</span></Link>
        <div className="auth-page__aside-copy"><div className="eyebrow">Account recovery</div><h1>{phase === 'request' ? 'Reset your password' : 'Choose a new password'}</h1><p>We will email a reset code to your registered address.</p></div>
      </aside>
      <main className="auth-page__panel">
        <div className="auth-page__brand"><GSymbol size={32} /><span className="eyebrow">GOWAYY</span></div>
        {phase === 'request' ? (
          <form onSubmit={request} noValidate className="auth-form">
            <h2>Forgot your password?</h2>
            <label className="field"><span className="label">Email address</span><input className="input" type="email" autoComplete="email" placeholder="you@example.com" autoFocus {...form.register('email')} />
              {form.formState.errors.email && <span className="error" role="alert">{form.formState.errors.email.message}</span>}
            </label>
            {error && <div className="notice notice--info" role="alert">{error}</div>}
            <button className="btn btn--primary btn--block" disabled={!form.formState.isValid} type="submit">Send reset code</button>
            <p className="auth-footnote"><Link className="link" to="/auth/login">Back to sign in</Link></p>
          </form>
        ) : (
          <div className="auth-form">
            <h2>Set a new password</h2>
            <p className="small muted">Reset code sent to <strong>{email}</strong>.</p>
            <label className="field"><span className="label">Reset code</span><input className="input" inputMode="numeric" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></label>
            <label className="field"><span className="label">New password</span><input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <span className="hint">{assessPassword(password).suggestion}</span>
            </label>
            {error && <div className="notice notice--info" role="alert">{error}</div>}
            <button className="btn btn--primary btn--block" onClick={() => void reset()}>Update password</button>
            {import.meta.env.DEV && demoCode && (
              <details className="dev-otp"><summary>Development test code</summary><p className="small">No email provider is connected in this development build. Test code: <strong>{demoCode}</strong></p></details>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
