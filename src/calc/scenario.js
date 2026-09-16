// Puts the pieces together: the same job and studies under two kinds of support,
// home-country support (Lånekassen) and Danish SU as an EU/EEA worker.
import { danishTax, withholdingWithoutTaxCard } from './danishTax.js';
import { jobIncome } from './job.js';
import { lanekassenYear } from './lanekassen.js';
import { suEligibility, suYear } from './su.js';

/**
 * @typedef {object} ScenarioInput
 * @property {{hourlyWageDkk: number, hoursPerWeek: number, months: number[], holidayPayIncluded?: boolean}} job
 * @property {number[]} studyMonths
 * @property {number} [otherIncomeNok]   Other income this year, counted by Lånekassen, not taxed in Denmark.
 * @property {string} municipality
 * @property {boolean} [churchMember]
 * @property {boolean} [limitedLiability] Student rule: less than 365 days in Denmark.
 * @property {boolean} [hasTaxCard]
 * @property {number} nokPerDkk
 * @property {{loan: 'full'|'convertibleOnly', degreeCompleted?: boolean}} lanekassen
 * @property {{loanPerMonthDkk: number}} su
 */

function taxFor(input, wageDkk, suDkk, dk) {
  return danishTax(
    {
      wageDkk,
      suDkk,
      municipality: input.municipality,
      churchMember: input.churchMember,
      limitedLiability: input.limitedLiability,
    },
    dk,
  );
}

function jobPart(input, hoursPerWeek, suDkk, dk) {
  const job = jobIncome({ ...input.job, hoursPerWeek }, dk);
  const withJob = taxFor(input, job.gross, suDkk, dk);
  const withoutJob = taxFor(input, 0, suDkk, dk);
  // Tax the job causes, given the other income. With SU this is higher,
  // because SU already uses up the personal allowance.
  const tax = withJob.totalTax - withoutJob.totalTax;
  const withheld = input.hasTaxCard ? tax : withholdingWithoutTaxCard(job.gross, dk);
  return {
    ...job,
    taxBreakdown: withJob,
    tax,
    net: job.gross - tax,
    withheld,
    backWithTaxReturn: withheld - tax,
    supportTax: withoutJob.totalTax,
  };
}

function lanekassenOption(input, hoursPerWeek, dk, no) {
  const job = jobPart(input, hoursPerWeek, 0, dk);
  const incomeNok = job.gross * input.nokPerDkk + (input.otherIncomeNok ?? 0);
  const lk = lanekassenYear({ studyMonths: input.studyMonths, incomeNok, ...input.lanekassen }, no);
  const toDkk = (nok) => nok / input.nokPerDkk;
  return {
    available: lk.months > 0,
    job,
    support: {
      ...lk,
      incomeNok,
      paidOutDkk: toDkk(lk.paidOut),
      grantDkk: toDkk(lk.grant),
      loanDkk: toDkk(lk.loan),
      taxDkk: 0,
    },
    value: job.net + toDkk(lk.grant),
  };
}

function suOption(input, hoursPerWeek, suMonths, dk) {
  const probe = suYear({ suMonths, studyMonths: input.studyMonths, loanPerMonthDkk: input.su.loanPerMonthDkk, ownIncomeDkk: 0 }, dk);
  const job = jobPart(input, hoursPerWeek, probe.grant, dk);
  const ownIncomeDkk = job.gross - job.taxBreakdown.labourMarketContribution;
  const su = suYear({ suMonths, studyMonths: input.studyMonths, loanPerMonthDkk: input.su.loanPerMonthDkk, ownIncomeDkk }, dk);
  const taxDkk = job.supportTax;
  return {
    available: su.months > 0,
    job,
    support: {
      ...su,
      paidOutDkk: su.paidOut,
      grantDkk: su.grant,
      loanDkk: su.loan,
      taxDkk,
      grantAfterTaxDkk: su.grant - taxDkk,
    },
    value: job.net + su.grant - taxDkk - su.repaymentEstimate,
  };
}

function totals(option, input) {
  const s = option.support;
  const cashDkk = option.job.net + s.paidOutDkk - s.taxDkk - (s.repaymentEstimate ?? 0);
  return {
    cashDkk,
    cashHome: cashDkk * input.nokPerDkk,
    grantAfterTaxDkk: s.grantDkk - s.taxDkk - (s.repaymentEstimate ?? 0),
    loanDkk: s.loanDkk,
  };
}

function perHour(build, input, option) {
  const { hoursPerWeek } = input.job;
  const hours = option.job.hours;
  const noJob = build(0);
  const oneMore = build(hoursPerWeek + 1);
  return {
    // How much better off the job makes you per hour, after tax and lost grant.
    average: hours > 0 ? (option.value - noJob.value) / hours : null,
    // What one more hour a week adds, per hour, keeping SU eligibility as it is.
    marginal: option.job.weeks > 0 ? (oneMore.value - option.value) / option.job.weeks : null,
  };
}

/** @param {ScenarioInput} input */
export function compareOptions(input, { dk, no }) {
  const lkBuild = (h) => lanekassenOption(input, h, dk, no);
  const lanekassen = lkBuild(input.job.hoursPerWeek);

  const eligibility = suEligibility(
    { hoursPerWeek: input.job.hoursPerWeek, jobMonths: input.job.months, studyMonths: input.studyMonths },
    dk,
  );
  const suBuild = (h) => suOption(input, h, eligibility.months, dk);
  const su = suBuild(input.job.hoursPerWeek);

  return {
    lanekassen: { ...lanekassen, totals: totals(lanekassen, input), perHour: perHour(lkBuild, input, lanekassen) },
    su: {
      ...su,
      eligibility,
      totals: totals(su, input),
      perHour: perHour(suBuild, input, su),
    },
  };
}
