'use strict';

const { parseDotenvFile } = require('./dotenv-parser');
const { diffParsedFiles } = require('./diff-engine');
const {
  CHECKS,
  buildComparePayload,
  buildListChecksPayload
} = require('./reporter');

const ENGINE = 'dotenv-diff';
const ENGINE_VERSION = '0.1.0';

async function listChecks() {
  return buildListChecksPayload({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    checks: CHECKS
  });
}

async function compareFiles(options = {}) {
  if (!options.basePath) {
    throw new Error('basePath is required');
  }

  if (!options.targetPath) {
    throw new Error('targetPath is required');
  }

  const base = await parseDotenvFile(options.basePath, {
    cwd: options.cwd,
    displayPath: options.baseDisplayPath
  });
  const target = await parseDotenvFile(options.targetPath, {
    cwd: options.cwd,
    displayPath: options.targetDisplayPath
  });
  const compared = diffParsedFiles(base, target);

  return buildComparePayload({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    compared
  });
}

module.exports = {
  ENGINE,
  ENGINE_VERSION,
  listChecks,
  compareFiles
};
