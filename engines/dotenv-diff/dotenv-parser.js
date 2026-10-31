'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

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

function parseDotenvContent(content, options = {}) {
  const keyCounts = new Map();
  const uniqueKeys = new Set();
  const emptyKeys = new Set();
  let malformedLinesCount = 0;
  const lines = String(content).split(/\r?\n/);

  for (const originalLine of lines) {
    const trimmedLine = originalLine.trim();
    if (trimmedLine === '' || trimmedLine.startsWith('#')) {
      continue;
    }

    let line = originalLine.trimStart();
    if (line.startsWith('export ')) {
      line = line.slice('export '.length);
    }

    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) {
      malformedLinesCount += 1;
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    const rawValue = line.slice(equalsIndex + 1);

    if (key === '') {
      malformedLinesCount += 1;
      continue;
    }

    if (!KEY_PATTERN.test(key)) {
      malformedLinesCount += 1;
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
  const keys = Array.from(uniqueKeys).sort();
  const emptyValueKeys = Array.from(emptyKeys).sort();

  return {
    path: options.path || null,
    keys,
    keys_count: keys.length,
    duplicate_keys: duplicateKeys,
    empty_value_keys: emptyValueKeys,
    malformed_lines_count: malformedLinesCount
  };
}

async function parseDotenvFile(filePath, options = {}) {
  const resolvedPath = path.resolve(filePath);
  const displayPath = normalizeDisplayPath(filePath, options);
  const stat = await fs.stat(resolvedPath).catch((err) => {
    if (err && err.code === 'ENOENT') {
      throw new Error(`file does not exist: ${displayPath}`);
    }

    throw err;
  });

  if (!stat.isFile()) {
    throw new Error(`path must be a file: ${displayPath}`);
  }

  const content = await fs.readFile(resolvedPath, 'utf8');
  return parseDotenvContent(content, { path: displayPath });
}

module.exports = {
  KEY_PATTERN,
  isEmptyValue,
  normalizeDisplayPath,
  parseDotenvContent,
  parseDotenvFile,
  toNormalizedPath
};
