#!/usr/bin/env node
/**
 * `pnpm check:public`: nothing that must stay private may be committed to a repository that
 * will be public. Scans every tracked file (git ls-files), plus any paths given as arguments.
 *
 * Fails on: private keys, access tokens and credential assignments; cloud account identifiers;
 * personal email addresses; absolute local machine paths; tracked .env files; files over the
 * size limit. Each rule carries a sample it must catch, checked on every run, so a broken
 * pattern cannot pass silently.
 *
 * `--release` (run before anything is made public) additionally requires a LICENSE file and no
 * unresolved founder placeholders, and checks the whole git history: every author and committer
 * email must be a no-reply address, no commit message may carry AI attribution, and, when
 * UNHELD_LORE_MARKERS names the private marker list, no tracked file or historical blob may
 * contain a lore marker (AGENTS.md #11 and #12).
 *
 * No dependencies; Node and git only.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const MAX_FILE_BYTES = 5 * 1024 * 1024;

const BINARY = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.ico', '.woff', '.woff2', '.ttf', '.otf', '.glb', '.ktx2', '.bin', '.mp3', '.ogg', '.opus', '.wav', '.m4a', '.zip', '.pdf']);
const isBinary = (file) => BINARY.has(extname(file).toLowerCase()) || file.toLowerCase().endsWith('.glb.gz');

/** Email addresses that are fine in a public repository. */
const EMAIL_ALLOWED = [
  /@users\.noreply\.github\.com$/i,
  /@example\.(com|org|net)$/i,
  /^noreply@/i,
  // The project's own public contact (conduct reports), decided by the founder on 14 October 2026.
  /^info@unheld\.space$/i,
];

/** Marks a decision only the founder can make, left in a file that will be public. */
const PLACEHOLDER = /\{\{FOUNDER:[^}]*\}\}/;

/** AGENTS.md #11: no AI attribution anywhere. Shared by the file scan and the history scan. */
const ATTRIBUTION = /(Claude-Session:|claude\.ai\/code|Co-Authored-By:[^\n]*(Claude|Anthropic|OpenAI|GPT|Codex|Copilot|Gemini)|Generated (with|by) \[?(Claude|ChatGPT|Codex|Copilot|Gemini|AI)\b|\u{1F916} Generated)/iu;

const RULES = [
  { id: 'ai-attribution', pattern: ATTRIBUTION, sample: 'Claude-Session: https://claude.ai/code/session_x' },
  {
    id: 'private-key',
    pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    sample: '-----BEGIN RSA PRIVATE KEY-----',
  },
  {
    id: 'github-token',
    pattern: /\b(gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
    sample: `token ghp_${'a1B2'.repeat(9)}`,
  },
  { id: 'aws-access-key', pattern: /\bAKIA[0-9A-Z]{16}\b/, sample: 'AKIA' + 'ABCDEFGHIJKLMNOP' },
  { id: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, sample: 'xoxb-1234567890-abcdef' },
  { id: 'llm-api-key', pattern: /\bsk-(ant-)?[A-Za-z0-9_-]{24,}\b/, sample: `sk-ant-${'x'.repeat(30)}` },
  {
    id: 'credential-assignment',
    pattern: /\b(api[_-]?key|secret|token|password|passwd)\b["']?\s*[:=]\s*["'][^"'\s]{12,}["']/i,
    sample: 'const apiKey = "abcdef0123456789xyz"',
  },
  {
    id: 'cloud-account-id',
    pattern: /\baccount[_-]?id\b["']?\s*[:=]\s*["']?[0-9a-f]{32}\b/i,
    sample: `"account_id": "${'0a'.repeat(16)}"`,
  },
  {
    id: 'local-path',
    pattern: /(?:\/Users\/[A-Za-z0-9._-]+\/|\/home\/[A-Za-z0-9._-]+\/|[A-Z]:\\Users\\|\/private\/tmp\/)/,
    sample: 'see /Users/someone/project/file.ts',
  },
];

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Package scopes look like emails to the pattern (`@scope/pkg@1.0` never matches, `a@b.co` does). */
function personalEmails(line) {
  return [...line.matchAll(EMAIL)].map((m) => m[0]).filter((email) => !EMAIL_ALLOWED.some((ok) => ok.test(email)));
}

/**
 * The emails a line exposes. A lockfile's `deprecated:` notices are text the npm registry attaches
 * to third-party packages (for example a maintainer's public contact address); they are not ours to
 * edit and expose nobody. Only those lines, and only in the lockfile, are exempt.
 */
function reportedEmails(file, line) {
  if (file === 'pnpm-lock.yaml' && /^\s+deprecated: /.test(line)) return [];
  return personalEmails(line);
}

function selfTest() {
  const broken = RULES.filter((rule) => !rule.pattern.test(rule.sample)).map((rule) => rule.id);
  if (!isBinary('apps/web/src/assets/outline-room.glb.gz')) broken.push('binary-gzip-model');
  if (personalEmails('contact someone.private@gmail.com').length !== 1) broken.push('email');
  if (personalEmails('Author <1234+someone@users.noreply.github.com>').length !== 0) broken.push('email-allowlist');
  if (personalEmails('write to info@unheld.space').length !== 0) broken.push('email-project-contact');
  if (personalEmails('write to someone@unheld.space').length !== 1) broken.push('email-project-scope');
  if (reportedEmails('pnpm-lock.yaml', '    deprecated: contact upkeep@example.org').length !== 0) broken.push('email-lockfile-notice');
  if (reportedEmails('pnpm-lock.yaml', '    author: someone.private@gmail.com').length !== 1) broken.push('email-lockfile-scope');
  if (reportedEmails('README.md', '    deprecated: someone.private@gmail.com').length !== 1) broken.push('email-file-scope');
  if (broken.length > 0) {
    console.error(`check:public self-test failed; these rules no longer catch their samples: ${broken.join(', ')}`);
    process.exit(2);
  }
}

const NOREPLY = [/@users\.noreply\.github\.com$/i, /^noreply@github\.com$/i];

/** Release only: authors, committers and messages across every ref; lore markers in every blob. */
function historyViolations() {
  const out = [];
  const log = execFileSync('git', ['log', '--all', '--format=%H%x00%ae%x00%ce%x00%B%x1e'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  for (const record of log.split('\x1e')) {
    const [hash, author, committer, body] = record.replace(/^\n/, '').split('\0');
    if (!hash) continue;
    for (const email of [author, committer]) {
      if (email && !NOREPLY.some((ok) => ok.test(email))) out.push(`commit ${hash.slice(0, 9)}: email ${email} is not a no-reply address`);
    }
    if (body && ATTRIBUTION.test(body)) out.push(`commit ${hash.slice(0, 9)}: message carries AI attribution`);
  }
  const markersFile = process.env.UNHELD_LORE_MARKERS;
  if (!markersFile) {
    out.push('UNHELD_LORE_MARKERS is not set: the lore check needs the private marker list');
    return out;
  }
  const markers = readFileSync(markersFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));
  const revs = execFileSync('git', ['rev-list', '--all'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  for (const marker of markers) {
    let hits = '';
    try {
      hits = execFileSync('git', ['grep', '-I', '-i', '-l', '-F', marker, ...revs], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    } catch {
      hits = ''; // git grep exits 1 when nothing matches
    }
    // Report the marker's line number in the private list, never the marker itself.
    const index = markers.indexOf(marker) + 1;
    const where = [...new Set(hits.split('\n').filter(Boolean).map((h) => h.split(':').slice(1).join(':')))];
    for (const path of where) out.push(`${path}: contains private lore marker #${index} somewhere in history`);
  }
  return out;
}

function trackedFiles() {
  const out = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' });
  return out.split('\0').filter(Boolean);
}

function scan(files) {
  const violations = [];
  for (const file of files) {
    if (/(^|\/)\.env(\.|$)/.test(file) && !file.endsWith('.env.example')) {
      violations.push(`${file}: environment file is tracked`);
      continue;
    }
    let size;
    try {
      size = statSync(file).size;
    } catch {
      continue; // deleted in the working tree
    }
    if (size > MAX_FILE_BYTES) violations.push(`${file}: ${(size / 1048576).toFixed(1)} MB exceeds ${MAX_FILE_BYTES / 1048576} MB`);
    if (isBinary(file) || file === 'scripts/check-public.mjs') continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.pattern.test(line)) violations.push(`${file}:${index + 1}: ${rule.id}`);
      }
      for (const email of reportedEmails(file, line)) violations.push(`${file}:${index + 1}: personal email ${email}`);
    });
  }
  return violations;
}

selfTest();
const release = process.argv.includes('--release');
const extra = process.argv.slice(2).filter((arg) => arg !== '--release');
const files = [...trackedFiles(), ...extra];
const violations = scan(files);
if (release) {
  violations.push(...historyViolations());
  if (!files.includes('LICENSE')) violations.push('LICENSE: missing; the licence is a founder decision');
  for (const file of files) {
    if (isBinary(file) || file === 'scripts/check-public.mjs') continue;
    let text;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    text.split('\n').forEach((line, index) => {
      if (PLACEHOLDER.test(line)) violations.push(`${file}:${index + 1}: unresolved founder placeholder`);
    });
  }
}
if (violations.length > 0) {
  console.error(`check:public found ${violations.length} problem(s) that must not reach a public repository:`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`check:public passed: ${files.length} files, ${RULES.length + 1} rules.`);
