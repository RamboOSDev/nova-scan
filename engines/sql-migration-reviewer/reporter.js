'use strict';

// SQL Migration Reviewer V0.1 - reporter (stable JSON shape).
// مولّد التقرير ذو ترتيب مفاتيح ثابت ودلالات إشارات حتمية.

const { listSupportedSignals } = require('./migration-risk-detector');

const LIMITATIONS = Object.freeze([
  'V0.1 uses deterministic SQL text pattern scanning only.',
  'V0.1 does not parse SQL with a full SQL parser.',
  'V0.1 does not connect to a database.',
  'V0.1 does not execute migrations.',
  'V0.1 does not determine business correctness or data-loss certainty.'
]);

const GAP_REASONS = Object.freeze({
  no_sql_migration_files: 'No SQL migration files were discovered in the repository.',
  destructive_sql_migration_detected: 'One or more SQL migrations contain destructive operations.',
  table_or_column_rename_detected: 'One or more SQL migrations rename tables or columns; coordinate with consumers.',
  missing_transaction_wrappers: 'One or more SQL migrations contain multiple schema-changing statements without a BEGIN/COMMIT wrapper.'
});

const SEVERITY_KEYS = ['high', 'medium', 'low', 'info'];

function buildListSignalsPayload(options) {
  return {
    engine: options.engine,
    engine_version: options.engineVersion,
    supported_signals: listSupportedSignals()
  };
}

function emptySummary() {
  return {
    sql_file_count: 0,
    files_with_findings: 0,
    total_findings: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0,
    drop_table_count: 0,
    drop_column_count: 0,
    truncate_count: 0,
    delete_without_where_count: 0,
    update_without_where_count: 0,
    rename_count: 0,
    alter_type_count: 0,
    create_index_count: 0,
    missing_transaction_wrapper_count: 0
  };
}

function buildSummary(fileReports) {
  const summary = emptySummary();
  summary.sql_file_count = fileReports.length;

  for (const file of fileReports) {
    if (file.findings.length > 0) {
      summary.files_with_findings += 1;
    }
    summary.total_findings += file.findings.length;

    for (const finding of file.findings) {
      if (SEVERITY_KEYS.includes(finding.severity)) {
        summary[finding.severity] += 1;
      }
      switch (finding.finding_id) {
        case 'destructive_drop_table':
          summary.drop_table_count += 1;
          break;
        case 'destructive_drop_column':
          summary.drop_column_count += 1;
          break;
        case 'destructive_truncate':
          summary.truncate_count += 1;
          break;
        case 'destructive_delete_without_where':
          summary.delete_without_where_count += 1;
          break;
        case 'destructive_update_without_where':
          summary.update_without_where_count += 1;
          break;
        case 'table_rename_detected':
        case 'column_rename_detected':
          summary.rename_count += 1;
          break;
        case 'raw_alter_type_detected':
          summary.alter_type_count += 1;
          break;
        case 'create_index_detected':
          summary.create_index_count += 1;
          break;
        case 'missing_transaction_wrapper':
          summary.missing_transaction_wrapper_count += 1;
          break;
        default:
          break;
      }
    }
  }

  return summary;
}

function buildGaps(summary) {
  const gaps = [];

  if (summary.sql_file_count === 0) {
    gaps.push({
      gap_id: 'no_sql_migration_files',
      count: 1,
      reason: GAP_REASONS.no_sql_migration_files
    });
    return gaps;
  }

  const destructiveCount =
    summary.drop_table_count +
    summary.drop_column_count +
    summary.truncate_count +
    summary.delete_without_where_count +
    summary.update_without_where_count;

  if (destructiveCount > 0) {
    gaps.push({
      gap_id: 'destructive_sql_migration_detected',
      count: destructiveCount,
      reason: GAP_REASONS.destructive_sql_migration_detected
    });
  }

  if (summary.rename_count > 0) {
    gaps.push({
      gap_id: 'table_or_column_rename_detected',
      count: summary.rename_count,
      reason: GAP_REASONS.table_or_column_rename_detected
    });
  }

  if (summary.missing_transaction_wrapper_count > 0) {
    gaps.push({
      gap_id: 'missing_transaction_wrappers',
      count: summary.missing_transaction_wrapper_count,
      reason: GAP_REASONS.missing_transaction_wrappers
    });
  }

  return gaps;
}

function buildScanReport(options) {
  const fileReports = Array.isArray(options.fileReports) ? options.fileReports : [];
  const summary = buildSummary(fileReports);

  return {
    engine: options.engine,
    engine_version: options.engineVersion,
    repo: options.repo,
    summary,
    files: fileReports.map((file) => ({
      relative_path: file.relative_path,
      statement_count: file.statement_count,
      findings: file.findings.map((finding) => ({
        finding_id: finding.finding_id,
        severity: finding.severity,
        line: finding.line,
        evidence: finding.evidence,
        recommended_action: finding.recommended_action
      }))
    })),
    gaps: buildGaps(summary),
    limitations: LIMITATIONS.slice()
  };
}

module.exports = {
  GAP_REASONS,
  LIMITATIONS,
  buildGaps,
  buildListSignalsPayload,
  buildScanReport,
  buildSummary,
  emptySummary
};
