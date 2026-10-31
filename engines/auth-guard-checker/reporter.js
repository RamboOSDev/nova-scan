'use strict';

const DEPENDS_ON = Object.freeze([
  'static TypeScript/NestJS file discovery',
  'simple controller and route decorator parsing',
  'guard, public marker, and webhook signature heuristics'
]);

const LANGUAGE_DISCLAIMER = 'Routes may not show obvious guard markers. This does not mean those routes are unprotected; they may be intentionally public, middleware-protected, webhook-signed, or use custom guards outside V0.1 recognition.';

const LIMITATIONS = Object.freeze([
  'Static text-based NestJS guard marker analysis only.',
  'Does not prove authentication or authorization correctness.',
  'Does not execute TypeScript, NestJS, npm, tests, or a compiler.',
  'Does not inspect runtime middleware registration.',
  'Public/auth route classification is heuristic and should be manually reviewed.'
]);

function cloneRules(rules) {
  return rules.map((rule) => ({
    id: rule.id,
    severity: rule.severity,
    description: rule.description
  }));
}

function buildListRulesPayload({ engine, engineVersion, rules }) {
  return {
    engine,
    engine_version: engineVersion,
    rules: cloneRules(rules)
  };
}

function buildScanPayload({ engine, engineVersion, repoPath, analysis }) {
  return {
    engine,
    engine_version: engineVersion,
    repo: repoPath,
    depends_on: DEPENDS_ON.slice(),
    summary: {
      typescript_file_count: analysis.summary.typescript_file_count,
      controller_count: analysis.summary.controller_count,
      route_count: analysis.summary.route_count,
      routes_with_guard_marker: analysis.summary.routes_with_guard_marker,
      routes_without_guard_marker: analysis.summary.routes_without_guard_marker,
      routes_with_public_marker: analysis.summary.routes_with_public_marker,
      admin_route_count: analysis.summary.admin_route_count,
      webhook_route_count: analysis.summary.webhook_route_count,
      money_or_value_route_count: analysis.summary.money_or_value_route_count,
      mutation_route_count: analysis.summary.mutation_route_count,
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
      hints: finding.hints.slice(),
      evidence: finding.evidence,
      recommended_action: finding.recommended_action
    })),
    rules_applied: analysis.rules.map((rule) => rule.id),
    language_disclaimer: LANGUAGE_DISCLAIMER,
    limitations: LIMITATIONS.slice()
  };
}

module.exports = {
  DEPENDS_ON,
  LANGUAGE_DISCLAIMER,
  LIMITATIONS,
  buildListRulesPayload,
  buildScanPayload
};
