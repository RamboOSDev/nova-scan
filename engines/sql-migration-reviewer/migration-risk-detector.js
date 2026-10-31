'use strict';

// SQL Migration Reviewer V0.1 - conservative risk pattern detector.
// كاشف أنماط خطر متحفّظ يعتمد على نص SQL بعد إزالة التعليقات والنصوص.

const SUPPORTED_SIGNALS = Object.freeze([
  {
    id: 'destructive_drop_table',
    severity: 'high',
    description: 'A DROP TABLE statement was detected.'
  },
  {
    id: 'destructive_drop_column',
    severity: 'high',
    description: 'An ALTER TABLE ... DROP COLUMN statement was detected.'
  },
  {
    id: 'destructive_truncate',
    severity: 'high',
    description: 'A TRUNCATE TABLE statement was detected.'
  },
  {
    id: 'destructive_delete_without_where',
    severity: 'high',
    description: 'A DELETE statement without a nearby WHERE clause was detected.'
  },
  {
    id: 'destructive_update_without_where',
    severity: 'high',
    description: 'An UPDATE statement without a nearby WHERE clause was detected.'
  },
  {
    id: 'table_rename_detected',
    severity: 'medium',
    description: 'An ALTER TABLE ... RENAME TO statement was detected.'
  },
  {
    id: 'column_rename_detected',
    severity: 'medium',
    description: 'An ALTER TABLE ... RENAME COLUMN statement was detected.'
  },
  {
    id: 'raw_alter_type_detected',
    severity: 'medium',
    description: 'An ALTER TABLE ... ALTER COLUMN ... TYPE statement was detected.'
  },
  {
    id: 'create_index_detected',
    severity: 'info',
    description: 'A CREATE INDEX statement was detected.'
  },
  {
    id: 'missing_transaction_wrapper',
    severity: 'medium',
    description: 'Multiple schema-changing statements were detected without a BEGIN/COMMIT wrapper.'
  },
  {
    id: 'irreversible_operation_detected',
    severity: 'high',
    description: 'One or more high-severity destructive operations were detected.'
  }
]);

const SIGNAL_RECOMMENDED_ACTIONS = Object.freeze({
  destructive_drop_table:
    'Review whether this migration can permanently remove production data.',
  destructive_drop_column:
    'Review whether this migration can permanently remove production data and confirm a backup or staged rollout.',
  destructive_truncate:
    'Review whether this migration can permanently remove production data; consider a staged delete with WHERE.',
  destructive_delete_without_where:
    'Add an explicit WHERE clause or split into reviewed batches before running in production.',
  destructive_update_without_where:
    'Add an explicit WHERE clause or split into reviewed batches before running in production.',
  table_rename_detected:
    'Coordinate with application code that references the old table name; renames break running consumers.',
  column_rename_detected:
    'Coordinate with application code that references the old column name; renames break running consumers.',
  raw_alter_type_detected:
    'Review whether the new column type is compatible with existing data and indexes.',
  create_index_detected:
    'Confirm the index choice and consider concurrent index creation in production.',
  missing_transaction_wrapper:
    'Wrap multiple schema-changing statements in a single BEGIN/COMMIT transaction so a partial failure rolls back cleanly.',
  irreversible_operation_detected:
    'Review whether the migration can safely run on production data and ensure a backup is available.'
});

const HIGH_DESTRUCTIVE_SIGNAL_IDS = new Set([
  'destructive_drop_table',
  'destructive_drop_column',
  'destructive_truncate',
  'destructive_delete_without_where',
  'destructive_update_without_where'
]);

const SCHEMA_CHANGING_PREFIXES = [
  /^create\s+(unique\s+)?index\b/i,
  /^create\s+table\b/i,
  /^drop\s+table\b/i,
  /^drop\s+index\b/i,
  /^alter\s+table\b/i,
  /^truncate\s+table\b/i,
  /^create\s+schema\b/i,
  /^drop\s+schema\b/i,
  /^create\s+type\b/i,
  /^alter\s+type\b/i,
  /^drop\s+type\b/i,
  /^create\s+sequence\b/i,
  /^alter\s+sequence\b/i,
  /^drop\s+sequence\b/i
];

const TRANSACTION_BOUNDARY_PATTERNS = [
  /^begin(\s+transaction)?\b/i,
  /^start\s+transaction\b/i,
  /^commit(\s+transaction)?\b/i,
  /^rollback(\s+transaction)?\b/i
];

function listSupportedSignals() {
  return SUPPORTED_SIGNALS.map((signal) => ({ ...signal }));
}

function buildFinding(signalId, line, evidence) {
  const baseSignal = SUPPORTED_SIGNALS.find((entry) => entry.id === signalId);
  return {
    finding_id: signalId,
    severity: baseSignal ? baseSignal.severity : 'info',
    line,
    evidence,
    recommended_action: SIGNAL_RECOMMENDED_ACTIONS[signalId] || 'Review the statement.'
  };
}

function isSchemaChangingStatement(normalizedText) {
  return SCHEMA_CHANGING_PREFIXES.some((pattern) => pattern.test(normalizedText));
}

function isTransactionBoundary(normalizedText) {
  return TRANSACTION_BOUNDARY_PATTERNS.some((pattern) => pattern.test(normalizedText));
}

function detectStatementSignals(statement) {
  const findings = [];
  const text = statement.normalized_text;
  const line = statement.start_line;

  if (!text) {
    return findings;
  }

  // DROP TABLE (avoid matching DROP TABLE inside CREATE TABLE IF NOT EXISTS, which is not a thing,
  // but be defensive against rare DROP TABLE IF EXISTS forms).
  if (/^drop\s+table\b/i.test(text)) {
    findings.push(buildFinding('destructive_drop_table', line, 'DROP TABLE statement detected.'));
  }

  // ALTER TABLE ... DROP COLUMN
  if (/^alter\s+table\s+[^;]*\bdrop\s+column\b/i.test(text)) {
    findings.push(buildFinding('destructive_drop_column', line, 'ALTER TABLE ... DROP COLUMN statement detected.'));
  }

  // TRUNCATE [TABLE]
  if (/^truncate(\s+table)?\b/i.test(text)) {
    findings.push(buildFinding('destructive_truncate', line, 'TRUNCATE statement detected.'));
  }

  // DELETE FROM <table> with no WHERE in the same statement.
  if (/^delete\s+from\b/i.test(text)) {
    if (!/\bwhere\b/i.test(text)) {
      findings.push(
        buildFinding(
          'destructive_delete_without_where',
          line,
          'DELETE without WHERE clause detected.'
        )
      );
    }
  }

  // UPDATE <table> SET ... with no WHERE in the same statement.
  // Distinguish from ALTER TABLE statements.
  if (/^update\s+/i.test(text) && /\bset\b/i.test(text)) {
    if (!/\bwhere\b/i.test(text)) {
      findings.push(
        buildFinding(
          'destructive_update_without_where',
          line,
          'UPDATE without WHERE clause detected.'
        )
      );
    }
  }

  // ALTER TABLE ... RENAME TO <new>
  if (/^alter\s+table\s+[^;]*\brename\s+to\b/i.test(text)) {
    findings.push(buildFinding('table_rename_detected', line, 'ALTER TABLE ... RENAME TO statement detected.'));
  }

  // ALTER TABLE ... RENAME COLUMN <old> TO <new>
  if (/^alter\s+table\s+[^;]*\brename\s+column\b/i.test(text)) {
    findings.push(buildFinding('column_rename_detected', line, 'ALTER TABLE ... RENAME COLUMN statement detected.'));
  }

  // ALTER TABLE ... ALTER COLUMN <col> ... TYPE <type>
  // Both Postgres (TYPE) and MySQL (MODIFY/CHANGE) have variants; we restrict V0.1 to "TYPE".
  if (/^alter\s+table\s+[^;]*\balter\s+column\s+[^;]*\btype\b/i.test(text)) {
    findings.push(buildFinding('raw_alter_type_detected', line, 'ALTER TABLE ... ALTER COLUMN ... TYPE statement detected.'));
  }

  // CREATE [UNIQUE] INDEX
  if (/^create\s+(unique\s+)?index\b/i.test(text)) {
    findings.push(buildFinding('create_index_detected', line, 'CREATE INDEX statement detected.'));
  }

  return findings;
}

function detectFileSignals(parsed) {
  const findings = [];
  const statements = Array.isArray(parsed.statements) ? parsed.statements : [];

  for (const statement of statements) {
    findings.push(...detectStatementSignals(statement));
  }

  // Missing transaction wrapper: at least two schema-changing statements and no
  // transaction boundary (BEGIN/START TRANSACTION/COMMIT/ROLLBACK) anywhere in the file.
  const schemaChangingCount = statements.filter((s) => isSchemaChangingStatement(s.normalized_text)).length;
  const hasTransactionBoundary = statements.some((s) => isTransactionBoundary(s.normalized_text));
  if (schemaChangingCount >= 2 && !hasTransactionBoundary) {
    // Attribute to the first schema-changing statement's line (or line 1 if none located).
    const firstChange = statements.find((s) => isSchemaChangingStatement(s.normalized_text));
    findings.push(
      buildFinding(
        'missing_transaction_wrapper',
        firstChange ? firstChange.start_line : 1,
        `${schemaChangingCount} schema-changing statements detected without BEGIN/COMMIT wrapper.`
      )
    );
  }

  // Synthesize the irreversible_operation_detected umbrella signal once if any high-severity destructive op fired.
  const hasHighDestructive = findings.some((finding) => HIGH_DESTRUCTIVE_SIGNAL_IDS.has(finding.finding_id));
  if (hasHighDestructive) {
    const firstHighDestructive = findings.find((finding) => HIGH_DESTRUCTIVE_SIGNAL_IDS.has(finding.finding_id));
    findings.push(
      buildFinding(
        'irreversible_operation_detected',
        firstHighDestructive.line,
        'One or more irreversible high-severity operations were detected in this file.'
      )
    );
  }

  return sortFindings(findings);
}

const SIGNAL_ORDER = new Map(SUPPORTED_SIGNALS.map((signal, index) => [signal.id, index]));

function sortFindings(findings) {
  return findings.slice().sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return (SIGNAL_ORDER.get(left.finding_id) ?? 99) - (SIGNAL_ORDER.get(right.finding_id) ?? 99);
  });
}

module.exports = {
  HIGH_DESTRUCTIVE_SIGNAL_IDS,
  SCHEMA_CHANGING_PREFIXES,
  SUPPORTED_SIGNALS,
  TRANSACTION_BOUNDARY_PATTERNS,
  buildFinding,
  detectFileSignals,
  detectStatementSignals,
  isSchemaChangingStatement,
  isTransactionBoundary,
  listSupportedSignals,
  sortFindings
};
