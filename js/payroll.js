(function () {
  'use strict';
  const C = globalThis.Caroll = globalThis.Caroll || {};
  if (typeof module !== 'undefined' && module.exports) {
    require('./matrix.js');
    require('./tax.js');
    require('./validation.js');
  }
  const blank = value => value === '' || value === null || value === undefined;
  const metrics = ['basic_salary', 'gross', 'employee_bpjs', 'employer_bpjs', 'pph', 'deductions',
    'take_home_pay', 'employer_cost', 'employer_contributions', 'bpjs_allowance', 'tax_allowance', 'employer_tax_cost'];
  const compared = ['basic_salary', 'gross', 'take_home_pay', 'employer_cost'];
  const empty = () => Object.fromEntries(metrics.map(key => [key, 0]).concat([['breakdown', []]]));
  function sum(values) {
    const value = values.reduce((total, amount) => total + BigInt(amount), 0n);
    return C.roundMoney(String(value));
  }
  function changes(current, proposed) {
    return Object.fromEntries(compared.map(key => [key, C.change(current[key], proposed[key])]));
  }
  function scenarioPayroll(ws, employee, scenario) {
    const result = empty();
    const rules = ws.globalRules;
    const taxPolicy = C.paymentPolicy(rules, scenario, 'pph');
    const breakdown = result.breakdown;
    result.matrix_type = C.resolveMatrixType(ws, employee, scenario);
    result.basic_salary = C.resolveBasic(ws, employee, scenario);
    breakdown.push({ code: 'basic_salary', name: 'Basic salary', direction: 'earning', amount: result.basic_salary,
      source: blank(employee[scenario + '_basic_override']) ? 'matrix' : 'override', matrix_type: result.matrix_type });
    const definitions = new Map(ws.componentDefinitions.map(definition => [definition.code, definition]));
    const components = ws.employeeComponents.filter(assignment => assignment.employee_id === employee.employee_id)
      .map(assignment => ({ assignment, definition: definitions.get(assignment.component_code) }))
      .filter(({ definition }) => definition.active && definition['applies_' + scenario])
      .sort((a, b) => a.definition.code < b.definition.code ? -1 : a.definition.code > b.definition.code ? 1 : 0);
    function componentAmount(component, grossBasis) {
      const { assignment, definition } = component;
      const override = assignment[scenario + '_value'];
      const value = blank(override) ? definition.default_value : override;
      const percentage = definition.calculation_type.startsWith('percentage_');
      const basis = definition.calculation_type === 'percentage_basic' ? result.basic_salary : grossBasis;
      const amount = percentage ? C.percent(basis, value, definition.rounding) : C.roundMoney(value, definition.rounding);
      return { code: definition.code, name: definition.name, direction: definition.direction,
        calculation_type: definition.calculation_type, amount, source: blank(override) ? 'default' : 'assignment',
        ...(percentage ? { basis, rate: Number(value) } : {}), definition };
    }
    const independent = components.filter(component => component.definition.calculation_type !== 'percentage_gross')
      .map(component => componentAmount(component, 0));
    // All percentage-of-gross formulas use this same basis; none depend on each other.
    const grossBasis = sum([result.basic_salary, ...independent.filter(row => row.direction === 'earning').map(row => row.amount)]);
    const calculated = independent.concat(components.filter(component => component.definition.calculation_type === 'percentage_gross')
      .map(component => componentAmount(component, grossBasis)));
    calculated.sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0);
    breakdown.push(...calculated.map(({ definition, ...row }) => row));
    const earnings = calculated.filter(row => row.direction === 'earning');
    result.gross = sum([result.basic_salary, ...earnings.map(row => row.amount)]);
    result.employer_contributions = sum(calculated.filter(row => row.direction === 'employer_contribution').map(row => row.amount));
    const employeeContributions = [], employerContributions = [], fundedContributions = [], taxableEmployerContributions = [];
    for (const rule of [...ws.bpjsRules].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : 0)) {
      if (!rule.active) continue;
      const participation = C.bpjsParticipation(rule);
      if (participation === null) continue; // Unidentified active programs are blocked by validation.
      if (!C.bpjsEligible(rules, employee, scenario, participation)) continue;
      const rawBasis = rule.basis === 'basic' ? result.basic_salary : rule.basis === 'gross' ? result.gross :
        sum([result.basic_salary, ...earnings.filter(row => row.definition[participation]).map(row => row.amount)]);
      let basis = rawBasis;
      if (!blank(rule.minimum_basis)) basis = Math.max(basis, Number(rule.minimum_basis));
      if (!blank(rule.maximum_basis)) basis = Math.min(basis, Number(rule.maximum_basis));
      const employeeAmount = rule.employee_enabled ? C.percent(basis, rule.employee_rate, rule.rounding) : 0;
      const employerAmount = rule.employer_enabled ? C.percent(basis, rule.employer_rate, rule.rounding) : 0;
      const policy = C.paymentPolicy(rules, scenario, participation);
      const allowance = policy === 'company' ? employeeAmount : 0;
      fundedContributions.push(allowance);
      employeeContributions.push(employeeAmount);
      employerContributions.push(employerAmount);
      if (['kesehatan', 'jkk', 'jkm'].includes(rule.tax_program)) taxableEmployerContributions.push(employerAmount);
      breakdown.push({ code: rule.code, name: rule.name, calculation_type: 'bpjs', raw_basis: rawBasis, basis,
        employee_rate: Number(rule.employee_rate), employer_rate: Number(rule.employer_rate),
        employee_amount: employeeAmount, employer_amount: employerAmount, policy, bpjs_allowance: allowance });
    }
    result.employee_bpjs = sum(employeeContributions);
    result.employer_bpjs = sum(employerContributions);
    // Fund the employee share after all contribution bases are calculated, avoiding a circular basis.
    result.bpjs_allowance = sum(fundedContributions);
    result.gross = sum([result.gross, result.bpjs_allowance]);
    breakdown.push({ code: 'bpjs_allowance', name: 'Tunjangan BPJS porsi karyawan', direction: 'earning', amount: result.bpjs_allowance, source: 'company_paid_bpjs' });
    if (rules.tax_enabled) {
      const basis = sum([result.basic_salary, result.bpjs_allowance, ...earnings.filter(row => row.definition.taxable).map(row => row.amount), ...taxableEmployerContributions]);
      const input = { gross: basis, category: employee.tax_category, ptkp: employee.ptkp_status };
      const tax = taxPolicy === 'gross_up' ? C.tax.grossUp(input) : C.tax.calculate(input);
      result.pph = tax.amount;
      result.tax_allowance = taxPolicy === 'gross_up' ? tax.allowance : 0;
      result.employer_tax_cost = taxPolicy === 'net' ? result.pph : 0;
      result.gross = sum([result.gross, result.tax_allowance]);
      breakdown.push({ code: 'tax_allowance', name: 'Tunjangan PPh 21 (gross-up)', direction: 'earning', amount: result.tax_allowance, source: 'gross_up' });
      breakdown.push({ code: 'pph', name: 'Estimasi PPh 21', calculation_type: 'tax', method: taxPolicy,
        basis: sum([basis, result.tax_allowance]), basis_before_allowance: basis, rate: tax.rate, amount: result.pph, tax_formula: tax.method, ter_category: tax.category, taxable_employer_bpjs: sum(taxableEmployerContributions), tax_month: rules[scenario + '_tax_month'],
        source: 'automatic_pph21', employee_amount: taxPolicy === 'net' ? 0 : result.pph,
        employer_tax_cost: result.employer_tax_cost, tax_allowance: result.tax_allowance });
    }
    result.deductions = sum([result.employee_bpjs, taxPolicy === 'net' ? 0 : result.pph,
      ...calculated.filter(row => row.direction === 'employee_deduction').map(row => row.amount)]);
    result.take_home_pay = sum([result.gross, -result.deductions]);
    result.employer_cost = sum([result.gross, result.employer_bpjs, result.employer_contributions, result.employer_tax_cost]);
    return result;
  }
  C.calculatePayroll = function (ws) {
    const issues = C.validate(ws);
    const blocked = () => ({ employees: [], totals: null, issues });
    if (issues.some(issue => issue.severity === 'error')) return blocked();
    const employees = [];
    for (const employee of ws.employees) {
      if (!employee.active && !ws.globalRules.include_inactive) continue;
      try {
        const current = scenarioPayroll(ws, employee, 'current');
        const proposed = scenarioPayroll(ws, employee, 'proposed');
        if (proposed.take_home_pay < current.take_home_pay) issues.push({ severity: 'warning', message: 'Proposed take-home pay is lower than current', employee_id: employee.employee_id, employee_name: employee.name });
        for (const scenario of ['current', 'proposed']) {
          if ((scenario === 'current' ? current : proposed).take_home_pay < 0) issues.push({
            severity: ws.globalRules.allow_negative_thp ? 'warning' : 'error',
            message: 'Negative take-home pay (' + scenario + ')', employee_id: employee.employee_id, employee_name: employee.name
          });
        }
        employees.push({ employee_id: employee.employee_id, name: employee.name, unit: employee.unit || '', department: employee.department || '',
          current_matrix_type: current.matrix_type, proposed_matrix_type: proposed.matrix_type,
          current_golongan: employee.current_golongan,
          proposed_golongan: employee.proposed_golongan || (ws.globalRules.proposed_defaults_current ? employee.current_golongan : ''),
          current, proposed, changes: changes(current, proposed), issues: [] });
      } catch (error) {
        issues.push({ severity: 'error', message: 'Calculation failed: ' + error.message, employee_id: employee.employee_id, employee_name: employee.name });
      }
    }
    if (issues.some(issue => issue.severity === 'error')) return blocked();
    const totals = { current: empty(), proposed: empty() };
    try {
      for (const scenario of ['current', 'proposed']) {
        for (const key of metrics) totals[scenario][key] = sum(employees.map(employee => employee[scenario][key]));
      }
      totals.changes = changes(totals.current, totals.proposed);
    } catch (error) {
      issues.push({ severity: 'error', message: 'Totals calculation failed: ' + error.message });
      return blocked();
    }
    for (const employee of employees) employee.issues = issues.filter(issue => issue.employee_id === employee.employee_id);
    return { employees, totals, issues };
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = C;
})();
