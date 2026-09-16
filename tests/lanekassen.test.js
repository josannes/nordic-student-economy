// Fictional students. Basic support 2026: 6 months at 15,169 + 5 months at 15,488 = 168,454 NOK.
import { test } from 'node:test';
import { lanekassenYear } from '../src/calc/lanekassen.js';
import { no, near } from './helpers.js';

const FULL_YEAR = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

test('full year, low income: 40 % becomes grant', () => {
  const r = lanekassenYear({ studyMonths: FULL_YEAR, incomeNok: 150000, loan: 'full' }, no);
  near(r.months, 11);
  near(r.basicSupport, 168454);
  near(r.grant, 67381.6);
  near(r.loan, 168454 - 67381.6);
  near(r.headroomNok, 234821 - 150000);
});

test('income above the limit reduces the grant by 5 % per month', () => {
  // (300,000 - 234,821) * 0.05 * 11 = 35,848.45
  const r = lanekassenYear({ studyMonths: FULL_YEAR, incomeNok: 300000, loan: 'full' }, no);
  near(r.grantReduction, 35848.45);
  near(r.grant, 67381.6 - 35848.45);
  near(r.paidOut, 168454);
});

test('7 support months or fewer use the higher limit', () => {
  // August to December: 5 * 15,488 = 77,440, grant 30,976
  const r = lanekassenYear({ studyMonths: [8, 9, 10, 11, 12], incomeNok: 300000, loan: 'full' }, no);
  near(r.incomeLimit, 587053);
  near(r.grantReduction, 0);
  near(r.grant, 30976);
});

test('degree not completed: only the 15 % for credits', () => {
  const r = lanekassenYear({ studyMonths: FULL_YEAR, incomeNok: 150000, loan: 'full', degreeCompleted: false }, no);
  near(r.grant, 25268.1);
});

test('the reduction never takes the grant below zero', () => {
  const r = lanekassenYear({ studyMonths: FULL_YEAR, incomeNok: 1000000, loan: 'full', degreeCompleted: false }, no);
  near(r.grant, 0);
  near(r.loan, 168454);
});

test('convertible part only: 40 % paid out, all of it grant', () => {
  const r = lanekassenYear({ studyMonths: FULL_YEAR, incomeNok: 150000, loan: 'convertibleOnly' }, no);
  near(r.paidOut, 67381.6);
  near(r.loan, 0);
});
