# Caroll Payroll Simulator

Simulator perbandingan payroll berbahasa Indonesia, sepenuhnya lokal tanpa server, instalasi, database, atau koneksi internet.

## Mulai

Buka `index.html` di Google Chrome desktop, atau gunakan situs GitHub Pages setelah deployment selesai. Pilih **Coba data contoh**, **Buat workspace baru**, atau **Buka workspace CSV**. Selalu salin seluruh folder saat memindahkan aplikasi.

- [Panduan pengguna](docs/USER_GUIDE.md)
- [Format CSV](docs/CSV_FORMAT.md)
- [Spesifikasi](SPECIFICATION.md)
- [Catatan rilis](docs/RELEASES.md)
- [Workspace contoh fiktif](samples/sample-workspace.csv)
- [Template impor karyawan](samples/employee-import-template.csv)

## Jenis matriks dan gaji pokok

Matriks memiliki jenis wajib: `regular` dan `admin` sebagai jenis awal, serta jenis kustom yang dinormalisasi lowercase dengan pola `^[a-z][a-z0-9_-]*$`. Satu induk unik per **skenario + jenis**; entri memperoleh jenis dari induk. Pilih skenario/jenis/identitas untuk mengedit, membuat 300 sel otomatis, menyesuaikan, menyalin ke jenis sama di skenario lain, atau mengekspor tanpa menyentuh jenis lain.

Karyawan aktif memerlukan `current_matrix_type`; `proposed_matrix_type` opsional mengikuti jenis saat ini hanya jika `proposed_matrix_type_defaults_current` aktif (default true), terpisah dari fallback golongan. Form memakai pilihan berantai jenis → KG → profesional → KMK; penetapan jenis massal pada hasil filter perlu konfirmasi dan mempertahankan golongan/override. Runtime tidak menebak klasifikasi dari nama, jabatan, atau nominal.

**Override gaji pokok eksplisit dipulihkan atas permintaan pengguna**: `current_basic_override` / `proposed_basic_override` nonblank, termasuk nol, mendahului matriks dan memunculkan peringatan; kosong kembali ke matriks. Tombol normalisasi massal mengosongkan override yang memiliki sel matriks valid setelah pratinjau/konfirmasi. Override tidak melewati kewajiban jenis/induk valid. Ini bukan pemulihan override pajak manual; PPh tetap otomatis. CSV lama tanpa header jenis dimigrasikan ke regular/regular/kosong/true untuk induk/jenis saat ini/jenis usulan/aturan fallback; `matrix_type` yang eksplisit kosong ditolak. Lihat [format CSV](docs/CSV_FORMAT.md) untuk migrasi dan cakupan kolom.

Kepesertaan BPJS dapat tetap manual per karyawan atau memakai aturan global. BPJS Kesehatan dapat aktif setelah minimum bulan kerja terhadap tanggal acuan masing-masing skenario; BPJS TK dapat dibatasi hanya untuk `employment_type=permanent`. Mode otomatis tidak menebak dari teks status lama maupun klasifikasi pajak.

## Deployment GitHub Pages dan rilis

`index.html` adalah artefak aplikasi yang dideploy. Workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) berjalan pada setiap push ke `master` dan menerbitkan hanya `index.html`, `css/`, dan `js/` ke GitHub Pages; `private/`, CSV workspace, tes, dan alat pengembangan tidak ikut terpublikasi.

Versi aplikasi di sidebar harus sama dengan tag Git dan catatan pada [`docs/RELEASES.md`](docs/RELEASES.md). Untuk setiap rilis, perbarui versi pada `index.html`, tambahkan catatan detail di `docs/releases/`, commit, buat tag anotasi `vX.Y.Z`, push tag, lalu buat GitHub Release dari tag tersebut. Workspace CSV tetap V1 sampai kontrak impor/ekspor berubah.

Sebelum rilis, buka `index.html` melalui `file://` di Chrome desktop dan periksa data demo, impor/ekspor CSV, perhitungan, dialog, serta pratinjau cetak.

## Batasan penting

File workspace CSV adalah satu-satunya penyimpanan. Tidak ada autosave. Ekspor sebelum menutup halaman dan pastikan unduhan tersimpan. Siapa pun yang memiliki file dapat membaca data. Simpan data nyata di luar repositori; pola CSV diabaikan Git kecuali direktori `samples`.

PPh 21 otomatis hanya mencakup orang pribadi domestik pada rezim biasa tanpa DTP tahun 2024–2026: pegawai tetap nonfinal selain Desember, pegawai tidak tetap dibayar bulanan aktual, atau satu imbalan jasa biasa bukan pegawai pada bruto penuh tanpa pengecualian/sharing. Tidak mendukung tahunan/final, harian/mingguan, luar negeri, atau net legacy (gunakan gross_up). CSV lama memerlukan klasifikasi eksplisit, bulan pajak, konfirmasi rezim biasa, dan identifikasi program BPJS; tidak ditebak dari status kontrak/kode. Tarif/override PPh manual lama hanya arsip dan diabaikan. Pembulatan pajak ke bawah rupiah penuh adalah asumsi simulasi, bukan klaim kepatuhan pajak lengkap; lihat [aturan dan sumber pajak](docs/TAX_RULES.md). Tarif BPJS contoh sengaja bersifat demonstrasi, bukan tarif hukum. Konfirmasi tarif, batas, dan aturan dengan penanggung jawab payroll sebelum penggunaan nyata. Penempatan golongan selalu eksplisit, tidak ditebak dari jabatan atau nama. Aplikasi tidak membundel matriks otoritatif 2026/2027; alat konversi lokal `tools/build_august_workspace.py` bergantung pada sumber privat dan konfirmasi kebijakan, bukan inferensi runtime.

Konversi wajib menerima `--policy-config private/august-policy.json` (gitignored); identifier kebijakan tidak dibundel dalam kode dan tidak boleh ditebak. Lihat [konfigurasi dan pengujian builder](docs/USER_GUIDE.md#konfigurasi-builder-privat).

**Konversi privat Agustus 2026 belum siap menghasilkan payroll final.** Audit `private/mws-agustus-2026-audit.json` mencatat empat matriks: regular saat ini/usulan masing-masing **300 sel**, admin saat ini **satu sel payroll terkonfirmasi saja** (tanpa sheet otoritatif), admin usulan **60 sel KG 3**. Sel admin yang tidak terbukti tidak diekstrapolasi. Konversi hanya mencocokkan bukti golongan/gaji dan pengecualian terkonfirmasi; pengecualian regular mempertahankan override eksplisit sampai kebijakan diverifikasi. **Satu klasifikasi privat masih belum terselesaikan**, sehingga generator konversi diblokir oleh validasi dan tidak dapat mengekspor hasil final sampai dikonfirmasi serta kesalahan pemblokir diselesaikan. Draft/audit bukan hasil final. Jangan masukkan nama individu atau nominal nyata ke dokumentasi terlacak; lihat [batasan lengkap](docs/USER_GUIDE.md#batasan-konversi-privat-agustus-2026).

## Pengembangan & pengujian

Runtime memakai JavaScript klasik, CSS lokal, dan API browser bawaan. Tidak ada dependensi runtime atau build.

Untuk pengembang/builder lokal, gunakan **Node.js 20+** (disarankan LTS yang masih didukung, misalnya 22/24) dan **Python 3.10+** dengan `venv`/`pip`. Ini baseline pengembangan, bukan klaim semua versi telah diuji. Tes JS memakai `node:test`, `structuredClone`, dan `Array.at`; builder Python memakai `pathlib`, anotasi tipe modern, serta `openpyxl` untuk membaca XLSX/cache rumus. Tidak ada paket npm yang perlu diinstal. `openpyxl>=3.1.5,<3.2` dicatat di [`requirements-dev.txt`](requirements-dev.txt); pustaka ini tidak menghitung ulang rumus Excel.

Jalankan dari root repositori (macOS/Linux):

```sh
python3 -m venv .venv
. .venv/bin/activate
python3 -m pip install -r requirements-dev.txt
node --test tests/*.test.js
```

Aktivasi memastikan subprocess `python3` dari suite Node memakai dependensi virtualenv. Di Windows gunakan WSL untuk perintah ini; runner saat ini memanggil literal `python3` dan `node`. Instalasi pip memerlukan akses indeks paket/internet kecuali memakai cache atau mirror lokal; aplikasi browser tetap offline dan tanpa instalasi.

Suite lengkap menyertakan tes Python builder; tanpa Python/openpyxl tes itu gagal, bukan otomatis dilewati. Hanya pemeriksaan privat yang bergantung pada config/sumber/artefak dapat dilewati. Untuk menjalankan Python langsung dan memahami baseline rekonsiliasi privat, lihat [panduan builder](docs/USER_GUIDE.md#konfigurasi-builder-privat).

Lihat `docs/USER_GUIDE.md` untuk checklist penerimaan browser. Hasil pengujian tidak menggantikan peninjauan aturan payroll oleh ahli.
