import { readFileSync } from 'fs';
import { glob } from 'fast-glob';
import ts from 'typescript';
import type { Finding } from './secrets.js';
import {
  parseSourceFile,
  isInsideStringOrTemplate,
  isInsideComment,
  isLikelyClientFile,
} from './utils/ast.js';

const PUBLIC_KEY_ALLOWLIST = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_POSTHOG_KEY',
  'NEXT_PUBLIC_POSTHOG_HOST',
  'NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_FIREBASE_API_KEY',
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_BASE_URL',
  'NEXT_PUBLIC_VERCEL_URL',
]);

const SUSPICIOUS_NAME_PARTS = [
  'SECRET', 'PRIVATE', 'SERVICE_ROLE',
  'ADMIN', 'PASSWORD', 'INTERNAL',
  'DATABASE_URL', 'CONNECTION_STRING',
];

/**
 * Scan a project tree for `process.env.X` accesses that are likely either
 * server-only env vars read in client code, or NEXT_PUBLIC_ vars whose names
 * suggest they were meant to stay secret.
 */
export async function detectClientEnvLeak(root: string): Promise<Finding[]> {
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
  const findings: Finding[] = [];

  // Find all process.env accesses, then look at their parent which is
  // process.env.X — the third link in the chain.
  const envAccesses = findProcessEnvAccesses(sf);

  for (const { fullNode, varName } of envAccesses) {
    if (isInsideStringOrTemplate(fullNode)) continue;
    if (isInsideComment(sf, fullNode.pos)) continue;

    const classified = classify(varName, isClient);
    if (!classified) continue;

    const { line } = sf.getLineAndCharacterOfPosition(fullNode.getStart(sf));
    const snippetText = source.split('\n')[line]?.trim().slice(0, 200) ?? '';

    findings.push({
      file,
      line: line + 1,
      snippet: snippetText,
      severity: classified.severity,
      message: classified.message,
      detector: 'client-env-leak',
    });
  }

  return findings;
}

interface EnvAccess {
  fullNode: ts.Node;
  varName: string;
}

function findProcessEnvAccesses(sf: ts.SourceFile): EnvAccess[] {
  const out: EnvAccess[] = [];

  const visit = (node: ts.Node): void => {
    // Look for the outermost `process.env.X` shape:
    //   PropertyAccess(node = process.env.X)
    //     expression: PropertyAccess(process.env) OR ElementAccess(process["env"])
    //     name/argument: X
    if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
      const inner = node.expression;
      if (isProcessEnv(inner)) {
        const varName = getAccessName(node);
        if (varName) {
          out.push({ fullNode: node, varName });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function isProcessEnv(node: ts.Node): boolean {
  if (ts.isPropertyAccessExpression(node)) {
    return (
      ts.isIdentifier(node.expression) &&
      node.expression.text === 'process' &&
      ts.isIdentifier(node.name) &&
      node.name.text === 'env'
    );
  }
  if (ts.isElementAccessExpression(node)) {
    if (!ts.isIdentifier(node.expression) || node.expression.text !== 'process') return false;
    const arg = node.argumentExpression;
    return !!arg && ts.isStringLiteral(arg) && arg.text === 'env';
  }
  return false;
}

function getAccessName(node: ts.PropertyAccessExpression | ts.ElementAccessExpression): string | undefined {
  if (ts.isPropertyAccessExpression(node)) {
    return ts.isIdentifier(node.name) ? node.name.text : undefined;
  }
  const arg = node.argumentExpression;
  if (arg && ts.isStringLiteral(arg)) return arg.text;
  return undefined;
}

interface Classification {
  severity: Finding['severity'];
  message: string;
}

function classify(name: string, isClient: boolean): Classification | null {
  if (name.startsWith('NEXT_PUBLIC_')) {
    if (PUBLIC_KEY_ALLOWLIST.has(name)) return null;

    const upper = name.toUpperCase();
    const suspicious = SUSPICIOUS_NAME_PARTS.some((part) => upper.includes(part));
    if (suspicious) {
      return {
        severity: 'medium',
        message: `\`${name}\` is exposed to the browser, but its name suggests it should be secret. Verify intent or remove the NEXT_PUBLIC_ prefix.`,
      };
    }
    return {
      severity: 'info',
      message: `Public env var \`${name}\` accessed. Variables prefixed with NEXT_PUBLIC_ are intentionally exposed to the browser bundle by Next.js. If this is meant to be a secret, rename it without the NEXT_PUBLIC_ prefix.`,
    };
  }

  if (isClient) {
    return {
      severity: 'high',
      message: `Server-only env var \`${name}\` is read from client-side code. At runtime this will be \`undefined\` in the browser AND leaks server-side variable names. Move the read to a Server Component, Server Action, or API route.`,
    };
  }

  return null;
}
