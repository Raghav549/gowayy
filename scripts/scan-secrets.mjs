/**
 * Lightweight secret scan for source files. Fails the build when a high-confidence
 * credential pattern appears in code that ships to a client or server. This is a
 * guard against accidental commits, not a substitute for a hosted secret scanner.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const roots = [
  'apps/web/src', 'apps/mobile/app', 'apps/mobile/src', 'apps/dev-api/src',
  'packages', 'supabase/functions', 'supabase/migrations', 'supabase/seed', 'scripts',
];
const skipDirs = new Set(['node_modules', 'dist', 'build', '.expo', '.git', 'coverage', '__pycache__']);
const skipFiles = new Set(['scan-secrets.mjs']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.sql', '.json']);

const patterns = [
  { name: 'OpenAI-style API key', re: /\bsk-[A-Za-z0-9]{20,}/ },
  { name: 'JWT-like token literal', re: /\beyJ[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{10,}/ },
  { name: 'private key header', re: /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/ },
  { name: 'hard-coded server secret', re: /(?:SUPABASE_SERVICE_ROLE_KEY|GOWAYY_PAYMENT_WEBHOOK_SECRET|STRIPE_SECRET_KEY|RAZORPAY_KEY_SECRET)\s*[:=]\s*['"][^'"\s]{12,}['"]/ },
  { name: 'hard-coded database URL with credentials', re: /postgres(?:ql)?:\/\/[^\s:'"]+:[^\s@'"]+@/ },
];

const files = [];
function walk(dir) {
  let entries;
  try { entries = readdirSync(join(root, dir), { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (skipDirs.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) { walk(path); continue; }
    if (skipFiles.has(entry.name)) continue;
    if (!extensions.has(entry.name.slice(entry.name.lastIndexOf('.')))) continue;
    try { if (statSync(join(root, path)).size > 2_000_000) continue; } catch { continue; }
    files.push(path);
  }
}
for (const r of roots) walk(r);

const findings = [];
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  for (const { name, re } of patterns) {
    const m = re.exec(text);
    if (m) findings.push({ file: relative(root, file), name, snippet: m[0].slice(0, 24) });
  }
}

if (findings.length) {
  console.error(`Secret scan FAILED — ${findings.length} high-confidence finding(s):`);
  for (const f of findings) console.error(`  ${f.file}: ${f.name} (${f.snippet}…)`);
  process.exit(1);
}
console.log(`Secret scan passed: ${files.length} source files checked, 0 high-confidence credential patterns.`);
