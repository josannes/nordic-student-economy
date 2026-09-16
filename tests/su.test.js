// Fictional students. SU 2026: grant 7,426/month, loan up to 3,799/month,
// earnings limit 20,749 per SU month.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { suEligibility, suYear } from '../src/calc/su.js';
import { dk, near } from './helpers.js';

const FULL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

test('12 hours a week all year: eligible every month', () => {
  const r = suEligibility({ hoursPerWeek: 12, jobMonths: FULL_YEAR, studyMonths: FULL_YEAR }, dk);
  assert.equal(r.status, 'eligible');
  assert.equal(r.months.length, 12);
});

test('11 hours a week is borderline', () => {
  const r = suEligibility({ hoursPerWeek: 11, jobMonths: FULL_YEAR, studyMonths: FULL_YEAR }, dk);
  assert.equal(r.status, 'borderline');
});

test('8 hours a week is not enough', () => {
  const r = suEligibility({ hoursPerWeek: 8, jobMonths: FULL_YEAR, studyMonths: FULL_YEAR }, dk);
  assert.equal(r.status, 'notEligible');
  assert.deepEqual(r.months, []);
});

test('SU only in months that have both job and studies; two months is under 10 weeks', () => {
  assert.equal(suEligibility({ hoursPerWeek: 12, jobMonths: [9, 10, 11, 12], studyMonths: FULL_YEAR }, dk).months.length, 4);
  assert.equal(suEligibility({ hoursPerWeek: 12, jobMonths: [11, 12], studyMonths: FULL_YEAR }, dk).status, 'notEligible');
});

test('full year with maximum loan', () => {
  const r = suYear({ suMonths: FULL_YEAR, studyMonths: FULL_YEAR, loanPerMonthDkk: 99999, ownIncomeDkk: 90000 }, dk);
  near(r.grant, 89112);
  near(r.loanPerMonth, 3799);
  near(r.loan, 45588);
  near(r.earningsLimit, 248988);
  near(r.repaymentEstimate, 0);
});

test('earnings limit mixes monthly amounts', () => {
  // 4 SU months * 20,749 + 8 study months without SU * 23,598 = 271,780
  const r = suYear({ suMonths: [9, 10, 11, 12], studyMonths: FULL_YEAR, loanPerMonthDkk: 0, ownIncomeDkk: 300000 }, dk);
  near(r.earningsLimit, 271780);
  near(r.overEarningsLimit, 28220);
  // capped at SU received (4 * 7,426 = 29,704), which is more than the excess
  near(r.repaymentEstimate, 28220);
});
