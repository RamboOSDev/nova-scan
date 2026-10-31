'use strict';

function buildSummary(options = {}) {
  const envParsed = options.envParsed || { keys: [] };
  const exampleParsed = options.exampleParsed || { keys: [] };
  const findings = Array.isArray(options.findings) ? options.findings : [];
  const filesChecked = options.filesChecked == null ? 2 : options.filesChecked;

  const severityCounts = {
    high: 0,
    medium: 0,
    low: 0
  };

  for (const finding of findings) {
    if (Object.prototype.hasOwnProperty.call(severityCounts, finding.severity)) {
      severityCounts[finding.severity] += 1;
    }
  }

  return {
    files_checked: filesChecked,
    keys_in_env: Array.isArray(envParsed.keys) ? envParsed.keys.length : 0,
    keys_in_example: Array.isArray(exampleParsed.keys) ? exampleParsed.keys.length : 0,
    findings_count: findings.length,
    severity_counts: severityCounts,
    status: findings.length === 0 ? 'clean' : 'needs_attention'
  };
}

module.exports = {
  buildSummary
};
