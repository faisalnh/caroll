# Caroll CSV format (schema 1)

`js/csv.js` is a classic script that installs `globalThis.Caroll.csv`. Load core state, matrix/money, and validation scripts before calling its workspace APIs. No API writes storage, changes the input workspace, or applies an import to the UI.

## Scenario payment policies (supersedes fixed gross-up/company-paid descriptions below)

Six optional columns apply to `global_rule`: `current_pph_policy`, `proposed_pph_policy` (`unconfirmed`, `gross`, `net`, `gross_up`); `current_bpjs_kesehatan_policy`, `proposed_bpjs_kesehatan_policy`, `current_bpjs_ketenagakerjaan_policy`, `proposed_bpjs_ketenagakerjaan_policy` (`unconfirmed`, `employee`, `company`). Nonempty invalid values are rejected. Missing/blank fields in older files normalize to `gross_up` for PPh and `company` for BPJS, preserving previous calculations. New exports include these columns; older application versions may reject them.

Scenario policy overrides legacy employee `pph_method`. Gross deducts tax from THP, net records it as `employer_tax_cost` outside gross without employee tax deduction, gross-up adds equal tax allowance/deduction. Only company-funded BPJS employee shares enter `bpjs_allowance`. Cost = gross + employer BPJS + other employer contributions + net employer tax. Unconfirmed policies block relevant active calculations but drafts can be saved. See USER_GUIDE for new-workspace defaults and settings.

## Encoding and syntax

Exports are UTF-8 text beginning with U+FEFF (BOM), comma-delimited, with CRLF record endings and a final CRLF. Callers creating downloads should use `text/csv;charset=utf-8`. Embedded commas, double quotes, CR and LF are quoted; embedded quotes are doubled. Imports accept CRLF or LF record separators and an optional leading BOM. Bare CR outside quoted cells, unterminated quotes, bare-field quotes, characters after closing quotes, inconsistent field counts, and duplicate/blank/padded headers are errors. Quoted multiline text and Unicode are preserved. A header-only file is valid; an empty file is not. Empty lines are not silently skipped (a single-column empty record is valid).

`parse(text)` returns string-valued row objects, without type conversion. `stringify(rows, headers?)` returns BOM CSV; omitted headers are the stable first-seen union of object keys. Supply headers for empty arrays. Neither generic function interprets schema or modifies text to neutralize spreadsheet formulas. When opening untrusted data in spreadsheet software, import text columns explicitly as text: quoting alone does not prevent formula evaluation. IDs with leading zeroes are preserved in CSV but Excel may reinterpret them.

Typed APIs reject unknown columns. Numbers must use plain decimal notation (no exponent, grouping separators, currency symbols, `%`, NaN, or infinity). Surrounding numeric whitespace is accepted. Money is normalized with core `C.roundMoney(originalDecimal, applicableRounding)` (ties away from zero), directly from the original decimal string, without an intermediate rounding to rupiah or conversion to floating point. Matrix salaries and employee basic overrides use `globalRules.rounding`; fixed/manual component defaults and assignments use the component definition's `rounding`; employee fixed tax overrides use `globalRules.tax_rounding`. BPJS minimum/maximum basis bounds use integer rupiah (`1`): these are caps/floors, not contribution amounts, and core applies the BPJS rounding rule only when calculating contributions. Already-calculated result money exports at integer rupiah. For example, `4000049.5` with global rounding `100` becomes `4000000`, not `4000100`. Both typed imports and exports follow these rules. Workspace import collects every row before normalizing money, so global rules and component definitions may appear before or after their dependent records. Unsafe numeric magnitudes are rejected. Rates are decimal fractions (`0.09` means 9%); percentage component values remain fractional. Booleans export as `true`/`false`; imports accept either word case-insensitively with surrounding whitespace, not `1`, `0`, `yes`, or `no`. Optional blank values normalize to `''`, **never zero**. Dates must be real ISO `YYYY-MM-DD` dates. Period labels are free text.

Golongan is canonicalized through core parsing as `{salary_group}-{professional_category}{kmk_level}`, e.g. `3-PM8`; `01-u01` normalizes to `1-U1`. Salary group is stored as a canonical string, KMK as an integer. Supplied dimensions must match the code.

## Workspace CSV

`exportWorkspace(workspace)` emits the complete fixed superset, not whole-record JSON payloads; optional `matrix.generator_settings` is an opaque JSON text cell. `importWorkspace(text)` returns a new structurally valid workspace or throws; success does **not** mean payroll is ready to calculate. Every superset header except optional `generator_settings` is required on import (column order may vary). Schema remains `1`; the current application accepts older workspace CSVs without this column unchanged, treating omitted settings as blank. Older application versions may reject new workspace exports containing the `generator_settings` column. Row order is immaterial. Unknown schema versions, record types, duplicate IDs/keys, irrelevant nonblank cells, missing singleton records, invalid types/enums/numbers/rules, and dangling matrix/employee/component references are rejected. Structurally valid unfinished drafts can be both saved and reloaded: missing salary rows for employee Golongan, unresolved proposed salaries, and missing manual component or enabled-tax inputs do not block workspace loading. After import, the UI should show `C.validate(workspace)` issues as informational readiness feedback, **not gate workspace loading on them**. Core calculation and result export remain blocked until payroll errors are resolved. Employee/matrix import previews retain their separate blocking contract below.

The header is constructed deterministically: the three leading columns below, followed by the first occurrence of each field in the record groups below, in the displayed order. Shared field names occupy **one** column. This defines the complete stable header, including when collections are empty. Fields not applicable to a row's `record_type` must be blank.

| Leading column | Applicability | Requirement |
| --- | --- | --- |
| `schema_version` | Every row | Required literal `1` |
| `record_type` | Every row | Required discriminator from the groups below |
| `record_id` | Every row | Required, unique within record type; import treats it as an opaque row identifier |

Exported record IDs are `workspace`, `global_rule`, matrix ID, employee ID, or component/BPJS code as appropriate. Matrix-entry IDs encode the pair `[scenario,golongan]`; assignment IDs encode `[employee_id,component_code]` as a JSON array **identifier only**, not a record payload. CSV quoting handles these identifiers. Natural-key duplicates are rejected even if record IDs differ.

### Record columns and applicability

Within the lists below, `!` means a nonblank value is required in workspace import. All boolean fields are required. Optional text defaults to blank. Payroll-only conditional requirements apply through core validation at calculation time, not as a workspace-load gate.

#### `workspace` → `metadata` (exactly one)

Fields in order: `name`, `current_period`, `proposed_period`.

- `name`: workspace display name; may be blank for a new workspace.
- `current_period`, `proposed_period`: free-text period labels.

#### `matrix` → `matrices`

Fields: `matrix_id!`, `name!`, `scenario!`, `effective_date`, `generator_settings`.

- `matrix_id`: unique matrix identifier referenced by entries.
- `name`: matrix display name.
- `scenario`: `current` or `proposed`; at most one matrix per scenario.
- `effective_date`: optional ISO date.
- `generator_settings`: optional opaque JSON **text**, preserved by workspace CSV without parsing or validating its internal structure. Normal CSV quoting applies (double embedded quotes). The frontend writes an array ordered KG 1–5, each with `base_salary` (positive full rupiah, decimals allowed), `cola` and `kmk_index` (nonnegative fractional rates; the UI accepts percentages). Blank means no saved parameters. This is matrix metadata, not a `matrix_entry` column.

The inline generator creates 300 salary entries for the selected scenario: KG 1–5 × PM/P/M/U × KMK 1–15. Each uses exact compounded arithmetic, `base_salary * (1 + cola) * (1 + kmk_index)^(kmkLevel - 1 + 2 * tierIndex)`, with `tierIndex` = 0/1/2/3 for PM/P/M/U and `kmkLevel` = 1–15; only the final salary is rounded using `globalRules.rounding`. PM1 is base after COLA; P1 = PM3, M1 = P3, U1 = M3. Applying the confirmed before/after preview creates a matrix if needed and replaces matching `(scenario,golongan)` entries even under other matrix identities, preserving matching notes, out-of-range entries and employee overrides. Other scenarios are untouched. Manual salary edits do not recalculate saved parameters; regeneration overwrites matching cells. See [the user guide](USER_GUIDE.md#matriks-otomatis).

#### `matrix_entry` → `matrixEntries`

Fields: `matrix_id!`, `scenario!`, `salary_group!`, `professional_category!`, `kmk_level!`, `golongan!`, `basic_salary!`, `note`.

- `matrix_id`: reference to an existing matrix with the same scenario.
- `scenario`: `current` or `proposed`.
- `salary_group`: positive integer identifier, stored as a string.
- `professional_category`: canonical uppercase category, e.g. `PM`.
- `kmk_level`: positive integer.
- `golongan`: canonical code matching all three dimensions; unique within scenario.
- `basic_salary`: nonnegative money, zero allowed.
- `note`: optional matrix-entry text.

#### `employee` → `employees`

Fields in stable order:

| Column | Meaning / requirement |
| --- | --- |
| `employee_id` | Required unique text ID, the sole automatic matching key |
| `name` | Required employee name |
| `current_golongan` | Required for active/included employees; valid current code |
| `unit` | Organizational unit, optional text |
| `department` | Department, optional text |
| `position` | Position, optional text |
| `employment_status` | Employment classification, optional text |
| `join_date` | Optional ISO date |
| `active` | Required boolean |
| `proposed_golongan` | Optional code; blank uses current if global rule enables it |
| `current_basic_override` | Compatibility-only legacy field; preserved but never used in calculation; any nonblank value (including zero) warns that it is ignored |
| `proposed_basic_override` | Compatibility-only legacy field; preserved but never used in calculation; any nonblank value (including zero) warns that it is ignored |
| `ptkp_status` | Optional status text; blank may warn |
| `bpjs_kesehatan` | Required participation boolean |
| `bpjs_ketenagakerjaan` | Required participation boolean |
| `pph_method` | Compatibility field: `gross`, `net`, or core spelling `gross_up`; input alias `gross-up` accepted. Legacy `gross`/`net` values are preserved in CSV but ignored with a warning; all employees/scenarios use `gross_up` when tax is enabled. The employee form has no method selector and saves `gross_up` |
| `pph_rate` | Decimal fraction; required with `0 <= rate < 1` when tax is enabled and no fixed override exists; may be blank when tax is disabled or overridden |
| `pph_fixed_override` | Optional nonnegative monthly tax money; blank calculates, zero overrides. When tax is enabled, used directly as final PPh and equal tax allowance, without further gross-up |
| `notes` | Optional employee text |

Both basic salary override columns remain in workspace and employee CSV for compatibility; legacy data is preserved, but the employee UI no longer allows editing them. Each calculated scenario requires exactly one matching matrix entry: current Golongan in the current matrix, and proposed Golongan in the proposed matrix. If `proposed_defaults_current` is enabled, a blank proposed Golongan falls back to the current Golongan **code only**, still looking up the proposed matrix. Missing or ambiguous matches block calculation regardless of legacy override values. PPh and employee component overrides are unchanged.

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

Fields: `code!`, `name!`, `employee_rate!`, `employer_rate!`, `minimum_basis`, `maximum_basis`, `basis!`, `employee_enabled!`, `employer_enabled!`, `rounding!`, `active!`.

- `code`: unique program identifier; `name`: display name.
- `employee_rate`, `employer_rate`: nonnegative decimal fractions.
- `minimum_basis`, `maximum_basis`: optional nonnegative money; minimum cannot exceed maximum. Blank means no configured bound; zero is explicit.
- `basis`: `basic`, `selected`, or `gross`; all BPJS bases are calculated before both BPJS and tax allowances, including when `gross` is selected, to avoid cycles.
- `employee_enabled`, `employer_enabled`: enable each contribution side.
- `rounding`: integer `1`, `100`, or `1000` rupiah.
- `active`: enable program.

Employee participation, basis bounds, contribution rounding, and active/employee/employer enable flags are unchanged. The company funds the calculated employee share through `bpjs_allowance = employee_bpjs`, added to gross while the equal employee BPJS deduction remains. This calculated allowance is independent of `tax_enabled` and is zero when the employee contribution is zero; it is not a new workspace input. Employer BPJS remains a separate employer cost.

#### `global_rule` → `globalRules` (exactly one)

Fields: `currency!`, `rounding!`, `percentage_precision!`, `include_inactive!`, `allow_negative_thp!`, `proposed_defaults_current!`, `tax_enabled!`, `tax_basis!`, `tax_rounding!`.

- `currency`: `IDR`.
- `rounding`: money calculation step, `1`, `100`, or `1000`.
- `percentage_precision`: display precision; current core requires `2`.
- `include_inactive`: include inactive employees in calculation.
- `allow_negative_thp`: permit negative take-home pay.
- `proposed_defaults_current`: blank proposed Golongan defaults to the current Golongan code only; salary still requires a unique match in the proposed matrix.
- `tax_enabled`: enable Estimasi PPh 21 for all employees/scenarios using enforced `gross_up`. Toggle behavior is unchanged: disabling tax sets PPh and tax allowance to zero, including with a fixed override, but does not disable the BPJS allowance.
- `tax_basis`: `taxable`, `gross`, or `basic`; selects the basis before the tax allowance. Both `taxable` and `gross` include the BPJS allowance; `basic` remains basic salary only.
- `tax_rounding`: tax calculation step, `1`, `100`, or `1000`.

When tax is enabled without a fixed override, the fixed effective-rate estimate is `pph = round(basis_before_allowance * pph_rate / (1 - pph_rate))`, using exact decimal arithmetic and final rounding by `tax_rounding`. This is true gross-up for a fixed rate, not a statutory TER/progressive model. A fixed override (including zero) is already the final tax and allowance, not a basis to gross up.

A complete runnable workspace example, including every record type, can be obtained in the app console with `Caroll.csv.exportWorkspace(Caroll.sampleWorkspace())`. An empty workspace uses the identical header. Do not use a shortened conceptual workspace header for import.

## Employee-only CSV

`exportEmployees(ws)` uses exactly the employee columns listed above, in that order. `previewEmployees(text, ws, mode)` returns `{workspace, added, updated, unchanged, rejected, issues}` with numeric counts and issues shaped `{severity, message}`. It always clones the input workspace.

- `add`: requires header columns `employee_id,name,current_golongan`; rejects IDs already in workspace.
- `update`: add-and-update by ID. Requires only the `employee_id` header for patch files. Existing records change **only provided columns**; omitted columns and their types remain untouched. Explicit blank optional fields clear existing values. New IDs still need a name and, if active, a resolvable current Golongan. Never matches by name. Warns on changed names and existing employees absent from the file.
- `replace`: requires the same headers as add, rebuilds employees using defaults, and requires explicit UI confirmation. Existing component assignments are retained; removing an employee referenced by an assignment is rejected rather than silently losing assignments.

New/replacement employee defaults: blank optional text and overrides, `active=true`, both BPJS participation flags `true`, `pph_method=gross_up`, `pph_rate=0`. Duplicate IDs within any file are rejected. IDs are trimmed but leading zeroes are retained.

```csv
employee_id,name,current_golongan,proposed_golongan,current_basic_override
0007,"Nama, Contoh",3-PM8,3-PM9,
```

Patch example (preserves every other employee field):

```csv
employee_id,proposed_golongan,proposed_basic_override
0007,3-PM9,
```

## Matrix-only CSV

`exportMatrix(ws, scenario)` exports the selected scenario's salary entries, not generator parameters. Use workspace export to retain `generator_settings`; it is not a supported matrix-only column. Headers, in order:

`scenario,golongan,basic_salary,matrix_name,effective_date,salary_group,professional_category,kmk_level,note`

`previewMatrix(text, ws)` requires the first three headers. Their meanings match `matrix_entry`; `matrix_name` maps to the parent matrix's `name`, and `effective_date` to its date. Dimensions, if omitted or blank, derive from Golongan. Omitted note and metadata retain existing values. Provided blank note/date clears it; blank matrix name is invalid. All provided metadata for a scenario must agree across rows. New scenarios create `matrix-current` or `matrix-proposed` with default names `Current matrix` / `Proposed matrix` and a blank date unless provided.

This API **upserts** by `(scenario,golongan)` and retains entries absent from the file; it is not matrix replacement. Duplicate keys in one file, inconsistent dimensions, and conflicting scenario metadata are rejected. Parent metadata changes count a matching row as updated. Preview shape and blocking behavior match employee imports.

The following salaries are illustrative, not taken from a real workbook. Do not commit real workbook salaries or payroll data.

```csv
scenario,golongan,basic_salary,matrix_name,effective_date,note
current,3-PM8,8455000,Current salaries,2026-01-01,"Example, review before use"
proposed,3-PM8,8700000,Proposed salaries,2027-01-01,
```

## Preview application contract

Preview rows are evaluated without mutating `ws`. Valid rows may appear in the candidate even when another row fails. **The UI must not apply any preview with `rejected > 0` or any `severity === 'error'` issue.** For employee/matrix previews, whole-file/schema/reference/core-validation errors set `rejected` to at least one even when no particular CSV row can be blamed. Thus `rejected` is a blocking count, not always an exact count of rejected source rows; added/updated/unchanged count accepted source rows, not implicit removals or untouched rows. Warnings alone do not block. A valid replace preview still needs explicit confirmation. This module cannot enforce UI commit behavior because it does not own UI code.

## Payroll results (export only)

`exportResults(result)` consumes the core payroll result, one row per employee, and blocks global or employee-level error issues (also `valid === false`). Warnings may export; the UI must obtain confirmation per the specification. No totals row is appended. Missing/nonfinite money metrics or missing change amounts are rejected. Undefined/null change percentages export blank, never infinity. Percent changes are core **percentage points** (`5` means a 5% increase), unlike input rate fractions.

Complete stable result columns in order and their sources:

| Columns | Source / meaning |
| --- | --- |
| `employee_id,name,unit,department,current_golongan,proposed_golongan` | Employee identity/context fields |
| `current_basic_salary,proposed_basic_salary` | Scenario `basic_salary`, integer money |
| `basic_change,basic_change_percent` | `changes.basic_salary.amount` / `.percent` |
| `current_gross,proposed_gross` | Scenario `gross`, money, including `bpjs_allowance = employee_bpjs` and `tax_allowance = pph` |
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

The breakdown shows `bpjs_allowance` as an earning and retains the equal employee BPJS deduction; organization totals in the UI also show the new `bpjs_allowance` metric for both scenarios. The tax allowance and equal PPh deduction remain separate breakdown lines. Thus THP is reported gross minus employee BPJS, PPh, and other employee deductions, or gross before both allowances minus other employee deductions. The BPJS allowance and deduction offset rather than both increasing cash THP. Compared with the old model without the BPJS allowance, with other inputs unchanged, THP rises by the formerly deducted employee BPJS share.

Employer cost is `cost = gross + employer_bpjs + employer_contributions` (other employer contributions): gross already includes both allowances exactly once. Employer BPJS stays separate; do not add employee BPJS or either allowance again. The core compatibility metric `employer_tax_cost` remains zero because tax is already in gross. Existing gross CSV columns include the BPJS allowance; no new result CSV column is planned for `bpjs_allowance`, and neither `employer_tax_cost` nor `tax_allowance` adds a column.

## API clarifications / deviations

All nine requested method names and return shapes are implemented. Intentional format clarifications: update mode accepts ID-only patches despite the spec's general three-column employee header; core PPh spelling is `gross_up` (hyphenated input accepted); LF import is accepted while exports use CRLF; matrix preview is upsert rather than replacement; workspace import rejects unsupported schemas and structural integrity errors but permits payroll-incomplete drafts; whole-preview blocking errors use `rejected >= 1`. No UI files are changed.

Validation: run `node --test tests/csv.test.js` from the project root. Tests use the actual core scripts and sample workspace, not substitute core implementations.
