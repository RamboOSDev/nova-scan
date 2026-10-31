'use strict';

// SQL Migration Reviewer V0.1 - per-file orchestration.
// منسّق المراجعة: يقرأ كل ملف SQL ويحلّله ويستخرج الإشارات.

const fs = require('fs/promises');
const path = require('path');

const { discoverSqlMigrationFiles, toNormalizedPath } = require('./sql-discovery');
const { parseSql } = require('./sql-parser-lite');
const { detectFileSignals } = require('./migration-risk-detector');

async function readSqlSafely(absolutePath) {
  try {
    return await fs.readFile(absolutePath, 'utf8');
  } catch (err) {
    if (err && (err.code === 'ENOENT' || err.code === 'EACCES' || err.code === 'EPERM' || err.code === 'EISDIR')) {
      return null;
    }
    throw err;
  }
}

function safeParse(rawSql) {
  try {
    return parseSql(typeof rawSql === 'string' ? rawSql : '');
  } catch (err) {
    return { statement_count: 0, statements: [] };
  }
}

function buildFileReport(fileEntry, parsed, findings) {
  return {
    relative_path: fileEntry.relative_path,
    statement_count: parsed.statement_count,
    findings
  };
}

async function reviewRepo(repoRoot) {
  const resolvedRoot = path.resolve(repoRoot);
  const files = await discoverSqlMigrationFiles(resolvedRoot);
  const fileReports = [];

  for (const file of files) {
    const raw = await readSqlSafely(file.absolute_path);
    const parsed = safeParse(raw || '');
    let findings = [];
    try {
      findings = detectFileSignals(parsed);
    } catch (err) {
      findings = [];
    }
    fileReports.push(buildFileReport(file, parsed, findings));
  }

  return {
    repo_root: resolvedRoot,
    files: fileReports
  };
}

module.exports = {
  buildFileReport,
  readSqlSafely,
  reviewRepo,
  safeParse,
  toNormalizedPath
};
