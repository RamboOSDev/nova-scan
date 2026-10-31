'use strict';

const GUARD_MARKER_RULES = Object.freeze([
  ['UseGuards', /@\s*UseGuards\b/],
  ['JwtAuthGuard', /\bJwtAuthGuard\b/],
  ['RolesGuard', /\bRolesGuard\b/],
  ['AuthGuard', /\bAuthGuard\b/],
  ['AdminGuard', /\bAdminGuard\b/],
  ['PermissionsGuard', /\bPermissionsGuard\b/],
  ['ApiKeyGuard', /\bApiKeyGuard\b/]
]);

const PUBLIC_MARKER_RULES = Object.freeze([
  ['Public', /@\s*Public\b/],
  ['SkipAuth', /@\s*SkipAuth\b/],
  ['AllowAnonymous', /@\s*AllowAnonymous\b/],
  ['Open', /@\s*Open\b/],
  ['Anonymous', /@\s*Anonymous\b/]
]);

const SIGNATURE_MARKER_PATTERNS = Object.freeze([
  /\bsignature\b/i,
  /\bconstruct[_A-Za-z]*event\b/i,
  /\bverify(?:[_A-Za-z][A-Za-z0-9_]*)?\b/i,
  /x-hub-signature/i,
  /stripe-signature/i,
  /svix-signature/i,
  /\bhmac\b/i
]);
const KNOWN_GUARD_NAMES = new Set([
  'JwtAuthGuard',
  'RolesGuard',
  'AuthGuard',
  'AdminGuard',
  'PermissionsGuard',
  'ApiKeyGuard'
]);

function dedupeSorted(values) {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function detectNamedMarkers(text, rules) {
  const source = String(text || '');
  const markers = [];

  for (const [marker, pattern] of rules) {
    if (pattern.test(source)) {
      markers.push(marker);
    }
  }

  return dedupeSorted(markers);
}

function detectGuardMarkers(text) {
  return detectNamedMarkers(text, GUARD_MARKER_RULES);
}

function detectPublicMarkers(text) {
  return detectNamedMarkers(text, PUBLIC_MARKER_RULES);
}

function detectWebhookSignatureMarker(text) {
  const source = String(text || '');
  return SIGNATURE_MARKER_PATTERNS.some((pattern) => pattern.test(source));
}

function detectCustomGuardNames(text) {
  const source = String(text || '');
  const matches = [];
  const useGuardsPattern = /@\s*UseGuards\s*\(([\s\S]*?)\)/g;
  let match = useGuardsPattern.exec(source);

  while (match) {
    const guardPattern = /\b([A-Z][A-Za-z0-9_$]*Guard)\b/g;
    let guardMatch = guardPattern.exec(match[1]);

    while (guardMatch) {
      const guardName = guardMatch[1];
      if (!KNOWN_GUARD_NAMES.has(guardName)) {
        matches.push(guardName);
      }
      guardMatch = guardPattern.exec(match[1]);
    }

    match = useGuardsPattern.exec(source);
  }

  return dedupeSorted(matches);
}

module.exports = {
  GUARD_MARKER_RULES,
  KNOWN_GUARD_NAMES,
  PUBLIC_MARKER_RULES,
  SIGNATURE_MARKER_PATTERNS,
  detectCustomGuardNames,
  detectGuardMarkers,
  detectPublicMarkers,
  detectWebhookSignatureMarker
};
