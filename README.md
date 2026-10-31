# nova-scan

> Security scanner for AI-generated code — built for apps written with Cursor, Lovable, v0, bolt, and similar AI builders.

AI code generators ship fast — and ship secrets, env leaks, and unauthenticated backend calls along the way. `nova-scan` statically scans your project and flags the issues AI builders most commonly leave behind, before attackers find them.

## Install

```bash
npm install -g nova-scan
# or run directly
npx nova-scan
```

## Usage

```bash
# scan current directory
nova-scan

# scan a specific path
nova-scan ./src

# machine-readable output for CI
nova-scan . --json
```

## What it detects

| Detector | Severity | What it catches |
|---|---|---|
| **Hardcoded secrets** | 🔴 high | API keys (`sk-...`), GitHub tokens (`ghp_...`), AWS keys (`AKIA...`), private keys, database URLs with embedded passwords |
| **Client env leaks** | 🟠 medium | `VITE_` / `NEXT_PUBLIC_` / `REACT_APP_` variables that expose sensitive values to the browser bundle |
| **Unauthenticated backend calls** | 🟠 medium / 🟡 low | Supabase queries and RPC calls from client code that may bypass intended authorization |
| **SQL injection** (`sql-injection`) | 🔴 high | Raw SQL (`query`/`execute`/`knex.raw`/`$queryRawUnsafe`…) built with string concat or template literals from request input (`req.body/query/params`, `searchParams`, `formData`). Tagged `sql\`\`` / Prisma `$queryRaw\`\`` are treated as safe |
| **Unguarded routes** (`auth-guard`) | 🔴 high / 🟠 medium | NestJS admin, money/wallet and webhook routes without guard / public / signature markers |
| **Unvalidated input** (`input-validation`) | 🟠 medium | `@Body/@Query/@Param` inputs without DTO validators or parse pipes |
| **Destructive migrations** (`sql-migration`) | 🔴 high / 🟠 medium | `DROP`, `TRUNCATE`, `DELETE`/`UPDATE` without `WHERE`, renames, type changes, missing transaction |
| **Unsafe code** (`code-safety`) | 🔴 high / 🟠 medium / 🟡 low | `eval`/`new Function`, `dangerouslySetInnerHTML`, tokens in `localStorage`, `@ts-ignore` |
| **Env drift** (`env-drift`) | 🟠 medium / 🟡 low | `.env` vs `.env.example`: missing, extra, duplicate or empty keys (values are never printed) |

Findings include file, line, severity, and a redacted snippet.

## Why it exists

This scanner was built and battle-tested against a real production fintech platform. Running it against live codebases repeatedly found **real, confirmed vulnerabilities** — including unguarded `SECURITY DEFINER` RPCs and publicly executable financial functions. Every detector exists because it caught something real.

## CI integration

```yaml
# GitHub Actions example
- name: Security scan
  run: npx nova-scan . --json > scan-report.json
```

Exit code is `0` even with findings (report-only mode) so you control gating.

## Programmatic use

```ts
import { detectHardcodedSecrets } from 'nova-scan/dist/detectors/secrets.js';

const findings = await detectHardcodedSecrets('./src');
```

## Requirements

- Node.js ≥ 18
- Works on TS/TSX/JS/JSX projects

## License

MIT © Nova Security

## v0.2.0 — hardening

- **CI-friendly exit codes:** exits `1` when findings exist; pass `--no-fail` to always exit `0`.
- **SARIF output:** `nova-scan --sarif . > nova.sarif` (SARIF 2.1.0, uploadable to GitHub code scanning).
- **More secret patterns:** Stripe `sk_live_/sk_test_/rk_*`, OpenAI `sk-proj-`, Anthropic `sk-ant-`, Slack `xox[baprs]-`, Google `AIza`, GitHub `ghp_/gho_/ghu_/ghs_/github_pat_`, AWS, private keys, DB URIs with credentials, Supabase `service_role` JWTs (anon keys are ignored), plus a conservative entropy check for high-entropy values assigned to secret-like names.
- **More files scanned:** `.env*`, `.json`, `.yml/.yaml`, `.py` in addition to JS/TS (lockfiles ignored).
- **Tests + CI:** vitest suite for the secrets detector and a GitHub Actions workflow (install, build, test).

```bash
nova-scan .              # human output, exit 1 on findings
nova-scan --json .       # JSON
nova-scan --sarif .      # SARIF 2.1.0
nova-scan --no-fail .    # never fail the build
```

## v0.3.0 — more detectors

- New **sql-injection** rule (TypeScript, AST-free line/taint heuristics).
- Wrapped five static engines from the Nova scanner suite (vendored CommonJS under `engines/`, zero extra deps): auth-guard, input-validation, sql-migration, code-safety, env-drift.
- All findings share one format (`file`, `line`, `severity`, `snippet`, `message`, `detector`) and appear in `--json` and `--sarif` with one SARIF rule per detector.
- 63 tests.
