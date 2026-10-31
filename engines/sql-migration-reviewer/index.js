'use strict';

// SQL Migration Reviewer V0.1 - engine entrypoint.
// نقطة الدخول للمحرك: list-signals + scan فقط.

const fs = require('fs/promises');
const path = require('path');

const { buildListSignalsPayload, buildScanReport } = require('./reporter');
const { reviewRepo } = require('./reviewer');

const ENGINE = 'sql-migration-reviewer';
const ENGINE_VERSION = '0.1.0';

function toNormalizedPath(filePath) {
  return typeof filePath === 'string' ? filePath.replace(/\\/g, '/') : filePath;
}

function stripCurrentDirPrefix(value) {
  return typeof value === 'string' && value.startsWith('./') ? value.slice(2) : value;
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

async function listSignals() {
  return buildListSignalsPayload({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION
  });
}

async function scan(options = {}) {
  const repoRoot = await ensureDirectory(options.repoPath);
  const review = await reviewRepo(repoRoot);
  const repoDisplay = normalizeDisplayPath(repoRoot, {
    cwd: options.cwd,
    displayPath: options.repoDisplayPath
  });
  return buildScanReport({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    repo: repoDisplay,
    fileReports: review.files
  });
}

module.exports = {
  ENGINE,
  ENGINE_VERSION,
  listSignals,
  scan
};
