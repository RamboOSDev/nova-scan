import { describe, it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { detectAuthGuard, detectInputValidation, detectSqlMigrationRisk, detectCodeSafety, detectEnvDrift } from '../../src/detectors/engines';
import { detectSqlInjection } from '../../src/detectors/sql-injection';
import { toSarif } from '../../src/sarif';

let dir: string; let clean: string;
const w = (root: string, p: string, c: string) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), c); };

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'nova-eng-'));
  w(dir, 'src/admin-users.controller.ts', `import { Controller, Get, Delete, Param, Query } from '@nestjs/common';
@Controller('admin/users')
export class AdminUsersController {
  @Get()
  list(@Query('q') q: string) { return q; }
  @Delete(':id')
  remove(@Param('id') id: string) { return id; }
}
`);
  w(dir, 'src/unsafe.ts', 'export const run = (s: string) => eval(s);\nlocalStorage.setItem("authToken", "x");\n');
  w(dir, 'src/api.ts', 'export async function h(req: any, db: any) { return db.query(`SELECT * FROM t WHERE id = ${req.query.id}`); }\n');
  w(dir, 'migrations/001/migration.sql', 'DELETE FROM users;\n');
  w(dir, '.env', 'A=1\nA=2\n');
  w(dir, '.env.example', 'A=\nB=\n');
  clean = mkdtempSync(join(tmpdir(), 'nova-clean-'));
  w(clean, 'src/ok.ts', 'export const add = (a: number, b: number) => a + b;\n');
});

describe('vendored engine detectors', () => {
  it('auth-guard flags unguarded admin routes', async () => {
    const f = await detectAuthGuard(dir);
    expect(f.length).toBeGreaterThan(0);
    expect(f.every((x) => x.detector === 'auth-guard' && x.severity === 'high')).toBe(true);
  });
  it('input-validation flags unvalidated params', async () => {
    const f = await detectInputValidation(dir);
    expect(f.some((x) => x.detector === 'input-validation')).toBe(true);
  });
  it('sql-migration flags DELETE without WHERE', async () => {
    const f = await detectSqlMigrationRisk(dir);
    expect(f.some((x) => /delete_without_where/.test(x.message!))).toBe(true);
    expect(f[0].file).toMatch(/migration\.sql$/);
  });
  it('code-safety flags eval and token storage', async () => {
    const f = await detectCodeSafety(dir);
    expect(f.map((x) => x.message).join()).toMatch(/dangerous_eval/);
    expect(f.map((x) => x.message).join()).toMatch(/browser_token_storage/);
  });
  it('env-drift flags duplicates and never leaks values', async () => {
    const f = await detectEnvDrift(dir);
    expect(f.length).toBeGreaterThan(0);
    expect(JSON.stringify(f)).not.toMatch(/A=1|A=2/);
  });
  it('sql-injection scans a tree', async () => {
    expect((await detectSqlInjection(dir)).length).toBe(1);
  });
  it('clean repo yields nothing from any new detector', async () => {
    const all = (await Promise.all([detectAuthGuard, detectInputValidation, detectSqlMigrationRisk, detectCodeSafety, detectEnvDrift, detectSqlInjection].map((d) => d(clean)))).flat();
    expect(all).toEqual([]);
  });
  it('missing path does not throw', async () => {
    expect(await detectAuthGuard(join(dir, 'nope'))).toEqual([]);
  });
  it('maps into SARIF with per-detector rules', async () => {
    const f = [...(await detectAuthGuard(dir)), ...(await detectSqlInjection(dir))];
    const s = toSarif(f, '0.3.0');
    const ids = s.runs[0].tool.driver.rules.map((r: any) => r.id);
    expect(ids).toEqual(expect.arrayContaining(['auth-guard', 'sql-injection']));
    expect(s.runs[0].results.every((r: any) => r.locations[0].physicalLocation.region.startLine >= 1)).toBe(true);
  });
});
