# Monthly PPh21 simulation rules

Research checked 2026-09-13. This is an ordinary-period domestic individual PPh21 simulator, not a filing engine or annual tax calculation. The engine is integrated into payroll, classification forms, CSV persistence and blocking validation. Legacy rates/overrides are archival only. Tax basis includes taxable cash earnings, funded employee BPJS allowances and employer Kesehatan/JKK/JKM contributions; employer JHT/JP are excluded. Component taxable classification remains a verified payroll input. Unclassified/custom employer contributions block automatic tax.

## Official sources and verification

The JDIH pages are frontend-rendered. Their actual Fulltext links were obtained from browser anchors, and the full PDFs were downloaded into memory and parsed with `pdftotext -layout` (no research files written to the repository). Table values were checked against both numeric and written-out rupiah/rate descriptions where the PDF OCR confuses `O/0`, `I/1`, etc. No third-party rate table was used.

1. [PP 58 Tahun 2023](https://jdih.kemenkeu.go.id/dok/pp-58-tahun-2023), [official full PDF](https://jdih.kemenkeu.go.id/api/download/e47c3fc4-a912-4bf1-bcad-335fee3f71f8/2023pp058.pdf):
   - Article 2(4): PTKP-to-TER category mapping.
   - Lampiran A: 44 bands, physical PDF pages 11–15.
   - Lampiran B: 40 bands, physical PDF pages 16–20.
   - Lampiran C: 41 bands, physical PDF pages 20–24.
   - Inclusive upper limits (`sampai dengan`); next band's lower limit is exclusive (`di atas`). Last band is unbounded, 34%, in each category.
   - Explanation of Article 2(1): Tuan R, K/0, Rp10,000,000 monthly gross, 2%, Rp200,000 for January–November.
2. [PMK 168 Tahun 2023](https://jdih.kemenkeu.go.id/dok/pmk-168-tahun-2023), [official full PDF](https://jdih.kemenkeu.go.id/api/download/e60a82e0-b218-40f5-9d18-b924aa1e11ce/2023pmkeuangan168.pdf):
   - Articles 5, 8, 12, 15, 16 and Lampiran B, Bagian Pertama: applicable gross, calculation bases and period rules.
   - Article 8(4): annual taxable income (PKP) rounded down to full thousands of rupiah; this is NOT a rule to round monthly TER gross or a non-employee's 50% base to thousands.
   - Lampiran B, Bagian Pertama III.2 and IV (page 31): monthly temporary pay and non-employee withholding.
   - Examples: page 34 (Tuan A regular/bonus/THR months), page 44 I.3 (Tuan F, K/3) and I.4 (Tuan G, employer-paid tax), pages 50–51 IV.2 (Tuan N monthly temporary worker), page 52 V.1 (Tuan U lawyer), pages 52–53 V.2 (doctor), pages 53–54 V.3 (computer repair).
   - JDIH marks this regulation **Berlaku**. Related PMK 105/2025 concerns 2026 government-borne PPh21 incentives, not replacement ordinary TER tables. DTP and other special incentives are out of scope.
3. [UU 7 Tahun 2021](https://jdih.kemenkeu.go.id/dok/uu-7-tahun-2021), [official full PDF](https://jdih.kemenkeu.go.id/api/download/a9faab97-aca7-4f87-9fdc-faa8123d1454/7TAHUN2021UU.pdf), physical page 56: amended Income Tax Law Article 17(1)(a), all five progressive rates and thresholds verified.

The complete transcription of all 125 TER bands is private data in `js/tax.js`: `[inclusiveUpperRupiah, basisPoints]`, with `null` for infinity. `tests/tax.test.js` separately transcribes all band endpoints and percentage rates from the same official appendix and tests one rupiah below, exactly at, and one rupiah above every finite boundary for both monthly employee categories. Category B intentionally has no 1.25%, 1.75%, 2.25%, or 3.5% bands; category C intentionally jumps from 2% to 3%.

## API contract for main-app integration

Load `js/tax.js` as a classic script before its consumers. It creates/preserves `globalThis.Caroll` (the project's `C`) and installs only `C.tax`. No DOM, network, state, dependencies, or manual rates are used. CommonJS `require('../js/tax.js')` returns the same `C` namespace.

```js
C.tax.calculate({ gross, category, ptkp });
// => { amount, rate, method, category }
C.tax.grossUp({ gross, category, ptkp });
// => { amount, rate, method, category, allowance }
```

- `gross`: already-determined taxable gross BEFORE the tax allowance, in non-negative whole rupiah. Accepts a safe integer Number, digits-only decimal string, or BigInt, all limited to `Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991). Fractions, whitespace, formatted currency, exponents, negative values and unsafe inputs are rejected, not silently rounded/coerced.
- Input `category`: exactly `permanent`, `temporary_monthly`, or `non_employee`.
- `ptkp`: exact supported code below; required for both monthly TER categories. Ignored for `non_employee`, where it can be omitted.
- Output `amount` and `allowance`: safe integer Numbers for compatibility with payroll and JSON. All money products, sums, comparisons and divisions are evaluated with BigInt; Number conversion is only at the safe output boundary.
- Output `category`: **TER category** `A`, `B`, `C`, or `null` for non-employees; not a copy of the input employment category.
- Output `method`: `ter_monthly` or `article17_50`. Gross-up retains this underlying formula identifier; the caller already knows it requested gross-up.
- Output `rate`: decimal TER rate (e.g. `0.0025` = 0.25%, `0.02` = 2%); **null for progressive Article 17**, since there is no single flat rate. Do not interpret null as zero or multiply gross by a marginal rate.
- Invalid inputs throw TypeError/RangeError; overflow and convergence failures throw RangeError. Caller must catch and block the simulation rather than falling back to a manual/default rate.

### TER monthly

| PTKP | TER category |
| --- | --- |
| TK/0, TK/1, K/0 | A |
| TK/2, TK/3, K/1, K/2 | B |
| K/3 | C |

**Verified 2026-09-14: `temporary_monthly` does not always use category A.** The official PDFs linked above were fetched and parsed again for this review. PP 58/2023 Article 2(3)–(4) (physical page 4) categorizes monthly TER by PTKP (marital status and dependants at the start of the tax year). PMK 168/2023 Articles 12(2)(c), 13(2) and 16(2)(c) (pages 13–16), plus Lampiran B, Bagian Pertama III.2 (page 31), apply that monthly TER to monthly-paid Pegawai Tidak Tetap, with no category-A-only exception. In Lampiran B, Bagian Kedua IV.2 (pages 50–51), Tuan N is unmarried with no dependants; the example expressly says “Berdasarkan status Penghasilan Tidak Kena Pajak (TK/0)” before selecting category A. That is a PTKP-specific example, not a rule for all temporary employees. Both monthly employment categories therefore require supported PTKP and use the mapping above; calculation and validation behavior are unchanged.

Apply the selected band rate to **all taxable gross**, not just the excess over its lower bound. Do not subtract PTKP, job expenses, pension contributions, or BPJS employee deductions from TER gross. Legal gross composition must be resolved by the caller (including applicable taxable benefits and employer-paid contributions); this helper cannot determine it from component totals.

`permanent` is only for a month **other than Masa Pajak Terakhir**. December or the employee's final employment period requires annual/part-year Article 17 reconciliation under PMK Article 15; it cannot be represented by this API. The caller must block that use or clearly constrain the simulator to ordinary months. `temporary_monthly` means actual monthly payment under Article 12(2)(c)/16(2)(c), including December (see Tuan N example), not a monthly conversion of daily or weekly pay. A fixed-term employment contract alone does not prove that the person is a Pegawai Tidak Tetap.

**Non-monthly daily, weekly, unit/piecework and completion-based payments are unsupported.** The helper rejects all other category identifiers; the main app must also validate payment frequency and never remap these to `temporary_monthly` merely by summing a month. Output-based work actually paid monthly can qualify, as in Tuan N; actual non-monthly payments require their own daily/average-daily rules.

### Non-employee single payment

Apply progressive Article 17 rates to exactly 50% of the gross for one payment/withholding event, without PTKP, annualization or year-to-date accumulation:

| Taxable-base slice (rupiah) | Marginal rate |
| --- | --- |
| 0–60,000,000 | 5% |
| >60,000,000–250,000,000 | 15% |
| >250,000,000–500,000,000 | 25% |
| >500,000,000–5,000,000,000 | 30% |
| >5,000,000,000 | 35% |

PMK Lampiran B, Bagian Pertama IV describes gross in one Masa Pajak or when income becomes due. This stateless API models the requested **single payment** only; it is not permission to split payments to lower withholding. Caller must establish the correct withholding unit and must not sum unrelated payments or reset progressive bands within one event arbitrarily.

Article 12(4)–(6) gross exclusions depend on service type, contracts and evidence. The caller supplies the legally determined gross; this module does not subtract reimbursed materials/labor automatically. A doctor's gross is the patient-paid fee before hospital sharing (example V.2), not the doctor's net receipt. Other Article 17 recipient types (event participants, former employees, etc.) are not `non_employee` and are unsupported here.

### Rounding: explicit simulation assumption

**Floor the final exact non-negative tax to whole rupiah once.** For Article 17, retain the half-rupiah base for odd gross and sum all progressive slices before flooring. No intermediate rounding and no thousand-rupiah truncation of these bases.

The reviewed provisions do not establish a universal final fractional-rupiah withholding rounding rule for these two formulas. This policy is therefore a documented simulator assumption, not a claim of statutory rounding verification. PMK page 44 displays `21% × Rp65,605,059 = Rp13,777,062`, whereas exact multiplication is Rp13,777,062.39: flooring is consistent with that example, but the example alone does not distinguish flooring from nearest-rupiah rounding generally. Confirm the operational tax-reporting system's rule before filing use.

### Exact gross-up

Starting with allowance zero, repeatedly calculate `next = tax(gross + allowance)`. Return only when `next === allowance`, not when the difference is small. Re-select TER bands and recompute all Article 17 slices each iteration. Rates are never manually supplied or held at the initial gross rate.

This monotone iteration crosses discontinuous TER jumps safely and selects the **least integer fixed point** when rounding or tier jumps admit multiple solutions. Every within-band slope is below one (maximum TER 34%, non-employee gross marginal rate 17.5%). A defensive 4,096-iteration bound rejects nonconvergence; gross plus allowance must remain a safe integer. No approximate result is returned. The fixed-point identity is exact under the documented integer-tax assumption, not a claim that a continuous unrounded equation has an integer solution.

Examples covered by tests:

- Rp10,000,000 A gross: initial 2% becomes 2.25% after allowance; allowance Rp230,179, final gross Rp10,230,179.
- PMK Tuan G: Rp51,827,997 before allowance, Rp13,777,062 allowance, Rp65,605,059 taxable gross at 21%.
- Non-employee Rp119,000,000 payment crosses the first Article 17 boundary after gross-up; allowance Rp3,162,162.

## Employer-borne tax / `net` policy

PMK Lampiran B, Bagian Kedua **I.4, page 44** explicitly says PPh21 borne by the employer is a replacement in the form of a benefit (`kenikmatan`) for the employee in that period and is subject to PPh21. Its full-gross-up example includes the borne tax in taxable gross.

Consequently, a naive `net` implementation that computes tax on unchanged salary and records only a separate employer cost, excluding that benefit from taxable gross, is **not supported by this PMK example**. This module has no separate net formula. Keep main-app automatic net blocked unless its benefit inclusion, timing, and full/partial employer funding semantics are explicitly implemented and validated. Full employer funding can use the full gross-up result where appropriate; do not then double-count the same allowance again as a separate employer tax cost. Partial funding and employer deductibility are not determined by this module. Government-borne tax is a different regime (Article 7(h)); special DTP incentives are not implemented.

## Validation

BPJS participation is determined only by explicit `tax_program`: `kesehatan` uses the health participation flag/policy; `jkk`, `jkm`, `jht`, and `jp` use employment participation. Rule codes/names have no effect. Every active BPJS rule must identify a supported program **even when PPh is disabled**, regardless of participation flags or enabled shares. Blank, unknown, and `other` resolve to `null` and block payroll rather than silently omitting or misclassifying contributions. Migrate legacy active rules by identifying their actual supported program, or deactivate them as drafts. Inactive unidentified drafts remain allowed. CSV persistence is unchanged: blank/`other` draft values are preserved, while unknown nonblank enums remain invalid CSV.

Run `node --test tests/tax.test.js` for table boundaries, independent official examples, Article 17 slice boundaries, exact gross-up across all TER limits, large safe values, odd gross rounding, invalid/unsupported inputs, overflow rejection and classic-script loading. Run `node --test tests/*.test.js` for the existing suite plus this module. Integration regression tests also cover payroll totals, automatic gross-up, CSV migration, unsupported profiles and removal of manual PPh inputs.
