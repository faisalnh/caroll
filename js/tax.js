(function () {
  'use strict';
  const C = globalThis.Caroll = globalThis.Caroll || {};
  const MAX = BigInt(Number.MAX_SAFE_INTEGER);
  const PTKP = new Map([
    ['TK/0', 'A'], ['TK/1', 'A'], ['K/0', 'A'],
    ['TK/2', 'B'], ['TK/3', 'B'], ['K/1', 'B'], ['K/2', 'B'], ['K/3', 'C']
  ]);
  // PP 58/2023 Lampiran A–C: inclusive upper rupiah limits, rates in basis points.
  // null denotes the unbounded final band. See docs/TAX_RULES.md for sources.
  const TER = {
    A: [
      [5400000, 0], [5650000, 25], [5950000, 50], [6300000, 75],
      [6750000, 100], [7500000, 125], [8550000, 150], [9650000, 175],
      [10050000, 200], [10350000, 225], [10700000, 250], [11050000, 300],
      [11600000, 350], [12500000, 400], [13750000, 500], [15100000, 600],
      [16950000, 700], [19750000, 800], [24150000, 900], [26450000, 1000],
      [28000000, 1100], [30050000, 1200], [32400000, 1300], [35400000, 1400],
      [39100000, 1500], [43850000, 1600], [47800000, 1700], [51400000, 1800],
      [56300000, 1900], [62200000, 2000], [68600000, 2100], [77500000, 2200],
      [89000000, 2300], [103000000, 2400], [125000000, 2500], [157000000, 2600],
      [206000000, 2700], [337000000, 2800], [454000000, 2900], [550000000, 3000],
      [695000000, 3100], [910000000, 3200], [1400000000, 3300], [null, 3400]
    ],
    B: [
      [6200000, 0], [6500000, 25], [6850000, 50], [7300000, 75],
      [9200000, 100], [10750000, 150], [11250000, 200], [11600000, 250],
      [12600000, 300], [13600000, 400], [14950000, 500], [16400000, 600],
      [18450000, 700], [21850000, 800], [26000000, 900], [27700000, 1000],
      [29350000, 1100], [31450000, 1200], [33950000, 1300], [37100000, 1400],
      [41100000, 1500], [45800000, 1600], [49500000, 1700], [53800000, 1800],
      [58500000, 1900], [64000000, 2000], [71000000, 2100], [80000000, 2200],
      [93000000, 2300], [109000000, 2400], [129000000, 2500], [163000000, 2600],
      [211000000, 2700], [374000000, 2800], [459000000, 2900], [555000000, 3000],
      [704000000, 3100], [957000000, 3200], [1405000000, 3300], [null, 3400]
    ],
    C: [
      [6600000, 0], [6950000, 25], [7350000, 50], [7800000, 75],
      [8850000, 100], [9800000, 125], [10950000, 150], [11200000, 175],
      [12050000, 200], [12950000, 300], [14150000, 400], [15550000, 500],
      [17050000, 600], [19500000, 700], [22700000, 800], [26600000, 900],
      [28100000, 1000], [30100000, 1100], [32600000, 1200], [35400000, 1300],
      [38900000, 1400], [43000000, 1500], [47400000, 1600], [51200000, 1700],
      [55800000, 1800], [60400000, 1900], [66700000, 2000], [74500000, 2100],
      [83200000, 2200], [95600000, 2300], [110000000, 2400], [134000000, 2500],
      [169000000, 2600], [221000000, 2700], [390000000, 2800], [463000000, 2900],
      [561000000, 3000], [709000000, 3100], [965000000, 3200], [1419000000, 3300],
      [null, 3400]
    ]
  };
  const ARTICLE17 = [
    [60000000n, 5n], [250000000n, 15n], [500000000n, 25n],
    [5000000000n, 30n], [null, 35n]
  ];

  function money(value) {
    if (!(typeof value === 'bigint' ||
      (typeof value === 'number' && Number.isSafeInteger(value)) ||
      (typeof value === 'string' && /^\d+$/.test(value)))) {
      throw new TypeError('gross must be a non-negative safe integer rupiah amount');
    }
    const amount = BigInt(value);
    if (amount < 0n || amount > MAX) throw new RangeError('gross exceeds non-negative safe integer range');
    return amount;
  }

  function input(options) {
    if (!options || typeof options !== 'object' || Array.isArray(options)) {
      throw new TypeError('Tax options are required');
    }
    const { gross, category, ptkp } = options;
    if (!['permanent', 'temporary_monthly', 'non_employee'].includes(category)) {
      throw new RangeError('Unsupported tax category; daily, weekly, and piecework pay cannot use monthly TER');
    }
    if (category !== 'non_employee' && !PTKP.has(ptkp)) {
      throw new RangeError('Unsupported PTKP status');
    }
    return { gross: money(gross), category: category === 'non_employee' ? null : PTKP.get(ptkp) };
  }

  function tax(gross, category) {
    if (category !== null) {
      const [, bps] = TER[category].find(([upper]) => upper === null || gross <= BigInt(upper));
      return { amount: gross * BigInt(bps) / 10000n, rate: bps / 10000,
        method: 'ter_monthly', category };
    }
    // Work in doubled taxable-base units: preserve the half rupiah for odd gross.
    // Sum exact progressive tax numerators, then floor only the final tax amount.
    let previous = 0n, numerator = 0n;
    for (const [upper, percent] of ARTICLE17) {
      const end = upper === null || gross < upper * 2n ? gross : upper * 2n;
      numerator += (end - previous) * percent;
      if (end === gross) break;
      previous = end;
    }
    return { amount: numerator / 200n, rate: null, method: 'article17_50', category: null };
  }

  function result(value) {
    return { ...value, amount: Number(value.amount) };
  }

  C.tax = Object.freeze({
    calculate(options) {
      const { gross, category } = input(options);
      return result(tax(gross, category));
    },
    grossUp(options) {
      const { gross, category } = input(options);
      let allowance = 0n;
      // Starting at zero selects the least fixed point even across TER jumps.
      // Each band has slope <= .34 (.175 for Article 17 on half gross).
      // 4096 is a defensive cap, not a tolerance: only exact equality succeeds.
      for (let iteration = 0; iteration < 4096; iteration++) {
        if (gross + allowance > MAX) throw new RangeError('Gross-up exceeds safe integer range');
        const next = tax(gross + allowance, category);
        if (next.amount === allowance) return { ...result(next), allowance: Number(allowance) };
        if (next.amount < allowance) throw new RangeError('Gross-up lost monotonicity');
        allowance = next.amount;
      }
      throw new RangeError('Gross-up did not converge to an exact integer allowance');
    }
  });
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
}());
