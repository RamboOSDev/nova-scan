const { scanRepo, listSignals, SIGNAL_DEFINITIONS } = require('./scanner');

const ENGINE_NAME = 'typescript-code-safety-scanner';
const ENGINE_VERSION = '0.1.0';

module.exports = {
  ENGINE_NAME,
  ENGINE_VERSION,
  scanRepo,
  listSignals,
  SIGNAL_DEFINITIONS
};
