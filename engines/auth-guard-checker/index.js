'use strict';

const { parseControllerFiles } = require('./controller-parser');
const { analyzeRoutes, RULES } = require('./risk-classifier');
const { buildListRulesPayload, buildScanPayload } = require('./reporter');
const { discoverTypeScriptFiles } = require('./ts-discovery');

const ENGINE = 'auth-guard-checker';
const ENGINE_VERSION = '0.1.0';

async function listRules() {
  return buildListRulesPayload({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    rules: RULES
  });
}

async function scan(options = {}) {
  const discovery = await discoverTypeScriptFiles(options.repoPath);
  const parsedControllers = await parseControllerFiles(discovery.repoPath, discovery.files);
  const analysis = analyzeRoutes(discovery, parsedControllers);

  return buildScanPayload({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION,
    repoPath: discovery.repoPath,
    analysis
  });
}

module.exports = {
  ENGINE,
  ENGINE_VERSION,
  listRules,
  scan
};
