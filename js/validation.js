(function () {
  'use strict';
  const C = globalThis.Caroll = globalThis.Caroll || {};
  if (typeof module !== 'undefined' && module.exports) require('./matrix.js');
  const blank = value => value === '' || value === null || value === undefined;
  const enabled = value => value === true;

  C.validate = function (ws) {
    const issues = [];
    function issue(severity, message, employee) {
      const matches = employee && Array.isArray(ws?.employees) ? ws.employees.filter(e => e && e.employee_id === employee.employee_id) : [];
      const name = employee?.name ?? (matches.length === 1 ? matches[0].name : '');
      issues.push({ severity, message, ...(employee ? { employee_id: employee.employee_id, employee_name: name || '' } : {}) });
    }
    const error = (message, employee) => issue('error', message, employee);
    const warning = (message, employee) => issue('warning', message, employee);
    if (!ws || typeof ws !== 'object') return [{ severity: 'error', message: 'Workspace is required' }];
    const collections = ['matrices', 'matrixEntries', 'employees', 'componentDefinitions', 'employeeComponents', 'bpjsRules'];
    for (const key of collections) {
      if (!Array.isArray(ws[key]) || ws[key].some(record => !record || typeof record !== 'object' || Array.isArray(record))) error('Invalid collection: ' + key);
    }
    if (!ws.globalRules || typeof ws.globalRules !== 'object') error('Global rules are required');
    if (issues.length) return issues;
    const rules = ws.globalRules;
    if (ws.schemaVersion !== 1) warning('Unsupported schema version: ' + ws.schemaVersion);
    function numeric(value, label, employee, optional = false, nonnegative = false, integer = false) {
      if (optional && blank(value)) return;
      try {
        C.roundMoney(value);
        if (nonnegative && Number(value) < 0) throw new Error();
        if (integer && !Number.isSafeInteger(Number(value))) throw new Error();
      } catch (_) { error('Invalid numeric input for ' + label, employee); }
    }
    function rounding(value, label, employee) {
      if (![1, 100, 1000].includes(value)) error('Invalid rounding for ' + label, employee);
    }
    function boolean(value, label, employee) {
      if (typeof value !== 'boolean') error('Invalid boolean for ' + label, employee);
    }
    function choice(value, options, label, employee) {
      if (!options.includes(value)) error('Invalid ' + label + ': ' + value, employee);
    }
    function unique(records, key, label, employeeRecords = false) {
      const seen = new Set();
      for (const record of records) {
        const value = key(record);
        if (blank(value) || String(value).trim() === '') error('Missing ' + label, employeeRecords ? record : null);
        else if (seen.has(value)) error('Duplicate ' + label + ': ' + value, employeeRecords ? record : null);
        seen.add(value);
      }
    }
    rounding(rules.rounding, 'global money');
    rounding(rules.tax_rounding, 'tax');
    if (rules.currency !== 'IDR') error('Currency must be IDR');
    if (rules.percentage_precision !== 2) error('Percentage precision must be 2');
    for (const key of ['include_inactive', 'allow_negative_thp', 'proposed_defaults_current', 'proposed_matrix_type_defaults_current', 'tax_enabled']) boolean(rules[key], key);
    choice(rules.tax_basis, ['taxable', 'gross', 'basic'], 'tax basis');
    choice(rules.bpjs_kesehatan_eligibility || 'manual', ['manual', 'tenure'], 'aturan kepesertaan BPJS Kesehatan');
    choice(rules.bpjs_ketenagakerjaan_eligibility || 'manual', ['manual', 'permanent'], 'aturan kepesertaan BPJS TK');
    if ((rules.bpjs_kesehatan_eligibility || 'manual') === 'tenure') {
      numeric(rules.bpjs_kesehatan_min_months, 'masa kerja minimum BPJS Kesehatan', null, false, true, true);
      for (const scenario of ['current', 'proposed']) {
        const date = rules[scenario + '_bpjs_reference_date'];
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) error('Isi tanggal acuan BPJS ' + scenario + ' (YYYY-MM-DD).');
      }
    }
    for (const [key, options] of Object.entries(C.paymentPolicies)) if (!blank(rules[key])) choice(rules[key], options, key);
    if (!rules.tax_enabled) warning('Estimasi PPh 21 is disabled; results exclude tax');
    if (rules.tax_enabled) {
      choice(rules.tax_regime, ['ordinary'], 'rezim pajak biasa (insentif/DTP belum didukung)');
      for (const scenario of ['current', 'proposed']) if (!/^202[4-6]-(0[1-9]|1[0-2])$/.test(rules[scenario + '_tax_month'] || '')) error('Isi masa pajak ' + scenario + ' YYYY-MM (cakupan terverifikasi 2024–2026).');

      warning('PPh otomatis: bulan biasa, subjek dalam negeri. Pembulatan pajak ke bawah ke rupiah penuh adalah asumsi simulasi; lihat TAX_RULES.md.');
    }
    unique(ws.employees, employee => employee.employee_id, 'employee ID', true);
    unique(ws.matrices, matrix => matrix.matrix_id, 'matrix ID');
    unique(ws.matrices, matrix => JSON.stringify([matrix.scenario, C.normalizeMatrixType(matrix.matrix_type)]), 'matrix scenario/type');
    unique(ws.matrixEntries, entry => C.matrixEntryKey(ws, entry), 'matrix entry');
    unique(ws.componentDefinitions, definition => definition.code, 'component code');
    unique(ws.bpjsRules, rule => rule.code, 'BPJS code');
    unique(ws.employeeComponents, assignment => JSON.stringify([assignment.employee_id, assignment.component_code]), 'employee component assignment');
    const matrices = new Map(ws.matrices.map(matrix => [matrix.matrix_id, matrix]));
    for (const matrix of ws.matrices) {
      choice(matrix.scenario, ['current', 'proposed'], 'matrix scenario');
      if (!C.normalizeMatrixType(matrix.matrix_type)) error('Invalid or missing matrix_type: ' + matrix.matrix_id);
    }
    for (const entry of ws.matrixEntries) {
      choice(entry.scenario, ['current', 'proposed'], 'matrix entry scenario');
      if (!C.parseGolongan(entry.golongan)) error('Invalid matrix Golongan: ' + entry.golongan);
      if (!blank(entry.salary_group) && !blank(entry.professional_category) && !blank(entry.kmk_level) && C.golongan(entry.salary_group, entry.professional_category, entry.kmk_level) !== entry.golongan) error('Matrix Golongan does not match its dimensions: ' + entry.golongan);
      const matrix = matrices.get(entry.matrix_id);
      if (!matrix || matrix.scenario !== entry.scenario) error('Unknown or mismatched matrix reference: ' + entry.matrix_id);
      numeric(entry.basic_salary, 'matrix basic salary', null, false, true, true);
    }
    for (const definition of ws.componentDefinitions) {
      choice(definition.direction, ['earning', 'employee_deduction', 'employer_contribution'], 'component direction');
      choice(definition.calculation_type, ['fixed', 'percentage_basic', 'percentage_gross', 'manual'], 'component formula');
      numeric(definition.default_value, 'component default ' + definition.code, null, definition.calculation_type === 'manual');
      rounding(definition.rounding, 'component ' + definition.code);
      for (const key of ['taxable', 'bpjs_kesehatan', 'bpjs_ketenagakerjaan', 'applies_current', 'applies_proposed', 'active']) boolean(definition[key], definition.code + '.' + key);
    }
    const definitions = new Map(ws.componentDefinitions.map(definition => [definition.code, definition]));
    const employees = new Map(ws.employees.map(employee => [employee.employee_id, employee]));
    for (const assignment of ws.employeeComponents) {
      const employee = employees.get(assignment.employee_id);
      const definition = definitions.get(assignment.component_code);
      if (!employee) error('Unknown employee reference: ' + assignment.employee_id);
      if (!definition) error('Unknown referenced component: ' + assignment.component_code, employee);
      if (rules.tax_enabled && employee && (employee.active || rules.include_inactive) && definition && enabled(definition.active) && definition.direction === 'employer_contribution' && (enabled(definition.applies_current) || enabled(definition.applies_proposed))) error('Kontribusi perusahaan non-BPJS memerlukan klasifikasi pajak khusus; belum didukung saat PPh aktif.', employee);
      for (const scenario of ['current', 'proposed']) {
        const value = assignment[scenario + '_value'];
        numeric(value, scenario + ' component value', employee, true);
        if (!blank(value) && Number(value) <= 0) warning('Zero or negative component value: ' + assignment.component_code + ' (' + scenario + ')', employee);
        if (definition && enabled(definition.active) && enabled(definition['applies_' + scenario]) && definition.calculation_type === 'manual' && blank(value) && blank(definition.default_value)) error('Manual component requires a value: ' + definition.code + ' (' + scenario + ')', employee);
      }
    }
    for (const rule of ws.bpjsRules) {
      if (rule.active && C.bpjsParticipation(rule) === null) error('Identifikasi jenis program BPJS aktif: ' + rule.code + ' (tax_program: kesehatan, jkk, jkm, jht, atau jp), termasuk saat PPh nonaktif.');
      for (const key of ['employee_rate', 'employer_rate']) numeric(rule[key], rule.code + '.' + key, null, false, true);
      for (const key of ['minimum_basis', 'maximum_basis']) numeric(rule[key], rule.code + '.' + key, null, true, true, true);
      if (!blank(rule.minimum_basis) && !blank(rule.maximum_basis) && Number(rule.minimum_basis) > Number(rule.maximum_basis)) error('BPJS minimum basis exceeds maximum: ' + rule.code);
      choice(rule.basis, ['basic', 'selected', 'gross'], 'BPJS basis');
      rounding(rule.rounding, 'BPJS ' + rule.code);
      for (const key of ['employee_enabled', 'employer_enabled', 'active']) boolean(rule[key], rule.code + '.' + key);
    }
    for (const employee of ws.employees) {
      boolean(employee.active, 'employee active', employee);
      if (!employee.active && !rules.include_inactive) continue;
      if (blank(employee.name) || !String(employee.name).trim()) error('Missing employee name', employee);
      if (!employee.current_golongan) error('Missing current Golongan', employee);
      if (!C.normalizeMatrixType(employee.current_matrix_type)) error('Invalid or missing current_matrix_type', employee);
      for (const key of ['bpjs_kesehatan', 'bpjs_ketenagakerjaan']) boolean(employee[key], key, employee);
      if ((rules.bpjs_kesehatan_eligibility || 'manual') === 'manual' && !employee.bpjs_kesehatan) warning('Employee excluded from bpjs_kesehatan', employee);
      if ((rules.bpjs_ketenagakerjaan_eligibility || 'manual') === 'manual' && !employee.bpjs_ketenagakerjaan) warning('Employee excluded from bpjs_ketenagakerjaan', employee);
      if ((rules.bpjs_kesehatan_eligibility || 'manual') === 'tenure' && !/^\d{4}-\d{2}-\d{2}$/.test(employee.join_date || '')) error('Tanggal bergabung wajib untuk aturan masa kerja BPJS Kesehatan.', employee);
      if ((rules.bpjs_ketenagakerjaan_eligibility || 'manual') === 'permanent') choice(employee.employment_type, ['permanent', 'non_permanent'], 'status permanen BPJS TK', employee);
      if (rules.tax_enabled) {
        choice(employee.tax_category, ['permanent', 'temporary_monthly', 'non_employee'], 'klasifikasi PPh (harian/mingguan/lainnya belum didukung)', employee);
        choice(employee.tax_residency, ['domestic'], 'subjek pajak dalam negeri', employee);
        choice(employee.tax_period_type, ['ordinary'], 'masa biasa, bukan masa pajak terakhir', employee);
        choice(employee.tax_payment_scope, employee.tax_category === 'non_employee' ? ['single'] : ['monthly'], 'pola pembayaran pajak', employee);
        if (employee.tax_category !== 'non_employee') choice(employee.ptkp_status, ['TK/0', 'TK/1', 'TK/2', 'TK/3', 'K/0', 'K/1', 'K/2', 'K/3'], 'status PTKP', employee);
        if (!blank(employee.pph_rate) || !blank(employee.pph_fixed_override)) warning('Tarif/override PPh lama diabaikan; PPh dihitung otomatis.', employee);
      }
      for (const scenario of ['current', 'proposed']) {
        const policy = C.paymentPolicy(rules, scenario, 'pph');
        if (rules.tax_enabled && policy === 'unconfirmed') error('Pilih skema PPh ' + scenario + ' pada aturan perhitungan.', employee);
        if (rules.tax_enabled && policy === 'net') error('Skema net di luar bruto tidak didukung PPh otomatis; pilih gross-up untuk pajak ditanggung perusahaan.', employee);
        if (rules.tax_enabled && employee.tax_category === 'permanent' && String(rules[scenario + '_tax_month']).endsWith('-12')) error('Desember pegawai tetap membutuhkan rekonsiliasi tahunan; di luar simulasi bulan biasa.', employee);
        for (const kind of ['bpjs_kesehatan', 'bpjs_ketenagakerjaan']) {
          if (C.paymentPolicy(rules, scenario, kind) === 'unconfirmed' && C.bpjsEligible(rules, employee, scenario, kind) === true && ws.bpjsRules.some(r => r.active && r.employee_enabled && C.bpjsParticipation(r) === kind)) error('Pilih skema ' + kind + ' ' + scenario + ' pada aturan perhitungan.', employee);
        }
      }
      const resolved = {};
      for (const scenario of ['current', 'proposed']) {
        const code = employee[scenario + '_golongan'] || (scenario === 'proposed' && rules.proposed_defaults_current ? employee.current_golongan : '');
        if (code && !C.parseGolongan(code)) error('Invalid ' + scenario + ' Golongan: ' + code, employee);
        const override = employee[scenario + '_basic_override'];
        numeric(override, scenario + ' basic salary override', employee, true, true, true);
        resolved[scenario] = C.resolveBasic(ws, employee, scenario);
        if (resolved[scenario] === null) error('Unresolved ' + scenario + ' basic salary', employee);
        const type = C.resolveMatrixType(ws, employee, scenario);
        if (!type || ws.matrices.filter(matrix => matrix.scenario === scenario && C.normalizeMatrixType(matrix.matrix_type) === type).length !== 1) error('Unresolved ' + scenario + ' matrix type', employee);
        if (!blank(override)) {
          warning(scenario + ' basic salary override exists and is used', employee);
          const entry = C.matrixSalary(ws, employee, scenario);
          if (entry) {
            try {
              if (resolved[scenario] !== C.roundMoney(entry.basic_salary, rules.rounding)) warning(scenario + ' basic salary override differs from matrix', employee);
            } catch (_) { /* Invalid matrix salary is reported above. */ }
          }
        }
      }
      if (resolved.current !== null && resolved.proposed !== null && resolved.proposed < resolved.current) warning('Proposed basic salary is lower than current', employee);
      const current = C.parseGolongan(employee.current_golongan);
      const proposed = C.parseGolongan(employee.proposed_golongan || (rules.proposed_defaults_current ? employee.current_golongan : ''));
      if (current && proposed) {
        if (current.salary_group !== proposed.salary_group) warning('Golongan salary group changes', employee);
        if (current.professional_category !== proposed.professional_category) warning('Golongan professional category changes', employee);
      }
    }
    return issues;
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})();
