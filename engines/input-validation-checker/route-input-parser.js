'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const { detectImportedDtoIdentifiers } = require('./dto-parser');
const {
  detectFileValidationMarkers,
  detectHandlerPipeMarkers,
  detectUploadInterceptorMarkers
} = require('./validation-marker-detector');

const CONTROLLER_DECORATOR_PATTERN = /@\s*Controller\b/;
const CONTROLLER_DECORATOR_LINE = /^\s*@Controller\s*\((.*?)\)\s*$/;
const ROUTE_DECORATOR_LINE = /^\s*@(?<decorator>Get|Post|Put|Patch|Delete)\s*\((?<args>.*)\)\s*$/;
const CLASS_DECLARATION = /\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/;
const HANDLER_DECLARATION = /^\s*(?:(?:public|private|protected|static|async)\s+)*([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/;
const INPUT_DECORATOR_PATTERN = /@(?<decorator>Body|Query|Param|Headers|UploadedFile|UploadedFiles)\s*\((?<args>[\s\S]*?)\)/;

const ROUTE_METHODS = Object.freeze({
  Get: 'GET',
  Post: 'POST',
  Put: 'PUT',
  Patch: 'PATCH',
  Delete: 'DELETE'
});

const BROAD_BODY_TYPE_PATTERNS = Object.freeze([
  /^any$/i,
  /^unknown$/i,
  /^object$/i,
  /^object$/i,
  /^record<string,\s*any>$/i,
  /^record<string,\s*unknown>$/i
]);

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

function splitTopLevel(source, separator) {
  const text = String(source || '');
  const segments = [];
  let current = '';
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let inString = null;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      current += char;
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      inString = char;
      current += char;
      continue;
    }

    switch (char) {
      case '(':
        parenDepth += 1;
        break;
      case ')':
        parenDepth = Math.max(0, parenDepth - 1);
        break;
      case '[':
        bracketDepth += 1;
        break;
      case ']':
        bracketDepth = Math.max(0, bracketDepth - 1);
        break;
      case '{':
        braceDepth += 1;
        break;
      case '}':
        braceDepth = Math.max(0, braceDepth - 1);
        break;
      case '<':
        angleDepth += 1;
        break;
      case '>':
        angleDepth = Math.max(0, angleDepth - 1);
        break;
      default:
        break;
    }

    if (
      char === separator
      && parenDepth === 0
      && bracketDepth === 0
      && braceDepth === 0
      && angleDepth === 0
    ) {
      if (current.trim() !== '') {
        segments.push(current.trim());
      }
      current = '';
      continue;
    }

    current += char;
  }

  if (current.trim() !== '') {
    segments.push(current.trim());
  }

  return segments;
}

function extractMethodSignature(lines, handlerLineIndex) {
  const text = lines.slice(handlerLineIndex).join('\n');
  const openParenIndex = text.indexOf('(');
  if (openParenIndex === -1) {
    return '';
  }

  let depth = 0;
  let inString = null;
  let escaped = false;

  for (let index = openParenIndex; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      inString = char;
      continue;
    }

    if (char === '(') {
      depth += 1;
      continue;
    }

    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(openParenIndex + 1, index);
      }
    }
  }

  return text.slice(openParenIndex + 1);
}

function findTopLevelCharacter(source, targetCharacter) {
  const text = String(source || '');
  let parenDepth = 0;
  let bracketDepth = 0;
  let braceDepth = 0;
  let angleDepth = 0;
  let inString = null;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === inString) {
        inString = null;
      }
      continue;
    }

    if (char === '\'' || char === '"' || char === '`') {
      inString = char;
      continue;
    }

    switch (char) {
      case '(':
        parenDepth += 1;
        break;
      case ')':
        parenDepth = Math.max(0, parenDepth - 1);
        break;
      case '[':
        bracketDepth += 1;
        break;
      case ']':
        bracketDepth = Math.max(0, bracketDepth - 1);
        break;
      case '{':
        braceDepth += 1;
        break;
      case '}':
        braceDepth = Math.max(0, braceDepth - 1);
        break;
      case '<':
        angleDepth += 1;
        break;
      case '>':
        angleDepth = Math.max(0, angleDepth - 1);
        break;
      default:
        break;
    }

    if (
      char === targetCharacter
      && parenDepth === 0
      && bracketDepth === 0
      && braceDepth === 0
      && angleDepth === 0
    ) {
      return index;
    }
  }

  return -1;
}

function extractTypeText(paramText) {
  const colonIndex = findTopLevelCharacter(paramText, ':');
  if (colonIndex === -1) {
    return '';
  }

  let typeText = paramText.slice(colonIndex + 1).trim();
  const equalsIndex = findTopLevelCharacter(typeText, '=');
  if (equalsIndex !== -1) {
    typeText = typeText.slice(0, equalsIndex).trim();
  }

  return typeText;
}

function extractVariableName(paramText) {
  const source = String(paramText || '');
  const colonIndex = findTopLevelCharacter(source, ':');
  const equalsIndex = findTopLevelCharacter(source, '=');
  const endIndex = colonIndex !== -1 ? colonIndex : (equalsIndex !== -1 ? equalsIndex : source.length);
  const prefix = source.slice(0, endIndex).trim();
  const match = prefix.match(/([A-Za-z_$][A-Za-z0-9_$]*)\s*$/);
  return match ? match[1] : 'unknown';
}

function normalizeTypeText(typeText) {
  return String(typeText || '').replace(/\s+/g, '').trim();
}

function isBroadBodyType(typeText) {
  const normalized = normalizeTypeText(typeText);
  if (normalized === '') {
    return true;
  }

  return BROAD_BODY_TYPE_PATTERNS.some((pattern) => pattern.test(normalized));
}

function mapInputDecoratorToKind(decoratorName) {
  switch (decoratorName) {
    case 'Body':
      return 'body';
    case 'Query':
      return 'query';
    case 'Param':
      return 'param';
    case 'Headers':
      return 'headers';
    case 'UploadedFile':
    case 'UploadedFiles':
      return 'file';
    default:
      return 'unknown';
  }
}

function parseInputParameter(paramText) {
  const match = String(paramText || '').match(INPUT_DECORATOR_PATTERN);
  if (!match) {
    return null;
  }

  const decoratorName = match.groups.decorator;
  const typeText = extractTypeText(paramText);

  return {
    input_kind: mapInputDecoratorToKind(decoratorName),
    decorator_name: decoratorName,
    variable_name: extractVariableName(paramText),
    type_text: typeText,
    broad_type: decoratorName === 'Body' ? isBroadBodyType(typeText) : false,
    pipe_markers: detectHandlerPipeMarkers(paramText)
  };
}

function parseInputParameters(signatureText) {
  const parameters = splitTopLevel(signatureText, ',');
  const parsed = [];

  for (const parameter of parameters) {
    const entry = parseInputParameter(parameter);
    if (entry) {
      parsed.push(entry);
    }
  }

  return parsed;
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
  const importedDtoIdentifiers = detectImportedDtoIdentifiers(normalizedText);
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
    const signatureText = extractMethodSignature(lines, handlerInfo.line_index);
    const inputParameters = parseInputParameters(signatureText);
    const uploadInterceptorMarkers = detectUploadInterceptorMarkers(decoratorBlock);
    const decoratorPipeMarkers = detectHandlerPipeMarkers(decoratorBlock);
    const handlerPipeMarkers = Array.from(new Set([
      ...decoratorPipeMarkers,
      ...inputParameters.flatMap((parameter) => parameter.pipe_markers)
    ])).sort((left, right) => left.localeCompare(right));
    const fileValidationMarkers = detectFileValidationMarkers(`${decoratorBlock}\n${methodBlock}`);

    routes.push({
      relative_path: relativePath,
      controller_name: controllerName,
      method: ROUTE_METHODS[match.groups.decorator],
      route_path: combineRoutePath(basePath, parseDecoratorLiteral(match.groups.args)),
      line: index + 1,
      handler_name: handlerInfo.handler_name,
      input_parameters: inputParameters,
      input_kinds: Array.from(new Set(inputParameters.map((parameter) => parameter.input_kind))).sort(),
      imported_dto_identifiers: importedDtoIdentifiers.slice(),
      decorator_pipe_markers: decoratorPipeMarkers,
      handler_pipe_markers: handlerPipeMarkers,
      upload_interceptor_markers: uploadInterceptorMarkers,
      file_validation_markers: fileValidationMarkers
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
    imported_dto_identifiers: importedDtoIdentifiers,
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
  extractMethodSignature,
  extractTypeText,
  findTopLevelCharacter,
  hasControllerDecorator,
  isBroadBodyType,
  parseControllerFiles,
  parseControllerText,
  parseDecoratorLiteral,
  parseInputParameter,
  parseInputParameters,
  splitTopLevel
};
