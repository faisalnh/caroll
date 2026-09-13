# Caroll Payroll Simulator

Simulator perbandingan payroll berbahasa Indonesia, sepenuhnya lokal tanpa server, instalasi, database, atau koneksi internet.

## Mulai

Buka `index.html` di Google Chrome desktop. Pilih **Coba data contoh**, **Buat workspace baru**, atau **Buka workspace CSV**. Selalu salin seluruh folder saat memindahkan aplikasi.

- [Panduan pengguna](docs/USER_GUIDE.md)
- [Format CSV](docs/CSV_FORMAT.md)
- [Spesifikasi](SPECIFICATION.md)
- [Workspace contoh fiktif](samples/sample-workspace.csv)
- [Template impor karyawan](samples/employee-import-template.csv)

## Batasan penting

File workspace CSV adalah satu-satunya penyimpanan. Tidak ada autosave. Ekspor sebelum menutup halaman dan pastikan unduhan tersimpan. Siapa pun yang memiliki file dapat membaca data. Simpan data nyata di luar repositori; pola CSV diabaikan Git kecuali direktori `samples`.

Estimasi PPh 21 bukan perhitungan pajak statutory lengkap. Tarif BPJS contoh sengaja bersifat demonstrasi, bukan tarif hukum. Konfirmasi tarif, batas, dan aturan dengan penanggung jawab payroll sebelum penggunaan nyata. Penempatan golongan selalu eksplisit, tidak ditebak dari jabatan atau nama. Aplikasi tidak menyertakan matriks otoritatif 2026/2027 atau konversi spreadsheet tertentu.

## Pengembangan & pengujian

Runtime memakai JavaScript klasik, CSS lokal, dan API browser bawaan. Tidak ada dependensi runtime atau build.

Dengan Node.js versi modern (hanya untuk pengembang):

```sh
node --test tests/*.test.js
```

Lihat `docs/USER_GUIDE.md` untuk checklist penerimaan browser. Hasil pengujian tidak menggantikan peninjauan aturan payroll oleh ahli.
