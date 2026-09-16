// Danish SU for an EU/EEA citizen who qualifies as a worker, one calendar year.
// All amounts in DKK.
import { val } from './rates.js';
import { WEEKS_PER_MONTH } from './job.js';

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
  if (months.length * WEEKS_PER_MONTH < val(su.workerMinConsecutiveWeeks)) {
    status = 'notEligible';
    reasons.push(`The job must last at least ${val(su.workerMinConsecutiveWeeks)} weeks in a row while you study.`);
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
