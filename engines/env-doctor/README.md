# Env Doctor V0.1

Env Doctor is a deterministic offline CLI-first tool for local env-file hygiene.

It compares local env-style files such as:

- `.env`
- `.env.example`
- `.env.local`
- `.env.template`

It detects:

- missing keys
- extra keys
- empty values
- duplicate keys
- malformed env lines
- undocumented keys
- documented-but-missing keys

## CLI

```bash
node cli/nova.js env-doctor list-checks --json
node cli/nova.js env-doctor parse --file src/ai/engines/env-doctor/fixtures/healthy/.env --json
node cli/nova.js env-doctor scan --repo src/ai/engines/env-doctor/fixtures/healthy --json
node cli/nova.js env-doctor scan --repo src/ai/engines/env-doctor/fixtures/healthy --env-file .env --example-file .env.example --json
```

## Rules

- Offline only
- No network
- No telemetry
- No dependency additions
- No `process.env` mutation
- No writes to scanned repos
- No secret values in output
