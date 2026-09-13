# Panduan Caroll

## Membuka aplikasi

Buka `index.html` langsung dari Finder/File Explorer di Chrome desktop. Semua file CSS/JS harus tetap bersama folder aplikasi. Tidak perlu internet, server, atau instalasi. Pilih workspace kosong, buka CSV workspace, atau gunakan data contoh fiktif.

## Alur simulasi

1. **Workspace:** isi nama dan label periode saat ini/usulan.
2. **Matriks gaji:** pilih skenario lalu gunakan panel **Matriks otomatis** (lihat di bawah), atau buat identitas matriks dan tambah entri manual. Golongan dibentuk dari kelompok, kategori profesional, dan KMK, misalnya `3-PM8`. Tampilan daftar dan grid memakai data yang sama.
3. Salin matriks saat ini ke usulan bila diperlukan. Penyesuaian persentase dapat dibatasi menurut kelompok/kategori. Tinjau jumlah lama/baru dan pembulatan pada pratinjau sebelum konfirmasi.
4. **Karyawan:** tambah data atau impor CSV. ID adalah kunci pencocokan, bukan nama. Golongan usulan kosong mengikuti kode golongan saat ini jika aturan global aktif, tetapi tetap memakai matriks usulan. Gaji pokok kedua skenario wajib berasal dari tepat satu entri matriks yang cocok pada skenario masing-masing; entri hilang atau ambigu menghalangi perhitungan. UI karyawan tidak lagi menyediakan edit override gaji pokok; impor tidak menebak gaji dari spreadsheet lain.
5. **Komponen payroll:** buat definisi pendapatan, potongan, atau kontribusi pemberi kerja, lalu tugaskan kepada satu/beberapa karyawan. Definisi tanpa penugasan tidak dihitung. Nilai penugasan kosong memakai default; angka nol benar-benar nol. Nilai saat ini dan usulan terpisah.
6. **Aturan perhitungan:** periksa aturan global, program BPJS, partisipasi karyawan, dan Estimasi PPh 21. Tidak ada tarif hukum yang diasumsikan benar. Untuk BPJS Kesehatan gunakan kode yang mengandung `kesehatan`; program lain mengikuti partisipasi ketenagakerjaan.
7. **Simulasi payroll:** hitung, tinjau kesalahan/peringatan, filter hasil, dan buka rincian karyawan. Kesalahan menghalangi hasil. Total organisasi mencakup seluruh hasil, bukan hanya filter tampilan.
8. Ekspor workspace untuk melanjutkan di kemudian hari. Ekspor hasil CSV untuk analisis dan gunakan cetak ringkasan untuk ringkasan organisasi.

## Matriks otomatis

Panel langsung di halaman matriks menerima tiga input untuk masing-masing KG 1–5: gaji awal (`base_salary`) positif dalam **rupiah penuh, bukan ribuan** (desimal boleh), COLA (%) dan indeks KMK (`kmk_index`, %) yang tidak negatif. Pilih matriks tujuan; bila belum ada pada skenario terpilih, identitas matriks dibuat otomatis saat diterapkan.

Generator menghasilkan **300 sel**: KG 1–5 × PM/P/M/U × KMK 1–15, hanya pada skenario terpilih. Rumusnya `base_salary * (1 + cola) * (1 + kmk_index)^(kmkLevel - 1 + 2 * tierIndex)`, dengan tarif berupa fraksi (input layar dibagi 100), `kmkLevel` = 1–15 dan `tierIndex` PM/P/M/U = 0/1/2/3. Perhitungan majemuk memakai nilai antara eksak; hanya hasil akhir dibulatkan menurut aturan global. PM1 adalah gaji awal setelah COLA; P1 = PM3, M1 = P3, U1 = M3.

Klik **Pratinjau 300 gaji · KG 1–5**, tinjau sebelum/sesudah, lalu konfirmasi. Belum ada perubahan sebelum diterapkan. Semua koordinat yang cocok pada skenario tersebut diganti, termasuk edit manual dan entri dari identitas matriks lain. Entri di luar rentang, catatan entri yang cocok, dan data override karyawan lama tetap dipertahankan; override gaji pokok tidak pernah dipakai dalam perhitungan. Skenario lain tidak berubah.

Parameter disimpan pada matriks sebagai teks JSON opsional `generator_settings`. Versi aplikasi saat ini menerima CSV workspace lama tanpa kolom tersebut; versi aplikasi lama mungkin menolak ekspor baru yang menyertakannya. Ekspor **workspace** menyimpan parameter dan gaji; ekspor **matriks** hanya menyimpan gaji beserta metadata entri, bukan parameter. Edit manual tidak menghitung ulang parameter secara otomatis; regenerasi menimpa sel yang cocok. Gunakan parameter yang disetujui organisasi, bukan asumsi gaji dari workbook nyata.

## Impor dan ekspor

Gunakan [referensi CSV](CSV_FORMAT.md) untuk kolom dan format. Impor menampilkan pratinjau sebelum perubahan diterapkan. Impor karyawan mendukung tambah saja, tambah/perbarui berdasarkan ID, dan penggantian. Kolom yang tidak disertakan pada pembaruan tidak menghapus nilai lama. Kolom `current_basic_override` dan `proposed_basic_override` tetap tersedia di CSV untuk kompatibilitas dan data lama dipertahankan, tetapi nilainya tidak pernah dipakai dalam perhitungan. Nilai tidak kosong, termasuk nol, memunculkan peringatan bahwa nilai diabaikan. Override PPh dan komponen tetap berlaku seperti sebelumnya. Tinjau peringatan perubahan nama dan ID lama yang tidak ada dalam file baru.

Impor matriks memperbarui entri menurut skenario dan golongan. Satu identitas matriks per skenario didukung. CSV workspace menyimpan seluruh entitas; CSV karyawan dan hasil **bukan** backup lengkap. Workspace yang masih belum siap dihitung boleh disimpan dan dilanjutkan; perbaiki masalah sebelum menjalankan simulasi.

Ekspor memakai UTF-8 BOM dan CRLF untuk Excel. ID dengan nol awal sebaiknya diimpor ke Excel sebagai kolom teks. Spreadsheet dapat menafsirkan teks yang diawali `=` sebagai rumus; jangan mengaktifkan konten atau rumus dari CSV yang tidak dipercaya.

## Angka dan perhitungan

- Input persen pada layar menggunakan angka persen: `9` berarti 9%; di CSV gunakan fraksi `0.09`.
- Hasil uang disimpan sebagai rupiah integer dengan pembulatan terkonfigurasi (1, 100, atau 1000); gaji awal generator boleh desimal. Nilai tepat di tengah dibulatkan menjauh dari nol.
- Persentase bruto (`percentage_gross`) dihitung sebelum tunjangan BPJS dan pajak: basisnya gaji pokok ditambah pendapatan bukan-persentase-bruto. Semua komponen persentase-bruto serta kedua tunjangan dikecualikan dari basis ini agar tidak terjadi rumus melingkar.
- Semua basis kontribusi BPJS, termasuk bruto, dihitung sebelum tunjangan BPJS dan pajak. Partisipasi, batas minimum/maksimum sebelum tarif, pembulatan, serta flag aktif dan enable karyawan/pemberi kerja tidak berubah; kontribusi kedua pihak tetap terpisah.
- Pada **Aturan perhitungan → Atur skema pembayaran**, pilih kebijakan terpisah untuk PPh, BPJS Kesehatan, dan BPJS TK di masing-masing skenario. BPJS `employee` mengurangi THP; `company` memberi tunjangan sebesar porsi karyawan yang ditanggung (hanya program dengan kebijakan company). Tunjangan masuk bruto dan potongan BPJS karyawan tetap sebesar jumlah yang sama. Tunjangan BPJS tetap berlaku saat pajak nonaktif; jika kontribusi karyawan nol, tunjangannya juga nol. Rincian menampilkan pendapatan tunjangan BPJS dan potongan BPJS, serta UI total organisasi menampilkan metrik `bpjs_allowance` untuk kedua skenario.
- PPh per skenario: `gross` dipotong dari THP tanpa tunjangan; `net` dibayar perusahaan sebagai biaya di luar bruto tanpa potongan THP; `gross_up` memberi tunjangan pajak di bruto dan potongan yang sama. Pengaturan skenario mengalahkan metode lama per karyawan. Saat pajak nonaktif, pajak dan tunjangannya nol.
- Workspace baru: saat ini BPJS TK `employee`, PPh/Kesehatan `unconfirmed`; usulan gross-up PPh dan company untuk kedua BPJS. Pilihan belum dikonfirmasi menghalangi kalkulasi terkait yang aktif. Workspace lama tanpa kolom kebijakan tetap gross-up/company demi kompatibilitas, bukan sebagai bukti kebijakan organisasi. Demo juga memakai gross-up/company.
- Gross/net menghitung pajak = basis × tarif. Untuk gross-up: `pph = round(basis_before_allowance * rate / (1 - rate))`, dengan aritmetika desimal eksak dan pembulatan akhir sesuai aturan pajak. `tax_basis` memilih basis sebelum tunjangan pajak: `taxable` dan `gross` mencakup tunjangan BPJS, sedangkan `basic` hanya gaji pokok. Saat pajak aktif tanpa override tetap, tarif wajib `0 <= rate < 1` (di layar 0% sampai kurang dari 100%). Ini bukan model TER atau pajak progresif statutory.
- Override PPh tetap, termasuk nol, langsung menjadi pajak final; nilainya tidak di-gross-up lagi. Khusus gross-up, `tax_allowance = pph`, masuk ke bruto yang dilaporkan dan dipotong sebagai pajak dengan jumlah sama. Rincian menampilkan baris pendapatan tunjangan pajak dan baris pajak.
- THP = bruto − BPJS karyawan − PPh yang dipotong (nol pada net) − potongan lain. Jika semua porsi karyawan ditanggung dengan tunjangan, THP sama dengan bruto sebelum tunjangan dikurangi potongan lain. Tunjangan BPJS dan potongannya saling mengimbangi, bukan dua penambah uang tunai THP. Dibanding model lama tanpa tunjangan BPJS, dengan input lain sama, THP naik sebesar porsi BPJS karyawan yang sebelumnya mengurangi THP.
- Biaya pemberi kerja = bruto (termasuk tunjangan BPJS dan pajak) + BPJS pemberi kerja + kontribusi pemberi kerja lainnya + pajak net di luar bruto (`cost = gross + employer_bpjs + employer_contributions + employer_tax_cost`). BPJS pemberi kerja tetap biaya terpisah; jangan tambahkan lagi tunjangan atau BPJS karyawan karena sudah masuk bruto tepat sekali. `employer_tax_cost` sebesar PPh pada net, nol pada gross/gross-up.
- CSV hasil tetap memakai kolom bruto yang ada (`current_gross`, `proposed_gross`), kini termasuk tunjangan BPJS dan pajak. Tidak direncanakan kolom CSV baru untuk `bpjs_allowance`; metrik ini ditampilkan pada rincian dan total UI.
- Persentase organisasi dihitung dari total, bukan rata-rata persentase karyawan. Basis nol menjadi `N/A` kecuali kedua nilai nol.
- THP negatif ditolak kecuali diizinkan pada aturan global.

## Menyimpan dan privasi

Indikator **Belum disimpan** menandakan perubahan sejak impor/ekspor workspace. Setelah ekspor, pastikan file benar-benar ada di folder unduhan; browser tidak memberi aplikasi kepastian bahwa pengguna mempertahankan file. Peringatan tutup halaman bergantung pada perilaku browser.

Tidak ada autosave atau pemulihan otomatis. **Hapus semua data dari layar** mengosongkan memori aplikasi, bukan menghapus file unduhan. CSV tidak terenkripsi dan tidak dilindungi akun. Jangan memasukkan rekening, NIK, NPWP lengkap, atau informasi yang tidak diperlukan. Jangan commit payroll atau gaji dari workbook nyata ke Git.

## Checklist pemeriksaan browser

- Buka langsung melalui `file://`, lalu matikan jaringan dan coba semua bagian.
- Buat/impor data, jalankan simulasi, ekspor workspace, reset, lalu impor ulang.
- Pastikan pratinjau impor yang dibatalkan tidak mengubah workspace.
- Coba impor 500 karyawan dan pembaruan berdasarkan ID.
- Salin seluruh folder ke lokasi lain lalu buka `index.html` di sana.
- Periksa tampilan pada lebar 768px; tabel lebar dapat digulir.
- Buka pratinjau cetak A4 landscape; periksa ringkasan sebelum mencetak.

Keputusan bisnis yang masih perlu ditetapkan: matriks otoritatif tiap periode, kategori Admin eksplisit, konfigurasi tunjangan, tarif/batas BPJS, kebutuhan TER, dan pemetaan spreadsheet organisasi. Versi ini menyediakan konfigurasi manual, bukan mengarang keputusan tersebut.
