#!/usr/bin/env node
// Assembles the published site: the current game at the root, and a frozen copy of every
// released version (git tags v1, v2, ...) under /v/<tag>/, each with a small version picker.
//
// Every version is rebuilt from its own tag on every deploy, so the site is a function of
// the repository alone: nothing is carried over from an earlier deploy, and a broken publish
// is repaired by running the workflow again.
//
// Usage: node tools/release.mjs [outdir]        (default _site)

import { execFileSync, execSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const RELEASE = /^v\d+$/;
const FILES = ['index.html', 'game.js']; // everything a version needs to run

const git = (...args) => execFileSync('git', args,
  { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** Released versions, oldest first, with the subject of the tag and the date of its commit. */
function releases() {
  // An annotated tag has its commit date under *committerdate and a lightweight one under
  // committerdate; only one of the two is ever set, so printing both gives the right one.
  return git('tag', '--list', '--format=%(refname:short)%09%(contents:subject)%09%(*committerdate:short)%(committerdate:short)')
    .split('\n').filter(Boolean)
    .map((line) => { const [tag, subject = '', date = ''] = line.split('\t'); return { tag, subject, date }; })
    .filter(({ tag }) => RELEASE.test(tag))
    .sort((a, b) => Number(a.tag.slice(1)) - Number(b.tag.slice(1)));
}

/** The tag HEAD is exactly at; otherwise the newest tag plus a '+' (or 'dev' with no tags). */
function headLabel(rels) {
  try { const t = git('describe', '--tags', '--exact-match', 'HEAD'); if (RELEASE.test(t)) return t; } catch { /* untagged */ }
  return rels.length ? `${rels[rels.length - 1].tag}+` : 'dev';
}

/**
 * The version picker, stamped into every page. `here` is 'latest' at the root or the tag of
 * an archived copy; links are relative so the site works under any base path. The current
 * game hides the picker once you leave the title screen (older versions just keep it).
 */
function picker(rels, here, label) {
  const up = here === 'latest' ? '' : '../../';
  const opts = [`<option value="${up || './'}"${here === 'latest' ? ' selected' : ''}>latest</option>`,
    ...[...rels].reverse().map(({ tag, subject }) =>
      `<option value="${up}v/${tag}/"${tag === here ? ' selected' : ''}>${tag} · ${esc(subject)}</option>`)].join('');
  return `<div id="ver" style="position:fixed;right:10px;bottom:10px;z-index:20;display:flex;gap:8px;align-items:center;`
    + `font:12px ui-monospace,Menlo,Consolas,monospace;color:#dfe6ee;background:rgba(10,12,20,.78);`
    + `border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:5px 8px">`
    + `<span>${here === 'latest' ? esc(label) : `${here} · archived`}</span>`
    + `<select aria-label="Game version" onchange="if(this.value)location.href=this.value" `
    + `style="max-width:15rem;font:inherit;color:inherit;background:#1b2030;border:1px solid rgba(255,255,255,.25);border-radius:5px">${opts}</select>`
    + `<a href="${up}v/" style="color:#ffd54a">all versions</a></div>`;
}

/** Stamp a page with its version and the picker. */
function stamp(file, rels, here, label) {
  let html = readFileSync(file, 'utf8');
  html = html.replace(/<meta charset="utf-8">/i, (m) => `${m}\n<meta name="qta-version" content="${esc(here === 'latest' ? label : here)}">`);
  html = html.replace(/<body[^>]*>/i, (m) => `${m}\n${picker(rels, here, label)}`);
  writeFileSync(file, html);
}

/** A plain index of every version, so they can be found without guessing. */
function indexPage(rels, label) {
  const rows = [`    <li><a href="../">latest</a> <em>(${esc(label)})</em>: what to play</li>`,
    ...[...rels].reverse().map(({ tag, subject, date }) =>
      `    <li><a href="${tag}/">${tag}</a> <span class="d">${esc(date)}</span> · ${esc(subject)}</li>`)].join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Quant Theft Auto: all versions</title>
<style>
  body { margin: 0 auto; padding: 3rem 1.5rem; max-width: 44rem; background: #f6f4ef;
         font: 15px/1.6 ui-sans-serif, system-ui, sans-serif; color: #1d2430; }
  h1 { font-size: 1.35rem; font-weight: 600; }
  li { margin: 0.45rem 0; }
  a { color: #a8175f; font-weight: 600; }
  .d, p { color: #5a6472; }
  @media (prefers-color-scheme: dark) {
    body { background: #12161f; color: #e6edf3; }
    .d, p { color: #9fb0bf; }
    a { color: #ffd54a; }
  }
</style>
</head>
<body>
  <h1>Quant Theft Auto: all versions</h1>
  <p>Every released version is kept here exactly as it was published, newest first.</p>
  <ul>
${rows}
  </ul>
</body>
</html>
`;
}

const out = resolve(process.argv[2] || join(ROOT, '_site'));
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const rels = releases(), label = headLabel(rels);

// the current game, from the working tree
for (const f of FILES) cpSync(join(ROOT, f), join(out, f));
stamp(join(out, 'index.html'), rels, 'latest', label);
console.log(`/            ${label}`);

// every release, from its own tag
for (const { tag } of rels) {
  const at = join(out, 'v', tag), work = mkdtempSync(join(tmpdir(), `qta-${tag}-`));
  try {
    execSync(`git archive ${tag} ${FILES.join(' ')} | tar -x -C ${JSON.stringify(work)}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    mkdirSync(at, { recursive: true });
    for (const f of FILES) cpSync(join(work, f), join(at, f));
    stamp(join(at, 'index.html'), rels, tag, label);
    console.log(`/v/${tag}/`.padEnd(13), tag);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
mkdirSync(join(out, 'v'), { recursive: true });
writeFileSync(join(out, 'v', 'index.html'), indexPage(rels, label));
console.log(`/v/          index of ${rels.length} version${rels.length === 1 ? '' : 's'}`);
