# SQL Migration Reviewer V0.1

Deterministic, offline, read-only SQL migration risk scanner. Discovers `.sql`
files under canonical migration directories, parses them with a conservative
text-only pre-tokenizer, and reports structural risk signals. It does **not**
connect to a database, **not** execute SQL, **not** run Prisma, **not** mutate
the scanned repository, and **not** emit full SQL contents.

## Why

Audit Report Mini V0.4 inventories Prisma schemas and counts SQL migration
files but never reads SQL contents. This engine narrowly closes the
`no_sql_migration_reviewer` coverage gap by surfacing high-confidence
destructive patterns, schema-rename signals, and missing-transaction-wrapper
hints. It is **not** a SQL parser and **not** a data-loss certainty engine.

## Discovery paths

`*.sql` files are discovered under directories whose trailing segments match
one of:

- `prisma/migrations/**/*.sql`
- `migrations/**/*.sql`
- `db/migrations/**/*.sql`
- `database/migrations/**/*.sql`

The following directories are always excluded: `node_modules`, `.git`,
`.repovaccine`, `dist`, `build`, `coverage`, `.next`, `.nuxt`, `.cache`,
`.turbo`, `vendor`.

## Signals

| id | severity |
|---|---|
| `destructive_drop_table` | high |
| `destructive_drop_column` | high |
| `destructive_truncate` | high |
| `destructive_delete_without_where` | high |
| `destructive_update_without_where` | high |
| `table_rename_detected` | medium |
| `column_rename_detected` | medium |
| `raw_alter_type_detected` | medium |
| `create_index_detected` | info |
| `missing_transaction_wrapper` | medium |
| `irreversible_operation_detected` | high |

`irreversible_operation_detected` is a synthesized umbrella signal that fires
once per file when any high-severity destructive operation is present.

## CLI

```bash
node cli/nova.js sql-migration-reviewer list-signals --json
node cli/nova.js sql-migration-reviewer scan --repo <path> --json
```

Exit codes follow `cli/exit-codes.js`:

- `0` ok
- `2` bad args (missing `--repo`, unknown subcommand)
- `3` engine unavailable
- `6` IO error (e.g., `--repo` does not exist or is not a directory)

## Privacy

- No full SQL statements in output.
- No database URLs, env values, or secret values.
- No absolute paths inside scanned repo (only relative paths in the `files[]`
  array; the top-level `repo` field follows existing engine conventions).
- Evidence strings are short, normalized labels — never the matched SQL text.

## Non-goals (V0.1)

- No full SQL parser.
- No database connection or SQL execution.
- No Prisma execution.
- No auto-fix.
- No Audit Report Mini integration in this PR.
- No Asset Planner catalog registration in this PR.
- No outcome recording.
- No risk scoring beyond severity counts.
- No business correctness or data-flow analysis.
- No new dependencies.
