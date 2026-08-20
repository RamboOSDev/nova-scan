import ts from 'typescript';

/**
 * Parse a TypeScript/JavaScript source string into a `ts.SourceFile`.
 *
 * Uses the latest script target and the appropriate script kind based on
 * the file extension (TSX/JSX for `.tsx`/`.jsx`, plain TS otherwise).
 *
 * @param filePath - Path of the file (used only to pick a ScriptKind).
 * @param source - Raw source text.
 */
export function parseSourceFile(filePath: string, source: string): ts.SourceFile {
  const lower = filePath.toLowerCase();
  let scriptKind: ts.ScriptKind = ts.ScriptKind.TS;
  if (lower.endsWith('.tsx')) scriptKind = ts.ScriptKind.TSX;
  else if (lower.endsWith('.jsx')) scriptKind = ts.ScriptKind.JSX;
  else if (lower.endsWith('.js')) scriptKind = ts.ScriptKind.JS;
  return ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, /*setParentNodes*/ true, scriptKind);
}

/**
 * Return true if `node` or any of its ancestors is a string-like literal,
 * a template literal/expression piece, JSX text, or a tagged template.
 *
 * Used by detectors to skip code that only *looks* like a real call/access
 * because it's embedded in documentation or a template string.
 */
export function isInsideStringOrTemplate(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    switch (current.kind) {
      case ts.SyntaxKind.StringLiteral:
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
      case ts.SyntaxKind.TemplateExpression:
      case ts.SyntaxKind.TemplateHead:
      case ts.SyntaxKind.TemplateMiddle:
      case ts.SyntaxKind.TemplateTail:
      case ts.SyntaxKind.JsxText:
      case ts.SyntaxKind.TaggedTemplateExpression:
        return true;
    }
    current = current.parent;
  }
  return false;
}

/**
 * Return true if `pos` falls inside any comment range in the file.
 *
 * Walks every node and tests leading + trailing comment ranges. This is
 * O(N * comments) but acceptable for the file sizes typically scanned.
 */
export function isInsideComment(sourceFile: ts.SourceFile, pos: number): boolean {
  const fullText = sourceFile.getFullText();
  let inside = false;

  const checkRanges = (ranges: readonly ts.CommentRange[] | undefined): void => {
    if (!ranges) return;
    for (const r of ranges) {
      if (pos >= r.pos && pos < r.end) {
        inside = true;
        return;
      }
    }
  };

  const visit = (node: ts.Node): void => {
    if (inside) return;
    checkRanges(ts.getLeadingCommentRanges(fullText, node.getFullStart()));
    checkRanges(ts.getTrailingCommentRanges(fullText, node.getEnd()));
    if (inside) return;
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return inside;
}

/**
 * Return true iff the first statement is `"use client";`.
 */
export function hasUseClientDirective(sourceFile: ts.SourceFile): boolean {
  return hasLeadingDirective(sourceFile, 'use client');
}

/**
 * Return true iff the first statement is `"use server";`.
 */
export function hasUseServerDirective(sourceFile: ts.SourceFile): boolean {
  return hasLeadingDirective(sourceFile, 'use server');
}

function hasLeadingDirective(sourceFile: ts.SourceFile, directive: string): boolean {
  const first = sourceFile.statements[0];
  if (!first || !ts.isExpressionStatement(first)) return false;
  const expr = first.expression;
  if (!ts.isStringLiteral(expr)) return false;
  return expr.text === directive;
}

/**
 * Heuristic for whether a file is part of the client bundle.
 *
 * Returns true when any of the following hold:
 *   1. `"use client"` is the first statement.
 *   2. Path matches `*.client.ts` / `*.client.tsx`.
 *   3. The file imports from `react`, calls a common client-only React hook,
 *      and does NOT have a `"use server"` directive.
 */
export function isLikelyClientFile(filePath: string, sourceFile: ts.SourceFile): boolean {
  if (hasUseClientDirective(sourceFile)) return true;

  const normalized = filePath.replace(/\\/g, '/').toLowerCase();
  if (/\.client\.(ts|tsx)$/.test(normalized)) return true;

  if (hasUseServerDirective(sourceFile)) return false;

  let importsReact = false;
  let callsClientHook = false;
  const clientHooks = new Set(['useState', 'useEffect', 'useReducer', 'useRef', 'useCallback', 'useMemo']);

  const visit = (node: ts.Node): void => {
    if (importsReact && callsClientHook) return;
    if (ts.isImportDeclaration(node)) {
      const mod = node.moduleSpecifier;
      if (ts.isStringLiteral(mod) && mod.text === 'react') {
        importsReact = true;
      }
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression;
      if (ts.isIdentifier(callee) && clientHooks.has(callee.text)) {
        callsClientHook = true;
      } else if (ts.isPropertyAccessExpression(callee) && ts.isIdentifier(callee.name) && clientHooks.has(callee.name.text)) {
        callsClientHook = true;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);

  return importsReact && callsClientHook;
}

/**
 * Find all property/element accesses where the *base* expression is an
 * `Identifier` whose text equals `objectName`.
 *
 * For `process.env`, called with `"process"`, returns the `process.env` node
 * with `propertyName === "env"`. Handles both:
 *   - `process.env`            (PropertyAccessExpression)
 *   - `process["env"]`         (ElementAccessExpression with StringLiteral)
 */
export function findPropertyAccess(
  sourceFile: ts.SourceFile,
  objectName: string,
): { node: ts.Node; propertyName: string }[] {
  const results: { node: ts.Node; propertyName: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === objectName) {
        if (ts.isIdentifier(node.name)) {
          results.push({ node, propertyName: node.name.text });
        }
      }
    } else if (ts.isElementAccessExpression(node)) {
      if (ts.isIdentifier(node.expression) && node.expression.text === objectName) {
        const arg = node.argumentExpression;
        if (arg && ts.isStringLiteral(arg)) {
          results.push({ node, propertyName: arg.text });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return results;
}

/**
 * Find all `something.from("table").select(...)` call expressions.
 *
 * Captures `tableName` from the StringLiteral argument to `.from(...)`.
 * Calls whose `.from(...)` argument is not a string literal (e.g.,
 * `supabase.from(tableVar).select()`) are intentionally excluded — we
 * can't classify them statically.
 */
export function findSupabaseSelectCalls(
  sourceFile: ts.SourceFile,
): { call: ts.CallExpression; tableName: string }[] {
  const results: { call: ts.CallExpression; tableName: string }[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node)) {
      const selectCallee = node.expression;
      if (
        ts.isPropertyAccessExpression(selectCallee) &&
        ts.isIdentifier(selectCallee.name) &&
        selectCallee.name.text === 'select'
      ) {
        const inner = selectCallee.expression;
        if (ts.isCallExpression(inner)) {
          const fromCallee = inner.expression;
          if (
            ts.isPropertyAccessExpression(fromCallee) &&
            ts.isIdentifier(fromCallee.name) &&
            fromCallee.name.text === 'from' &&
            inner.arguments.length > 0
          ) {
            const tableArg = inner.arguments[0];
            if (tableArg && ts.isStringLiteral(tableArg)) {
              results.push({ call: node, tableName: tableArg.text });
            }
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return results;
}
