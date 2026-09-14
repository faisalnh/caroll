(function () {
  'use strict';
  const C = globalThis.Caroll;
  const U = C.ui;
  const h = U.el;
  const sections = { workspace: ['Workspace', 'Kelola file dan mulai perencanaan payroll Anda.'], matrix: ['Matriks gaji', 'Susun gaji pokok berdasarkan golongan, kelompok, dan masa kerja.'], employees: ['Karyawan', 'Kelola data karyawan dan bandingkan penempatan golongan.'], components: ['Komponen payroll', 'Atur pendapatan, potongan, dan kontribusi pemberi kerja.'], rules: ['Aturan perhitungan', 'Tinjau parameter BPJS, estimasi PPh 21, dan aturan global.'], simulation: ['Simulasi payroll', 'Lihat dampak usulan terhadap karyawan dan biaya organisasi.'] };
  const state = { workspace: null, dirty: false, section: 'workspace', filename: '', demo: false, scenario: 'current', matrixType: '', matrixId: '', matrixView: 'grid', filters: {}, result: null, issues: [] };
  const clone = value => JSON.parse(JSON.stringify(value));
  const ws = () => state.workspace;
  const unique = values => [...new Set(values.filter(v => v !== undefined && v !== null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true }));
  const rows = name => ws()?.[name] || [];
  const knownTypes = () => unique(rows('matrices').map(m => C.normalizeMatrixType(m.matrix_type)).filter(Boolean));
  const typeEntries = (employee, scenario) => {
    const type = C.resolveMatrixType(ws(), employee, scenario);
    const parents = rows('matrices').filter(m => m.scenario === scenario && type && C.normalizeMatrixType(m.matrix_type) === type);
    return parents.length === 1 ? rows('matrixEntries').filter(e => e.matrix_id === parents[0].matrix_id && e.scenario === scenario) : [];
  };
  const selectedMatrices = () => rows('matrices').filter(m => m.scenario === state.scenario && (C.normalizeMatrixType(m.matrix_type) || '__legacy') === state.matrixType);
  const selectedEntries = () => rows('matrixEntries').filter(e => e.scenario === state.scenario && e.matrix_id === state.matrixId);
  const hasBasicOverride = (e, scenario) => e[scenario + '_basic_override'] !== '' && e[scenario + '_basic_override'] != null;
  const dirtyWarning = () => state.dirty ? 'Ada perubahan belum disimpan. Ekspor workspace terlebih dahulu jika ingin menyimpannya. ' : '';
  const getIssues = () => ws() ? C.validate(ws()) : [];
  function mutate(change) {
    const candidate = clone(ws());
    change(candidate);
    state.workspace = candidate;
    state.dirty = true;
    state.result = null;
    render();
  }
  function replace(workspace, saved, filename = '', demo = false) {
    state.workspace = workspace;
    state.dirty = !saved;
    state.filename = filename;
    state.demo = demo;
    state.result = null;
    state.filters = {};
    state.matrixType = ''; state.matrixId = ''; state.scenario = 'current';
    state.section = 'workspace';
    U.close();
    render();
  }
  function download(text, filename) {
    if (typeof text !== 'string') throw new Error('Ketidakcocokan API CSV: ekspor harus menghasilkan teks CSV.');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const link = h('a', { href: url, download: filename });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function confirmMutation(title, message, change) {
    U.confirm(title, h('p', {}, message), () => { mutate(change); U.close(); U.toast('Perubahan diterapkan. Ekspor workspace untuk menyimpan.'); }, 'Terapkan perubahan');
  }
  function controls(editAction, index, collection, duplicate = false) {
    return U.actions(U.button('Edit', editAction, { index, collection }, 'small'), duplicate ? U.button('Duplikat', 'duplicate', { index, collection }, 'small') : null, U.button('Hapus', 'delete', { index, collection }, 'small danger'));
  }
  function requireWorkspace() {
    if (!ws()) { U.toast('Buat atau buka workspace terlebih dahulu.'); return false; }
    return true;
  }
  function render() {
    state.issues = getIssues();
    document.getElementById('workspace-name').textContent = ws()?.metadata?.name || 'Workspace baru';
    const status = document.getElementById('save-status');
    status.textContent = !ws() ? 'Belum ada data' : state.dirty ? 'Belum disimpan' : 'Tersimpan sebagai CSV';
    status.className = 'badge' + (state.dirty ? ' warning' : '');
    document.querySelector('[data-action="export-workspace"]').disabled = !ws();
    document.getElementById('navigation').replaceChildren(...Object.entries(sections).map(([key, [label]], index) => h('button', { type: 'button', 'data-action': 'navigate', 'data-section': key, 'aria-current': state.section === key ? 'page' : null }, h('span', { class: 'nav-number', 'aria-hidden': 'true' }, String(index + 1).padStart(2, '0')), label)));
    const main = document.getElementById('main');
    main.replaceChildren();
    if (state.demo) main.append(U.notice('DEMO FIKTIF — nama, gaji, tarif, dan batas pada data contoh hanya untuk latihan, bukan ketentuan hukum atau data payroll nyata.'));
    if (!ws() && state.section !== 'workspace') main.append(U.heading(...sections[state.section]), U.empty('Mulai dari workspace', 'Buat workspace kosong atau coba data fiktif untuk menjelajahi fitur.', U.button('Buat workspace baru', 'new', {}, 'primary'), U.button('Buka workspace CSV', 'import', { kind: 'workspace' }), U.button('Coba data contoh', 'sample')));
    else ({ workspace: renderWorkspace, matrix: renderMatrix, employees: renderEmployees, components: renderComponents, rules: renderRules, simulation: renderSimulation })[state.section](main);
  }
  function renderWorkspace(main) {
    main.append(U.heading(...sections.workspace, U.button('Buka workspace CSV', 'import', { kind: 'workspace' }), U.button('Buat workspace baru', 'new', {}, 'primary')));
    if (!ws()) {
      main.append(h('section', { class: 'hero' }, h('div', {}, h('span', { class: 'hero-label' }, 'RENCANAKAN DENGAN LEBIH PASTI'), h('h2', {}, 'Usulan gaji, terlihat dampaknya.'), h('p', {}, 'Bandingkan payroll saat ini dan usulan dalam satu workspace. Seluruh perhitungan berjalan di browser Anda — tanpa mengunggah data ke mana pun.'), U.actions(U.button('Buat workspace baru', 'new', {}, 'primary'), U.button('Buka workspace CSV', 'import', { kind: 'workspace' }), U.button('Coba data contoh', 'sample')))));
      main.append(U.cards([['01 / Siapkan', 'Matriks', 'Tetapkan gaji berdasarkan golongan'], ['02 / Lengkapi', 'Karyawan', 'Tambahkan komponen dan aturan'], ['03 / Bandingkan', 'Simulasi', 'Tinjau perubahan dan ekspor hasil']]));
      main.append(U.notice('File CSV adalah satu-satunya penyimpanan. Data di layar hilang saat halaman ditutup atau dimuat ulang. Caroll merupakan alat simulasi, bukan sistem pembayaran payroll atau pelaporan pajak.'));
      return;
    }
    const errors = state.issues.filter(i => i.severity === 'error').length;
    const warnings = state.issues.filter(i => i.severity === 'warning').length;
    main.append(U.cards([['Karyawan', rows('employees').length, rows('employees').filter(e => e.active).length + ' aktif'], ['Entri matriks', rows('matrixEntries').length, 'Saat ini & usulan'], ['Komponen', rows('componentDefinitions').length, 'Definisi payroll'], ['Kesalahan', errors, 'Menghalangi perhitungan'], ['Peringatan', warnings, 'Perlu ditinjau']]));
    main.append(h('div', { class: 'two-column' }, U.panel('Informasi workspace', h('div', {}, U.object({ name: ws().metadata.name, current: ws().metadata.current_period, proposed: ws().metadata.proposed_period, 'File terakhir dibuka': state.filename || 'Belum ada file', 'Penyimpanan': state.dirty ? 'Belum disimpan' : 'CSV diimpor / ekspor diminta' }), U.notice('Ekspor workspace menyimpan seluruh data. Ekspor karyawan atau hasil simulasi tidak menggantikan backup workspace.')), U.button('Edit informasi', 'edit-metadata', {}, 'small')), U.panel('Alur kerja', h('div', {}, [['matrix', 'Susun matriks gaji', 'Tetapkan matriks saat ini dan usulan.'], ['employees', 'Lengkapi data karyawan', 'Periksa golongan dan override manual.'], ['components', 'Atur komponen & aturan', 'Verifikasi tarif dan dasar perhitungan.'], ['simulation', 'Jalankan perbandingan', 'Tinjau rincian sebelum mengekspor.']].map(([section, label, text], index) => h('div', { class: 'step' }, h('span', {}, '0' + (index + 1)), h('div', {}, U.button(label, 'navigate', { section }, 'small'), h('p', {}, text))))))));
    main.append(U.panel('File & data', U.actions(U.button('Impor karyawan CSV', 'import', { kind: 'employees' }), U.button('Ekspor karyawan CSV', 'export-employees'), U.button('Ekspor hasil payroll', 'export-results'), U.button('Coba data contoh', 'sample'), U.button('Hapus semua data dari layar', 'reset', {}, 'danger'))));
    main.append(U.panel('Pemeriksaan workspace', state.issues.length ? U.issues(state.issues) : h('p', { class: 'muted' }, 'Tidak ada masalah validasi yang terdeteksi.')));
  }
  function renderMatrix(main) {
    const types = unique(rows('matrices').filter(m => m.scenario === state.scenario).map(m => C.normalizeMatrixType(m.matrix_type)));
    if (!state.matrixType) state.matrixType = types[0] || (rows('matrices').some(m => m.scenario === state.scenario) ? '__legacy' : '');
    const matrices = selectedMatrices();
    if (!matrices.some(m => m.matrix_id === state.matrixId)) state.matrixId = matrices[0]?.matrix_id || '';
    main.append(U.heading(...sections.matrix, U.button('Impor CSV', 'import', { kind: 'matrix' }), U.button('Ekspor matriks', 'export-matrix'), U.button('Tambah entri', 'edit', { collection: 'matrixEntries' }, 'primary')));
    const filters = h('div', { class: 'filters' }, U.filter('scenario', 'Skenario', [['current', 'Saat ini'], ['proposed', 'Usulan']], state.scenario), U.filter('matrixType', 'Jenis matriks', [...unique([...knownTypes(), state.matrixType]).filter(t => t !== '__legacy').map(t => [t, t]), ...rows('matrices').some(m => !C.normalizeMatrixType(m.matrix_type)) ? [['__legacy', 'Jenis belum ditetapkan / tidak valid (legacy)']] : []], state.matrixType), U.filter('matrixId', 'Identitas matriks', matrices.map(m => [m.matrix_id, m.matrix_id + ' · ' + m.name]), state.matrixId), U.filter('matrixView', 'Tampilan', [['grid', 'Grid kelompok gaji'], ['list', 'Daftar golongan']], state.matrixView));
    filters.querySelectorAll('option[value=""]').forEach(o => o.remove());
    main.append(filters);

    const metadata = rows('matrices').filter(m => m.scenario === state.scenario);
    main.append(h('details', { class: 'matrix-metadata' }, h('summary', {}, 'Identitas matriks · ' + (state.scenario === 'current' ? 'Saat ini' : 'Usulan') + ' (' + matrices.length + ')'), U.panel('Identitas matriks · ' + (state.scenario === 'current' ? 'Saat ini' : 'Usulan'), metadata.length ? U.table(['ID matriks', 'Jenis', 'Nama', 'Tanggal berlaku', 'Tindakan'], metadata.map(m => [m.matrix_id, m.matrix_type || 'Belum ditetapkan (legacy)', m.name, m.effective_date || '—', controls('edit', rows('matrices').indexOf(m), 'matrices')])) : h('p', { class: 'muted' }, 'Buat identitas matriks sebelum menambahkan entri.'), U.button('Tambah matriks', 'edit', { collection: 'matrices' }, 'small'))));
    main.append(matrixGenerator(matrices.filter(m => m.matrix_id === state.matrixId)));
    main.append(U.actions(U.button('Salin matriks terpilih → skenario lain', 'copy-matrix'), U.button('Penyesuaian persentase', 'adjust-matrix')));
    main.append(h('p', { class: 'muted' }, 'Golongan = kelompok gaji + kategori profesional + KMK. Klik Edit atau nilai pada grid untuk mengubah entri.'));
    const entries = selectedEntries();
    if (state.matrixView === 'grid') {
      main.append(U.matrixGrid(rows('matrixEntries'), state.scenario, rows('matrices'), ws().metadata[state.scenario + '_period'], state.matrixId));
    } else main.append(U.table(['Golongan', 'Kelompok', 'Kategori', 'KMK', 'Gaji pokok', 'Matriks', 'Catatan', 'Tindakan'], entries.map(e => [h('strong', {}, e.golongan), e.salary_group, e.professional_category, e.kmk_level, U.amount(e.basic_salary), e.matrix_id, h('span', { title: e.note || '' }, e.note || '—'), controls('edit', rows('matrixEntries').indexOf(e), 'matrixEntries', true)])));
  }
  function employeeIssues(e) { return state.issues.filter(i => i.employee_id === e.employee_id); }

  function filteredEmployees() {
    const f = state.filters;
    return rows('employees').filter(e => ['current', 'proposed'].every(s => !f[s + '_matrix_type'] || (C.resolveMatrixType(ws(), e, s) || '__missing') === f[s + '_matrix_type']) && (!f.search || (e.employee_id + ' ' + e.name).toLocaleLowerCase('id').includes(f.search.toLocaleLowerCase('id'))) && (!f.unit || e.unit === f.unit) && (!f.department || e.department === f.department) && (!f.golongan || e.current_golongan === f.golongan || e.proposed_golongan === f.golongan) && (!f.active || String(Boolean(e.active)) === f.active) && (!f.validation || (f.validation === 'clean' ? !employeeIssues(e).length : employeeIssues(e).some(i => i.severity === f.validation))));
  }
  function employeeFilters(simulation = false) {
    const f = state.filters;
    return h('div', { class: 'filters' }, U.search(f.search), ...['current', 'proposed'].map(s => U.filter(s + '_matrix_type', 'Semua jenis ' + s, [...unique(rows('employees').map(e => C.resolveMatrixType(ws(), e, s))).map(t => [t, t]), ['__missing', 'Jenis belum terpetakan']], f[s + '_matrix_type'])), U.filter('unit', 'Semua unit', unique(rows('employees').map(e => e.unit)), f.unit), U.filter('department', 'Semua departemen', unique(rows('employees').map(e => e.department)), f.department), simulation ? U.filter('change', 'Semua hasil', [['increased', 'THP naik'], ['unchanged', 'THP tetap'], ['decreased', 'THP turun'], ['golongan', 'Golongan berubah'], ['missing', 'Data bermasalah']], f.change) : [U.filter('golongan', 'Semua golongan', unique(rows('employees').flatMap(e => [e.current_golongan, e.proposed_golongan])), f.golongan), U.filter('active', 'Semua status aktif', [['true', 'Aktif'], ['false', 'Nonaktif']], f.active), U.filter('validation', 'Semua validasi', [['error', 'Kesalahan'], ['warning', 'Peringatan'], ['clean', 'Tanpa masalah']], f.validation)], U.button('Bersihkan filter', 'clear-filters', {}, 'small'));
  }
  function validationCount(issues, data) {
    if (!issues.length) return U.badge('0 masalah', '');
    const errors = issues.filter(i => i.severity === 'error').length;
    const label = issues.length + ' masalah · ' + errors + ' kesalahan · ' + (issues.length - errors) + ' peringatan';
    return h('button', { type: 'button', class: 'small ' + (errors ? 'danger' : ''), 'data-action': 'employee-validation', ...Object.fromEntries(Object.entries(data).map(([k, v]) => ['data-' + k, v])), 'aria-label': 'Lihat ' + label, title: label }, label);
  }
  function showEmployeeValidation(data) {
    const employee = data.index === undefined ? null : rows('employees')[Number(data.index)];
    const issues = employee ? employeeIssues(employee) : state.issues;
    const repair = issue => {
      const matches = rows('employees').filter(e => e.employee_id === issue.employee_id);
      const target = employee || (matches.length === 1 ? matches[0] : null);
      const buttons = [];
      if (target) buttons.push(U.button('Edit karyawan', 'edit', { collection: 'employees', index: rows('employees').indexOf(target) }, 'small'));
      const message = issue.message || '';
      if (/skema|policy/i.test(message)) buttons.push(U.button('Atur skema pembayaran', 'edit-payment-policies', {}, 'small'));
      if (/matrix|matriks|golongan|basic salary/i.test(message)) buttons.push(U.button('Buka matriks', 'repair-section', { section: 'matrix' }, 'small'));
      if (/component|komponen|contribution|kontribusi|take-home/i.test(message)) buttons.push(U.button('Buka komponen', 'repair-section', { section: 'components' }, 'small'));
      if (/BPJS|tax|pajak|PPh|rounding|currency|rezim/i.test(message) || !target) buttons.push(U.button('Buka aturan perhitungan', 'repair-section', { section: 'rules' }, 'small'));
      return U.actions(buttons);
    };
    U.dialog('Validasi · ' + (employee ? employee.employee_id + ' · ' + employee.name : 'Seluruh workspace'), h('div', {},
      h('p', {}, issues.length + ' masalah. Gunakan tautan perbaikan pada setiap pesan. Setelah disimpan, jumlah validasi diperbarui otomatis.'),
      issues.length ? U.table(['Masalah', 'Perbaiki'], issues.map(issue => [U.issues([issue]), repair(issue)])) : h('p', {}, 'Tidak ada masalah.')));
  }
  function renderEmployees(main) {
    main.append(U.heading(...sections.employees, U.button('Impor CSV', 'import', { kind: 'employees' }), U.button('Ekspor CSV', 'export-employees'), U.button('Normalisasi semua override gaji', 'normalize-basic-overrides'), U.button('Tambah karyawan', 'edit', { collection: 'employees' }, 'primary')), employeeFilters());
    const employees = filteredEmployees();
    main.append(h('div', { class: 'panel-head' }, h('span', { class: 'muted' }, employees.length + ' dari ' + rows('employees').length + ' karyawan'), U.actions(U.button('Tetapkan jenis matriks untuk hasil filter', 'bulk-matrix-type', {}, 'small'), U.button('Samakan golongan usulan (hasil filter)', 'equal-golongan', {}, 'small'))));
    main.append(U.table(['ID / Nama', 'Unit / Departemen', 'Jabatan', 'Status', 'Golongan saat ini', 'Golongan usulan', 'Pokok saat ini', 'Pokok usulan', 'Validasi', 'Tindakan'], employees.map(e => [h('div', {}, h('strong', {}, e.name), h('div', { class: 'muted' }, e.employee_id)), h('div', {}, e.unit || '—', h('div', { class: 'muted' }, e.department || '—')), e.position || '—', U.badge(e.active ? 'Aktif' : 'Nonaktif'), h('div', {}, e.current_golongan || '—', h('small', {}, ' · Jenis: ' + (C.resolveMatrixType(ws(), e, 'current') || e.current_matrix_type || 'Belum ditetapkan'))), h('div', {}, e.proposed_golongan || (ws().globalRules.proposed_defaults_current ? e.current_golongan + ' (default)' : '—'), h('small', {}, ' · Jenis: ' + (C.resolveMatrixType(ws(), e, 'proposed') || e.proposed_matrix_type || 'Belum ditetapkan') + (!e.proposed_matrix_type && ws().globalRules.proposed_matrix_type_defaults_current ? ' (ikuti saat ini)' : ''))), basicCell(e, 'current'), basicCell(e, 'proposed'), validationCount(employeeIssues(e), { index: rows('employees').indexOf(e) }), h('button', { type: 'button', class: 'small', 'data-action': 'employee-actions', 'data-index': rows('employees').indexOf(e), 'aria-haspopup': 'dialog', 'aria-label': 'Tindakan · ' + e.employee_id + ' · ' + e.name, title: 'Tindakan karyawan' }, '…')])));
    main.append(U.panel('Ringkasan validasi workspace', validationCount(state.issues, {})));
  }
  function basicCell(e, scenario) {
    const value = C.resolveBasic(ws(), e, scenario);
    return h('div', {}, value === null ? U.badge('Gaji belum terpetakan', 'error') : U.amount(value), hasBasicOverride(e, scenario) ? U.badge('Override gaji pokok · mendahului matriks', 'warning') : h('small', {}, 'Sumber: matriks'));
  }
  function renderComponents(main) {
    main.append(U.heading(...sections.components, U.button('Tetapkan ke karyawan', 'assign', {}, 'primary'), U.button('Tambah komponen', 'edit', { collection: 'componentDefinitions' })));
    main.append(U.notice('Komponen dihitung ketika ditetapkan kepada karyawan. Nilai penugasan kosong memakai default; nilai 0 adalah override nol. Tarif persentase ditampilkan sebagai persen, disimpan sebagai pecahan desimal.'));
    const direction = { earning: 'Pendapatan', employee_deduction: 'Potongan', employer_contribution: 'Kontribusi pemberi kerja' };
    const type = { fixed: 'Tetap', manual: 'Manual', percentage_basic: '% pokok', percentage_gross: '% bruto' };
    main.append(U.panel('Definisi komponen', U.table(['Kode / Nama', 'Kategori', 'Arah', 'Perhitungan', 'Default', 'Berlaku', 'Status', 'Tindakan'], rows('componentDefinitions').map(d => [h('div', {}, h('strong', {}, d.name), h('div', { class: 'muted' }, d.code)), d.category || '—', direction[d.direction] || d.direction, type[d.calculation_type] || d.calculation_type, d.calculation_type.startsWith('percentage') ? U.rateDisplay(d.default_value) : U.amount(d.default_value), [d.applies_current ? 'Saat ini' : '', d.applies_proposed ? 'Usulan' : ''].filter(Boolean).join(' · '), U.badge(d.active ? 'Aktif' : 'Nonaktif'), controls('edit', rows('componentDefinitions').indexOf(d), 'componentDefinitions')]))));
    main.append(U.panel('Penugasan karyawan', U.table(['Karyawan', 'Komponen', 'Nilai saat ini', 'Nilai usulan', 'Tindakan'], rows('employeeComponents').map((a, index) => {
      const d = rows('componentDefinitions').find(d => d.code === a.component_code);
      const value = v => v === '' || v === null || v === undefined ? U.badge('Pakai default') : d?.calculation_type.startsWith('percentage') ? U.rateDisplay(v) : U.amount(v);
      return [a.employee_id + ' · ' + (rows('employees').find(e => e.employee_id === a.employee_id)?.name || 'Tidak ditemukan'), a.component_code + ' · ' + (d?.name || 'Tidak ditemukan'), value(a.current_value), value(a.proposed_value), U.actions(U.button('Edit', 'assign', { index }, 'small'), U.button('Hapus', 'delete', { collection: 'employeeComponents', index }, 'small danger'))];
    }))));
  }
  function renderRules(main) {
    main.append(U.heading(...sections.rules, U.button('Edit aturan global & pajak', 'edit-rules', {}, 'primary')));
    main.append(U.notice('Aturan kepesertaan BPJS dapat tetap manual atau dihitung global: Kesehatan berdasarkan lama kerja terhadap tanggal acuan tiap skenario, dan TK hanya untuk status permanen terstruktur. PPh 21 otomatis terbatas pada orang pribadi dalam negeri, rezim biasa 2024–2026 tanpa DTP/insentif khusus. Verifikasi seluruh kebijakan, tarif, dan batas BPJS.'));
    main.append(U.panel('Skema pembayaran PPh & BPJS', U.object(Object.fromEntries(U.schemas.paymentPolicies.map(s => [s.label, s.options.find(([value]) => value === (ws().globalRules[s.key] || s.default))?.[1] || 'Tidak valid']))), U.button('Atur skema pembayaran', 'edit-payment-policies', {}, 'primary')));
    main.append(U.panel('Aturan BPJS', U.table(['Program', 'Tarif karyawan', 'Tarif pemberi kerja', 'Minimum basis', 'Maksimum basis', 'Basis', 'Status', 'Tindakan'], rows('bpjsRules').map((r, index) => [r.name + ' (' + r.code + ') · pajak: ' + (r.tax_program || 'belum diidentifikasi'), U.rateDisplay(r.employee_rate) + (r.employee_enabled ? '' : ' · nonaktif'), U.rateDisplay(r.employer_rate) + (r.employer_enabled ? '' : ' · nonaktif'), r.minimum_basis === '' || r.minimum_basis == null ? 'Tanpa batas' : U.amount(r.minimum_basis), r.maximum_basis === '' || r.maximum_basis == null ? 'Tanpa batas' : U.amount(r.maximum_basis), { basic: 'Gaji pokok', selected: 'Pokok + terpilih', gross: 'Bruto' }[r.basis] || r.basis, U.badge(r.active ? 'Aktif' : 'Nonaktif'), controls('edit', index, 'bpjsRules')])), U.button('Tambah program', 'edit', { collection: 'bpjsRules' }, 'small')));
    const globalSettings = U.schemas.globalRules.filter(s => !s.key.includes('tax_') && !s.key.includes('bpjs_'));
    const bpjsSettings = U.schemas.globalRules.filter(s => s.key.includes('bpjs_'));
    const taxSettings = U.schemas.globalRules.filter(s => s.key.includes('tax_'));
    main.append(U.panel('Kepesertaan BPJS', U.object(Object.fromEntries(bpjsSettings.map(s => [s.label, ws().globalRules[s.key]]))), U.button('Edit aturan kepesertaan', 'edit-rules', {}, 'small')));
    main.append(h('div', { class: 'two-column' }, U.panel('Aturan global', U.object(Object.fromEntries(globalSettings.map(s => [s.label, ws().globalRules[s.key]])))), U.panel('PPh 21 otomatis', h('div', {}, U.object(Object.fromEntries(taxSettings.map(s => [s.label, ws().globalRules[s.key]]))), h('p', { class: 'muted' }, 'Skema PPh dan BPJS ditetapkan terpisah untuk saat ini/usulan pada pengaturan skema pembayaran. Basis iuran tetap sebelum tunjangan BPJS/PPh. Pilih PTKP dan klasifikasi pajak terverifikasi pada karyawan, bulan pajak dan konfirmasi rezim biasa di aturan global, serta tax_program pada BPJS aktif. Nilai tarif, override, basis, dan pembulatan pajak legacy hanya arsip, tidak dipakai.'), U.button('Kelola pengaturan karyawan', 'navigate', { section: 'employees' })))));
  }
  const metricKeys = ['basic_salary', 'gross', 'employee_bpjs', 'employer_bpjs', 'pph', 'deductions', 'take_home_pay', 'employer_contributions', 'bpjs_allowance', 'tax_allowance', 'employer_tax_cost', 'employer_cost'];
  function resultEmployees(result) {
    const ids = new Set(filteredEmployees().map(e => e.employee_id));
    return result.employees.filter(r => {
      if (!ids.has(r.employee_id)) return false;
      const e = rows('employees').find(e => e.employee_id === r.employee_id);
      const delta = r.changes.take_home_pay.amount;
      switch (state.filters.change) {
        case 'increased': return delta > 0;
        case 'unchanged': return delta === 0;
        case 'decreased': return delta < 0;
        case 'golongan': return r.current_golongan !== r.proposed_golongan;
        case 'missing': return (r.issues || []).some(i => i.severity === 'error') || employeeIssues(e).some(i => i.severity === 'error');

        default: return true;
      }
    });
  }
  function renderSimulation(main) {
    main.append(U.heading(...sections.simulation, U.button('Cetak ringkasan', 'print'), U.button('Ekspor hasil CSV', 'export-results'), U.button('Hitung ulang', 'calculate', {}, 'primary')));
    if (!state.result) state.result = C.calculatePayroll(ws());
    const result = state.result;
    main.append(h('div', { class: 'print-only' }, h('h2', {}, ws().metadata.name), h('p', {}, (ws().metadata.current_period || 'Saat ini') + ' → ' + (ws().metadata.proposed_period || 'Usulan')), h('p', {}, 'Dicetak ' + new Date().toLocaleString('id-ID') + ' · Simulasi, bukan laporan pajak resmi')));
    main.append(employeeFilters(true));
    if (!result.totals) {
      main.append(U.notice('Perhitungan dan ekspor hasil diblokir. Perbaiki kesalahan di bawah lalu hitung ulang.'), U.panel('Masalah yang harus diperbaiki', U.issues(result.issues?.length ? result.issues : state.issues)));
      const affected = filteredEmployees().filter(e => employeeIssues(e).some(i => i.severity === 'error'));
      main.append(U.table(['Karyawan bermasalah', 'Golongan saat ini', 'Golongan usulan', 'Tindakan'], affected.map(e => [e.employee_id + ' · ' + e.name, e.current_golongan, e.proposed_golongan || '—', U.button('Perbaiki karyawan', 'edit', { collection: 'employees', index: rows('employees').indexOf(e) }, 'small')])));
      return;
    }
    const totals = result.totals;
    main.append(U.cards([['Karyawan dihitung', result.employees.length, 'Total organisasi · tidak mengikuti filter'], ['Pokok usulan', U.money(totals.proposed.basic_salary), U.delta(totals.changes.basic_salary)], ['THP usulan', U.money(totals.proposed.take_home_pay), U.delta(totals.changes.take_home_pay)], ['Biaya pemberi kerja usulan', U.money(totals.proposed.employer_cost), U.delta(totals.changes.employer_cost)]]));
    main.append(U.panel('Ringkasan organisasi · seluruh hasil', U.table(['Ukuran', ws().metadata.current_period || 'Saat ini', ws().metadata.proposed_period || 'Usulan', 'Perubahan'], metricKeys.map(key => [U.labels[key], U.amount(totals.current[key]), U.amount(totals.proposed[key]), U.delta(totals.changes[key] || C.change(totals.current[key] || 0, totals.proposed[key] || 0))]))));
    const visible = resultEmployees(result);
    main.append(h('p', { class: 'muted' }, visible.length + ' dari ' + result.employees.length + ' hasil ditampilkan. Ekspor CSV mencakup seluruh hasil; ringkasan organisasi tidak mengikuti filter.'));
    const headers = ['ID / Nama', 'Unit / Departemen', 'Gol. saat ini', 'Gol. usulan'];
    for (const key of ['basic_salary', 'gross', 'employee_bpjs', 'employer_bpjs', 'pph', 'deductions', 'take_home_pay', 'employer_cost']) {
      headers.push(U.labels[key] + ' · saat ini', U.labels[key] + ' · usulan');
      if (['basic_salary', 'gross', 'take_home_pay', 'employer_cost'].includes(key)) headers.push('Δ ' + U.labels[key]);
    }
    headers.push('Status', 'Rincian');
    main.append(h('section', { class: 'result-detail' }, U.table(headers, visible.map(r => {
      const e = rows('employees').find(e => e.employee_id === r.employee_id);
      const cells = [h('div', {}, h('strong', {}, r.name), h('div', { class: 'muted' }, r.employee_id)), (r.unit || '—') + ' / ' + (r.department || '—'), r.current_golongan, r.proposed_golongan];
      for (const key of ['basic_salary', 'gross', 'employee_bpjs', 'employer_bpjs', 'pph', 'deductions', 'take_home_pay', 'employer_cost']) {
        cells.push(U.amount(r.current[key]), U.amount(r.proposed[key]));
        if (['basic_salary', 'gross', 'take_home_pay', 'employer_cost'].includes(key)) cells.push(U.delta(r.changes[key]));
      }
      cells.push(U.actions((r.issues || []).length ? U.badge(r.issues.length + ' catatan', 'warning') : U.badge('Siap')), U.button('Lihat rincian', 'breakdown', { id: r.employee_id }, 'small'));
      return cells;
    }))));
    if (result.issues?.length) main.append(U.panel('Catatan hasil simulasi', U.issues(result.issues)));
    main.append(U.notice('Tinjau perbedaan negatif dan klasifikasi pajak. Estimasi pajak dan BPJS hanya seakurat parameter yang Anda verifikasi.'));
  }
  function editRecord(collection, index, duplicate = false) {
    if (!requireWorkspace()) return;
    const existing = index !== undefined ? rows(collection)[Number(index)] : null;
    let record = existing ? clone(existing) : {};
    if (duplicate) {
      if (collection === 'employees') { record.employee_id = ''; record.name += ' (salinan uji)'; }
      if (collection === 'matrixEntries') { record.kmk_level = ''; record.golongan = ''; }
    }
    if (collection === 'matrices' || collection === 'matrixEntries') record.scenario = record.scenario || state.scenario;
    let schema = U.schemas[collection].map(s => ({ ...s }));
    if (collection === 'matrices' && !existing) record.matrix_type = C.normalizeMatrixType(state.matrixType) || '';
    if (collection === 'employees') {
      for (const scenario of ['current', 'proposed']) {
        const spec = schema.find(s => s.key === scenario + '_golongan');
        const typeSpec = schema.find(s => s.key === scenario + '_matrix_type');
        typeSpec.options = [['', scenario === 'proposed' && ws().globalRules.proposed_matrix_type_defaults_current ? 'Ikuti jenis saat ini (terpisah dari golongan)' : 'Belum ditetapkan'], ...knownTypes().map(t => [t, t])];
        const entries = typeEntries(record, scenario);
        spec.type = 'text'; spec.readonly = !hasBasicOverride(record, scenario) && entries.length > 0;
        delete spec.list;
        spec.help = 'Golongan dibentuk dari KG, profesional, dan KMK jenis terpilih. Dapat diisi manual bila memakai override gaji pokok atau belum ada entri matriks. Nilai legacy yang tidak tersedia tetap terlihat; buat/impor matriks untuk melengkapi pilihan.';
        const parsed = C.parseGolongan(record[spec.key]);
        const dimensions = [['salary_group', 'KG'], ['professional_category', 'Level profesional'], ['kmk_level', 'KMK']];
        const fields = dimensions.map(([dimension, label], i) => {
          const key = scenario + '_' + dimension;
          record[key] = parsed ? String(parsed[dimension]) : '';
          const matches = entries.filter(e => i === 0 || (String(e.salary_group) === record[scenario + '_salary_group'] && (i === 1 || e.professional_category === record[scenario + '_professional_category'])));
          return { key, label: (scenario === 'current' ? 'Saat ini' : 'Usulan') + ' · ' + label, type: 'select', options: [['', i === 0 && scenario === 'proposed' && ws().globalRules.proposed_defaults_current ? 'Ikuti golongan saat ini' : 'Pilih ' + label], ...unique(matches.map(e => String(e[dimension]))).map(value => [value, value])], default: '' };
        });
        schema.splice(schema.indexOf(spec), 0, ...fields);
      }
    }
    if (collection === 'matrixEntries') {
      if (!rows('matrices').length) { U.toast('Tambahkan identitas matriks terlebih dahulu.'); editRecord('matrices'); return; }
      schema.find(s => s.key === 'matrix_id').options = rows('matrices').map(m => [m.matrix_id, m.name + ' · ' + (m.matrix_type || 'Jenis belum ditetapkan') + ' · ' + (m.scenario === 'current' ? 'Saat ini' : 'Usulan')]);
      record.matrix_id = record.matrix_id || state.matrixId || rows('matrices')[0].matrix_id;
      record.scenario = rows('matrices').find(m => m.matrix_id === record.matrix_id)?.scenario || record.scenario;
    }
    if (collection === 'componentDefinitions' && record.calculation_type?.startsWith('percentage')) record.default_value = U.rateToPercent(record.default_value);
    const names = { employees: 'karyawan', matrices: 'matriks', matrixEntries: 'entri matriks', componentDefinitions: 'komponen', bpjsRules: 'program BPJS' };
    const extra = collection === 'employees' ? h('div', {}, U.notice('Gaji pokok mengikuti jenis matriks dan golongan. Peringatan: override gaji pokok opsional (Rp, termasuk nol) dipakai lebih dahulu daripada matriks. Kosongkan untuk kembali ke matriks. Jenis usulan kosong mengikuti jenis saat ini hanya jika aturan jenis aktif, terpisah dari fallback golongan. PPh dihitung otomatis dari klasifikasi terverifikasi, bukan status kontrak. Lengkapi PTKP, residensi, kategori, masa, dan cakupan pembayaran; kosong atau PTKP legacy tidak valid harus diperbaiki sebelum pajak dihitung. Tarif dan override pajak lama hanya arsip dan diabaikan. Skema PPh/BPJS mengikuti pengaturan saat ini/usulan.'), U.issues(existing ? employeeIssues(existing) : []), h('datalist', { id: 'golongan-list' }, unique(rows('matrixEntries').map(e => e.golongan)).map(code => h('option', { value: code })))) : collection === 'bpjsRules' ? U.notice('Masukkan tarif yang sudah diverifikasi. Tidak ada tarif hukum bawaan; kolom persen 1 berarti 1%.') : null;
    U.form((existing && !duplicate ? 'Edit ' : duplicate ? 'Duplikat ' : 'Tambah ') + names[collection], schema, record, (data) => {
      if (collection === 'employees') {
        for (const scenario of ['current', 'proposed']) {
          const keys = ['salary_group', 'professional_category', 'kmk_level'].map(d => scenario + '_' + d);
          if (!schema.some(s => s.key === keys[0])) continue;
          const values = keys.map(key => data[key]);
          const manual = hasBasicOverride(data, scenario) || !typeEntries(data, scenario).length;
          if (!manual && values.some(Boolean) && !values.every(Boolean)) throw new Error('Lengkapi KG, level profesional, dan KMK ' + scenario + '.');
          data[scenario + '_golongan'] = manual ? (data[scenario + '_golongan'] || '') : (values.every(Boolean) ? C.golongan(...values) : (data[scenario + '_golongan'] === record[scenario + '_golongan'] ? record[scenario + '_golongan'] || '' : ''));
          keys.forEach(key => { delete data[key]; });
        }
      }
      const target = existing && !duplicate ? Number(index) : -1;
      const key = { employees: 'employee_id', matrices: 'matrix_id', componentDefinitions: 'code', bpjsRules: 'code' }[collection];
      if (key && rows(collection).some((r, i) => i !== target && r[key] === data[key])) throw new Error('ID/kode sudah digunakan. Gunakan nilai unik.');
      if (collection === 'matrices') {
        data.matrix_type = C.normalizeMatrixType(data.matrix_type);
        if (!data.matrix_type) throw new Error('Jenis matriks harus diawali huruf, lalu huruf, angka, _ atau -.');
        if (rows('matrices').some((m, i) => i !== target && m.scenario === data.scenario && C.normalizeMatrixType(m.matrix_type) === data.matrix_type)) throw new Error('Jenis matriks sudah ada pada skenario ini.');
      }
            if (collection === 'employees' && data.active && !data.current_golongan) throw new Error('Golongan saat ini wajib untuk karyawan aktif.');
            if (collection === 'employees') {

              for (const scenario of ['current', 'proposed']) {
                const key = scenario + '_matrix_type';
                if (data[key]) {
                  const type = C.normalizeMatrixType(data[key]);
                  if (!type) throw new Error('Jenis matriks tidak valid.');
                  data[key] = type;
                }
                const override = data[scenario + '_basic_override'];
                if (override !== '' && override != null && (!Number.isSafeInteger(override) || override < 0)) throw new Error('Override harus rupiah bulat nonnegatif.');
              }
              // Manual PPh remains archival; salary overrides above are active inputs.
              data.pph_rate = existing?.pph_rate ?? '';
              data.pph_fixed_override = existing?.pph_fixed_override ?? '';
              data.pph_method = existing?.pph_method ?? 'gross_up';
              for (const key of ['current_golongan', 'proposed_golongan']) {
                if (!data[key]) continue;
                const parsed = C.parseGolongan(data[key]);
                if (!parsed) throw new Error('Format golongan tidak valid: ' + data[key] + '. Contoh: 3-PM8.');
                data[key] = C.golongan(parsed.salary_group, parsed.professional_category, parsed.kmk_level);
                const entries = typeEntries(data, key.split('_')[0]);
                if (!hasBasicOverride(data, key.split('_')[0]) && entries.length && entries.filter(e => e.golongan === data[key]).length !== 1) throw new Error('Pilih golongan yang tersedia dan tidak duplikat pada matriks ' + (key === 'current_golongan' ? 'saat ini' : 'usulan') + '.');
              }
            }
      if (collection === 'matrixEntries') {
        data.professional_category = data.professional_category.toUpperCase();
        data.golongan = C.golongan(data.salary_group, data.professional_category, data.kmk_level);
        if (!data.golongan) throw new Error('Kelompok, kategori profesional, atau KMK tidak membentuk golongan yang valid.');
        data.salary_group = String(data.salary_group);
        data.scenario = rows('matrices').find(m => m.matrix_id === data.matrix_id).scenario;
        if (rows(collection).some((r, i) => i !== target && r.matrix_id === data.matrix_id && r.golongan === data.golongan)) throw new Error('Golongan tersebut sudah ada pada matriks ini.');
      }
      if (collection === 'componentDefinitions') {
        if (!data.calculation_type.startsWith('percentage') && !Number.isSafeInteger(data.default_value)) throw new Error('Nominal komponen harus rupiah bulat yang aman.');
      }
      if (collection === 'bpjsRules' && data.minimum_basis !== '' && data.maximum_basis !== '' && data.minimum_basis > data.maximum_basis) throw new Error('Batas minimum tidak boleh lebih besar dari maksimum.');
      if (collection === 'matrices' && existing?.generator_settings) data.generator_settings = existing.generator_settings;
      const commit = () => {
        mutate(w => {
          if (target >= 0) w[collection][target] = data; else w[collection].push(data);
          if (collection === 'matrices') { state.scenario = data.scenario; state.matrixType = data.matrix_type; state.matrixId = data.matrix_id; }
          if (existing && !duplicate && collection === 'employees') w.employeeComponents.forEach(a => { if (a.employee_id === existing.employee_id) a.employee_id = data.employee_id; });
          if (existing && collection === 'componentDefinitions') w.employeeComponents.forEach(a => { if (a.component_code === existing.code) a.component_code = data.code; });
          if (existing && collection === 'matrices') w.matrixEntries.forEach(e => { if (e.matrix_id === existing.matrix_id) { e.matrix_id = data.matrix_id; e.scenario = data.scenario; } });
        });
        U.close(); U.toast('Data disimpan di layar. Ekspor workspace untuk menyimpan file.');
      };
      if (existing && collection === 'matrices' && (data.scenario !== existing.scenario || data.matrix_type !== existing.matrix_type)) U.confirm('Ubah skenario / jenis matriks?', h('p', {}, 'Seluruh entri matriks ini mengikuti identitas yang diubah. Jenis karyawan dan override tidak diubah; periksa kembali resolusi gaji setelah perubahan.'), commit);
      else if (existing && collection === 'componentDefinitions' && existing.calculation_type.startsWith('percentage') !== data.calculation_type.startsWith('percentage') && rows('employeeComponents').some(a => a.component_code === existing.code)) U.confirm('Ubah satuan komponen?', h('p', {}, 'Nilai penugasan yang sudah ada tidak dikonversi otomatis. Perubahan antara rupiah dan persen mengubah maknanya; tinjau semua penugasan setelah menyimpan.'), commit);
      else commit();
    }, extra, form => {
      if (collection === 'employees') {
        for (const scenario of ['current', 'proposed']) {
          const group = form.elements.namedItem(scenario + '_salary_group');
          if (!group) continue;
          const category = form.elements.namedItem(scenario + '_professional_category');
          const level = form.elements.namedItem(scenario + '_kmk_level');
          const type = form.elements.namedItem(scenario + '_matrix_type');
          const currentType = form.elements.namedItem('current_matrix_type');
          const golonganInput = form.elements.namedItem(scenario + '_golongan');
          const overrideInput = form.elements.namedItem(scenario + '_basic_override');
          const getEntries = () => typeEntries({ current_matrix_type: currentType.value, proposed_matrix_type: form.elements.namedItem('proposed_matrix_type').value }, scenario);
          let manual;
          const updateReadonly = () => {
            const nextManual = Boolean(overrideInput && overrideInput.value.trim() !== '') || !getEntries().length;
            if (manual === true && !nextManual) {
              populate(group, getEntries().map(e => e.salary_group), 'KG');
              populate(category, [], 'level profesional');
              populate(level, [], 'KMK');
              golonganInput.value = '';
            }
            manual = nextManual;
            golonganInput.readOnly = !manual;
            group.disabled = manual;
            category.disabled = manual || !group.value;
            level.disabled = manual || !category.value;
          };
          const populate = (input, values, label) => {
            input.replaceChildren(h('option', { value: '' }, 'Pilih ' + label), ...unique(values.map(String)).map(value => h('option', { value }, value)));
            input.value = ''; input.disabled = !values.length;
          };
          const sync = () => { if (!manual) golonganInput.value = group.value && category.value && level.value ? C.golongan(group.value, category.value, level.value) : ''; };
          group.addEventListener('change', () => { populate(category, getEntries().filter(e => String(e.salary_group) === group.value).map(e => e.professional_category), 'level profesional'); populate(level, [], 'KMK'); sync(); });
          category.addEventListener('change', () => { populate(level, getEntries().filter(e => String(e.salary_group) === group.value && e.professional_category === category.value).map(e => e.kmk_level), 'KMK'); sync(); });
          level.addEventListener('change', sync);
          if (overrideInput) {
            overrideInput.addEventListener('input', updateReadonly);
            overrideInput.addEventListener('change', updateReadonly);
          }
          const resetType = () => {
            populate(group, getEntries().map(e => e.salary_group), scenario === 'proposed' && ws().globalRules.proposed_defaults_current ? 'KG / ikuti golongan saat ini' : 'KG');
            populate(category, [], 'level profesional');
            populate(level, [], 'KMK');
            updateReadonly();
            sync();
          };
          type.addEventListener('change', resetType);
          if (scenario === 'proposed') currentType.addEventListener('change', () => { if (!type.value && ws().globalRules.proposed_matrix_type_defaults_current) resetType(); });
          category.disabled = !group.value; level.disabled = !category.value;
          updateReadonly();
        }
      }
      if (collection === 'matrixEntries') {
        const update = () => {
          const values = form.elements;
          values.scenario.value = rows('matrices').find(m => m.matrix_id === values.matrix_id.value).scenario;
          try { values.golongan.value = C.golongan(Number(values.salary_group.value), values.professional_category.value.toUpperCase(), Number(values.kmk_level.value)) || ''; } catch (_) { values.golongan.value = ''; }
        };
        form.elements.scenario.disabled = true;
        form.addEventListener('input', update); update();
      }
      if (collection === 'componentDefinitions') {
        const update = () => {
          const percentage = form.elements.calculation_type.value.startsWith('percentage');
          form.elements.default_value.closest('label').querySelector('span').textContent = 'Nilai default (' + (percentage ? '%' : 'Rp') + ')';
          form.elements.default_value.step = percentage ? 'any' : '1';
        };
        form.elements.calculation_type.addEventListener('change', update); update();
      }
    });
  }
  function deleteRecord(collection, index) {
    const item = rows(collection)[Number(index)];
    const label = item.name || item.golongan || item.employee_id + ' / ' + item.component_code;
    let consequence = '';
    if (collection === 'employees') consequence = ' Penugasan komponen karyawan ini juga akan dihapus.';
    if (collection === 'componentDefinitions') consequence = ' Semua penugasan komponen ini juga akan dihapus.';
    if (collection === 'matrices') consequence = ' Seluruh entri matriks ini dihapus. Gaji karyawan yang merujuk golongannya dapat menjadi tidak terpetakan.';
    if (collection === 'matrixEntries') consequence = ' Gaji karyawan yang memakai golongan ini dapat menjadi tidak terpetakan.';
    confirmMutation('Hapus data?', dirtyWarning() + 'Hapus “' + label + '”?' + consequence, w => {
      w[collection].splice(Number(index), 1);
      if (collection === 'employees') w.employeeComponents = w.employeeComponents.filter(a => a.employee_id !== item.employee_id);
      if (collection === 'componentDefinitions') w.employeeComponents = w.employeeComponents.filter(a => a.component_code !== item.code);
      if (collection === 'matrices') w.matrixEntries = w.matrixEntries.filter(e => e.matrix_id !== item.matrix_id);
    });
  }
  function assign(index) {
    if (!rows('employees').length || !rows('componentDefinitions').length) { U.toast('Tambahkan karyawan dan definisi komponen terlebih dahulu.'); return; }
    const existing = index !== undefined ? rows('employeeComponents')[Number(index)] : null;
    const build = (code, values = {}) => {
      const definition = rows('componentDefinitions').find(d => d.code === code);
      const percentage = definition.calculation_type.startsWith('percentage');
      const selected = existing ? [existing.employee_id] : values.ids || [];
      const checks = h('div', { class: 'check-list' }, rows('employees').map(e => h('label', {}, h('input', { type: 'checkbox', name: 'selected_employee', value: e.employee_id, checked: selected.includes(e.employee_id) }), e.employee_id + ' · ' + e.name)));
      const schema = [{ key: 'component_code', label: 'Komponen', type: 'select', options: rows('componentDefinitions').map(d => [d.code, d.code + ' · ' + d.name]) }, ...['current', 'proposed'].map(s => ({ key: s + '_value', label: 'Nilai ' + (s === 'current' ? 'saat ini' : 'usulan') + (percentage ? ' (%)' : ' (Rp)'), type: percentage ? 'rate' : 'number', step: percentage ? 'any' : 1, optional: true, help: 'Kosong = default komponen. 0 = override nol.' }))];
      const record = { component_code: code, current_value: values.current_value ?? existing?.current_value ?? '', proposed_value: values.proposed_value ?? existing?.proposed_value ?? '' };
      U.form(existing ? 'Edit penugasan komponen' : 'Tetapkan komponen ke karyawan', schema, record, (data, form) => {
        const ids = [...form.querySelectorAll('[name="selected_employee"]:checked')].map(input => input.value);
        if (!ids.length) throw new Error('Pilih paling sedikit satu karyawan.');
        const apply = () => {
          mutate(w => {
            if (existing) w.employeeComponents.splice(Number(index), 1);
            for (const id of ids) {
              const assignment = { employee_id: id, ...data };
              const target = w.employeeComponents.findIndex(a => a.employee_id === id && a.component_code === data.component_code);
              if (target >= 0) w.employeeComponents[target] = assignment; else w.employeeComponents.push(assignment);
            }
          }); U.close(); U.toast(ids.length + ' penugasan diperbarui.');
        };
        U.confirm('Konfirmasi penugasan', h('div', {}, h('p', {}, ids.length + ' karyawan akan menerima komponen ' + data.component_code + '. Penugasan yang sama akan diperbarui.'), U.object(data)), apply, 'Terapkan penugasan');
      }, h('div', {}, U.notice('Default komponen: ' + (percentage ? U.rateDisplay(definition.default_value) : U.money(definition.default_value)) + '. Memilih komponen lain akan mengosongkan nilai untuk mencegah perubahan satuan tanpa sengaja.'), U.actions(h('button', { type: 'button', class: 'small', onclick: () => checks.querySelectorAll('input').forEach(i => { i.checked = true; }) }, 'Pilih semua'), h('button', { type: 'button', class: 'small', onclick: () => checks.querySelectorAll('input').forEach(i => { i.checked = false; }) }, 'Kosongkan pilihan')), checks), form => {
        form.elements.component_code.addEventListener('change', () => build(form.elements.component_code.value, { ids: [...checks.querySelectorAll('input:checked')].map(i => i.value), current_value: '', proposed_value: '' }));
      });
    };
    build(existing?.component_code || rows('componentDefinitions')[0].code);
  }
  function matrixGenerator(matrices) {
    const scenario = state.scenario;
    const matrixType = state.matrixType;
    const target = h('select', { name: 'generator-matrix', 'aria-label': 'Matriks tujuan' }, matrices.length ? matrices.map(m => h('option', { value: m.matrix_id }, m.name)) : h('option', { value: '' }, 'Buat matriks otomatis'));
    target.value = matrices[0]?.matrix_id || '';
    const schema = Array.from({ length: 5 }, (_, i) => [
      { key: 'base_' + i, label: 'KG ' + (i + 1) + ' · Gaji awal (Rp)', type: 'number', min: 1, step: 'any' },
      { key: 'cola_' + i, label: 'KG ' + (i + 1) + ' · COLA (%)', type: 'rate', min: 0 },
      { key: 'kmk_' + i, label: 'KG ' + (i + 1) + ' · Indeks KMK (%)', type: 'rate', min: 0 }
    ]).flat();
    const fields = h('div');
    const load = () => {
      let settings = [];
      try { settings = JSON.parse(matrices.find(m => m.matrix_id === target.value)?.generator_settings || '[]'); } catch (_) { /* Imported metadata may not contain generator settings. */ }
      if (!Array.isArray(settings)) settings = [];
      fields.replaceChildren(U.table(['Kelompok gaji', 'Gaji awal · sebelum COLA', 'COLA', 'Indeks KMK'], Array.from({ length: 5 }, (_, i) => [
        h('strong', {}, 'KG ' + (i + 1)), ...schema.slice(i * 3, i * 3 + 3).map((spec, j) => U.field(spec, settings[i]?.[['base_salary', 'cola', 'kmk_index'][j]] ?? (j ? '0' : '')))
      ])));
    };
    target.addEventListener('change', load); load();
    const error = h('div', { role: 'alert' });
    const form = h('form', {}, h('label', { class: 'field' }, 'Matriks tujuan · ' + (scenario === 'current' ? 'Saat ini' : 'Usulan'), target), fields,
      h('p', { class: 'muted' }, 'PM1 = gaji awal × (1 + COLA). KMK berikutnya × (1 + indeks KMK). P1 = PM3, M1 = P3, U1 = M3. Masukkan rupiah penuh, bukan ribuan. Pembulatan akhir: Rp ' + ws().globalRules.rounding + '.'),
      error, h('button', { type: 'submit', class: 'primary' }, 'Pratinjau 300 gaji · KG 1–5'));
    form.addEventListener('submit', event => {
      event.preventDefault();
      try {
        if (!C.normalizeMatrixType(matrixType)) throw new Error('Tetapkan jenis matriks yang valid terlebih dahulu.');
        const data = U.readForm(form, schema);
        const settings = Array.from({ length: 5 }, (_, i) => ({ base_salary: data['base_' + i], cola: data['cola_' + i], kmk_index: data['kmk_' + i] }));
        let matrixId = target.value;
        if (!matrixId) {
          matrixId = 'matrix-' + scenario + '-' + matrixType;
          while (rows('matrices').some(m => m.matrix_id === matrixId)) matrixId += '-2';
        }
        const generated = C.generateMatrix(settings, scenario, matrixId, ws().globalRules.rounding);
        const codes = new Set(generated.map(e => e.golongan));
        const existing = rows('matrixEntries').filter(e => e.matrix_id === matrixId && codes.has(e.golongan));
        const preview = U.table(['Golongan', 'Sebelum', 'Sesudah'], generated.map(e => {
          const matches = existing.filter(old => old.golongan === e.golongan);
          return [e.golongan, matches.length ? matches.map(old => U.amount(old.basic_salary)) : '—', U.amount(e.basic_salary)];
        }));
        U.confirm('Pratinjau matriks otomatis · ' + (scenario === 'current' ? 'Saat ini' : 'Usulan'), h('div', {}, U.notice(dirtyWarning() + existing.length + ' entri yang cocok pada matriks terpilih ' + matrixId + ' (' + matrixType + ') akan diganti. Identitas dan jenis lain tidak berubah. Golongan di luar KG 1–5 / PM,P,M,U / KMK 1–15 tetap dipertahankan. Override gaji pokok karyawan tidak diubah dan tetap mendahului matriks. Belum ada perubahan sampai diterapkan.'), preview), () => {
          mutate(w => {
            let matrix = w.matrices.find(m => m.matrix_id === matrixId);
            if (!matrix) { matrix = { matrix_id: matrixId, matrix_type: matrixType, scenario, name: 'Matriks otomatis · ' + (scenario === 'current' ? 'Saat ini' : 'Usulan'), effective_date: '' }; w.matrices.push(matrix); }
            matrix.generator_settings = JSON.stringify(settings);
            w.matrixEntries = w.matrixEntries.filter(e => !(e.matrix_id === matrixId && codes.has(e.golongan))).concat(generated.map(e => ({ ...e, note: existing.find(old => old.golongan === e.golongan)?.note || '' })));
            state.matrixId = matrixId;
            state.matrixView = 'grid';
          });
          U.close(); U.toast('300 gaji diterapkan. Ekspor workspace untuk menyimpan parameter dan hasil.');
        }, 'Terapkan 300 gaji');
      } catch (e) { error.className = 'form-error'; error.textContent = e.message; }
    });
    return U.panel('Matriks otomatis · cukup 3 input per KG', form);
  }
  function copyMatrix() {
    const source = rows('matrices').find(m => m.matrix_id === state.matrixId);
    const current = selectedEntries();
    if (!source || !C.normalizeMatrixType(source.matrix_type)) { U.toast('Pilih matriks dengan jenis valid.'); return; }
    if (!current.length) { U.toast('Matriks sumber kosong; tidak ada entri untuk disalin.'); return; }
    const scenario = state.scenario === 'current' ? 'proposed' : 'current';
    const type = C.normalizeMatrixType(source.matrix_type);
    const targets = rows('matrices').filter(m => m.scenario === scenario && C.normalizeMatrixType(m.matrix_type) === type);
    if (targets.length > 1) { U.toast('Identitas tujuan ambigu; perbaiki duplikasi jenis terlebih dahulu.'); return; }
    let id = targets[0]?.matrix_id || source.matrix_id + '-' + scenario;
    if (!targets.length) while (rows('matrices').some(m => m.matrix_id === id)) id += '-2';
    confirmMutation('Salin matriks terpilih ke ' + scenario + '?', dirtyWarning() + source.matrix_id + ' · ' + type + ' → ' + id + ' (' + current.length + ' entri). Hanya matriks tujuan jenis ini beserta parameter generator diganti. Jenis lain, karyawan, dan seluruh override tetap dipertahankan.', w => {
      const matrix = { ...clone(source), matrix_id: id, scenario, matrix_type: type };
      const index = w.matrices.findIndex(m => m.matrix_id === id);
      if (index < 0) w.matrices.push(matrix); else w.matrices[index] = matrix;
      w.matrixEntries = w.matrixEntries.filter(e => e.matrix_id !== id).concat(current.map(e => ({ ...e, matrix_id: id, scenario })));
      state.scenario = scenario; state.matrixType = type; state.matrixId = id;
    });
  }
  function adjustMatrix() {
    const entries = selectedEntries();
    if (!entries.length) { U.toast('Belum ada entri pada skenario ini.'); return; }
    const groupChecks = h('div', { class: 'check-list' }, unique(entries.map(e => String(e.salary_group))).map(g => h('label', {}, h('input', { type: 'checkbox', name: 'group', value: g, checked: true }), 'Kelompok ' + g)));
    const categoryChecks = h('div', { class: 'check-list' }, unique(entries.map(e => e.professional_category)).map(c => h('label', {}, h('input', { type: 'checkbox', name: 'category', value: c, checked: true }), c)));
    const schema = [{ key: 'rate', label: 'Penyesuaian (%) — negatif untuk penurunan', type: 'rate', min: -100, required: true, help: '9 berarti naik 9%, -5 berarti turun 5%.' }, U.schemas.globalRules.find(s => s.key === 'rounding')];
    U.form('Penyesuaian matriks · ' + state.matrixId + ' · ' + state.matrixType + ' · ' + (state.scenario === 'current' ? 'Saat ini' : 'Usulan'), schema, { rounding: ws().globalRules.rounding }, (data, form) => {
      const selected = name => [...form.querySelectorAll('[name="' + name + '"]:checked')].map(i => i.value);
      const groups = selected('group'), categories = selected('category');
      const matches = entries.filter(e => groups.includes(String(e.salary_group)) && categories.includes(e.professional_category));
      if (!matches.length) throw new Error('Pilih kelompok dan kategori dengan setidaknya satu entri.');
      const adjusted = C.adjustMatrix(clone(matches), data.rate, data.rounding);
      if (!Array.isArray(adjusted) || adjusted.length !== matches.length) throw new Error('Ketidakcocokan API adjustMatrix: daftar entri tidak sesuai.');
      const preview = U.table(['Golongan', 'Sebelum', 'Sesudah', 'Perubahan'], matches.map((e, i) => [e.golongan, U.amount(e.basic_salary), U.amount(adjusted[i].basic_salary), U.delta(C.change(e.basic_salary, adjusted[i].basic_salary))]));
      U.confirm('Pratinjau penyesuaian · ' + matches.length + ' entri', h('div', {}, U.notice('Hanya matriks terpilih ' + state.matrixId + ' · ' + state.matrixType + '. Matriks lain dan override karyawan tidak berubah. Belum diterapkan. Periksa nominal dan pembulatan sebelum mengonfirmasi.'), preview), () => {
        mutate(w => { matches.forEach((e, i) => { w.matrixEntries[rows('matrixEntries').indexOf(e)] = adjusted[i]; }); });
        U.close(); U.toast('Penyesuaian matriks diterapkan.');
      }, 'Terapkan penyesuaian');
    }, h('div', {}, h('h3', {}, 'Kelompok gaji'), groupChecks, h('h3', {}, 'Kategori profesional (pilih semua untuk seluruh kategori)'), categoryChecks));
    document.querySelector('[form="record-form"]').textContent = 'Lihat pratinjau';
  }
  function importFile(kind) {
    if (kind !== 'workspace' && !requireWorkspace()) return;
    const input = h('input', { type: 'file', accept: '.csv,text/csv', id: 'import-file', required: true });
    const mode = h('select', { id: 'import-mode' }, [['add', 'Tambah saja — tolak ID yang sudah ada'], ['update', 'Tambah & perbarui berdasarkan ID'], ['replace', 'Ganti seluruh karyawan']].map(([value, label]) => h('option', { value }, label)));
    const error = h('div', { role: 'alert' });
    const body = h('div', {}, U.notice((kind === 'workspace' ? dirtyWarning() + 'Impor workspace menggantikan seluruh data di layar. ' : '') + 'File hanya dibaca di perangkat ini. Pilih CSV UTF-8; perubahan belum diterapkan sampai Anda mengonfirmasi pratinjau.'), h('label', { class: 'field', for: 'import-file' }, 'File CSV', input), kind === 'employees' ? h('label', { class: 'field', for: 'import-mode' }, 'Mode impor', mode) : null, error);
    const previewButton = h('button', { type: 'button', class: 'primary', onclick: async () => {
      if (!input.files[0]) { error.className = 'form-error'; error.textContent = 'Pilih file CSV terlebih dahulu.'; return; }
      previewButton.disabled = true;
      const file = input.files[0];
      const selectedMode = mode.value;
      try {
        const text = await file.text();
        // A closed dialog cancels an in-flight read; it must not replace a newer dialog.
        if (!body.isConnected || !document.getElementById('dialog').open) return;
        let preview;
        if (kind === 'workspace') {
          const candidate = C.csv.importWorkspace(text);
          preview = { workspace: candidate, added: candidate.employees.length, updated: 0, unchanged: 0, rejected: 0, issues: C.validate(candidate) };
        } else preview = kind === 'employees' ? C.csv.previewEmployees(text, clone(ws()), selectedMode) : C.csv.previewMatrix(text, clone(ws()));
        showImportPreview(kind, preview, file.name, selectedMode);
      } catch (e) { error.className = 'form-error'; error.textContent = 'Impor gagal: ' + e.message; previewButton.disabled = false; }
    } }, 'Baca & lihat pratinjau');
    U.dialog('Impor ' + { workspace: 'workspace', employees: 'karyawan', matrix: 'matriks' }[kind] + ' CSV', body, [previewButton]);
  }
  function showImportPreview(kind, preview, filename, mode) {
    if (!preview || !preview.workspace || !Array.isArray(preview.issues)) throw new Error('Ketidakcocokan API impor: bentuk pratinjau tidak valid.');
    const blocked = U.importBlocked(kind, preview);
    const candidate = preview.workspace;
    const content = h('div', {}, h('p', {}, 'File: ', h('strong', {}, filename)), U.cards([['Ditambahkan', preview.added], ['Diperbarui', preview.updated], ['Tidak berubah', preview.unchanged], ['Ditolak', preview.rejected]]), U.notice(blocked ? 'Impor tidak dapat diterapkan karena ada baris ditolak atau kesalahan. Perbaiki file sumber lalu impor ulang. Tidak ada data di layar yang berubah.' : dirtyWarning() + (kind === 'workspace' ? 'Seluruh workspace akan diganti. Struktur CSV valid dan draf dapat dibuka. Kesalahan validasi di bawah hanya menghalangi perhitungan payroll dan ekspor hasil; lengkapi data setelah membuka workspace.' : kind === 'employees' && mode === 'replace' ? 'Seluruh karyawan akan diganti; periksa penugasan komponen pada hasil pratinjau.' : kind === 'matrix' ? 'Entri matriks yang sama dapat diganti. Periksa skenario dan gaji.' : 'Pembaruan menggunakan ID karyawan, bukan nama.')), U.issues(preview.issues));
    if (kind === 'workspace') content.append(U.object(candidate.metadata), U.object({ 'Karyawan': candidate.employees.length, 'Entri matriks': candidate.matrixEntries.length, 'Komponen': candidate.componentDefinitions.length, 'Penugasan': candidate.employeeComponents.length, 'Aturan BPJS': candidate.bpjsRules.length }));
    if (kind === 'matrix') content.append(U.table(['Skenario', 'Golongan', 'Gaji pokok'], candidate.matrixEntries.map(e => [e.scenario === 'current' ? 'Saat ini' : 'Usulan', e.golongan, U.amount(e.basic_salary)])));
    else content.append(U.table(['ID', 'Nama', 'Golongan saat ini', 'Golongan usulan'], candidate.employees.map(e => [e.employee_id, e.name, e.current_golongan, e.proposed_golongan || '—'])));
    U.dialog('Konfirmasi pratinjau impor', content, [h('button', { type: 'button', class: 'primary', disabled: blocked, onclick: () => {
      if (U.importBlocked(kind, preview)) return;
      if (kind === 'workspace') replace(clone(candidate), true, filename);
      else { state.workspace = clone(candidate); state.dirty = true; state.result = null; state.filename = filename; U.close(); render(); }
      U.toast('Impor diterapkan: ' + filename);
    } }, kind === 'workspace' || mode === 'replace' ? 'Konfirmasi & ganti data' : 'Konfirmasi & terapkan impor')]);
  }
  function exportResults(print = false) {
    if (!requireWorkspace()) return;
    const result = C.calculatePayroll(ws());
    state.result = result;
    if (!result.totals || (result.issues || []).some(i => i.severity === 'error')) {
      state.section = 'simulation'; render(); U.toast('Hasil diblokir. Perbaiki kesalahan sebelum mengekspor atau mencetak.'); return;
    }
    const execute = () => {
      U.close();
      if (print) { state.section = 'simulation'; render(); window.print(); }
      else { download(C.csv.exportResults(result), 'caroll-hasil-payroll.csv'); U.toast('Ekspor hasil dimulai. Seluruh karyawan hasil perhitungan disertakan.'); }
    };
    const warnings = (result.issues || []).filter(i => i.severity === 'warning');
    if (warnings.length) U.confirm('Tinjau peringatan sebelum ' + (print ? 'mencetak' : 'ekspor'), h('div', {}, h('p', {}, warnings.length + ' peringatan masih ada. Hasil merupakan simulasi berdasarkan parameter saat ini.'), U.issues(warnings)), execute, print ? 'Tetap cetak' : 'Tetap ekspor hasil');
    else execute();
  }
  function breakdown(id) {
    const r = state.result?.employees.find(e => e.employee_id === id);
    if (!r) return;
    const employee = rows('employees').find(e => e.employee_id === id);
    const hasOverride = hasBasicOverride(employee, 'current') || hasBasicOverride(employee, 'proposed');
    U.dialog('Rincian · ' + r.name + ' (' + id + ')', h('div', {}, hasOverride ? U.notice('OVERRIDE GAJI POKOK — Gaji pokok menggunakan nilai eksplisit yang mendahului matriks. PPh 21 dihitung otomatis dari penghasilan kena pajak.') : null, U.table(['Ukuran', 'Saat ini', 'Usulan'], metricKeys.map(key => [U.labels[key], U.amount(r.current[key]), U.amount(r.proposed[key])])), U.issues(r.issues), h('div', { class: 'two-column' }, h('section', {}, h('h3', {}, 'Rincian perhitungan saat ini'), U.object(r.current.breakdown)), h('section', {}, h('h3', {}, 'Rincian perhitungan usulan'), U.object(r.proposed.breakdown))), h('details', {}, h('summary', {}, 'Input karyawan & penugasan'), U.object(employee), U.object(rows('employeeComponents').filter(a => a.employee_id === id)))), [U.button('Edit karyawan', 'edit', { collection: 'employees', index: rows('employees').indexOf(employee) }, 'primary')]);
  }
  const actions = {
    'employee-actions': data => {
      const index = Number(data.index);
      const employee = rows('employees')[index];
      if (!employee) return;
      U.dialog('Tindakan · ' + employee.employee_id + ' · ' + employee.name,
        controls('edit', index, 'employees', true));
    },
    'employee-validation': showEmployeeValidation,
    'repair-section': data => { U.close(); actions.navigate(data); },
    navigate: data => { state.section = data.section; state.filters = {}; render(); document.getElementById('main').focus(); },
    new: () => {
      const create = () => { replace(C.createWorkspace(), false); actions['edit-metadata'](); };
      if (ws()) U.confirm('Buat workspace baru?', h('p', {}, dirtyWarning() + 'Workspace di layar akan diganti dengan workspace kosong. Tidak ada tarif hukum yang diasumsikan.'), create, 'Buat workspace kosong'); else create();
    },
    sample: () => U.confirm('Coba data contoh fiktif?', h('p', {}, dirtyWarning() + 'Data layar akan diganti dengan demo fiktif. Semua nama, gaji, tarif, dan batas hanya ilustrasi; jangan gunakan sebagai aturan hukum.'), () => replace(C.sampleWorkspace(), false, '', true), 'Muat demo fiktif'),
    reset: () => U.confirm('Hapus semua data dari layar?', h('p', {}, dirtyWarning() + 'Seluruh data dalam memori akan dihapus. File CSV yang sudah diunduh tidak dihapus dari komputer.'), () => { replace(null, true); U.toast('Semua data di layar telah dihapus.'); }, 'Hapus data layar'),
    'edit-metadata': () => { if (requireWorkspace()) U.form('Informasi workspace', U.schemas.metadata, ws().metadata, data => { mutate(w => { w.metadata = data; }); U.close(); }); },
    'edit-rules': () => U.form('Aturan global, BPJS & estimasi PPh 21', U.schemas.globalRules, ws().globalRules, data => { mutate(w => { w.globalRules = { ...w.globalRules, ...data }; }); U.close(); }, U.notice('Aturan otomatis BPJS Kesehatan memerlukan tanggal bergabung dan tanggal acuan tiap skenario. Aturan BPJS TK permanen memerlukan status permanen terstruktur pada setiap karyawan. Checkbox BPJS per karyawan tetap dipakai hanya dalam mode manual.')),
    'edit-payment-policies': () => U.form('Skema pembayaran · saat ini & usulan', U.schemas.paymentPolicies, ws().globalRules, data => {
      U.confirm('Terapkan skema pembayaran?', h('div', {}, U.notice('Hasil simulasi akan dihitung ulang. Skema ini berlaku untuk seluruh karyawan pada masing-masing skenario.'), U.object(Object.fromEntries(U.schemas.paymentPolicies.map(s => [s.label, s.options.find(([value]) => value === data[s.key])[1]])))), () => { mutate(w => { Object.assign(w.globalRules, data); }); U.close(); }, 'Terapkan skema');
    }, U.notice('PPh: gross mengurangi THP; net dibayar perusahaan di luar bruto; gross-up memberi tunjangan pajak di bruto. BPJS: pilih apakah porsi karyawan dipotong dari THP atau ditutup tunjangan perusahaan. Porsi perusahaan tetap terpisah. Belum dikonfirmasi menghalangi perhitungan terkait. Aktifkan estimasi PPh pada aturan global jika diperlukan.')),
    edit: data => editRecord(data.collection, data.index),
    duplicate: data => editRecord(data.collection, data.index, true),
    delete: data => deleteRecord(data.collection, data.index),
    assign: data => assign(data.index),
    'copy-matrix': copyMatrix,
    'normalize-basic-overrides': () => {
      const candidate = clone(ws());
      const changes = C.normalizeBasicOverrides(candidate);
      if (!changes.length) { U.toast('Tidak ada override yang dapat dinormalisasi; pastikan golongan dan matriksnya tersedia.'); return; }
      const different = changes.filter(change => change.differs).length;
      U.confirm('Normalisasi semua override gaji?', h('div', {}, U.notice(changes.length + ' override akan dikosongkan agar kembali mengikuti matriks; ' + different + ' di antaranya saat ini berbeda dari matriks.'), U.table(['Karyawan', 'Skenario', 'Override', 'Matriks'], changes.map(change => [change.employee_id, change.scenario === 'current' ? 'Saat ini' : 'Usulan', U.amount(change.from), U.amount(change.to)]))), () => {
        mutate(w => { C.normalizeBasicOverrides(w); });
        U.close(); U.toast(changes.length + ' override gaji dinormalisasi ke matriks.');
      }, 'Normalisasi override');
    },
    'bulk-matrix-type': () => {
      const indexes = filteredEmployees().map(e => rows('employees').indexOf(e));
      if (!indexes.length) { U.toast('Tidak ada karyawan dalam hasil filter.'); return; }
      U.form('Tetapkan jenis matriks untuk hasil filter · ' + indexes.length + ' karyawan', [
        { key: 'scenario', label: 'Skenario', type: 'select', options: [['current', 'Saat ini'], ['proposed', 'Usulan']], default: 'current' },
        { key: 'matrix_type', label: 'Jenis matriks', type: 'select', options: knownTypes().map(t => [t, t]), required: true }
      ], {}, data => {
        if (!['current', 'proposed'].includes(data.scenario) || !knownTypes().includes(data.matrix_type)) throw new Error('Pilih skenario dan jenis matriks yang tersedia.');
        confirmMutation('Tetapkan jenis matriks?', indexes.length + ' karyawan · ' + data.scenario + ' · ' + data.matrix_type + '. Golongan, override gaji pokok, arsip pajak, dan penugasan komponen tetap dipertahankan. Tinjau kecocokan golongan setelah perubahan.', w => indexes.forEach(i => { w.employees[i][data.scenario + '_matrix_type'] = data.matrix_type; }));
      });
    },
    'adjust-matrix': adjustMatrix,
    'equal-golongan': () => {
      const employees = filteredEmployees();
      if (!employees.length) { U.toast('Tidak ada karyawan dalam hasil filter.'); return; }
      const ids = new Set(employees.map(e => e.employee_id));
      confirmMutation('Samakan golongan usulan?', employees.length + ' karyawan pada hasil filter akan memakai golongan saat ini sebagai golongan usulan. Jenis matriks dan override gaji pokok tetap dipertahankan; override tetap mendahului matriks.', w => w.employees.forEach(e => { if (ids.has(e.employee_id)) e.proposed_golongan = e.current_golongan; }));
    },
    import: data => importFile(data.kind),
    'export-workspace': () => { if (!requireWorkspace()) return; download(C.csv.exportWorkspace(ws()), 'caroll-workspace.csv'); state.dirty = false; render(); U.toast('Unduhan workspace dimulai. Pastikan file CSV berhasil tersimpan di folder unduhan.'); },
    'export-employees': () => { if (requireWorkspace()) { download(C.csv.exportEmployees(ws()), 'caroll-karyawan.csv'); U.toast('Ekspor karyawan dimulai; status workspace tidak berubah.'); } },
    'export-matrix': () => { if (!state.matrixId || !C.normalizeMatrixType(state.matrixType)) { U.toast('Pilih matriks dengan jenis valid sebelum ekspor.'); return; } download(C.csv.exportMatrix(ws(), state.scenario, state.matrixType, state.matrixId), 'caroll-matriks-' + state.scenario + '-' + state.matrixType + '.csv'); },
    'export-results': () => exportResults(false),
    print: () => exportResults(true),
    calculate: () => { state.result = C.calculatePayroll(ws()); render(); U.toast(state.result.totals ? 'Simulasi selesai dihitung.' : 'Perhitungan diblokir oleh kesalahan data.'); },
    breakdown: data => breakdown(data.id),
    'clear-filters': () => { state.filters = {}; render(); }
  };
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    try { actions[button.dataset.action]?.(button.dataset); } catch (e) { U.toast('Tindakan gagal: ' + e.message); console.error(e); }
  });
  function applyFilter(input) {
    const key = input.dataset.filter;
    const selection = input.selectionStart;
    if (['scenario', 'matrixView', 'matrixType', 'matrixId'].includes(key)) state[key] = input.value;
    else state.filters[key] = input.value;
    render();
    const replacement = document.querySelector('[data-filter="' + key + '"]');
    if (replacement) { replacement.focus(); if (input.type === 'search' && selection !== null) replacement.setSelectionRange(selection, selection); }
  }
  document.addEventListener('change', event => { if (event.target.matches('select[data-filter]')) applyFilter(event.target); });
  document.addEventListener('input', event => { if (event.target.matches('input[data-filter]')) applyFilter(event.target); });
  window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  const missing = ['createWorkspace', 'sampleWorkspace', 'golongan', 'parseGolongan', 'normalizeMatrixType', 'resolveMatrixType', 'resolveBasic', 'adjustMatrix', 'validate', 'calculatePayroll', 'change'].filter(key => typeof C[key] !== 'function');
  const missingCSV = ['parse', 'stringify', 'exportWorkspace', 'importWorkspace', 'exportEmployees', 'previewEmployees', 'previewMatrix', 'exportMatrix', 'exportResults'].filter(key => typeof C.csv?.[key] !== 'function');
  if (missing.length || missingCSV.length) {
    document.getElementById('main').replaceChildren(U.heading('Modul lokal belum lengkap', 'Seluruh file JavaScript harus tersedia di folder js.'), U.notice('Ketidakcocokan API / modul belum tersedia: ' + [...missing.map(k => 'Caroll.' + k), ...missingCSV.map(k => 'Caroll.csv.' + k)].join(', ') + '. Muat ulang setelah semua modul lokal tersedia.'));
    document.querySelector('[data-action="export-workspace"]').disabled = true;
  } else render();
})();
