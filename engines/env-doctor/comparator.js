'use strict';

const SUPPORTED_CHECKS = Object.freeze([
  {
    id: 'missing_keys',
    severity: 'high',
    description: 'Detect keys documented in .env.example but missing from .env.'
  },
  {
    id: 'extra_keys',
    severity: 'low',
    description: 'Detect keys present in .env but not documented in .env.example.'
  },
  {
    id: 'empty_values',
    severity: 'medium',
    description: 'Detect keys that exist but have an empty value.'
  },
  {
    id: 'duplicate_keys',
    severity: 'medium',
    description: 'Detect repeated keys in env files.'
  },
  {
    id: 'malformed_lines',
    severity: 'medium',
    description: 'Detect malformed dotenv lines or invalid key names.'
  },
  {
    id: 'undocumented_keys',
    severity: 'low',
    description: 'Alias for extra keys that are present in .env but undocumented in .env.example.'
  },
  {
    id: 'documented_but_missing_keys',
    severity: 'high',
    description: 'Alias for keys documented in .env.example but missing from .env.'
  }
]);

const CHECK_ORDER = new Map([
  ['missing_keys', 0],
  ['extra_keys', 1],
  ['empty_values', 2],
  ['duplicate_keys', 3],
  ['malformed_lines', 4]
]);

function listSupportedChecks() {
  return SUPPORTED_CHECKS.map((entry) => ({ ...entry }));
}

function formatMalformedReason(reason) {
  switch (reason) {
    case 'missing_equals':
      return 'missing equals sign';
    case 'empty_key':
      return 'empty key before equals sign';
    case 'invalid_key':
      return 'invalid key name';
    default:
      return reason;
  }
}

function compareParsedFiles(envParsed, exampleParsed, options = {}) {
  const envFile = options.envFile || '.env';
  const exampleFile = options.exampleFile || '.env.example';
  const findings = [];

  const envKeys = new Set(envParsed.keys);
  const exampleKeys = new Set(exampleParsed.keys);

  for (const key of exampleParsed.keys) {
    if (!envKeys.has(key)) {
      findings.push({
        check_id: 'missing_keys',
        severity: 'high',
        key,
        file: envFile,
        message: `${key} is documented in ${exampleFile} but missing from ${envFile}.`
      });
    }
  }

  for (const key of envParsed.keys) {
    if (!exampleKeys.has(key)) {
      findings.push({
        check_id: 'extra_keys',
        severity: 'low',
        key,
        file: envFile,
        message: `${key} exists in ${envFile} but is not documented in ${exampleFile}.`
      });
    }
  }

  for (const key of envParsed.empty_keys) {
    findings.push({
      check_id: 'empty_values',
      severity: 'medium',
      key,
      file: envFile,
      message: `${key} is present but has an empty value.`
    });
  }

  for (const key of envParsed.duplicate_keys) {
    findings.push({
      check_id: 'duplicate_keys',
      severity: 'medium',
      key,
      file: envFile,
      message: `${key} appears more than once.`
    });
  }

  for (const key of exampleParsed.duplicate_keys) {
    findings.push({
      check_id: 'duplicate_keys',
      severity: 'medium',
      key,
      file: exampleFile,
      message: `${key} appears more than once.`
    });
  }

  for (const malformedLine of envParsed.malformed_lines) {
    findings.push({
      check_id: 'malformed_lines',
      severity: 'medium',
      file: envFile,
      line_number: malformedLine.line_number,
      message: `Line ${malformedLine.line_number} is malformed: ${formatMalformedReason(malformedLine.reason)}.`
    });
  }

  for (const malformedLine of exampleParsed.malformed_lines) {
    findings.push({
      check_id: 'malformed_lines',
      severity: 'medium',
      file: exampleFile,
      line_number: malformedLine.line_number,
      message: `Line ${malformedLine.line_number} is malformed: ${formatMalformedReason(malformedLine.reason)}.`
    });
  }

  return findings.sort((left, right) => {
    const checkOrderDiff = (CHECK_ORDER.get(left.check_id) ?? 99) - (CHECK_ORDER.get(right.check_id) ?? 99);
    if (checkOrderDiff !== 0) {
      return checkOrderDiff;
    }

    const fileDiff = String(left.file || '').localeCompare(String(right.file || ''));
    if (fileDiff !== 0) {
      return fileDiff;
    }

    const keyDiff = String(left.key || '').localeCompare(String(right.key || ''));
    if (keyDiff !== 0) {
      return keyDiff;
    }

    return (left.line_number || 0) - (right.line_number || 0);
  });
}

module.exports = {
  SUPPORTED_CHECKS,
  compareParsedFiles,
  listSupportedChecks
};
