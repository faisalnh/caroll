# Caroll Payroll Simulator Specification

## Automatic PPh 21 amendment

Automatic tax replaces manual rates, fixed tax overrides, selectable tax bases/rounding, and legacy net-tax calculation. The UI is labeled **PPh 21 otomatis**, not a claim of full tax compliance. See [verified tax sources and rounding assumptions](docs/TAX_RULES.md).

- Scope: domestic individuals, ordinary regime without DTP or special incentives, tax months in 2024–2026. Permanent employees require a nonfinal month other than December; temporary employees require actual monthly payment, not aggregated daily/weekly pay. Non-employees are limited to one plain service-fee payment at full gross, without special exclusions or fee sharing. Annual/final reconciliation, daily/weekly payments, foreign residency, and special/DTP regimes are unsupported and blocked by validation/payroll.
- Employee fields: `tax_category` = `permanent|temporary_monthly|non_employee|unsupported`; `tax_residency` = `domestic|foreign`; `tax_period_type` = `ordinary|final`; `tax_payment_scope` = `monthly|single|other`. Never infer them from `employment_status`. PTKP dropdown: `TK/0`–`TK/3`, `K/0`–`K/3`; invalid legacy text remains visible for correction and warns/blocks tax.
- Global rules: optional legacy-blank `current_tax_month` and `proposed_tax_month` (`YYYY-MM`), required when tax is active; `tax_regime` = `ordinary|special`, with blank blocking active tax until the user explicitly confirms ordinary/no special incentives.
- BPJS rules: optional legacy-blank `tax_program` = `kesehatan|jkk|jkm|jht|jp|other` for CSV persistence. Every active rule requires `kesehatan|jkk|jkm|jht|jp` for payroll, even with tax disabled or no participating employees. Blank, unknown, and `other` resolve to no participation (`null`) and block active payroll; codes never determine participation. Migrate legacy active rules by identifying the actual supported program or deactivate them as drafts. Inactive unidentified drafts remain allowed; CSV preservation is unchanged.
- New CSV columns are optional on import; omitted legacy values load blank, not inferred. Invalid nonblank new enums/month syntax are rejected. Partial employee updates preserve omitted fields. Draft workspace persistence is separate from payroll readiness.
- `pph_rate`, `pph_fixed_override`, and employee `pph_method` remain archival CSV data, preserved during employee editing but never calculation inputs. No manual tax override badges or filter. Explicit basic salary overrides are restored at the user's request, with salary-specific source badges and warnings; this does not restore manual tax. Component assignment overrides remain supported. Global `tax_basis` and `tax_rounding` remain legacy CSV fields, preserved via global-rule merge but have no effect on automatic tax and no UI selectors.
- Keep `tax_enabled`: disabled means zero PPh/tax allowance. Scenario `gross` deducts automatic tax; `gross_up` iterates the automatic formula to an exact equal allowance/deduction. Legacy `net` remains selectable only as explicitly unsupported, blocked for active tax with instructions to use `gross_up`.
- TER monthly and progressive Article 17 on 50% of a non-employee payment use `C.tax`. Final exact nonnegative tax is floored once to whole rupiah; this is an explicit simulation assumption, not universally verified statutory rounding. Gross-up reselects bands each iteration. No full tax-compliance or filing-readiness claim is made.
- Load `js/tax.js` before validation/payroll. Eligibility, taxable-gross composition, year gates and calculation belong to those modules, not UI or CSV.

## Payment policy amendment — scenario settings

Payment policies determine which employee shares are funded through allowances. Payment schemes are selected independently for current/proposed scenarios in **Aturan perhitungan → Atur skema pembayaran**, confirmed before applying and persisted on global rules.

- PPh: `gross` (deduct automatic tax from THP), `gross_up` (automatic tax allowance in gross, equal deduction), or `unconfirmed`. Legacy `net` remains selectable for compatibility but blocks active tax; use `gross_up` instead.
- BPJS Kesehatan and TK each: `employee` (deduct employee share from THP), `company` (fund employee share with allowance in gross), or `unconfirmed`. Employer contributions remain separate costs.
- New workspace current defaults: PPh/health unconfirmed, TK employee. Proposed: PPh gross_up, both BPJS company. Unconfirmed blocks relevant enabled calculations, not draft persistence.
- Legacy CSV without policy fields and demo workspaces retain gross_up/company policy defaults, not manual-tax calculations. The historical employee method is archival only.
- Gross uses the automatic formula; gross-up iterates it to an exact equal tax allowance/deduction, reselecting bands. Manual rates and fixed tax overrides never affect either calculation.
- BPJS allowance equals only company-funded employee shares. THP = gross − employee BPJS − employee PPh − other deductions. Supported payroll cost = gross + employer BPJS + other employer contributions; `employer_tax_cost` is zero. No double counting.
- BPJS and percentage-gross component bases remain before allowances. Automatic taxable gross includes funded BPJS allowances and taxable employer BPJS as specified in §8.4; legacy `tax_basis` has no effect. Disabling tax zeroes PPh and tax allowance only.
- Six optional CSV policy fields are documented in `docs/CSV_FORMAT.md`. Global-rule edits must preserve independently edited payment policies.

## 1. Document Status

- Status: Draft for implementation
- Product name: Caroll Payroll Simulator
- Product type: Static, database-free browser application
- Primary entry point: `index.html`
- Intended browser: Current desktop Google Chrome
- Intended users: Payroll, finance, and management staff preparing annual salary simulations
- Initial language: Indonesian user interface
- Currency: Indonesian rupiah (IDR)

## 2. Product Summary

Caroll is a lightweight payroll simulation tool for preparing an annual salary increase proposal and estimating its effect on employee payroll.

The application must run without installation, authentication, a web server, or a database. A user opens `index.html` directly in Chrome and works entirely in the browser. The implementation may use multiple local HTML, CSS, and JavaScript files, but `index.html` is the only file the user needs to open.

The application supports four primary capabilities:

1. Create and edit a salary matrix.
2. Import or enter employees and assign current and proposed Golongan.
3. Assign allowances, BPJS, PPh 21, and other deductions.
4. Calculate and compare current and proposed basic salary, gross pay, take-home pay, and employer cost.

The tool has two purposes:

1. Provide a quick annual salary increase calculator for the current payroll exercise.
2. Validate workflows and requirements for a future production payroll system.

Caroll is a simulator and decision-support tool. It is not initially intended to execute payroll payments, submit taxes, generate statutory reports, integrate with banks, or act as the authoritative employee database.

## 3. Design Principles

### 3.1 Open and Run Directly

- The application must work when `index.html` is opened from the filesystem using a `file://` URL.
- No local server command is required.
- No package installation is required for the end user.
- No internet connection is required.
- No CDN-hosted assets or libraries are allowed at runtime.
- Runtime code must not depend on `fetch()` for local files.
- Runtime code should use classic scripts loaded with `defer`, or another approach confirmed to work under `file://`. ES module imports must not be used unless verified in the supported Chrome environment.

### 3.2 Explicit File-Based Persistence

- The application has no database and no server-side storage.
- The authoritative saved workspace is an exported CSV file.
- Users must be able to export the current workspace and import it later.
- The application may use in-memory state while open.
- Automatic browser persistence such as IndexedDB or `localStorage` is out of scope for the first version. This avoids hidden or machine-specific state.
- The UI must warn about unsaved changes before replacing the current workspace, importing another workspace, resetting data, or closing/reloading the page where browser behavior permits.

### 3.3 Transparent Calculations

- Every calculated amount must be explainable from visible inputs and rules.
- Each employee result must show a calculation breakdown.
- Manual overrides must be visibly marked.
- Salary decreases, missing matrix entries, and incomplete statutory settings must be flagged.

### 3.4 Safe Monetary Arithmetic

- Monetary values must be represented internally as integer rupiah.
- Imported decimal rupiah values must be rounded according to the configured rounding rule before use.
- Percentage calculations must avoid uncontrolled binary floating-point accumulation.
- Each rule must define when and how rounding occurs.

## 4. Scope

### 4.1 Included in Version 1

- Standalone static application opened through `index.html`
- Create, edit, duplicate, and delete salary matrix entries
- Generate a new matrix by applying percentage adjustments to a previous matrix
- Import and export a complete workspace as CSV
- Import employees from a simple employee CSV
- Export employee and payroll result CSV files
- Manual employee entry and editing
- Current and proposed Golongan per employee
- Typed matrix basic salary calculation, with optional explicit employee basic salary overrides taking precedence
- Fixed and percentage-based earnings and deductions
- BPJS employee and employer contribution rules
- Automatic PPh 21 within the explicitly supported monthly/single-payment scope
- Current versus proposed payroll scenarios
- Employee-level and organization-level totals
- Basic salary, gross earnings, employee deductions, take-home pay, and employer cost
- Validation errors and warnings
- Indonesian rupiah display formatting
- Print-friendly summary

### 4.2 Explicitly Excluded from Version 1

- User accounts, authentication, and permissions
- Database or backend API
- Cloud synchronization
- Concurrent multi-user editing
- Payroll approval workflow
- Payslip distribution
- Bank payment files
- Accounting journal integration
- Attendance and leave processing
- Automatic overtime calculation from attendance
- Government tax submission files
- Full annual PPh 21 reconciliation
- Encryption of workspace files
- Digital signatures
- Mobile-first data entry
- Importing arbitrary Excel workbook structures directly

CSV import is deliberately preferred over direct XLSX import in version 1. Existing spreadsheets can be saved as CSV after selecting and arranging the required columns.

## 5. Target Usage Workflow

### 5.1 First-Time Use

1. User opens `index.html` in Chrome.
2. User creates a new workspace or imports a previously exported workspace CSV.
3. User creates or imports the current and proposed salary matrices.
4. User imports the employee list or enters employees manually.
5. User reviews current and proposed Golongan assignments.
6. User configures payroll components, BPJS rules, and PPh settings.
7. User runs the calculation.
8. User reviews warnings and employee-level changes.
9. User exports the workspace CSV and payroll result CSV.

### 5.2 Recurring Annual Simulation

1. Import last saved workspace.
2. Duplicate the current salary matrix as a proposed matrix.
3. Apply annual percentage adjustments by salary group.
4. Update proposed Golongan values, manually or via employee CSV import.
5. Update allowances and statutory rules where needed.
6. Compare the current and proposed scenarios.
7. Export summary and detailed results.

## 6. Application Structure

The recommended runtime structure is:

```text
caroll/
  index.html
  css/
    app.css
    print.css
  js/
    app.js
    state.js
    csv.js
    matrix.js
    payroll.js
    validation.js
    ui.js
  docs/
    CSV_FORMAT.md
    USER_GUIDE.md
  samples/
    sample-workspace.csv
    employee-import-template.csv
  SPECIFICATION.md
```

This structure is a recommendation, not a strict requirement. The following runtime constraints are strict:

- `index.html` must be the only entry point the user opens.
- All required assets must use relative local paths.
- The app must work if the complete `caroll` folder is copied to another location.
- The app must not depend on the repository path.
- The app must not require a build process for normal use.
- If third-party libraries are used, browser-ready copies must be committed locally and loaded from relative paths.

## 7. Navigation and Screen Layout

The application is a single-page interface controlled from `index.html`. It should use six top-level sections displayed as tabs or a left navigation rail.

### 7.1 Workspace

Purpose: Start, load, save, and inspect the current workspace.

Required controls:

- New workspace
- Import workspace CSV
- Export workspace CSV
- Import employee CSV
- Export employee CSV
- Export payroll result CSV
- Reset workspace
- Workspace name
- Current period label
- Proposed period label
- Last imported filename
- Unsaved changes indicator

Required summary:

- Number of employees
- Number of matrix entries
- Number of payroll components
- Number of blocking validation errors
- Number of warnings

### 7.2 Matrix

Purpose: Define current and proposed basic salary by matrix type and Golongan.

Each parent matrix has a unique `matrix_id`, a scenario (`current|proposed`), and required `matrix_type`. Types are trimmed and normalized to lowercase, matching `^[a-z][a-z0-9_-]*$`; `regular` and `admin` are the initial business types, not a closed enum. Custom types are supported. There is at most one parent per `(scenario,matrix_type)`. Entries derive type from their parent, never from an independent entry field, with unique `(scenario,matrix_type,golongan)` keys. The same Golongan may therefore have different salaries across types. Runtime never infers type from employee name, position, salary, or Golongan.

Required controls:

- Select scenario, matrix type, and parent identity; grid/list, entry editing, percentage adjustment, and UI matrix export are isolated to the selected parent
- Add matrix entry
- Edit matrix entry
- Delete matrix entry
- Copy the selected matrix to the other scenario, replacing only the same-type destination and its generator settings after confirmation; other types, employees, and overrides remain unchanged
- Apply percentage increase
- Import matrix rows from CSV
- Export visible matrix as CSV

Parent metadata: matrix identifier, name, scenario, required type, optional effective date and `generator_settings`. Changing parent scenario/type requires confirmation; entries follow the parent, while employee types and overrides do not change.

The inline generator uses five KG settings (`base_salary`, `cola`, `kmk_index`) to produce 300 cells (KG 1–5 × PM/P/M/U × KMK 1–15). Its confirmed preview replaces matching cells only under the selected parent, preserving matching notes, out-of-range entries, other parents/types/scenarios, and employee overrides. Parameters persist on that parent in workspace CSV. Regeneration does not override explicit employee salary exceptions or establish authoritative missing cells.

Required fields per entry:

- Parent matrix identifier and matching scenario
- Salary group, for example `1`, `2`, or `3`
- Professional category, for example `PM`, `P`, `M`, or `U`
- KMK level, for example `1` through `15`
- Generated Golongan code, for example `3-PM8`
- Basic salary in rupiah
- Optional note

The app must generate the canonical Golongan code as:

```text
{salary_group}-{professional_category}{kmk_level}
```

Example:

```text
salary_group = 3
professional_category = PM
kmk_level = 8
golongan = 3-PM8
```

Matrix display modes:

- Grid mode, resembling the familiar payroll matrix
- List mode, showing one Golongan per row

Apply-percentage behavior:

- User chooses one or more salary groups.
- User enters an adjustment percentage.
- User chooses whether to apply it to all categories or selected categories.
- User chooses a rounding mode.
- A preview shows old amount, new amount, nominal change, and percentage change.
- Changes are committed only after confirmation.

### 7.3 Employees

Purpose: Maintain the employees included in the simulation.

Required employee fields:

- Employee ID, required and unique
- Employee name, required
- Unit
- Department
- Position
- Employment status
- Join date, optional
- Active flag
- Current Golongan, required for active employees
- Proposed Golongan, optional; defaults to the current Golongan code only when the global default is enabled
- Current matrix type (`current_matrix_type`), required for active/included employees
- Proposed matrix type (`proposed_matrix_type`), optional; blank follows current type only if `proposed_matrix_type_defaults_current` is true, independently of Golongan fallback
- Current and proposed basic salary overrides, optional editable nonnegative integer rupiah; nonblank values, including zero, take precedence over the respective matrix salary
- PTKP status
- BPJS Kesehatan participation flag
- BPJS Ketenagakerjaan participation flag
- Explicit tax category, residency, period type, and payment scope; never inferred from employment status
- PPh method, rate, and fixed override retained for archival CSV compatibility only; the employee form preserves them without tax-input controls
- Notes

Required functions:

- Add employee
- Edit employee
- Delete employee
- Duplicate employee for testing
- Search by ID or name
- Filter by unit, department, Golongan, active status, or validation status
- Bulk set proposed Golongan equal to current Golongan
- Bulk update proposed Golongan from employee import CSV
- Show resolved current and proposed salary and its matrix/override source; warn whenever an override is used and additionally when it differs from a matching matrix salary
- Cascade employee selectors by type → KG → professional level → KMK from the applicable scenario's entries; reset dependent selections on changes, compose Golongan read-only, and keep unavailable legacy values visible for repair
- Filter by resolved current/proposed type, including unresolved types
- Bulk assign a chosen scenario/type to filtered employees only after confirming count, scenario, and type; preserve Golongan, overrides, tax archives, and component assignments

Employee matching during import must use `employee_id`. Name-based matching is not allowed for automatic updates.

### 7.4 Components

Purpose: Define allowances, deductions, BPJS, and tax inputs.

There are two component levels:

- Component definitions describe how a component behaves.
- Employee component assignments provide employee-specific values.

Required component definition fields:

- Component code, unique
- Component name
- Category
- Direction: earning, employee deduction, or employer contribution
- Calculation type: fixed amount, percentage of basic salary, percentage of gross basis, or manual amount
- Default value
- Taxable flag
- Included in BPJS Kesehatan basis flag
- Included in BPJS Ketenagakerjaan basis flag
- Applies to current scenario flag
- Applies to proposed scenario flag
- Active flag
- Rounding rule
- Notes

Initial suggested component definitions:

- Structural allowance
- Functional allowance
- Teaching allowance
- Transport allowance
- Meal allowance
- Overtime
- Rapel
- Bonus
- Other earnings
- Kasbon
- Zakat or donation
- Other employee deductions

Required assignment functions:

- Assign a component to one employee
- Assign a component to selected employees
- Use the component default or an employee-specific override
- Set separate current and proposed values
- Remove an assignment
- Import assignments as part of the workspace CSV

### 7.5 Rules

Purpose: Configure statutory and global calculation rules.

#### BPJS Rule Fields

- Program code
- Program name
- Explicit supported `tax_program` identification for every active BPJS rule (`kesehatan`, `jkk`, `jkm`, `jht`, or `jp`), even with tax disabled; do not infer participation from program code. Blank/`other` are draft values, not supported active programs.
- Employee rate
- Employer rate
- Minimum wage basis, optional
- Maximum wage basis, optional
- Basis selection: basic salary, basic plus selected allowances, or gross earnings
- Employee contribution enabled flag
- Employer contribution enabled flag
- Rounding mode
- Active flag

Suggested BPJS programs:

- Kesehatan
- JHT
- JP
- JKK
- JKM

The app must not hard-code legal percentages as permanently correct. It may provide editable defaults, but the user is responsible for confirming applicable rates and limits.

#### PPh 21 Rule Fields

The interface uses **PPh 21 otomatis**, with no full statutory-compliance claim. Supported scope and eligibility are defined in the automatic-tax amendment and §8.4.

- Tax enabled flag
- Explicit current/proposed tax months (`YYYY-MM`), distinct from workspace period labels
- Explicit ordinary-regime confirmation (no DTP/special incentives)
- Scenario payment policy: `gross`, `gross_up`, or an unresolved/unsupported selection that blocks active tax
- Employee tax category, residency, period type, payment scope, and supported PTKP status
- Explicit BPJS tax-program identification

Required behavior:

- Choose rates/formulas automatically, never from employee `pph_rate`, `pph_fixed_override`, or `pph_method` archives. Preserve archives during employee edits and CSV round-trips; do not show manual tax override badges or filters.
- Preserve legacy `tax_basis` and `tax_rounding` in global-rule edits for CSV compatibility, without selectors or effects on automatic tax.
- Disabled tax sets PPh and tax allowance to zero; BPJS allowance is unaffected.
- `gross` deducts automatic PPh without allowance. `gross_up` adds an allowance equal to automatic PPh and deducts the same amount, with separate breakdown lines.
- Active `net` is unsupported and blocked, with instructions to use `gross_up`. Missing eligibility or unconfirmed active policies block calculation/results, not structurally valid draft persistence.
- Floor only final exact tax to whole rupiah as a disclosed simulation assumption; do not apply configurable money-rounding steps to automatic tax.

#### Global Rule Fields

- Default currency: IDR
- Money rounding: nearest rupiah, nearest hundred, or nearest thousand
- Percentage display precision
- Include inactive employees flag
- Allow negative take-home pay flag
- Treat proposed Golongan blank as current Golongan flag, enabled by default

### 7.6 Simulation

Purpose: Calculate and compare current and proposed payroll.

Top-level metrics:

- Employee count
- Current total basic salary
- Proposed total basic salary
- Basic salary nominal increase
- Basic salary percentage increase
- Current gross earnings
- Proposed gross earnings
- Gross earnings increase
- Current total BPJS allowance (`bpjs_allowance`)
- Proposed total BPJS allowance (`bpjs_allowance`)
- Current employee deductions
- Proposed employee deductions
- Current take-home pay
- Proposed take-home pay
- Take-home pay increase
- Current employer contributions
- Proposed employer contributions
- Current employer cost
- Proposed employer cost
- Employer cost increase

Employee result table columns:

- Employee ID
- Name
- Current Golongan
- Proposed Golongan
- Current basic salary
- Proposed basic salary
- Basic salary change
- Basic salary change percentage
- Current gross earnings
- Proposed gross earnings
- Current employee BPJS
- Proposed employee BPJS
- Current PPh
- Proposed PPh
- Current take-home pay
- Proposed take-home pay
- Take-home pay change
- Take-home pay change percentage
- Current employer cost
- Proposed employer cost
- Status or warnings

Required filters:

- All employees
- Increased
- Unchanged
- Decreased
- Golongan changed
- Missing data
- Resolved current/proposed matrix type, including unresolved types
- By unit or department

Selecting an employee opens a detailed calculation breakdown for current and proposed scenarios. Show the `bpjs_allowance` metric as an earning line alongside the full employee BPJS deduction (equal only when all employee shares are company-funded); also show the allowance in organization totals in the UI.

## 8. Calculation Definitions

### 8.1 Basic Salary

Resolve the scenario's type and Golongan independently. Blank proposed type follows current type only when `proposed_matrix_type_defaults_current` is true (default true); blank proposed Golongan follows the current code only when `proposed_defaults_current` is true. Both fallbacks still select the **proposed** matrix, never current salary. No fallback crosses types or borrows another type's matching code.

An explicit `current_basic_override` or `proposed_basic_override` is restored as an active input at the user's request. A nonblank nonnegative integer rupiah value, including zero, takes precedence for that scenario and is rounded by the global money rule. Blank returns to matrix lookup. Warn whenever an override is used, even if equal to the matrix, and additionally if the rounded override differs from a matching matrix salary. The breakdown records `source: matrix|override` and resolved `matrix_type`.

Without an override, exactly one entry must match `(scenario,resolved type,resolved Golongan)` or calculation is blocked. An override can supply salary when a cell is absent, but cannot bypass required employee classification, valid Golongan, unique applicable parent, duplicate-entry validation, or other payroll errors. This exception does not enable manual PPh: tax-rate/fixed-tax fields remain ignored archives under the automatic PPh amendment. Component assignment overrides remain supported.

### 8.2 Earnings

For each scenario:

```text
gross_before_allowances = basic_salary + sum(earning_components)
gross_before_tax_allowance = gross_before_allowances + bpjs_allowance
gross_earnings = gross_before_tax_allowance + tax_allowance
```

Supported component formulas:

```text
fixed_amount = configured rupiah amount
percentage_of_basic = basic_salary * rate
percentage_of_gross_basis = selected gross basis * rate
manual_amount = employee-specific rupiah amount
```

Circular formulas are not permitted. `percentage_gross` continues to use basic salary plus non-percentage-gross earnings, excluding all percentage-gross components and both BPJS and tax allowances. Calculate these components and all BPJS contribution bases before either allowance, then the BPJS allowance, then automatic PPh under the scenario policy and any gross-up tax allowance. In the formulas above, `earning_components` excludes both calculated allowances. Reported `gross` is `gross_earnings`, including both allowances.

### 8.3 BPJS

For each active BPJS program:

```text
raw_basis = amount determined by the program basis selection
capped_basis = min(max(raw_basis, minimum_basis), maximum_basis)
employee_contribution = capped_basis * employee_rate
employer_contribution = capped_basis * employer_rate
```

If a minimum or maximum is blank, that bound is not applied. All BPJS basis selections remain before both BPJS and tax allowances; neither allowance changes BPJS, even for a gross basis. Employee participation, minimum/maximum bounds, contribution rounding, and active/employee/employer enable flags are unchanged.

Totals:

```text
employee_bpjs = sum(employee contributions)
employer_bpjs = sum(employer contributions)
bpjs_allowance = sum(employee contributions for programs with scenario policy company)
```

The company funds only employee shares selected by each program's scenario policy, after contribution rounding. Add this allowance to gross and retain the full employee BPJS deduction. Programs under `employee` policy add no allowance. Funding still applies when tax is disabled; zero employee BPJS gives zero allowance. Employer BPJS remains separate and is not part of this allowance.

### 8.4 Automatic PPh 21

Active tax requires the supported classification, domestic residency, ordinary regime, tax month, payment scope and BPJS identification described above. Permanent employees require a nonfinal month other than December; temporary employees must actually be paid monthly. Non-employees are limited to one plain service-fee payment at full gross without exclusions/sharing. Unsupported cases block payroll rather than fall back to a manual rate.

```text
basis_before_allowance = basic_salary
  + sum(taxable earning components)
  + bpjs_allowance
  + sum(employer BPJS contributions identified as kesehatan, jkk, or jkm)
```

Employer JHT/JP contributions do not enter this taxable basis. Taxable gross is distinct from reported payroll gross; taxable employer BPJS remains a separate employer cost, not a cash earning. Legacy `tax_basis`, `tax_rounding`, `pph_rate`, `pph_fixed_override`, and employee `pph_method` never affect automatic tax.

`C.tax` applies monthly TER for eligible employees or progressive Article 17 to 50% of a supported non-employee payment. Use exact arithmetic and floor only the final nonnegative tax to whole rupiah; this is a disclosed simulation assumption, not a universal statutory-rounding claim. See [tax sources and limitations](docs/TAX_RULES.md) for category rules.

- `gross`: `pph = tax(basis_before_allowance)`, `tax_allowance = 0`.
- `gross_up`: start allowance at zero and recalculate `tax(basis_before_allowance + allowance)`, reselecting bands until tax equals allowance exactly. No fixed-rate division or tolerance-based approximation; failure to converge or unsafe amounts block results.
- `net`: legacy, unsupported for active tax; direct users to `gross_up`.
- Tax disabled: `pph = tax_allowance = 0`, with BPJS allowance unaffected.

For supported payroll, `employee_tax_deduction = pph` and `employer_tax_cost = 0`. Only gross-up adds tax allowance to reported gross. The breakdown identifies automatic tax, formula, taxable basis, applicable band/category, tax month, and separate allowance/deduction amounts. Salary overrides remain active under §8.1; they are not tax overrides.

### 8.5 Take-Home Pay

```text
total_employee_deductions =
  employee_bpjs
  + employee_tax_deduction
  + other_employee_deductions

take_home_pay = gross_earnings - total_employee_deductions
```

Only company-funded BPJS shares offset their deductions; employee-funded shares reduce THP. PPh is offset by an equal allowance only under gross-up. When all employee BPJS shares and PPh are fully funded, THP simplifies to `gross_before_allowances - other_employee_deductions`. Allowance/deduction pairs do not create two cash increases.

### 8.6 Employer Cost

```text
employer_cost =
  gross_earnings
  + employer_bpjs
  + other_employer_contributions
```

Equivalently, `cost = gross + employer_bpjs + employer_contributions`, where `employer_contributions` means other employer contributions. Reported gross includes policy-funded BPJS allowance and any gross-up tax allowance exactly once. Employer BPJS remains a separate cost even where it also enters the taxable basis. Do not add employee BPJS or either allowance again; `employer_tax_cost` is zero for supported payroll (active `net` is blocked).

### 8.7 Increase Calculations

```text
change_amount = proposed_amount - current_amount
change_percentage = change_amount / current_amount * 100
```

Special cases:

- If current amount is zero and proposed amount is zero, display `0%`.
- If current amount is zero and proposed amount is positive, display `N/A` rather than infinity.
- Negative values must be displayed as decreases.

Organization-wide percentage change must use total amounts, not an average of employee percentages:

```text
organization_change_percentage =
  (sum(proposed) - sum(current)) / sum(current) * 100
```

## 9. CSV Persistence Model

### 9.1 General Requirements

- Encoding: UTF-8 with BOM on export for compatibility with Microsoft Excel.
- Delimiter: comma.
- Line endings: CRLF on export.
- Header row: required.
- Text containing commas, quotes, or line breaks must follow RFC 4180 quoting rules.
- Dates: ISO `YYYY-MM-DD`.
- Booleans: `true` or `false`.
- Money: integer rupiah without currency symbols or thousands separators.
- Rates: decimal fractions, for example `0.09` for 9%.
- Empty optional value: empty field.
- Record order must not affect calculations.

### 9.2 Workspace CSV

The complete workspace must be exportable as one CSV file. Because the workspace contains multiple record types, it uses a `record_type` discriminator and a stable superset of columns.

Required leading columns:

```text
schema_version,record_type,record_id
```

Required record types:

- `workspace`
- `matrix`
- `matrix_entry`
- `employee`
- `component_definition`
- `employee_component`
- `bpjs_rule`
- `global_rule`

The implementation must define one complete header containing every supported field. Fields irrelevant to a record type remain blank.

Example conceptual rows:

```csv
schema_version,record_type,record_id,name,scenario,employee_id,golongan,amount,rate
1,workspace,workspace-1,Simulasi MWS 2026/2027,,,,,
1,matrix,matrix-current,Matrix 2025/2026,current,,,,
1,matrix_entry,current-3-PM8,,current,,3-PM8,8455000,
1,employee,demo-001,Fictional Employee,,demo-001,,,
1,bpjs_rule,bpjs-kesehatan,BPJS Kesehatan,,,,,0.01
```

The final `CSV_FORMAT.md` created during implementation must specify every column, applicable record types, required fields, and examples.

### 9.3 Employee Import CSV

The app must also accept a simpler employee-only CSV so users can prepare employee data in Excel.

Required columns:

```text
employee_id,name,current_golongan
```

Optional columns:

```text
current_matrix_type,proposed_matrix_type,
unit,department,position,employment_status,join_date,active,
proposed_golongan,current_basic_override,proposed_basic_override,
ptkp_status,tax_category,tax_residency,tax_period_type,tax_payment_scope,
bpjs_kesehatan,bpjs_ketenagakerjaan,pph_method,pph_rate,pph_fixed_override,notes
```

`current_basic_override` and `proposed_basic_override` are active salary inputs, round-tripped in employee/workspace CSV with the precedence and warnings in §8.1. Manual PPh remains archival, not restored.

Schema 1 legacy workspace imports with absent headers migrate parent `matrix_type` and employee `current_matrix_type` to `regular`, `proposed_matrix_type` to blank, and `proposed_matrix_type_defaults_current` to true. This is compatibility migration, not inferred classification. A present but blank parent `matrix_type` is rejected; blank employee type may persist as an unfinished draft but blocks active payroll. Employee-only new/replacement records without the current-type header migrate to `regular`; partial updates preserve omitted fields, including types and overrides. New UI employees start unclassified. See `docs/CSV_FORMAT.md` for the exact stable headers.

`pph_method`, `pph_rate`, and `pph_fixed_override` remain archival employee/workspace CSV data, preserved during employee edits and round-trips but ignored by automatic tax. New employees default the archival method to `gross_up`; this does not select scenario policy. Omitted automatic-tax fields load blank, not inferred; existing-ID patches preserve omitted fields. Complete explicit classifications and tax settings before active calculation.

Import modes:

- Add only: reject employee IDs already present.
- Add and update: add new IDs and update existing IDs.
- Replace employees: remove current employee records after explicit confirmation, then import the file.

Before applying an import, show a preview containing:

- Rows to add
- Rows to update
- Rows with no change
- Rows rejected
- Validation messages

### 9.4 Matrix Import CSV

Required columns:

```text
scenario,golongan,basic_salary
```

Optional columns:

```text
matrix_type,matrix_name,effective_date,salary_group,professional_category,
kmk_level,note
```

`scenario` must be `current` or `proposed`. Matrix-only CSV exports include `matrix_type` immediately after `scenario`; the column is optional only for legacy imports (absent → `regular`, present blank → reject). Import upserts by `(scenario,matrix_type,golongan)`, preserving other types and rows absent from the file. Parent metadata must agree within each scenario/type. Workspace CSV stores `matrix_type` only on parent matrix rows; entries derive it through `matrix_id`.

### 9.5 Payroll Result CSV

The detailed result export must contain one row per employee and include:

```text
employee_id,name,unit,department,
current_golongan,proposed_golongan,
current_matrix_type,proposed_matrix_type,
current_basic_salary,proposed_basic_salary,basic_change,basic_change_percent,
current_gross,proposed_gross,gross_change,gross_change_percent,
current_employee_bpjs,proposed_employee_bpjs,
current_employer_bpjs,proposed_employer_bpjs,
current_pph,proposed_pph,
current_deductions,proposed_deductions,
current_take_home_pay,proposed_take_home_pay,thp_change,thp_change_percent,
current_employer_cost,proposed_employer_cost,employer_cost_change,
validation_status
```

Existing `current_gross` and `proposed_gross` columns include both BPJS and tax allowances. The new `bpjs_allowance` metric is shown in the breakdown and organization totals UI; no new result CSV column is planned.

A final totals row may be included with `employee_id` set to `TOTAL`.

## 10. Validation Rules

### 10.1 Blocking Errors

Calculation and result export must be blocked when any active employee has:

- Missing employee ID
- Duplicate employee ID
- Missing name
- Missing current Golongan
- Missing/invalid current type or unresolved proposed type, or no unique applicable scenario/type parent, even with a salary override
- Current or proposed basic salary unresolved: no explicit override and no unique typed matrix-cell match (type and Golongan fallbacks are independent)
- Invalid numeric input
- Active automatic tax with missing/unsupported classification, residency, period, payment scope, PTKP where required, tax month/year, regime, or BPJS tax-program identification
- Unconfirmed relevant active payment policy, or active PPh with unsupported legacy `net` policy
- Negative basic salary
- Duplicate parent for the same scenario/type, or duplicate entry for the same scenario/type/Golongan
- Invalid component formula
- Unknown referenced component
- Invalid BPJS minimum or maximum, including minimum greater than maximum

### 10.2 Warnings

Calculation may continue, but the UI must warn when:

- Proposed basic salary is lower than current basic salary
- Proposed take-home pay is lower than current take-home pay
- Golongan changes to another professional category, for example `M` to `PM`
- Golongan changes to another salary group, for example group `2` to group `3`
- Current or proposed basic salary override is nonblank (including zero or a matrix-equal value); warn that it is used
- A used basic salary override differs from the rounded matching matrix salary
- Legacy PPh method is `gross` or `net`; warn that it is archival and ignored in favor of scenario policy
- PPh is disabled or PTKP status is blank
- Employee is excluded from BPJS
- Employee component has a zero or negative value where unusual
- Employee import name differs for an existing employee ID
- Employee exists in the workspace but not in an imported update file
- An imported CSV uses an unsupported schema version

### 10.3 Confirmation-Required Operations

- Reset workspace
- Replace all employees
- Replace a matrix
- Delete a matrix used by employees
- Apply a bulk percentage change
- Change parent matrix scenario/type or copy the selected parent to the other scenario
- Bulk assign employee matrix type or equalize proposed Golongan for filtered employees
- Export results while warnings remain

## 11. User Experience Requirements

### 11.1 General

- The interface should be optimized for desktop screens but remain usable on a tablet.
- It must remain functional at a viewport width of 768 pixels.
- Large tables may scroll horizontally.
- Primary actions must use clear Indonesian labels.
- Monetary values must display as `Rp5.686.865` or another consistent Indonesian format.
- Input fields for money may accept separators but must normalize them safely.
- Percentage inputs should visibly distinguish `9` percent from decimal `0.09` storage.
- Keyboard navigation through tables and forms should be supported.
- Validation messages must identify the affected employee, matrix entry, or component.

### 11.2 Status Colors

- Increase: positive, restrained green
- No change: neutral gray
- Decrease: red
- Warning: amber
- Blocking error: red with clear text, not color alone
- Manual override: blue marker

### 11.3 Empty State

On first open, the page should show three clear options:

1. Buat workspace baru
2. Buka workspace CSV
3. Coba data contoh

Sample data must be fictional and must not include real employee or salary information.

### 11.4 Unsaved Work

- Any change sets the workspace state to dirty.
- Exporting the workspace marks the current state as saved.
- Importing a workspace marks the imported state as saved.
- The header must show `Belum disimpan` when dirty.
- Destructive actions must warn if the current workspace is dirty.

## 12. Privacy and Security Boundaries

Version 1 intentionally has no authentication. Therefore:

- The app must display a notice that anyone with access to the computer or CSV file can view the payroll data.
- The app must not transmit data over the network.
- No analytics, telemetry, remote fonts, or error reporting services are allowed.
- Real payroll workspace CSV files should not be committed to Git.
- Sample files must use fictional data.
- Sensitive fields not required for calculation, such as bank account and full NIK or NPWP, should not be collected in version 1.
- The UI should provide a `Hapus semua data dari layar` action.

## 13. Technical Architecture

### 13.1 State Model

The application should maintain one in-memory workspace object:

```javascript
const workspace = {
  schemaVersion: 1,
  metadata: {},
  matrices: [],
  matrixEntries: [],
  employees: [],
  componentDefinitions: [],
  employeeComponents: [],
  bpjsRules: [],
  globalRules: {}
};
```

UI code must not be the source of truth. User edits update the workspace state, validation derives issues from that state, and payroll calculations derive results from validated state.

### 13.2 Module Responsibilities

- `app.js`: application startup and event orchestration
- `state.js`: workspace state, dirty tracking, reset, and replacement
- `csv.js`: RFC 4180 parsing, validation, import preview, and export
- `matrix.js`: Golongan parsing, generation, matrix lookup, and percentage adjustment
- `tax.js`: pure automatic TER/progressive tax and exact gross-up; loaded before validation/payroll
- `payroll.js`: pure payroll calculations, taxable-gross composition and scenario-policy application
- `validation.js`: blocking errors and warnings
- `ui.js`: rendering, forms, tables, dialogs, filters, and notifications

The exact filenames may change, but concerns must remain separated.

### 13.3 Calculation Engine Contract

The payroll engine should be a pure function:

```javascript
function calculatePayroll(workspace) {
  return {
    employees: [],
    totals: {},
    issues: []
  };
}
```

It must not read directly from DOM elements, open files, display dialogs, or mutate the workspace.

### 13.4 File Compatibility

- All runtime paths must be relative.
- Filenames should use ASCII and contain no spaces where practical.
- The app must continue to work after the entire folder is copied or renamed.
- Chrome opening `index.html` from Finder must be a supported launch method.

## 14. Testing Requirements

### 14.1 Calculation Unit Tests

At minimum, verify:

- Unique lookup by scenario/type/Golongan; different types sharing a code remain isolated, duplicate scenario/type parents block
- Independent proposed type and Golongan fallbacks, always against the proposed scenario
- Explicit salary overrides (including zero) take precedence, blank returns to lookup, use/difference warnings appear, and unresolved type still blocks
- Custom type normalization and regex, legacy absent-header migration versus explicit blanks, and typed CSV round-trips
- Generation, editing, copying, adjustment and export do not modify other types or employee overrides
- Cascaded employee selectors and confirmed filtered bulk type assignment
- Fixed earning component
- Percentage-of-basic earning component
- Fixed deduction component
- BPJS minimum basis
- BPJS maximum basis
- Employee and employer BPJS separation, with unchanged participation and active/employee/employer enable flags
- `bpjs_allowance` equals only rounded company-funded employee BPJS shares, is included in gross, and offsets those shares in the retained full deduction; employee policy and zero contributions give no allowance
- BPJS allowance remains when tax is disabled; employer BPJS stays separate and cost includes each allowance only once
- BPJS allowance appears in the employee breakdown and organization totals UI
- Scenario gross versus gross-up behavior; active net and unconfirmed policies block
- Automatic TER boundaries and supported PTKP/category rules; progressive Article 17 on 50% of a single non-employee payment, including odd-rupiah gross
- Exact gross-up equality across band changes, zero tax, final floor-to-rupiah rounding, and safe-range/convergence guards
- Missing/unsupported classifications, years/months, residency, payment scopes, final periods, special regimes and unidentified BPJS programs block active tax
- Legacy tax rate, method, fixed override (including zero), basis and rounding are preserved but do not affect automatic results
- Tax disabled keeps PPh and tax allowance zero regardless of archives
- Gross-up tax allowance included in reported gross, equal earning/tax breakdown lines, and zero `employer_tax_cost` for supported payroll without double-counting
- BPJS contribution bases and percentage-gross components are calculated before both allowances, excluding them to avoid cycles
- Automatic taxable gross includes taxable earnings, funded BPJS allowance and employer kesehatan/JKK/JKM, excluding employer JHT/JP; legacy basis selection has no effect
- Take-home pay calculation under mixed company/employee BPJS policies and gross/gross-up tax policies
- Employer cost calculation
- Zero current value percentage behavior
- Negative salary change display
- Organization percentage calculated from totals
- Rounding at configured boundaries

Tests may use a browser-compatible test harness opened from a separate developer HTML file. End users must not need to run tests.

### 14.2 CSV Tests

- Exported workspace imports without data loss.
- Commas, quotes, and line breaks in text fields round-trip correctly.
- UTF-8 Indonesian names round-trip correctly.
- Excel can open exported CSV columns correctly.
- Duplicate employee IDs are reported.
- Unsupported schema versions are rejected safely.
- Import preview does not mutate current data before confirmation.

### 14.3 Browser Acceptance Tests

- Double-clicking `index.html` opens the app in Chrome.
- No console error occurs on initial load.
- App works with network disabled.
- A workspace can be created, exported, reset, and imported again.
- A payroll simulation can be completed without a server.
- The folder can be copied to another location and still works.
- Print summary is legible on A4 landscape.

## 15. Acceptance Criteria

Version 1 is acceptable when all conditions below are met:

1. A non-technical user can open `index.html` directly in Chrome without installing or starting anything.
2. The app runs fully offline and makes no network requests.
3. The user can create current and proposed salary matrices.
4. The user can import at least 500 employees from CSV without manual re-entry.
5. Employee updates are matched by employee ID.
6. The user can assign current and proposed Golongan.
7. The app resolves basic salary from a unique typed matrix cell unless an explicit scenario salary override is present. Overrides are editable, take precedence (including zero), and warn; they do not bypass required type/parent validation. Proposed type and Golongan fallbacks are independent and never use current salary.
8. The user can configure fixed and percentage-based earnings and deductions.
9. The app separately calculates employee BPJS and employer BPJS.
10. The app calculates an explicitly labeled PPh 21 estimate using configurable inputs.
11. The app calculates basic salary, gross earnings, take-home pay, and employer cost for current and proposed scenarios.
12. The app shows nominal and percentage changes per employee and for the whole organization.
13. Salary and take-home-pay decreases are clearly flagged.
14. The complete workspace can be exported to one CSV and imported later without losing supported data.
15. Detailed payroll results can be exported to CSV and opened in Excel.
16. No real payroll data is included in the repository or sample files.
17. Calculation tests cover all formulas listed in the testing section.

## 16. Implementation Stages

### Stage 1: Static Shell and Workspace

- Build `index.html` and local CSS/JavaScript loading.
- Implement navigation and in-memory workspace state.
- Implement dirty-state handling.
- Implement workspace CSV import/export.

### Stage 2: Matrix and Employees

- Implement matrix grid and list editors.
- Implement Golongan parsing and generation.
- Implement employee table and editor.
- Implement employee and matrix CSV imports with preview.
- Implement matrix-based basic salary resolution.

### Stage 3: Components and Rules

- Implement component definitions and assignments.
- Implement BPJS rules.
- Implement simplified PPh settings.
- Implement validation.

### Stage 4: Simulation and Reports

- Implement pure payroll calculation engine.
- Implement employee comparison and organization totals.
- Implement warnings, filters, and breakdown dialogs.
- Implement result CSV export and print summary.

### Stage 5: Verification and Documentation

- Add calculation and CSV tests.
- Verify offline `file://` operation in Chrome.
- Create fictional sample workspace.
- Create user guide and final CSV format reference.

## 17. Future Production-System Migration

The prototype should make later migration easier without adding production complexity now.

Reusable concepts:

- Stable employee IDs
- Versioned workspace schema
- Explicit matrix entries
- Configurable payroll components
- Separate employee and employer contributions
- Pure calculation engine
- Current and proposed scenario comparison
- Structured validation issues

Likely production changes:

- Replace CSV persistence with a database and API.
- Add authentication, roles, and approval workflows.
- Add immutable payroll periods and audit history.
- Replace simplified PPh estimation with verified statutory calculations.
- Add attendance, payslip, bank, accounting, and reporting integrations.

The first version must not imitate production security or compliance. It should instead make its limitations clear while producing transparent, testable salary simulations.

## August 2026 private conversion limitations

`tools/build_august_workspace.py` builds an evidence-based private draft, not an authoritative full Admin scale. The private audit is exactly `private/mws-agustus-2026-audit.json`. It records four matrices: current regular **300 cells**, proposed regular **300 cells**, current admin **one confirmed payroll cell only**, and proposed admin **60 cached source cells for KG 3 only**. No authoritative current-admin sheet is available; do not extrapolate missing cells or regenerate Admin as a full 300-cell scale. Proposed Admin source cells take precedence over a generic generator where they differ.

Conversion classification uses explicit confirmed policy exceptions or same-Golongan salary evidence: regular exact/nearest-thousand matches versus confirmed current-admin exact matches. Ambiguous or unmatched cases remain blank; position alone is not evidence. This offline evidence matching is not runtime inference. Explicit current salary overrides preserve actual payroll where necessary. A confirmed regular-policy exception retains explicit current and legacy proposed salary overrides pending policy verification, without reclassifying the employee as admin; manual tax is not restored.

**One private classification remains unresolved. The conversion generator is blocked at core payroll validation and cannot export final results until that classification is confirmed and all blocking errors are resolved.** Draft workspace and audit persistence do not imply final payroll readiness; partial resolved subtotals are not final results. August PPh is disabled because there is no employee PPh source column; actual BPJS is represented by manual components, proposed non-basic components/deductions remain at August values, and cached THP discrepancies are retained for review rather than patched. Keep individual identities, evidence and real amounts only in private files, never tracked documentation.

## 18. Open Decisions Before Implementation

The following decisions should be confirmed before coding the relevant modules:

1. Which 2026/2027 matrix variant is authoritative when multiple sheets or options exist?
2. Confirm unresolved organization-specific type assignments and missing authoritative Admin cells. Admin is an explicitly assigned matrix type, never inferred at runtime from position text.
3. Which allowances are fixed, percentage-based, taxable, and included in each BPJS basis?
4. Which current BPJS rates, wage limits, and rounding rules should be preloaded as defaults?
5. Confirm organization-specific automatic-tax eligibility and source classifications; any expansion beyond the supported tax scope requires separate verified rules, not manual PPh inputs.
6. Which employee fields and component names from the existing payroll spreadsheet should be included in the initial CSV conversion template?

These decisions do not block building the static shell, matrix editor, employee import, workspace persistence, or core comparison engine.
