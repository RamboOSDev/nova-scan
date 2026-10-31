'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const {
  detectCustomGuardNames,
  detectGuardMarkers,
  detectPublicMarkers,
  detectWebhookSignatureMarker
} = require('./guard-detector');

const CONTROLLER_DECORATOR_PATTERN = /@\s*Controller\b/;
const CONTROLLER_DECORATOR_LINE = /^\s*@Controller\s*\((.*?)\)\s*$/;
const ROUTE_DECORATOR_LINE = /^\s*@(?<decorator>Get|Post|Put|Patch|Delete)\s*\((?<args>.*)\)\s*$/;
const CLASS_DECLARATION = /\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/;
const HANDLER_DECLARATION = /^\s*(?:(?:public|private|protected|static|async)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/;

const ROUTE_METHODS = Object.freeze({
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE'
});

function hasControllerDecorator(text) {
  return CONTROLLER_DECORATOR_PATTERN.test(String(text || ''));
}

function parseDecoratorLiteral(rawArgs) {
  const args = String(rawArgs || '').trim();
  if (args === '') {
    return '';
  }

  const singleQuoted = args.match(/^'([^']*)'$/);
  if (singleQuoted) {
    return singleQuoted[1];
  }

  const doubleQuoted = args.match(/^"([^"]*)"$/);
  if (doubleQuoted) {
    return doubleQuoted[1];
  }

  return 'unknown';
}

function normalizeRouteSegment(segment) {
  return String(segment || '').replace(/^\/+/, '').replace(/\/+$/, '');
}

function combineRoutePath(basePath, routePath) {
  if (basePath === 'unknown' || routePath === 'unknown') {
    return 'unknown';
  }

  const normalizedBase = normalizeRouteSegment(basePath);
  const normalizedRoute = normalizeRouteSegment(routePath);

  if (normalizedBase === '' && normalizedRoute === '') {
    return '';
  }

  if (normalizedBase === '') {
    return normalizedRoute;
  }

  if (normalizedRoute === '') {
    return normalizedBase;
  }

  return `${normalizedBase}/${normalizedRoute}`;
}

function extractPrimaryClassName(text) {
  const match = String(text || '').match(CLASS_DECLARATION);
  return match ? match[1] : null;
}

function findClassLineIndex(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    if (CLASS_DECLARATION.test(lines[index])) {
      return index;
    }
  }

  return -1;
}

function extractControllerBasePath(lines, isControllerCandidate) {
  if (!isControllerCandidate) {
    return null;
  }

  for (const line of lines) {
    const match = line.match(CONTROLLER_DECORATOR_LINE);
    if (match) {
      return parseDecoratorLiteral(match[1]);
    }
  }

  return 'unknown';
}

function findHandlerInfo(lines, startIndex) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    const match = lines[index].match(HANDLER_DECLARATION);
    if (match) {
      return {
        handler_name: match[1],
        line_index: index
      };
    }
  }

  return {
    handler_name: 'unknown',
    line_index: startIndex
  };
}

function findDecoratorBlockStart(lines, routeDecoratorIndex, classLineIndex) {
  let index = routeDecoratorIndex - 1;
  let start = routeDecoratorIndex;

  while (index > classLineIndex) {
    const trimmed = lines[index].trim();
    if (trimmed === '' || trimmed.startsWith('@')) {
      start = index;
      index -= 1;
      continue;
    }

    break;
  }

  return start;
}

function findMethodBlockEnd(lines, handlerLineIndex) {
  for (let index = handlerLineIndex + 1; index < lines.length; index += 1) {
    if (ROUTE_DECORATOR_LINE.test(lines[index].trim())) {
      return index;
    }
  }

  return lines.length;
}

function parseControllerText(relativePath, text) {
  const normalizedText = String(text || '');
  const fileName = path.basename(String(relativePath || '')).toLowerCase();
  const controllerCandidate = fileName.endsWith('.controller.ts') || hasControllerDecorator(normalizedText);

  if (!controllerCandidate) {
    return null;
  }

  const lines = normalizedText.split(/\r?\n/);
  const classLineIndex = findClassLineIndex(lines);
  const controllerName = extractPrimaryClassName(normalizedText) || 'UnknownController';
  const basePath = extractControllerBasePath(lines, controllerCandidate);
  const preClassText = classLineIndex >= 0 ? lines.slice(0, classLineIndex).join('\n') : normalizedText;
  const controllerGuardMarkers = detectGuardMarkers(preClassText);
  const controllerCustomGuardNames = detectCustomGuardNames(preClassText);
  const controllerPublicMarkers = detectPublicMarkers(preClassText);
  const routes = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(ROUTE_DECORATOR_LINE);
    if (!match) {
      continue;
    }

    const handlerInfo = findHandlerInfo(lines, index);
    const blockStart = findDecoratorBlockStart(lines, index, classLineIndex);
    const methodBlockEnd = findMethodBlockEnd(lines, handlerInfo.line_index);
    const decoratorBlock = lines.slice(blockStart, handlerInfo.line_index + 1).join('\n');
    const methodBlock = lines.slice(handlerInfo.line_index, methodBlockEnd).join('\n');

    const routeGuardMarkers = detectGuardMarkers(decoratorBlock);
    const routeCustomGuardNames = detectCustomGuardNames(decoratorBlock);
    const routePublicMarkers = detectPublicMarkers(decoratorBlock);
    const allGuardMarkers = Array.from(new Set([...controllerGuardMarkers, ...routeGuardMarkers]))
      .sort((left, right) => left.localeCompare(right));
    const allCustomGuardNames = Array.from(new Set([...controllerCustomGuardNames, ...routeCustomGuardNames]))
      .sort((left, right) => left.localeCompare(right));
    const allPublicMarkers = Array.from(new Set([...controllerPublicMarkers, ...routePublicMarkers]))
      .sort((left, right) => left.localeCompare(right));

    routes.push({
      relative_path: relativePath,
      controller_name: controllerName,
      method: ROUTE_METHODS[match.groups.decorator],
      route_path: combineRoutePath(basePath, parseDecoratorLiteral(match.groups.args)),
      line: index + 1,
      guard_marker: allGuardMarkers.length > 0,
      public_marker: allPublicMarkers.length > 0,
      webhook_signature_marker: detectWebhookSignatureMarker(methodBlock),
      guard_markers: allGuardMarkers,
      custom_guard_names: allCustomGuardNames,
      public_markers: allPublicMarkers
    });
  }

  routes.sort((left, right) => {
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    if (left.method !== right.method) {
      return left.method.localeCompare(right.method);
    }
    return left.route_path.localeCompare(right.route_path);
  });

  return {
    relative_path: relativePath,
    controller_name: controllerName,
    base_path: basePath,
    routes
  };
}

async function parseControllerFiles(repoPath, files) {
  const controllers = [];

  for (const file of files) {
    const content = await fs.readFile(file.absolute_path, 'utf8');
    const parsed = parseControllerText(file.relative_path, content);
    if (parsed) {
      controllers.push(parsed);
    }
  }

  controllers.sort((left, right) => left.relative_path.localeCompare(right.relative_path));

  return {
    repoPath: String(repoPath || ''),
    controllers
  };
}

module.exports = {
  ROUTE_METHODS,
  combineRoutePath,
  hasControllerDecorator,
  parseControllerFiles,
  parseControllerText,
  parseDecoratorLiteral
};
