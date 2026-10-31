import { readFileSync } from 'fs';
import { join } from 'path';
import { glob } from 'fast-glob';

export interface Finding {
  file: string;
  line: number;
  snippet: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  message?: string;
  detector?: string;
}

export const SECRET_FILE_GLOBS = [
  '**/*.{ts,tsx,js,jsx,mjs,cjs,py,json,yml,yaml}',
  '**/.env',
  '**/.env.*',
];

export const IGNORE_GLOBS = [
  '**/node_modules/**', '**/.next/**', '**/dist/**', '**/build/**', '**/.git/**',
  '**/package-lock.json', '**/bun.lock', '**/yarn.lock', '**/pnpm-lock.yaml',
];

interface SecretPattern { name: string; re: RegExp; }

// Compiled once at module load.
export const SECRET_PATTERNS: SecretPattern[] = [
  { name: 'Stripe secret key', re: /\bsk_(?:live|test)_[A-Za-z0-9]{20,}/ },
  { name: 'Stripe restricted key', re: /\brk_(?:live|test)_[A-Za-z0-9]{20,}/ },
  { name: 'Anthropic API key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI project key', re: /\bsk-proj-[A-Za-z0-9_-]{20,}/ },
  { name: 'OpenAI API key', re: /\bsk-(?!ant-|proj-)[A-Za-z0-9]{32,}/ },
  { name: 'Slack token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'Google API key', re: /\bAIza[0-9A-Za-z_-]{35}/ },
  { name: 'GitHub token', re: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}/ },
  { name: 'GitHub fine-grained PAT', re: /\bgithub_pat_[A-Za-z0-9_]{22,}/ },
  { name: 'AWS access key', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Private key', re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { name: 'MongoDB URI with credentials', re: /mongodb(?:\+srv)?:\/\/[^:\s/]+:[^@\s]+@/ },
  { name: 'Postgres URI with credentials', re: /postgres(?:ql)?:\/\/[^:\s/]+:[^@\s]+@/ },
];

const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.(eyJ[A-Za-z0-9_-]{10,})\.[A-Za-z0-9_-]{10,}/g;
const ASSIGN_RE = /(?:secret|token|api[_-]?key|apikey|password|passwd|private[_-]?key|access[_-]?key|auth)[A-Za-z0-9_]*["']?\s*[:=]\s*["']([^"'\s]{24,})["']/i;
const PLACEHOLDER_RE = /^(?:x+|your[_-]|example|changeme|placeholder|<|\$\{|process\.env)/i;

export function shannonEntropy(s: string): number {
  const freq = new Map<string, number>();
  for (const c of s) freq.set(c, (freq.get(c) ?? 0) + 1);
  let h = 0;
  for (const n of freq.values()) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

function jwtRole(payloadB64: string): string | undefined {
  try {
    const json = Buffer.from(payloadB64.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const role = JSON.parse(json)?.role;
    return typeof role === 'string' ? role : undefined;
  } catch { return undefined; }
}

export function scanLine(line: string): string | undefined {
  for (const p of SECRET_PATTERNS) if (p.re.test(line)) return p.name;
  for (const m of line.matchAll(JWT_RE)) {
    if (jwtRole(m[1]!) === 'service_role') return 'Supabase service_role JWT';
  }
  const a = ASSIGN_RE.exec(line);
  if (a) {
    const v = a[1]!;
    if (!PLACEHOLDER_RE.test(v) && !v.startsWith('eyJ') && /[A-Za-z]/.test(v) && /\d/.test(v) && shannonEntropy(v) >= 4.0) {
      return 'High-entropy assigned secret';
    }
  }
  return undefined;
}

export function analyzeSecrets(file: string, content: string): Finding[] {
  const findings: Finding[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const name = scanLine(line);
    if (name) {
      findings.push({
        file, line: i + 1, snippet: line.trim().slice(0, 200),
        severity: 'high', message: `Possible hardcoded secret: ${name}`, detector: 'hardcoded-secret',
      });
    }
  }
  return findings;
}

export async function detectHardcodedSecrets(root: string): Promise<Finding[]> {
  const files = await glob(SECRET_FILE_GLOBS, { cwd: root, dot: true, ignore: IGNORE_GLOBS });
  const findings: Finding[] = [];
  for (const file of files) {
    let content: string;
    try { content = readFileSync(join(root, file), 'utf8'); } catch { continue; }
    findings.push(...analyzeSecrets(file, content));
  }
  return findings;
}
