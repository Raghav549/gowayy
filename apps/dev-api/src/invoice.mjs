/**
 * Server-side invoice renderer.
 *
 * Produces a real PDF (no external dependency) from trusted server-side order
 * data only. The customer app downloads it from an authenticated endpoint that
 * verifies ownership; admin and partner views use the same generator so an
 * invoice can never disagree with the stored order.
 */
import { formatINR } from '@gowayy/shared-utils';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;

const escapePdf = (value) => String(value ?? '')
  .replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
  // Helvetica/WinAnsi cannot render the rupee glyph; keep the document valid.
  .replace(/₹/g, 'Rs.').replace(/[^\x20-\x7E]/g, '');

class PdfDoc {
  constructor() { this.pages = []; this.newPage(); }
  newPage() { this.pages.push([]); this.y = PAGE_H - MARGIN; }
  text(value, { x = MARGIN, size = 10, bold = false, color = '0 0 0', align = 'left' } = {}) {
    const font = bold ? '/F2' : '/F1';
    let drawX = x;
    if (align === 'right') drawX = PAGE_W - MARGIN - this.width(value, size, bold);
    this.pages[this.pages.length - 1].push(`BT ${color} rg ${font} ${size} Tf 1 0 0 1 ${drawX.toFixed(2)} ${this.y.toFixed(2)} Tm (${escapePdf(value)}) Tj ET`);
    return this;
  }
  width(value, size, bold) { return escapePdf(value).length * size * (bold ? 0.56 : 0.5); }
  line(y = this.y, x1 = MARGIN, x2 = PAGE_W - MARGIN, color = '0.88 0.85 0.9') {
    this.pages[this.pages.length - 1].push(`${color} RG 0.7 w ${x1} ${y.toFixed(2)} m ${x2} ${y.toFixed(2)} l S`);
  }
  rect(x, y, w, h, color) { this.pages[this.pages.length - 1].push(`${color} rg ${x} ${y.toFixed(2)} ${w} ${h} re f`); }
  space(amount) { this.y -= amount; }
  ensure(space) { if (this.y - space < MARGIN + 40) { this.newPage(); return true; } return false; }
  build() {
    const objects = [];
    const pageCount = this.pages.length;
    const contentIds = this.pages.map((_, i) => 5 + i * 2);
    const pageIds = this.pages.map((_, i) => 4 + i * 2);
    objects.push('<< /Type /Catalog /Pages 2 0 R >>');
    objects.push(`<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>`);
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    this.pages.forEach((ops, index) => {
      const content = ops.join('\n');
      const pageId = pageIds[index];
      const contentId = contentIds[index];
      objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`);
      objects.push(`<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`);
      void pageId;
    });
    let pdf = '%PDF-1.4\n';
    const offsets = [0];
    objects.forEach((object, index) => {
      offsets.push(Buffer.byteLength(pdf, 'latin1'));
      pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xrefStart = Buffer.byteLength(pdf, 'latin1');
    pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objects.length; i += 1) pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
    return Buffer.from(pdf, 'latin1');
  }
}

function header(doc, title, reference, date, invoiceNumber) {
  doc.rect(0, PAGE_H - 96, PAGE_W, 96, '0.07 0.05 0.08');
  doc.y = PAGE_H - 44;
  doc.text('GOWAYY', { x: MARGIN, size: 24, bold: true, color: '1 1 1' });
  doc.text('Travel · Transport · Hospitality · Local commerce', { x: MARGIN, size: 9, color: '0.82 0.78 0.7' });
  doc.y = PAGE_H - 40;
  doc.text(title.toUpperCase(), { x: 0, size: 11, bold: true, align: 'right', color: '1 1 1' });
  doc.y = PAGE_H - 58;
  doc.text(`Invoice ${invoiceNumber}`, { x: 0, size: 9, align: 'right', color: '0.85 0.83 0.88' });
  doc.y = PAGE_H - 72;
  doc.text(`Reference ${reference}  ·  ${date}`, { x: 0, size: 9, align: 'right', color: '0.85 0.83 0.88' });
  doc.y = PAGE_H - 126;
}

function twoColumn(doc, leftTitle, leftLines, rightTitle, rightLines) {
  const colW = (PAGE_W - MARGIN * 2) / 2;
  const startY = doc.y;
  doc.text(leftTitle, { x: MARGIN, size: 9, bold: true });
  doc.text(rightTitle, { x: MARGIN + colW, size: 9, bold: true });
  doc.y = startY - 16;
  const rows = Math.max(leftLines.length, rightLines.length);
  for (let i = 0; i < rows; i += 1) {
    const y = doc.y;
    if (leftLines[i]) { doc.text(leftLines[i], { x: MARGIN, size: 9 }); doc.y = y; }
    if (rightLines[i]) doc.text(rightLines[i], { x: MARGIN + colW, size: 9 });
    doc.y = y - 13;
  }
  doc.y -= 8;
  doc.line(doc.y);
  doc.y -= 22;
}

/** Build a professional invoice PDF for an order. */
export function renderOrderInvoicePdf({ order, store, customer, payment }) {
  const doc = new PdfDoc();
  const date = new Date(order.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const invoiceNumber = `GW/INV/${String(order.reference ?? order.id).replace(/[^A-Za-z0-9]/g, '-')}`;
  header(doc, 'Tax invoice', order.reference, date, invoiceNumber);

  const address = order.deliveryAddress ?? {};
  const addressLines = [
    address.line ?? address.line1 ?? '',
    [address.area, address.city].filter(Boolean).join(', '),
    [address.state, address.pincode].filter(Boolean).join(' '),
    address.phone ? `Phone: ${address.phone}` : '',
  ].filter(Boolean);
  twoColumn(doc,
    'Billed to', [customer?.name ?? address.name ?? 'GOWAYY customer', customer?.email ?? '', ...addressLines],
    'Despatched by', [store?.name ?? 'GOWAYY store', store?.address ?? '', store?.phone ?? ''],
  );

  doc.text('Items', { x: MARGIN, size: 10, bold: true });
  doc.y -= 16;
  doc.text('Description', { x: MARGIN, size: 8, bold: true, color: '0.4 0.38 0.42' });
  doc.text('Qty', { x: 360, size: 8, bold: true, color: '0.4 0.38 0.42' });
  doc.text('Unit price', { x: 410, size: 8, bold: true, color: '0.4 0.38 0.42' });
  doc.text('Amount', { x: 0, size: 8, bold: true, align: 'right', color: '0.4 0.38 0.42' });
  doc.y -= 8; doc.line(doc.y, MARGIN, PAGE_W - MARGIN, '0.8 0.77 0.82'); doc.y -= 16;

  for (const item of order.items ?? []) {
    doc.ensure(24);
    const label = String(item.name ?? 'Item').slice(0, 58);
    doc.text(label, { x: MARGIN, size: 9 });
    doc.text(String(item.quantity ?? 1), { x: 366, size: 9 });
    doc.text(formatINR(item.unitPricePaise ?? 0), { x: 410, size: 9 });
    doc.text(formatINR((item.unitPricePaise ?? 0) * (item.quantity ?? 1)), { x: 0, size: 9, align: 'right' });
    doc.y -= 15;
  }
  doc.y -= 6; doc.line(doc.y); doc.y -= 20;

  const totals = [];
  const price = order.price ?? {};
  for (const line of price.lines ?? []) {
    if (!line?.label || /^items?$/i.test(line.label)) continue;
    totals.push([line.label, formatINR(line.paise ?? 0)]);
  }
  if (order.coupon) totals.push([`Coupon ${order.coupon}`, 'applied']);
  if (typeof price.taxPaise === 'number') totals.push(['GST', formatINR(price.taxPaise)]);
  totals.push(['Total payable', formatINR(price.totalPaise ?? 0)]);

  for (const [label, value] of totals) {
    const isTotal = label === 'Total payable';
    doc.text(label, { x: 340, size: isTotal ? 11 : 9, bold: isTotal });
    doc.text(value, { x: 0, size: isTotal ? 11 : 9, bold: isTotal, align: 'right' });
    doc.y -= isTotal ? 20 : 14;
  }

  doc.y -= 14;
  doc.text('Payment', { x: MARGIN, size: 10, bold: true }); doc.y -= 16;
  const paymentMethod = String(order.paymentMethod ?? payment?.method ?? 'not selected').replace(/_/g, ' ');
  doc.text(`Method: ${paymentMethod}`, { x: MARGIN, size: 9 }); doc.y -= 13;
  doc.text(`Status: ${payment?.status === 'captured' ? 'Paid — verified by the payment provider' : (payment?.status ?? (order.paymentMethod === 'cod' ? 'Cash on delivery — collected on handover' : 'Pending'))}`, { x: MARGIN, size: 9 }); doc.y -= 13;
  if (payment?.providerReference) { doc.text(`Provider reference: ${payment.providerReference}`, { x: MARGIN, size: 9 }); doc.y -= 13; }
  doc.y -= 10;
  doc.line(doc.y); doc.y -= 16;
  doc.text('This invoice is generated from server-side order records. Retain it for warranty and support.', { size: 8, color: '0.4 0.38 0.42' });
  doc.y -= 12;
  doc.text('GOWAYY · support@gowayy.app · This document is not a tax document until GSTIN details are configured.', { size: 8, color: '0.4 0.38 0.42' });
  return doc.build();
}

/** Booking (cab, hotel, package, experience) confirmation invoice. */
export function renderBookingInvoicePdf({ booking, customer, payment }) {
  const doc = new PdfDoc();
  const date = new Date(booking.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const invoiceNumber = `GW/INV/${String(booking.reference ?? booking.id).replace(/[^A-Za-z0-9]/g, '-')}`;
  header(doc, 'Booking invoice', booking.reference, date, invoiceNumber);
  const details = booking.details ?? {};
  const detailLines = Object.entries(details).filter(([, v]) => ['string', 'number'].includes(typeof v)).slice(0, 8).map(([k, v]) => `${k}: ${v}`);
  twoColumn(doc, 'Guest', [customer?.name ?? 'GOWAYY customer', customer?.email ?? ''], 'Booking', [booking.title ?? '', ...detailLines]);
  doc.text('Charges', { x: MARGIN, size: 10, bold: true }); doc.y -= 18;
  for (const line of booking.price?.lines ?? []) {
    doc.text(line.label, { x: MARGIN, size: 9 });
    doc.text(formatINR(line.paise), { x: 0, size: 9, align: 'right' });
    doc.y -= 14;
  }
  doc.y -= 6; doc.line(doc.y); doc.y -= 18;
  doc.text('Total payable', { x: MARGIN, size: 11, bold: true });
  doc.text(formatINR(booking.price?.totalPaise ?? 0), { x: 0, size: 11, bold: true, align: 'right' });
  doc.y -= 26;
  doc.text(`Payment: ${payment?.status ?? 'pending'} · ${(payment?.method ?? booking.paymentMethod ?? 'not selected')}`, { x: MARGIN, size: 9 });
  doc.y -= 14;
  doc.text('Generated from server-side booking records.', { size: 8, color: '0.4 0.38 0.42' });
  return doc.build();
}
