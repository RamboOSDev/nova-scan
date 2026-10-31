import type { Finding } from './detectors/secrets.js';

const LEVEL: Record<Finding['severity'], string> = { high: 'error', medium: 'warning', low: 'note', info: 'note' };

export function toSarif(findings: Finding[], version: string) {
  const ruleIds = [...new Set(findings.map((f) => f.detector ?? 'nova-scan'))];
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{
      tool: { driver: { name: 'nova-scan', version, informationUri: 'https://github.com/RamboOSDev/nova-scan', rules: ruleIds.map((id) => ({ id, name: id })) } },
      results: findings.map((f) => ({
        ruleId: f.detector ?? 'nova-scan',
        level: LEVEL[f.severity],
        message: { text: f.message ?? f.snippet },
        locations: [{ physicalLocation: { artifactLocation: { uri: f.file.replace(/\\/g, '/') }, region: { startLine: f.line } } }],
      })),
    }],
  };
}
