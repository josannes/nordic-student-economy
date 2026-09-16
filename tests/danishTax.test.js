// Fictional students. Expected values are worked out by hand from the 2026 rates:
// AM-bidrag 8 %, personfradrag 54,100, bundskat 12.01 %, beskæftigelsesfradrag 12.75 %,
// København 23.39 % municipal tax, 25 % under limited liability.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { danishTax, withholdingWithoutTaxCard } from '../src/calc/danishTax.js';
import { dk, near } from './helpers.js';

test('small job below the personal allowance: only AM-bidrag', () => {
  const r = danishTax({ wageDkk: 50000, municipality: 'København' }, dk);
  near(r.labourMarketContribution, 4000);
  near(r.personalIncome, 46000);
  near(r.employmentDeduction, 6375);
  near(r.incomeTax, 0);
  near(r.totalTax, 4000);
});

test('100,000 DKK wage in København, full tax liability', () => {
  // personal income 92,000, taxable income 92,000 - 12,750 = 79,250
  // bundskat 0.1201 * 37,900 = 4,551.79; municipal 0.2339 * 25,150 = 5,882.585
  const r = danishTax({ wageDkk: 100000, municipality: 'København' }, dk);
  near(r.bottomTax, 4551.79);
  near(r.municipalTax, 5882.585);
  near(r.churchTax, 0);
  near(r.totalTax, 8000 + 4551.79 + 5882.585);
});

test('church members pay church tax', () => {
  // 0.008 * 25,150 = 201.2
  const r = danishTax({ wageDkk: 100000, municipality: 'København', churchMember: true }, dk);
  near(r.churchTax, 201.2);
});

test('student rule: 25 % replaces municipal tax, no church tax', () => {
  const r = danishTax({ wageDkk: 100000, municipality: 'København', churchMember: true, limitedLiability: true }, dk);
  near(r.municipalTax, 6287.5);
  near(r.churchTax, 0);
  near(r.bottomTax, 4551.79);
});

test('SU is taxed but has no AM-bidrag and no employment deduction', () => {
  // wage 60,000 + SU 89,112: AM 4,800, personal income 144,312, deduction 7,650, taxable 136,662
  // bundskat 0.1201 * 90,212 = 10,834.4612; municipal 0.2339 * 82,562 = 19,311.2518
  const r = danishTax({ wageDkk: 60000, suDkk: 89112, municipality: 'København' }, dk);
  near(r.labourMarketContribution, 4800);
  near(r.employmentDeduction, 7650);
  near(r.bottomTax, 10834.4612);
  near(r.municipalTax, 19311.2518);
});

test('unused allowance in municipal tax reduces bundskat', () => {
  // wage 62,000: personal income 57,040, taxable 49,135
  // bundskat 0.1201 * 2,940 = 353.09; municipal 0.2339 * -4,965 = -1,161.31, so all is covered
  const r = danishTax({ wageDkk: 62000, municipality: 'København' }, dk);
  near(r.bottomTax, 0);
  near(r.incomeTax, 0);
});

test('jobfradrag applies above 235,200 DKK', () => {
  // (300,000 - 235,200) * 0.045 = 2,916
  near(danishTax({ wageDkk: 300000, municipality: 'Aarhus' }, dk).jobDeduction, 2916);
  near(danishTax({ wageDkk: 400000, municipality: 'Aarhus' }, dk).jobDeduction, 3100);
});

test('no tax card: 8 % then 55 % of the rest', () => {
  // 2,000 wage: 160 + 0.55 * 1,840 = 1,172
  near(withholdingWithoutTaxCard(2000, dk), 1172);
});

test('unknown municipality fails loudly', () => {
  assert.throws(() => danishTax({ wageDkk: 1, municipality: 'Oslo' }, dk), /Unknown municipality/);
});
