'use strict';

const RULES = Object.freeze([
  {
    id: 'body_input_without_obvious_validation_marker',
    severity: 'high',
    description: 'Mutation routes with body input and no obvious DTO or validation pipe marker are surfaced as review prompts.'
  },
  {
    id: 'body_input_uses_any_or_plain_object',
    severity: 'high',
    description: 'Body input using broad or unclear typing is surfaced as a high review prompt.'
  },
  {
    id: 'query_input_without_parse_or_dto_marker',
    severity: 'medium',
    description: 'Query input without an obvious parse pipe or DTO marker is surfaced as a review prompt.'
  },
  {
    id: 'param_input_without_parse_marker',
    severity: 'medium',
    description: 'Path parameter input without an obvious parse pipe or DTO marker is surfaced as a review prompt.'
  },
  {
    id: 'dto_without_validator_markers',
    severity: 'medium',
    description: 'DTO classes without obvious class-validator decorators are surfaced as review prompts.'
  },
  {
    id: 'file_upload_without_obvious_validation_marker',
    severity: 'medium',
    description: 'File upload routes without obvious validation or limit markers are surfaced as review prompts.'
  },
  {
    id: 'global_validation_pipe_detected',
    severity: 'info',
    description: 'Global ValidationPipe markers are surfaced as informational context only.'
  },
  {
    id: 'dto_with_validator_markers',
    severity: 'info',
    description: 'DTO classes with obvious class-validator decorators are surfaced as informational context only.'
  },
  {
    id: 'handler_pipe_detected',
    severity: 'info',
    description: 'Route inputs with obvious validation or parsing pipe markers are surfaced as informational context only.'
  }
]);

const SEVERITY_ORDER = Object.freeze({
  high: 0,
  medium: 1,
  info: 2
});

function buildFinding(base, findingId, severity, evidence, recommendedAction) {
  return {
    finding_id: findingId,
    severity,
    relative_path: base.relative_path,
    controller_name: base.controller_name ?? null,
    method: base.method ?? null,
    route_path: base.route_path ?? null,
    line: base.line ?? null,
    input_kind: base.input_kind ?? null,
    evidence,
    recommended_action: recommendedAction
  };
}

function dedupeSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function collectTypeIdentifiers(typeText) {
  const identifiers = [];
  const source = String(typeText || '');
  const pattern = /\b([A-Za-z_$][A-Za-z0-9_$]*)\b/g;
  let match = pattern.exec(source);

  while (match) {
    identifiers.push(match[1]);
    match = pattern.exec(source);
  }

  return dedupeSorted(identifiers);
}

function hasDtoMarker(parameter, route, dtoAnalysis) {
  const identifiers = collectTypeIdentifiers(parameter.type_text);
  if (identifiers.some((identifier) => /(Dto|DTO)$/.test(identifier))) {
    return true;
  }

  if (identifiers.some((identifier) => route.imported_dto_identifiers.includes(identifier))) {
    return true;
  }

  return identifiers.some((identifier) => dtoAnalysis.dto_class_names.has(identifier));
}

function selectPrimaryInputKind(route) {
  if (route.input_kinds.includes('body')) {
    return 'body';
  }
  if (route.input_kinds.includes('query')) {
    return 'query';
  }
  if (route.input_kinds.includes('param')) {
    return 'param';
  }
  if (route.input_kinds.includes('file') || route.upload_interceptor_markers.length > 0) {
    return 'file';
  }
  if (route.input_kinds.includes('headers')) {
    return 'headers';
  }

  return null;
}

function summarizeCounts(findings) {
  return findings.reduce((summary, finding) => {
    summary[finding.severity] += 1;
    return summary;
  }, { high: 0, medium: 0, info: 0 });
}

function compareFindings(left, right) {
  const severityDelta = (SEVERITY_ORDER[left.severity] ?? 99) - (SEVERITY_ORDER[right.severity] ?? 99);
  if (severityDelta !== 0) {
    return severityDelta;
  }
  if (left.relative_path !== right.relative_path) {
    return left.relative_path.localeCompare(right.relative_path);
  }
  if ((left.line ?? 0) !== (right.line ?? 0)) {
    return (left.line ?? 0) - (right.line ?? 0);
  }
  return left.finding_id.localeCompare(right.finding_id);
}

function analyzeRouteFindings(route, dtoAnalysis) {
  const findings = [];
  const bodyParameters = route.input_parameters.filter((parameter) => parameter.input_kind === 'body');
  const queryParameters = route.input_parameters.filter((parameter) => parameter.input_kind === 'query');
  const paramParameters = route.input_parameters.filter((parameter) => parameter.input_kind === 'param');
  const fileParameters = route.input_parameters.filter((parameter) => parameter.input_kind === 'file');
  const routeHasDecoratorPipeMarkers = route.decorator_pipe_markers.length > 0;

  if (bodyParameters.length > 0) {
    const broadBodyParameter = bodyParameters.find((parameter) => parameter.broad_type);
    if (broadBodyParameter) {
      findings.push(buildFinding(
        {
          relative_path: route.relative_path,
          controller_name: route.controller_name,
          method: route.method,
          route_path: route.route_path,
          line: route.line,
          input_kind: 'body'
        },
        'body_input_uses_any_or_plain_object',
        'high',
        'Body input uses a broad or unclear type marker; verify input validation is enforced through DTOs, pipes, or another documented mechanism.',
        'Verify this input is validated through DTOs, pipes, global validation, or another documented mechanism.'
      ));
    } else if (
      ['POST', 'PUT', 'PATCH'].includes(route.method)
      && bodyParameters.some((parameter) =>
        !hasDtoMarker(parameter, route, dtoAnalysis)
        && parameter.pipe_markers.length === 0
      )
      && !routeHasDecoratorPipeMarkers
    ) {
      findings.push(buildFinding(
        {
          relative_path: route.relative_path,
          controller_name: route.controller_name,
          method: route.method,
          route_path: route.route_path,
          line: route.line,
          input_kind: 'body'
        },
        'body_input_without_obvious_validation_marker',
        'high',
        'Mutation route accepts body input without an obvious DTO or validation pipe marker; manual review recommended.',
        'Verify this input is validated through DTOs, pipes, global validation, or another documented mechanism.'
      ));
    }
  }

  if (
    queryParameters.length > 0
    && queryParameters.some((parameter) =>
      parameter.pipe_markers.length === 0
      && !hasDtoMarker(parameter, route, dtoAnalysis)
    )
    && !routeHasDecoratorPipeMarkers
  ) {
    findings.push(buildFinding(
      {
        relative_path: route.relative_path,
        controller_name: route.controller_name,
        method: route.method,
        route_path: route.route_path,
        line: route.line,
        input_kind: 'query'
      },
      'query_input_without_parse_or_dto_marker',
      'medium',
      'Route accepts query input without an obvious parse pipe or DTO marker; verify intended validation.',
      'Verify input validation is documented for this query input surface.'
    ));
  }

  if (
    paramParameters.length > 0
    && paramParameters.some((parameter) =>
      parameter.pipe_markers.length === 0
      && !hasDtoMarker(parameter, route, dtoAnalysis)
    )
    && !routeHasDecoratorPipeMarkers
  ) {
    findings.push(buildFinding(
      {
        relative_path: route.relative_path,
        controller_name: route.controller_name,
        method: route.method,
        route_path: route.route_path,
        line: route.line,
        input_kind: 'param'
      },
      'param_input_without_parse_marker',
      'medium',
      'Route accepts path parameter input without an obvious parse pipe marker; verify intended validation.',
      'Verify input validation is documented for this path parameter surface.'
    ));
  }

  if (
    (fileParameters.length > 0 || route.upload_interceptor_markers.length > 0)
    && route.file_validation_markers.length === 0
  ) {
    findings.push(buildFinding(
      {
        relative_path: route.relative_path,
        controller_name: route.controller_name,
        method: route.method,
        route_path: route.route_path,
        line: route.line,
        input_kind: 'file'
      },
      'file_upload_without_obvious_validation_marker',
      'medium',
      'File upload route has no obvious file validation or limit marker; manual review recommended.',
      'Verify input validation is documented for this file upload surface.'
    ));
  }

  if (route.handler_pipe_markers.length > 0) {
    findings.push(buildFinding(
      {
        relative_path: route.relative_path,
        controller_name: route.controller_name,
        method: route.method,
        route_path: route.route_path,
        line: route.line,
        input_kind: selectPrimaryInputKind(route)
      },
      'handler_pipe_detected',
      'info',
      'Route input has an obvious validation or parsing pipe marker.',
      'Verify input validation is documented for this route and confirm the selected pipe matches the intended input surface.'
    ));
  }

  return findings;
}

function analyzeDtoFindings(dtoAnalysis) {
  const findings = [];

  for (const entry of dtoAnalysis.dto_entries) {
    if (entry.validator_markers.length === 0) {
      findings.push(buildFinding(
        {
          relative_path: entry.relative_path,
          controller_name: null,
          method: null,
          route_path: null,
          line: entry.line,
          input_kind: 'body'
        },
        'dto_without_validator_markers',
        'medium',
        `DTO class ${entry.class_name} has no obvious class-validator markers; manual review recommended.`,
        'Verify input validation is enforced through DTO decorators, pipes, or another documented mechanism.'
      ));
      continue;
    }

    findings.push(buildFinding(
      {
        relative_path: entry.relative_path,
        controller_name: null,
        method: null,
        route_path: null,
        line: entry.line,
        input_kind: 'body'
      },
      'dto_with_validator_markers',
      'info',
      `DTO class ${entry.class_name} has obvious class-validator markers.`,
      'Verify input validation is documented for this DTO and confirm the validator markers match the intended input shape.'
    ));
  }

  return findings;
}

function analyzeValidationSurface(discovery, parsedControllers, dtoAnalysis, markerAnalysis) {
  const routes = parsedControllers.controllers.flatMap((controller) => controller.routes);
  const findings = [];

  if (markerAnalysis.global_validation_pipe_detected && markerAnalysis.global_validation_pipe_location) {
    findings.push(buildFinding(
      {
        relative_path: markerAnalysis.global_validation_pipe_location.relative_path,
        controller_name: null,
        method: null,
        route_path: null,
        line: markerAnalysis.global_validation_pipe_location.line,
        input_kind: null
      },
      'global_validation_pipe_detected',
      'info',
      'Global ValidationPipe marker detected.',
      'Verify input validation is documented for the global pipe configuration and keep route-level review prompts in context.'
    ));
  }

  findings.push(...analyzeDtoFindings(dtoAnalysis));

  for (const route of routes) {
    findings.push(...analyzeRouteFindings(route, dtoAnalysis));
  }

  findings.sort(compareFindings);

  const severityCounts = summarizeCounts(findings);
  const dtoEntriesWithValidators = dtoAnalysis.dto_entries.filter((entry) => entry.validator_markers.length > 0);
  const dtoEntriesWithoutValidators = dtoAnalysis.dto_entries.filter((entry) => entry.validator_markers.length === 0);

  return {
    summary: {
      typescript_file_count: discovery.files.length,
      route_count: routes.length,
      routes_with_input_decorators: routes.filter((route) => route.input_kinds.length > 0).length,
      body_input_route_count: routes.filter((route) => route.input_kinds.includes('body')).length,
      query_input_route_count: routes.filter((route) => route.input_kinds.includes('query')).length,
      param_input_route_count: routes.filter((route) => route.input_kinds.includes('param')).length,
      file_upload_route_count: routes.filter((route) =>
        route.input_kinds.includes('file') || route.upload_interceptor_markers.length > 0
      ).length,
      dto_file_count: dtoAnalysis.dto_files.length,
      dto_class_count: dtoAnalysis.dto_entries.length,
      dto_classes_with_validator_markers: dtoEntriesWithValidators.length,
      dto_classes_without_validator_markers: dtoEntriesWithoutValidators.length,
      global_validation_pipe_detected: markerAnalysis.global_validation_pipe_detected,
      class_validator_usage_detected: markerAnalysis.class_validator_usage_detected,
      class_transformer_usage_detected: markerAnalysis.class_transformer_usage_detected,
      findings_count: findings.length,
      high: severityCounts.high,
      medium: severityCounts.medium,
      info: severityCounts.info
    },
    findings,
    rules: RULES
  };
}

module.exports = {
  RULES,
  SEVERITY_ORDER,
  analyzeValidationSurface,
  buildFinding,
  collectTypeIdentifiers,
  compareFindings,
  hasDtoMarker,
  selectPrimaryInputKind
};
