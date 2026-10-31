'use strict';

const RULES = Object.freeze([
  {
    id: 'admin_route_without_guard_marker',
    severity: 'high',
    description: 'Admin-like routes without an obvious guard marker need manual review.'
  },
  {
    id: 'money_route_without_guard_marker',
    severity: 'high',
    description: 'Money/value-like routes without an obvious guard marker need manual review.'
  },
  {
    id: 'mutation_route_without_guard_marker',
    severity: 'high',
    description: 'PUT, PATCH, and DELETE routes without obvious guard markers need manual review unless they are clearly public or health/auth oriented.'
  },
  {
    id: 'post_route_without_guard_marker',
    severity: 'medium',
    description: 'POST routes without obvious guard markers need manual review when they are not clearly public or auth oriented.'
  },
  {
    id: 'webhook_route_without_signature_or_guard_marker',
    severity: 'medium',
    description: 'Webhook-like routes without obvious guards or signature-verification markers need manual review.'
  },
  {
    id: 'unrecognized_guard_pattern',
    severity: 'medium',
    description: 'Routes with custom guard names are surfaced for manual review because V0.1 does not infer guard behavior.'
  },
  {
    id: 'webhook_signature_marker_detected',
    severity: 'info',
    description: 'Webhook-like routes with signature-verification markers are surfaced as informational review prompts only.'
  },
  {
    id: 'guarded_route_detected',
    severity: 'info',
    description: 'Guarded routes are surfaced as informational confirmation only.'
  },
  {
    id: 'public_marker_on_sensitive_route',
    severity: 'info',
    description: 'Sensitive-looking routes with explicit public markers are surfaced as informational trace points only.'
  },
  {
    id: 'public_route_marker_detected',
    severity: 'info',
    description: 'Routes with explicit public markers are surfaced as informational review prompts only.'
  },
  {
    id: 'auth_or_health_route_detected',
    severity: 'info',
    description: 'Auth-like and health/status routes are surfaced conservatively as informational review prompts.'
  }
]);

const HIGH_METHODS = new Set(['PUT', 'PATCH', 'DELETE']);
const MUTATION_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const SENSITIVE_HINTS = new Set(['admin', 'money_or_value']);

function dedupeSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function buildHaystack(route) {
  return `${route.relative_path} ${route.controller_name} ${route.route_path}`.toLowerCase();
}

function detectHints(route) {
  const haystack = buildHaystack(route);
  const hints = [];

  if (/(^|[^a-z])(admin|staff|dashboard|manage)([^a-z]|$)/.test(haystack)) {
    hints.push('admin');
  }

  if (/(^|[^a-z])(auth|login|register|signup|logout|refresh)([^a-z]|$)/.test(haystack)) {
    hints.push('auth');
  }

  if (/(^|[^a-z])(webhook|webhooks|callback)([^a-z]|$)/.test(haystack)) {
    hints.push('webhook');
  }

  if (/(^|[^a-z])(wallet|payment|payout|transfer|transaction|balance|billing|invoice|order|vote|contest)([^a-z]|$)/.test(haystack)) {
    hints.push('money_or_value');
  }

  if (/(^|[^a-z])(health|status|ping)([^a-z]|$)/.test(haystack)) {
    hints.push('health');
  }

  if (route.public_marker || /(^|[^a-z])public([^a-z]|$)/.test(haystack) || hints.includes('health')) {
    hints.push('public');
  }

  if (MUTATION_METHODS.has(route.method)) {
    hints.push('mutation');
  }

  return dedupeSorted(hints);
}

function buildFinding(route, findingId, severity, evidence, recommendedAction) {
  return {
    finding_id: findingId,
    severity,
    relative_path: route.relative_path,
    controller_name: route.controller_name,
    method: route.method,
    route_path: route.route_path,
    line: route.line,
    hints: route.hints.slice(),
    evidence,
    recommended_action: recommendedAction
  };
}

function hasSensitiveHint(hints) {
  return hints.some((hint) => SENSITIVE_HINTS.has(hint));
}

function hasOnlyCustomGuardPattern(route) {
  const customGuardNames = Array.isArray(route.custom_guard_names) ? route.custom_guard_names : [];
  const namedGuardMarkers = (route.guard_markers || []).filter((marker) => marker !== 'UseGuards');
  return customGuardNames.length > 0 && namedGuardMarkers.length === 0;
}

function classifyRoute(route) {
  const hints = detectHints(route);
  const decoratedRoute = {
    ...route,
    hints
  };

  if (hints.includes('webhook') && !decoratedRoute.webhook_signature_marker && !decoratedRoute.guard_marker) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'medium'
      },
      finding: buildFinding(
        decoratedRoute,
        'webhook_route_without_signature_or_guard_marker',
        'medium',
        decoratedRoute.public_marker
          ? 'Webhook-like route is marked public and does not show an obvious signature-verification marker.'
          : 'Webhook-like route does not show an obvious guard marker or signature-verification marker.',
        'Manual review recommended: verify intended access control and confirm whether explicit signature verification is expected for this route.'
      )
    };
  }

  if (decoratedRoute.public_marker) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'info'
      },
      finding: buildFinding(
        decoratedRoute,
        hasSensitiveHint(hints) ? 'public_marker_on_sensitive_route' : 'public_route_marker_detected',
        'info',
        hasSensitiveHint(hints)
          ? 'Likely sensitive route has an explicit public marker.'
          : 'Route has an explicit public marker.',
        'Verify intended access control and confirm the documented public access pattern for this route.'
      )
    };
  }

  if (hasOnlyCustomGuardPattern(decoratedRoute)) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'medium'
      },
      finding: buildFinding(
        decoratedRoute,
        'unrecognized_guard_pattern',
        'medium',
        'Nova did not recognize an explicit built-in guard name beyond @UseGuards(...).',
        'Manual review recommended: verify intended access control and document how this custom guard is applied.'
      )
    };
  }

  if (decoratedRoute.guard_marker) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'info'
      },
      finding: buildFinding(
        decoratedRoute,
        'guarded_route_detected',
        'info',
        'Route has an obvious guard marker.',
        'Verify intended access control and confirm the selected guard matches the expected access policy for this route.'
      )
    };
  }

  if (hints.includes('admin')) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'high'
      },
      finding: buildFinding(
        decoratedRoute,
        'admin_route_without_guard_marker',
        'high',
        'Likely sensitive admin-like route does not show an obvious guard marker.',
        'Manual review recommended: verify intended access control and decide whether an explicit guard or documented public access pattern is appropriate.'
      )
    };
  }

  if (hints.includes('money_or_value')) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'high'
      },
      finding: buildFinding(
        decoratedRoute,
        'money_route_without_guard_marker',
        'high',
        'Likely sensitive money/value-like route does not show an obvious guard marker.',
        'Manual review recommended: verify intended access control and decide whether an explicit guard or clearer access-control documentation is appropriate.'
      )
    };
  }

  if (hints.includes('webhook') && decoratedRoute.webhook_signature_marker) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'info'
      },
      finding: buildFinding(
        decoratedRoute,
        'webhook_signature_marker_detected',
        'info',
        'Webhook-like route includes an obvious signature-verification marker.',
        'Verify intended access control and confirm the signature verification path is documented for this route.'
      )
    };
  }

  if (hints.includes('health') || hints.includes('auth')) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'info'
      },
      finding: buildFinding(
        decoratedRoute,
        'auth_or_health_route_detected',
        'info',
        hints.includes('health')
          ? 'Health/status-like route appears intentionally low-friction.'
          : 'Auth-like route does not show an obvious guard marker and may be intentionally public.',
        hints.includes('health')
          ? 'Verify intended access control and confirm this route only returns low-risk status information.'
          : 'Manual review recommended: verify intended access control for this auth-like route.'
      )
    };
  }

  if (HIGH_METHODS.has(decoratedRoute.method)) {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'high'
      },
      finding: buildFinding(
        decoratedRoute,
        'mutation_route_without_guard_marker',
        'high',
        'Likely sensitive mutation route does not show an obvious guard marker.',
        'Manual review recommended: verify intended access control and decide whether an explicit guard or documented public access pattern is appropriate.'
      )
    };
  }

  if (decoratedRoute.method === 'POST') {
    return {
      route: {
        ...decoratedRoute,
        review_priority: 'medium'
      },
      finding: buildFinding(
        decoratedRoute,
        'post_route_without_guard_marker',
        'medium',
        'POST route does not show an obvious guard marker.',
        'Manual review recommended: verify intended access control and decide whether an explicit guard or documented public access pattern is appropriate.'
      )
    };
  }

  return {
    route: {
      ...decoratedRoute,
      review_priority: 'info'
    },
    finding: buildFinding(
      decoratedRoute,
      'auth_or_health_route_detected',
      'info',
      'Route does not show an obvious guard marker.',
      'Manual review recommended: verify intended access control and confirm whether this route is intentionally public.'
    )
  };
}

function compareRoutes(left, right) {
  if (left.relative_path !== right.relative_path) {
    return left.relative_path.localeCompare(right.relative_path);
  }
  if (left.controller_name !== right.controller_name) {
    return left.controller_name.localeCompare(right.controller_name);
  }
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  if (left.method !== right.method) {
    return left.method.localeCompare(right.method);
  }
  return left.route_path.localeCompare(right.route_path);
}

const SEVERITY_ORDER = Object.freeze({
  high: 0,
  medium: 1,
  info: 2
});

function compareFindings(left, right) {
  const severityDelta = (SEVERITY_ORDER[left.severity] ?? 99) - (SEVERITY_ORDER[right.severity] ?? 99);
  if (severityDelta !== 0) {
    return severityDelta;
  }
  if (left.relative_path !== right.relative_path) {
    return left.relative_path.localeCompare(right.relative_path);
  }
  if (left.controller_name !== right.controller_name) {
    return left.controller_name.localeCompare(right.controller_name);
  }
  if (left.method !== right.method) {
    return left.method.localeCompare(right.method);
  }
  if (left.route_path !== right.route_path) {
    return left.route_path.localeCompare(right.route_path);
  }
  if (left.line !== right.line) {
    return left.line - right.line;
  }
  return left.finding_id.localeCompare(right.finding_id);
}

function analyzeRoutes(discovery, parsedControllers) {
  const routes = [];
  const findings = [];
  const controllerCount = Array.isArray(parsedControllers.controllers) ? parsedControllers.controllers.length : 0;

  for (const controller of parsedControllers.controllers || []) {
    for (const route of controller.routes || []) {
      const classified = classifyRoute(route);
      routes.push(classified.route);
      findings.push(classified.finding);
    }
  }

  routes.sort(compareRoutes);
  findings.sort(compareFindings);

  const summary = {
    typescript_file_count: Array.isArray(discovery.files) ? discovery.files.length : 0,
    controller_count: controllerCount,
    route_count: routes.length,
    routes_with_guard_marker: routes.filter((route) => route.guard_marker).length,
    routes_without_guard_marker: routes.filter((route) => !route.guard_marker).length,
    routes_with_public_marker: routes.filter((route) => route.public_marker).length,
    admin_route_count: routes.filter((route) => route.hints.includes('admin')).length,
    webhook_route_count: routes.filter((route) => route.hints.includes('webhook')).length,
    money_or_value_route_count: routes.filter((route) => route.hints.includes('money_or_value')).length,
    mutation_route_count: routes.filter((route) => route.hints.includes('mutation')).length,
    findings_count: findings.length,
    high: findings.filter((finding) => finding.severity === 'high').length,
    medium: findings.filter((finding) => finding.severity === 'medium').length,
    info: findings.filter((finding) => finding.severity === 'info').length
  };

  return {
    summary,
    findings,
    routes,
    rules: RULES.map((rule) => ({ ...rule }))
  };
}

module.exports = {
  RULES,
  analyzeRoutes,
  classifyRoute,
  detectHints
};
