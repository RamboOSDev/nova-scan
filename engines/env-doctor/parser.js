'use strict';

const fs = require('fs/promises');
const path = require('path');

const KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function toNormalizedPath(value) {
  return String(value).replace(/\\/g, '/');
}

function stripCurrentDirPrefix(value) {
  return value.startsWith('./') ? value.slice(2) : value;
}

function normalizeDisplayPath(targetPath, options = {}) {
  if (typeof options.displayPath === 'string' && options.displayPath.trim() !== '') {
    return stripCurrentDirPrefix(toNormalizedPath(path.normalize(options.displayPath)));
  }

  const resolvedPath = path.resolve(targetPath);
  const cwd = path.resolve(options.cwd || process.cwd());
  const relativePath = path.relative(cwd, resolvedPath);

  if (relativePath === '') {
    return '.';
  }

  if (!relativePath.startsWith('..') && !path.isAbsolute(relativePath)) {
    return stripCurrentDirPrefix(toNormalizedPath(relativePath));
  }

  return toNormalizedPath(resolvedPath);
}

function isEmptyValue(rawValue) {
  const trimmed = rawValue.trim();
  return trimmed === '' || trimmed === '""' || trimmed === "''";
}

function parseEnvContent(content, options = {}) {
  const keyCounts = new Map();
  const emptyKeys = new Set();
  const malformedLines = [];
  const uniqueKeys = new Set();
  const lines = String(content).split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const lineNumber = index + 1;
    const originalLine = lines[index];
    const trimmedLine = originalLine.trim();

    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }

    const equalsIndex = originalLine.indexOf('=');
    if (equalsIndex === -1) {
      malformedLines.push({
        line_number: lineNumber,
        reason: 'missing_equals'
      });
      continue;
    }

    const key = originalLine.slice(0, equalsIndex).trim();
    const rawValue = originalLine.slice(equalsIndex + 1);

    if (key === '') {
      malformedLines.push({
        line_number: lineNumber,
        reason: 'empty_key'
      });
      continue;
    }

    if (!KEY_PATTERN.test(key)) {
      malformedLines.push({
        line_number: lineNumber,
        reason: 'invalid_key'
      });
      continue;
    }

    uniqueKeys.add(key);
    keyCounts.set(key, (keyCounts.get(key) || 0) + 1);

    if (isEmptyValue(rawValue)) {
      emptyKeys.add(key);
    }
  }

  const duplicateKeys = Array.from(keyCounts.entries())
    .filter(([, count]) => count > 1)
    .map(([key]) => key)
    .sort();

  return {
    file: options.file || null,
    parsed: {
      keys: Array.from(uniqueKeys).sort(),
      empty_keys: Array.from(emptyKeys).sort(),
      duplicate_keys: duplicateKeys,
      malformed_lines: malformedLines.sort((left, right) => left.line_number - right.line_number)
    }
  };
}

async function parseEnvFile(filePath, options = {}) {
  const content = await fs.readFile(path.resolve(filePath), 'utf8');
  return parseEnvContent(content, {
    file: normalizeDisplayPath(filePath, options)
  });
}

module.exports = {
  KEY_PATTERN,
  isEmptyValue,
  normalizeDisplayPath,
  parseEnvContent,
  parseEnvFile,
  toNormalizedPath
};
