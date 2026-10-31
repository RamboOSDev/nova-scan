# Auth Guard Checker V0.1

Auth Guard Checker is a deterministic offline CLI-first engine for conservative TypeScript/NestJS route guard coverage review.

It maps controller routes, looks for obvious guard markers, public markers, and webhook signature-ish markers, then emits review prompts. It does not prove authentication or authorization correctness.

## Commands

```bash
node cli/nova.js auth-guard-checker list-rules --json
node cli/nova.js auth-guard-checker scan --repo <path> --json
```

## Rules

- offline only
- no LLM
- no network
- no telemetry
- no subprocess execution
- no TypeScript compiler
- no NestJS execution
- no npm execution
- no repo mutation

## Limitations

- Static text-based NestJS guard marker analysis only.
- Does not prove authentication or authorization correctness.
- Does not execute TypeScript, NestJS, npm, tests, or a compiler.
- Does not inspect runtime middleware registration.
- Public/auth route classification is heuristic and should be manually reviewed.
