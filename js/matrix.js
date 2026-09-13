(function () {
  'use strict';
  const C = globalThis.Caroll = globalThis.Caroll || {};
  const blank = value => value === '' || value === null || value === undefined;

  // Decimal inputs are converted before arithmetic, including exponent notation.
  function decimal(value) {
    if (blank(value) || !['number', 'string'].includes(typeof value)) throw new TypeError('Invalid numeric input');
    const text = String(value).trim();
    const match = /^([+-]?)(\d+)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !Number.isFinite(Number(text))) throw new TypeError('Invalid numeric input: ' + text);
    const scale = (match[3] || '').length - Number(match[4] || 0);
    if (Math.abs(scale) > 1000) throw new RangeError('Decimal precision exceeds supported range');
    let numerator = BigInt(match[2] + (match[3] || '')) * (match[1] === '-' ? -1n : 1n);
    if (scale < 0) numerator *= 10n ** BigInt(-scale);
    return [numerator, scale > 0 ? 10n ** BigInt(scale) : 1n];
  }
  function rounded(numerator, denominator, rounding) {
    const [step, divisor] = decimal(rounding);
    if (divisor !== 1n || step <= 0n) throw new RangeError('Rounding must be a positive integer');
    const negative = numerator < 0n;
    const absolute = negative ? -numerator : numerator;
    const base = denominator * step;
    const result = ((absolute / base) + (absolute % base * 2n >= base ? 1n : 0n)) * step * (negative ? -1n : 1n);
    const number = Number(result);
    if (!Number.isSafeInteger(number)) throw new RangeError('Money exceeds safe integer range');
    return number;
  }
  C.roundMoney = function (value, rounding = 1) {
    const [n, d] = decimal(value);
    return rounded(n, d, rounding);
  };
  C.percent = function (amount, decimalRate, rounding = 1) {
    const [a, b] = decimal(amount), [c, d] = decimal(decimalRate);
    return rounded(a * c, b * d, rounding);
  };
  C.golongan = function (group, category, level) {
    const code = String(group).trim() + '-' + String(category).trim().toUpperCase() + String(level).trim();
    const parsed = C.parseGolongan(code);
    return parsed ? parsed.salary_group + '-' + parsed.professional_category + parsed.kmk_level : null;
  };
  C.parseGolongan = function (code) {
    const match = /^(\d+)-([A-Z]+)(\d+)$/.exec(String(code || '').trim().toUpperCase());
    if (!match || Number(match[1]) < 1 || Number(match[3]) < 1 || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[3]))) return null;
    return { salary_group: String(Number(match[1])), professional_category: match[2], kmk_level: Number(match[3]) };
  };
  C.resolveBasic = function (ws, employee, scenario) {
    if (!['current', 'proposed'].includes(scenario)) return null;
    const override = employee[scenario + '_basic_override'];
    const code = employee[scenario + '_golongan'] || (scenario === 'proposed' && ws.globalRules.proposed_defaults_current ? employee.current_golongan : '');
    const matches = ws.matrixEntries.filter(entry => entry.scenario === scenario && entry.golongan === code);
    const value = !blank(override) ? override : matches.length === 1 ? matches[0].basic_salary : null;
    try { return value === null ? null : C.roundMoney(value, ws.globalRules.rounding); } catch (_) { return null; }
  };
  C.adjustMatrix = function (entries, rate, rounding = 1) {
    const [n, d] = decimal(rate);
    return entries.map(entry => {
      const [a, b] = decimal(entry.basic_salary);
      return { ...entry, basic_salary: rounded(a * (d + n), b * d, rounding) };
    });
  };
  C.generateMatrix = function (settings, scenario, matrixId, rounding = 1) {
    if (!['current', 'proposed'].includes(scenario) || !matrixId) throw new Error('Skenario dan identitas matriks wajib diisi.');
    if (!Array.isArray(settings) || settings.length !== 5) throw new Error('Isi parameter KG 1–5.');
    return settings.flatMap((setting, index) => {
      const [base, baseD] = decimal(setting.base_salary);
      const [cola, colaD] = decimal(setting.cola);
      const [kmk, kmkD] = decimal(setting.kmk_index);
      if (base <= 0n || cola < 0n || kmk < 0n) throw new Error('Gaji awal harus positif; COLA dan indeks KMK tidak boleh negatif.');
      // Keep intermediate values exact, like spreadsheet formulas; round only the final salary.
      const salaries = Array.from({ length: 21 }, (_, step) => rounded(base * (colaD + cola) * (kmkD + kmk) ** BigInt(step), baseD * colaD * kmkD ** BigInt(step), rounding));
      return ['PM', 'P', 'M', 'U'].flatMap((category, tier) => Array.from({ length: 15 }, (_, level) => ({
        matrix_id: matrixId, scenario, salary_group: String(index + 1), professional_category: category,
        kmk_level: level + 1, golongan: C.golongan(index + 1, category, level + 1),
        basic_salary: salaries[level + tier * 2], note: ''
      })));
    });
  };
  C.change = function (current, proposed) {
    const amount = proposed - current;
    return { amount, percent: current === 0 ? (proposed === 0 ? 0 : null) : amount / current * 100 };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})();
