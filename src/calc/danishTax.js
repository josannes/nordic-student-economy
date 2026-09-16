// Danish income tax for one calendar year.
// Covers AM-bidrag, bundskat, municipal and church tax, beskæftigelsesfradrag
// and jobfradrag. Mellemskat and higher brackets are flagged, not calculated.
import { val, localTaxRates } from './rates.js';

/**
 * @param {object} input
 * @param {number} input.wageDkk        Gross wage income for the year, including holiday pay.
 * @param {number} [input.suDkk]        SU grant for the year (taxable, no AM-bidrag).
 * @param {string} input.municipality
 * @param {boolean} [input.churchMember]
 * @param {boolean} [input.limitedLiability]  Student rule: first 365 days in Denmark.
 * @param {object} dk  Parsed data/dk/<year>.json
 */
export function danishTax(input, dk) {
  const t = dk.rates.tax;
  const wage = Math.max(0, input.wageDkk ?? 0);
  const su = Math.max(0, input.suDkk ?? 0);
  const { municipalRate, churchRate } = localTaxRates(dk, input);

  const labourMarketContribution = wage * val(t.labourMarketContribution);
  const personalIncome = wage - labourMarketContribution + su;

  // Both deductions are based on the AM-bidrag base, i.e. wages only.
  const employmentDeduction = Math.min(wage * val(t.employmentDeductionRate), val(t.employmentDeductionMax));
  const jobDeduction = Math.min(
    Math.max(0, wage - val(t.jobDeductionThreshold)) * val(t.jobDeductionRate),
    val(t.jobDeductionMax),
  );
  const taxableIncome = Math.max(0, personalIncome - employmentDeduction - jobDeduction);

  // Each tax is reduced by the tax value of the personal allowance. An unused
  // part in one tax reduces the others (personskatteloven § 10, stk. 2).
  const allowance = val(t.personalAllowance);
  const bottomRate = val(t.bottomTax);
  const raw = {
    municipalTax: municipalRate * (taxableIncome - allowance),
    churchTax: churchRate * (taxableIncome - allowance),
    bottomTax: bottomRate * (personalIncome - allowance),
  };
  let unused = -Object.values(raw).filter((x) => x < 0).reduce((a, b) => a + b, 0);
  const taxes = {};
  for (const key of ['municipalTax', 'churchTax', 'bottomTax']) {
    let amount = Math.max(0, raw[key]);
    const used = Math.min(amount, unused);
    amount -= used;
    unused -= used;
    taxes[key] = amount;
  }

  const incomeTax = taxes.bottomTax + taxes.municipalTax + taxes.churchTax;
  return {
    wage,
    su,
    labourMarketContribution,
    personalIncome,
    employmentDeduction,
    jobDeduction,
    taxableIncome,
    municipalRate,
    churchRate,
    ...taxes,
    incomeTax,
    totalTax: labourMarketContribution + incomeTax,
    aboveMiddleTaxThreshold: personalIncome > val(t.middleTaxThreshold),
  };
}

/**
 * What the employer withholds from wages when there is no tax card:
 * AM-bidrag first, then 55 % of the rest with no deductions.
 */
export function withholdingWithoutTaxCard(wageDkk, dk) {
  const t = dk.rates.tax;
  const am = wageDkk * val(t.labourMarketContribution);
  return am + (wageDkk - am) * val(t.withholdingNoTaxCard);
}
