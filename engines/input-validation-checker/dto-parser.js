'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const {
  detectClassTransformerMarkers,
  detectClassValidatorMarkers
} = require('./validation-marker-detector');

const CLASS_DECLARATION = /\bclass\s+([A-Za-z_$][A-Za-z0-9_$]*)\b/;

function fileSuggestsDto(relativePath) {
  const normalized = String(relativePath || '').toLowerCase();
  return (
    normalized.includes('/dto/')
    || normalized.endsWith('.dto.ts')
    || normalized.endsWith('.dto.tsx')
  );
}

function isDtoLikeClassName(className) {
  return /(Dto|DTO)$/.test(String(className || ''));
}

function splitImportSpecifiers(specifierText) {
  return specifierText
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseImportedLocalName(specifier) {
  const normalized = String(specifier || '')
    .replace(/\s+/g, ' ')
    .replace(/^type\s+/, '')
    .trim();
  const aliasMatch = normalized.match(/^(.*?)\s+as\s+([A-Za-z_$][A-Za-z0-9_$]*)$/);
  if (aliasMatch) {
    return aliasMatch[2];
  }

  const nameMatch = normalized.match(/^([A-Za-z_$][A-Za-z0-9_$]*)$/);
  return nameMatch ? nameMatch[1] : null;
}

function importPathSuggestsDto(importPath) {
  return /(?:^|\/)dto(?:\/|$)|\.dto(?:$|\.)/i.test(String(importPath || '').replace(/\\/g, '/'));
}

function detectImportedDtoIdentifiers(text) {
  const identifiers = new Set();
  const source = String(text || '');
  const namedImportPattern = /import\s+(?:type\s+)?\{([\s\S]*?)\}\s*from\s*['"]([^'"]+)['"]/g;
  const defaultImportPattern = /import\s+(?:type\s+)?([A-Za-z_$][A-Za-z0-9_$]*)\s+from\s*['"]([^'"]+)['"]/g;

  let match = namedImportPattern.exec(source);
  while (match) {
    const importPath = match[2];
    for (const specifier of splitImportSpecifiers(match[1])) {
      const localName = parseImportedLocalName(specifier);
      if (!localName) {
        continue;
      }

      if (importPathSuggestsDto(importPath) || isDtoLikeClassName(localName)) {
        identifiers.add(localName);
      }
    }

    match = namedImportPattern.exec(source);
  }

  match = defaultImportPattern.exec(source);
  while (match) {
    const localName = match[1];
    const importPath = match[2];

    if (importPathSuggestsDto(importPath) || isDtoLikeClassName(localName)) {
      identifiers.add(localName);
    }

    match = defaultImportPattern.exec(source);
  }

  return Array.from(identifiers).sort((left, right) => left.localeCompare(right));
}

function findClassBlock(text, startIndex) {
  const source = String(text || '');
  const openBraceIndex = source.indexOf('{', startIndex);
  if (openBraceIndex === -1) {
    return '';
  }

  let depth = 0;
  let inString = null;
  let escaped = false;

  for (let index = openBraceIndex; index < source.length; index += 1) {
    const char = source[index];

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

    if (char === '{') {
      depth += 1;
      continue;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBraceIndex, index + 1);
      }
    }
  }

  return source.slice(openBraceIndex);
}

function detectDtoEntries(relativePath, text) {
  const normalizedText = String(text || '');
  const lines = normalizedText.split(/\r?\n/);
  const entries = [];

  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(CLASS_DECLARATION);
    if (!match) {
      continue;
    }

    const className = match[1];
    if (!fileSuggestsDto(relativePath) && !isDtoLikeClassName(className)) {
      continue;
    }

    const lineStartIndex = lines.slice(0, index).join('\n').length + (index > 0 ? 1 : 0);
    const classBlock = findClassBlock(normalizedText, lineStartIndex);

    entries.push({
      relative_path: relativePath,
      class_name: className,
      line: index + 1,
      validator_markers: detectClassValidatorMarkers(classBlock),
      transformer_markers: detectClassTransformerMarkers(classBlock)
    });
  }

  entries.sort((left, right) => {
    if (left.relative_path !== right.relative_path) {
      return left.relative_path.localeCompare(right.relative_path);
    }
    if (left.line !== right.line) {
      return left.line - right.line;
    }
    return left.class_name.localeCompare(right.class_name);
  });

  return entries;
}

async function parseDtoFiles(repoPath, files) {
  const entries = [];
  const importedDtoIdentifiersByFile = {};

  for (const file of files) {
    const content = await fs.readFile(file.absolute_path, 'utf8');
    importedDtoIdentifiersByFile[file.relative_path] = detectImportedDtoIdentifiers(content);
    entries.push(...detectDtoEntries(file.relative_path, content));
  }

  const dtoClassNames = new Set(entries.map((entry) => entry.class_name));
  const dtoFiles = Array.from(new Set(entries.map((entry) => entry.relative_path))).sort((left, right) =>
    left.localeCompare(right)
  );

  return {
    repoPath: String(repoPath || '').replace(/\\/g, '/'),
    dto_files: dtoFiles,
    dto_entries: entries,
    dto_class_names: dtoClassNames,
    imported_dto_identifiers_by_file: importedDtoIdentifiersByFile
  };
}

module.exports = {
  detectDtoEntries,
  detectImportedDtoIdentifiers,
  fileSuggestsDto,
  isDtoLikeClassName,
  parseDtoFiles
};
