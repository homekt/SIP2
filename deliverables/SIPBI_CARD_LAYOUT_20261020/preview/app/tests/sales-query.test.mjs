import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { PUBLIC_MEASURES } from '../scripts/sales-domain.mjs';

const script = new URL('../scripts/sales-query.ps1', import.meta.url);

function readScript() {
  return fs.readFileSync(script, 'utf8');
}

function run(args) {
  return new Promise((resolve) => {
    execFile('powershell.exe', ['-NoProfile', '-File', fileURLToPath(script), ...args], {
      encoding: 'utf8',
      timeout: 20000,
      windowsHide: true
    }, (err, stdout, stderr) => {
      resolve({ code: err && typeof err.code === 'number' ? err.code : 0, stdout, stderr });
    });
  });
}

test('query script is MSOLAP -File only and uses public Invoice Date measures', () => {
  const text = readScript();
  assert.match(text, /Provider=MSOLAP/);
  assert.match(text, /\[Invoice Date\]\.\[Calendar\]\.\[Month\]/);
  assert.match(text, /\[Measures\]\.\[Order Count\]/);
  assert.doesNotMatch(text, /-Command/);
  assert.doesNotMatch(text, /Net Sales Local/);
  assert.doesNotMatch(text, /CNY/);
  assert.doesNotMatch(text, /OEE/);
  assert.doesNotMatch(text, /Budget Sales/);
  for (const name of PUBLIC_MEASURES) assert.match(text, new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('plan mode emits MDX without opening SSAS', async () => {
  const planned = await run([
    '-Mode', 'plan',
    '-Month', '202609',
    '-Company', '00020',
    '-Plant', '00020|1',
    '-Product', 'All',
    '-Customer', 'All',
    '-Salesperson', 'All',
    '-CostCenter', 'All',
    '-PriorMonth', '202509',
    '-MonthlyMonths', '202608,202609'
  ]);
  assert.equal(planned.code, 0, planned.stderr || planned.stdout);
  const body = JSON.parse(planned.stdout);
  assert.equal(body.executed, false);
  const statements = Array.isArray(body.statements) ? body.statements : [body.statements];
  const mdx = statements.map((item) => item.mdx).join('\n');
  assert.match(mdx, /\[Invoice Date\]\.\[Calendar\]\.\[Month\]\.&\[202609\]/);
  assert.match(mdx, /\[Company\]\.\[Company\]\.&\[00020\]/);
  assert.match(mdx, /\[Plant\]\.\[Plant\]\.&\[00020\|1\]/);
  assert.match(mdx, /\[Measures\]\.\[Order Count\]/);
  assert.doesNotMatch(mdx, /Net Sales Local/);
  assert.ok(statements.some((item) => item.name === 'priorKpi'));
  assert.ok(statements.some((item) => item.name === 'monthly'));

  const all = await run(['-Mode', 'plan', '-Month', 'All']);
  assert.equal(all.code, 0, all.stderr || all.stdout);
  const allBody = JSON.parse(all.stdout);
  const allStatements = Array.isArray(allBody.statements) ? allBody.statements : [allBody.statements];
  const kpi = allStatements.find((item) => item.name === 'kpi').mdx;
  assert.doesNotMatch(kpi, /\[Invoice Date\]\.\[Calendar\]\.\[Month\]\.&\[/);
  assert.equal(allStatements.some((item) => item.name === 'priorKpi'), false);

  const invalid = await run(['-Mode', 'plan', '-Month', '202613']);
  assert.notEqual(invalid.code, 0);
  const error = JSON.parse(invalid.stdout);
  assert.equal(error.status, 'error');
  assert.equal(error.error.code, 'invalid_parameter');
  assert.equal(JSON.stringify(error).includes('at '), false);
});
