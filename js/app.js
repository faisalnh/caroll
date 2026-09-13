(function () {
  'use strict';
  const C = globalThis.Caroll;
  const U = C.ui;
  const h = U.el;
  const sections = { workspace: ['Workspace', 'Kelola file dan mulai perencanaan payroll Anda.'], matrix: ['Matriks gaji', 'Susun gaji pokok berdasarkan golongan, kelompok, dan masa kerja.'], employees: ['Karyawan', 'Kelola data karyawan dan bandingkan penempatan golongan.'], components: ['Komponen payroll', 'Atur pendapatan, potongan, dan kontribusi pemberi kerja.'], rules: ['Aturan perhitungan', 'Tinjau parameter BPJS, estimasi PPh 21, dan aturan global.'], simulation: ['Simulasi payroll', 'Lihat dampak usulan terhadap karyawan dan biaya organisasi.'] };
  const state = { workspace: null, dirty: false, section: 'workspace', filename: '', demo: false, scenario: 'current', matrixView: 'grid', filters: {}, result: null, issues: [] };
  const clone = value => JSON.parse(JSON.stringify(value));
  const ws = () => state.workspace;
  const unique = values => [...new Set(values.filter(v => v !== undefined && v !== null && v !== ''))].sort((a, b) => String(a).localeCompare(String(b), 'id', { numeric: true }));
  const rows = name => ws()?.[name] || [];
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
    main.append(U.heading(...sections.matrix, U.button('Impor CSV', 'import', { kind: 'matrix' }), U.button('Ekspor matriks', 'export-matrix'), U.button('Tambah entri', 'edit', { collection: 'matrixEntries' }, 'primary')));
    const filters = h('div', { class: 'filters' }, U.filter('scenario', 'Skenario', [['current', 'Saat ini'], ['proposed', 'Usulan']], state.scenario), U.filter('matrixView', 'Tampilan', [['grid', 'Grid kelompok gaji'], ['list', 'Daftar golongan']], state.matrixView));
    filters.querySelectorAll('option[value=""]').forEach(o => o.remove());
    main.append(filters);
    const matrices = rows('matrices').filter(m => m.scenario === state.scenario);
    main.append(h('details', { class: 'matrix-metadata' }, h('summary', {}, 'Identitas matriks · ' + (state.scenario === 'current' ? 'Saat ini' : 'Usulan') + ' (' + matrices.length + ')'), U.panel('Identitas matriks · ' + (state.scenario === 'current' ? 'Saat ini' : 'Usulan'), matrices.length ? U.table(['ID matriks', 'Nama', 'Tanggal berlaku', 'Tindakan'], matrices.map(m => [m.matrix_id, m.name, m.effective_date || '—', controls('edit', rows('matrices').indexOf(m), 'matrices')])) : h('p', { class: 'muted' }, 'Buat identitas matriks sebelum menambahkan entri.'), U.button('Tambah matriks', 'edit', { collection: 'matrices' }, 'small'))));
    main.append(U.actions(U.button('Salin saat ini → usulan', 'copy-matrix'), U.button('Penyesuaian persentase', 'adjust-matrix')));
    main.append(h('p', { class: 'muted' }, 'Golongan = kelompok gaji + kategori profesional + KMK. Klik Edit atau nilai pada grid untuk mengubah entri.'));
    const entries = rows('matrixEntries').filter(e => e.scenario === state.scenario);
    if (state.matrixView === 'grid') {
      main.append(U.matrixGrid(rows('matrixEntries'), state.scenario, rows('matrices'), ws().metadata[state.scenario + '_period']));
    } else main.append(U.table(['Golongan', 'Kelompok', 'Kategori', 'KMK', 'Gaji pokok', 'Matriks', 'Catatan', 'Tindakan'], entries.map(e => [h('strong', {}, e.golongan), e.salary_group, e.professional_category, e.kmk_level, U.amount(e.basic_salary), e.matrix_id, h('span', { title: e.note || '' }, e.note || '—'), controls('edit', rows('matrixEntries').indexOf(e), 'matrixEntries', true)])));
  }
  function employeeIssues(e) { return state.issues.filter(i => i.employee_id === e.employee_id); }
  const isOverride = e => ['current_basic_override', 'proposed_basic_override', 'pph_fixed_override'].some(k => e[k] !== '' && e[k] !== undefined && e[k] !== null);
  function filteredEmployees() {
    const f = state.filters;
    return rows('employees').filter(e => (!f.search || (e.employee_id + ' ' + e.name).toLocaleLowerCase('id').includes(f.search.toLocaleLowerCase('id'))) && (!f.unit || e.unit === f.unit) && (!f.department || e.department === f.department) && (!f.golongan || e.current_golongan === f.golongan || e.proposed_golongan === f.golongan) && (!f.active || String(Boolean(e.active)) === f.active) && (!f.validation || (f.validation === 'clean' ? !employeeIssues(e).length : employeeIssues(e).some(i => i.severity === f.validation))));
  }
  function employeeFilters(simulation = false) {
    const f = state.filters;
    return h('div', { class: 'filters' }, U.search(f.search), U.filter('unit', 'Semua unit', unique(rows('employees').map(e => e.unit)), f.unit), U.filter('department', 'Semua departemen', unique(rows('employees').map(e => e.department)), f.department), simulation ? U.filter('change', 'Semua hasil', [['increased', 'THP naik'], ['unchanged', 'THP tetap'], ['decreased', 'THP turun'], ['golongan', 'Golongan berubah'], ['missing', 'Data bermasalah'], ['override', 'Override manual']], f.change) : [U.filter('golongan', 'Semua golongan', unique(rows('employees').flatMap(e => [e.current_golongan, e.proposed_golongan])), f.golongan), U.filter('active', 'Semua status aktif', [['true', 'Aktif'], ['false', 'Nonaktif']], f.active), U.filter('validation', 'Semua validasi', [['error', 'Kesalahan'], ['warning', 'Peringatan'], ['clean', 'Tanpa masalah']], f.validation)], U.button('Bersihkan filter', 'clear-filters', {}, 'small'));
  }
  function renderEmployees(main) {
    main.append(U.heading(...sections.employees, U.button('Impor CSV', 'import', { kind: 'employees' }), U.button('Ekspor CSV', 'export-employees'), U.button('Tambah karyawan', 'edit', { collection: 'employees' }, 'primary')), employeeFilters());
    const employees = filteredEmployees();
    main.append(h('div', { class: 'panel-head' }, h('span', { class: 'muted' }, employees.length + ' dari ' + rows('employees').length + ' karyawan'), U.button('Samakan golongan usulan (hasil filter)', 'equal-golongan', {}, 'small')));
    main.append(U.table(['ID / Nama', 'Unit / Departemen', 'Jabatan', 'Status', 'Golongan saat ini', 'Golongan usulan', 'Pokok saat ini', 'Pokok usulan', 'Validasi', 'Tindakan'], employees.map(e => [h('div', {}, h('strong', {}, e.name), h('div', { class: 'muted' }, e.employee_id)), h('div', {}, e.unit || '—', h('div', { class: 'muted' }, e.department || '—')), e.position || '—', U.badge(e.active ? 'Aktif' : 'Nonaktif'), e.current_golongan || '—', e.proposed_golongan || (ws().globalRules.proposed_defaults_current ? e.current_golongan + ' (default)' : '—'), basicCell(e, 'current'), basicCell(e, 'proposed'), U.actions(employeeIssues(e).map(i => U.badge(i.severity === 'error' ? 'Kesalahan' : 'Peringatan', i.severity)), isOverride(e) ? U.badge('Manual', 'override') : null), controls('edit', rows('employees').indexOf(e), 'employees', true)])));
    if (state.issues.length) main.append(U.panel('Catatan validasi', U.issues(state.issues)));
  }
  function basicCell(e, scenario) {
    const value = C.resolveBasic(ws(), e, scenario);
    const override = e[scenario + '_basic_override'];
    return h('div', {}, value === null ? U.badge('Gaji belum terpetakan', 'error') : U.amount(value), override !== '' && override !== undefined && override !== null ? h('div', {}, U.badge('Override manual', 'override')) : null);
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
    main.append(U.notice('Tarif hukum tidak diasumsikan. Verifikasi tarif, batas upah, kepesertaan, dan basis bersama pengelola payroll. Estimasi PPh 21 adalah model bulanan sederhana, bukan perhitungan pajak resmi atau rekonsiliasi tahunan.'));
    main.append(U.panel('Aturan BPJS', U.table(['Program', 'Tarif karyawan', 'Tarif pemberi kerja', 'Minimum basis', 'Maksimum basis', 'Basis', 'Status', 'Tindakan'], rows('bpjsRules').map((r, index) => [r.name + ' (' + r.code + ')', U.rateDisplay(r.employee_rate) + (r.employee_enabled ? '' : ' · nonaktif'), U.rateDisplay(r.employer_rate) + (r.employer_enabled ? '' : ' · nonaktif'), r.minimum_basis === '' || r.minimum_basis == null ? 'Tanpa batas' : U.amount(r.minimum_basis), r.maximum_basis === '' || r.maximum_basis == null ? 'Tanpa batas' : U.amount(r.maximum_basis), { basic: 'Gaji pokok', selected: 'Pokok + terpilih', gross: 'Bruto' }[r.basis] || r.basis, U.badge(r.active ? 'Aktif' : 'Nonaktif'), controls('edit', index, 'bpjsRules')])), U.button('Tambah program', 'edit', { collection: 'bpjsRules' }, 'small')));
    main.append(h('div', { class: 'two-column' }, U.panel('Aturan global', U.object(Object.fromEntries(U.schemas.globalRules.filter(s => !s.key.startsWith('tax_')).map(s => [s.label, ws().globalRules[s.key]])))), U.panel('Estimasi PPh 21', h('div', {}, U.object(Object.fromEntries(U.schemas.globalRules.filter(s => s.key.startsWith('tax_')).map(s => [s.label, ws().globalRules[s.key]]))), h('p', { class: 'muted' }, 'Metode gross / net / gross-up, PTKP, tarif manual, dan override pajak diatur pada formulir setiap karyawan.'), U.button('Kelola pengaturan karyawan', 'navigate', { section: 'employees' })))));
  }
  const metricKeys = ['basic_salary', 'gross', 'employee_bpjs', 'employer_bpjs', 'pph', 'deductions', 'take_home_pay', 'employer_contributions', 'tax_allowance', 'employer_tax_cost', 'employer_cost'];
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
        case 'override': return isOverride(e);
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
      cells.push(U.actions((r.issues || []).length ? U.badge(r.issues.length + ' catatan', 'warning') : U.badge('Siap'), isOverride(e) ? U.badge('Manual', 'override') : null), U.button('Lihat rincian', 'breakdown', { id: r.employee_id }, 'small'));
      return cells;
    }))));
    if (result.issues?.length) main.append(U.panel('Catatan hasil simulasi', U.issues(result.issues)));
    main.append(U.notice('Tinjau perbedaan negatif dan override manual. Estimasi pajak dan BPJS hanya seakurat parameter yang Anda verifikasi.'));
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
    if (collection === 'matrixEntries') {
      if (!rows('matrices').length) { U.toast('Tambahkan identitas matriks terlebih dahulu.'); editRecord('matrices'); return; }
      schema.find(s => s.key === 'matrix_id').options = rows('matrices').map(m => [m.matrix_id, m.name + ' · ' + (m.scenario === 'current' ? 'Saat ini' : 'Usulan')]);
      record.matrix_id = record.matrix_id || rows('matrices').find(m => m.scenario === state.scenario)?.matrix_id || rows('matrices')[0].matrix_id;
      record.scenario = rows('matrices').find(m => m.matrix_id === record.matrix_id).scenario;
    }
    if (collection === 'componentDefinitions' && record.calculation_type?.startsWith('percentage')) record.default_value = U.rateToPercent(record.default_value);
    const names = { employees: 'karyawan', matrices: 'matriks', matrixEntries: 'entri matriks', componentDefinitions: 'komponen', bpjsRules: 'program BPJS' };
    const extra = collection === 'employees' ? h('div', {}, U.notice('Nominal menggunakan rupiah bulat tanpa pemisah ribuan. Override kosong memakai matriks; 0 berarti gaji nol. Tarif pajak tidak ditetapkan otomatis.'), U.issues(existing ? employeeIssues(existing) : []), h('datalist', { id: 'golongan-list' }, unique(rows('matrixEntries').map(e => e.golongan)).map(code => h('option', { value: code })))) : collection === 'bpjsRules' ? U.notice('Masukkan tarif yang sudah diverifikasi. Tidak ada tarif hukum bawaan; kolom persen 1 berarti 1%.') : null;
    U.form((existing && !duplicate ? 'Edit ' : duplicate ? 'Duplikat ' : 'Tambah ') + names[collection], schema, record, (data) => {
      const target = existing && !duplicate ? Number(index) : -1;
      const key = { employees: 'employee_id', matrices: 'matrix_id', componentDefinitions: 'code', bpjsRules: 'code' }[collection];
      if (key && rows(collection).some((r, i) => i !== target && r[key] === data[key])) throw new Error('ID/kode sudah digunakan. Gunakan nilai unik.');
      if (collection === 'matrices' && rows('matrices').some((m, i) => i !== target && m.scenario === data.scenario)) throw new Error('Hanya satu matriks diperbolehkan per skenario. Edit matriks yang sudah ada atau pilih skenario lain.');
            if (collection === 'employees' && data.active && !data.current_golongan) throw new Error('Golongan saat ini wajib untuk karyawan aktif.');
            if (collection === 'employees') {
              for (const key of ['current_golongan', 'proposed_golongan']) {
                if (!data[key]) continue;
                const parsed = C.parseGolongan(data[key]);
                if (!parsed) throw new Error('Format golongan tidak valid: ' + data[key] + '. Contoh: 3-PM8.');
                data[key] = C.golongan(parsed.salary_group, parsed.professional_category, parsed.kmk_level);
              }
            }
      if (collection === 'matrixEntries') {
        data.professional_category = data.professional_category.toUpperCase();
        data.golongan = C.golongan(data.salary_group, data.professional_category, data.kmk_level);
        if (!data.golongan) throw new Error('Kelompok, kategori profesional, atau KMK tidak membentuk golongan yang valid.');
        data.salary_group = String(data.salary_group);
        data.scenario = rows('matrices').find(m => m.matrix_id === data.matrix_id).scenario;
        if (rows(collection).some((r, i) => i !== target && r.scenario === data.scenario && r.golongan === data.golongan)) throw new Error('Golongan tersebut sudah ada pada skenario ini.');
      }
      if (collection === 'componentDefinitions') {
        if (!data.calculation_type.startsWith('percentage') && !Number.isSafeInteger(data.default_value)) throw new Error('Nominal komponen harus rupiah bulat yang aman.');
      }
      if (collection === 'bpjsRules' && data.minimum_basis !== '' && data.maximum_basis !== '' && data.minimum_basis > data.maximum_basis) throw new Error('Batas minimum tidak boleh lebih besar dari maksimum.');
      const commit = () => {
        mutate(w => {
          if (target >= 0) w[collection][target] = data; else w[collection].push(data);
          if (existing && !duplicate && collection === 'employees') w.employeeComponents.forEach(a => { if (a.employee_id === existing.employee_id) a.employee_id = data.employee_id; });
          if (existing && collection === 'componentDefinitions') w.employeeComponents.forEach(a => { if (a.component_code === existing.code) a.component_code = data.code; });
          if (existing && collection === 'matrices') w.matrixEntries.forEach(e => { if (e.matrix_id === existing.matrix_id) { e.matrix_id = data.matrix_id; e.scenario = data.scenario; } });
        });
        U.close(); U.toast('Data disimpan di layar. Ekspor workspace untuk menyimpan file.');
      };
      if (existing && collection === 'matrices' && data.scenario !== existing.scenario) U.confirm('Ubah skenario matriks?', h('p', {}, 'Seluruh entri matriks ini akan ikut berpindah skenario. Periksa kembali resolusi gaji dan duplikasi golongan setelah perubahan.'), commit);
      else if (existing && collection === 'componentDefinitions' && existing.calculation_type.startsWith('percentage') !== data.calculation_type.startsWith('percentage') && rows('employeeComponents').some(a => a.component_code === existing.code)) U.confirm('Ubah satuan komponen?', h('p', {}, 'Nilai penugasan yang sudah ada tidak dikonversi otomatis. Perubahan antara rupiah dan persen mengubah maknanya; tinjau semua penugasan setelah menyimpan.'), commit);
      else commit();
    }, extra, form => {
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
  function copyMatrix() {
    const current = rows('matrixEntries').filter(e => e.scenario === 'current');
    if (!current.length) { U.toast('Matriks saat ini belum memiliki entri.'); return; }
    confirmMutation('Salin matriks saat ini ke usulan?', dirtyWarning() + 'Seluruh matriks dan entri usulan akan diganti dengan salinan saat ini (' + current.length + ' entri). Data karyawan tidak berubah.', w => {
      w.matrices = w.matrices.filter(m => m.scenario !== 'proposed');
      const mapping = new Map();
      for (const matrix of w.matrices.filter(m => m.scenario === 'current')) {
        let id = matrix.matrix_id + '-usulan';
        while (w.matrices.some(m => m.matrix_id === id)) id += '-2';
        mapping.set(matrix.matrix_id, id);
        w.matrices.push({ ...matrix, matrix_id: id, scenario: 'proposed', name: matrix.name + ' — usulan', effective_date: '' });
      }
      w.matrixEntries = w.matrixEntries.filter(e => e.scenario !== 'proposed').concat(current.map(e => ({ ...e, matrix_id: mapping.get(e.matrix_id), scenario: 'proposed' })));
      state.scenario = 'proposed';
    });
  }
  function adjustMatrix() {
    const entries = rows('matrixEntries').filter(e => e.scenario === state.scenario);
    if (!entries.length) { U.toast('Belum ada entri pada skenario ini.'); return; }
    const groupChecks = h('div', { class: 'check-list' }, unique(entries.map(e => String(e.salary_group))).map(g => h('label', {}, h('input', { type: 'checkbox', name: 'group', value: g, checked: true }), 'Kelompok ' + g)));
    const categoryChecks = h('div', { class: 'check-list' }, unique(entries.map(e => e.professional_category)).map(c => h('label', {}, h('input', { type: 'checkbox', name: 'category', value: c, checked: true }), c)));
    const schema = [{ key: 'rate', label: 'Penyesuaian (%) — negatif untuk penurunan', type: 'rate', min: -100, required: true, help: '9 berarti naik 9%, -5 berarti turun 5%.' }, U.schemas.globalRules.find(s => s.key === 'rounding')];
    U.form('Penyesuaian matriks · ' + (state.scenario === 'current' ? 'Saat ini' : 'Usulan'), schema, { rounding: ws().globalRules.rounding }, (data, form) => {
      const selected = name => [...form.querySelectorAll('[name="' + name + '"]:checked')].map(i => i.value);
      const groups = selected('group'), categories = selected('category');
      const matches = entries.filter(e => groups.includes(String(e.salary_group)) && categories.includes(e.professional_category));
      if (!matches.length) throw new Error('Pilih kelompok dan kategori dengan setidaknya satu entri.');
      const adjusted = C.adjustMatrix(clone(matches), data.rate, data.rounding);
      if (!Array.isArray(adjusted) || adjusted.length !== matches.length) throw new Error('Ketidakcocokan API adjustMatrix: daftar entri tidak sesuai.');
      const preview = U.table(['Golongan', 'Sebelum', 'Sesudah', 'Perubahan'], matches.map((e, i) => [e.golongan, U.amount(e.basic_salary), U.amount(adjusted[i].basic_salary), U.delta(C.change(e.basic_salary, adjusted[i].basic_salary))]));
      U.confirm('Pratinjau penyesuaian · ' + matches.length + ' entri', h('div', {}, U.notice('Belum diterapkan. Periksa nominal dan pembulatan sebelum mengonfirmasi.'), preview), () => {
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
    U.dialog('Rincian · ' + r.name + ' (' + id + ')', h('div', {}, isOverride(employee) ? U.notice('OVERRIDE MANUAL — gaji pokok dan/atau pajak menggunakan nilai eksplisit. Lihat input di bawah untuk membedakan nilai nol dari nilai kosong.') : null, U.table(['Ukuran', 'Saat ini', 'Usulan'], metricKeys.map(key => [U.labels[key], U.amount(r.current[key]), U.amount(r.proposed[key])])), U.issues(r.issues), h('div', { class: 'two-column' }, h('section', {}, h('h3', {}, 'Rincian perhitungan saat ini'), U.object(r.current.breakdown)), h('section', {}, h('h3', {}, 'Rincian perhitungan usulan'), U.object(r.proposed.breakdown))), h('details', {}, h('summary', {}, 'Input karyawan & penugasan'), U.object(employee), U.object(rows('employeeComponents').filter(a => a.employee_id === id)))), [U.button('Edit karyawan', 'edit', { collection: 'employees', index: rows('employees').indexOf(employee) }, 'primary')]);
  }
  const actions = {
    navigate: data => { state.section = data.section; state.filters = {}; render(); document.getElementById('main').focus(); },
    new: () => {
      const create = () => { replace(C.createWorkspace(), false); actions['edit-metadata'](); };
      if (ws()) U.confirm('Buat workspace baru?', h('p', {}, dirtyWarning() + 'Workspace di layar akan diganti dengan workspace kosong. Tidak ada tarif hukum yang diasumsikan.'), create, 'Buat workspace kosong'); else create();
    },
    sample: () => U.confirm('Coba data contoh fiktif?', h('p', {}, dirtyWarning() + 'Data layar akan diganti dengan demo fiktif. Semua nama, gaji, tarif, dan batas hanya ilustrasi; jangan gunakan sebagai aturan hukum.'), () => replace(C.sampleWorkspace(), false, '', true), 'Muat demo fiktif'),
    reset: () => U.confirm('Hapus semua data dari layar?', h('p', {}, dirtyWarning() + 'Seluruh data dalam memori akan dihapus. File CSV yang sudah diunduh tidak dihapus dari komputer.'), () => { replace(null, true); U.toast('Semua data di layar telah dihapus.'); }, 'Hapus data layar'),
    'edit-metadata': () => { if (requireWorkspace()) U.form('Informasi workspace', U.schemas.metadata, ws().metadata, data => { mutate(w => { w.metadata = data; }); U.close(); }); },
    'edit-rules': () => U.form('Aturan global & estimasi PPh 21', U.schemas.globalRules, ws().globalRules, data => { mutate(w => { w.globalRules = data; }); U.close(); }, U.notice('Pengaturan PPh ini hanya estimasi bulanan. Tarif dan status PTKP diatur per karyawan; validasikan bersama ahli payroll/pajak.')),
    edit: data => editRecord(data.collection, data.index),
    duplicate: data => editRecord(data.collection, data.index, true),
    delete: data => deleteRecord(data.collection, data.index),
    assign: data => assign(data.index),
    'copy-matrix': copyMatrix,
    'adjust-matrix': adjustMatrix,
    'equal-golongan': () => {
      const employees = filteredEmployees();
      if (!employees.length) { U.toast('Tidak ada karyawan dalam hasil filter.'); return; }
      const ids = new Set(employees.map(e => e.employee_id));
      confirmMutation('Samakan golongan usulan?', employees.length + ' karyawan pada hasil filter akan memakai golongan saat ini sebagai golongan usulan. Override gaji usulan tetap dipertahankan.', w => w.employees.forEach(e => { if (ids.has(e.employee_id)) e.proposed_golongan = e.current_golongan; }));
    },
    import: data => importFile(data.kind),
    'export-workspace': () => { if (!requireWorkspace()) return; download(C.csv.exportWorkspace(ws()), 'caroll-workspace.csv'); state.dirty = false; render(); U.toast('Unduhan workspace dimulai. Pastikan file CSV berhasil tersimpan di folder unduhan.'); },
    'export-employees': () => { if (requireWorkspace()) { download(C.csv.exportEmployees(ws()), 'caroll-karyawan.csv'); U.toast('Ekspor karyawan dimulai; status workspace tidak berubah.'); } },
    'export-matrix': () => download(C.csv.exportMatrix(ws(), state.scenario), 'caroll-matriks-' + state.scenario + '.csv'),
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
    if (key === 'scenario' || key === 'matrixView') state[key] = input.value;
    else state.filters[key] = input.value;
    render();
    const replacement = document.querySelector('[data-filter="' + key + '"]');
    if (replacement) { replacement.focus(); if (input.type === 'search' && selection !== null) replacement.setSelectionRange(selection, selection); }
  }
  document.addEventListener('change', event => { if (event.target.matches('select[data-filter]')) applyFilter(event.target); });
  document.addEventListener('input', event => { if (event.target.matches('input[data-filter]')) applyFilter(event.target); });
  window.addEventListener('beforeunload', event => { if (state.dirty) { event.preventDefault(); event.returnValue = ''; } });
  const missing = ['createWorkspace', 'sampleWorkspace', 'golongan', 'parseGolongan', 'resolveBasic', 'adjustMatrix', 'validate', 'calculatePayroll', 'change'].filter(key => typeof C[key] !== 'function');
  const missingCSV = ['parse', 'stringify', 'exportWorkspace', 'importWorkspace', 'exportEmployees', 'previewEmployees', 'previewMatrix', 'exportMatrix', 'exportResults'].filter(key => typeof C.csv?.[key] !== 'function');
  if (missing.length || missingCSV.length) {
    document.getElementById('main').replaceChildren(U.heading('Modul lokal belum lengkap', 'Seluruh file JavaScript harus tersedia di folder js.'), U.notice('Ketidakcocokan API / modul belum tersedia: ' + [...missing.map(k => 'Caroll.' + k), ...missingCSV.map(k => 'Caroll.csv.' + k)].join(', ') + '. Muat ulang setelah semua modul lokal tersedia.'));
    document.querySelector('[data-action="export-workspace"]').disabled = true;
  } else render();
})();
