import { describe, it, expect } from 'vitest';
import { analyzeSource } from '../../src/detectors/supabase-unauth';

const clientHeader = `"use client";\n`;

describe('supabase-unauth — must NOT trigger', () => {
  it('template literal containing supabase.from(...).select() (docs/example string)', () => {
    const out = analyzeSource(
      'lib/docs.ts',
      "const docs = `supabase.from('users').select()`;",
    );
    expect(out).toEqual([]);
  });

  it('commented-out call', () => {
    const out = analyzeSource(
      'lib/docs.ts',
      "// supabase.from('users').select()\nexport const x = 1;",
    );
    expect(out).toEqual([]);
  });

  it('JSX with a template literal example', () => {
    const out = analyzeSource(
      'app/docs.tsx',
      `${clientHeader}export default function Docs() { return <pre>{\`supabase.from('users').select()\`}</pre>; }`,
    );
    expect(out).toEqual([]);
  });
});

describe('supabase-unauth — must trigger', () => {
  it('sensitive table in client file → medium', () => {
    const out = analyzeSource(
      'app/page.tsx',
      `${clientHeader}async function load(supabase: any) { await supabase.from('users').select('*'); }`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('medium');
    expect(out[0]?.message).toMatch(/Row Level Security/);
  });

  it('non-sensitive table in client file → low', () => {
    const out = analyzeSource(
      'app/page.tsx',
      `${clientHeader}async function load(supabase: any) { await supabase.from('public_announcements').select('*'); }`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('low');
  });

  it('sensitive table in server file → low', () => {
    const out = analyzeSource(
      'lib/server.ts',
      `async function load(supabase: any) { await supabase.from('sessions').select('*'); }`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('low');
  });

  it('non-sensitive table in server file → info', () => {
    const out = analyzeSource(
      'lib/server.ts',
      `async function load(supabase: any) { await supabase.from('instruments').select(); }`,
    );
    expect(out).toHaveLength(1);
    expect(out[0]?.severity).toBe('info');
  });
});
