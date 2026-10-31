import { describe, it, expect } from 'vitest';
import { analyzeSecrets, scanLine, shannonEntropy } from '../../src/detectors/secrets';
import { toSarif } from '../../src/sarif';

// Fake keys are assembled at runtime so this file never contains a literal token.
const r = (n: number) => 'aB3dE5fG7hJ9kL2mN4pQ6rS8tU0vW1xY3zA5cD7eF9gH2jK4'.repeat(3).slice(0, n);
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (role: string) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64({ iss: 'supabase', role, iat: 1700000000 })}.${r(43)}`;

describe('secrets — true positives', () => {
  const cases: [string, string][] = [
    ['Stripe live', `const k = "${'sk_' + 'live_' + r(24)}";`],
    ['Stripe test', `STRIPE_KEY=${'sk_' + 'test_' + r(24)}`],
    ['Stripe restricted', `key: '${'rk_' + 'live_' + r(24)}'`],
    ['OpenAI project', `OPENAI_API_KEY=${'sk-' + 'proj-' + r(40)}`],
    ['OpenAI legacy', `const o = "${'sk-' + r(48)}"`],
    ['Anthropic', `ANTHROPIC_API_KEY="${'sk-' + 'ant-' + 'api03-' + r(40)}"`],
    ['Slack bot', `token = "${'xox' + 'b-' + '1234567890-' + r(24)}"`],
    ['Google', `apiKey: "${'AI' + 'za' + r(35)}"`],
    ['GitHub classic', `GH=${'gh' + 'p_' + r(36)}`],
    ['GitHub oauth', `GH=${'gh' + 'o_' + r(36)}`],
    ['GitHub fine-grained', `GH=${'github_' + 'pat_' + r(40)}`],
    ['AWS', `aws_key = "${'AK' + 'IA' + 'ABCDEFGHIJKLMNOP'}"`],
    ['Private key', '-----BEGIN RSA PRIVATE KEY-----'],
    ['Postgres URI', 'DATABASE_URL=postgresql://admin:hunter2pass@db.example.com:5432/app'],
    ['Supabase service_role', `SUPABASE_SERVICE_ROLE_KEY=${jwt('service_role')}`],
    ['High entropy assignment', `const apiSecret = "${'Zq8' + 'xL2vN9pR4tW7yB1cF6hJ3kM5'}";`],
  ];
  for (const [name, line] of cases) {
    it(name, () => expect(scanLine(line)).toBeDefined());
  }
});

describe('secrets — true negatives', () => {
  const cases: [string, string][] = [
    ['Supabase anon JWT', `SUPABASE_ANON_KEY=${jwt('anon')}`],
    ['env reference', 'const k = process.env.STRIPE_SECRET_KEY;'],
    ['placeholder', 'STRIPE_SECRET_KEY="your_stripe_secret_key_here_123"'],
    ['xxx placeholder', 'api_key = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"'],
    ['short sk_ word', 'const task_name = "sk_short";'],
    ['low-entropy token', 'token = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1"'],
    ['normal code', 'export function add(a: number, b: number) { return a + b; }'],
    ['postgres without password', 'postgresql://localhost:5432/app'],
    ['css class sk-', '<div className="sk-loader sk-spinner">'],
  ];
  for (const [name, line] of cases) {
    it(name, () => expect(scanLine(line)).toBeUndefined());
  }
});

describe('analyzeSecrets + SARIF', () => {
  it('reports line numbers and builds SARIF 2.1.0', () => {
    const src = `a=1\nSTRIPE=${'sk_' + 'live_' + r(24)}\n`;
    const f = analyzeSecrets('.env', src);
    expect(f).toHaveLength(1);
    expect(f[0]!.line).toBe(2);
    const s = toSarif(f, '0.2.0');
    expect(s.version).toBe('2.1.0');
    expect(s.runs[0]!.results[0]!.level).toBe('error');
    expect(s.runs[0]!.results[0]!.locations[0]!.physicalLocation.region.startLine).toBe(2);
  });
  it('entropy helper', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
    expect(shannonEntropy('abcd')).toBe(2);
  });
});
