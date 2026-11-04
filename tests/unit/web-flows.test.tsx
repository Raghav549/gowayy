import { describe, expect, it, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Onboarding } from '../../apps/gowayy-customer/web/src/components/Onboarding';

const user = {
  id: 'usr_1', firstName: 'Aarav', lastName: 'Sharma', email: 'aarav@example.com',
  roles: ['customer'], createdAt: '2026-11-04T00:00:00.000Z', deletedAt: null,
};

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
  let payload: unknown = {};
  if (url.includes('/auth/register')) {
    payload = {
      registrationId: 'reg_1', otpRequired: true, expiresAt: '2026-11-04T00:05:00.000Z',
      resendAfterSeconds: 30, demoMode: true, demoOtp: '123456',
      demoNotice: 'DEMO OTP ADAPTER — this is not real email verification.',
    };
  } else if (url.includes('/auth/otp/verify')) {
    payload = body.code === '123456'
      ? { verified: true, user, session: { token: 'tok_test', userId: user.id, expiresAt: '2026-12-04T00:00:00.000Z' } }
      : { verified: false, error: 'OTP_INCORRECT', message: 'That code is incorrect', attemptsRemaining: 4 };
  } else if (url.includes('/auth/otp/send')) {
    payload = { sent: true, expiresAt: '2026-11-04T00:05:00.000Z', resendAfterSeconds: 30, demoMode: true, demoOtp: '654321', demoNotice: 'DEMO OTP ADAPTER — no email was sent.' };
  }
  return { ok: true, status: 200, json: async () => payload } as unknown as Response;
});

let RegisterFlow: typeof import('../../apps/gowayy-customer/web/src/components/AuthScreens').RegisterFlow;
beforeAll(async () => {
  vi.stubGlobal('fetch', fetchMock);
  ({ RegisterFlow } = await import('../../apps/gowayy-customer/web/src/components/AuthScreens'));
});
afterEach(() => { cleanup(); fetchMock.mockClear(); window.localStorage.clear(); });

describe('lavender illustrated onboarding', () => {
  it('shows five distinct service scenes with working controls, swipe navigation and indicators', () => {
    const onFinish = vi.fn();
    const { container } = render(<Onboarding onFinish={onFinish} />);
    expect(screen.getAllByRole('tab')).toHaveLength(5);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Fresh finds, right to your door.');
    expect(screen.getByRole('button', { name: /previous page/i })).toBeDisabled();
    expect(screen.getByRole('img', { name: /vegetables and fruit bob gently/i })).toBeInTheDocument();
    expect((screen.getByRole('img', { name: /vegetables and fruit bob gently/i }) as HTMLImageElement).src).toContain('groceries-animated.webp');

    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A smoother way to get there.');
    expect(screen.getByRole('img', { name: /car arrives while its passenger waves/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Settle into somewhere lovely.');

    fireEvent.click(screen.getByRole('button', { name: /previous page/i }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('A smoother way to get there.');
    const el = container.querySelector('.onboarding')!;
    fireEvent.pointerDown(el, { clientX: 300 });
    fireEvent.pointerUp(el, { clientX: 200 });
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Settle into somewhere lovely.');

    fireEvent.click(screen.getByRole('tab', { name: /go to destinations/i }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Find the places worth the trip.');
    fireEvent.click(screen.getByRole('tab', { name: /go to local experiences/i }));
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Make room for the local story.');
    fireEvent.click(screen.getByRole('button', { name: /get started/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('skip works from the first screen', () => {
    const onFinish = vi.fn();
    render(<Onboarding onFinish={onFinish} />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });
});

describe('multi-step registration and OTP', () => {
  it('gates step one on valid names, validates passwords, then verifies the OTP', async () => {
    render(<MemoryRouter><RegisterFlow /></MemoryRouter>);
    const next = screen.getByRole('button', { name: /continue/i });
    expect(next).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText('e.g. Aarav'), { target: { value: 'Aarav' } });
    fireEvent.change(screen.getByPlaceholderText('e.g. Sharma'), { target: { value: 'Sharma' } });
    await waitFor(() => expect(next).toBeEnabled());
    fireEvent.click(next);

    // react-hook-form's handleSubmit resolves asynchronously after validation.
    await waitFor(() => expect(screen.getByText('Secure your account')).toBeInTheDocument());
    const create = screen.getByRole('button', { name: /create account/i });
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText('you@example.com'), { target: { value: 'aarav@example.com' } });
    fireEvent.change(screen.getByPlaceholderText('At least 10 characters'), { target: { value: 'weak' } });
    expect(screen.getByLabelText(/Password strength/i)).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('At least 10 characters'), { target: { value: 'Orchid!Ridge42' } });
    fireEvent.change(screen.getByPlaceholderText('Repeat your password'), { target: { value: 'Orchid!Ridge42' } });
    await waitFor(() => expect(create).toBeEnabled());
    fireEvent.click(create);

    await waitFor(() => expect(screen.getByText(/Verify your email/i)).toBeInTheDocument());
    expect(screen.getByText(/DEVELOPMENT MODE/i)).toBeInTheDocument();
    expect(screen.getByText(/DEMO OTP ADAPTER/i)).toBeInTheDocument();
    const digits = Array.from({ length: 6 }, (_, i) => screen.getByLabelText(`Digit ${i + 1}`));
    expect(digits).toHaveLength(6);

    // Paste support: a wrong code shows an error and clears the boxes.
    fireEvent.paste(digits[0], { clipboardData: { getData: () => '000000' } });
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/incorrect/i));
    expect((digits[0] as HTMLInputElement).value).toBe('');

    // The labelled demo OTP adapter verifies successfully and opens the welcome screen.
    fireEvent.click(screen.getByRole('button', { name: /autofill/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: /Welcome to GOWAYY/i })).toBeInTheDocument());
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/auth/otp/verify'))).toBe(true);
  });
});
