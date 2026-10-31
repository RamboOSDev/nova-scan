import { join } from 'path';
import { readFileSync } from 'fs';
import { glob } from 'fast-glob';
import type { Finding } from './secrets.js';

// Calls that execute raw SQL.
const SINK = /\b(?:query|execute|exec|raw|unsafe|\$queryRawUnsafe|\$executeRawUnsafe|queryRawUnsafe|executeRawUnsafe|sequelize\.query|knex\.raw|db\.run|db\.all|db\.get|prepare)\s*\(/;
const SQL_WORD = /\b(?:SELECT|INSERT\s+INTO|UPDATE|DELETE\s+FROM|WHERE|ORDER\s+BY|VALUES|FROM)\b/i;
// User-controlled input sources.
const TAINT = /\b(?:req|request|ctx\.request|ctx)\.(?:body|query|params|param|headers|cookies)\b|\bsearchParams\.get\(|\bformData\.get\(|\buserInput\b|\bargs\.(?:input|where)\b/;
const TEMPLATE_INTERP = /`[^`]*\$\{[^}]+\}[^`]*`/;
const CONCAT = /(?:"[^"]*"|'[^']*'|`[^`]*`)\s*\+\s*[\w$.[\]()]+|[\w$.[\]()]+\s*\+\s*(?:"[^"]*"|'[^']*'|`[^`]*`)/;

/** Single file analysis; exported for tests. */
export function analyzeSqlInjection(file: string, source: string): Finding[] {
  const lines = source.split(/\r?\n/);
  const findings: Finding[] = [];
  // Variables assigned from tainted input or from a tainted SQL string.
  const tainted = new Set<string>();
  const sqlVars = new Set<string>();
  const assign = /(?:const|let|var)\s+(?:\{([^}]+)\}|([\w$]+))\s*=\s*(.+)/;
  lines.forEach((ln) => {
    const m = assign.exec(ln);
    if (!m) return;
    const rhs = m[3];
    const names = m[1] ? m[1].split(',').map((s) => s.split(':').pop()!.trim().split('=')[0].trim()) : [m[2]];
    if (TAINT.test(rhs)) names.forEach((n) => n && tainted.add(n));
  });
  const usesTaint = (s: string) =>
    TAINT.test(s) || [...tainted].some((v) => new RegExp(`(?:\\$\\{\\s*|\\+\\s*)${v.replace(/\$/g, '\\$')}\\b`).test(s));
  const dynamic = (s: string) => TEMPLATE_INTERP.test(s) || CONCAT.test(s);

  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith('//') || t.startsWith('*')) return;
    const m = assign.exec(ln);
    if (m && m[2] && SQL_WORD.test(m[3]) && dynamic(m[3]) && usesTaint(m[3])) sqlVars.add(m[2]);
  });

  lines.forEach((ln, i) => {
    const t = ln.trim();
    if (t.startsWith('//') || t.startsWith('*')) return;
    if (/\bsql`|\bPrisma\.sql`|\$queryRaw`|\$executeRaw`/.test(ln)) return; // tagged templates are parameterized
    if (!SINK.test(ln)) return;
    const args = ln.slice(ln.search(SINK));
    const direct = SQL_WORD.test(args) && dynamic(args) && usesTaint(args);
    const viaVar = [...sqlVars].some((v) => new RegExp(`\\(\\s*${v.replace(/\$/g, '\\$')}\\b`).test(args));
    if (direct || viaVar) {
      findings.push({
        file, line: i + 1, severity: 'high', snippet: t.slice(0, 160), detector: 'sql-injection',
        message: 'sql-injection: raw SQL built from request input via string concatenation/template literal; use parameterized queries or placeholders.',
      });
    }
  });
  return findings;
}

export async function detectSqlInjection(root: string): Promise<Finding[]> {
  const files = await glob('**/*.{ts,tsx,js,jsx,mjs,cjs}', {
    cwd: root, ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**', 'engines/**'],
  });
  const out: Finding[] = [];
  for (const f of files) {
    try { out.push(...analyzeSqlInjection(f, readFileSync(join(root, f), 'utf8'))); } catch { /* unreadable */ }
  }
  return out;
}
