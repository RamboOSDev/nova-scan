'use strict';

const fs = require('fs/promises');
const path = require('path');

const { compareParsedFiles } = require('./comparator');
const { normalizeDisplayPath, parseEnvFile } = require('./parser');
const { buildSummary } = require('./summary');

function assertSafeRootFileName(fileName, flagName) {
  if (typeof fileName !== 'string' || fileName.trim() === '') {
    throw new Error(`${flagName} is required`);
  }

  if (fileName.includes('/') || fileName.includes('\\') || fileName === '.' || fileName === '..' || fileName.includes('..')) {
    throw new Error(`${flagName} must stay inside the repo root`);
  }
}

async function ensureDirectory(repoPath) {
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

async function ensureFileExists(filePath, description) {
  try {
    await fs.access(filePath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw new Error(`${description} not found: ${path.basename(filePath)}`);
    }
    throw err;
  }
}

async function scanRepo(repoPath, options = {}) {
  if (!repoPath) {
    throw new Error('repoPath is required');
  }

  const envFile = options.envFile || '.env';
  const exampleFile = options.exampleFile || '.env.example';
  assertSafeRootFileName(envFile, 'envFile');
  assertSafeRootFileName(exampleFile, 'exampleFile');

  const repoRoot = await ensureDirectory(repoPath);
  const envAbsolutePath = path.resolve(repoRoot, envFile);
  const exampleAbsolutePath = path.resolve(repoRoot, exampleFile);

  await ensureFileExists(envAbsolutePath, 'env file');
  await ensureFileExists(exampleAbsolutePath, 'example file');

  const envResult = await parseEnvFile(envAbsolutePath, {
    cwd: options.cwd,
    displayPath: envFile
  });
  const exampleResult = await parseEnvFile(exampleAbsolutePath, {
    cwd: options.cwd,
    displayPath: exampleFile
  });

  const findings = compareParsedFiles(envResult.parsed, exampleResult.parsed, {
    envFile,
    exampleFile
  });

  return {
    repo_path: normalizeDisplayPath(repoRoot, {
      cwd: options.cwd,
      displayPath: options.repoDisplayPath
    }),
    files: {
      env_file: envFile,
      example_file: exampleFile
    },
    findings,
    summary: buildSummary({
      envParsed: envResult.parsed,
      exampleParsed: exampleResult.parsed,
      findings,
      filesChecked: 2
    })
  };
}

module.exports = {
  assertSafeRootFileName,
  scanRepo
};
