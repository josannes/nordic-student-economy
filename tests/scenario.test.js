// A fictional student: 140 DKK/hour plus holiday pay, 12 hours a week,
// working and studying all of 2026, living in Aarhus, no church membership.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compareOptions } from '../src/calc/scenario.js';
import { danishTax } from '../src/calc/danishTax.js';
import { dk, no, near } from './helpers.js';

const FULL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const base = {
  job: { hourlyWageDkk: 140, hoursPerWeek: 12, months: FULL_YEAR },
  studyMonths: FULL_YEAR,
  otherIncomeNok: 0,
  municipality: 'Aarhus',
  hasTaxCard: true,
  nokPerDkk: 1.57,
  lanekassen: { loan: 'full', degreeCompleted: true },
  su: { loanPerMonthDkk: 0 },
};

test('job income: 140 * 12 * 52 = 87,360 plus 12.5 % holiday pay', () => {
  const r = compareOptions(base, { dk, no });
  near(r.lanekassen.job.gross, 98280);
  near(r.lanekassen.job.holidayPay, 10920);
});

test('Lånekassen option: income in NOK under the limit, full 40 % grant', () => {
  const r = compareOptions(base, { dk, no });
  near(r.lanekassen.support.incomeNok, 98280 * 1.57);
  near(r.lanekassen.support.grant, 67381.6);
  near(r.lanekassen.support.grantDkk, 67381.6 / 1.57);
  near(r.lanekassen.support.taxDkk, 0);
});

test('SU option: eligible, SU is taxed, and the job pays more tax than without SU', () => {
  const r = compareOptions(base, { dk, no });
  assert.equal(r.su.eligibility.status, 'eligible');
  near(r.su.support.grant, 89112);
  const suAlone = danishTax({ wageDkk: 0, suDkk: 89112, municipality: 'Aarhus' }, dk).totalTax;
  near(r.su.support.taxDkk, suAlone);
  assert.ok(r.su.job.tax > r.lanekassen.job.tax);
});

test('totals add up', () => {
  const r = compareOptions(base, { dk, no });
  for (const option of [r.lanekassen, r.su]) {
    const s = option.support;
    near(option.totals.cashDkk, option.job.net + s.paidOutDkk - s.taxDkk - (s.repaymentEstimate ?? 0));
    near(option.totals.cashHome, option.totals.cashDkk * 1.57);
  }
});

test('average and marginal net per hour are below gross pay per hour', () => {
  const r = compareOptions(base, { dk, no });
  const grossPerHour = 98280 / r.lanekassen.job.hours;
  assert.ok(r.lanekassen.perHour.average < grossPerHour);
  assert.ok(r.lanekassen.perHour.marginal <= r.lanekassen.perHour.average + 1e-9);
});

test('no tax card: more is withheld now and comes back later', () => {
  const r = compareOptions({ ...base, hasTaxCard: false }, { dk, no });
  assert.ok(r.lanekassen.job.withheld > r.lanekassen.job.tax);
  near(r.lanekassen.job.backWithTaxReturn, r.lanekassen.job.withheld - r.lanekassen.job.tax);
});

test('just above the Lånekassen limit, one more hour is worth much less', () => {
  // 180 DKK/hour, 20 hours a week: 210,600 DKK = 330,642 NOK, 95,821 above the limit.
  // Reduction 95,821 * 5 % * 11 = 52,701, still less than the 67,382 grant.
  // One more hour: 202.50 DKK gross costs 202.50 * 1.57 * 55 % = 174.87 NOK = 111.38 DKK of grant.
  const r = compareOptions({ ...base, job: { ...base.job, hourlyWageDkk: 180, hoursPerWeek: 20 } }, { dk, no });
  near(r.lanekassen.support.grantReduction, 52701.55, 0.5);
  assert.ok(r.lanekassen.perHour.marginal < 20);
  assert.ok(r.su.perHour.marginal > 100);
});

test('far above the limit the grant is already gone, so extra hours cost no more grant', () => {
  const r = compareOptions({ ...base, job: { ...base.job, hourlyWageDkk: 250, hoursPerWeek: 25 } }, { dk, no });
  // One more hour is then just wage minus tax: 281.25 gross keeps about 172 DKK.
  near(r.lanekassen.support.grant, 0);
  near(r.lanekassen.perHour.marginal, 172, 5);
});

test('8 hours a week: SU not available, no SU months', () => {
  const r = compareOptions({ ...base, job: { ...base.job, hoursPerWeek: 8 } }, { dk, no });
  assert.equal(r.su.eligibility.status, 'notEligible');
  assert.equal(r.su.available, false);
  near(r.su.support.grant, 0);
});
