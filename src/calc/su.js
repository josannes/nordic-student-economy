// Danish SU for an EU/EEA citizen who qualifies as a worker, one calendar year.
// All amounts in DKK.
import { val } from './rates.js';
import { WEEKS_PER_MONTH } from './job.js';

/** The longest unbroken stretch of months, in months. [3, 4, 5, 9] is 3, not 4. */
export function longestRun(months) {
  const sorted = [...new Set(months)].sort((a, b) => a - b);
  let best = 0;
  let run = 0;
  let previous = null;
  for (const month of sorted) {
    run = previous !== null && month === previous + 1 ? run + 1 : 1;
    previous = month;
    if (run > best) best = run;
  }
  return best;
}

/**
 * Worker status check. The hours must be met every week, so this is only
 * as good as the hours the user enters.
 * @returns {{status: 'eligible'|'borderline'|'notEligible', reasons: string[], months: number[]}}
 */
export function suEligibility({ hoursPerWeek, jobMonths, studyMonths }, dk) {
  const su = dk.rates.su;
  const { min, max } = val(su.workerMinHoursPerWeek);
  const months = studyMonths.filter((m) => jobMonths.includes(m));
  const reasons = [];
  let status = 'eligible';

  if (hoursPerWeek < min) {
    status = 'notEligible';
    reasons.push(`Requires at least ${min} to ${max} hours of work every week.`);
  } else if (hoursPerWeek < max) {
    status = 'borderline';
    reasons.push(`Between ${min} and ${max} hours per week: SU decides case by case.`);
  }
  // The weeks have to be consecutive, so months scattered over the year do not
  // add up to a qualifying period however many of them there are.
  const minWeeks = val(su.workerMinConsecutiveWeeks);
  const run = longestRun(months);
  if (run * WEEKS_PER_MONTH < minWeeks) {
    status = 'notEligible';
    const stretch =
      run === 0
        ? 'You have no month where you both study and work.'
        : `Your longest unbroken stretch is ${run} ${run === 1 ? 'month' : 'months'}.`;
    reasons.push(`The job must last at least ${minWeeks} weeks in a row while you study. ${stretch}`);
  }
  return { status, reasons, months: status === 'notEligible' ? [] : months };
}

/**
 * @param {object} input
 * @param {number[]} input.suMonths        Months with SU.
 * @param {number[]} input.studyMonths     Months enrolled.
 * @param {number} input.loanPerMonthDkk   Requested SU loan per month, capped at the maximum.
 * @param {number} input.ownIncomeDkk      Income counted against the earnings limit: wages after AM-bidrag.
 */
export function suYear(input, dk) {
  const su = dk.rates.su;
  const n = input.suMonths.length;
  const grant = n * val(su.grantAwayFromHomePerMonth);
  const loanPerMonth = Math.min(Math.max(0, input.loanPerMonthDkk ?? 0), val(su.loanMaxPerMonth));
  const loan = n * loanPerMonth;

  // Yearly earnings limit (fribeløb) is the sum of 12 monthly amounts.
  let earningsLimit = 0;
  for (let m = 1; m <= 12; m++) {
    if (input.suMonths.includes(m)) earningsLimit += val(su.earningsLimitMonthWithSu);
    else if (input.studyMonths.includes(m)) earningsLimit += val(su.earningsLimitMonthEnrolledNoSu);
    else earningsLimit += val(su.earningsLimitMonthNoRight);
  }
  // Simplified: the real claim can be somewhat lower, and a 7 % surcharge may be added.
  const overEarningsLimit = Math.max(0, input.ownIncomeDkk - earningsLimit);
  const repaymentEstimate = Math.min(overEarningsLimit, grant + loan);

  return { months: n, grant, loanPerMonth, loan, paidOut: grant + loan, earningsLimit, overEarningsLimit, repaymentEstimate };
}
