'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');

const EXCLUDED_DIRECTORIES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.turbo',
  '.repovaccine',
  'generated'
]);

function toNormalizedPath(filePath) {
  return String(filePath).replace(/\\/g, '/');
}

async function ensureDirectory(repoPath) {
  if (!repoPath) {
    throw new Error('repoPath is required');
  }

  const resolvedRepoPath = path.resolve(repoPath);
  const stat = await fs.stat(resolvedRepoPath).catch((err) => {
    if (err && err.code === 'ENOENT') {
      throw new Error(`repoPath does not exist: ${repoPath}`);
    }

    throw err;
  });

  if (!stat.isDirectory()) {
    throw new Error(`repoPath must be a directory: ${repoPath}`);
  }

  return resolvedRepoPath;
}

function isExcludedDirectoryName(name) {
  const normalized = String(name || '').toLowerCase();
  return (
    EXCLUDED_DIRECTORIES.has(normalized)
    || normalized.endsWith('-generated')
    || normalized.endsWith('_generated')
  );
}

function isTypeScriptFileName(name) {
  return typeof name === 'string' && (name.endsWith('.ts') || name.endsWith('.tsx'));
}

async function walkTypeScriptFiles(repoRoot, currentDir, files) {
  const entries = await fs.readdir(currentDir, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    if (entry.isSymbolicLink()) {
      continue;
    }

    const absolutePath = path.join(currentDir, entry.name);

    if (entry.isDirectory()) {
      if (isExcludedDirectoryName(entry.name)) {
        continue;
      }

      await walkTypeScriptFiles(repoRoot, absolutePath, files);
      continue;
    }

    if (!entry.isFile() || !isTypeScriptFileName(entry.name)) {
      continue;
    }

    files.push({
      absolute_path: absolutePath,
      relative_path: toNormalizedPath(path.relative(repoRoot, absolutePath))
    });
  }
}

async function discoverTypeScriptFiles(repoPath) {
  const resolvedRepoPath = await ensureDirectory(repoPath);
  const files = [];

  await walkTypeScriptFiles(resolvedRepoPath, resolvedRepoPath, files);
  files.sort((left, right) => left.relative_path.localeCompare(right.relative_path));

  return {
    repoPath: toNormalizedPath(resolvedRepoPath),
    files
  };
}

module.exports = {
  EXCLUDED_DIRECTORIES,
  discoverTypeScriptFiles,
  ensureDirectory,
  isExcludedDirectoryName,
  isTypeScriptFileName,
  toNormalizedPath
};
