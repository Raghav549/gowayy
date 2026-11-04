/**
 * GOWAYY commerce engine — shared, pure business logic for the marketplace
 * (product detail assembly, cart math, checkout quotes, payment-method
 * availability). Used by the dev-api backend, the Supabase Edge gateway and
 * all three applications. Nothing here trusts the client: prices and stock are
 * always recomputed server-side from catalogue + inventory records.
 */

export interface ProductImageAsset {
  status: 'verified' | 'unavailable';
  path?: string;
  alt: string;
  credit?: string;
  license?: string;
  sourceUrl?: string;
  verificationNote?: string;
}

export interface ProductVariant {
  id: string;
  label: string;            // e.g. "Ice Blue"
  pricePaise: number;
  mrpPaise: number;
  stock: number;
  image?: ProductImageAsset;
}

export interface ProtectionPlan {
  id: string;
  provider: string;         // real provider name only; demo plans are labelled
  demo?: boolean;
  title: string;
  pricePaise: number;
  mrpPaise?: number;
  perMonthPaise?: number;
  coverage: string[];
  terms: string;
  exclusions: string[];
}

export interface MarketplaceProduct {
  id: string;
  slug: string;
  storeId: string;
  brand: string;
  name: string;
  category: string;
  dataClass: 'demo-listing' | 'verified-listing';
  rating?: { average: number; count: number; source: 'verified-booking' | 'verified-purchase' }; // only when genuine
  highlights: string[];
  highlightsNote?: string;
  description: string;
  specifications: Array<{ label: string; value: string }>;
  inTheBox: string[];
  warranty?: string;
  faq: Array<{ q: string; a: string }>;
  images: ProductImageAsset[];
  variants: ProductVariant[];
  protectionPlans: ProtectionPlan[];
  relatedProductIds: string[];
  deliveryNote: string;
}

export interface CartLine {
  productId: string;
  variantId: string;
  quantity: number;
  /** Snapshot taken at add-to-cart time; the server re-validates at quote time. */
  unitPricePaise: number;
  protectionPlanId?: string | null;
}

export interface Coupon {
  code: string;
  kind: 'flat' | 'percent';
  valuePaise?: number;
  valuePercent?: number;
  maxPaise?: number;
  minSubtotalPaise: number;
  active: boolean;
}

export const GST_PERCENT = 5;

export function discountPercent(mrpPaise: number, pricePaise: number): number {
  if (mrpPaise <= 0 || pricePaise >= mrpPaise) return 0;
  return Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100);
}

export function cartSubtotalPaise(lines: Array<{ unitPricePaise: number; quantity: number }>): number {
  return lines.reduce((sum, l) => sum + l.unitPricePaise * l.quantity, 0);
}

export function couponDiscountPaise(coupon: Coupon, subtotalPaise: number): number {
  if (!coupon.active || subtotalPaise < coupon.minSubtotalPaise) return 0;
  if (coupon.kind === 'flat') return Math.min(coupon.valuePaise ?? 0, subtotalPaise);
  return Math.min(coupon.maxPaise ?? Number.MAX_SAFE_INTEGER, Math.round((subtotalPaise * (coupon.valuePercent ?? 0)) / 100));
}

export interface CheckoutQuoteInput {
  lines: Array<{ unitPricePaise: number; quantity: number; protectionPlanId?: string | null }>;
  protectionPlans: ProtectionPlan[];
  deliveryFeePaise: number;
  coupon?: Coupon | null;
  taxPercent?: number;
}

export interface CheckoutQuote {
  itemsPaise: number;
  protectionPaise: number;
  deliveryFeePaise: number;
  discountPaise: number;
  taxPaise: number;
  totalPaise: number;
  savingsPaise: number; // MRP-based savings surfaced to the customer (informational)
  mrpTotalPaise: number;
  appliedCoupon: string | null;
}

/** Server-side checkout quote. All amounts recomputed from validated lines. */
export function quoteCheckout(input: CheckoutQuoteInput): CheckoutQuote {
  const itemsPaise = cartSubtotalPaise(input.lines);
  const protectionPaise = input.lines.reduce((sum, l) => {
    if (!l.protectionPlanId) return sum;
    const plan = input.protectionPlans.find((p) => p.id === l.protectionPlanId);
    return sum + (plan ? plan.pricePaise * l.quantity : 0);
  }, 0);
  const discountPaise = input.coupon ? couponDiscountPaise(input.coupon, itemsPaise) : 0;
  const taxable = Math.max(0, itemsPaise + protectionPaise + input.deliveryFeePaise - discountPaise);
  const taxPaise = Math.round((taxable * (input.taxPercent ?? GST_PERCENT)) / 100);
  const totalPaise = taxable + taxPaise;
  return {
    itemsPaise, protectionPaise, deliveryFeePaise: input.deliveryFeePaise, discountPaise, taxPaise, totalPaise,
    savingsPaise: 0, mrpTotalPaise: itemsPaise, appliedCoupon: input.coupon && discountPaise > 0 ? input.coupon.code : null,
  };
}

export type PaymentMethodId = 'upi' | 'upi_intent' | 'card' | 'netbanking' | 'wallet' | 'cod' | 'emi';

export interface PaymentMethodOption {
  id: PaymentMethodId;
  label: string;
  detail: string;
  available: boolean;
  unavailableReason?: string;
  /** True only when a real provider integration is configured server-side. */
  integrated: boolean;
  recommended?: boolean;
  cashbackPaise?: number;
}

/**
 * Payment-method availability. A method is only `available` when its provider
 * is genuinely integrated AND operationally supported for the order (e.g. COD
 * is unavailable above a server-side limit). Never trust the client.
 */
export function paymentMethodOptions(opts: {
  codAllowed: boolean;
  totalPaise: number;
  codMaxPaise: number;
  upiIntegrated: boolean;
  cardIntegrated: boolean;
  walletBalancePaise: number;
  walletCashbackPaise: number;
  upiCashbackPaise: number;
}): PaymentMethodOption[] {
  const { codAllowed, totalPaise, codMaxPaise, upiIntegrated, cardIntegrated, walletBalancePaise, walletCashbackPaise, upiCashbackPaise } = opts;
  return [
    { id: 'upi', label: 'Pay by any UPI app', detail: 'Google Pay, PhonePe, Paytm and more', available: upiIntegrated, integrated: upiIntegrated, recommended: upiIntegrated && upiCashbackPaise > 0, cashbackPaise: upiCashbackPaise || undefined },
    { id: 'card', label: 'Credit & debit cards', detail: 'Visa, Mastercard, RuPay via the configured gateway', available: cardIntegrated, integrated: cardIntegrated },
    { id: 'wallet', label: 'GOWAYY Wallet balance', detail: `Balance ₹${(walletBalancePaise / 100).toFixed(2)}`, available: walletBalancePaise > 0 || walletCashbackPaise > 0, integrated: true, cashbackPaise: walletCashbackPaise || undefined },
    { id: 'netbanking', label: 'Net banking', detail: 'All major banks via the configured gateway', available: cardIntegrated, integrated: cardIntegrated },
    { id: 'emi', label: 'EMI', detail: 'No-cost EMI where the gateway supports it', available: cardIntegrated && totalPaise >= 500000, integrated: cardIntegrated },
    { id: 'cod', label: 'Cash on delivery', detail: '', available: codAllowed && totalPaise <= codMaxPaise, unavailableReason: !codAllowed ? 'Not offered for this order' : totalPaise > codMaxPaise ? `Unavailable above ₹${(codMaxPaise / 100).toLocaleString('en-IN')}` : undefined, integrated: codAllowed },
  ];
}

/** Assemble the product-detail view model. Ratings appear only when genuine. */
export function assembleProductDetail(product: MarketplaceProduct, related: MarketplaceProduct[], reviewStats?: { average: number; count: number }): Record<string, unknown> {
  const variant = product.variants[0];
  return {
    ...product,
    variants: product.variants.map((v) => ({ ...v, discountPercent: discountPercent(v.mrpPaise, v.pricePaise) })),
    defaultVariantId: variant?.id ?? null,
    discountPercent: variant ? discountPercent(variant.mrpPaise, variant.pricePaise) : 0,
    rating: reviewStats && reviewStats.count > 0 ? { average: reviewStats.average, count: reviewStats.count, source: 'verified-purchase' } : null,
    relatedProducts: related.map((r) => ({ id: r.id, slug: r.slug, name: r.name, brand: r.brand, pricePaise: r.variants[0]?.pricePaise ?? 0, image: r.images[0] ?? null, dataClass: r.dataClass })),
  };
}

/** Validate a cart line against live server-side stock. Throws on conflict. */
export function assertVariantAvailable(variant: ProductVariant | undefined, quantity: number): void {
  if (!variant) throw Object.assign(new Error('Variant not found'), { code: 'VARIANT_NOT_FOUND', status: 404 });
  if (variant.stock < quantity) {
    throw Object.assign(new Error(`Only ${variant.stock} in stock for ${variant.label}`), { code: 'OUT_OF_STOCK', status: 409 });
  }
}
