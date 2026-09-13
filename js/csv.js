/* Classic-script CSV persistence. No DOM, storage, or workspace mutation. */
(function (C) {
  'use strict';

  const employeeFields = 'employee_id name current_golongan unit department position employment_status join_date active proposed_golongan current_basic_override proposed_basic_override ptkp_status bpjs_kesehatan bpjs_ketenagakerjaan pph_method pph_rate pph_fixed_override notes'.split(' ');
  const fields = {
    workspace: 'name current_period proposed_period'.split(' '),
    matrix: 'matrix_id name scenario effective_date generator_settings'.split(' '),
    matrix_entry: 'matrix_id scenario salary_group professional_category kmk_level golongan basic_salary note'.split(' '),
    employee: employeeFields,
    component_definition: 'code name category direction calculation_type default_value taxable bpjs_kesehatan bpjs_ketenagakerjaan applies_current applies_proposed active rounding notes'.split(' '),
    employee_component: 'employee_id component_code current_value proposed_value'.split(' '),
    bpjs_rule: 'code name employee_rate employer_rate minimum_basis maximum_basis basis employee_enabled employer_enabled rounding active'.split(' '),
    global_rule: 'currency rounding percentage_precision include_inactive allow_negative_thp proposed_defaults_current tax_enabled tax_basis tax_rounding'.split(' ').concat(Object.keys(C.paymentPolicies))
  };
  const collections = { matrix: 'matrices', matrix_entry: 'matrixEntries', employee: 'employees', component_definition: 'componentDefinitions', employee_component: 'employeeComponents', bpjs_rule: 'bpjsRules' };
  const workspaceHeaders = ['schema_version', 'record_type', 'record_id', ...new Set(Object.values(fields).flat())];
  const matrixHeaders = 'scenario golongan basic_salary matrix_name effective_date salary_group professional_category kmk_level note'.split(' ');
  const resultHeaders = 'employee_id name unit department current_golongan proposed_golongan current_basic_salary proposed_basic_salary basic_change basic_change_percent current_gross proposed_gross gross_change gross_change_percent current_employee_bpjs proposed_employee_bpjs current_employer_bpjs proposed_employer_bpjs current_pph proposed_pph current_deductions proposed_deductions current_take_home_pay proposed_take_home_pay thp_change thp_change_percent current_employer_cost proposed_employer_cost employer_cost_change validation_status'.split(' ');
  const booleanFields = new Set('active taxable bpjs_kesehatan bpjs_ketenagakerjaan applies_current applies_proposed employee_enabled employer_enabled include_inactive allow_negative_thp proposed_defaults_current tax_enabled'.split(' '));
  const moneyFields = new Set('basic_salary current_basic_override proposed_basic_override pph_fixed_override minimum_basis maximum_basis'.split(' '));
  const numberFields = new Set('default_value current_value proposed_value employee_rate employer_rate pph_rate'.split(' '));
  const integerFields = new Set(['salary_group', 'kmk_level', 'percentage_precision', 'rounding', 'tax_rounding']);
  const nullableFields = new Set('current_basic_override proposed_basic_override pph_fixed_override minimum_basis maximum_basis current_value proposed_value'.split(' '));
  const enums = {
    ...C.paymentPolicies,
    scenario: ['current', 'proposed'],
    direction: ['earning', 'employee_deduction', 'employer_contribution'],
    calculation_type: ['fixed', 'percentage_basic', 'percentage_gross', 'manual'],
    basis: ['basic', 'selected', 'gross'],
    pph_method: ['gross', 'net', 'gross_up'],
        currency: ['IDR'],
        tax_basis: ['taxable', 'gross', 'basic']
  };
  const required = {
    workspace: [], matrix: ['matrix_id', 'name', 'scenario'],
    matrix_entry: ['matrix_id', 'scenario', 'salary_group', 'professional_category', 'kmk_level', 'golongan', 'basic_salary'],
    employee: ['employee_id', 'name'],
    component_definition: ['code', 'name', 'direction', 'calculation_type'],
    employee_component: ['employee_id', 'component_code'],
    bpjs_rule: ['code', 'name', 'employee_rate', 'employer_rate', 'basis'],
    global_rule: ['currency', 'rounding', 'percentage_precision', 'tax_basis', 'tax_rounding']
  };
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const blank = value => value === '' || value === null || value === undefined;
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };

  // State-machine parsing rejects quotes in bare fields and text after closing quotes.
  function table(text) {
    if (typeof text !== 'string') fail('CSV input must be text.');
    text = text.replace(/^\uFEFF/, '');
    if (!text) fail('CSV header is required.');
    const rows = [];
    let row = [], value = '', state = 'start', ended = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      ended = false;
      if (state === 'quoted') {
        if (ch === '"') {
          if (text[i + 1] === '"') { value += '"'; i++; }
          else state = 'closed';
        } else value += ch;
        continue;
      }
      if (ch === ',' || ch === '\r' || ch === '\n') {
        row.push(value); value = ''; state = 'start';
        if (ch !== ',') {
          if (ch === '\r') {
            if (text[i + 1] !== '\n') fail('Bare CR outside a quoted field.');
            i++;
          }
          rows.push(row); row = []; ended = true;
        }
      } else if (ch === '"' && state === 'start') state = 'quoted';
      else {
        if (state === 'closed' || ch === '"') fail('Malformed CSV quoting.');
        value += ch; state = 'bare';
      }
    }
    if (state === 'quoted') fail('Unterminated quoted CSV field.');
    if (!ended) { row.push(value); rows.push(row); }
    const headers = rows.shift();
    if (headers.some(h => !h || h.trim() !== h) || new Set(headers).size !== headers.length) fail('CSV headers must be nonempty, unique, and unpadded.');
    const records = rows.map((values, i) => {
      if (values.length !== headers.length) fail(`Row ${i + 2}: expected ${headers.length} fields, received ${values.length}.`);
      return Object.fromEntries(headers.map((h, j) => [h, values[j]]));
    });
    return { headers, records };
  }
  function parse(text) { return table(text).records; }
  function stringify(records, headers) {
    if (!Array.isArray(records)) fail('CSV records must be an array.');
    headers = headers === undefined ? [...new Set(records.flatMap(row => Object.keys(row)))] : [...headers];
    if (!headers.length || headers.some(h => typeof h !== 'string' || !h || h.trim() !== h) || new Set(headers).size !== headers.length) fail('CSV headers must be nonempty and unique.');
    const cell = value => {
      if (blank(value)) return '';
      if (typeof value === 'object' || (typeof value === 'number' && !Number.isFinite(value))) fail('CSV cells must be finite scalar values.');
      const text = String(value);
      return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
    };
    return '\uFEFF' + [headers, ...records.map(row => headers.map(h => row[h]))].map(row => row.map(cell).join(',')).join('\r\n') + '\r\n';
  }
  function checkHeaders(headers, allowed, needed) {
    for (const h of headers) if (!allowed.includes(h)) fail(`Unknown CSV column: ${h}.`);
    for (const h of needed) if (!headers.includes(h)) fail(`Missing required CSV column: ${h}.`);
  }
  function numeric(value, field, money, rounding = 1) {
    const text = String(value).trim();
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(text)) fail(`Invalid numeric value for ${field}: ${value}.`);
    const number = money ? C.roundMoney(text, rounding) : Number(text);
    if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER) fail(`Unsafe numeric value for ${field}.`);
    if (money && !Number.isSafeInteger(number)) fail(`Unsafe money value for ${field}.`);
    if ((moneyFields.has(field) || /_rate$/.test(field)) && Number(text) < 0) fail(`${field} cannot be negative.`);
    return number === 0 ? 0 : number;
  }
  function normalize(type, source, partial = false, ws) {
    const record = {};
    for (const field of fields[type]) {
      if (partial && !own(source, field)) continue;
      const raw = blank(source[field]) && own(C.paymentPolicies, field) ? (field.includes('_pph_') ? 'gross_up' : 'company') : source[field];
      if (blank(raw)) {
        if (required[type].includes(field) || booleanFields.has(field) || (numberFields.has(field) && !nullableFields.has(field) && field !== 'pph_rate' && !(field === 'default_value' && source.calculation_type === 'manual'))) fail(`${type}.${field} is required.`);
        record[field] = '';
      } else if (booleanFields.has(field)) {
        const text = String(raw).trim().toLowerCase();
        if (!['true', 'false'].includes(text)) fail(`${field} must be true or false.`);
        record[field] = text === 'true';
      } else if (moneyFields.has(field) || numberFields.has(field) || integerFields.has(field)) {
        const money = moneyFields.has(field) || (field === 'default_value' && ['fixed', 'manual'].includes(source.calculation_type));
                let rounding = 1;
                if (field === 'default_value') rounding = source.rounding;
                else if (field === 'pph_fixed_override' && ws) rounding = ws.globalRules.tax_rounding;
                else if (['basic_salary', 'current_basic_override', 'proposed_basic_override'].includes(field) && ws) rounding = ws.globalRules.rounding;
                record[field] = numeric(raw, field, money, rounding);
        if (integerFields.has(field) && (!Number.isSafeInteger(record[field]) || record[field] < (field === 'percentage_precision' ? 0 : 1))) fail(`${field} must be a valid integer.`);
                if (['rounding', 'tax_rounding'].includes(field) && ![1, 100, 1000].includes(record[field])) fail(`${field} must be 1, 100, or 1000.`);
                if (field === 'salary_group') record[field] = String(record[field]);
      } else {
        record[field] = String(raw);
        if (enums[field]) {
          record[field] = field === 'currency' ? record[field].trim().toUpperCase() : record[field].trim().toLowerCase();
          if (field === 'pph_method' && record[field] === 'gross-up') record[field] = 'gross_up';
          if (!enums[field].includes(record[field])) fail(`Invalid ${field}: ${raw}.`);
        }
        if (['employee_id', 'matrix_id', 'code', 'component_code', 'professional_category', 'golongan', 'current_golongan', 'proposed_golongan'].includes(field)) record[field] = record[field].trim();
        if (['golongan', 'current_golongan', 'proposed_golongan'].includes(field) && record[field]) {
          const parsed = C.parseGolongan(record[field]);
          if (!parsed) fail(`Invalid ${field}: ${raw}.`);
          record[field] = `${parsed.salary_group}-${parsed.professional_category}${parsed.kmk_level}`;
        }
        if (['join_date', 'effective_date'].includes(field)) {
          const date = record[field];
          if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) fail(`Invalid ISO date for ${field}.`);
        }
      }
      if (required[type].includes(field) && (blank(record[field]) || (typeof record[field] === 'string' && !record[field].trim()))) fail(`${type}.${field} is required.`);
    }
    return record;
  }
  function identity(type, r) {
    if (type === 'workspace' || type === 'global_rule') return type;
    if (type === 'matrix') return r.matrix_id;
    if (type === 'matrix_entry') return JSON.stringify([r.scenario, r.golongan]);
    if (type === 'employee') return r.employee_id;
    if (type === 'employee_component') return JSON.stringify([r.employee_id, r.component_code]);
    return r.code;
  }
  function coreIssues(ws) {
    const result = C.validate(ws);
    const issues = Array.isArray(result) ? result : result.issues;
    if (!Array.isArray(issues)) fail('C.validate must return issues or {issues}.');
    return issues.map(issue => ({ severity: issue.severity, message: issue.message }));
  }
  function structural(ws) {
    if (String(ws.schemaVersion) !== '1') fail('Unsupported schema version.');
    for (const [type, collection] of Object.entries(collections)) {
      if (!Array.isArray(ws[collection])) fail(`Missing collection: ${collection}.`);
      const seen = new Set();
      for (const record of ws[collection]) {
        normalize(type, record, false, ws);
        const id = identity(type, record);
        if (seen.has(id)) fail(`Duplicate ${type}: ${id}.`);
        seen.add(id);
      }
    }
    normalize('workspace', ws.metadata);
    const rules = normalize('global_rule', ws.globalRules);
        if (rules.percentage_precision !== 2) fail('Percentage precision must be 2.');
    const matrices = new Map(ws.matrices.map(r => [r.matrix_id, r]));
    const scenarios = new Set();
    for (const matrix of ws.matrices) {
      if (scenarios.has(matrix.scenario)) fail(`Duplicate matrix scenario: ${matrix.scenario}.`);
      scenarios.add(matrix.scenario);
    }
    for (const entry of ws.matrixEntries) {
      if (!matrices.has(entry.matrix_id) || matrices.get(entry.matrix_id).scenario !== entry.scenario) fail(`Unknown or mismatched matrix reference: ${entry.matrix_id}.`);
      const code = `${entry.salary_group}-${entry.professional_category}${entry.kmk_level}`;
      if (code !== entry.golongan) fail(`Matrix dimensions disagree with Golongan: ${entry.golongan}.`);
    }
    const employees = new Set(ws.employees.map(r => r.employee_id));
    const components = new Map(ws.componentDefinitions.map(r => [r.code, r]));
    for (const r of ws.employeeComponents) {
      if (!employees.has(r.employee_id) || !components.has(r.component_code)) fail(`Unknown employee/component reference: ${r.employee_id}/${r.component_code}.`);
    }
    for (const rule of ws.bpjsRules) {
      if (!blank(rule.minimum_basis) && !blank(rule.maximum_basis) && Number(rule.minimum_basis) > Number(rule.maximum_basis)) fail(`BPJS minimum exceeds maximum: ${rule.code}.`);
    }
  }

  function normalizeAssignment(record, ws) {
    const normalized = normalize('employee_component', record);
    const definition = ws.componentDefinitions.find(d => d.code === record.component_code);
    if (definition && ['fixed', 'manual'].includes(definition.calculation_type)) {
      for (const field of ['current_value', 'proposed_value']) if (!blank(record[field])) normalized[field] = numeric(record[field], field, true, definition.rounding);
    }
    return normalized;
  }
  function exportWorkspace(ws) {
    structural(ws);
    const records = [];
    function append(type, record) {
      records.push({ schema_version: 1, record_type: type, record_id: identity(type, record), ...(type === 'employee_component' ? normalizeAssignment(record, ws) : normalize(type, record, false, ws)) });
    }
    append('workspace', ws.metadata);
    for (const [type, collection] of Object.entries(collections)) ws[collection].forEach(r => append(type, r));
    append('global_rule', ws.globalRules);
    return stringify(records, workspaceHeaders);
  }
  function importWorkspace(text) {
    const { headers, records } = table(text);
    checkHeaders(headers, workspaceHeaders, workspaceHeaders.filter(h => h !== 'generator_settings' && !own(C.paymentPolicies, h)));
    const ws = C.createWorkspace();
    for (const collection of Object.values(collections)) ws[collection] = [];
    ws.schemaVersion = 1;
    const seen = new Set(), singletons = new Set();
    for (const row of records) {
      if (row.schema_version !== '1') fail(`Unsupported schema version: ${row.schema_version}.`);
      const type = row.record_type;
      if (!own(fields, type)) fail(`Unknown record type: ${type}.`);
      if (!row.record_id.trim()) fail('record_id is required.');
      const id = JSON.stringify([type, row.record_id]);
      if (seen.has(id)) fail(`Duplicate record_id for ${type}: ${row.record_id}.`);
      seen.add(id);
      for (const h of headers.filter(h => !['schema_version', 'record_type', 'record_id'].includes(h))) if (!fields[type].includes(h) && row[h] !== '') fail(`Column ${h} is not applicable to ${type}.`);
      // Keep original decimal strings until all rules and definitions are available.
      const record = Object.fromEntries(fields[type].map(field => [field, row[field]]));
      if (collections[type]) ws[collections[type]].push(record);
      else {
        if (singletons.has(type)) fail(`Duplicate ${type} record.`);
        singletons.add(type);
        ws[type === 'workspace' ? 'metadata' : 'globalRules'] = record;
      }
    }
    if (!singletons.has('workspace') || !singletons.has('global_rule')) fail('Exactly one workspace and one global_rule record are required.');
    ws.metadata = normalize('workspace', ws.metadata);
    ws.globalRules = normalize('global_rule', ws.globalRules);
    for (const [type, collection] of Object.entries(collections)) {
      if (type !== 'employee_component') ws[collection] = ws[collection].map(record => normalize(type, record, false, ws));
    }
    ws.employeeComponents = ws.employeeComponents.map(record => normalizeAssignment(record, ws));
    structural(ws);
    return ws;
  }
  function exportEmployees(ws) { return stringify(ws.employees.map(r => normalize('employee', r, false, ws)), employeeFields); }
  function employeeDefaults() {
    return { employee_id: '', name: '', current_golongan: '', unit: '', department: '', position: '', employment_status: '', join_date: '', active: true, proposed_golongan: '', current_basic_override: '', proposed_basic_override: '', ptkp_status: '', bpjs_kesehatan: true, bpjs_ketenagakerjaan: true, pph_method: 'gross_up', pph_rate: 0, pph_fixed_override: '', notes: '' };
  }
  function preview(ws, operation) {
    const result = { workspace: clone(ws), added: 0, updated: 0, unchanged: 0, rejected: 0, issues: [] };
    try { operation(result); structural(result.workspace); result.issues.push(...coreIssues(result.workspace)); }
    catch (error) { result.issues.push({ severity: 'error', message: error.message }); }
    if (result.issues.some(issue => issue.severity === 'error') && result.rejected === 0) result.rejected = 1;
    return result;
  }
  function rowError(result, index, error) {
    result.rejected++;
    result.issues.push({ severity: 'error', message: `Row ${index + 2}: ${error.message}` });
  }
  function previewEmployees(text, ws, mode) {
    return preview(ws, result => {
      if (!['add', 'update', 'replace'].includes(mode)) fail('Employee import mode must be add, update, or replace.');
      const { headers, records } = table(text);
      checkHeaders(headers, employeeFields, mode === 'update' ? ['employee_id'] : ['employee_id', 'name', 'current_golongan']);
      const existing = new Map(result.workspace.employees.map(r => [r.employee_id, r]));
      const incoming = new Set();
      if (mode === 'replace') result.workspace.employees = [];
      records.forEach((row, index) => {
        try {
          const patch = normalize('employee', row, true, result.workspace);
          const id = patch.employee_id;
          if (incoming.has(id)) fail(`Duplicate employee ID in import: ${id}.`);
          incoming.add(id);
          const previous = existing.get(id);
          if (previous && mode === 'add') fail(`Employee ID already exists: ${id}.`);
          if (previous && own(patch, 'name') && patch.name !== previous.name) result.issues.push({ severity: 'warning', message: `Name differs for employee ${id}: ${previous.name} → ${patch.name}.` });
          const employee = { ...(mode === 'update' && previous ? previous : employeeDefaults()), ...patch };
                    normalize('employee', employee, false, result.workspace);
          if (previous && mode !== 'replace') {
            const changed = employeeFields.some(field => !Object.is(employee[field], previous[field]) && !(blank(employee[field]) && blank(previous[field])));
            if (changed) { result.workspace.employees[result.workspace.employees.indexOf(previous)] = employee; result.updated++; }
            else result.unchanged++;
          } else {
            result.workspace.employees.push(employee);
            if (previous) {
              const normalizedPrevious = normalize('employee', previous, false, result.workspace);
                            if (employeeFields.every(field => Object.is(employee[field], normalizedPrevious[field]) || (blank(employee[field]) && blank(normalizedPrevious[field])))) result.unchanged++;
              else result.updated++;
            } else result.added++;
          }
        } catch (error) { rowError(result, index, error); }
      });
      if (mode === 'update') for (const id of existing.keys()) if (!incoming.has(id)) result.issues.push({ severity: 'warning', message: `Existing employee ${id} is missing from the update file; retained unchanged.` });
      if (mode === 'replace') result.issues.push({ severity: 'warning', message: 'Replacing employees requires explicit confirmation. Referenced employees cannot be removed.' });
    });
  }
  function previewMatrix(text, ws) {
    return preview(ws, result => {
      const { headers, records } = table(text);
      checkHeaders(headers, matrixHeaders, ['scenario', 'golongan', 'basic_salary']);
      const seen = new Set(), metadata = new Map();
      records.forEach((row, index) => {
        try {
          const scenario = row.scenario.trim().toLowerCase();
          if (!enums.scenario.includes(scenario)) fail('scenario must be current or proposed.');
          const parsed = C.parseGolongan(row.golongan.trim());
          if (!parsed) fail(`Invalid Golongan: ${row.golongan}.`);
          const code = `${parsed.salary_group}-${parsed.professional_category}${parsed.kmk_level}`;
          const match = /^(\d+)-([A-Z]+)(\d+)$/.exec(code);
          if (!match) fail(`Invalid Golongan: ${code}.`);
          const key = JSON.stringify([scenario, code]);
          if (seen.has(key)) fail(`Duplicate matrix entry in import: ${scenario}/${code}.`);
          seen.add(key);
          let matrix = result.workspace.matrices.find(m => m.scenario === scenario);
          const matrixId = matrix ? matrix.matrix_id : `matrix-${scenario}`;
          const old = result.workspace.matrixEntries.find(e => e.scenario === scenario && e.golongan === code);
          const entry = normalize('matrix_entry', { matrix_id: matrixId, scenario, salary_group: Number(match[1]), professional_category: match[2], kmk_level: Number(match[3]), golongan: code, basic_salary: row.basic_salary, note: old ? old.note : '', ...Object.fromEntries(['salary_group', 'professional_category', 'kmk_level', 'note'].filter(h => own(row, h) && (h === 'note' || row[h] !== '')).map(h => [h, row[h]])) }, false, result.workspace);
          if (`${entry.salary_group}-${entry.professional_category}${entry.kmk_level}` !== code) fail('Matrix dimensions disagree with Golongan.');
          const nextMatrix = { ...(matrix || { matrix_id: matrixId, scenario, name: scenario === 'current' ? 'Current matrix' : 'Proposed matrix', effective_date: '' }) };
          for (const [column, field] of [['matrix_name', 'name'], ['effective_date', 'effective_date']]) {
            if (own(row, column)) {
              const metaKey = `${scenario}/${field}`;
              if (metadata.has(metaKey) && metadata.get(metaKey) !== row[column]) fail(`Conflicting ${column} for ${scenario}.`);
              nextMatrix[field] = row[column];
            }
          }
          const normalizedMatrix = normalize('matrix', nextMatrix);
          for (const [column, field] of [['matrix_name', 'name'], ['effective_date', 'effective_date']]) if (own(row, column)) metadata.set(`${scenario}/${field}`, row[column]);
          const matrixChanged = matrix && fields.matrix.some(h => normalizedMatrix[h] !== (matrix[h] ?? ''));
          if (matrix) result.workspace.matrices[result.workspace.matrices.indexOf(matrix)] = normalizedMatrix;
          else result.workspace.matrices.push(normalizedMatrix);
          if (old) {
            if (matrixChanged || fields.matrix_entry.some(h => !Object.is(entry[h], old[h]))) { result.workspace.matrixEntries[result.workspace.matrixEntries.indexOf(old)] = entry; result.updated++; }
            else result.unchanged++;
          } else { result.workspace.matrixEntries.push(entry); result.added++; }
        } catch (error) { rowError(result, index, error); }
      });
    });
  }
  function exportMatrix(ws, scenario) {
    if (!enums.scenario.includes(scenario)) fail('scenario must be current or proposed.');
    const records = ws.matrixEntries.filter(e => e.scenario === scenario).map(entry => {
      const matrix = ws.matrices.find(m => m.matrix_id === entry.matrix_id && m.scenario === scenario);
      if (!matrix) fail(`Unknown matrix reference: ${entry.matrix_id}.`);
      return { ...normalize('matrix_entry', entry, false, ws), matrix_name: matrix.name, effective_date: matrix.effective_date };
    });
    return stringify(records, matrixHeaders);
  }
  function exportResults(result) {
    if (!result || !Array.isArray(result.employees)) fail('Invalid payroll result.');
    const issues = [...(result.issues || []), ...result.employees.flatMap(e => e.issues || [])];
    if (issues.some(issue => issue.severity === 'error') || result.valid === false) fail('Cannot export results with blocking validation errors.');
    const rows = result.employees.map(employee => {
      const row = Object.fromEntries(resultHeaders.slice(0, 6).map(h => [h, employee[h]]));
      for (const metric of ['basic_salary', 'gross', 'employee_bpjs', 'employer_bpjs', 'pph', 'deductions', 'take_home_pay', 'employer_cost']) {
        for (const scenario of enums.scenario) {
          const value = employee[scenario] && employee[scenario][metric];
          if (blank(value)) fail(`Missing result metric ${scenario}.${metric}.`);
          row[`${scenario}_${metric}`] = numeric(value, metric, true);
        }
      }
      for (const [metric, prefix] of [['basic_salary', 'basic'], ['gross', 'gross'], ['take_home_pay', 'thp'], ['employer_cost', 'employer_cost']]) {
        const change = employee.changes && employee.changes[metric];
        if (!change || blank(change.amount)) fail(`Missing result change ${metric}.`);
        row[`${prefix}_change`] = numeric(change.amount, 'change', true);
        if (metric !== 'employer_cost') row[`${prefix}_change_percent`] = blank(change.percent) ? '' : numeric(change.percent, 'percent', false);
      }
      row.validation_status = (employee.issues || []).some(issue => issue.severity === 'warning') ? 'warning' : 'valid';
      return row;
    });
    return stringify(rows, resultHeaders);
  }

  C.csv = { parse, stringify, exportWorkspace, importWorkspace, exportEmployees, previewEmployees, previewMatrix, exportMatrix, exportResults };
})(globalThis.Caroll = globalThis.Caroll || {});
