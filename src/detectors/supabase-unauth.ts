import { readFileSync } from 'fs';
import { glob } from 'fast-glob';
import type { Finding } from './secrets.js';
import {
  parseSourceFile,
  isInsideStringOrTemplate,
  isInsideComment,
  isLikelyClientFile,
  findSupabaseSelectCalls,
} from './utils/ast.js';

const SENSITIVE_TABLE_HINTS = [
  'user', 'users', 'account', 'accounts',
  'profile', 'profiles', 'session', 'sessions',
  'token', 'tokens', 'credential', 'credentials',
  'payment', 'payments', 'subscription', 'subscriptions',
  'billing', 'invoice', 'invoices',
  'message', 'messages', 'email', 'emails',
  'secret', 'secrets', 'key', 'keys',
  'auth', 'permission', 'permissions',
];

/**
 * Scan a project tree for `supabase.from('table').select(...)` calls that
 * are not preceded by any obvious auth gate. The detector cannot verify
 * Row Level Security policies, so every finding carries an RLS disclaimer.
 */
export async function detectSupabaseUnauth(root: string): Promise<Finding[]> {
  const files = await glob('**/*.{ts,tsx,js,jsx}', {
    cwd: root,
    ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**'],
  });

  const findings: Finding[] = [];

  for (const file of files) {
    const source = readFileSync(`${root}/${file}`, 'utf8');
    findings.push(...analyzeSource(file, source));
  }

  return findings;
}

/**
 * Analyze a single source file. Exported for unit tests so they can pass
 * fixture strings without writing to disk.
 */
export function analyzeSource(file: string, source: string): Finding[] {
  const sf = parseSourceFile(file, source);
  const isClient = isLikelyClientFile(file, sf);
  const matches = findSupabaseSelectCalls(sf);
  const findings: Finding[] = [];

  for (const { call, tableName } of matches) {
    if (isInsideStringOrTemplate(call)) continue;
    if (isInsideComment(sf, call.pos)) continue;

    const lower = tableName.toLowerCase();
    const isSensitive = SENSITIVE_TABLE_HINTS.some((hint) => lower.includes(hint));

    let severity: Finding['severity'];
    if (isClient && isSensitive) severity = 'medium';
    else if (isClient && !isSensitive) severity = 'low';
    else if (!isClient && isSensitive) severity = 'low';
    else severity = 'info';

    const context = isClient ? 'a client component' : 'server code';
    const message =
      `Unauthenticated \`.from('${tableName}').select(...)\` in ${context}.\n` +
      `nova-scan cannot verify Row Level Security policies without database access.\n` +
      `If RLS is enabled and the policy for \`${tableName}\` is correct, this query is safe.\n` +
      `Review the RLS policy manually before treating this as a vulnerability.`;

    const { line } = sf.getLineAndCharacterOfPosition(call.getStart(sf));
    const snippetText = source.split('\n')[line]?.trim().slice(0, 200) ?? '';

    findings.push({
      file,
      line: line + 1,
      snippet: snippetText,
      severity,
      message,
      detector: 'supabase-unauth',
    });
  }

  return findings;
}
