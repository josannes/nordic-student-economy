# Nordic Student Economy

Should you take that student job in Denmark, and what happens to your student support?
A calculator for Norwegian students taking a degree in Denmark. It runs in your browser,
nothing to install.

**[Open the calculator](https://josannes.github.io/nordic-student-economy/)**

## What it answers

- **What does this job actually pay?** Gross pay, holiday pay (feriepenge), labour market
  contribution (AM-bidrag), Danish income tax and what you keep. It also shows how much is
  withheld if you don't have a tax card yet, and how much of that comes back.
- **What happens to my Lånekassen support?** How your income compares to the income limit,
  how much grant you lose, and how much more you can earn before it shrinks.
- **SU or Lånekassen?** A straight answer at the top, then the two side by side for the
  same job: what you keep once the loan is paid back, what lands in your account during
  the year and when it is paid, tax on SU, and whether you qualify for SU as an EU/EEA
  worker.
- **What is an hour of work worth?** Both the average per hour and what you keep from one
  more hour, after tax and any grant you lose.

Everything you type lives in the page address, so "Copy link to this scenario" gives you a
link that opens the same numbers for someone else.

## Who it is for

Norwegian students taking a full degree in Denmark, living away from their parents.
The Danish tax part works for any Nordic citizen. Swedish support (CSN) is in progress.

## This is a calculator, not advice

The numbers are estimates based on public rules for 2026 and a simplified version of your
situation. Your case may be different. Check with Lånekassen, SU and Skattestyrelsen before
you decide anything. Every rate links to its official source and shows the date it was
last checked.

Simplifications worth knowing:

- One job with the same hours every week, and one calendar year (2026).
- Lånekassen: you complete your degree (you can untick this), and you don't live with
  your parents. Wealth, child grants and tuition loans are not included.
- SU: the rate for students living away from home. Worker status needs 10 to 12 hours a
  week in an unbroken stretch of at least 10 weeks while you study, which the calculator
  checks against the months you tick. If you earn more than the SU earnings limit, the
  repayment is a rough estimate.
- Danish tax: mellemskat and higher brackets are not calculated (you get a warning).
  The student rule for your first 365 days in Denmark is included.
- You don't get Lånekassen and SU in the same months. The calculator compares one against
  the other for the whole year.

## Why I built this

As a Norwegian student in Denmark I had to figure all of this out myself: tax cards,
Lånekassen's income limit, and the fact that SU and Lånekassen can't be combined. The
answers were spread across three agencies in two countries, so I put them in one place.

## How it works

A static site with no build step and no tracking. Everything is calculated in your browser,
and the scenario is kept in the URL rather than on a server.

```
index.html, styles.css   the page
src/app.js               reads the form and renders results
src/calc/                pure calculation functions (tax, Lånekassen, SU, comparison)
data/<country>/<year>.json   every rate, with unit, year, source URL and date checked
tests/                   node:test, fictional students with hand-calculated results
```

Run it locally:

```bash
npm run serve   # then open http://localhost:8000
npm test        # needs Node 20 or newer, no dependencies
```

## Updating rates for a new year

1. Copy `data/dk/2026.json` and `data/no/2026.json` to `2027.json`.
2. Check every rate against the linked source, update `value`, `year` and `checked`.
3. Update `YEAR` in `src/app.js` and the expected values in the tests.
4. Run `npm test`. A rate without a source, year or check date fails the tests.

## How it was built

Built with Claude Code. I own the idea, the spec, testing and priorities.
Claude Code writes the code.

## License

MIT
