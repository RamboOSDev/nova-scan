'use strict';

const CHECKS = Object.freeze([
  {
    id: 'key_presence_diff',
    description: 'Compare shared, missing, and extra dotenv key names between two files.'
  },
  {
    id: 'duplicate_key_detection',
    description: 'Detect duplicate key definitions within either compared dotenv file.'
  },
  {
    id: 'empty_value_detection',
    description: 'Detect dotenv keys that are present with empty values.'
  },
  {
    id: 'malformed_line_detection',
    description: 'Count malformed non-comment dotenv lines that cannot be parsed safely.'
  },
  {
    id: 'value_redaction_guarantee',
    description: 'Guarantee that output contains key names only and never emits dotenv values.'
  }
]);

const LIMITATIONS = Object.freeze([
  'V0.1 compares env key presence only and never outputs values.',
  'V0.1 does not validate whether env values are correct.',
  'V0.1 does not load application configuration.',
  'V0.1 does not perform secret scanning.'
]);

function buildListChecksPayload({ engine, engineVersion, checks }) {
  return {
    engine,
    engine_version: engineVersion,
    supported_checks: checks.map((check) => ({
      id: check.id,
      description: check.description
    }))
  };
}

function buildComparePayload({ engine, engineVersion, compared }) {
  return {
    engine,
    engine_version: engineVersion,
    base: {
      path: compared.base.path,
      keys_count: compared.base.keys_count,
      duplicate_keys: compared.base.duplicate_keys.slice(),
      empty_value_keys: compared.base.empty_value_keys.slice(),
      malformed_lines_count: compared.base.malformed_lines_count
    },
    target: {
      path: compared.target.path,
      keys_count: compared.target.keys_count,
      duplicate_keys: compared.target.duplicate_keys.slice(),
      empty_value_keys: compared.target.empty_value_keys.slice(),
      malformed_lines_count: compared.target.malformed_lines_count
    },
    diff: {
      shared_keys: compared.diff.shared_keys.slice(),
      missing_in_target: compared.diff.missing_in_target.slice(),
      extra_in_target: compared.diff.extra_in_target.slice(),
      same_key_count: compared.diff.same_key_count,
      missing_in_target_count: compared.diff.missing_in_target_count,
      extra_in_target_count: compared.diff.extra_in_target_count
    },
    summary: {
      has_drift: compared.summary.has_drift,
      has_duplicates: compared.summary.has_duplicates,
      has_empty_values: compared.summary.has_empty_values,
      has_malformed_lines: compared.summary.has_malformed_lines
    },
    limitations: LIMITATIONS.slice()
  };
}

module.exports = {
  CHECKS,
  LIMITATIONS,
  buildComparePayload,
  buildListChecksPayload
};
