'use strict';

const { listSupportedChecks } = require('./comparator');
const { parseEnvFile } = require('./parser');
const { scanRepo } = require('./scanner');

const ENGINE = 'env-doctor';
const ENGINE_VERSION = '0.1.0';

async function listChecks() {
  return {
    engine: ENGINE,
    engine_version: ENGINE_VERSION,
    supported_checks: listSupportedChecks()
  };
}

async function parseFile(options = {}) {
  const filePath = options.filePath;
  if (!filePath) {
    throw new Error('filePath is required');
  }

  const parsedResult = await parseEnvFile(filePath, {
    cwd: options.cwd,
    displayPath: options.displayPath
  });

  return {
    engine: ENGINE,
    engine_version: ENGINE_VERSION,
    file: parsedResult.file,
    parsed: parsedResult.parsed
  };
}

async function scan(options = {}) {
  const result = await scanRepo(options.repoPath, {
    cwd: options.cwd,
    repoDisplayPath: options.repoDisplayPath,
    envFile: options.envFile,
    exampleFile: options.exampleFile
  });

  return {
    engine: ENGINE,
    engine_version: ENGINE_VERSION,
    ...result
  };
}

module.exports = {
  ENGINE,
  ENGINE_VERSION,
  listChecks,
  parseFile,
  scan
};
