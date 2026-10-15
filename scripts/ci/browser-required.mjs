import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const ts = require('typescript');
// Only these data modules qualify; executable copy helpers are deliberately absent.
const copyFiles = new Set(['packages/engine/src/copy.ts', 'packages/engine/src/siteCopy.ts']);

export function copyShape(source) {
  const parsed = ts.createSourceFile('copy.ts', source, ts.ScriptTarget.Latest, true);
  if (parsed.parseDiagnostics.length) return null;
  const textSlots = new Set();
  const contractKeys = new Set(['id', 'href', 'url', 'path', 'slug', 'route', 'src']);
  const visit = node => {
    if (ts.isStringLiteral(node)) {
      const parent = node.parent;
      if ((ts.isVariableDeclaration(parent) && parent.initializer === node)
        || ts.isArrayLiteralExpression(parent)
        || (ts.isPropertyAssignment(parent) && parent.initializer === node && !contractKeys.has(parent.name.getText(parsed).replace(/^['"]|['"]$/g, '')))) {
        textSlots.add(node.getStart(parsed));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(parsed);
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, source);
  const tokens = [];
  for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) {
    tokens.push({ kind, text: textSlots.has(scanner.getTokenPos()) ? '<text>' : scanner.getTokenText() });
  }
  // Types, imports, property keys, identifiers and route/id values remain contractual.
  return JSON.stringify(tokens.map(token => [token.kind, token.text]));
}

export function browserRequired(files, readVersion) {
  if (!files.length) return true;
  return files.some(file => {
    if (file.startsWith('docs/') || file.endsWith('.md')) return false;
    if (!copyFiles.has(file)) return true;
    try {
      const before = copyShape(readVersion('base', file));
      return before === null || before !== copyShape(readVersion('head', file));
    } catch {
      return true; // Missing history, additions and deletions must not bypass the gate.
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.argv[2];
  if (!base) console.log('browser=true'); // Dispatches run all coverage.
  else {
    const git = args => execFileSync('git', args, { encoding: 'utf8' });
    const files = git(['diff', '--no-renames', '--name-only', '-z', base, 'HEAD']).split('\0').filter(Boolean);
    const required = browserRequired(files, (version, file) => git(['show', `${version === 'base' ? base : 'HEAD'}:${file}`]));
    console.log(`browser=${required}`);
  }
}
