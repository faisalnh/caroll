# Panduan Caroll

## Membuka aplikasi

Buka `index.html` langsung dari Finder/File Explorer di Chrome desktop. Semua file CSS/JS harus tetap bersama folder aplikasi. Tidak perlu internet, server, atau instalasi. Pilih workspace kosong, buka CSV workspace, atau gunakan data contoh fiktif.

## Alur simulasi

1. **Workspace:** isi nama dan label periode saat ini/usulan.
2. **Matriks gaji:** pilih skenario lalu gunakan panel **Matriks otomatis** (lihat di bawah), atau buat identitas matriks dan tambah entri manual. Golongan dibentuk dari kelompok, kategori profesional, dan KMK, misalnya `3-PM8`. Tampilan daftar dan grid memakai data yang sama.
3. Salin matriks saat ini ke usulan bila diperlukan. Penyesuaian persentase dapat dibatasi menurut kelompok/kategori. Tinjau jumlah lama/baru dan pembulatan pada pratinjau sebelum konfirmasi.
4. **Karyawan:** tambah data atau impor CSV. ID adalah kunci pencocokan, bukan nama. Golongan usulan kosong mengikuti golongan saat ini jika aturan global aktif. Override gaji bersifat eksplisit dan ditandai; impor tidak menebak gaji dari spreadsheet lain.
5. **Komponen payroll:** buat definisi pendapatan, potongan, atau kontribusi pemberi kerja, lalu tugaskan kepada satu/beberapa karyawan. Definisi tanpa penugasan tidak dihitung. Nilai penugasan kosong memakai default; angka nol benar-benar nol. Nilai saat ini dan usulan terpisah.
6. **Aturan perhitungan:** periksa aturan global, program BPJS, partisipasi karyawan, dan Estimasi PPh 21. Tidak ada tarif hukum yang diasumsikan benar. Untuk BPJS Kesehatan gunakan kode yang mengandung `kesehatan`; program lain mengikuti partisipasi ketenagakerjaan.
7. **Simulasi payroll:** hitung, tinjau kesalahan/peringatan, filter hasil, dan buka rincian karyawan. Kesalahan menghalangi hasil. Total organisasi mencakup seluruh hasil, bukan hanya filter tampilan.
8. Ekspor workspace untuk melanjutkan di kemudian hari. Ekspor hasil CSV untuk analisis dan gunakan cetak ringkasan untuk ringkasan organisasi.

## Matriks otomatis

Panel langsung di halaman matriks menerima tiga input untuk masing-masing KG 1–5: gaji awal (`base_salary`) positif dalam **rupiah penuh, bukan ribuan** (desimal boleh), COLA (%) dan indeks KMK (`kmk_index`, %) yang tidak negatif. Pilih matriks tujuan; bila belum ada pada skenario terpilih, identitas matriks dibuat otomatis saat diterapkan.

Generator menghasilkan **300 sel**: KG 1–5 × PM/P/M/U × KMK 1–15, hanya pada skenario terpilih. Rumusnya `base_salary * (1 + cola) * (1 + kmk_index)^(kmkLevel - 1 + 2 * tierIndex)`, dengan tarif berupa fraksi (input layar dibagi 100), `kmkLevel` = 1–15 dan `tierIndex` PM/P/M/U = 0/1/2/3. Perhitungan majemuk memakai nilai antara eksak; hanya hasil akhir dibulatkan menurut aturan global. PM1 adalah gaji awal setelah COLA; P1 = PM3, M1 = P3, U1 = M3.

Klik **Pratinjau 300 gaji · KG 1–5**, tinjau sebelum/sesudah, lalu konfirmasi. Belum ada perubahan sebelum diterapkan. Semua koordinat yang cocok pada skenario tersebut diganti, termasuk edit manual dan entri dari identitas matriks lain. Entri di luar rentang, catatan entri yang cocok, dan override karyawan tetap dipertahankan; skenario lain tidak berubah.

Parameter disimpan pada matriks sebagai teks JSON opsional `generator_settings`. Versi aplikasi saat ini menerima CSV workspace lama tanpa kolom tersebut; versi aplikasi lama mungkin menolak ekspor baru yang menyertakannya. Ekspor **workspace** menyimpan parameter dan gaji; ekspor **matriks** hanya menyimpan gaji beserta metadata entri, bukan parameter. Edit manual tidak menghitung ulang parameter secara otomatis; regenerasi menimpa sel yang cocok. Gunakan parameter yang disetujui organisasi, bukan asumsi gaji dari workbook nyata.

## Impor dan ekspor

Gunakan [referensi CSV](CSV_FORMAT.md) untuk kolom dan format. Impor menampilkan pratinjau sebelum perubahan diterapkan. Impor karyawan mendukung tambah saja, tambah/perbarui berdasarkan ID, dan penggantian. Kolom yang tidak disertakan pada pembaruan tidak menghapus nilai lama. Tinjau peringatan perubahan nama dan ID lama yang tidak ada dalam file baru.

Impor matriks memperbarui entri menurut skenario dan golongan. Satu identitas matriks per skenario didukung. CSV workspace menyimpan seluruh entitas; CSV karyawan dan hasil **bukan** backup lengkap. Workspace yang masih belum siap dihitung boleh disimpan dan dilanjutkan; perbaiki masalah sebelum menjalankan simulasi.

Ekspor memakai UTF-8 BOM dan CRLF untuk Excel. ID dengan nol awal sebaiknya diimpor ke Excel sebagai kolom teks. Spreadsheet dapat menafsirkan teks yang diawali `=` sebagai rumus; jangan mengaktifkan konten atau rumus dari CSV yang tidak dipercaya.

## Angka dan perhitungan

- Input persen pada layar menggunakan angka persen: `9` berarti 9%; di CSV gunakan fraksi `0.09`.
- Hasil uang disimpan sebagai rupiah integer dengan pembulatan terkonfigurasi (1, 100, atau 1000); gaji awal generator boleh desimal. Nilai tepat di tengah dibulatkan menjauh dari nol.
- Persentase bruto memakai basis pra-pajak: gaji pokok ditambah pendapatan bukan-persentase-bruto. Semua komponen persentase-bruto dikecualikan dari basis ini agar tidak terjadi rumus melingkar.
- BPJS menerapkan batas minimum/maksimum sebelum tarif; kontribusi karyawan dan pemberi kerja terpisah.
- Pajak gross mengurangi THP; net dibayar pemberi kerja; gross-up sederhana menambah tunjangan pajak dan potongan yang sama, tanpa menghitung pajak dua kali. Bukan gross-up iteratif statutory.
- Bruto ditampilkan sebelum tunjangan pajak terpisah. Biaya pemberi kerja mencakup tunjangan pajak bila berlaku.
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

Keputusan bisnis yang masih perlu ditetapkan: matriks otoritatif tiap periode, kategori Admin eksplisit, konfigurasi tunjangan, tarif/batas BPJS, kebutuhan TER, kebijakan override gaji, dan pemetaan spreadsheet organisasi. Versi ini menyediakan konfigurasi manual, bukan mengarang keputusan tersebut.
