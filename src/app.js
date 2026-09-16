// Page wiring: reads the form, runs the calculation, renders the results.
// All calculation lives in src/calc/. This file only formats.
import { compareOptions } from './calc/scenario.js';
import { municipalityNames, val } from './calc/rates.js';

const YEAR = 2026;
const QUICK_MUNICIPALITIES = ['København', 'Frederiksberg', 'Aarhus', 'Odense', 'Aalborg', 'Lyngby-Taarbæk'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ALL_MONTHS = MONTHS.map((_, i) => i + 1);

const form = document.getElementById('form');
const resultsEl = document.getElementById('results');
const state = { municipality: 'København', jobMonths: [...ALL_MONTHS], studyMonths: [...ALL_MONTHS] };
let rates;

// ---------- formatting ----------

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
const money = (n, currency = 'DKK') => `${number.format(Math.round(n))} ${currency}`;
const minus = (n, currency = 'DKK') => (Math.round(n) === 0 ? money(0, currency) : `−${money(n, currency)}`);
const pct = (share) => `${(share * 100).toLocaleString('en-GB', { maximumFractionDigits: 2 })} %`;

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function sourceLink(rate) {
  return `<a class="src" href="${escapeHtml(rate.source)}" target="_blank" rel="noopener" title="${escapeHtml(rate.sourceTitle)}">source</a>`;
}

function line(label, value, { rate, total = false } = {}) {
  const cls = total ? ' class="total"' : '';
  return `<dt${cls}>${label}${rate ? sourceLink(rate) : ''}</dt><dd${cls}>${value}</dd>`;
}

// ---------- form setup ----------

function buildMonthPicker(group) {
  const container = form.querySelector(`[data-group="${group}"]`);
  const grid = container.querySelector('.month-grid');
  grid.innerHTML = MONTHS.map(
    (m, i) => `<button type="button" data-month="${i + 1}" aria-pressed="true">${m}</button>`,
  ).join('');
  const actions = document.createElement('div');
  actions.className = 'month-actions';
  actions.innerHTML = `<button type="button" class="link-button" data-set="all">All year</button>
    <button type="button" class="link-button" data-set="autumn">Aug to Dec</button>
    <button type="button" class="link-button" data-set="none">None</button>`;
  container.appendChild(actions);

  const sync = () => {
    grid.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-pressed', String(state[group].includes(Number(b.dataset.month))));
    });
  };
  grid.addEventListener('click', (e) => {
    const month = Number(e.target.dataset.month);
    if (!month) return;
    state[group] = state[group].includes(month)
      ? state[group].filter((m) => m !== month)
      : [...state[group], month].sort((a, b) => a - b);
    sync();
    update();
  });
  actions.addEventListener('click', (e) => {
    const set = e.target.dataset.set;
    if (!set) return;
    state[group] = set === 'all' ? [...ALL_MONTHS] : set === 'autumn' ? [8, 9, 10, 11, 12] : [];
    sync();
    update();
  });
  sync();
}

function buildMunicipalityPicker(dk) {
  const chips = document.getElementById('municipality-chips');
  chips.innerHTML = QUICK_MUNICIPALITIES.map(
    (name) => `<button type="button" role="radio" data-name="${escapeHtml(name)}">${escapeHtml(name)}</button>`,
  ).join('');
  document.getElementById('municipality-list').innerHTML = municipalityNames(dk)
    .map((name) => `<option value="${escapeHtml(name)}">`)
    .join('');

  const other = form.elements.municipalityOther;
  const sync = () => {
    chips.querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.name === state.municipality)));
  };
  chips.addEventListener('click', (e) => {
    if (!e.target.dataset.name) return;
    state.municipality = e.target.dataset.name;
    other.value = '';
    sync();
    update();
  });
  other.addEventListener('input', () => {
    const typed = other.value.trim().toLowerCase();
    const match = municipalityNames(dk).find((n) => n.toLowerCase() === typed);
    if (match) {
      state.municipality = match;
      sync();
      update();
    }
  });
  sync();
}

function readInput() {
  const f = form.elements;
  const num = (el, fallback = 0) => {
    const n = parseFloat(el.value);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const settled = f.residence.value === 'settled';
  document.getElementById('church-wrap').hidden = !settled;
  f.suLoanCustom.hidden = f.suLoan.value !== 'custom';

  const suMax = val(rates.dk.rates.su.loanMaxPerMonth);
  const suLoan = { none: 0, max: suMax, custom: num(f.suLoanCustom) }[f.suLoan.value];

  return {
    job: {
      hourlyWageDkk: num(f.hourlyWage),
      hoursPerWeek: num(f.hoursPerWeek),
      months: state.jobMonths,
      holidayPayIncluded: f.holidayPayIncluded.checked,
    },
    studyMonths: state.studyMonths,
    otherIncomeNok: num(f.otherIncomeNok),
    municipality: state.municipality,
    churchMember: settled && f.churchMember.checked,
    limitedLiability: !settled,
    hasTaxCard: f.taxCard.value === 'yes',
    nokPerDkk: num(f.nokPerDkk, val(rates.no.rates.exchangeRates.dkkToNok2025)) || val(rates.no.rates.exchangeRates.dkkToNok2025),
    lanekassen: { loan: f.lkLoan.value, degreeCompleted: f.degreeCompleted.checked },
    su: { loanPerMonthDkk: suLoan },
  };
}

// ---------- rendering ----------

function perHourBoxes(option) {
  const show = (v) => (v === null ? 'n/a' : money(v));
  return `<div class="hours">
    <div class="hour-box"><div class="v">${show(option.perHour.average)}</div><div class="k">average per hour of work</div></div>
    <div class="hour-box"><div class="v">${show(option.perHour.marginal)}</div><div class="k">for one more hour</div></div>
  </div>`;
}

function lanekassenCard(r, input) {
  const { dk, no } = rates;
  const lk = no.rates.lanekassen;
  const o = r.lanekassen;
  if (!o.available) {
    return `<article class="card"><h2>Lånekassen</h2><p class="sub">Norwegian student support</p>
      <p>Pick the months you study to see Lånekassen support.</p></article>`;
  }
  const s = o.support;
  return `<article class="card">
    <h2>Lånekassen</h2>
    <p class="sub">Norwegian student support, ${s.months} months in ${YEAR}</p>
    <div class="big">${money(o.totals.cashDkk)}</div>
    <div class="big-sub">≈ ${money(o.totals.cashHome, 'NOK')} to live on in ${YEAR}</div>
    <dl class="lines">
      ${line('Job, after tax', money(o.job.net))}
      ${line('Support paid out', money(s.paidOutDkk), { rate: lk.basicSupportPerMonth2026_2027 })}
      ${line('of which grant', money(s.grantDkk), { rate: input.lanekassen.degreeCompleted ? lk.conversionShareDegree : lk.conversionShareCredits })}
      ${line('of which loan', money(s.loanDkk))}
      ${line('Tax on support in Denmark', money(0), { rate: dk.rates.tax.nordicTreatyStudentArticle })}
    </dl>
    ${perHourBoxes(o)}
  </article>`;
}

function suCard(r) {
  const su = rates.dk.rates.su;
  const o = r.su;
  const e = o.eligibility;
  const badge = {
    eligible: '<span class="badge good">You qualify as a worker</span>',
    borderline: '<span class="badge warn">Borderline: SU decides</span>',
    notEligible: '<span class="badge bad">Not eligible</span>',
  }[e.status];
  const reasons = e.reasons.map((x) => `<p class="note warn">${escapeHtml(x)} ${sourceLink(su.workerMinHoursPerWeek)}</p>`).join('');

  if (!o.available) {
    return `<article class="card"><h2>SU</h2><p class="sub">Danish support as an EU/EEA worker</p>
      ${badge}<div class="notes">${reasons}</div></article>`;
  }
  const s = o.support;
  return `<article class="card">
    <h2>SU</h2>
    <p class="sub">Danish support as an EU/EEA worker, ${s.months} months in ${YEAR}</p>
    ${badge}
    <div class="big">${money(o.totals.cashDkk)}</div>
    <div class="big-sub">≈ ${money(o.totals.cashHome, 'NOK')} to live on in ${YEAR}</div>
    <dl class="lines">
      ${line('Job, after tax', money(o.job.net))}
      ${line('SU grant', money(s.grantDkk), { rate: su.grantAwayFromHomePerMonth })}
      ${line('Tax on SU', minus(s.taxDkk), { rate: rates.dk.rates.tax.bottomTax })}
      ${line('SU loan', money(s.loanDkk), { rate: su.loanMaxPerMonth })}
      ${s.repaymentEstimate > 0 ? line('Repay for earning too much (estimate)', minus(s.repaymentEstimate), { rate: su.earningsLimitMonthWithSu }) : ''}
    </dl>
    ${e.reasons.length ? `<div class="notes" style="margin-top:12px">${reasons}</div>` : ''}
    ${perHourBoxes(o)}
  </article>`;
}

function jobCard(r, input) {
  const tax = rates.dk.rates.tax;
  const lk = r.lanekassen.job;
  const su = r.su.available ? r.su.job : null;
  const b = lk.taxBreakdown;
  const localLabel = input.limitedLiability ? 'Municipal tax (25 %, student rule)' : `Municipal tax, ${escapeHtml(input.municipality)} (${pct(b.municipalRate)})`;
  const noCard = !input.hasTaxCard && lk.gross > 0
    ? `<p class="note warn" style="margin-top:12px">Without a tax card your employer withholds 55 % after AM-bidrag:
        <strong>${money(lk.withheld)}</strong> this year. About <strong>${money(lk.backWithTaxReturn)}</strong> comes back with
        the annual tax statement (årsopgørelse) in spring ${YEAR + 1}. Get a tax card on skat.dk to avoid this.
        ${sourceLink(tax.withholdingNoTaxCard)}</p>`
    : '';
  return `<article class="card">
    <h3>Your job</h3>
    <p class="sub">${number.format(Math.round(lk.hours))} hours in ${YEAR}. Tax with Lånekassen, where the job is your only Danish income.</p>
    <dl class="lines">
      ${line('Wage', money(lk.gross - lk.holidayPay))}
      ${line('Holiday pay (feriepenge)', money(lk.holidayPay), { rate: tax.holidayPay })}
      ${line('Gross income', money(lk.gross), { total: true })}
      ${line('AM-bidrag (8 %)', minus(b.labourMarketContribution), { rate: tax.labourMarketContribution })}
      ${line('State tax (bundskat)', minus(b.bottomTax), { rate: tax.bottomTax })}
      ${line(localLabel, minus(b.municipalTax), { rate: input.limitedLiability ? tax.limitedLiabilityMunicipalRate : tax.municipalities })}
      ${b.churchTax > 0 ? line('Church tax', minus(b.churchTax), { rate: tax.municipalities }) : ''}
      ${line('After tax', money(lk.net), { total: true })}
      ${su ? line('After tax if you take SU', money(su.net)) : ''}
    </dl>
    ${su ? `<p class="hint" style="margin-top:8px">With SU the job pays ${money(su.tax - lk.tax)} more tax, because SU already uses your personal allowance (personfradrag). ${sourceLink(tax.personalAllowance)}</p>` : ''}
    ${noCard}
  </article>`;
}

function limitCard(r, input) {
  const s = r.lanekassen.support;
  if (!r.lanekassen.available) return '';
  const share = Math.min(1, s.incomeNok / s.incomeLimit);
  const over = s.incomeAboveLimit > 0;
  const lk = rates.no.rates.lanekassen;
  const text = over
    ? `Your income is ${money(s.incomeAboveLimit, 'NOK')} over the limit. The grant is reduced by
       <strong>${money(s.grantReduction, 'NOK')}</strong> (5 % of the excess for each of your ${s.months} support months).`
    : `You can earn <strong>${money(s.headroomNok, 'NOK')}</strong> more (≈ ${money(s.headroomNok / input.nokPerDkk)} gross)
       before Lånekassen reduces your grant.`;
  return `<article class="card">
    <h3>Lånekassen income limit</h3>
    <p class="sub">Your gross income ${YEAR}, including holiday pay, converted at ${input.nokPerDkk} NOK per DKK</p>
    <dl class="lines">
      ${line('Your income', money(s.incomeNok, 'NOK'))}
      ${line(s.months <= val(lk.shortSupportMaxMonths) ? 'Limit (7 support months or fewer)' : 'Limit', money(s.incomeLimit, 'NOK'), { rate: lk.incomeLimit })}
    </dl>
    <div class="meter${over ? ' over' : ''}" role="img" aria-label="${Math.round(share * 100)} % of the limit"><span style="width:${share * 100}%"></span></div>
    <p style="margin:8px 0 0;font-size:.92rem">${text} ${sourceLink(lk.grantReductionPerMonth)}</p>
  </article>`;
}

function notes(r, input) {
  const tax = rates.dk.rates.tax;
  const out = [];
  if (input.limitedLiability) {
    out.push(`<p class="note info"><strong>Student rule.</strong> If you moved to Denmark to study and are still tax liable at home,
      you pay 25 % instead of municipal tax and no church tax for your first 365 days. Skattestyrelsen decides case by case.
      ${sourceLink(tax.studentRuleDays)}</p>`);
  }
  if (!input.lanekassen.degreeCompleted) {
    out.push(`<p class="note info">If you don't complete the degree, only 15 % of the basic loan (for passed credits) can become a grant.
      ${sourceLink(rates.no.rates.lanekassen.conversionShareCredits)}</p>`);
  }
  if (r.lanekassen.job.taxBreakdown.aboveMiddleTaxThreshold || r.su.job.taxBreakdown.aboveMiddleTaxThreshold) {
    out.push(`<p class="note warn">Your income is above the mellemskat threshold. This calculator does not include mellemskat, so tax is underestimated.
      ${sourceLink(tax.middleTaxThreshold)}</p>`);
  }
  if (r.su.available && r.su.support.overEarningsLimit > 0) {
    out.push(`<p class="note warn">With SU you earn more than the SU earnings limit (fribeløb). The repayment shown is a rough estimate:
      the real claim can be somewhat lower, and a 7 % surcharge may be added. ${sourceLink(rates.dk.rates.su.earningsLimitMonthWithSu)}</p>`);
  }
  if (r.su.available && r.su.support.months < input.studyMonths.length) {
    out.push('<p class="note info">SU is only counted in months where you both study and work.</p>');
  }
  if (input.job.hoursPerWeek === 0 || input.job.months.length === 0) {
    out.push('<p class="note info">Add your working hours and months to see what the job is worth.</p>');
  }
  return out.join('');
}

function explainer() {
  return `<article class="card">
    <h3>How to read this</h3>
    <p class="hint" style="margin:4px 0 8px"><strong>To live on:</strong> job after tax, plus all support paid out, minus tax on support. Loans are included here but must be paid back.</p>
    <p class="hint" style="margin:0 0 8px"><strong>Average per hour of work:</strong> how much better off the job makes you per hour, after tax and any grant you lose.
      Loans don't count. For SU it assumes you keep SU, even though SU requires the job.</p>
    <p class="hint" style="margin:0"><strong>For one more hour:</strong> what you keep from one extra hour a week. It drops when you pass the personal allowance or Lånekassen's income limit.</p>
  </article>`;
}

function render() {
  const input = readInput();
  const r = compareOptions(input, rates);
  resultsEl.innerHTML = `
    <div class="notes">${notes(r, input)}</div>
    <div class="compare">${lanekassenCard(r, input)}${suCard(r)}</div>
    ${jobCard(r, input)}
    ${limitCard(r, input)}
    ${explainer()}`;
}

function update() {
  if (!rates) return;
  try {
    render();
  } catch (err) {
    resultsEl.innerHTML = `<p class="note warn">Something went wrong: ${escapeHtml(err.message)}</p>`;
    console.error(err);
  }
}

// ---------- sources ----------

function collectRates(node, path = []) {
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return [];
  if ('value' in node) return [{ path, rate: node }];
  return Object.entries(node).flatMap(([k, v]) => collectRates(v, [...path, k]));
}

function formatRate(rate) {
  const v = rate.value;
  if (typeof v === 'boolean') return 'rule';
  if (typeof v === 'number' && rate.unit.startsWith('share')) return pct(v);
  if (typeof v === 'number') return `${number.format(v)} ${rate.unit}`;
  if (v && 'min' in v) return `${v.min} to ${v.max} ${rate.unit}`;
  if (v && typeof v === 'object') return `${Object.keys(v).length} municipalities`;
  return String(v);
}

function renderSources() {
  const rows = [rates.dk, rates.no].flatMap((file) =>
    collectRates(file.rates).map(({ rate }) => `<tr>
      <td>${escapeHtml(rate.appliesTo ?? '')}</td>
      <td class="num">${escapeHtml(formatRate(rate))}</td>
      <td><a href="${escapeHtml(rate.source)}" target="_blank" rel="noopener">${escapeHtml(rate.sourceTitle)}</a></td>
      <td class="num">${escapeHtml(rate.checked)}</td>
    </tr>`),
  );
  document.getElementById('source-list').innerHTML = `<div class="table-scroll"><table class="source-table">
    <thead><tr><th>What</th><th>Value</th><th>Source</th><th>Checked</th></tr></thead>
    <tbody>${rows.join('')}</tbody></table></div>`;
}

// ---------- start ----------

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Could not load ${path}`);
  return res.json();
}

async function start() {
  try {
    const [dk, no] = await Promise.all([loadJson(`data/dk/${YEAR}.json`), loadJson(`data/no/${YEAR}.json`)]);
    rates = { dk, no };
  } catch (err) {
    resultsEl.innerHTML = `<p class="note warn">Could not load the rates. If you opened the file directly, run a local web server
      (for example <code>npm run serve</code>) and open http://localhost:8000.</p>`;
    return;
  }
  const fx = rates.no.rates.exchangeRates.dkkToNok2025;
  form.elements.nokPerDkk.value = val(fx);
  document.getElementById('rate-hint').innerHTML = `Default: Norges Bank average for 2025. ${sourceLink(fx)}`;

  buildMonthPicker('jobMonths');
  buildMonthPicker('studyMonths');
  buildMunicipalityPicker(rates.dk);
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  renderSources();
  update();
}

start();
