(function () {
  'use strict';
  const C = globalThis.Caroll = globalThis.Caroll || {};
  const U = C.ui = {};
  // Shift decimal digits, never binary floating-point values. Keep rates as strings
  // so payroll's decimal arithmetic receives exactly what the user entered.
  U.scaleDecimal = (value, places) => {
    if (value === '' || value === null || value === undefined) return '';
    const text = String(value).trim();
    const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(text);
    if (!match || !Number.isSafeInteger(places)) throw new Error('Angka desimal tidak valid.');
    const exponent = Number(match[5] || 0);
    if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 1000 || Math.abs(places) > 1000 || text.length > 2000) throw new Error('Presisi desimal melebihi batas yang didukung.');
    const integer = match[2] || '0';
    const digits = integer + (match[3] || match[4] || '');
    const position = integer.length + exponent + places;
    const expanded = position <= 0 ? '0.' + '0'.repeat(-position) + digits : position >= digits.length ? digits + '0'.repeat(position - digits.length) : digits.slice(0, position) + '.' + digits.slice(position);
    let [whole, fraction = ''] = expanded.split('.');
    whole = whole.replace(/^0+(?=\d)/, '');
    fraction = fraction.replace(/0+$/, '');
    const normalized = whole + (fraction ? '.' + fraction : '');
    return (match[1] === '-' && normalized !== '0' ? '-' : '') + normalized;
  };
  U.percentToRate = value => U.scaleDecimal(value, -2);
  U.rateToPercent = value => U.scaleDecimal(value, 2);
  U.rateDisplay = value => {
    const text = U.rateToPercent(value);
    return text === '' ? '—' : text.replace('.', ',') + '%';
  };
  // Workspace parsing already enforces structure; payroll errors describe an
  // unfinished draft, whereas partial employee/matrix imports remain atomic.
  U.importBlocked = (kind, preview) => Number(preview.rejected) > 0 || (kind !== 'workspace' && preview.issues.some(i => i.severity === 'error'));
  U.el = function (tag, attrs, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value === undefined || value === null || value === false) continue;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
      else if (key === 'checked' || key === 'disabled' || key === 'required' || key === 'multiple') node[key] = Boolean(value);
      else node.setAttribute(key, String(value));
    }
    children.flat(Infinity).forEach(child => {
      if (child !== undefined && child !== null && child !== false) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  };
  const h = U.el;
  U.money = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? '—' : new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
  U.percent = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? 'N/A' : new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value) + '%';
  U.badge = (text, kind = '') => h('span', { class: 'badge ' + kind }, text);
  U.button = (text, action, data = {}, kind = '') => h('button', { type: 'button', class: kind, 'data-action': action, ...Object.fromEntries(Object.entries(data).map(([k, v]) => ['data-' + k, v])) }, text);
  U.actions = (...buttons) => h('div', { class: 'actions' }, buttons);
  U.heading = (title, description, ...actions) => h('div', { class: 'page-heading' }, h('div', {}, h('h1', {}, title), h('p', { class: 'subtitle' }, description)), U.actions(actions));
  U.panel = (title, body, actions) => h('section', { class: 'panel' }, h('div', { class: 'panel-head' }, h('h2', {}, title), actions), body);
  U.empty = (title, text, ...actions) => h('div', { class: 'empty' }, h('h2', {}, title), h('p', {}, text), U.actions(actions));
  U.table = (headers, rows) => h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, headers.map(t => h('th', { scope: 'col' }, t)))), h('tbody', {}, rows.length ? rows.map(row => h('tr', {}, row.map(cell => h('td', {}, cell)))) : h('tr', {}, h('td', { colspan: headers.length }, U.empty('Belum ada baris', 'Tambahkan data atau sesuaikan filter.'))))));
  U.matrixGrid = (allEntries, scenario, matrices, period) => {
    // Retain source indexes before filtering: duplicate coordinates remain editable.
    const entries = allEntries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.scenario === scenario);
    if (!entries.length) return U.empty('Belum ada entri matriks', 'Tambahkan entri atau impor CSV untuk menampilkan kelompok gaji pada skenario ini. Sel kosong bukan gaji nol.', U.button('Tambah entri', 'edit', { collection: 'matrixEntries' }, 'primary'), U.button('Impor CSV', 'import', { kind: 'matrix' }));
    const sorted = values => [...new Set(values.map(String))].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
    const groups = sorted(entries.map(({ entry }) => entry.salary_group));
    const standard = ['PM', 'P', 'M', 'U'];
    const categories = [...standard, ...sorted(entries.map(({ entry }) => entry.professional_category)).filter(category => !standard.includes(category))];
    const levels = sorted([...Array.from({ length: 15 }, (_, i) => i + 1), ...entries.map(({ entry }) => entry.kmk_level)]);
    const cells = new Map();
    const key = (group, level, category) => JSON.stringify([String(group), String(level), String(category)]);
    entries.forEach(item => {
      const { salary_group, kmk_level, professional_category } = item.entry;
      const coordinate = key(salary_group, kmk_level, professional_category);
      if (!cells.has(coordinate)) cells.set(coordinate, []);
      cells.get(coordinate).push(item);
    });
    const names = matrices.filter(matrix => matrix.scenario === scenario).map(matrix => matrix.name || matrix.matrix_id);
    return h('section', { class: 'matrix-sheet', 'aria-label': 'Grid matriks gaji' },
      h('header', { class: 'matrix-sheet-heading' },
        h('h2', {}, names.join(' · ') || 'Matriks gaji'),
        h('p', {}, (scenario === 'current' ? 'Saat ini' : 'Usulan') + ' · Periode: ' + (period || 'Belum diisi')),
        h('p', { class: 'muted' }, 'Rupiah penuh (Rp), bukan ribuan. — = belum ada entri. Geser horizontal untuk melihat kelompok lainnya.')),
      h('div', { class: 'matrix-blocks', tabindex: '0', role: 'region', 'aria-label': 'Tabel kelompok gaji, dapat digeser horizontal' }, groups.map(group =>
        h('table', { class: 'matrix-group' },
          h('caption', {}, 'KELOMPOK GAJI ' + group),
          h('thead', {},
            h('tr', {}, h('th', { scope: 'col', rowspan: 2 }, 'Kel. MK'), h('th', { scope: 'colgroup', colspan: categories.length }, 'PROFESIONALISME')),
            h('tr', {}, categories.map(category => h('th', { scope: 'col' }, category)))),
          h('tbody', {}, levels.map(level => h('tr', {},
            h('th', { scope: 'row' }, 'KMK' + level),
            categories.map(category => {
              const matches = cells.get(key(group, level, category)) || [];
              return h('td', { class: 'money' }, matches.length ? matches.map(({ entry, index }, duplicateIndex) => {
                const label = 'Edit golongan ' + entry.golongan + ' · Kelompok gaji ' + group + ' · ' + category + ' · KMK' + level + ' · Matriks ' + entry.matrix_id + ' · ' + U.money(entry.basic_salary) + (matches.length > 1 ? ' · Entri ' + (duplicateIndex + 1) + ' dari ' + matches.length : '');
                return h('button', { type: 'button', class: 'matrix-salary', 'data-action': 'edit', 'data-collection': 'matrixEntries', 'data-index': index, 'aria-label': label, title: label },
                  U.money(entry.basic_salary), matches.length > 1 ? h('small', {}, entry.matrix_id + ' · Entri ' + (duplicateIndex + 1)) : null);
              }) : h('span', { class: 'matrix-missing', 'aria-label': 'Belum ada entri · Kelompok gaji ' + group + ' · ' + category + ' · KMK' + level }, '—'));
            }))))))));
  };
  U.amount = value => h('span', { class: 'money' }, U.money(value));
  U.delta = change => h('span', { class: (change?.amount > 0 ? 'positive' : change?.amount < 0 ? 'negative' : 'muted') }, (change?.amount > 0 ? '+' : '') + U.money(change?.amount), ' · ', U.percent(change?.percent));
  U.translate = value => {
      const exact = { 'Estimasi PPh 21 is disabled; results exclude tax': 'Estimasi PPh 21 dinonaktifkan; hasil belum memperhitungkan pajak', 'PTKP status is blank': 'Status PTKP belum diisi', 'Proposed basic salary is lower than current': 'Gaji pokok usulan lebih rendah daripada saat ini', 'Proposed take-home pay is lower than current': 'Take-home pay usulan lebih rendah daripada saat ini', 'Golongan salary group changes': 'Kelompok gaji pada golongan berubah', 'Golongan professional category changes': 'Kategori profesional pada golongan berubah', 'Currency must be IDR': 'Mata uang harus IDR', 'Percentage precision must be 2': 'Presisi persen harus 2', 'Missing employee name': 'Nama karyawan belum diisi', 'Missing current Golongan': 'Golongan saat ini belum diisi', 'Basic salary': 'Gaji pokok', 'matrix': 'Matriks', 'override': 'Override manual', 'manual_override': 'Override manual', 'percentage': 'Persentase', 'earning': 'Pendapatan', 'employee_deduction': 'Potongan karyawan', 'employer_contribution': 'Kontribusi pemberi kerja', 'fixed': 'Nominal tetap', 'manual': 'Nominal manual', 'percentage_basic': 'Persentase gaji pokok', 'percentage_gross': 'Persentase bruto', 'assignment': 'Penugasan', 'default': 'Default komponen' };
      const text = String(value ?? '');
      if (Object.hasOwn(exact, text)) return exact[text];
      const patterns = [[/^Invalid numeric input for /, 'Angka tidak valid untuk '], [/^Invalid rounding for /, 'Pembulatan tidak valid untuk '], [/^Invalid boolean for /, 'Nilai ya/tidak tidak valid untuk '], [/^Employee excluded from /, 'Karyawan tidak mengikuti '], [/^Unresolved current basic salary$/, 'Gaji pokok saat ini belum terpetakan'], [/^Unresolved proposed basic salary$/, 'Gaji pokok usulan belum terpetakan'], [/^current override differs from matrix salary$/, 'Override saat ini berbeda dari gaji matriks'], [/^proposed override differs from matrix salary$/, 'Override usulan berbeda dari gaji matriks'], [/^Unknown or mismatched matrix reference: /, 'Referensi matriks tidak ditemukan atau skenarionya berbeda: '], [/^Unknown employee reference: /, 'Referensi karyawan tidak ditemukan: '], [/^Unknown referenced component: /, 'Komponen rujukan tidak ditemukan: '], [/^Zero or negative component value: /, 'Nilai komponen nol atau negatif: '], [/^Manual component requires a value: /, 'Komponen manual memerlukan nilai: '], [/^BPJS minimum basis exceeds maximum: /, 'Batas minimum BPJS melebihi maksimum: '], [/^Matrix Golongan does not match its dimensions: /, 'Golongan matriks tidak sesuai dengan kelompok/kategori/KMK: '], [/^Unsupported schema version: /, 'Versi skema belum didukung: '], [/^Duplicate /, 'Duplikasi '], [/^Missing /, 'Belum diisi: '], [/^Invalid /, 'Tidak valid: ']];
      for (const [pattern, replacement] of patterns) if (pattern.test(text)) return text.replace(pattern, replacement);
      return text;
    };
    U.issues = issues => h('ul', { class: 'issues' }, (issues || []).map(i => h('li', { class: i.severity === 'error' ? 'error' : 'warning' }, h('strong', {}, i.severity === 'error' ? 'Kesalahan' : 'Peringatan'), i.employee_id ? ' · ' + i.employee_id : '', ' — ', U.translate(i.message))));
  U.notice = text => h('div', { class: 'notice' }, text);
  U.cards = entries => h('div', { class: 'cards' }, entries.map(([label, value, caption]) => h('div', { class: 'card' }, h('div', { class: 'label' }, label), h('div', { class: 'value' }, value), h('div', { class: 'muted' }, caption || ''))));
  U.toast = text => {
    const host = document.getElementById('notifications');
    host.replaceChildren(h('div', { class: 'toast' }, text));
    clearTimeout(U.toastTimer);
    U.toastTimer = setTimeout(() => host.replaceChildren(), 6500);
  };
  U.close = () => document.getElementById('dialog').close();
  U.dialog = (title, body, buttons = []) => {
    const dialog = document.getElementById('dialog');
    if (dialog.open) dialog.close();
    dialog.replaceChildren(h('div', { class: 'dialog-header' }, h('h2', { id: 'dialog-title' }, title), h('button', { type: 'button', 'aria-label': 'Tutup dialog', onclick: U.close }, '×')), h('div', { class: 'dialog-body' }, body), h('div', { class: 'dialog-footer' }, h('button', { type: 'button', onclick: U.close }, 'Batal'), buttons));
    dialog.showModal();
    return dialog;
  };
  U.confirm = (title, body, accept, label = 'Ya, lanjutkan') => U.dialog(title, body, [h('button', { type: 'button', class: 'primary', onclick: () => { try { accept(); } catch (e) { U.toast(e.message); } } }, label)]);
  const f = (key, label, type = 'text', extra = {}) => ({ key, label, type, ...extra });
  const bool = (key, label, value = false) => f(key, label, 'checkbox', { default: value });
  const choice = (key, label, options, value) => f(key, label, 'select', { options, default: value });
  const rounding = key => choice(key || 'rounding', 'Pembulatan uang', [[1, 'Rupiah terdekat'], [100, 'Ratusan terdekat'], [1000, 'Ribuan terdekat']], 1);
  const money = (key, label, optional = false) => f(key, label + ' (Rp)', 'number', { optional, step: 1, min: 0 });
  const rate = (key, label, optional = false) => f(key, label + ' (%)', 'rate', { optional, min: 0, max: 100, help: 'Masukkan 9 untuk 9%; CSV menyimpan 0.09.' });
  U.schemas = {
    metadata: [f('name', 'Nama workspace', 'text', { required: true }), f('current_period', 'Periode saat ini'), f('proposed_period', 'Periode usulan')],
    matrices: [f('matrix_id', 'ID matriks', 'text', { required: true }), f('name', 'Nama matriks', 'text', { required: true }), choice('scenario', 'Skenario', [['current', 'Saat ini'], ['proposed', 'Usulan']], 'current'), f('effective_date', 'Tanggal berlaku', 'date')],
    matrixEntries: [f('matrix_id', 'ID matriks', 'select', { required: true, options: [] }), choice('scenario', 'Skenario', [['current', 'Saat ini'], ['proposed', 'Usulan']], 'current'), f('salary_group', 'Kelompok gaji', 'number', { min: 1, step: 1, required: true }), f('professional_category', 'Kategori profesional', 'text', { required: true, help: 'Contoh: PM, P, M, U. Bukan ditentukan otomatis dari jabatan.' }), f('kmk_level', 'Tingkat KMK', 'number', { min: 1, step: 1, required: true }), f('golongan', 'Golongan (dibuat otomatis)', 'text', { readonly: true }), money('basic_salary', 'Gaji pokok'), f('note', 'Catatan', 'textarea')],
    employees: [f('employee_id', 'ID karyawan', 'text', { required: true }), f('name', 'Nama karyawan', 'text', { required: true }), f('unit', 'Unit'), f('department', 'Departemen'), f('position', 'Jabatan'), f('employment_status', 'Status kepegawaian'), f('join_date', 'Tanggal bergabung', 'date'), bool('active', 'Karyawan aktif', true), f('current_golongan', 'Golongan saat ini', 'text', { list: 'golongan-list' }), f('proposed_golongan', 'Golongan usulan', 'text', { list: 'golongan-list', help: 'Kosong mengikuti golongan saat ini jika aturan global diaktifkan.' }), money('current_basic_override', 'Override gaji pokok saat ini', true), money('proposed_basic_override', 'Override gaji pokok usulan', true), f('ptkp_status', 'Status PTKP', 'text', { help: 'Isikan status yang sudah diverifikasi, misalnya TK/0.' }), bool('bpjs_kesehatan', 'Peserta BPJS Kesehatan'), bool('bpjs_ketenagakerjaan', 'Peserta BPJS Ketenagakerjaan'), choice('pph_method', 'Metode estimasi PPh 21', [['gross', 'Gross — dipotong dari THP'], ['net', 'Net — dibayar pemberi kerja'], ['gross_up', 'Gross-up — tunjangan pajak']], 'gross'), rate('pph_rate', 'Tarif efektif bulanan manual', true), money('pph_fixed_override', 'Override PPh bulanan', true), f('notes', 'Catatan', 'textarea')],
    componentDefinitions: [f('code', 'Kode komponen', 'text', { required: true }), f('name', 'Nama komponen', 'text', { required: true }), f('category', 'Kategori'), choice('direction', 'Arah komponen', [['earning', 'Pendapatan'], ['employee_deduction', 'Potongan karyawan'], ['employer_contribution', 'Kontribusi pemberi kerja']], 'earning'), choice('calculation_type', 'Jenis perhitungan', [['fixed', 'Nominal tetap'], ['percentage_basic', 'Persentase gaji pokok'], ['percentage_gross', 'Persentase bruto sebelum pajak'], ['manual', 'Nominal manual']], 'fixed'), f('default_value', 'Nilai default', 'number', { step: 'any', default: 0, help: 'Rp untuk nominal; persen untuk jenis persentase (9 berarti 9%).' }), bool('taxable', 'Termasuk basis pajak'), bool('bpjs_kesehatan', 'Termasuk basis BPJS Kesehatan'), bool('bpjs_ketenagakerjaan', 'Termasuk basis BPJS Ketenagakerjaan'), bool('applies_current', 'Berlaku saat ini', true), bool('applies_proposed', 'Berlaku pada usulan', true), bool('active', 'Komponen aktif', true), rounding(), f('notes', 'Catatan', 'textarea')],
    bpjsRules: [f('code', 'Kode program', 'text', { required: true, help: 'Gunakan kesehatan, jht, jp, jkk, atau jkm sesuai program.' }), f('name', 'Nama program', 'text', { required: true }), rate('employee_rate', 'Tarif karyawan'), rate('employer_rate', 'Tarif pemberi kerja'), money('minimum_basis', 'Batas minimum basis', true), money('maximum_basis', 'Batas maksimum basis', true), choice('basis', 'Dasar perhitungan', [['basic', 'Gaji pokok'], ['selected', 'Pokok + komponen terpilih'], ['gross', 'Pendapatan bruto']], 'basic'), bool('employee_enabled', 'Aktifkan kontribusi karyawan', true), bool('employer_enabled', 'Aktifkan kontribusi pemberi kerja', true), rounding(), bool('active', 'Program aktif', true)],
    globalRules: [choice('currency', 'Mata uang', [['IDR', 'Rupiah (IDR)']], 'IDR'), rounding(), choice('percentage_precision', 'Presisi tampilan persen', [[2, '2 angka desimal']], 2), bool('include_inactive', 'Sertakan karyawan nonaktif'), bool('allow_negative_thp', 'Izinkan take-home pay negatif'), bool('proposed_defaults_current', 'Golongan usulan kosong mengikuti saat ini', true), bool('tax_enabled', 'Aktifkan estimasi PPh 21'), choice('tax_basis', 'Basis estimasi PPh 21', [['taxable', 'Penghasilan kena pajak terpilih'], ['gross', 'Bruto'], ['basic', 'Gaji pokok']], 'taxable'), choice('tax_rounding', 'Pembulatan estimasi PPh 21', [[1, 'Rupiah terdekat']], 1)]
  };
  U.field = (spec, value) => {
    const id = 'field-' + spec.key;
    const attrs = { id, name: spec.key, required: spec.required, readonly: spec.readonly ? '' : null, min: spec.min, max: spec.max, step: spec.step ?? (spec.type === 'rate' ? 'any' : undefined), list: spec.list };
    let input;
    if (spec.type === 'select') {
      input = h('select', attrs, (spec.options || []).map(([val, label]) => h('option', { value: val }, label)));
      input.value = String(value ?? spec.default ?? '');
    } else if (spec.type === 'textarea') input = h('textarea', attrs, value ?? spec.default ?? '');
    else input = h('input', { ...attrs, type: spec.type === 'rate' ? 'number' : spec.type, checked: spec.type === 'checkbox' && Boolean(value ?? spec.default), value: spec.type === 'checkbox' ? 'true' : spec.type === 'rate' && value !== '' && value !== null && value !== undefined ? U.rateToPercent(value) : value ?? spec.default ?? '' });
    if ((spec.type === 'number' || spec.type === 'rate') && !spec.optional && !spec.readonly) input.required = true;
    return h('label', { class: 'field' + (spec.type === 'checkbox' ? ' check' : '') + (spec.type === 'textarea' ? ' full' : ''), for: id }, spec.type === 'checkbox' ? input : null, h('span', {}, spec.label), spec.type !== 'checkbox' ? input : null, spec.help ? h('small', {}, spec.help) : null);
  };
  U.readForm = (form, schema) => {
    const data = {};
    for (const spec of schema) {
      const input = form.elements.namedItem(spec.key);
      if (spec.type === 'checkbox') data[spec.key] = input.checked;
      else if (spec.type === 'number' || spec.type === 'rate') {
        const value = input.value.trim();
        if (value === '' && spec.optional) data[spec.key] = '';
        else {
          const percentage = spec.type === 'rate' || (spec.key === 'default_value' && form.elements.namedItem('calculation_type')?.value.startsWith('percentage'));
          if (percentage) {
            if (value === '') throw new Error(spec.label + ': angka wajib diisi.');
            data[spec.key] = U.percentToRate(value);
          }
          else {
            const number = Number(value);
            if (value === '' || !Number.isFinite(number)) throw new Error(spec.label + ': angka tidak valid. Masukkan angka tanpa pemisah ribuan.');
            if ((spec.step === 1 || spec.step === '1') && !Number.isSafeInteger(number)) throw new Error(spec.label + ': harus berupa bilangan bulat dalam batas aman.');
            data[spec.key] = number;
          }
        }
      } else if (['rounding', 'tax_rounding', 'percentage_precision'].includes(spec.key)) data[spec.key] = Number(input.value);
      else data[spec.key] = input.value.trim();
    }
    return data;
  };
  U.form = (title, schema, record, onSave, extra, onReady) => {
    const error = h('div', { role: 'alert', hidden: '' });
    const form = h('form', { id: 'record-form' }, error, extra, h('div', { class: 'form-grid' }, schema.map(spec => U.field(spec, record[spec.key]))));
    form.addEventListener('submit', event => {
      event.preventDefault();
      try { onSave(U.readForm(form, schema), form); } catch (e) { error.hidden = false; error.className = 'form-error'; error.textContent = e.message; error.scrollIntoView({ block: 'nearest' }); }
    });
    U.dialog(title, form, [h('button', { type: 'submit', form: 'record-form', class: 'primary' }, 'Simpan perubahan')]);
    if (onReady) onReady(form);
    return form;
  };
  U.filter = (key, label, values, selected) => {
    const select = h('select', { 'data-filter': key, 'aria-label': label }, h('option', { value: '' }, label), values.map(v => h('option', { value: Array.isArray(v) ? v[0] : v }, Array.isArray(v) ? v[1] : v)));
    select.value = selected || '';
    return select;
  };
  U.search = value => h('input', { type: 'search', 'data-filter': 'search', 'aria-label': 'Cari ID atau nama karyawan', placeholder: 'Cari ID atau nama karyawan…', value: value || '' });
  const labels = { code: 'Kode', name: 'Nama', category: 'Kategori', direction: 'Arah', calculation_type: 'Jenis perhitungan', basis: 'Basis', rate: 'Tarif', amount: 'Nominal', value: 'Nilai', rounding: 'Pembulatan', source: 'Sumber', note: 'Catatan', notes: 'Catatan', formula: 'Rumus', taxable: 'Kena pajak', current: 'Saat ini', proposed: 'Usulan', basic_salary: 'Gaji pokok', gross: 'Bruto', employee_bpjs: 'BPJS karyawan', employer_bpjs: 'BPJS pemberi kerja', pph: 'Estimasi PPh 21', deductions: 'Potongan', take_home_pay: 'Take-home pay', employer_cost: 'Biaya pemberi kerja', employer_contributions: 'Kontribusi pemberi kerja', tax_allowance: 'Tunjangan pajak', employer_tax_cost: 'Pajak pemberi kerja', manual: 'Manual', override: 'Override', employee_rate: 'Tarif karyawan', employer_rate: 'Tarif pemberi kerja', minimum_basis: 'Batas minimum', maximum_basis: 'Batas maksimum', raw_basis: 'Basis awal', capped_basis: 'Basis setelah batas', employee_amount: 'Kontribusi karyawan', employer_amount: 'Kontribusi pemberi kerja' };
  U.labels = labels;
  U.object = value => {
    if (value === null || value === undefined || value === '') return h('span', { class: 'muted' }, '—');
    if (Array.isArray(value)) return h('div', {}, value.length ? value.map(U.object) : h('p', { class: 'muted' }, 'Tidak ada rincian.'));
    if (typeof value === 'object') return h('dl', { class: 'detail-object' }, Object.entries(value).map(([key, val]) => [h('dt', {}, labels[key] || key.replaceAll('_', ' ')), h('dd', {}, key.includes('rate') && val !== null && val !== undefined && val !== '' ? U.rateDisplay(val) : typeof val === 'number' ? new Intl.NumberFormat('id-ID', { maximumFractionDigits: 4 }).format(val) : U.object(val))]));
    return h('span', {}, typeof value === 'boolean' ? value ? 'Ya' : 'Tidak' : U.translate(value));
  };
})();
