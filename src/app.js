// Page wiring: reads the form, runs the calculation, renders the results.
// All calculation lives in src/calc/. This file only formats.
import { compareOptions } from './calc/scenario.js';
import { municipalityNames, val } from './calc/rates.js';

const YEAR = 2026;
const QUICK_MUNICIPALITIES = ['København', 'Frederiksberg', 'Aarhus', 'Odense', 'Aalborg', 'Lyngby-Taarbæk'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ALL_MONTHS = MONTHS.map((_, i) => i + 1);
const DEFAULT_MUNICIPALITY = 'København';
// Above this, working beside a full-time degree is worth a word of caution.
const LONG_WEEK_HOURS = 20;

const form = document.getElementById('form');
const resultsEl = document.getElementById('results');
const state = {
  municipality: DEFAULT_MUNICIPALITY,
  // The last municipality picked with a chip, to fall back on when the text field is cleared.
  chipMunicipality: DEFAULT_MUNICIPALITY,
  municipalityMessage: '',
  jobMonths: [...ALL_MONTHS],
  studyMonths: [...ALL_MONTHS],
};
const pickerSyncers = [];
let rates;

// ---------- formatting ----------

const number = new Intl.NumberFormat('en-GB', { maximumFractionDigits: 0 });
// One minus sign everywhere, the typographic one, never the hyphen Intl would give us.
const money = (n, currency = 'DKK') => {
  const rounded = Math.round(n);
  return `${rounded < 0 ? '−' : ''}${number.format(Math.abs(rounded))} ${currency}`;
};
// A positive amount shown as a deduction.
const minus = (n, currency = 'DKK') => (Math.round(n) === 0 ? money(0, currency) : `−${money(Math.abs(n), currency)}`);
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

// ---------- the scenario in the URL ----------

// Short keys keep the link short enough to paste into a message.
const monthsToCode = (months) => (months.length ? months.map((m) => m.toString(36)).join('') : '-');
const codeToMonths = (code) =>
  [...code]
    .map((c) => parseInt(c, 36))
    .filter((m) => m >= 1 && m <= 12)
    .sort((a, b) => a - b);

function scenarioParams() {
  const f = form.elements;
  const p = new URLSearchParams();
  const put = (key, value, fallback) => {
    if (String(value) !== String(fallback)) p.set(key, value);
  };
  put('w', f.hourlyWage.value, '140');
  put('h', f.hoursPerWeek.value, '12');
  put('hp', f.holidayPayIncluded.checked ? '1' : '0', '0');
  put('jm', monthsToCode(state.jobMonths), monthsToCode(ALL_MONTHS));
  put('sm', monthsToCode(state.studyMonths), monthsToCode(ALL_MONTHS));
  put('deg', f.degreeCompleted.checked ? '1' : '0', '1');
  put('mun', state.municipality, DEFAULT_MUNICIPALITY);
  put('res', f.residence.value, 'new');
  put('ch', f.churchMember.checked ? '1' : '0', '0');
  put('tc', f.taxCard.value, 'yes');
  put('lkl', f.lkLoan.value, 'full');
  put('sul', f.suLoan.value, 'none');
  put('sulc', f.suLoanCustom.value, '2000');
  put('oi', f.otherIncomeNok.value, '0');
  put('fx', f.nokPerDkk.value, String(val(rates.no.rates.exchangeRates.dkkToNok2025)));
  return p;
}

function writeUrl() {
  const query = scenarioParams().toString();
  // replaceState, so typing in a field does not fill the back button with history.
  history.replaceState(null, '', query ? `#${query}` : location.pathname);
}

function readUrl(dk) {
  const p = new URLSearchParams(location.hash.slice(1));
  if ([...p].length === 0) return;
  const f = form.elements;
  const text = (key, el) => {
    if (p.has(key)) el.value = p.get(key);
  };
  const check = (key, el) => {
    if (p.has(key)) el.checked = p.get(key) === '1';
  };
  const choice = (key, group, allowed) => {
    if (p.has(key) && allowed.includes(p.get(key))) group.value = p.get(key);
  };
  text('w', f.hourlyWage);
  text('h', f.hoursPerWeek);
  check('hp', f.holidayPayIncluded);
  check('deg', f.degreeCompleted);
  check('ch', f.churchMember);
  choice('res', f.residence, ['new', 'settled']);
  choice('tc', f.taxCard, ['yes', 'no']);
  choice('lkl', f.lkLoan, ['full', 'convertibleOnly']);
  choice('sul', f.suLoan, ['none', 'max', 'custom']);
  text('sulc', f.suLoanCustom);
  text('oi', f.otherIncomeNok);
  text('fx', f.nokPerDkk);
  if (p.has('jm')) state.jobMonths = codeToMonths(p.get('jm'));
  if (p.has('sm')) state.studyMonths = codeToMonths(p.get('sm'));
  if (p.has('mun')) {
    const match = municipalityNames(dk).find((n) => n === p.get('mun'));
    if (match) {
      state.municipality = match;
      state.chipMunicipality = match;
      if (!QUICK_MUNICIPALITIES.includes(match)) f.municipalityOther.value = match;
    }
  }
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
  pickerSyncers.push(sync);
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
  const buttons = [...chips.querySelectorAll('button')];
  const sync = () => {
    let anySelected = false;
    buttons.forEach((b) => {
      const selected = b.dataset.name === state.municipality;
      anySelected = anySelected || selected;
      b.setAttribute('aria-checked', String(selected));
      // Roving tabindex: one stop for the whole group, as a radio group should be.
      b.tabIndex = selected ? 0 : -1;
    });
    if (!anySelected) buttons[0].tabIndex = 0;
  };
  const pickChip = (button) => {
    state.municipality = button.dataset.name;
    state.chipMunicipality = button.dataset.name;
    state.municipalityMessage = '';
    other.value = '';
    other.removeAttribute('aria-invalid');
    sync();
    update();
  };

  chips.addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button) pickChip(button);
  });
  chips.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const here = buttons.indexOf(document.activeElement);
    const next = buttons[(Math.max(here, 0) + step + buttons.length) % buttons.length];
    next.focus();
    pickChip(next);
  });

  pickerSyncers.push(sync);
  other.addEventListener('input', () => {
    const typed = other.value.trim();
    if (typed === '') {
      state.municipality = state.chipMunicipality;
      state.municipalityMessage = '';
      other.removeAttribute('aria-invalid');
    } else {
      const match = municipalityNames(dk).find((n) => n.toLowerCase() === typed.toLowerCase());
      if (match) {
        state.municipality = match;
        state.municipalityMessage = `Using ${match}.`;
        other.removeAttribute('aria-invalid');
      } else {
        // Say so, instead of quietly going on with the old municipality.
        state.municipalityMessage = `No municipality called “${typed}”. Still using ${state.municipality}.`;
        other.setAttribute('aria-invalid', 'true');
      }
    }
    sync();
  });
  sync();
}

// ---------- number fields ----------

const NUMBER_FIELDS = {
  hourlyWage: 'Hourly wage',
  hoursPerWeek: 'Hours per week',
  suLoanCustom: 'SU loan per month',
  otherIncomeNok: 'Other income',
  nokPerDkk: 'Exchange rate',
};

function buildFieldErrors() {
  for (const name of Object.keys(NUMBER_FIELDS)) {
    const el = form.elements[name];
    const p = document.createElement('p');
    p.className = 'field-error';
    p.id = `error-${name}`;
    p.hidden = true;
    (el.closest('label') ?? el).insertAdjacentElement('afterend', p);
    el.setAttribute('aria-describedby', p.id);
  }
}

/** @returns {string[]} one message per field that cannot be used as typed. */
function checkNumberFields() {
  const problems = [];
  for (const [name, label] of Object.entries(NUMBER_FIELDS)) {
    const el = form.elements[name];
    const note = document.getElementById(`error-${name}`);
    const raw = el.value.trim();
    const min = el.min === '' ? null : Number(el.min);
    const max = el.max === '' ? null : Number(el.max);
    const n = Number(raw);
    let message = '';
    if (raw === '') {
      message = name === 'nokPerDkk' ? 'Empty, so the default rate is used.' : 'Empty, so this counts as 0.';
    } else if (!Number.isFinite(n)) {
      message = 'Not a number.';
    } else if (min !== null && n < min) {
      message = `Must be ${min} or more. Counted as ${name === 'nokPerDkk' ? 'the default rate' : '0'}.`;
    } else if (max !== null && n > max) {
      message = `Must be ${max} or less. Counted as ${max}.`;
    }
    note.textContent = message;
    note.hidden = message === '';
    el.classList.toggle('invalid', message !== '');
    if (message === '') el.removeAttribute('aria-invalid');
    else el.setAttribute('aria-invalid', 'true');
    if (message !== '') problems.push(`${label}: ${message}`);
  }
  return problems;
}

function syncFormVisibility() {
  const f = form.elements;
  const settled = f.residence.value === 'settled';
  document.getElementById('church-wrap').hidden = !settled;
  document.getElementById('su-loan-custom-wrap').hidden = f.suLoan.value !== 'custom';
  // Under the student rule the tax is a flat 25 %, so the municipality changes nothing.
  const wrap = document.getElementById('municipality-wrap');
  wrap.classList.toggle('inactive', !settled);
  const inactiveNote = settled ? '' : 'Not used under the student rule: municipal tax is a flat 25 %.';
  document.getElementById('municipality-status').textContent = [inactiveNote, state.municipalityMessage]
    .filter(Boolean)
    .join(' ');
}

function readInput() {
  const f = form.elements;
  const num = (el, fallback = 0) => {
    const n = parseFloat(el.value);
    const min = el.min === '' ? 0 : Number(el.min);
    const max = el.max === '' ? null : Number(el.max);
    if (!Number.isFinite(n) || n < min) return fallback;
    return max !== null && n > max ? max : n;
  };
  const settled = f.residence.value === 'settled';
  const suMax = val(rates.dk.rates.su.loanMaxPerMonth);
  const suLoan = { none: 0, max: suMax, custom: num(f.suLoanCustom) }[f.suLoan.value];
  const defaultRate = val(rates.no.rates.exchangeRates.dkkToNok2025);

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
    nokPerDkk: num(f.nokPerDkk, defaultRate) || defaultRate,
    lanekassen: { loan: f.lkLoan.value, degreeCompleted: f.degreeCompleted.checked },
    su: { loanPerMonthDkk: suLoan },
  };
}

// ---------- rendering ----------

function perHourBoxes(option) {
  // With no wage or no hours there is nothing to divide, in either box.
  const hasJob = option.job.gross > 0;
  const show = (v) => (!hasJob || v === null ? 'n/a' : money(v));
  return `<div class="hours">
    <div class="hour-box"><div class="v">${show(option.perHour.average)}</div><div class="k">average per hour of work</div></div>
    <div class="hour-box"><div class="v">${show(option.perHour.marginal)}</div><div class="k">for one more hour</div></div>
  </div>`;
}

// The last rows of both comparison cards. Identical in both, so the two cards
// line up and the tax card choice shows in the same place in each.
function totalsTail(o) {
  const t = o.totals;
  return `
    ${line('What you keep', money(t.keepDkk), { total: true })}
    ${line('Loan on top, paid back later', money(t.loanDkk))}
    ${line(`Into your account in ${YEAR}`, money(t.cashThisYearDkk))}
    ${
      Math.round(t.refundNextYearDkk) > 0
        ? line(`Back with the tax statement, spring ${YEAR + 1}`, money(t.refundNextYearDkk), {
            rate: rates.dk.rates.tax.withholdingNoTaxCard,
          })
        : ''
    }`;
}

function lanekassenCard(r, input) {
  const { dk, no } = rates;
  const lk = no.rates.lanekassen;
  const o = r.lanekassen;
  if (!o.available) {
    return `<article class="card"><h2>Lånekassen</h2>
      <span class="badge neutral">No hours requirement</span>
      <p class="sub">Norwegian student support</p>
      <p>Pick the months you study to see Lånekassen support.</p></article>`;
  }
  const s = o.support;
  const july = input.studyMonths.includes(7)
    ? ` July is never paid, so ${input.studyMonths.length} months of study give ${s.months} months of support.`
    : '';
  return `<article class="card">
    <h2>Lånekassen</h2>
    <span class="badge neutral">No hours requirement</span>
    <div class="big">${money(o.totals.keepDkk)}</div>
    <div class="big-sub">≈ ${money(o.totals.keepHome, 'NOK')} you keep in ${YEAR}</div>
    <p class="sub">Norwegian student support, ${s.months} months in ${YEAR}.</p>
    <dl class="lines">
      ${line('Job, after tax', money(o.job.net))}
      ${line(
        input.lanekassen.degreeCompleted ? 'Grant when you finish' : 'Grant for passed credits',
        money(s.grantDkk),
        { rate: input.lanekassen.degreeCompleted ? lk.conversionShareDegree : lk.conversionShareCredits },
      )}
      ${line('Danish tax on support', money(0), { rate: dk.rates.tax.nordicTreatyStudentArticle })}
      ${totalsTail(o)}
    </dl>
    <p class="hint card-foot">Studying abroad, the support comes in two instalments, not monthly: one in June or July
      and one in December. ${sourceLink(lk.payoutAbroad)}${july}</p>
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
    return `<article class="card"><h2>SU</h2>
      ${badge}
      <p class="sub">Danish support as an EU/EEA worker</p>
      <div class="notes">${reasons}</div></article>`;
  }
  const s = o.support;
  return `<article class="card">
    <h2>SU</h2>
    ${badge}
    <div class="big">${money(o.totals.keepDkk)}</div>
    <div class="big-sub">≈ ${money(o.totals.keepHome, 'NOK')} you keep in ${YEAR}</div>
    <p class="sub">Danish support as an EU/EEA worker, ${s.months} months in ${YEAR}.</p>
    <dl class="lines">
      ${line('Job, after tax', money(o.job.net))}
      ${line('SU grant', money(s.grantDkk), { rate: su.grantAwayFromHomePerMonth })}
      ${line('Tax on SU', minus(s.taxDkk), { rate: rates.dk.rates.tax.bottomTax })}
      ${s.repaymentEstimate > 0 ? line('Repay for earning too much (estimate)', minus(s.repaymentEstimate), { rate: su.earningsLimitMonthWithSu }) : ''}
      ${totalsTail(o)}
    </dl>
    <p class="hint card-foot">SU is paid every month, normally on the last weekday of the month before.
      ${sourceLink(su.payoutSchedule)}</p>
    ${e.reasons.length ? `<div class="notes" style="margin-top:12px">${reasons}</div>` : ''}
    ${perHourBoxes(o)}
  </article>`;
}

// The answer to the question the page asks in its title. Everything below is the
// working behind it.
function verdictCard(r) {
  const lk = r.lanekassen;
  const su = r.su;
  const cannotCombine = `<p class="note info" style="margin-top:12px">You cannot have both. Lånekassen pays nothing for the
    months you get support from another Nordic country, and those months are deducted from your maximum time with Lånekassen.
    ${sourceLink(rates.no.rates.lanekassen.nordicSupportExcluded)}</p>`;

  if (!lk.available && !su.available) {
    return `<article class="card verdict"><h2>Nothing to compare yet</h2>
      <p class="sub">Pick the months you study, and the job you are considering, to see which support leaves you with most.</p>
    </article>`;
  }
  if (!su.available) {
    const why = su.eligibility.reasons.length
      ? ` SU would need you to qualify as a worker: ${escapeHtml(su.eligibility.reasons.join(' '))}`
      : '';
    return `<article class="card verdict"><h2>Lånekassen is your only option here</h2>
      <p>You keep <strong>${money(lk.totals.keepDkk)}</strong> in ${YEAR}, with ${money(lk.totals.loanDkk)} on top as loan.${why}</p>
      ${cannotCombine}</article>`;
  }
  if (!lk.available) {
    return `<article class="card verdict"><h2>SU is your only option here</h2>
      <p>You keep <strong>${money(su.totals.keepDkk)}</strong> in ${YEAR}. Lånekassen pays nothing for the months you picked.</p>
      ${cannotCombine}</article>`;
  }

  const diff = su.totals.keepDkk - lk.totals.keepDkk;
  const winner = diff >= 0 ? su : lk;
  const loser = diff >= 0 ? lk : su;
  const winnerName = diff >= 0 ? 'SU' : 'Lånekassen';
  const loserName = diff >= 0 ? 'Lånekassen' : 'SU';
  const close = Math.abs(diff) < 2000;
  const heading = close
    ? 'The two are close this year'
    : `${winnerName} leaves you with ${money(Math.abs(diff))} more`;
  // Compare what actually lands in the account this year, which is lower than the
  // full-year figure when the employer withholds without a tax card.
  const cashDiff = loser.totals.cashThisYearDkk - winner.totals.cashThisYearDkk;
  const cashSentence =
    cashDiff > 0
      ? `${loserName} puts ${money(cashDiff)} more into your account during ${YEAR}, but ${money(loser.totals.loanDkk)} of that is loan.`
      : `${winnerName} also pays out more during ${YEAR}.`;
  return `<article class="card verdict">
    <h2>${heading}</h2>
    <p>Counting only money you do not pay back, you keep <strong>${money(su.totals.keepDkk)}</strong> with SU against
      <strong>${money(lk.totals.keepDkk)}</strong> with Lånekassen. ${cashSentence}</p>
    ${cannotCombine}
  </article>`;
}

function jobCard(r, input) {
  const tax = rates.dk.rates.tax;
  const lk = r.lanekassen.job;
  // Nothing but a column of zeros to show when there is no job yet.
  if (lk.gross <= 0) return '';
  const su = r.su.available ? r.su.job : null;
  const b = lk.taxBreakdown;
  const localLabel = input.limitedLiability ? 'Municipal tax (25 %, student rule)' : `Municipal tax, ${escapeHtml(input.municipality)} (${pct(b.municipalRate)})`;
  const noCard = !input.hasTaxCard
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
  // Without support, or without income, the meter has nothing to say.
  if (!r.lanekassen.available || s.incomeNok <= 0) return '';
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

function notes(r, input, problems) {
  const tax = rates.dk.rates.tax;
  const out = [];
  if (problems.length) {
    out.push(`<p class="note warn"><strong>Check what you typed.</strong> ${escapeHtml(problems.join(' '))}</p>`);
  }
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
  if (input.job.hoursPerWeek > LONG_WEEK_HOURS && input.studyMonths.length > 0) {
    out.push(`<p class="note warn">That is ${input.job.hoursPerWeek} hours a week beside a full-time degree, every week you work.
      The calculator takes the number as given, but both Lånekassen and SU expect you to keep up with your studies.</p>`);
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
    <p class="hint" style="margin:4px 0 8px"><strong>What you keep:</strong> job after tax, plus the grant after tax, minus anything you have to repay. Loans are not in this number, because you pay them back.</p>
    <p class="hint" style="margin:0 0 8px"><strong>Into your account:</strong> the same, plus the loan, minus any tax your employer withholds beyond what you owe. Without a tax card that difference comes back the following spring.</p>
    <p class="hint" style="margin:0 0 8px"><strong>Average per hour of work:</strong> how much better off the job makes you per hour, after tax and any grant you lose.
      Loans don't count. For SU it assumes you keep SU, even though SU requires the job.</p>
    <p class="hint" style="margin:0 0 8px"><strong>For one more hour:</strong> what you keep from one extra hour a week. It drops when you pass the personal allowance or Lånekassen's income limit.</p>
    <p class="hint" style="margin:0">The same hours every week, in every month you tick. A summer with longer weeks is not something the calculator can take yet.</p>
  </article>`;
}

/** Fills the bar at the bottom of a narrow screen and returns the same thing as plain text. */
function stickySummary(r) {
  const el = document.getElementById('sticky-summary');
  const parts = [];
  if (r.lanekassen.available) parts.push(['Lånekassen', r.lanekassen.totals.keepDkk]);
  if (r.su.available) parts.push(['SU', r.su.totals.keepDkk]);
  if (!parts.length) {
    el.hidden = true;
    return '';
  }
  el.hidden = false;
  // The currency once at the end, to keep the bar on one line on a phone.
  el.innerHTML = `<span class="sticky-keep">Keep: ${parts
    .map(([name, amount]) => `${name} <strong>${number.format(Math.round(amount))}</strong>`)
    .join(' · ')} DKK</span><span class="sticky-more">Details</span>`;
  return `You keep ${parts.map(([name, amount]) => `${money(amount)} with ${name}`).join(', ')}.`;
}

let announceTimer;
function announce(text) {
  // One short sentence, well after the typing stops, instead of re-reading the
  // whole results on every keystroke.
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => {
    document.getElementById('result-summary').textContent = text;
  }, 900);
}

function render() {
  syncFormVisibility();
  const problems = checkNumberFields();
  const input = readInput();
  const r = compareOptions(input, rates);
  resultsEl.innerHTML = `
    ${verdictCard(r)}
    <div class="notes">${notes(r, input, problems)}</div>
    <div class="compare">${lanekassenCard(r, input)}${suCard(r)}</div>
    ${jobCard(r, input)}
    ${limitCard(r, input)}
    ${explainer()}`;
  const summary = stickySummary(r);
  announce(`${resultsEl.querySelector('.verdict h2').textContent}. ${summary}`);
  writeUrl();
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

// ---------- share and reset ----------

function setActionStatus(text) {
  const el = document.getElementById('action-status');
  el.textContent = text;
  clearTimeout(setActionStatus.timer);
  setActionStatus.timer = setTimeout(() => {
    el.textContent = '';
  }, 4000);
}

/** The clipboard API needs focus and permission, so fall back to a hidden field. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    field.remove();
    return copied;
  }
}

function buildActions() {
  document.getElementById('copy-link').addEventListener('click', async () => {
    writeUrl();
    if (await copyText(location.href)) setActionStatus('Link copied. It carries every number on this page.');
    else setActionStatus('Could not copy. Copy the address bar instead.');
  });
  // The id must not clash with a form control name: an element called "reset"
  // inside the form would shadow form.reset().
  document.getElementById('reset-scenario').addEventListener('click', () => {
    form.reset();
    form.elements.nokPerDkk.value = val(rates.no.rates.exchangeRates.dkkToNok2025);
    form.elements.municipalityOther.value = '';
    state.municipality = DEFAULT_MUNICIPALITY;
    state.chipMunicipality = DEFAULT_MUNICIPALITY;
    state.municipalityMessage = '';
    state.jobMonths = [...ALL_MONTHS];
    state.studyMonths = [...ALL_MONTHS];
    form.elements.municipalityOther.removeAttribute('aria-invalid');
    pickerSyncers.forEach((sync) => sync());
    history.replaceState(null, '', location.pathname);
    update();
    setActionStatus('Back to the starting numbers.');
  });
}

// On a narrow screen the form is long, so keep the two totals in sight while
// scrolling through it, and get out of the way once the results are on screen.
function watchResultsVisibility() {
  const bar = document.getElementById('sticky-summary');
  if (!('IntersectionObserver' in window)) return;
  new IntersectionObserver(
    ([entry]) => bar.classList.toggle('out-of-the-way', entry.isIntersecting),
    { threshold: 0.08 },
  ).observe(resultsEl);
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
  const lk = rates.no.rates.lanekassen;
  document.getElementById('convertible-share').textContent = pct(val(lk.conversionShareCredits) + val(lk.conversionShareDegree));

  readUrl(rates.dk);
  buildMonthPicker('jobMonths');
  buildMonthPicker('studyMonths');
  buildMunicipalityPicker(rates.dk);
  buildFieldErrors();
  buildActions();
  watchResultsVisibility();
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', (e) => e.preventDefault());
  window.addEventListener('hashchange', () => location.reload());
  renderSources();
  update();
}

start();
