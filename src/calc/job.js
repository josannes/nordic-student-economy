// A part-time job over a calendar year.
import { val } from './rates.js';

export const WEEKS_PER_MONTH = 52 / 12;

/**
 * @param {object} job
 * @param {number} job.hourlyWageDkk
 * @param {number} job.hoursPerWeek
 * @param {number[]} job.months  Months worked, 1 to 12.
 * @param {boolean} [job.holidayPayIncluded]  True if the hourly wage already includes holiday pay.
 */
export function jobIncome(job, dk) {
  const weeks = job.months.length * WEEKS_PER_MONTH;
  const hours = job.hoursPerWeek * weeks;
  const holidayRate = val(dk.rates.tax.holidayPay);
  const base = job.hourlyWageDkk * hours;
  const gross = job.holidayPayIncluded ? base : base * (1 + holidayRate);
  const holidayPay = gross - gross / (1 + holidayRate);
  return { weeks, hours, gross, holidayPay };
}
