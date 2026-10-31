'use strict';

// SQL Migration Reviewer V0.1 - deterministic SQL migration discovery.
// اكتشاف ملفات هجرات SQL ضمن مجلدات الهجرات المعتادة، مع استبعاد المجلدات الثقيلة.

const fs = require('fs/promises');
const path = require('path');

// Discovery is anchored at well-known migration directory shapes. Files outside
// these shapes are intentionally not scanned to keep V0.1 narrow.
const MIGRATION_DIR_PATTERNS = Object.freeze([
  ['prisma', 'migrations'],
  ['migrations'],
  ['db', 'migrations'],
  ['database', 'migrations']
]);

const EXCLUDED_DIRECTORY_NAMES = Object.freeze([
  'node_modules',
  '.git',
  '.repovaccine',
  'dist',
  'build',
  'coverage',
  '.next',
  '.nuxt',
  '.cache',
  '.turbo',
  'vendor'
]);

const SQL_EXTENSION = '.sql';

function isExcludedDirectory(name) {
  return EXCLUDED_DIRECTORY_NAMES.includes(name);
}

function toNormalizedPath(filePath) {
  return typeof filePath === 'string' ? filePath.replace(/\\/g, '/') : filePath;
}

async function safeStat(target) {
  try {
    return await fs.stat(target);
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EACCES' || err.code === 'EPERM')) {
      return null;
    }
    throw err;
  }
}

async function safeReadDir(directory) {
  try {
    return await fs.readdir(directory, { withFileTypes: true });
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'ENOTDIR' || err.code === 'EACCES' || err.code === 'EPERM')) {
      return [];
    }
    throw err;
  }
}

// Walk the entire repo tree looking for the well-known migration directory shapes.
// We do this by first walking to find all candidate "anchor" directories whose path
// trail ends with one of MIGRATION_DIR_PATTERNS, then collecting *.sql files inside
// each anchor (recursively, with the same exclusion list).
async function discoverMigrationAnchors(repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  const anchors = [];
  const stack = [resolvedRoot];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = await safeReadDir(currentDir);

    const sortedEntries = entries.slice().sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of sortedEntries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (isExcludedDirectory(entry.name)) {
        continue;
      }
      const next = path.join(currentDir, entry.name);
      const matched = await matchesAnchorPattern(next);
      if (matched) {
        anchors.push(next);
      }
      // Continue walking in case a deeper migration directory exists too.
      stack.push(next);
    }
  }

  // Deduplicate (a `db/migrations` could also match the bare `migrations` pattern check).
  const unique = Array.from(new Set(anchors));
  unique.sort((left, right) => left.localeCompare(right));
  return unique;
}

async function matchesAnchorPattern(directoryPath) {
  // Compare the trailing path segments against each pattern.
  for (const pattern of MIGRATION_DIR_PATTERNS) {
    if (pathEndsWithSegments(directoryPath, pattern)) {
      const stat = await safeStat(directoryPath);
      if (stat && stat.isDirectory()) {
        return true;
      }
    }
  }
  return false;
}

function pathEndsWithSegments(absolutePath, segments) {
  const parts = absolutePath.split(path.sep).filter(Boolean);
  if (parts.length < segments.length) {
    return false;
  }
  const tail = parts.slice(parts.length - segments.length);
  for (let index = 0; index < segments.length; index += 1) {
    if (tail[index] !== segments[index]) {
      return false;
    }
  }
  return true;
}

async function listSqlFilesUnder(directoryPath) {
  const matches = [];
  const stack = [directoryPath];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    const entries = await safeReadDir(currentDir);
    const sortedEntries = entries.slice().sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of sortedEntries) {
      if (entry.isDirectory()) {
        if (isExcludedDirectory(entry.name)) {
          continue;
        }
        stack.push(path.join(currentDir, entry.name));
        continue;
      }
      if (entry.isFile() && entry.name.toLowerCase().endsWith(SQL_EXTENSION)) {
        matches.push(path.join(currentDir, entry.name));
      }
    }
  }

  matches.sort((left, right) => left.localeCompare(right));
  return matches;
}

async function discoverSqlMigrationFiles(repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  const anchors = await discoverMigrationAnchors(resolvedRoot);

  const allFiles = new Set();
  for (const anchor of anchors) {
    const files = await listSqlFilesUnder(anchor);
    for (const file of files) {
      allFiles.add(file);
    }
  }

  const sorted = Array.from(allFiles).sort((left, right) => left.localeCompare(right));
  return sorted.map((absolutePath) => {
    const relative = toNormalizedPath(path.relative(resolvedRoot, absolutePath));
    return {
      absolute_path: absolutePath,
      relative_path: relative === '' ? path.basename(absolutePath) : relative
    };
  });
}

module.exports = {
  EXCLUDED_DIRECTORY_NAMES,
  MIGRATION_DIR_PATTERNS,
  discoverMigrationAnchors,
  discoverSqlMigrationFiles,
  isExcludedDirectory,
  listSqlFilesUnder,
  pathEndsWithSegments,
  toNormalizedPath
};
