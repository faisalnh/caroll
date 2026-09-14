(function () {
  'use strict';
  const C = globalThis.Caroll = globalThis.Caroll || {};

  C.paymentPolicies = Object.fromEntries(['current', 'proposed'].flatMap(scenario => ['pph', 'bpjs_kesehatan', 'bpjs_ketenagakerjaan'].map(kind => [scenario + '_' + kind + '_policy', kind === 'pph' ? ['unconfirmed', 'gross', 'net', 'gross_up'] : ['unconfirmed', 'employee', 'company']])));
  C.paymentPolicy = (rules, scenario, kind) => rules[scenario + '_' + kind + '_policy'] || (kind === 'pph' ? 'gross_up' : 'company');
  C.bpjsParticipation = rule => {
    if (rule.tax_program === 'kesehatan') return 'bpjs_kesehatan';
    if (['jkk', 'jkm', 'jht', 'jp'].includes(rule.tax_program)) return 'bpjs_ketenagakerjaan';
    return null;
  };
  C.bpjsEligible = (rules, employee, scenario, kind) => {
    if (!['current', 'proposed'].includes(scenario)) return null;
    if (kind === 'bpjs_kesehatan') {
      if ((rules.bpjs_kesehatan_eligibility || 'manual') === 'manual') return employee.bpjs_kesehatan === true;
      if (rules.bpjs_kesehatan_eligibility !== 'tenure') return null;
      const joined = String(employee.join_date || ''), reference = String(rules[scenario + '_bpjs_reference_date'] || '');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(joined) || !/^\d{4}-\d{2}-\d{2}$/.test(reference)) return null;
      const [jy, jm, jd] = joined.split('-').map(Number), [ry, rm, rd] = reference.split('-').map(Number);
      // Count completed calendar months; the current month is incomplete until reaching the join day.
      const months = (ry - jy) * 12 + rm - jm - (rd < jd ? 1 : 0);
      return months >= Number(rules.bpjs_kesehatan_min_months);
    }
    if (kind === 'bpjs_ketenagakerjaan') {
      if ((rules.bpjs_ketenagakerjaan_eligibility || 'manual') === 'manual') return employee.bpjs_ketenagakerjaan === true;
      if (rules.bpjs_ketenagakerjaan_eligibility !== 'permanent') return null;
      return employee.employment_type === 'permanent';
    }
    return null;
  };
  C.createWorkspace = function () {
    return {
      schemaVersion: 1,
      metadata: { name: '', current_period: '', proposed_period: '' },
      matrices: [], matrixEntries: [], employees: [], componentDefinitions: [],
      employeeComponents: [], bpjsRules: [],
      globalRules: {
        currency: 'IDR', rounding: 1, percentage_precision: 2,
        include_inactive: false, allow_negative_thp: false,
        proposed_defaults_current: true, proposed_matrix_type_defaults_current: true, tax_enabled: false,
        tax_basis: 'taxable', tax_rounding: 1,
        current_tax_month: '', proposed_tax_month: '', tax_regime: '',
        bpjs_kesehatan_eligibility: 'manual', bpjs_kesehatan_min_months: 0,
        current_bpjs_reference_date: '', proposed_bpjs_reference_date: '',
        bpjs_ketenagakerjaan_eligibility: 'manual',
        current_pph_policy: 'unconfirmed', proposed_pph_policy: 'gross_up',
        current_bpjs_kesehatan_policy: 'unconfirmed', proposed_bpjs_kesehatan_policy: 'company',
        current_bpjs_ketenagakerjaan_policy: 'employee', proposed_bpjs_ketenagakerjaan_policy: 'company'
      }
    };
  };

  C.sampleWorkspace = function () {
    const ws = C.createWorkspace();
    Object.keys(C.paymentPolicies).forEach(key => { ws.globalRules[key] = key.includes('_pph_') ? 'gross_up' : 'company'; });
    Object.assign(ws.globalRules, { current_tax_month: '2026-08', proposed_tax_month: '2026-08', tax_regime: 'ordinary' });
    ws.metadata = { name: 'Fictional demo — review all rates', current_period: '2026', proposed_period: '2027' };
    ws.matrices = ['current', 'proposed'].map(scenario => ({
      matrix_id: 'demo-' + scenario, name: 'Demo ' + scenario, scenario, matrix_type: 'regular',
      effective_date: scenario === 'current' ? '2026-01-01' : '2027-01-01'
    }));
    ws.matrixEntries = ['current', 'proposed'].flatMap(scenario => [
      { salary_group: '1', professional_category: 'U', kmk_level: 1, basic_salary: 4000000 },
      { salary_group: '2', professional_category: 'PM', kmk_level: 2, basic_salary: 6000000 }
    ].map(entry => ({ ...entry, matrix_id: 'demo-' + scenario, scenario,
      golongan: entry.salary_group + '-' + entry.professional_category + entry.kmk_level,
      basic_salary: entry.basic_salary + (scenario === 'proposed' ? 200000 : 0), note: 'Fictional demonstration' })));
    ws.employees = ['DEMO-001', 'DEMO-002'].map((employee_id, index) => ({
      employee_id, name: index ? 'Demo Employee Two' : 'Demo Employee One',
      unit: 'Demo Unit', department: index ? 'Teaching' : 'Administration', position: 'Demo role',
      employment_status: 'Demo', employment_type: 'permanent', join_date: '2025-01-01', active: true,
      current_golongan: index ? '2-PM2' : '1-U1', proposed_golongan: '',
      current_matrix_type: 'regular', proposed_matrix_type: '',
      current_basic_override: '', proposed_basic_override: '', ptkp_status: 'TK/0', tax_category: 'permanent', tax_residency: 'domestic', tax_period_type: 'ordinary', tax_payment_scope: 'monthly',
      bpjs_kesehatan: true, bpjs_ketenagakerjaan: true, pph_method: 'gross_up',
      pph_rate: '0.025', pph_fixed_override: '', notes: 'Fictional person; rates are not legal guidance'
    }));
    ws.componentDefinitions = [{
      code: 'DEMO_ALLOWANCE', name: 'Demo allowance', category: 'allowance', direction: 'earning',
      calculation_type: 'fixed', default_value: 250000, taxable: true,
      bpjs_kesehatan: true, bpjs_ketenagakerjaan: false, applies_current: true,
      applies_proposed: true, active: true, rounding: 1, notes: 'Editable demonstration only'
    }];
    ws.employeeComponents = ws.employees.map(employee => ({
      employee_id: employee.employee_id, component_code: 'DEMO_ALLOWANCE', current_value: '', proposed_value: ''
    }));
    ws.bpjsRules = [{
      code: 'kesehatan', tax_program: 'kesehatan', name: 'Demo Kesehatan — NOT legal rates', employee_rate: '0.007',
      employer_rate: '0.013', minimum_basis: '', maximum_basis: 5000000, basis: 'selected',
      employee_enabled: true, employer_enabled: true, rounding: 1, active: true
    }];
    return ws;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})();
