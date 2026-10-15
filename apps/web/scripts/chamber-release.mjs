import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

function sourceFile(root, relativePath) {
  const filePath = path.join(root, relativePath);
  return ts.createSourceFile(filePath, readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function unwrap(node) {
  let current = node;
  while (ts.isAsExpression(current) || ts.isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

function propertyName(node) {
  if (!node) return undefined;
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : undefined;
}

function findVariable(source, name) {
  let initializer;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && propertyName(node.name) === name) initializer = unwrap(node.initializer);
    if (!initializer) ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(initializer, `Could not find ${name} in ${source.fileName}`);
  return initializer;
}

function objectProperties(node) {
  const object = unwrap(node);
  assert.ok(ts.isObjectLiteralExpression(object), `Expected object literal in ${object.getSourceFile().fileName}`);
  return new Map(object.properties
    .filter(ts.isPropertyAssignment)
    .map((entry) => [propertyName(entry.name), unwrap(entry.initializer)]));
}

function literalValue(node) {
  const value = unwrap(node);
  if (ts.isNumericLiteral(value)) return Number(value.text);
  if (ts.isStringLiteral(value) || ts.isNoSubstitutionTemplateLiteral(value)) return value.text;
  if (value.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (value.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (ts.isObjectLiteralExpression(value)) {
    return Object.fromEntries([...objectProperties(value)].map(([key, child]) => [key, literalValue(child)]));
  }
  if (ts.isArrayLiteralExpression(value)) return value.elements.map(literalValue);
  return undefined;
}

function readRooms(root) {
  const roomsNode = findVariable(sourceFile(root, 'packages/engine/src/chambers.ts'), 'CHAMBERS');
  assert.ok(ts.isArrayLiteralExpression(roomsNode), 'CHAMBERS must be an array literal');
  return roomsNode.elements.map((element) => literalValue(element));
}

export function sourceConstant(root, relativePath, name) {
  return literalValue(findVariable(sourceFile(root, relativePath), name));
}

function readReleaseFlags(root) {
  const registry = sourceFile(root, 'apps/web/src/chambers/registry.ts');
  const modules = objectProperties(findVariable(registry, 'CHAMBER_MODULES'));
  return new Map([...modules].map(([id, entry]) => [id, literalValue(objectProperties(entry).get('releaseOpen'))]));
}

/** Matches the registry's production rule: authored-open rooms also need the release flag. */
export function chambersForBuild(root = REPO_ROOT, development = false) {
  const flags = readReleaseFlags(root);
  return readRooms(root).map((room) => {
    const releaseOpen = flags.get(room.id);
    assert.equal(typeof releaseOpen, 'boolean', `Missing releaseOpen flag for ${room.id}`);
    return {
      ...room,
      status: room.status === 'open' && (development || releaseOpen) ? 'open' : 'sealed',
    };
  });
}
