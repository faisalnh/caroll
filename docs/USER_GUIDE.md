# Panduan Caroll

## Membuka aplikasi

Buka `index.html` langsung dari Finder/File Explorer di Chrome desktop. Semua file CSS/JS harus tetap bersama folder aplikasi. Tidak perlu internet, server, atau instalasi. Pilih workspace kosong, buka CSV workspace, atau gunakan data contoh fiktif.

## Alur simulasi

1. **Workspace:** isi nama dan label periode saat ini/usulan.
2. **Matriks gaji:** buat identitas matriks setiap skenario lalu tambah entri. Golongan dibentuk dari kelompok, kategori profesional, dan KMK, misalnya `3-PM8`. Tampilan daftar dan grid memakai data yang sama.
3. Salin matriks saat ini ke usulan bila diperlukan. Penyesuaian persentase dapat dibatasi menurut kelompok/kategori. Tinjau jumlah lama/baru dan pembulatan pada pratinjau sebelum konfirmasi.
4. **Karyawan:** tambah data atau impor CSV. ID adalah kunci pencocokan, bukan nama. Golongan usulan kosong mengikuti golongan saat ini jika aturan global aktif. Override gaji bersifat eksplisit dan ditandai; impor tidak menebak gaji dari spreadsheet lain.
5. **Komponen payroll:** buat definisi pendapatan, potongan, atau kontribusi pemberi kerja, lalu tugaskan kepada satu/beberapa karyawan. Definisi tanpa penugasan tidak dihitung. Nilai penugasan kosong memakai default; angka nol benar-benar nol. Nilai saat ini dan usulan terpisah.
6. **Aturan perhitungan:** periksa aturan global, program BPJS, partisipasi karyawan, dan Estimasi PPh 21. Tidak ada tarif hukum yang diasumsikan benar. Untuk BPJS Kesehatan gunakan kode yang mengandung `kesehatan`; program lain mengikuti partisipasi ketenagakerjaan.
7. **Simulasi payroll:** hitung, tinjau kesalahan/peringatan, filter hasil, dan buka rincian karyawan. Kesalahan menghalangi hasil. Total organisasi mencakup seluruh hasil, bukan hanya filter tampilan.
8. Ekspor workspace untuk melanjutkan di kemudian hari. Ekspor hasil CSV untuk analisis dan gunakan cetak ringkasan untuk ringkasan organisasi.

## Impor dan ekspor

Gunakan [referensi CSV](CSV_FORMAT.md) untuk kolom dan format. Impor menampilkan pratinjau sebelum perubahan diterapkan. Impor karyawan mendukung tambah saja, tambah/perbarui berdasarkan ID, dan penggantian. Kolom yang tidak disertakan pada pembaruan tidak menghapus nilai lama. Tinjau peringatan perubahan nama dan ID lama yang tidak ada dalam file baru.

Impor matriks memperbarui entri menurut skenario dan golongan. Satu identitas matriks per skenario didukung. CSV workspace menyimpan seluruh entitas; CSV karyawan dan hasil **bukan** backup lengkap. Workspace yang masih belum siap dihitung boleh disimpan dan dilanjutkan; perbaiki masalah sebelum menjalankan simulasi.

Ekspor memakai UTF-8 BOM dan CRLF untuk Excel. ID dengan nol awal sebaiknya diimpor ke Excel sebagai kolom teks. Spreadsheet dapat menafsirkan teks yang diawali `=` sebagai rumus; jangan mengaktifkan konten atau rumus dari CSV yang tidak dipercaya.

## Angka dan perhitungan

- Input persen pada layar menggunakan angka persen: `9` berarti 9%; di CSV gunakan fraksi `0.09`.
- Uang disimpan sebagai rupiah integer dengan pembulatan terkonfigurasi (1, 100, atau 1000). Nilai tepat di tengah dibulatkan menjauh dari nol.
- Persentase bruto memakai basis pra-pajak: gaji pokok ditambah pendapatan bukan-persentase-bruto. Semua komponen persentase-bruto dikecualikan dari basis ini agar tidak terjadi rumus melingkar.
- BPJS menerapkan batas minimum/maksimum sebelum tarif; kontribusi karyawan dan pemberi kerja terpisah.
- Pajak gross mengurangi THP; net dibayar pemberi kerja; gross-up sederhana menambah tunjangan pajak dan potongan yang sama, tanpa menghitung pajak dua kali. Bukan gross-up iteratif statutory.
- Bruto ditampilkan sebelum tunjangan pajak terpisah. Biaya pemberi kerja mencakup tunjangan pajak bila berlaku.
- Persentase organisasi dihitung dari total, bukan rata-rata persentase karyawan. Basis nol menjadi `N/A` kecuali kedua nilai nol.
- THP negatif ditolak kecuali diizinkan pada aturan global.

## Menyimpan dan privasi

Indikator **Belum disimpan** menandakan perubahan sejak impor/ekspor workspace. Setelah ekspor, pastikan file benar-benar ada di folder unduhan; browser tidak memberi aplikasi kepastian bahwa pengguna mempertahankan file. Peringatan tutup halaman bergantung pada perilaku browser.

Tidak ada autosave atau pemulihan otomatis. **Hapus semua data dari layar** mengosongkan memori aplikasi, bukan menghapus file unduhan. CSV tidak terenkripsi dan tidak dilindungi akun. Jangan memasukkan rekening, NIK, NPWP lengkap, atau informasi yang tidak diperlukan. Jangan commit payroll nyata ke Git.

## Checklist pemeriksaan browser

- Buka langsung melalui `file://`, lalu matikan jaringan dan coba semua bagian.
- Buat/impor data, jalankan simulasi, ekspor workspace, reset, lalu impor ulang.
- Pastikan pratinjau impor yang dibatalkan tidak mengubah workspace.
- Coba impor 500 karyawan dan pembaruan berdasarkan ID.
- Salin seluruh folder ke lokasi lain lalu buka `index.html` di sana.
- Periksa tampilan pada lebar 768px; tabel lebar dapat digulir.
- Buka pratinjau cetak A4 landscape; periksa ringkasan sebelum mencetak.

Keputusan bisnis yang masih perlu ditetapkan: matriks otoritatif tiap periode, kategori Admin eksplisit, konfigurasi tunjangan, tarif/batas BPJS, kebutuhan TER, kebijakan override gaji, dan pemetaan spreadsheet organisasi. Versi ini menyediakan konfigurasi manual, bukan mengarang keputusan tersebut.
