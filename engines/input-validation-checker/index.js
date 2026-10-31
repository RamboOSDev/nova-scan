'use strict';

const { analyzeValidationSurface } = require('./risk-classifier');
const { buildListRulesPayload, buildScanPayload } = require('./reporter');
const { discoverTypeScriptFiles } = require('./ts-discovery');
const { parseDtoFiles } = require('./dto-parser');
const { parseControllerFiles } = require('./route-input-parser');
const { analyzeRepositoryValidationMarkers } = require('./validation-marker-detector');

const ENGINE = 'input-validation-checker';
const ENGINE_VERSION = '0.1.0';

async function listRules() {
  return buildListRulesPayload({
    engine: ENGINE,
    engineVersion: ENGINE_VERSION
  });
}

async function scan(options = {}) {
  const discovery = await discoverTypeScriptFiles(options.repoPath);
  const parsedControllers = await parseControllerFiles(discovery.repoPath, discovery.files);
  const dtoAnalysis = await parseDtoFiles(discovery.repoPath, discovery.files);
  const markerAnalysis = await analyzeRepositoryValidationMarkers(discovery.files);
  const analysis = analyzeValidationSurface(discovery, parsedControllers, dtoAnalysis, markerAnalysis);

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
