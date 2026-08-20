import { describe, it, expect } from 'vitest';
import { analyzeSource } from '../../src/detectors/client-env-leak';

const clientHeader = `"use client";\n`;

describe('client-env-leak — must NOT trigger', () => {
  it('allowlisted NEXT_PUBLIC_SUPABASE_ANON_KEY in client file', () => {
    const out = analyzeSource(
      'app/page.tsx',
      `${clientHeader}const k = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;`,
    );
    expect(out).toEqual([]);
  });

  it('allowlisted NEXT_PUBLIC_SUPABASE_URL in any file', () => {
    const out = analyzeSource(
      'lib/server.ts',
      `const u = process.env.NEXT_PUBLIC_SUPABASE_URL;`,
    );
    expect(out).toEqual([]);
  });

  it('server-only var in a server file (no "use client")', () => {
    const out = analyzeSource(
      'lib/server.ts',
      `const k = process.env.STRIPE_SECRET_KEY;`,
    );
    expect(out).toEqual([]);
  });

  it('process.env reference inside a comment is ignored', () => {
    const out = analyzeSource(
      'app/page.tsx',
      `${clientHeader}// process.env.SECRET_KEY is documented here\nexport const x = 1;`,
    );
    expect(out).toEqual([]);
  });

  it('process.env reference inside a template literal is ignored', () => {
    const out = analyzeSource(
      'app/page.tsx',
      `${clientHeader}const example = \`process.env.SECRET_KEY\`;`,
    );
    expect(out).toEqual([]);
  });
});

describe('client-env-leak — must trigger', () => {
  it('server-only var inside "use client" → high', () => {
    const out = analyzeSource(
      'app/page.tsx',
      `${clientHeader}const k = process.env.STRIPE_SECRET_KEY;`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('high');
    expect(out[0]?.message).toMatch(/Server-only env var/);
  });

  it('NEXT_PUBLIC_DATABASE_URL → medium', () => {
    const out = analyzeSource(
      'app/page.tsx',
      `const x = process.env.NEXT_PUBLIC_DATABASE_URL;`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('medium');
  });

  it('NEXT_PUBLIC_ADMIN_TOKEN → medium', () => {
    const out = analyzeSource(
      'lib/util.ts',
      `const x = process.env.NEXT_PUBLIC_ADMIN_TOKEN;`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('medium');
  });

  it('NEXT_PUBLIC_FEATURE_FLAG_X → info', () => {
    const out = analyzeSource(
      'lib/util.ts',
      `const x = process.env.NEXT_PUBLIC_FEATURE_FLAG_X;`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('info');
  });
});
