import { readFileSync } from 'fs';
import { glob } from 'fast-glob';

export interface Finding {
  file: string;
  line: number;
  snippet: string;
  severity: 'high' | 'medium' | 'low' | 'info';
  message?: string;
  detector?: string;
}

export async function detectHardcodedSecrets(root: string): Promise<Finding[]> {
  const files = await glob('**/*.{ts,tsx,js,jsx}', {
    cwd: root,
    ignore: ['node_modules/**', '.next/**', 'dist/**', 'build/**']
  });

  const findings: Finding[] = [];
  const anonJwtRegex = /eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.*?role":"anon".*?/;

  for (const file of files) {
    const content = readFileSync(`${root}/${file}`, 'utf8');
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;  // protection against undefined

      const secretPatterns = [
        /sk[-_][a-zA-Z0-9]{20,}/,
        /ghp_[a-zA-Z0-9]{36,}/,
        /AKIA[0-9A-Z]{16}/,
        /-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
        /mongodb\+srv:\/\/[^:]+:[^@]+@/,
        /postgresql:\/\/[^:]+:[^@]+@/
      ];

      if (anonJwtRegex.test(line)) continue;

      let matched = false;
      for (const pattern of secretPatterns) {
        if (pattern.test(line)) {
          matched = true;
          break;
        }
      }

      if (matched) {
        findings.push({
          file,
          line: i + 1,
          snippet: line.trim().slice(0, 200),
          severity: 'high'
        });
      }
    }
  }

  return findings;
}