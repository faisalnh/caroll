# Caroll CSV format (schema 1)

`js/csv.js` is a classic script that installs `globalThis.Caroll.csv`. Load core state, matrix/money, and validation scripts before calling its workspace APIs. No API writes storage, changes the input workspace, or applies an import to the UI.

## Encoding and syntax

Exports are UTF-8 text beginning with U+FEFF (BOM), comma-delimited, with CRLF record endings and a final CRLF. Callers creating downloads should use `text/csv;charset=utf-8`. Embedded commas, double quotes, CR and LF are quoted; embedded quotes are doubled. Imports accept CRLF or LF record separators and an optional leading BOM. Bare CR outside quoted cells, unterminated quotes, bare-field quotes, characters after closing quotes, inconsistent field counts, and duplicate/blank/padded headers are errors. Quoted multiline text and Unicode are preserved. A header-only file is valid; an empty file is not. Empty lines are not silently skipped (a single-column empty record is valid).

`parse(text)` returns string-valued row objects, without type conversion. `stringify(rows, headers?)` returns BOM CSV; omitted headers are the stable first-seen union of object keys. Supply headers for empty arrays. Neither generic function interprets schema or modifies text to neutralize spreadsheet formulas. When opening untrusted data in spreadsheet software, import text columns explicitly as text: quoting alone does not prevent formula evaluation. IDs with leading zeroes are preserved in CSV but Excel may reinterpret them.

Typed APIs reject unknown columns. Numbers must use plain decimal notation (no exponent, grouping separators, currency symbols, `%`, NaN, or infinity). Surrounding numeric whitespace is accepted. Money is normalized with core `C.roundMoney(originalDecimal, applicableRounding)` (ties away from zero), directly from the original decimal string, without an intermediate rounding to rupiah or conversion to floating point. Matrix salaries and employee basic overrides use `globalRules.rounding`; fixed/manual component defaults and assignments use the component definition's `rounding`; employee fixed tax overrides use `globalRules.tax_rounding`. BPJS minimum/maximum basis bounds use integer rupiah (`1`): these are caps/floors, not contribution amounts, and core applies the BPJS rounding rule only when calculating contributions. Already-calculated result money exports at integer rupiah. For example, `4000049.5` with global rounding `100` becomes `4000000`, not `4000100`. Both typed imports and exports follow these rules. Workspace import collects every row before normalizing money, so global rules and component definitions may appear before or after their dependent records. Unsafe numeric magnitudes are rejected. Rates are decimal fractions (`0.09` means 9%); percentage component values remain fractional. Booleans export as `true`/`false`; imports accept either word case-insensitively with surrounding whitespace, not `1`, `0`, `yes`, or `no`. Optional blank values normalize to `''`, **never zero**. Dates must be real ISO `YYYY-MM-DD` dates. Period labels are free text.

Golongan is canonicalized through core parsing as `{salary_group}-{professional_category}{kmk_level}`, e.g. `3-PM8`; `01-u01` normalizes to `1-U1`. Salary group is stored as a canonical string, KMK as an integer. Supplied dimensions must match the code.

## Workspace CSV

`exportWorkspace(workspace)` emits the complete fixed superset, never JSON payload cells. `importWorkspace(text)` returns a new structurally valid workspace or throws; success does **not** mean payroll is ready to calculate. Every superset header is required on import (column order may vary). Row order is immaterial. Unknown schema versions, record types, duplicate IDs/keys, irrelevant nonblank cells, missing singleton records, invalid types/enums/numbers/rules, and dangling matrix/employee/component references are rejected. Structurally valid unfinished drafts can be both saved and reloaded: missing salary rows for employee Golongan, unresolved proposed salaries, and missing manual component or enabled-tax inputs do not block workspace loading. After import, the UI should show `C.validate(workspace)` issues as informational readiness feedback, **not gate workspace loading on them**. Core calculation and result export remain blocked until payroll errors are resolved. Employee/matrix import previews retain their separate blocking contract below.

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

Fields: `matrix_id!`, `name!`, `scenario!`, `effective_date`.

- `matrix_id`: unique matrix identifier referenced by entries.
- `name`: matrix display name.
- `scenario`: `current` or `proposed`; at most one matrix per scenario.
- `effective_date`: optional ISO date.

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
| `current_basic_override` | Optional nonnegative money; blank derives from matrix, zero is explicit |
| `proposed_basic_override` | Optional nonnegative money, same blank semantics |
| `ptkp_status` | Optional status text; blank may warn |
| `bpjs_kesehatan` | Required participation boolean |
| `bpjs_ketenagakerjaan` | Required participation boolean |
| `pph_method` | `gross`, `net`, or core spelling `gross_up`; input alias `gross-up` accepted |
| `pph_rate` | Nonnegative decimal fraction; may be blank when tax is disabled or overridden |
| `pph_fixed_override` | Optional nonnegative monthly tax money; blank calculates, zero overrides |
| `notes` | Optional employee text |

#### `component_definition` → `componentDefinitions`

Fields: `code!`, `name!`, `category`, `direction!`, `calculation_type!`, `default_value`, `taxable!`, `bpjs_kesehatan!`, `bpjs_ketenagakerjaan!`, `applies_current!`, `applies_proposed!`, `active!`, `rounding!`, `notes`.

- `code`: unique component identifier; `name`: display name; `category`: optional classification text.
- `direction`: `earning`, `employee_deduction`, or `employer_contribution`.
- `calculation_type`: `fixed`, `percentage_basic`, `percentage_gross`, or `manual`.
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
- `basis`: `basic`, `selected`, or `gross`.
- `employee_enabled`, `employer_enabled`: enable each contribution side.
- `rounding`: integer `1`, `100`, or `1000` rupiah.
- `active`: enable program.

#### `global_rule` → `globalRules` (exactly one)

Fields: `currency!`, `rounding!`, `percentage_precision!`, `include_inactive!`, `allow_negative_thp!`, `proposed_defaults_current!`, `tax_enabled!`, `tax_basis!`, `tax_rounding!`.

- `currency`: `IDR`.
- `rounding`: money calculation step, `1`, `100`, or `1000`.
- `percentage_precision`: display precision; current core requires `2`.
- `include_inactive`: include inactive employees in calculation.
- `allow_negative_thp`: permit negative take-home pay.
- `proposed_defaults_current`: blank proposed Golongan defaults to current.
- `tax_enabled`: enable Estimasi PPh 21.
- `tax_basis`: `taxable`, `gross`, or `basic`.
- `tax_rounding`: tax calculation step, `1`, `100`, or `1000`.

A complete runnable workspace example, including every record type, can be obtained in the app console with `Caroll.csv.exportWorkspace(Caroll.sampleWorkspace())`. An empty workspace uses the identical header. Do not use a shortened conceptual workspace header for import.

## Employee-only CSV

`exportEmployees(ws)` uses exactly the employee columns listed above, in that order. `previewEmployees(text, ws, mode)` returns `{workspace, added, updated, unchanged, rejected, issues}` with numeric counts and issues shaped `{severity, message}`. It always clones the input workspace.

- `add`: requires header columns `employee_id,name,current_golongan`; rejects IDs already in workspace.
- `update`: add-and-update by ID. Requires only the `employee_id` header for patch files. Existing records change **only provided columns**; omitted columns and their types remain untouched. Explicit blank optional fields clear existing values. New IDs still need a name and, if active, a resolvable current Golongan. Never matches by name. Warns on changed names and existing employees absent from the file.
- `replace`: requires the same headers as add, rebuilds employees using defaults, and requires explicit UI confirmation. Existing component assignments are retained; removing an employee referenced by an assignment is rejected rather than silently losing assignments.

New/replacement employee defaults: blank optional text and overrides, `active=true`, both BPJS participation flags `true`, `pph_method=gross`, `pph_rate=0`. Duplicate IDs within any file are rejected. IDs are trimmed but leading zeroes are retained.

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

`exportMatrix(ws, scenario)` exports the selected scenario. Headers, in order:

`scenario,golongan,basic_salary,matrix_name,effective_date,salary_group,professional_category,kmk_level,note`

`previewMatrix(text, ws)` requires the first three headers. Their meanings match `matrix_entry`; `matrix_name` maps to the parent matrix's `name`, and `effective_date` to its date. Dimensions, if omitted or blank, derive from Golongan. Omitted note and metadata retain existing values. Provided blank note/date clears it; blank matrix name is invalid. All provided metadata for a scenario must agree across rows. New scenarios create `matrix-current` or `matrix-proposed` with default names `Current matrix` / `Proposed matrix` and a blank date unless provided.

This API **upserts** by `(scenario,golongan)` and retains entries absent from the file; it is not matrix replacement. Duplicate keys in one file, inconsistent dimensions, and conflicting scenario metadata are rejected. Parent metadata changes count a matching row as updated. Preview shape and blocking behavior match employee imports.

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
| `current_gross,proposed_gross` | Scenario `gross`, money |
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

## API clarifications / deviations

All nine requested method names and return shapes are implemented. Intentional format clarifications: update mode accepts ID-only patches despite the spec's general three-column employee header; core PPh spelling is `gross_up` (hyphenated input accepted); LF import is accepted while exports use CRLF; matrix preview is upsert rather than replacement; workspace import rejects unsupported schemas and structural integrity errors but permits payroll-incomplete drafts; whole-preview blocking errors use `rejected >= 1`. No UI files are changed.

Validation: run `node --test tests/csv.test.js` from the project root. Tests use the actual core scripts and sample workspace, not substitute core implementations.
