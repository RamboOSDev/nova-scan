#!/usr/bin/env node

import { program } from 'commander';
import { detectHardcodedSecrets } from './detectors/secrets.js';
import { detectClientEnvLeak } from './detectors/client-env-leak.js';
import { detectSupabaseUnauth } from './detectors/supabase-unauth.js'; // تم إعادة تفعيله
import pc from 'picocolors';
import { toSarif } from './sarif.js';

const VERSION = '0.2.0';

program
  .name('nova-scan')
  .description('Scan AI-generated code for security issues')
  .version(VERSION)
  .argument('[path]', 'path to scan', '.')
  .option('--json', 'output as JSON')
  .option('--sarif', 'output as SARIF 2.1.0 (for GitHub code scanning)')
  .option('--no-fail', 'exit 0 even when findings exist')
  .action(async (path: string, opts: { json?: boolean; sarif?: boolean; fail: boolean }) => {
    console.error(pc.blue(`🔍 Nova scanning: ${path}`));

    const start = Date.now();
    const [secrets, envLeaks, supabase] = await Promise.all([
      detectHardcodedSecrets(path),
      detectClientEnvLeak(path),
      detectSupabaseUnauth(path),   // تم إعادة تفعيله
    ]);
    const allFindings = [...secrets, ...envLeaks, ...supabase];
    const duration = Date.now() - start;

    const exitCode = allFindings.length > 0 && opts.fail ? 1 : 0;

    if (opts.sarif) {
      console.log(JSON.stringify(toSarif(allFindings, VERSION), null, 2));
    } else if (opts.json) {
      console.log(JSON.stringify({ findings: allFindings, duration_ms: duration }, null, 2));
    } else if (allFindings.length === 0) {
      console.log(pc.green(`✅ No issues found in ${duration}ms`));
    } else {
      console.log(pc.red(`⚠️ Found ${allFindings.length} potential issue(s) in ${duration}ms:\n`));
      for (const f of allFindings) {
        const color = f.severity === 'high' ? pc.red : pc.yellow;
        console.log(color(`📄 ${f.file}:${f.line} [${f.severity}]`));
        console.log(`   ${f.snippet}\n`);
      }
    }
    process.exitCode = exitCode;
  });

program.parse();