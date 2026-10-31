'use strict';

const { RULES } = require('./risk-classifier');

const LANGUAGE_DISCLAIMER = 'Findings are conservative review prompts. Nova does not prove input validation correctness; it only reports whether obvious validation markers were detected.';

const LIMITATIONS = Object.freeze([
  'Static text-based analysis only.',
  'Does not prove validation correctness.',
  'Does not execute TypeScript, NestJS, npm, tests, or a compiler.',
  'Does not inspect runtime middleware beyond obvious code markers.',
  'Custom validation mechanisms may not be recognized in V0.1.'
]);

function cloneRules(rules) {
  return rules.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    description: rule.description
  }));
}

function buildListRulesPayload({ engine, engineVersion }) {
  return {
    engine,
    engine_version: engineVersion,
    rules: cloneRules(RULES)
  };
}

function buildScanPayload({ engine, engineVersion, repoPath, analysis }) {
  return {
    engine,
    engine_version: engineVersion,
    repo: repoPath,
    summary: {
      typescript_file_count: analysis.summary.typescript_file_count,
      route_count: analysis.summary.route_count,
      routes_with_input_decorators: analysis.summary.routes_with_input_decorators,
      body_input_route_count: analysis.summary.body_input_route_count,
      query_input_route_count: analysis.summary.query_input_route_count,
      param_input_route_count: analysis.summary.param_input_route_count,
      file_upload_route_count: analysis.summary.file_upload_route_count,
      dto_file_count: analysis.summary.dto_file_count,
      dto_class_count: analysis.summary.dto_class_count,
      dto_classes_with_validator_markers: analysis.summary.dto_classes_with_validator_markers,
      dto_classes_without_validator_markers: analysis.summary.dto_classes_without_validator_markers,
      global_validation_pipe_detected: analysis.summary.global_validation_pipe_detected,
      class_validator_usage_detected: analysis.summary.class_validator_usage_detected,
      class_transformer_usage_detected: analysis.summary.class_transformer_usage_detected,
      findings_count: analysis.summary.findings_count,
      high: analysis.summary.high,
      medium: analysis.summary.medium,
      info: analysis.summary.info
    },
    findings: analysis.findings.map((finding) => ({
      finding_id: finding.finding_id,
      severity: finding.severity,
      relative_path: finding.relative_path,
      controller_name: finding.controller_name,
      method: finding.method,
      route_path: finding.route_path,
      line: finding.line,
      input_kind: finding.input_kind,
      evidence: finding.evidence,
      recommended_action: finding.recommended_action
    })),
    rules_applied: analysis.rules.map((rule) => rule.id),
    language_disclaimer: LANGUAGE_DISCLAIMER,
    limitations: LIMITATIONS.slice()
  };
}

module.exports = {
  LANGUAGE_DISCLAIMER,
  LIMITATIONS,
  buildListRulesPayload,
  buildScanPayload
};
