import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

export const load = (country, year = 2026) =>
  JSON.parse(readFileSync(new URL(`../data/${country}/${year}.json`, import.meta.url), 'utf8'));

export const dk = load('dk');
export const no = load('no');

export function near(actual, expected, tolerance = 0.01) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${expected}, got ${actual}`);
}
