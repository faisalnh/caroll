# Catatan Rilis Caroll

Dokumen ini mencocokkan versi aplikasi GitHub Pages dengan catatan perubahan yang menyertainya. Nomor versi aplikasi berbeda dari `schema_version` workspace CSV; perubahan versi aplikasi tidak otomatis mengubah format CSV.

## Rilis tersedia

| Versi | Artefak yang dideploy | Tanggal | Ringkasan |
|---|---|---|---|
| [v0.1.1](releases/v0.1.1.md) | `index.html` + `css/` + `js/` | 14 September 2026 | Hasil generator dan penyesuaian semua matriks dibulatkan ke atas ke Rp1.000. |

## Aturan publikasi

- Sidebar aplikasi, tag Git, dan GitHub Release harus memakai versi yang sama.
- Setiap versi yang dibagikan harus memiliki dokumen detail di `docs/releases/`.
- GitHub Pages dideploy dari `master` oleh workflow dan hanya memuat `index.html`, `css/`, serta `js/`.
- Release notes harus menyebut perubahan perilaku, kompatibilitas data, validasi otomatis, dan pemeriksaan browser yang masih diperlukan.
- `schema_version` workspace CSV dinaikkan hanya bila struktur atau kontrak impor/ekspor berubah; rilis `v0.1.1` tetap memakai workspace CSV V1.
