# Caroll CSV format (schema 1)

`js/csv.js` is a classic script that installs `globalThis.Caroll.csv`. Load core state, matrix/money, and validation scripts before calling its workspace APIs. No API writes storage, changes the input workspace, or applies an import to the UI.

## Automatic PPh 21 amendment

Automatic tax replaces manual rates, fixed tax overrides, selectable tax bases/rounding, and legacy net-tax calculation. The UI is labeled **PPh 21 otomatis**, not a claim of full tax compliance. See [verified tax sources and rounding assumptions](TAX_RULES.md).

- Scope: domestic individuals, ordinary regime without DTP or special incentives, tax months in 2024–2026. Permanent employees require a nonfinal month other than December; temporary employees require actual monthly payment, not aggregated daily/weekly pay. Non-employees are limited to one plain service-fee payment at full gross, without special exclusions or fee sharing. Annual/final reconciliation, daily/weekly payments, foreign residency, and special/DTP regimes are unsupported and blocked by validation/payroll.
- Employee fields: `tax_category` = `permanent|temporary_monthly|non_employee|unsupported`; `tax_residency` = `domestic|foreign`; `tax_period_type` = `ordinary|final`; `tax_payment_scope` = `monthly|single|other`. Never infer them from `employment_status`. PTKP dropdown: `TK/0`–`TK/3`, `K/0`–`K/3`; invalid legacy text remains visible for correction and warns/blocks tax.
- Global rules: optional legacy-blank `current_tax_month` and `proposed_tax_month` (`YYYY-MM`), required when tax is active; `tax_regime` = `ordinary|special`, with blank blocking active tax until the user explicitly confirms ordinary/no special incentives.
- BPJS rules: optional legacy-blank `tax_program` = `kesehatan|jkk|jkm|jht|jp|other` remains unchanged for CSV import/export. Payroll requires `kesehatan|jkk|jkm|jht|jp` on every active rule even with tax disabled, no participating employees, or disabled contribution shares. Blank, unknown, and `other` never infer participation from code and block active payroll. For migration, identify each active rule's actual supported program or deactivate it as a draft. Inactive unidentified rules are allowed; structurally valid blank/`other` drafts can still be saved/reloaded, including active drafts that are not payroll-ready. Unknown nonblank CSV enums remain rejected.
- New CSV columns are optional on import; omitted legacy values load blank, not inferred. Invalid nonblank new enums/month syntax are rejected. Partial employee updates preserve omitted fields. Draft workspace persistence is separate from payroll readiness.
- `pph_rate`, `pph_fixed_override`, and employee `pph_method` remain archival CSV data, preserved during employee editing but never calculation inputs. No manual tax override badges or filter. Basic salary overrides are restored separately, with salary-source badges and warnings; manual tax remains archival. Component assignment overrides remain supported. Global `tax_basis` and `tax_rounding` remain legacy CSV fields, preserved via global-rule merge but have no effect on automatic tax and no UI selectors.
- Keep `tax_enabled`: disabled means zero PPh/tax allowance. Scenario `gross` deducts automatic tax; `gross_up` iterates the automatic formula to an exact equal allowance/deduction. Legacy `net` remains selectable only as explicitly unsupported, blocked for active tax with instructions to use `gross_up`.
- TER monthly and progressive Article 17 on 50% of a non-employee payment use `C.tax`. Final exact nonnegative tax is floored once to whole rupiah; this is an explicit simulation assumption, not universally verified statutory rounding. Gross-up reselects bands each iteration. No full tax-compliance or filing-readiness claim is made.
- Load `js/tax.js` before validation/payroll. Eligibility, taxable-gross composition, year gates and calculation belong to those modules, not UI or CSV.

## Scenario payment policies

Six optional columns apply to `global_rule`: `current_pph_policy`, `proposed_pph_policy` (`unconfirmed`, `gross`, `net`, `gross_up`); `current_bpjs_kesehatan_policy`, `proposed_bpjs_kesehatan_policy`, `current_bpjs_ketenagakerjaan_policy`, `proposed_bpjs_ketenagakerjaan_policy` (`unconfirmed`, `employee`, `company`). Nonempty invalid values are rejected. Missing/blank fields in older files normalize to `gross_up` for PPh and `company` for BPJS, preserving legacy payment-policy defaults, not the obsolete manual-tax calculation. New exports include these columns; older application versions may reject them.

Scenario policy determines automatic PPh; legacy employee `pph_method` is archival only. `gross` deducts automatic tax from THP; `gross_up` adds equal tax allowance/deduction. `net` is retained for compatibility but blocks active tax; use `gross_up` instead. Only company-funded BPJS employee shares enter `bpjs_allowance`. For supported payroll, cost = gross + employer BPJS + other employer contributions; `employer_tax_cost` is zero. Unconfirmed policies block relevant active calculations but drafts can be saved. See USER_GUIDE for new-workspace defaults and settings.

## Encoding and syntax

Exports are UTF-8 text beginning with U+FEFF (BOM), comma-delimited, with CRLF record endings and a final CRLF. Callers creating downloads should use `text/csv;charset=utf-8`. Embedded commas, double quotes, CR and LF are quoted; embedded quotes are doubled. Imports accept CRLF or LF record separators and an optional leading BOM. Bare CR outside quoted cells, unterminated quotes, bare-field quotes, characters after closing quotes, inconsistent field counts, and duplicate/blank/padded headers are errors. Quoted multiline text and Unicode are preserved. A header-only file is valid; an empty file is not. Empty lines are not silently skipped (a single-column empty record is valid).

`parse(text)` returns string-valued row objects, without type conversion. `stringify(rows, headers?)` returns BOM CSV; omitted headers are the stable first-seen union of object keys. Supply headers for empty arrays. Neither generic function interprets schema or modifies text to neutralize spreadsheet formulas. When opening untrusted data in spreadsheet software, import text columns explicitly as text: quoting alone does not prevent formula evaluation. IDs with leading zeroes are preserved in CSV but Excel may reinterpret them.

Typed APIs reject unknown columns. Numbers must use plain decimal notation (no exponent, grouping separators, currency symbols, `%`, NaN, or infinity). Surrounding numeric whitespace is accepted. Money is normalized with core `C.roundMoney(originalDecimal, applicableRounding)` (ties away from zero), directly from the original decimal string, without an intermediate rounding to rupiah or conversion to floating point. Matrix salaries and employee basic overrides use `globalRules.rounding`; fixed/manual component defaults and assignments use the component definition's `rounding`; archival employee fixed tax overrides are still normalized using legacy `globalRules.tax_rounding` for CSV compatibility only, never to calculate automatic tax. BPJS minimum/maximum basis bounds use integer rupiah (`1`): these are caps/floors, not contribution amounts, and core applies the BPJS rounding rule only when calculating contributions. Already-calculated result money exports at integer rupiah. For example, `4000049.5` with global rounding `100` becomes `4000000`, not `4000100`. Both typed imports and exports follow these rules. Workspace import collects every row before normalizing money, so global rules and component definitions may appear before or after their dependent records. Unsafe numeric magnitudes are rejected. Rates are decimal fractions (`0.09` means 9%); percentage component values remain fractional. Booleans export as `true`/`false`; imports accept either word case-insensitively with surrounding whitespace, not `1`, `0`, `yes`, or `no`. Optional blank values normalize to `''`, **never zero**. Dates must be real ISO `YYYY-MM-DD` dates. Period labels are free text.

Golongan is canonicalized through core parsing as `{salary_group}-{professional_category}{kmk_level}`, e.g. `3-PM8`; `01-u01` normalizes to `1-U1`. Salary group is stored as a canonical string, KMK as an integer. Supplied dimensions must match the code.

## Workspace CSV

`exportWorkspace(workspace)` emits the complete fixed superset, not whole-record JSON payloads; optional `matrix.generator_settings` is an opaque JSON text cell. `importWorkspace(text)` returns a new structurally valid workspace or throws; success does **not** mean payroll is ready to calculate. Every superset header except optional `generator_settings`, the four matrix-type migration columns described below, the six scenario payment-policy columns, and the eight automatic-tax columns described above is required on import (column order may vary). Schema remains `1`; the current application accepts older workspace CSVs without this column unchanged, treating omitted settings as blank. Older application versions may reject new workspace exports containing the `generator_settings` column. Row order is immaterial. Unknown schema versions, record types, duplicate IDs/keys, irrelevant nonblank cells, missing singleton records, invalid types/enums/numbers/rules, and dangling matrix/employee/component references are rejected. Structurally valid unfinished drafts can be both saved and reloaded: missing salary rows for employee Golongan, unresolved proposed salaries, and missing manual component or enabled-tax inputs do not block workspace loading. After import, the UI should show `C.validate(workspace)` issues as informational readiness feedback, **not gate workspace loading on them**. Core calculation and result export remain blocked until payroll errors are resolved. Employee/matrix import previews retain their separate blocking contract below.

The header is constructed deterministically: the three leading columns below, followed by the first occurrence of each field in the record groups below, in the displayed order. Shared field names occupy **one** column. This defines the complete stable header, including when collections are empty. Fields not applicable to a row's `record_type` must be blank.

| Leading column | Applicability | Requirement |
| --- | --- | --- |
| `schema_version` | Every row | Required literal `1` |
| `record_type` | Every row | Required discriminator from the groups below |
| `record_id` | Every row | Required, unique within record type; import treats it as an opaque row identifier |

Exported record IDs are `workspace`, `global_rule`, matrix ID, employee ID, or component/BPJS code as appropriate. Matrix-entry IDs encode the triple `[scenario,matrix_type,golongan]` (type derived from the parent); assignment IDs encode `[employee_id,component_code]` as a JSON array **identifier only**, not a record payload. CSV quoting handles these identifiers. Natural-key duplicates are rejected even if record IDs differ.

### Record columns and applicability

Within the lists below, `!` means a nonblank value is required in workspace import. All boolean fields are required. Optional text defaults to blank. Payroll-only conditional requirements apply through core validation at calculation time, not as a workspace-load gate.

#### `workspace` → `metadata` (exactly one)

Fields in order: `name`, `current_period`, `proposed_period`.

- `name`: workspace display name; may be blank for a new workspace.
- `current_period`, `proposed_period`: free-text period labels.

#### `matrix` → `matrices`

Fields: `matrix_id!`, `name!`, `scenario!`, `matrix_type!`, `effective_date`, `generator_settings`.

- `matrix_id`: unique matrix identifier referenced by entries.
- `name`: matrix display name.
- `scenario`: `current` or `proposed`; at most one parent per `(scenario,matrix_type)`.
- `matrix_type`: required custom type, trimmed and normalized to lowercase with regex `^[a-z][a-z0-9_-]*$`. Initial business types are `regular` and `admin`, not a closed enum. In workspace CSV this column applies **only to parent `matrix` rows**; it must be blank on `matrix_entry` rows, whose type derives through `matrix_id`.
- `effective_date`: optional ISO date.
- `generator_settings`: optional opaque JSON **text**, preserved by workspace CSV without parsing or validating its internal structure. Normal CSV quoting applies (double embedded quotes). The frontend writes an array ordered KG 1–5, each with `base_salary` (positive full rupiah, decimals allowed), `cola` and `kmk_index` (nonnegative fractional rates; the UI accepts percentages). Blank means no saved parameters. This is matrix metadata, not a `matrix_entry` column.

The inline generator creates 300 salary entries for the selected scenario: KG 1–5 × PM/P/M/U × KMK 1–15. Each uses exact compounded arithmetic, `base_salary * (1 + cola) * (1 + kmk_index)^(kmkLevel - 1 + 2 * tierIndex)`, with `tierIndex` = 0/1/2/3 for PM/P/M/U and `kmkLevel` = 1–15; only the final salary is rounded using `globalRules.rounding`. PM1 is base after COLA; P1 = PM3, M1 = P3, U1 = M3. Applying the confirmed before/after preview creates a typed parent if needed and replaces matching Golongan only under the selected parent identity, preserving matching notes, out-of-range entries and employee overrides. Other parents, types, and scenarios are untouched. Overrides retain salary precedence. Grid/list editing, adjustment, and UI export use the selected parent; confirmed copying to the other scenario replaces only the same-type destination and its settings, not other types or employee data. Manual salary edits do not recalculate saved parameters; regeneration overwrites matching cells. See [the user guide](USER_GUIDE.md#matriks-otomatis).

#### `matrix_entry` → `matrixEntries`

Fields: `matrix_id!`, `scenario!`, `salary_group!`, `professional_category!`, `kmk_level!`, `golongan!`, `basic_salary!`, `note`.

- `matrix_id`: reference to an existing matrix with the same scenario.
- `scenario`: `current` or `proposed`.
- `salary_group`: positive integer identifier, stored as a string.
- `professional_category`: canonical uppercase category, e.g. `PM`.
- `kmk_level`: positive integer.
- `golongan`: canonical code matching all three dimensions; unique within `(scenario,parent matrix_type)`.
- `basic_salary`: nonnegative money, zero allowed.
- `note`: optional matrix-entry text.

#### `employee` → `employees`

Fields in stable order:

| Column | Meaning / requirement |
| --- | --- |
| `employee_id` | Required unique text ID, the sole automatic matching key |
| `name` | Required employee name |
| `current_golongan` | Required for active/included employees; valid current code |
| `current_matrix_type` | Required for active/included payroll; normalized custom type as above; blank allowed in an unfinished workspace draft |
| `proposed_matrix_type` | Optional type; blank follows current type only when `proposed_matrix_type_defaults_current=true`, independently of Golongan fallback |
| `unit` | Organizational unit, optional text |
| `department` | Department, optional text |
| `position` | Position, optional text |
| `employment_status` | Employment classification, optional text |
| `join_date` | Optional ISO date |
| `active` | Required boolean |
| `proposed_golongan` | Optional code; blank uses current if global rule enables it |
| `current_basic_override` | Optional nonnegative integer rupiah; nonblank (including zero) takes precedence over current matrix salary; blank uses matrix |
| `proposed_basic_override` | Optional nonnegative integer rupiah; nonblank (including zero) takes precedence over proposed matrix salary; blank uses matrix |
| `ptkp_status` | Verified TK/0–3 or K/0–3; legacy text preserved, invalid/blank warns or blocks active tax |
| `tax_category` | Optional enum; see amendment |
| `tax_residency` | Optional enum; see amendment |
| `tax_period_type` | Optional enum; see amendment |
| `tax_payment_scope` | Optional enum; see amendment |
| `bpjs_kesehatan` | Required participation boolean |
| `bpjs_ketenagakerjaan` | Required participation boolean |
| `pph_method` | Archival compatibility field: `gross`, `net`, or core spelling `gross_up`; input alias `gross-up` accepted. Preserved during employee editing and CSV round-trips, never a calculation input; scenario policy controls automatic PPh |
| `pph_rate` | Optional archival decimal fraction; blank allowed even with active tax. Preserved as CSV data but never selects a rate or affects calculation |
| `pph_fixed_override` | Optional archival money; preserved and normalized under legacy CSV money rules. Neither nonzero nor zero values override automatic PPh or tax allowance |
| `notes` | Optional employee text |

Both basic salary overrides are restored as editable, active inputs at the user's request, not merely retained archives. Each nonblank override is used with global money rounding and warns even if zero or matrix-equal; an additional warning reports a difference from a matching rounded matrix salary. Blank uses the unique `(scenario,resolved matrix_type,resolved golongan)` cell. Without an override, absent/ambiguous cells block. Overrides may supply salary for an absent cell but do not bypass required classification, valid Golongan, unique parent or duplicate-entry validation. Manual PPh remains archival/ignored; component overrides remain supported.

Blank proposed Golongan falls back to the current **code only** if `proposed_defaults_current` is true. Blank proposed type follows current **type only** if `proposed_matrix_type_defaults_current` is true. These switches are independent; lookup always uses the proposed scenario, never the current salary or another type. Runtime does not infer type from names, jobs, amounts, or codes.

### Legacy matrix-type migration (schema remains 1)

Only **absent headers** trigger workspace migration: `matrix_type` → `regular` on parents; `current_matrix_type` → `regular` on employees; `proposed_matrix_type` → blank; `proposed_matrix_type_defaults_current` → `true` on the global rule. A present blank parent `matrix_type` is rejected, not migrated; a present blank fallback boolean is invalid. Explicit blank employee types remain blank draft data, subject to payroll readiness checks. Invalid nonblank type syntax is rejected. Exports include all four columns; older app versions may reject them. This migration is compatibility behavior, not evidence of a person's classification.

#### `component_definition` → `componentDefinitions`

Fields: `code!`, `name!`, `category`, `direction!`, `calculation_type!`, `default_value`, `taxable!`, `bpjs_kesehatan!`, `bpjs_ketenagakerjaan!`, `applies_current!`, `applies_proposed!`, `active!`, `rounding!`, `notes`.

- `code`: unique component identifier; `name`: display name; `category`: optional classification text.
- `direction`: `earning`, `employee_deduction`, or `employer_contribution`.
- `calculation_type`: `fixed`, `percentage_basic`, `percentage_gross`, or `manual`. `percentage_gross` continues to use basic salary plus non-percentage-gross earnings, excluding all percentage-gross components and both BPJS and tax allowances. These components are calculated before either allowance to avoid cycles.
- `default_value`: required numeric value except manual definitions may leave it blank. Money for fixed/manual; decimal fraction for percentage formulas. Signed values are supported.
- `taxable`: whether included in taxable basis.
- `bpjs_kesehatan`, `bpjs_ketenagakerjaan`: whether included in the corresponding selected contribution basis (not employee participation on this record type).
- `applies_current`, `applies_proposed`: scenario applicability booleans.
- `active`: enable definition.
- `rounding`: integer `1`, `100`, or `1000` rupiah.
- `notes`: optional component text.

#### `employee_component` → `employeeComponents`

Fields: `employee_id!`, `component_code!`, `current_value`, `proposed_value`.

- `employee_id`: reference to an existing employee.
- `component_code`: reference to an existing component definition.
- `current_value`, `proposed_value`: optional overrides. Blank uses definition/default behavior; zero is explicit. Fixed/manual assignments are signed money; percentage assignments are decimal fractions. Definition lookup occurs after all workspace rows are read so record order does not matter.
- The pair `(employee_id,component_code)` must be unique.

#### `bpjs_rule` → `bpjsRules`

Fields: `code!`, `name!`, `tax_program`, `employee_rate!`, `employer_rate!`, `minimum_basis`, `maximum_basis`, `basis!`, `employee_enabled!`, `employer_enabled!`, `rounding!`, `active!`.

- `code`: unique program identifier; `name`: display name.
- `employee_rate`, `employer_rate`: nonnegative decimal fractions.
- `minimum_basis`, `maximum_basis`: optional nonnegative money; minimum cannot exceed maximum. Blank means no configured bound; zero is explicit.
- `basis`: `basic`, `selected`, or `gross`; all BPJS bases are calculated before both BPJS and tax allowances, including when `gross` is selected, to avoid cycles.
- `employee_enabled`, `employer_enabled`: enable each contribution side.
- `rounding`: integer `1`, `100`, or `1000` rupiah.
- `active`: enable program.

Employee participation, basis bounds, contribution rounding, and active/employee/employer enable flags are unchanged. Only programs whose scenario policy is `company` fund their calculated employee share through `bpjs_allowance`; sum those shares, add the allowance to gross, and retain the full employee BPJS deduction. Under `employee`, that program adds no allowance. This calculated allowance is independent of `tax_enabled` and is zero when the employee contribution is zero; it is not a new workspace input. Employer BPJS remains a separate employer cost.

#### `global_rule` → `globalRules` (exactly one)

Fields: `currency!`, `rounding!`, `percentage_precision!`, `include_inactive!`, `allow_negative_thp!`, `proposed_defaults_current!`, `proposed_matrix_type_defaults_current!`, `tax_enabled!`, `tax_basis!`, `tax_rounding!`, `current_tax_month`, `proposed_tax_month`, `tax_regime` (then scenario payment policies).

- `currency`: `IDR`.
- `rounding`: money calculation step, `1`, `100`, or `1000`.
- `percentage_precision`: display precision; current core requires `2`.
- `include_inactive`: include inactive employees in calculation.
- `allow_negative_thp`: permit negative take-home pay.
- `proposed_defaults_current`: blank proposed Golongan defaults to the current code only; absent a salary override, lookup uses the unique proposed scenario/type cell.
- `proposed_matrix_type_defaults_current`: independent required boolean, default true; blank proposed type follows current type only when enabled. Does not control Golongan fallback.
- `tax_enabled`: enable **PPh 21 otomatis** under each scenario's policy and eligibility requirements. Disabling tax sets PPh and tax allowance to zero but does not disable BPJS allowance.
- `tax_basis`: required legacy enum `taxable`, `gross`, or `basic`; retained for CSV compatibility, not a basis selector for automatic tax.
- `tax_rounding`: required legacy integer `1`, `100`, or `1000`; retained for archival CSV normalization, not automatic tax rounding.
- `current_tax_month`, `proposed_tax_month`: optional on legacy import; valid `YYYY-MM` and supported years/months are required for active tax.
- `tax_regime`: optional legacy-blank `ordinary` or `special`; active tax requires explicit `ordinary` confirmation.

Automatic taxable gross before tax allowance is basic salary + taxable earning components + company-funded employee BPJS allowance + employer BPJS contributions identified as `kesehatan`, `jkk`, or `jkm`. Employer `jht`/`jp` contributions do not enter this basis. This taxable gross is distinct from reported payroll gross. `C.tax` selects the applicable TER monthly or non-employee progressive formula. `gross_up` solves `allowance = tax(basis + allowance)` exactly, reselecting bands each iteration; `gross` uses `tax(basis)` without allowance. Only the final exact tax is floored to whole rupiah, as a simulation assumption. Manual PPh archives have no effect.

A complete runnable workspace example, including every record type, can be obtained in the app console with `Caroll.csv.exportWorkspace(Caroll.sampleWorkspace())`. An empty workspace uses the identical header. Do not use a shortened conceptual workspace header for import.

## Employee-only CSV

`exportEmployees(ws)` uses exactly the employee columns listed above, in that order. `previewEmployees(text, ws, mode)` returns `{workspace, added, updated, unchanged, rejected, issues}` with numeric counts and issues shaped `{severity, message}`. It always clones the input workspace.

- `add`: requires header columns `employee_id,name,current_golongan`; rejects IDs already in workspace.
- `update`: add-and-update by ID. Requires only the `employee_id` header for patch files. Existing records change **only provided columns**; omitted columns and their types remain untouched. Explicit blank optional fields clear existing values. New IDs still need a name and, if active, a resolvable current Golongan. Never matches by name. Warns on changed names and existing employees absent from the file.
- `replace`: requires the same headers as add, rebuilds employees using defaults, and requires explicit UI confirmation. Existing component assignments are retained; removing an employee referenced by an assignment is rejected rather than silently losing assignments.

New/replacement employee defaults: blank optional text, tax classification, `pph_rate`, and overrides, `active=true`, both BPJS participation flags `true`, `pph_method=gross_up`. An absent `current_matrix_type` header migrates new/replacement records to `regular`; a provided blank remains unclassified. Proposed type defaults blank. Updates to existing IDs preserve omitted type/override columns rather than applying migration defaults. New UI employees start with blank types and require explicit classification. Duplicate IDs within any file are rejected. IDs are trimmed but leading zeroes are retained.

```csv
employee_id,name,current_golongan,current_matrix_type,proposed_matrix_type,proposed_golongan,current_basic_override
0007,"Nama, Contoh",3-PM8,regular,,3-PM9,
```

Patch example (preserves every other employee field):

```csv
employee_id,proposed_golongan,proposed_basic_override
0007,3-PM9,
```

## Matrix-only CSV

`exportMatrix(ws, scenario, matrixType?, matrixId?)` exports salary entries filtered by scenario and optional normalized type/parent identity, not generator parameters. The UI supplies all three selectors to isolate the selected parent; the two-argument API exports all types in that scenario. Use workspace export to retain `generator_settings`; it is not a supported matrix-only column. Headers, in order:

`scenario,matrix_type,golongan,basic_salary,matrix_name,effective_date,salary_group,professional_category,kmk_level,note`

`previewMatrix(text, ws)` requires `scenario,golongan,basic_salary`. `matrix_type` derives from the parent on export and identifies the parent on import; absent header migrates to `regular`, while a provided blank or invalid value is rejected. Their meanings match `matrix_entry`; `matrix_name` maps to the parent matrix's `name`, and `effective_date` to its date. Dimensions, if omitted or blank, derive from Golongan. Omitted note and metadata retain existing values. Provided blank note/date clears it; blank matrix name is invalid. All provided metadata for a scenario/type must agree across rows. A new scenario/type creates `matrix-{scenario}-{type}` (with a collision-safe numeric suffix if needed), default name `Current matrix` / `Proposed matrix`, and a blank date unless provided.

This API **upserts** by `(scenario,matrix_type,golongan)` and retains entries absent from the file; it is not matrix replacement. Duplicate keys in one file, inconsistent dimensions, and conflicting scenario/type metadata are rejected. Parent metadata changes count a matching row as updated. Preview shape and blocking behavior match employee imports.

The following salaries are illustrative, not taken from a real workbook. Do not commit real workbook salaries or payroll data.

```csv
scenario,matrix_type,golongan,basic_salary,matrix_name,effective_date,note
current,regular,3-PM8,8455000,Current salaries,2026-01-01,"Example, review before use"
proposed,regular,3-PM8,8700000,Proposed salaries,2027-01-01,
```

## Preview application contract

Preview rows are evaluated without mutating `ws`. Valid rows may appear in the candidate even when another row fails. **The UI must not apply any preview with `rejected > 0` or any `severity === 'error'` issue.** For employee/matrix previews, whole-file/schema/reference/core-validation errors set `rejected` to at least one even when no particular CSV row can be blamed. Thus `rejected` is a blocking count, not always an exact count of rejected source rows; added/updated/unchanged count accepted source rows, not implicit removals or untouched rows. Warnings alone do not block. A valid replace preview still needs explicit confirmation. This module cannot enforce UI commit behavior because it does not own UI code.

## Payroll results (export only)

`exportResults(result)` consumes the core payroll result, one row per employee, and blocks global or employee-level error issues (also `valid === false`). Warnings may export; the UI must obtain confirmation per the specification. No totals row is appended. Missing/nonfinite money metrics or missing change amounts are rejected. Undefined/null change percentages export blank, never infinity. Percent changes are core **percentage points** (`5` means a 5% increase), unlike input rate fractions.

Complete stable result columns in order and their sources:

| Columns | Source / meaning |
| --- | --- |
| `employee_id,name,unit,department,current_golongan,proposed_golongan` | Employee identity/context fields |
| `current_matrix_type,proposed_matrix_type` | Resolved scenario types, including proposed fallback (not necessarily raw employee fields) |
| `current_basic_salary,proposed_basic_salary` | Scenario `basic_salary`, integer money from explicit override or typed matrix |
| `basic_change,basic_change_percent` | `changes.basic_salary.amount` / `.percent` |
| `current_gross,proposed_gross` | Scenario `gross`, money, including only policy-funded BPJS allowance and, for `gross_up`, tax allowance equal to PPh |
| `gross_change,gross_change_percent` | `changes.gross.amount` / `.percent` |
| `current_employee_bpjs,proposed_employee_bpjs` | Scenario `employee_bpjs`, money |
| `current_employer_bpjs,proposed_employer_bpjs` | Scenario `employer_bpjs`, money |
| `current_pph,proposed_pph` | Scenario `pph`, money |
| `current_deductions,proposed_deductions` | Scenario `deductions`, money |
| `current_take_home_pay,proposed_take_home_pay` | Scenario `take_home_pay`, money |
| `thp_change,thp_change_percent` | `changes.take_home_pay.amount` / `.percent` |
| `current_employer_cost,proposed_employer_cost` | Scenario `employer_cost`, money |
| `employer_cost_change` | `changes.employer_cost.amount`, money |
| `validation_status` | `warning` if employee has warning issues, otherwise `valid` |

The breakdown shows `bpjs_allowance` as an earning and retains the full employee BPJS deduction; organization totals also show `bpjs_allowance` for both scenarios. Tax allowance and PPh deduction are separate lines. THP is reported gross minus employee BPJS, PPh, and other employee deductions. Only company-funded BPJS shares offset their deductions; only `gross_up` offsets PPh with an equal allowance. THP equals gross before both allowances minus other deductions only when all employee BPJS shares and PPh are fully funded through allowances.

Employer cost is `cost = gross + employer_bpjs + employer_contributions` (other employer contributions): gross already includes both allowances exactly once. Employer BPJS stays separate; do not add employee BPJS or either allowance again. The core compatibility metric `employer_tax_cost` is zero for supported payroll: `gross` deducts employee tax, `gross_up` funds it inside gross, and active `net` is blocked. Existing gross CSV columns include the BPJS allowance; no new result CSV column is planned for `bpjs_allowance`, and neither `employer_tax_cost` nor `tax_allowance` adds a column.

## August private draft versus final export

The private conversion audit is `private/mws-agustus-2026-audit.json`: four parents contain current/proposed regular (300 cells each), current admin (one confirmed payroll cell only, no authoritative current-admin sheet), and proposed admin (60 source cells, KG 3 only). Missing admin cells must not be extrapolated. One private classification remains unresolved: the conversion generator is blocked by core validation and cannot export final results until confirmed and remaining blocking errors are resolved. Draft CSV/audit and resolved subtotals are not final payroll results. Evidence matching and explicit salary exceptions belong to conversion, not runtime classification; see [the specification](../SPECIFICATION.md#august-2026-private-conversion-limitations). Do not put identities, evidence or real amounts in tracked docs.

## API clarifications / deviations

All nine requested method names and return shapes are implemented. Intentional format clarifications: update mode accepts ID-only patches despite the spec's general three-column employee header; core PPh spelling is `gross_up` (hyphenated input accepted); LF import is accepted while exports use CRLF; matrix preview is upsert rather than replacement; workspace import rejects unsupported schemas and structural integrity errors but permits payroll-incomplete drafts; whole-preview blocking errors use `rejected >= 1`. No UI files are changed.

Validation: run `node --test tests/csv.test.js` from the project root. Tests use the actual core scripts and sample workspace, not substitute core implementations.
