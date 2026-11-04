/**
 * Delivery verification codes.
 *
 * A 6-digit code is generated after an order is accepted. The plaintext is never
 * stored directly: an HMAC-SHA256 hash (with a per-order salt) is used for
 * verification and an AES-256-GCM encrypted copy is kept only so the owning
 * customer can be shown their own code again. Codes expire, are single-use and
 * lock after a limited number of failed attempts.
 */
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';

const MAX_ATTEMPTS = 5;
const TTL_MS = 7 * 86_400_000;

export function createDeliveryCodeService(db, secret) {
  const key = createHash('sha256').update(`${secret}:gowayy-delivery-v1`).digest();
  const hashOf = (code, salt) => createHmac('sha256', key).update(`${salt}:${code}`).digest('hex');

  function encrypt(plain) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return `${iv.toString('base64')}.${enc.toString('base64')}.${cipher.getAuthTag().toString('base64')}`;
  }
  function decrypt(payload) {
    try {
      const [ivB64, bodyB64, tagB64] = String(payload).split('.');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
      decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
      return Buffer.concat([decipher.update(Buffer.from(bodyB64, 'base64')), decipher.final()]).toString('utf8');
    } catch { return null; }
  }

  function issue(orderId) {
    db.deliveryCodes ??= {};
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const salt = randomBytes(16).toString('hex');
    const record = {
      orderId, salt, hash: hashOf(code, salt), enc: encrypt(code), attempts: 0,
      verifiedAt: null, createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + TTL_MS).toISOString(),
    };
    db.deliveryCodes[orderId] = record;
    return code;
  }

  function recordFor(orderId) { return db.deliveryCodes?.[orderId] ?? null; }

  function maskedFor(orderId) {
    const rec = recordFor(orderId);
    return rec ? { required: true, verified: Boolean(rec.verifiedAt), attemptsRemaining: Math.max(0, MAX_ATTEMPTS - rec.attempts), expiresAt: rec.expiresAt } : { required: false, verified: false, attemptsRemaining: MAX_ATTEMPTS, expiresAt: null };
  }

  /** Owner-only view of the customer's own code. */
  function reveal(orderId) {
    const rec = recordFor(orderId);
    if (!rec || rec.verifiedAt) return null;
    return decrypt(rec.enc);
  }

  function verify(orderId, supplied) {
    const rec = recordFor(orderId);
    if (!rec) return { ok: false, code: 'CODE_NOT_ISSUED', message: 'No verification code exists for this order' };
    if (rec.verifiedAt) return { ok: false, code: 'ALREADY_VERIFIED', message: 'This delivery was already verified' };
    if (rec.expiresAt < new Date().toISOString()) return { ok: false, code: 'CODE_EXPIRED', message: 'The verification code has expired' };
    if (rec.attempts >= MAX_ATTEMPTS) return { ok: false, code: 'CODE_LOCKED', message: 'Too many incorrect attempts — contact support' };
    const suppliedHash = hashOf(String(supplied ?? '').trim(), rec.salt);
    const expected = Buffer.from(rec.hash, 'hex');
    const candidate = Buffer.from(suppliedHash, 'hex');
    const match = expected.length === candidate.length && timingSafeEqual(expected, candidate);
    if (!match) {
      rec.attempts += 1;
      return { ok: false, code: 'INCORRECT_CODE', message: 'Incorrect delivery code', attemptsRemaining: Math.max(0, MAX_ATTEMPTS - rec.attempts) };
    }
    rec.verifiedAt = new Date().toISOString();
    return { ok: true, code: 'VERIFIED', message: 'Delivery verified' };
  }

  return { issue, verify, reveal, maskedFor, recordFor, MAX_ATTEMPTS };
}
