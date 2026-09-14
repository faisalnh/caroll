'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const C = require('../js/tax.js');

// Independent transcription of PP 58/2023 Lampiran A (PDF 11–15), B (16–20),
// C (20–24). Limits below are in thousands of rupiah; rates are percentages.
const fixtures = {
  A: {
    ptkp: 'TK/0',
    limits: '5400 5650 5950 6300 6750 7500 8550 9650 10050 10350 10700 11050 11600 12500 13750 15100 16950 19750 24150 26450 28000 30050 32400 35400 39100 43850 47800 51400 56300 62200 68600 77500 89000 103000 125000 157000 206000 337000 454000 550000 695000 910000 1400000',
    rates: '0 .25 .5 .75 1 1.25 1.5 1.75 2 2.25 2.5 3 3.5 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34'
  },
  B: {
    ptkp: 'K/1',
    limits: '6200 6500 6850 7300 9200 10750 11250 11600 12600 13600 14950 16400 18450 21850 26000 27700 29350 31450 33950 37100 41100 45800 49500 53800 58500 64000 71000 80000 93000 109000 129000 163000 211000 374000 459000 555000 704000 957000 1405000',
    rates: '0 .25 .5 .75 1 1.5 2 2.5 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34'
  },
  C: {
    ptkp: 'K/3',
    limits: '6600 6950 7350 7800 8850 9800 10950 11200 12050 12950 14150 15550 17050 19500 22700 26600 28100 30100 32600 35400 38900 43000 47400 51200 55800 60400 66700 74500 83200 95600 110000 134000 169000 221000 390000 463000 561000 709000 965000 1419000',
    rates: '0 .25 .5 .75 1 1.25 1.5 1.75 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34'
  }
};
function calculate(gross, category = 'permanent', ptkp = 'TK/0') {
  return C.tax.calculate({ gross, category, ptkp });
}
function fixedPoint(options) {
  const actual = C.tax.grossUp(options);
  assert.ok(Number.isSafeInteger(actual.allowance));
  assert.equal(actual.allowance, actual.amount);
  const final = C.tax.calculate({ ...options, gross: BigInt(options.gross) + BigInt(actual.allowance) });
  assert.deepEqual(actual, { ...final, allowance: final.amount });
  return actual;
}

for (const [group, fixture] of Object.entries(fixtures)) {
  const limits = fixture.limits.split(' ').map(value => Number(value) * 1000);
  const rates = fixture.rates.split(' ').map(Number);
  test('TER ' + group + ': complete table shape', () => {
    assert.equal(limits.length + 1, { A: 44, B: 40, C: 41 }[group]);
    assert.equal(rates.length, limits.length + 1);
  });
  for (const category of ['permanent', 'temporary_monthly']) {
    limits.forEach((upper, i) => {
      test(`${category} ${group} boundary ${upper}: below, at, above`, () => {
        for (const delta of [-1, 0, 1]) {
          const gross = upper + delta;
          const percent = rates[i + (delta > 0 ? 1 : 0)];
          assert.deepEqual(calculate(gross, category, fixture.ptkp), {
            amount: Number(BigInt(gross) * BigInt(percent * 100) / 10000n),
            rate: percent / 100, method: 'ter_monthly', category: group
          });
        }
      });
    });
  }
  test('TER ' + group + ': gross-up around every tier and safe high values', () => {
    for (const gross of [0, ...limits.flatMap(limit => [limit - 1, limit, limit + 1]), 5000000000000000]) {
      fixedPoint({ gross, category: 'permanent', ptkp: fixture.ptkp });
    }
  });
}

test('all eight PTKP mappings and zero income', () => {
  for (const [ptkp, category] of Object.entries({ 'TK/0': 'A', 'TK/1': 'A', 'K/0': 'A',
    'TK/2': 'B', 'TK/3': 'B', 'K/1': 'B', 'K/2': 'B', 'K/3': 'C' })) {
    assert.deepEqual(calculate(0, 'permanent', ptkp), { amount: 0, rate: 0, method: 'ter_monthly', category });
  }
});

test('monthly temporary TER follows PTKP, not an unconditional category A', () => {
  // PP 58 Article 2(3)–(4); PMK 168 Article 16(2)(c). Tuan N is A because TK/0.
  for (const [ptkp, category, rate, amount] of [
    ['TK/0', 'A', .0125, 87500], ['TK/1', 'A', .0125, 87500], ['K/0', 'A', .0125, 87500],
    ['TK/2', 'B', .0075, 52500], ['TK/3', 'B', .0075, 52500],
    ['K/1', 'B', .0075, 52500], ['K/2', 'B', .0075, 52500], ['K/3', 'C', .005, 35000]
  ]) {
    assert.deepEqual(calculate(7000000, 'temporary_monthly', ptkp), {
      amount, rate, method: 'ter_monthly', category
    });
    assert.equal(fixedPoint({ gross: 7000000, category: 'temporary_monthly', ptkp }).category, category);
  }
  for (const method of ['calculate', 'grossUp']) {
    for (const ptkp of [undefined, '', 'K/4']) {
      assert.throws(() => C.tax[method]({ gross: 7000000, category: 'temporary_monthly', ptkp }), /PTKP/);
    }
  }
});

test('PP 58 explanation: Tuan R K/0, ordinary month', () => {
  assert.equal(calculate(10000000, 'permanent', 'K/0').amount, 200000);
});
test('PMK 168 page 34: Tuan A ordinary, bonus, and THR months', () => {
  for (const [gross, amount] of [[30080000, 3910400], [35080000, 4911200], [50080000, 9014400]]) {
    assert.equal(calculate(gross, 'permanent', 'K/0').amount, amount);
  }
});
test('PMK 168 page 44: Tuan F K/3 and Tuan G employer-paid tax', () => {
  assert.equal(calculate(30000000, 'permanent', 'K/3').amount, 3300000);
  assert.equal(calculate(65605059).amount, 13777062);
  const result = fixedPoint({ gross: 51827997, category: 'permanent', ptkp: 'TK/0' });
  assert.equal(result.allowance, 13777062);
  assert.equal(result.rate, .21);
});
test('PMK 168 page 51: Tuan N monthly temporary pay, including December', () => {
  const months = [[4000000, 0], [7000000, 87500], [1000000, 0], [7000000, 87500],
    [8000000, 120000], [6000000, 45000], [7000000, 87500], [8000000, 120000],
    [6000000, 45000], [9000000, 157500], [2000000, 0], [8000000, 120000]];
  assert.equal(months.reduce((sum, [gross, expected]) => {
    const amount = calculate(gross, 'temporary_monthly').amount;
    assert.equal(amount, expected);
    return sum + amount;
  }, 0), 870000);
});
test('PMK 168 pages 52–54: lawyer, doctor, repair service', () => {
  for (const [gross, amount] of [[400000000, 24000000], [45000000, 1125000],
    [52000000, 1300000], [7000000, 175000]]) {
    assert.deepEqual(C.tax.calculate({ gross, category: 'non_employee' }),
      { amount, rate: null, method: 'article17_50', category: null });
  }
});

// Cumulative tax at each Article 17 upper taxable-base limit, independently calculated.
for (const [base, accumulated, belowRate, aboveRate] of [
  [60000000, 3000000, 5, 15], [250000000, 31500000, 15, 25],
  [500000000, 94000000, 25, 30], [5000000000, 1444000000, 30, 35]
]) {
  test('Article 17 boundary on half gross: ' + base, () => {
    for (const delta of [-200, -1, 0, 1, 200]) {
      const gross = base * 2 + delta;
      const numerator = BigInt(accumulated) * 200n + BigInt(delta * (delta < 0 ? belowRate : aboveRate));
      assert.equal(calculate(gross, 'non_employee').amount, Number(numerator / 200n));
      fixedPoint({ gross, category: 'non_employee' });
    }
  });
}
test('round once, preserving half-rupiah base and exact large products', () => {
  assert.equal(calculate(5400399).amount, 13500);
  assert.equal(calculate(79, 'non_employee').amount, 1);
  assert.equal(calculate(80, 'non_employee').amount, 2);
  const max = Number.MAX_SAFE_INTEGER;
  assert.equal(calculate(max).amount, Number(BigInt(max) * 34n / 100n));
  const numerator = 1444000000n * 200n + (BigInt(max) - 10000000000n) * 35n;
  assert.equal(calculate(max, 'non_employee').amount, Number(numerator / 200n));
});
test('gross-up crosses TER and Article 17 tiers; exact least fixed point', () => {
  const ter = fixedPoint({ gross: 10000000, category: 'temporary_monthly', ptkp: 'TK/0' });
  assert.equal(ter.rate, .0225);
  assert.equal(ter.allowance, 230179);
  const progressive = fixedPoint({ gross: 119000000, category: 'non_employee' });
  assert.equal(progressive.allowance, 3162162);
  // Floor rounding permits two fixed points here; iteration from zero chooses 0.
  assert.equal(fixedPoint({ gross: 39, category: 'non_employee' }).allowance, 0);
  assert.equal(calculate(40, 'non_employee').amount, 1);
});
test('strict inputs, unsupported categories, and overflow rejection', () => {
  for (const gross of ['', '1.0', '1e6', ' 12', '-1', null, undefined, true, {}, [],
    NaN, Infinity, -1, .5, Number.MAX_SAFE_INTEGER + 1, '9007199254740992', -1n]) {
    for (const method of ['calculate', 'grossUp']) {
      assert.throws(() => C.tax[method]({ gross, category: 'permanent', ptkp: 'TK/0' }));
    }
  }
  for (const category of ['daily', 'weekly', 'piecework', 'temporary_daily', 'temporary', '', undefined, 'net']) {
    assert.throws(() => calculate(10000000, category === undefined ? null : category), /Unsupported tax category/);
  }
  for (const ptkp of ['', undefined, null, 'K/4', 'K/I/0', 'tk/0', 'A', 'toString', '__proto__']) {
    assert.throws(() => C.tax.calculate({ gross: 0, category: 'permanent', ptkp }), /PTKP/);
  }
  for (const method of ['calculate', 'grossUp']) {
    for (const options of [null, undefined, [], 'bad']) assert.throws(() => C.tax[method](options));
  }
  for (const category of ['permanent', 'temporary_monthly', 'non_employee']) {
    assert.throws(() => C.tax.grossUp({ gross: Number.MAX_SAFE_INTEGER, category, ptkp: 'K/3' }), /safe integer/);
  }
});
test('pure classic script, no DOM/dependencies; same safe number, string and BigInt results', () => {
  const context = vm.createContext({});
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/tax.js'), 'utf8'), context);
  assert.equal(vm.runInContext("Caroll.tax.calculate({gross:10000000,category:'permanent',ptkp:'TK/0'}).amount", context), 200000);
  const options = Object.freeze({ gross: 10000000, category: 'permanent', ptkp: 'TK/0' });
  for (const method of ['calculate', 'grossUp']) {
    const expected = C.tax[method](options);
    for (const gross of ['10000000', 10000000n]) assert.deepEqual(C.tax[method]({ ...options, gross }), expected);
    expected.amount = -1;
    assert.ok(C.tax[method](options).amount >= 0);
  }
  assert.deepEqual(Object.keys(C.tax).sort(), ['calculate', 'grossUp']);
});
