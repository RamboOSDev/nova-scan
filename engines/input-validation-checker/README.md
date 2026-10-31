# Input Validation Checker V0.1

Deterministic offline NestJS and TypeScript input validation review.

This engine scans `.ts` and `.tsx` files, detects conservative route input markers, DTO markers, class-validator decorators, class-transformer markers, ValidationPipe usage, and file upload markers, then emits review prompts in JSON.

## CLI

```bash
node cli/nova.js input-validation-checker list-rules --json
node cli/nova.js input-validation-checker scan --repo <path> --json
```

## Scope

- Offline only
- JSON only in V0.1
- No source code snippets or full file contents in output
- No network, no subprocess execution, no LLM, no usage tracking

## What It Reports

- Body input without obvious DTO or validation pipe markers
- Broad or unclear body typing such as `any`, `unknown`, `object`, or missing type markers
- Query or path parameter input without obvious parse pipe or DTO markers
- DTO classes with or without obvious class-validator markers
- Global ValidationPipe markers
- Handler-level pipe markers
- File upload routes without obvious file validation or limit markers

## Conservative Language

V0.1 uses review-prompt wording only.

- "without obvious validation marker"
- "manual review recommended"
- "verify input validation"
- "review prompt"
- "Nova did not recognize an explicit validation marker"

The engine does not claim validation correctness and does not assert that review prompts prove correctness problems.

## Limitations

- Static text-based analysis only.
- Does not prove validation correctness.
- Does not execute TypeScript, NestJS, npm, tests, or a compiler.
- Does not inspect runtime middleware beyond obvious code markers.
- Custom validation mechanisms may not be recognized in V0.1.
