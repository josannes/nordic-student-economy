// Every rate in data/<country>/<year>.json must say where it comes from.
// A rate is any object with a "value" key. Objects without "value" are groups.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DATA_DIR = new URL('../data/', import.meta.url).pathname;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function dataFiles() {
  return readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) =>
      readdirSync(join(DATA_DIR, d.name))
        .filter((f) => /^\d{4}\.json$/.test(f))
        .map((f) => ({ country: d.name, year: Number(f.slice(0, 4)), path: join(DATA_DIR, d.name, f) })),
    );
}

function collectRates(node, path = []) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  if ('value' in node) return [{ path: path.join('.'), rate: node }];
  return Object.entries(node)
    .filter(([key]) => !key.startsWith('_'))
    .flatMap(([key, child]) => collectRates(child, [...path, key]));
}

test('there is at least one data file', () => {
  assert.ok(dataFiles().length > 0);
});

for (const file of dataFiles()) {
  const data = JSON.parse(readFileSync(file.path, 'utf8'));
  const rates = collectRates(data.rates);

  test(`${file.country}/${file.year}: header matches file name`, () => {
    assert.equal(data.country, file.country);
    assert.equal(data.year, file.year);
    assert.ok(rates.length > 0, 'no rates found');
  });

  for (const { path, rate } of rates) {
    test(`${file.country}/${file.year}: ${path} has unit, year, source and check date`, () => {
      assert.equal(typeof rate.unit, 'string', 'unit missing');
      assert.ok(Number.isInteger(rate.year), 'year missing');
      assert.ok(rate.year >= file.year - 1 && rate.year <= file.year + 1, `year ${rate.year} far from file year`);
      assert.match(rate.source ?? '', /^https:\/\//, 'source must be an https URL');
      assert.equal(typeof rate.sourceTitle, 'string', 'sourceTitle missing');
      assert.match(rate.checked ?? '', DATE, 'checked must be YYYY-MM-DD');
    });
  }
}
