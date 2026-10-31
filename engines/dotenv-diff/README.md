# Dotenv Diff V0.1

Dotenv Diff is a deterministic offline CLI-first engine for comparing two dotenv-style files at key level.

## CLI

```bash
node cli/nova.js dotenv-diff list-checks --json
node cli/nova.js dotenv-diff compare --base <path> --target <path> --json
```

## What It Does

- compares shared keys
- detects keys missing in the target file
- detects keys extra in the target file
- reports duplicate keys
- reports empty value keys
- reports malformed line counts

## Privacy

Dotenv Diff reads dotenv key names only and never outputs values.

It may output:

- key names
- counts
- duplicate key names
- empty value key names
- file path labels

It must not output:

- raw env values
- tokens
- passwords
- connection strings
- private keys
- full file contents

## Determinism

- key arrays are sorted lexicographically
- JSON key order is stable
- repeated runs with the same inputs are byte-identical
- no timestamps are emitted

## Limitations

- V0.1 compares env key presence only and never outputs values.
- V0.1 does not validate whether env values are correct.
- V0.1 does not load application configuration.
- V0.1 does not perform secret scanning.

## Non-goals

- env value output
- secret scanning
- secret validation
- dotenv mutation
- auto-generation of env files
- directory-wide scanning
- runtime config loading
- Docker Compose env wiring analysis
- TypeScript or NestJS analysis
- Prisma analysis
- network access
- child processes
- LLM usage
- usage tracking
