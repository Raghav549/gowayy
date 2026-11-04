// @vitest-environment jsdom
import { describe, expect, it, beforeAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { ComponentType, ReactNode } from 'react';

/**
 * Live rendering smoke test. It is skipped unless GOWAYY_LIVE_API is set and a
 * development API is running, so CI stays hermetic while a developer can verify
 * that real screens render against the real backend contract.
 */
const API = process.env.GOWAYY_LIVE_API ?? '';
const live = Boolean(API);

function Wrap({ children, path = '/' }: { children: ReactNode; path?: string }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 0 } } });
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

describe.skipIf(!live)('customer screens render against the live development API', () => {
  let Home: ComponentType;
  let Explore: ComponentType;
  let Categories: ComponentType;
  let ProductDetail: ComponentType;
  let CheckoutFlow: ComponentType;
  let Food: ComponentType;
  let Groceries: ComponentType;
  let productSlug = '';

  beforeAll(async () => {
    // Installed before the app modules (and their singleton API client) load.
    const realFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? `${API}${input}` : input;
      return realFetch(url, init);
    }) as typeof fetch;
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => undefined, removeEventListener: () => undefined }));

    const clientModule = await import('../../apps/gowayy-customer/web/src/lib/client');
    ({ client } = clientModule);
    ({ Home } = await import('../../apps/gowayy-customer/web/src/screens/Home'));
    ({ Explore } = await import('../../apps/gowayy-customer/web/src/screens/Explore'));
    ({ Categories } = await import('../../apps/gowayy-customer/web/src/screens/Categories'));
    ({ ProductDetail } = await import('../../apps/gowayy-customer/web/src/screens/ProductDetail'));
    ({ CheckoutFlow } = await import('../../apps/gowayy-customer/web/src/screens/CheckoutFlow'));
    ({ Food, Groceries } = await import('../../apps/gowayy-customer/web/src/screens/LocalMarket'));
    const { useSession } = await import('../../apps/gowayy-customer/web/src/store/useSession');

    const login = await client.login('customer@gowayy.app', 'Gw@yCustomer2026');
    clientModule.tokenStore.set(login.session.token);
    useSession.setState({ user: login.user, loading: false });
    const storefront = await client.storefront?.() as { featuredProducts?: Array<{ slug: string }>; newProducts?: Array<{ slug: string }> } | undefined;
    productSlug = storefront?.featuredProducts?.[0]?.slug ?? storefront?.newProducts?.[0]?.slug ?? '';
  });

  it('renders the customer home with the compact banner and illustrated categories', async () => {
    const { container } = render(<Wrap><Home /></Wrap>);
    expect(await screen.findByRole('heading', { name: /where to next/i })).toBeInTheDocument();
    expect(screen.getByRole('search')).toBeInTheDocument();
    for (const label of ['Cabs', 'Shared taxis', 'Hotels', 'Food', 'Groceries', 'Shop']) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(container.querySelectorAll('.cat-art').length).toBeGreaterThanOrEqual(9);
    expect(container.querySelector('.banner-carousel')).toBeTruthy();
    expect(screen.queryByText(/everything for this journey/i)).toBeNull();
    await waitFor(() => expect(container.querySelectorAll('.banner__media img').length).toBeGreaterThan(0));
    const img = container.querySelector('.banner__media img') as HTMLImageElement | null;
    expect(img?.getAttribute('src')).toMatch(/^\/images\//);
  });

  it('renders Explore and the dynamic Shop', async () => {
    render(<Wrap><Explore /></Wrap>);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getAllByText(/Darjeeling/i).length).toBeGreaterThan(0);

    render(<Wrap><Categories /></Wrap>);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('renders Food and Groceries from live partner listings', async () => {
    const food = render(<Wrap><Food /></Wrap>);
    expect(await screen.findByRole('heading', { name: /food & local kitchens/i })).toBeInTheDocument();
    await waitFor(() => expect(food.container.querySelectorAll('a[href^="/products/"]').length).toBeGreaterThan(0));
    food.unmount();

    const groceries = render(<Wrap><Groceries /></Wrap>);
    expect(await screen.findByRole('heading', { name: /groceries & daily needs/i })).toBeInTheDocument();
    await waitFor(() => expect(groceries.container.querySelectorAll('a[href^="/products/"]').length).toBeGreaterThanOrEqual(5));
    groceries.unmount();
  });

  it('renders a product detail and the multi-page checkout summary', async () => {
    if (!productSlug) return;
    render(<Wrap path={`/products/${productSlug}`}><Routes><Route path="/products/:slug" element={<ProductDetail />} /></Routes></Wrap>);
    expect(await screen.findByRole('heading', { level: 1 })).toBeInTheDocument();

    const storefront = await client.storefront?.() as { featuredProducts?: Array<{ id: string; variants?: Array<{ id: string }> }> } | undefined;
    const product = storefront?.featuredProducts?.[0];
    if (product?.variants?.[0]) {
      await client.addToCart({ productId: product.id, variantId: product.variants[0].id, quantity: 1 });
      render(<Wrap path="/checkout?step=summary"><Routes><Route path="/checkout" element={<CheckoutFlow />} /></Routes></Wrap>);
      expect(await screen.findByRole('heading', { name: /order summary/i })).toBeInTheDocument();
      expect(screen.getByText(/bill details/i)).toBeInTheDocument();
      await client.clearCart().catch(() => undefined);
    }
  });
});

let client: import('@gowayy/api-client').GowayyClient;
