# Caroll Payroll Simulator Specification

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
- Current salary manual override when it differs from the matrix
- Fixed and percentage-based earnings and deductions
- BPJS employee and employer contribution rules
- Simplified configurable PPh 21 calculation
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

Purpose: Define current and proposed basic salary by Golongan.

Required controls:

- Select matrix: Current or Proposed
- Add matrix entry
- Edit matrix entry
- Delete matrix entry
- Duplicate current matrix into proposed matrix
- Apply percentage increase
- Import matrix rows from CSV
- Export visible matrix as CSV

Required fields per entry:

- Matrix identifier
- Matrix name
- Period or effective date
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
- Proposed Golongan, optional; defaults to current Golongan
- Current basic salary override, optional
- Proposed basic salary override, optional
- PTKP status
- BPJS Kesehatan participation flag
- BPJS Ketenagakerjaan participation flag
- PPh calculation method
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
- Show matrix-derived current and proposed basic salary
- Flag overrides and missing matrix entries

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

Version 1 uses a simplified, configurable monthly tax model rather than claiming full statutory compliance.

- Tax enabled flag
- Calculation method per employee: gross, net, or gross-up
- Taxable income basis
- PTKP status
- Monthly effective rate or manually assigned percentage
- Optional fixed monthly tax override
- Rounding mode

Required behavior:

- Gross: PPh is deducted from employee take-home pay.
- Net: PPh is paid by the employer and does not reduce take-home pay.
- Gross-up: a tax allowance is added to earnings and an equal tax amount is deducted.
- A manual tax amount overrides the calculated amount and must be marked in the breakdown.

The interface must label this module `Estimasi PPh 21` until the rules are reviewed and approved by a qualified Indonesian payroll or tax specialist.

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
- Manual overrides
- By unit or department

Selecting an employee opens a detailed calculation breakdown for current and proposed scenarios.

## 8. Calculation Definitions

### 8.1 Basic Salary

Current basic salary is resolved in this order:

1. Employee current basic salary override, if present.
2. Current matrix amount matching current Golongan.
3. Blocking error if neither exists.

Proposed basic salary is resolved in this order:

1. Employee proposed basic salary override, if present.
2. Proposed matrix amount matching proposed Golongan.
3. If proposed Golongan is blank, use current Golongan when the global default is enabled.
4. Blocking error if no amount can be resolved.

### 8.2 Earnings

For each scenario:

```text
gross_earnings = basic_salary + sum(earning_components)
```

Supported component formulas:

```text
fixed_amount = configured rupiah amount
percentage_of_basic = basic_salary * rate
percentage_of_gross_basis = selected gross basis * rate
manual_amount = employee-specific rupiah amount
```

Circular formulas are not permitted. A percentage-of-gross component must use a clearly defined pre-tax gross basis and cannot include itself.

### 8.3 BPJS

For each active BPJS program:

```text
raw_basis = amount determined by the program basis selection
capped_basis = min(max(raw_basis, minimum_basis), maximum_basis)
employee_contribution = capped_basis * employee_rate
employer_contribution = capped_basis * employer_rate
```

If a minimum or maximum is blank, that bound is not applied.

Totals:

```text
employee_bpjs = sum(employee contributions)
employer_bpjs = sum(employer contributions)
```

### 8.4 PPh 21 Estimate

For the simplified percentage model:

```text
estimated_tax = taxable_income_basis * employee_tax_rate
```

If a fixed manual tax override exists, it replaces `estimated_tax`.

Treatment by method:

```text
gross:
  employee_tax_deduction = estimated_tax
  employer_tax_cost = 0
  tax_allowance = 0

net:
  employee_tax_deduction = 0
  employer_tax_cost = estimated_tax
  tax_allowance = 0

gross_up:
  tax_allowance = estimated_tax
  employee_tax_deduction = estimated_tax
  employer_tax_cost = 0
```

For gross-up, `tax_allowance` represents the employer-funded tax cost. It must not also be recorded as `employer_tax_cost`. This simplified gross-up behavior is acceptable for the prototype but must be revisited if iterative statutory gross-up calculations are required.

### 8.5 Take-Home Pay

```text
total_employee_deductions =
  employee_bpjs
  + employee_tax_deduction
  + other_employee_deductions

take_home_pay =
  gross_earnings
  + tax_allowance
  - total_employee_deductions
```

### 8.6 Employer Cost

```text
employer_cost =
  gross_earnings
  + tax_allowance
  + employer_bpjs
  + other_employer_contributions
  + employer_tax_cost
```

For net tax, `employer_tax_cost` contains the tax paid directly by the employer. For gross-up tax, `tax_allowance` contains the employer-funded amount and `employer_tax_cost` is zero. This prevents tax from being counted twice.

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
1,employee,12.02.062,Abu Bakar Ali,,12.02.062,,,
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
unit,department,position,employment_status,join_date,active,
proposed_golongan,current_basic_override,proposed_basic_override,
ptkp_status,bpjs_kesehatan,bpjs_ketenagakerjaan,pph_method,
pph_rate,pph_fixed_override,notes
```

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
matrix_name,effective_date,salary_group,professional_category,
kmk_level,note
```

`scenario` must be `current` or `proposed`.

### 9.5 Payroll Result CSV

The detailed result export must contain one row per employee and include:

```text
employee_id,name,unit,department,
current_golongan,proposed_golongan,
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

A final totals row may be included with `employee_id` set to `TOTAL`.

## 10. Validation Rules

### 10.1 Blocking Errors

Calculation and result export must be blocked when any active employee has:

- Missing employee ID
- Duplicate employee ID
- Missing name
- Missing current Golongan
- Current basic salary unresolved
- Proposed basic salary unresolved
- Invalid numeric input
- Negative basic salary
- Duplicate matrix entry for the same scenario and Golongan
- Invalid component formula
- Unknown referenced component
- Invalid BPJS minimum or maximum, including minimum greater than maximum

### 10.2 Warnings

Calculation may continue, but the UI must warn when:

- Proposed basic salary is lower than current basic salary
- Proposed take-home pay is lower than current take-home pay
- Golongan changes to another professional category, for example `M` to `PM`
- Golongan changes to another salary group, for example group `2` to group `3`
- Current basic salary override differs from current matrix salary
- Proposed basic salary override differs from proposed matrix salary
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
- `payroll.js`: pure payroll calculations
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

- Matrix lookup by Golongan
- Current and proposed salary overrides
- Fixed earning component
- Percentage-of-basic earning component
- Fixed deduction component
- BPJS minimum basis
- BPJS maximum basis
- Employee and employer BPJS separation
- Gross PPh method
- Net PPh method
- Gross-up PPh method
- Take-home pay calculation
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
7. The app resolves basic salary from the applicable matrix or a visible override.
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

## 18. Open Decisions Before Implementation

The following decisions should be confirmed before coding the relevant modules:

1. Which 2026/2027 matrix variant is authoritative when multiple sheets or options exist?
2. Should Group 3 Admin use a separate matrix for every employee whose position contains `Admin`, or only for an explicitly assigned matrix category?
3. Which allowances are fixed, percentage-based, taxable, and included in each BPJS basis?
4. Which current BPJS rates, wage limits, and rounding rules should be preloaded as defaults?
5. Is simplified manual PPh input sufficient for the first usable release, or must TER categories be included immediately?
6. Should current salary always come from the current matrix, or should imported payroll salary automatically become an override when different?
7. Which employee fields and component names from the existing payroll spreadsheet should be included in the initial CSV conversion template?

These decisions do not block building the static shell, matrix editor, employee import, workspace persistence, or core comparison engine.
