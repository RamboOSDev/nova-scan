import { join, resolve } from 'path';
import { existsSync } from 'fs';
import type { Finding } from './secrets.js';

// Vendored CommonJS engines live at <pkg>/engines (works from src/ and dist/).
const ENGINES_DIR = join(__dirname, '..', '..', 'engines');
const load = (name: string): any => require(join(ENGINES_DIR, name));

type Sev = Finding['severity'];
const sev = (s: string | undefined): Sev =>
  s === 'high' || s === 'medium' || s === 'low' ? s : 'info';

async function safe(fn: () => Promise<Finding[]>): Promise<Finding[]> {
  try { return await fn(); } catch { return []; }
}

/** NestJS-style routes (admin/money/webhook) without guard markers. */
export function detectAuthGuard(root: string): Promise<Finding[]> {
  return safe(async () => {
    const r = await load('auth-guard-checker').scan({ repoPath: resolve(root) });
    return (r.findings ?? []).map((f: any) => ({
      file: f.relative_path, line: f.line ?? 1, severity: sev(f.severity),
      snippet: `${f.method ?? ''} ${f.route_path ?? ''}`.trim(),
      message: `${f.finding_id}: ${f.evidence}`, detector: 'auth-guard',
    }));
  });
}

/** Route inputs (@Body/@Query/@Param) without validation markers. */
export function detectInputValidation(root: string): Promise<Finding[]> {
  return safe(async () => {
    const r = await load('input-validation-checker').scan({ repoPath: resolve(root) });
    return (r.findings ?? []).map((f: any) => ({
      file: f.relative_path ?? '.', line: f.line ?? 1, severity: sev(f.severity),
      snippet: `${f.method ?? ''} ${f.route_path ?? ''}`.trim() || f.finding_id,
      message: `${f.finding_id}: ${f.evidence}`, detector: 'input-validation',
    }));
  });
}

/** Destructive SQL migrations (DROP, TRUNCATE, DELETE/UPDATE without WHERE...). */
export function detectSqlMigrationRisk(root: string): Promise<Finding[]> {
  return safe(async () => {
    const r = await load('sql-migration-reviewer').scan({ repoPath: resolve(root), cwd: resolve(root) });
    const out: Finding[] = [];
    for (const file of r.files ?? []) for (const f of file.findings ?? []) {
      out.push({ file: file.relative_path, line: f.line ?? 1, severity: sev(f.severity),
        snippet: f.finding_id, message: `${f.finding_id}: ${f.evidence}`, detector: 'sql-migration' });
    }
    return out;
  });
}

/** eval/new Function, dangerouslySetInnerHTML, tokens in browser storage, ts-ignore. Info-level noise dropped. */
export function detectCodeSafety(root: string): Promise<Finding[]> {
  return safe(async () => {
    const r = await load('typescript-code-safety-scanner').scanRepo(resolve(root));
    return (r.findings ?? [])
      .filter((f: any) => f.severity !== 'info' && f.signal_id !== 'process_env_direct_usage')
      .map((f: any) => ({
        file: f.relative_path, line: f.line ?? 1, severity: sev(f.severity),
        snippet: f.evidence ?? f.signal_id, message: `${f.signal_id}: ${f.message}`, detector: 'code-safety',
      }));
  });
}

/** .env vs .env.example drift: missing/extra/duplicate/empty keys. Never reports values. */
export function detectEnvDrift(root: string): Promise<Finding[]> {
  return safe(async () => {
    const abs = resolve(root);
    if (!existsSync(join(abs, '.env')) && !existsSync(join(abs, '.env.example'))) return [];
    const r = await load('env-doctor').scan({ repoPath: abs, cwd: abs });
    return (r.findings ?? []).map((f: any) => ({
      file: f.file ?? '.env', line: 1, severity: sev(f.severity),
      snippet: f.key ? `key: ${f.key}` : f.check_id,
      message: `${f.check_id}: ${f.message}`, detector: 'env-drift',
    }));
  });
}
