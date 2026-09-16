// Helpers for reading rates from data/<country>/<year>.json.
// Calculations take the parsed JSON as an argument, so they run the same
// in the browser and in tests.

/** Returns the value of a rate object, failing loudly if it is missing. */
export function val(rate) {
  if (rate === undefined || rate === null || !('value' in rate)) {
    throw new Error('Missing rate');
  }
  return rate.value;
}

export function municipalityNames(dk) {
  return Object.keys(val(dk.rates.tax.municipalities)).sort((a, b) => a.localeCompare(b, 'da'));
}

/**
 * Municipal and church tax rates for a person.
 * Under limited tax liability (the student rule) a flat rate replaces
 * municipal tax and no church tax is paid.
 */
export function localTaxRates(dk, { municipality, churchMember = false, limitedLiability = false }) {
  if (limitedLiability) {
    return { municipalRate: val(dk.rates.tax.limitedLiabilityMunicipalRate), churchRate: 0 };
  }
  const row = val(dk.rates.tax.municipalities)[municipality];
  if (!row) throw new Error(`Unknown municipality: ${municipality}`);
  return { municipalRate: row.municipalTax, churchRate: churchMember ? row.churchTax : 0 };
}
