'use strict';

// SQL Migration Reviewer V0.1 - lightweight, deterministic SQL pre-tokenizer.
// محلل SQL خفيف ومحافظ: يزيل التعليقات وقيم النصوص ثم يقسّم إلى عبارات
// مع الحفاظ على رقم سطر بداية كل عبارة. لا يحاول أن يكون محلل SQL كامل.

// We never try to truly parse SQL. The risk detector only needs:
// - line of statement start
// - normalized text of the statement (no string literals, no comments)
// - rough boundary at `;` (with awareness of dollar-quoted strings)

function stripCommentsAndStrings(rawSql) {
  // Replace strings and comments with whitespace of the same length so the
  // resulting line numbers and overall column offsets remain stable.
  // - Block comments /* ... */
  // - Line comments -- ... \n
  // - Single-quoted strings '...'  (escaped quote = '')
  // - Double-quoted identifiers "..."  (PostgreSQL identifier quoting; we treat as opaque)
  // - Backtick-quoted identifiers `...`  (MySQL/SQLite identifier quoting)
  // - Dollar-quoted strings $tag$ ... $tag$
  if (typeof rawSql !== 'string') {
    return '';
  }

  const out = [];
  const length = rawSql.length;
  let index = 0;

  while (index < length) {
    const ch = rawSql[index];
    const next = index + 1 < length ? rawSql[index + 1] : '';

    // Block comment.
    if (ch === '/' && next === '*') {
      out.push('  ');
      index += 2;
      while (index < length) {
        const c = rawSql[index];
        const n = index + 1 < length ? rawSql[index + 1] : '';
        if (c === '*' && n === '/') {
          out.push('  ');
          index += 2;
          break;
        }
        out.push(c === '\n' ? '\n' : ' ');
        index += 1;
      }
      continue;
    }

    // Line comment.
    if (ch === '-' && next === '-') {
      while (index < length && rawSql[index] !== '\n') {
        out.push(' ');
        index += 1;
      }
      continue;
    }

    // Dollar-quoted string ($tag$ ... $tag$).
    if (ch === '$') {
      const dollarMatch = rawSql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (dollarMatch) {
        const tag = dollarMatch[0];
        const closeIndex = rawSql.indexOf(tag, index + tag.length);
        if (closeIndex !== -1) {
          for (let scan = index; scan < closeIndex + tag.length; scan += 1) {
            out.push(rawSql[scan] === '\n' ? '\n' : ' ');
          }
          index = closeIndex + tag.length;
          continue;
        }
      }
    }

    // Single-quoted string.
    if (ch === '\'') {
      out.push(' ');
      index += 1;
      while (index < length) {
        const c = rawSql[index];
        if (c === '\'' && rawSql[index + 1] === '\'') {
          // Escaped quote inside string.
          out.push('  ');
          index += 2;
          continue;
        }
        if (c === '\'') {
          out.push(' ');
          index += 1;
          break;
        }
        out.push(c === '\n' ? '\n' : ' ');
        index += 1;
      }
      continue;
    }

    // Double-quoted identifier (PostgreSQL).
    if (ch === '"') {
      out.push(' ');
      index += 1;
      while (index < length) {
        const c = rawSql[index];
        if (c === '"' && rawSql[index + 1] === '"') {
          out.push('  ');
          index += 2;
          continue;
        }
        if (c === '"') {
          out.push(' ');
          index += 1;
          break;
        }
        out.push(c === '\n' ? '\n' : ' ');
        index += 1;
      }
      continue;
    }

    // Backtick-quoted identifier (MySQL/SQLite).
    if (ch === '`') {
      out.push(' ');
      index += 1;
      while (index < length) {
        const c = rawSql[index];
        if (c === '`') {
          out.push(' ');
          index += 1;
          break;
        }
        out.push(c === '\n' ? '\n' : ' ');
        index += 1;
      }
      continue;
    }

    out.push(ch);
    index += 1;
  }

  return out.join('');
}

function splitStatements(strippedSql) {
  // Split on top-level `;`. Because we already replaced string contents with
  // whitespace and dollar-quoted blocks with whitespace, every remaining `;`
  // is a real statement terminator.
  const statements = [];
  if (typeof strippedSql !== 'string' || strippedSql === '') {
    return statements;
  }

  let buffer = '';
  let line = 1;
  let startLine = 1;
  let hasContent = false;

  for (let index = 0; index < strippedSql.length; index += 1) {
    const ch = strippedSql[index];
    if (ch === ';') {
      if (hasContent) {
        statements.push({
          start_line: startLine,
          text: buffer
        });
      }
      buffer = '';
      hasContent = false;
      startLine = line;
      continue;
    }

    if (ch === '\n') {
      line += 1;
      buffer += '\n';
      if (!hasContent) {
        startLine = line;
      }
      continue;
    }

    if (!/\s/.test(ch)) {
      hasContent = true;
    }
    buffer += ch;
  }

  if (hasContent) {
    statements.push({
      start_line: startLine,
      text: buffer
    });
  }

  return statements;
}

function normalizeWhitespace(text) {
  if (typeof text !== 'string') {
    return '';
  }
  return text.replace(/\s+/g, ' ').trim();
}

function parseSql(rawSql) {
  const stripped = stripCommentsAndStrings(rawSql);
  const statements = splitStatements(stripped).map((statement) => ({
    start_line: statement.start_line,
    normalized_text: normalizeWhitespace(statement.text)
  }));
  return {
    statement_count: statements.length,
    statements
  };
}

module.exports = {
  normalizeWhitespace,
  parseSql,
  splitStatements,
  stripCommentsAndStrings
};
