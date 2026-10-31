const fs = require('node:fs');
const path = require('node:path');

const SIGNAL_DEFINITIONS = {
  dangerous_eval: { severity: 'high', description: 'eval() or new Function() detected' },
  react_dangerous_html: { severity: 'medium', description: 'dangerouslySetInnerHTML usage' },
  browser_token_storage_signal: { severity: 'medium', description: 'localStorage/sessionStorage with token-like keywords' },
  process_env_direct_usage: { severity: 'low', description: 'process.env usage outside config files' },
  console_statement: { severity: 'info', description: 'console.log/warn/error/debug' },
  todo_security_marker: { severity: 'info', description: 'TODO/FIXME/HACK/SECURITY/XXX comment' },
  ts_ignore_or_nocheck: { severity: 'low', description: '@ts-ignore or @ts-nocheck' },
  hardcoded_url_signal: { severity: 'info', description: 'http:// or https:// string literal' },
  broad_any_signal: { severity: 'info', description: 'any type usage' }
};

const IGNORED_DIRS = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'generated',
  '__generated__',
  '.output',
  '.nuxt',
  '.vercel',
  '.turbo'
];

const IGNORED_EXTENSIONS = [
  '.min.js',
  '.min.ts',
  '.map',
  '.lock',
  '.lockb'
];

const CONFIG_PATH_SEGMENTS = [
  'env',
  'config',
  'settings',
  'constants'
];

const TOKEN_KEYWORDS = [
  'token',
  'jwt',
  'auth',
  'access',
  'refresh'
];

const TODO_MARKERS = [
  'TODO',
  'FIXME',
  'HACK',
  'SECURITY',
  'XXX'
];

const SCANNABLE_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'];

function shouldIgnoreFile(filePath) {
  const lowerPath = filePath.toLowerCase();
  
  // Check ignored directories
  const parts = filePath.split(/[\\/]/);
  for (const part of parts) {
    if (IGNORED_DIRS.includes(part.toLowerCase())) {
      return true;
    }
  }
  
  // Check ignored extensions
  for (const ext of IGNORED_EXTENSIONS) {
    if (lowerPath.endsWith(ext)) {
      return true;
    }
  }
  
  // Check if it's a scannable TypeScript file
  const isScannable = SCANNABLE_EXTENSIONS.some(ext => lowerPath.endsWith(ext));
  if (!isScannable) {
    return true;
  }
  
  return false;
}

function isConfigFile(filePath) {
  const lowerPath = filePath.toLowerCase();
  return CONFIG_PATH_SEGMENTS.some(segment => 
    lowerPath.includes(`/${segment}/`) || 
    lowerPath.includes(`\\${segment}\\`) ||
    lowerPath.includes(`/${segment}.`) ||
    lowerPath.includes(`\\${segment}.`)
  );
}

function getRelativePath(absolutePath, repoPath) {
  const normalizedRepo = repoPath.replace(/\\/g, '/');
  const normalizedFile = absolutePath.replace(/\\/g, '/');
  
  if (normalizedFile.startsWith(normalizedRepo)) {
    const relative = normalizedFile.slice(normalizedRepo.length).replace(/^\/+/, '');
    return relative;
  }
  
  // Fallback: return just the basename for safety
  return path.basename(absolutePath);
}

async function* walkDirectory(dirPath) {
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
  
  // Sort for determinism
  entries.sort((a, b) => a.name.localeCompare(b.name));
  
  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.includes(entry.name.toLowerCase())) {
        yield* walkDirectory(fullPath);
      }
    } else if (entry.isFile()) {
      if (!shouldIgnoreFile(fullPath)) {
        yield fullPath;
      }
    }
  }
}

function detectSignals(content, filePath, isTSX) {
  const findings = [];
  const lines = content.split('\n');
  const isConfig = isConfigFile(filePath);
  
  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    const lineIndex = lineNum + 1;
    
    // 1. dangerous_eval
    if (/\beval\s*\(/.test(line) && !line.includes('//') && !line.trim().startsWith('*')) {
      findings.push({
        signal_id: 'dangerous_eval',
        severity: 'high',
        line: lineIndex,
        evidence: 'eval(...) call detected',
        message: 'eval() usage detected'
      });
    }
    if (/new\s+Function\s*\(/.test(line)) {
      findings.push({
        signal_id: 'dangerous_eval',
        severity: 'high',
        line: lineIndex,
        evidence: 'new Function(...) detected',
        message: 'new Function() constructor detected'
      });
    }
    
    // 2. react_dangerous_html
    if (isTSX && /dangerouslySetInnerHTML\s*=/.test(line)) {
      findings.push({
        signal_id: 'react_dangerous_html',
        severity: 'medium',
        line: lineIndex,
        evidence: 'dangerouslySetInnerHTML prop detected',
        message: 'dangerouslySetInnerHTML usage in TSX'
      });
    }
    
    // 3. browser_token_storage_signal
    const storageMatch = line.match(/\b(localStorage|sessionStorage)\b/);
    if (storageMatch) {
      const surroundingText = line.toLowerCase();
      const hasTokenKeyword = TOKEN_KEYWORDS.some(kw => surroundingText.includes(kw.toLowerCase()));
      if (hasTokenKeyword) {
        findings.push({
          signal_id: 'browser_token_storage_signal',
          severity: 'medium',
          line: lineIndex,
          evidence: `${storageMatch[1]} with token-like keyword`,
          message: 'Browser storage API with token-related context'
        });
      }
    }
    
    // 4. process_env_direct_usage
    if (!isConfig && /process\.env\.?/.test(line)) {
      findings.push({
        signal_id: 'process_env_direct_usage',
        severity: 'low',
        line: lineIndex,
        evidence: 'process.env access detected',
        message: 'process.env usage outside config file'
      });
    }
    
    // 5. console_statement
    const consoleMatch = line.match(/\bconsole\.(log|warn|error|debug|info|trace)\s*\(/);
    if (consoleMatch) {
      findings.push({
        signal_id: 'console_statement',
        severity: 'info',
        line: lineIndex,
        evidence: `console.${consoleMatch[1]}(...) detected`,
        message: 'Console statement in source'
      });
    }
    
    // 6. todo_security_marker
    const upperLine = line.toUpperCase();
    for (const marker of TODO_MARKERS) {
      const markerPattern = new RegExp(`\\b${marker}\\b|:${marker}|${marker}:`, 'i');
      if (markerPattern.test(line)) {
        findings.push({
          signal_id: 'todo_security_marker',
          severity: 'info',
          line: lineIndex,
          evidence: `${marker} comment marker detected`,
          message: 'Development marker comment found'
        });
        break; // Only report once per line
      }
    }
    
    // 7. ts_ignore_or_nocheck
    if (/@ts-ignore/.test(line)) {
      findings.push({
        signal_id: 'ts_ignore_or_nocheck',
        severity: 'low',
        line: lineIndex,
        evidence: '@ts-ignore directive detected',
        message: 'TypeScript strictness override used'
      });
    }
    if (/@ts-nocheck/.test(line)) {
      findings.push({
        signal_id: 'ts_ignore_or_nocheck',
        severity: 'low',
        line: lineIndex,
        evidence: '@ts-nocheck directive detected',
        message: 'TypeScript file-level check disabled'
      });
    }
    
    // 8. hardcoded_url_signal
    const urlMatch = line.match(/['"`][^'"`]*https?:\/\/[^'"`]*['"`]/);
    if (urlMatch) {
      // Skip if it looks like a test file
      const isTestFile = /\.(test|spec)\.(ts|tsx)$/.test(filePath) || 
                         filePath.includes('/test/') || 
                         filePath.includes('\\test\\');
      if (!isTestFile && !isConfig) {
        findings.push({
          signal_id: 'hardcoded_url_signal',
          severity: 'info',
          line: lineIndex,
          evidence: 'URL string literal detected',
          message: 'Hardcoded URL in source'
        });
      }
    }
    
    // 9. broad_any_signal
    if (/:\s*any\b/.test(line) || /\bas\s+any\b/.test(line) || /<any>/.test(line)) {
      findings.push({
        signal_id: 'broad_any_signal',
        severity: 'info',
        line: lineIndex,
        evidence: 'any type annotation detected',
        message: 'Broad any type usage'
      });
    }
  }
  
  return findings;
}

async function scanRepo(repoPath) {
  const absoluteRepoPath = path.resolve(repoPath);
  
  if (!fs.existsSync(absoluteRepoPath)) {
    throw new Error(`Repository path does not exist: ${repoPath}`);
  }
  
  const findings = [];
  let tsFileCount = 0;
  let tsxFileCount = 0;
  let filesScanned = 0;
  
  try {
    for await (const filePath of walkDirectory(absoluteRepoPath)) {
      const isTSX = filePath.toLowerCase().endsWith('.tsx');
      
      if (isTSX) {
        tsxFileCount++;
      } else {
        tsFileCount++;
      }
      filesScanned++;
      
      try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const fileFindings = detectSignals(content, filePath, isTSX);
        const relativePath = getRelativePath(filePath, absoluteRepoPath);
        
        for (const finding of fileFindings) {
          findings.push({
            ...finding,
            relative_path: relativePath
          });
        }
      } catch (err) {
        // Skip unreadable files (binary, permissions, etc.)
        // Continue scanning other files
      }
    }
  } catch (err) {
    // Directory might not be readable
  }
  
  // Sort findings for determinism: by path, then line, then signal_id
  findings.sort((a, b) => {
    if (a.relative_path !== b.relative_path) {
      return a.relative_path.localeCompare(b.relative_path);
    }
    if (a.line !== b.line) {
      return a.line - b.line;
    }
    return a.signal_id.localeCompare(b.signal_id);
  });
  
  // Calculate signal counts
  const signalCounts = {};
  for (const signalId of Object.keys(SIGNAL_DEFINITIONS)) {
    signalCounts[signalId] = 0;
  }
  
  for (const finding of findings) {
    signalCounts[finding.signal_id] = (signalCounts[finding.signal_id] || 0) + 1;
  }
  
  // Calculate severity breakdown
  const severityBreakdown = { high: 0, medium: 0, low: 0, info: 0 };
  for (const finding of findings) {
    severityBreakdown[finding.severity]++;
  }
  
  return {
    engine: 'typescript-code-safety-scanner',
    engine_version: '0.1.0',
    repo: {
      scanned_path: '<relative>',
      ts_file_count: tsFileCount,
      tsx_file_count: tsxFileCount,
      files_scanned: filesScanned
    },
    summary: {
      finding_count: findings.length,
      severity_breakdown: severityBreakdown,
      signal_counts: signalCounts
    },
    findings,
    limitations: [
      'Static pattern matching only; does not analyze runtime behavior.',
      'Does not prove security impact or risk severity.',
      'Findings are signals for review, not confirmed issues.',
      'Pattern detection may produce false positives.',
      'Does not analyze imported dependencies.',
      'Does not track data flow or call chains.'
    ]
  };
}

function listSignals() {
  return Object.entries(SIGNAL_DEFINITIONS).map(([id, def]) => ({
    signal_id: id,
    severity: def.severity,
    description: def.description
  }));
}

module.exports = {
  scanRepo,
  listSignals,
  SIGNAL_DEFINITIONS
};
