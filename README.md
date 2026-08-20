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
