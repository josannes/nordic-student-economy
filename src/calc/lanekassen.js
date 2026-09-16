// Lånekassen support for a full-time degree student in the Nordic region,
// one calendar year. All amounts in NOK.
import { val } from './rates.js';

const SPRING = [1, 2, 3, 4, 5, 6];
const AUTUMN = [8, 9, 10, 11, 12];

/**
 * @param {object} input
 * @param {number[]} input.studyMonths      Months enrolled, 1 to 12. July is never paid.
 * @param {number} input.incomeNok          Gross personal and capital income for the year.
 * @param {'full'|'convertibleOnly'} input.loan  Full basic loan, or only the part that can become grant.
 * @param {boolean} [input.degreeCompleted] Default true.
 * @param {object} no  Parsed data/no/<year>.json
 */
export function lanekassenYear(input, no) {
  const lk = no.rates.lanekassen;
  const degreeCompleted = input.degreeCompleted ?? true;
  const springMonths = input.studyMonths.filter((m) => SPRING.includes(m)).length;
  const autumnMonths = input.studyMonths.filter((m) => AUTUMN.includes(m)).length;
  const months = springMonths + autumnMonths;

  const basicSupport =
    springMonths * val(lk.basicSupportPerMonth2025_2026) + autumnMonths * val(lk.basicSupportPerMonth2026_2027);

  const creditsShare = val(lk.conversionShareCredits);
  const degreeShare = val(lk.conversionShareDegree);
  const paidOut = input.loan === 'convertibleOnly' ? basicSupport * (creditsShare + degreeShare) : basicSupport;

  const grantBeforeIncomeTest = basicSupport * (creditsShare + (degreeCompleted ? degreeShare : 0));
  const incomeLimit = months <= val(lk.shortSupportMaxMonths) ? val(lk.incomeLimitShortSupport) : val(lk.incomeLimit);
  const incomeAboveLimit = Math.max(0, input.incomeNok - incomeLimit);
  const grantReduction = Math.min(incomeAboveLimit * val(lk.grantReductionPerMonth) * months, grantBeforeIncomeTest);
  const grant = grantBeforeIncomeTest - grantReduction;

  return {
    months,
    basicSupport,
    paidOut,
    grantBeforeIncomeTest,
    incomeLimit,
    incomeAboveLimit,
    headroomNok: Math.max(0, incomeLimit - input.incomeNok),
    grantReduction,
    grant,
    loan: paidOut - grant,
  };
}
