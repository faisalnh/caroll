# Panduan Caroll

## Membuka aplikasi

Buka `index.html` langsung dari Finder/File Explorer di Chrome desktop. Semua file CSS/JS harus tetap bersama folder aplikasi. Tidak perlu internet, server, atau instalasi. Pilih workspace kosong, buka CSV workspace, atau gunakan data contoh fiktif.

## PPh 21 otomatis — amandemen

Bagian ini menggantikan aturan PPh manual lama. Aktifkan **PPh 21 otomatis** di aturan global, isi bulan pajak saat ini/usulan (`YYYY-MM`), dan konfirmasi rezim **Biasa — tanpa DTP/insentif khusus**. Label periode workspace bukan bulan pajak. Nilai kosong pada CSV lama tidak ditebak: lengkapi klasifikasi karyawan (kategori pajak, residensi, jenis masa, cakupan pembayaran), PTKP dropdown TK/0–3 atau K/0–3, serta identifikasi `tax_program` untuk BPJS aktif. Status kontrak dan kode BPJS kustom bukan bukti klasifikasi pajak. PTKP legacy tidak valid ditampilkan untuk diperbaiki dan memperingatkan/menghalangi pajak.

**Migrasi BPJS, termasuk saat PPh nonaktif:** setiap aturan BPJS aktif wajib memiliki `tax_program` yang didukung: `kesehatan`, `jkk`, `jkm`, `jht`, atau `jp`. Kode/nama aturan tidak menentukan kepesertaan. Nilai kosong, tidak dikenal, atau `other` memblokir perhitungan meskipun tidak ada peserta atau iuran dinonaktifkan. Identifikasi program yang sebenarnya, atau nonaktifkan aturan sebagai draft sampai siap. Draft nonaktif boleh belum teridentifikasi; penyimpanan/impor CSV tetap mempertahankan nilai kosong/`other` tanpa menebaknya.

Cakupan hanya orang pribadi dalam negeri, rezim biasa tahun **2024–2026**: pegawai tetap pada masa nonfinal selain Desember; pegawai tidak tetap yang benar-benar dibayar bulanan; bukan pegawai untuk **satu imbalan jasa biasa, bruto penuh tanpa pengecualian khusus atau sharing**. Tidak mendukung rekonsiliasi tahunan/masa terakhir, harian/mingguan, luar negeri, atau DTP. Jangan memilih kategori yang didukung untuk mengakali batasan kasus sebenarnya.

PPh memakai TER bulanan atau Pasal 17 progresif atas 50% bruto satu pembayaran bukan pegawai. Gross-up menghitung ulang sampai tunjangan sama persis dengan pajak, termasuk perpindahan lapisan tarif. Pilihan `net` lama tidak didukung; gunakan `gross_up` untuk pendanaan penuh oleh perusahaan. Nilai `pph_rate`, `pph_fixed_override`, `tax_basis`, dan `tax_rounding` lama hanya arsip CSV: tidak dapat diedit di UI pajak dan tidak memengaruhi perhitungan. Edit karyawan mempertahankan arsip; pembaruan CSV mempertahankan kolom yang tidak disertakan.

**Bukan klaim kepatuhan pajak lengkap:** pembulatan pajak akhir ke bawah rupiah penuh adalah asumsi simulasi, bukan aturan pembulatan universal yang telah diverifikasi. Konfirmasikan aturan sistem pelaporan sebelum penggunaan nyata; lihat [sumber dan batasan pajak](TAX_RULES.md). Draft boleh disimpan meski klasifikasi belum lengkap, tetapi perhitungan/ekspor hasil diblokir sampai persyaratan aktif terpenuhi.

## Alur simulasi

1. **Workspace:** isi nama dan label periode saat ini/usulan.
2. **Matriks gaji:** pilih skenario, jenis, dan identitas matriks lalu gunakan panel **Matriks otomatis** (lihat di bawah), atau buat identitas matriks dan tambah entri manual. Jenis wajib, disimpan lowercase setelah trim, dengan pola `^[a-z][a-z0-9_-]*$`; `regular` dan `admin` adalah jenis awal, bukan daftar tertutup. Jenis kustom boleh. Hanya satu identitas per pasangan skenario/jenis; kode golongan sama boleh memiliki gaji berbeda antarjenis. Golongan dibentuk dari kelompok, kategori profesional, dan KMK, misalnya `3-PM8`. Tampilan daftar dan grid memakai data yang sama.
3. Salin matriks terpilih ke skenario lain bila diperlukan; konfirmasi hanya mengganti tujuan dengan jenis yang sama beserta parameter generator. Jenis lain, karyawan, dan override tidak berubah. Grid/daftar, edit entri, penyesuaian persentase, dan ekspor matriks mengikuti identitas terpilih. Penyesuaian dapat dibatasi menurut kelompok/kategori; seluruh hasil penyesuaian dibulatkan ke atas ke kelipatan Rp1.000, lalu ditampilkan untuk ditinjau sebelum konfirmasi. Perubahan skenario/jenis induk juga perlu konfirmasi: entri ikut induk, tetapi jenis karyawan tidak ikut berubah.
4. **Karyawan:** tambah data atau impor CSV. ID adalah kunci pencocokan, bukan nama. Karyawan UI baru belum memiliki jenis; `current_matrix_type` wajib untuk karyawan aktif/yang dihitung. Pilih berurutan **jenis → KG → level profesional → KMK** dari entri skenario/jenis terkait; golongan dibentuk otomatis. Mengubah pilihan induk mereset pilihan turunannya. Nilai legacy yang tidak tersedia tetap terlihat untuk diperbaiki, bukan ditebak. Jenis usulan (`proposed_matrix_type`) boleh kosong: mengikuti jenis saat ini hanya jika `proposed_matrix_type_defaults_current` aktif (default true). Golongan usulan kosong mengikuti kode saat ini hanya jika `proposed_defaults_current` aktif. Kedua aturan terpisah dan tetap memakai matriks **usulan**, tidak menyalin gaji saat ini. Tanpa override, gaji memerlukan tepat satu sel skenario/jenis/golongan yang cocok.
5. **Komponen payroll:** buat definisi pendapatan, potongan, atau kontribusi pemberi kerja, lalu tugaskan kepada satu/beberapa karyawan. Definisi biasa tanpa penugasan tidak dihitung. Khusus **Persentase gaji pokok per anak (status PTKP)**, komponen berlaku otomatis: nominal = gaji pokok × tarif default × angka anak pada suffix PTKP (`TK/0`/`K/0` = 0; `/1` = 1; `/2` = 2; `/3` = 3). Penugasan lama untuk tipe ini diabaikan. Kode `TUNJ_ANAK` yang sebelumnya memakai Persentase gaji pokok otomatis ditingkatkan ke tipe per-anak saat disimpan atau diimpor. Untuk komponen lain, nilai penugasan kosong memakai default; angka nol benar-benar nol. Nilai saat ini dan usulan terpisah.
6. **Aturan perhitungan:** periksa aturan global, program BPJS, kepesertaan, dan PPh 21 otomatis. Kepesertaan dapat tetap **manual per karyawan**, atau otomatis: BPJS Kesehatan setelah minimum lama kerja (bulan penuh) terhadap tanggal acuan saat ini/usulan; BPJS TK hanya untuk `employment_type=permanent`. Mode otomatis mewajibkan `join_date` atau status permanen terstruktur dan tidak menebak dari teks `employment_status` maupun kategori pajak. Tarif/batas BPJS harus diverifikasi; tarif PPh dipilih otomatis dalam cakupan amandemen di atas.
7. **Simulasi payroll:** hitung, tinjau kesalahan/peringatan, filter hasil, dan buka rincian karyawan. Kesalahan menghalangi hasil. Total organisasi mencakup seluruh hasil, bukan hanya filter tampilan.
8. Ekspor workspace untuk melanjutkan di kemudian hari. Ekspor hasil CSV untuk analisis dan gunakan cetak ringkasan untuk ringkasan organisasi.

## Override gaji pokok dan penetapan jenis massal

**Override gaji pokok dipulihkan atas permintaan pengguna**, bukan override pajak manual. Form karyawan menyediakan `current_basic_override` dan `proposed_basic_override`: rupiah integer nonnegatif, termasuk **nol**, dipakai lebih dahulu daripada matriks dan dibulatkan menurut aturan uang global. Kosongkan untuk kembali ke matriks. Tombol **Normalisasi semua override gaji** menampilkan pratinjau lalu mengosongkan seluruh override yang memiliki sel matriks valid, termasuk override yang nilainya sudah sama; setelah itu gaji langsung mengikuti matriks. Override tanpa sel matriks tidak diubah. Sumber override ditandai pada gaji; validasi memperingatkan setiap penggunaan dan perbedaan terhadap gaji matriks jika sel tersedia. Override bisa mengisi gaji ketika sel tidak ada, tetapi tidak menghapus kewajiban jenis/golongan valid, induk skenario/jenis unik, atau kesalahan duplikasi. Tarif/override PPh lama tetap arsip dan diabaikan; override komponen tetap berlaku.

Filter karyawan berdasarkan jenis saat ini/usulan (termasuk belum terpetakan), lalu gunakan **Tetapkan jenis matriks untuk hasil filter**. Pilih skenario dan jenis, tinjau jumlah karyawan, lalu konfirmasi. Golongan, override gaji, arsip pajak, dan penugasan komponen dipertahankan; periksa kecocokan golongan sesudahnya. **Samakan golongan usulan** juga perlu konfirmasi dan tidak mengubah jenis atau override. Aplikasi tidak menebak jenis dari nama, jabatan, nominal gaji, atau kode golongan.

## Matriks otomatis

Panel langsung di halaman matriks menerima tiga input untuk masing-masing KG 1–5: gaji awal (`base_salary`) positif dalam **rupiah penuh, bukan ribuan** (desimal boleh), COLA (%) dan indeks KMK (`kmk_index`, %) yang tidak negatif. Pilih jenis valid dan identitas tujuan; bila belum ada pada skenario/jenis terpilih, identitas matriks dibuat otomatis saat diterapkan. Untuk jenis baru, buat metadata matriks terlebih dahulu.

Generator menghasilkan **300 sel**: KG 1–5 × PM/P/M/U × KMK 1–15, hanya pada induk matriks terpilih (skenario/jenis/identitas). Rumusnya `base_salary * (1 + cola) * (1 + kmk_index)^(kmkLevel - 1 + 2 * tierIndex)`, dengan tarif berupa fraksi (input layar dibagi 100), `kmkLevel` = 1–15 dan `tierIndex` PM/P/M/U = 0/1/2/3. Perhitungan majemuk memakai nilai antara eksak; setiap hasil akhir selalu dibulatkan **ke atas ke kelipatan Rp1.000** sehingga tiga digit terakhir `000`, misalnya `Rp3.205.440` menjadi `Rp3.206.000`. Nilai yang sudah tepat ribuan tidak dinaikkan lagi. Aturan ini berlaku untuk semua skenario dan jenis matriks serta tidak mengikuti pilihan pembulatan uang global. PM1 adalah gaji awal setelah COLA; P1 = PM3, M1 = P3, U1 = M3.

Klik **Pratinjau 300 gaji · KG 1–5**, tinjau sebelum/sesudah, lalu konfirmasi. Belum ada perubahan sebelum diterapkan. Hanya koordinat yang cocok pada identitas terpilih yang diganti, termasuk edit manual pada induk tersebut. Entri di luar rentang dan catatan entri yang cocok tetap dipertahankan. Identitas/jenis/skenario lain tidak berubah. Override gaji karyawan tidak berubah dan tetap mendahului matriks.

Parameter disimpan pada matriks sebagai teks JSON opsional `generator_settings`. Versi aplikasi saat ini menerima CSV workspace lama tanpa kolom tersebut; versi aplikasi lama mungkin menolak ekspor baru yang menyertakannya. Ekspor **workspace** menyimpan parameter dan gaji; ekspor **matriks** hanya menyimpan gaji beserta metadata entri, bukan parameter. Edit manual tidak menghitung ulang parameter secara otomatis; regenerasi menimpa sel yang cocok. Gunakan parameter yang disetujui organisasi, bukan asumsi gaji dari workbook nyata.

## Impor dan ekspor

Gunakan [referensi CSV](CSV_FORMAT.md) untuk kolom dan format. Impor menampilkan pratinjau sebelum perubahan diterapkan. Impor karyawan mendukung tambah saja, tambah/perbarui berdasarkan ID, dan penggantian. Kolom yang tidak disertakan pada pembaruan tidak menghapus nilai lama. Kolom `current_basic_override` dan `proposed_basic_override` adalah input gaji aktif: nilai tidak kosong, termasuk nol, dipakai dan diperingatkan, bukan diabaikan. Pembaruan yang tidak menyertakan kolom jenis atau override mempertahankan nilainya. Override PPh hanya arsip dan diabaikan; override komponen tetap berlaku. Tinjau peringatan perubahan nama dan ID lama yang tidak ada dalam file baru.

Impor matriks memperbarui entri menurut skenario, jenis, dan golongan; entri yang tidak ada dalam file dan jenis lain dipertahankan. Satu identitas per pasangan skenario/jenis didukung. Pada workspace CSV, `matrix_type` hanya di baris induk `matrix`; baris entri wajib kosong pada kolom itu dan memperoleh jenis dari `matrix_id`. CSV matriks mandiri menyertakan jenis pada setiap baris, dan CSV hasil menyertakan jenis saat ini/usulan yang sudah diresolusikan.

CSV workspace lama tanpa header jenis dimigrasikan: `matrix_type=regular`, `current_matrix_type=regular`, `proposed_matrix_type` kosong, dan `proposed_matrix_type_defaults_current=true`. Ini kompatibilitas, bukan bukti klasifikasi. Header `matrix_type` yang ada tetapi nilainya kosong ditolak; jenis karyawan kosong boleh disimpan sebagai draft tetapi menghalangi payroll aktif. Impor karyawan baru/pengganti tanpa header jenis saat ini memakai `regular`; pembaruan ID lama mempertahankan kolom yang tidak disertakan. CSV workspace menyimpan seluruh entitas; CSV karyawan dan hasil **bukan** backup lengkap. Workspace yang masih belum siap dihitung boleh disimpan dan dilanjutkan; perbaiki masalah sebelum menjalankan simulasi.

Ekspor memakai UTF-8 BOM dan CRLF untuk Excel. ID dengan nol awal sebaiknya diimpor ke Excel sebagai kolom teks. Spreadsheet dapat menafsirkan teks yang diawali `=` sebagai rumus; jangan mengaktifkan konten atau rumus dari CSV yang tidak dipercaya.

## Angka dan perhitungan

- Input persen pada layar menggunakan angka persen: `9` berarti 9%; di CSV gunakan fraksi `0.09`.
- Hasil uang selain pajak umumnya disimpan sebagai rupiah integer dengan pembulatan terkonfigurasi (1, 100, atau 1000); gaji awal generator boleh desimal. Khusus hasil generator dan penyesuaian matriks, pembulatan selalu ke atas ke kelipatan Rp1.000. Nilai tepat di tengah pada perhitungan umum dibulatkan menjauh dari nol.
- Persentase bruto (`percentage_gross`) dihitung sebelum tunjangan BPJS dan pajak: basisnya gaji pokok ditambah pendapatan bukan-persentase-bruto. Semua komponen persentase-bruto serta kedua tunjangan dikecualikan dari basis ini agar tidak terjadi rumus melingkar.
- Semua basis kontribusi BPJS, termasuk bruto, dihitung sebelum tunjangan BPJS dan pajak. Partisipasi, batas minimum/maksimum sebelum tarif, pembulatan, serta flag aktif dan enable karyawan/pemberi kerja tidak berubah; kontribusi kedua pihak tetap terpisah.
- Pada **Aturan perhitungan → Atur skema pembayaran**, pilih kebijakan terpisah untuk PPh, BPJS Kesehatan, dan BPJS TK di masing-masing skenario. BPJS `employee` mengurangi THP; `company` memberi tunjangan sebesar porsi karyawan yang ditanggung (hanya program dengan kebijakan company). Tunjangan masuk bruto dan potongan BPJS karyawan tetap sebesar jumlah yang sama. Tunjangan BPJS tetap berlaku saat pajak nonaktif; jika kontribusi karyawan nol, tunjangannya juga nol. Rincian menampilkan pendapatan tunjangan BPJS dan potongan BPJS, serta UI total organisasi menampilkan metrik `bpjs_allowance` untuk kedua skenario.
- PPh per skenario: `gross` dipotong dari THP tanpa tunjangan; `net` legacy tidak didukung saat pajak aktif (gunakan `gross_up`); `gross_up` memberi tunjangan pajak di bruto dan potongan yang sama. Pengaturan skenario mengalahkan metode lama per karyawan. Saat pajak nonaktif, pajak dan tunjangannya nol.
- Workspace baru: saat ini BPJS TK `employee`, PPh/Kesehatan `unconfirmed`; usulan gross-up PPh dan company untuk kedua BPJS. Pilihan belum dikonfirmasi menghalangi kalkulasi terkait yang aktif. Workspace lama tanpa kolom kebijakan tetap gross-up/company demi kompatibilitas, bukan sebagai bukti kebijakan organisasi. Demo juga memakai gross-up/company.
- Untuk payroll yang didukung, THP = bruto − BPJS karyawan − PPh − potongan lain; `net` tidak menghasilkan payroll saat pajak aktif. Jika semua porsi karyawan ditanggung dengan tunjangan, THP sama dengan bruto sebelum tunjangan dikurangi potongan lain. Tunjangan BPJS dan potongannya saling mengimbangi, bukan dua penambah uang tunai THP. Dibanding model lama tanpa tunjangan BPJS, dengan input lain sama, THP naik sebesar porsi BPJS karyawan yang sebelumnya mengurangi THP.
- Biaya pemberi kerja untuk payroll yang didukung = bruto (termasuk tunjangan sesuai kebijakan) + BPJS pemberi kerja + kontribusi pemberi kerja lainnya (`cost = gross + employer_bpjs + employer_contributions`). BPJS pemberi kerja tetap biaya terpisah; jangan tambahkan lagi tunjangan atau BPJS karyawan karena sudah masuk bruto tepat sekali. `employer_tax_cost` nol untuk payroll yang didukung; `net` diblokir saat pajak aktif.
- Bruto kena pajak otomatis = gaji pokok + pendapatan bertanda taxable + tunjangan BPJS porsi karyawan yang didanai perusahaan + BPJS pemberi kerja teridentifikasi kesehatan/JKK/JKM. Porsi pemberi kerja JHT/JP tidak masuk basis ini. Bruto kena pajak tidak selalu sama dengan bruto payroll; komponen BPJS pemberi kerja tetap biaya terpisah, bukan pendapatan tunai.
- CSV hasil tetap memakai kolom bruto yang ada (`current_gross`, `proposed_gross`), kini termasuk tunjangan BPJS dan pajak. Tidak direncanakan kolom CSV baru untuk `bpjs_allowance`; metrik ini ditampilkan pada rincian dan total UI.
- Persentase organisasi dihitung dari total, bukan rata-rata persentase karyawan. Basis nol menjadi `N/A` kecuali kedua nilai nol.
- THP negatif ditolak kecuali diizinkan pada aturan global.

## Menyimpan dan privasi

Indikator **Belum disimpan** menandakan perubahan sejak impor/ekspor workspace. Setelah ekspor, pastikan file benar-benar ada di folder unduhan; browser tidak memberi aplikasi kepastian bahwa pengguna mempertahankan file. Peringatan tutup halaman bergantung pada perilaku browser.

Tidak ada autosave atau pemulihan otomatis. **Hapus semua data dari layar** mengosongkan memori aplikasi, bukan menghapus file unduhan. CSV tidak terenkripsi dan tidak dilindungi akun. Jangan memasukkan rekening, NIK, NPWP lengkap, atau informasi yang tidak diperlukan. Jangan commit payroll atau gaji dari workbook nyata ke Git.

## Batasan konversi privat Agustus 2026

Audit persis di `private/mws-agustus-2026-audit.json`. Konversi menyediakan **empat matriks**: regular saat ini **300 sel**, regular usulan **300 sel**, admin saat ini **satu sel payroll terkonfirmasi saja**, dan admin usulan **60 sel sumber KG 3 saja**. Belum ada sheet admin saat ini yang otoritatif; jangan menebak sel kosong atau mengisi seluruh 300 sel admin dengan generator umum. Sel sumber admin usulan dipertahankan meski berbeda dari rumus generator.

Konversi memakai pengecualian kebijakan yang dikonfirmasi atau bukti gaji pada golongan yang sama: kecocokan regular tepat/pembulatan ribuan dibanding sel admin saat ini yang dikonfirmasi secara tepat. Kasus ambigu/tidak cocok tetap kosong. Ini pencocokan bukti saat konversi, bukan inferensi runtime dari jabatan. Override saat ini mempertahankan payroll aktual bila perlu. Satu pengecualian berkebijakan regular mempertahankan override saat ini dan nominal usulan legacy sampai kebijakannya diverifikasi, bukan diubah menjadi admin hanya karena nominalnya.

**Satu klasifikasi privat masih belum terselesaikan. Generator konversi diblokir pada validasi payroll dan belum dapat mengekspor hasil final sampai klasifikasi dikonfirmasi dan seluruh kesalahan pemblokir diperbaiki.** Draft/audit dan subtotal yang sudah terpetakan bukan hasil final. PPh Agustus nonaktif karena kolom pajak karyawan tidak tersedia; BPJS aktual dimuat sebagai komponen manual, komponen/potongan nonpokok usulan tetap mengikuti Agustus, dan selisih cache THP disimpan untuk audit, bukan ditambal. Jangan salin nama individu, bukti privat, atau nominal nyata ke dokumentasi terlacak.

## Konfigurasi builder privat

Builder memerlukan `--policy-config private/august-policy.json` selain `--payroll`, `--kmk`, `--matrix`, `--output`, dan `--report`; contoh path generik ada di docstring builder. Config JSON berisi `admin_keys` (daftar nonkosong), `proposed_admin_key`, dan `regular_exception_key`. Semua identifier adalah SHA-256 nama ternormalisasi, 64 karakter heksadesimal lowercase, unik dan tidak bertentangan. Hash ini **bukan anonimisasi**: simpan hanya di direktori gitignored `private/`, jangan salin ke source/test/docs. Nilai wajib berasal dari konfirmasi privat; tidak ada default atau inferensi identitas. Field opsional `source_paths` berisi tepat `payroll`, `kmk`, `matrix` untuk pengujian lokal; CLI tetap memakai path sumber eksplisit. Baseline rekonsiliasi harus diberikan secara eksplisit melalui konfigurasi privat sesuai skema builder yang berlaku; jangan menurunkan ekspektasi dari output yang sedang diuji atau menyalin baseline/nominal privat ke kode, tes, atau docs terlacak. Konfirmasi baseline secara terpisah dari kebijakan klasifikasi; baseline yang cocok tidak menghapus kesalahan pemblokir payroll.

Sebelum membaca config/sumber atau menghitung, builder menghapus hasil final lama pada direktori output. Hasil baru dibuat di staging privat pada filesystem yang sama dan dipublikasikan dengan atomic replace hanya setelah rekonsiliasi, kalkulasi, dan validasi berhasil. Draft/audit tetap bukan hasil final; build gagal tidak boleh meninggalkan CSV final lama.

Siapkan **Python 3.10+**, **Node.js 20+** (disarankan LTS aktif 22/24), dan virtualenv sesuai [README](../README.md#pengembangan--pengujian). Dependensi Python builder/tes tercatat di [`requirements-dev.txt`](../requirements-dev.txt), bukan dependensi aplikasi browser:

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
node --test tests/*.test.js
# Alternatif: jalankan suite Python saja
python3 -B -m unittest discover -s tests -p 'test_august_workspace.py' -v
```

Perintah dari root repositori, untuk macOS/Linux atau WSL. Pastikan `python3` dan `node` tersedia di PATH; subprocess memakai nama tersebut. Aktivasi virtualenv membuat runner Node memakai Python dengan openpyxl terinstal. Pip mungkin mengunduh paket; sumber XLSX tetap lokal. `openpyxl` membaca nilai cache dengan `data_only=True`, tidak menghitung ulang rumus; simpan cache workbook yang telah dihitung sebelum konversi. Baseline versi ini bukan matriks kompatibilitas semua versi yang sudah diuji.

Jalankan suite lengkap dengan `node --test tests/*.test.js`. `tests/august-workspace.test.js` memanggil suite Python sekali; suite Python juga dapat dijalankan langsung dengan `python3 -B -m unittest discover -s tests -p 'test_august_workspace.py' -v`. Tes sintetis memakai policy eksplisit buatan, tanpa identifier privat. Jika sumber tersedia di config lokal, tes menjalankan **builder saat ini sekali** ke direktori temporer di `private/`. Artefak lokal yang tersedia selalu diperiksa tanpa membutuhkan sumber. Python memanggil helper `--check-artifacts` pada tes Node untuk memeriksa impor, rekonsiliasi, dan pemblokiran ekspor; helper tidak menjalankan builder atau suite Python lagi. Output yang dapat berisi identitas disembunyikan; hanya nama/status tes diteruskan ke runner Node. Python/openpyxl dan Node wajib untuk suite lengkap; dependensi yang hilang menyebabkan kegagalan, bukan skip. Tes privat dilewati jika config/sumber atau artefak terkait tidak tersedia, tetapi tes sintetis tetap berjalan.

## Checklist pemeriksaan browser

Buka `index.html` langsung di Chrome untuk pemeriksaan lokal. Setelah push ke `master`, workflow GitHub Pages menerbitkan hanya `index.html`, `css/`, dan `js/`; `private/` serta workspace CSV tidak dipublikasikan. Deployment tidak menambahkan autosave. Cocokkan nomor versi dengan [catatan rilis](RELEASES.md).

- Buka langsung melalui `file://`, lalu matikan jaringan dan coba semua bagian.
- Pada `file://` dan GitHub Pages, pastikan sidebar menampilkan `v0.1.1` dan DevTools tidak melaporkan pelanggaran CSP.
- Buat/impor data, jalankan simulasi, ekspor workspace, reset, lalu impor ulang.
- Pastikan pratinjau impor yang dibatalkan tidak mengubah workspace.
- Coba impor 500 karyawan dan pembaruan berdasarkan ID.
- Salin seluruh folder ke lokasi lain lalu buka `index.html` di sana.
- Periksa tampilan pada lebar 768px; tabel lebar dapat digulir.
- Muat demo fiktif, periksa perhitungan dan buka/tutup dialog.
- Impor dan ekspor CSV, lalu pastikan file unduhan dapat diimpor kembali.
- Buka pratinjau cetak A4 landscape; periksa ringkasan sebelum mencetak.

Keputusan bisnis yang masih perlu ditetapkan: matriks otoritatif tiap periode, konfirmasi penempatan jenis Admin yang belum selesai, konfigurasi tunjangan, tarif/batas BPJS, dan pemetaan spreadsheet organisasi. Versi ini meminta klasifikasi dan parameter organisasi yang terverifikasi, bukan mengarang keputusan tersebut.
