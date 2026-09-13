#!/usr/bin/env python3
"""Build a private Caroll workspace from the August 2026 MWS payroll files."""

from __future__ import annotations

import argparse
import csv
import json
import re
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from openpyxl import load_workbook
from openpyxl.utils import column_index_from_string


WORKSPACE_HEADERS = [
    "schema_version", "record_type", "record_id", "name", "current_period",
    "proposed_period", "matrix_id", "scenario", "effective_date", "salary_group",
    "professional_category", "kmk_level", "golongan", "basic_salary", "note",
    "employee_id", "current_golongan", "unit", "department", "position",
    "employment_status", "join_date", "active", "proposed_golongan",
    "current_basic_override", "proposed_basic_override", "ptkp_status",
    "bpjs_kesehatan", "bpjs_ketenagakerjaan", "pph_method", "pph_rate",
    "pph_fixed_override", "notes", "code", "category", "direction",
    "calculation_type", "default_value", "taxable", "applies_current",
    "applies_proposed", "rounding", "component_code", "current_value",
    "proposed_value", "employee_rate", "employer_rate", "minimum_basis",
    "maximum_basis", "basis", "employee_enabled", "employer_enabled", "currency",
    "percentage_precision", "include_inactive", "allow_negative_thp",
    "proposed_defaults_current", "tax_enabled", "tax_basis", "tax_rounding",
]

COMPONENTS = [
    ("TUNJ_STRUKTURAL", "Tunjangan struktural", "earning", "P"),
    ("TUNJ_FUNGSIONAL", "Tunjangan fungsional", "earning", "U"),
    ("TRANSPORT", "Transport", "earning", "V"),
    ("KETEPATAN_WAKTU", "Ketepatan waktu", "earning", "W"),
    ("TUNJ_PASANGAN", "Tunjangan pasangan", "earning", "Z"),
    ("TUNJ_ANAK", "Tunjangan anak", "earning", "AC"),
    ("KOREKSI", "Koreksi payroll", "earning", "AF"),
    ("TUNJ_ASURANSI", "Tunjangan asuransi", "earning", "AG"),
    ("TUNJ_TELEPON", "Tunjangan telepon", "earning", "AH"),
    ("TUNJ_BENSIN", "Tunjangan bensin", "earning", "AI"),
    ("SERVICE_KENDARAAN", "Service kendaraan", "earning", "AJ"),
    ("WFH", "Tunjangan WFH", "earning", "AK"),
    ("LEMBUR", "Lembur", "earning", "AM"),
    ("INHEALTH", "Potongan InHealth", "employee_deduction", "AX"),
    ("BPJS_TK_KARYAWAN", "BPJS TK karyawan (aktual Agustus)", "employee_deduction", "AY"),
    ("TOKO_LAZMART", "Toko LazMart", "employee_deduction", "BA"),
    ("U_SEK", "U-Sek", "employee_deduction", "BB"),
    ("CASHBON", "Cashbon", "employee_deduction", "BC"),
    ("POTONGAN_LAIN", "Potongan lain-lain", "employee_deduction", "BD"),
    ("SHARING_CARE", "Sharing & Care", "employee_deduction", "BF"),
    ("SEDEKAH", "Sedekah", "employee_deduction", "BG"),
    ("ZAKAT_SEDEKAH", "Zakat / sedekah tambahan", "employee_deduction", "BL"),
]


def money(value: object) -> int:
    if value in (None, ""):
        return 0
    if isinstance(value, bool):
        raise ValueError("Boolean is not a monetary value")
    return int(Decimal(str(value)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def matrix_money(value: object, rounding: int) -> int:
    amount = Decimal(str(value)) * Decimal("1000")
    step = Decimal(str(rounding))
    return int((amount / step).quantize(Decimal("1"), rounding=ROUND_HALF_UP) * step)


def normalize_name(value: object) -> str:
    base = str(value or "").lower().split(",", 1)[0]
    return re.sub(r"[^a-z0-9]", "", base)


def parse_golongan(code: str) -> tuple[str, str, int]:
    match = re.fullmatch(r"(\d+)-([A-Za-z]+)(\d+)", str(code).strip())
    if not match:
        raise ValueError(f"Invalid Golongan: {code}")
    return str(int(match.group(1))), match.group(2).upper(), int(match.group(3))


def empty_row(record_type: str, record_id: str) -> dict[str, object]:
    row = {header: "" for header in WORKSPACE_HEADERS}
    row.update(schema_version=1, record_type=record_type, record_id=record_id)
    return row


def matrix_lookup(workbook, sheet_name: str, first_data_row: int, rounding: int) -> dict[str, int]:
    sheet = workbook[sheet_name]
    lookup: dict[str, int] = {}
    for group, start_column in enumerate((3, 9, 15, 21, 27), start=1):
        for kmk in range(1, 16):
            for category, offset in (("PM", 0), ("P", 1), ("M", 2), ("U", 3)):
                value = sheet.cell(first_data_row + kmk - 1, start_column + offset).value
                if isinstance(value, (int, float, Decimal)):
                    lookup[f"{group}-{category}{kmk}"] = matrix_money(value, rounding)
    return lookup


def calculated_golongan(source_path: Path) -> dict[str, str]:
    sheet = load_workbook(source_path, read_only=True, data_only=True)[" MWS No Covid-izar"]
    lookup: dict[str, str] = {}
    for row in sheet.iter_rows(min_row=2, max_row=840, min_col=1, max_col=14, values_only=True):
        name, calculated = row[0], row[13]
        if name and calculated:
            lookup[normalize_name(name)] = str(calculated).strip()
    return lookup


def bpjs_employer_lookup(payroll_book) -> dict[str, int]:
    """Read the employer BPJS amount from the same BPJSTK sheet used by payroll."""
    sheet = payroll_book["BPJSTK"]
    lookup: dict[str, int] = {}
    for row in sheet.iter_rows(min_row=4, max_row=172, min_col=1, max_col=13, values_only=True):
        employee_id = row[1]
        employer_amount = row[11]
        if employee_id and isinstance(employer_amount, (int, float)):
            lookup[str(employee_id).strip()] = money(employer_amount)
    return lookup


def build(args: argparse.Namespace) -> dict[str, object]:
    payroll_book = load_workbook(args.payroll, read_only=True, data_only=True)
    payroll_sheet = payroll_book["0826 MWS"]
    matrix_book = load_workbook(args.matrix, read_only=True, data_only=True)
    current_matrix = matrix_lookup(matrix_book, "Matrix MWS 25_26", 12, 1000)
    proposed_matrix = matrix_lookup(matrix_book, "Draft Matrix MWS 26_27 Penyesua", 13, 1)
    admin_matrix = matrix_lookup(matrix_book, "KG 3 Admin", 13, 1)
    calculated = calculated_golongan(args.kmk)
    employer_bpjs = bpjs_employer_lookup(payroll_book)

    rows: list[dict[str, object]] = []
    row = empty_row("workspace", "workspace")
    row.update(name="MWS Payroll Agustus 2026 - Simulasi TA 2026/2027", current_period="Agustus 2026", proposed_period="TA 2026/2027")
    rows.append(row)

    for scenario, matrix_id, name, effective_date in (
        ("current", "mws-2025-2026", "Matrix MWS 2025/2026", "2025-07-01"),
        ("proposed", "mws-2026-2027", "Draft Matrix MWS 2026/2027 Penyesuaian", "2026-07-01"),
    ):
        row = empty_row("matrix", matrix_id)
        row.update(matrix_id=matrix_id, name=name, scenario=scenario, effective_date=effective_date)
        rows.append(row)

    for scenario, matrix_id, entries, note in (
        ("current", "mws-2025-2026", current_matrix, "Converted from source matrix units and rounded to the Rp1,000 used by August payroll"),
        ("proposed", "mws-2026-2027", proposed_matrix, "Converted from source matrix units and rounded to nearest rupiah"),
    ):
        for code, salary in sorted(entries.items(), key=lambda item: parse_golongan(item[0])):
            group, category, kmk = parse_golongan(code)
            row = empty_row("matrix_entry", f"{scenario}:{code}")
            row.update(matrix_id=matrix_id, scenario=scenario, salary_group=group,
                       professional_category=category, kmk_level=kmk, golongan=code,
                       basic_salary=salary, note=note)
            rows.append(row)

    for code, name, direction, _column in COMPONENTS:
        row = empty_row("component_definition", code)
        row.update(code=code, name=name, category="Imported August payroll", direction=direction,
                   calculation_type="manual", default_value="", taxable=direction == "earning",
                   bpjs_kesehatan=False, bpjs_ketenagakerjaan=False,
                   applies_current=True, applies_proposed=True, active=True, rounding=1,
                   notes="Imported cached amount from mws Gaji Agustus 2026(1).xlsx")
        rows.append(row)

    row = empty_row("component_definition", "BPJS_TK_PEMBERI_KERJA")
    row.update(code="BPJS_TK_PEMBERI_KERJA", name="BPJS TK pemberi kerja (aktual Agustus)",
               category="Imported August payroll", direction="employer_contribution",
               calculation_type="manual", default_value="", taxable=False,
               bpjs_kesehatan=False, bpjs_ketenagakerjaan=False,
               applies_current=True, applies_proposed=True, active=True, rounding=1,
               notes="Imported from BPJSTK employer contribution column; not a native Caroll BPJS rule")
    rows.append(row)

    employees: list[dict[str, object]] = []
    assignments: list[dict[str, object]] = []
    audit_employees: list[dict[str, object]] = []
    component_columns = {code: column for code, _name, _direction, column in COMPONENTS}
    first_column = column_index_from_string("C")
    last_column = column_index_from_string("BM")
    column_offset = {
        column: column_index_from_string(column) - first_column
        for column in {"C", "D", "H", "I", "M", "N", "AE", "AN", "BJ", "BL", "BM", *component_columns.values()}
    }
    for excel_row, values in enumerate(
        payroll_sheet.iter_rows(min_row=7, max_row=1000, min_col=first_column,
                                max_col=last_column, values_only=True),
        start=7,
    ):
        value = lambda column: values[column_offset[column]]
        employee_id = value("C")
        employee_name = value("D")
        current_code = value("M")
        current_basic = value("N")
        if not (employee_id and employee_name and current_code and isinstance(current_basic, (int, float))):
            continue
        employee_id = str(employee_id).strip()
        employee_name = str(employee_name).strip()
        current_code = str(current_code).strip()
        proposed_code = calculated.get(normalize_name(employee_name), current_code)
        if proposed_code not in proposed_matrix:
            proposed_code = current_code

        role = str(value("I") or "").strip()
        proposed_override: object = ""
        override_reason = ""
        if "admin" in role.lower() and proposed_code.startswith("3-") and proposed_code in admin_matrix:
            proposed_override = admin_matrix[proposed_code]
            override_reason = "Uses separate KG 3 Admin matrix, represented as an employee override because Caroll supports one matrix per scenario."

        current_actual = money(current_basic)
        current_matrix_salary = current_matrix.get(current_code)
        current_override: object = "" if current_matrix_salary == current_actual else current_actual
        if current_override != "":
            override_reason = (override_reason + " " if override_reason else "") + "Current payroll basic differs from rounded current matrix."

        employee = empty_row("employee", employee_id)
        employee.update(
            employee_id=employee_id,
            name=employee_name,
            current_golongan=current_code,
            proposed_golongan=proposed_code,
            unit="MWS",
            department=str(value("H") or "").strip(),
            position=role,
            employment_status="",
            join_date="",
            active=True,
            current_basic_override=current_override,
            proposed_basic_override=proposed_override,
            ptkp_status=str(value("AE") or "").strip(),
            bpjs_kesehatan=True,
            bpjs_ketenagakerjaan=True,
            pph_method="gross",
            pph_rate=0,
            pph_fixed_override="",
            notes=override_reason,
        )
        employees.append(employee)

        earning_total = 0
        deduction_total = 0
        for component_code, column in component_columns.items():
            amount = money(value(column))
            if amount == 0:
                continue
            assignment = empty_row("employee_component", f"{employee_id}:{component_code}")
            assignment.update(employee_id=employee_id, component_code=component_code,
                              current_value=amount, proposed_value=amount)
            assignments.append(assignment)
            direction = next(item[2] for item in COMPONENTS if item[0] == component_code)
            if direction == "earning":
                earning_total += amount
            else:
                deduction_total += amount

        employer_amount = employer_bpjs.get(employee_id, 0)
        if employer_amount:
            assignment = empty_row("employee_component", f"{employee_id}:BPJS_TK_PEMBERI_KERJA")
            assignment.update(employee_id=employee_id, component_code="BPJS_TK_PEMBERI_KERJA",
                              current_value=employer_amount, proposed_value=employer_amount)
            assignments.append(assignment)

        source_gross = money(value("AN"))
        source_deductions = money(value("BJ")) + money(value("BL"))
        source_thp = money(value("BM"))
        audit_employees.append({
            "employee_id": employee_id,
            "name": employee_name,
            "current_golongan": current_code,
            "proposed_golongan": proposed_code,
            "source_basic": current_actual,
            "mapped_basic": current_actual if current_override != "" else current_matrix_salary,
            "source_gross": source_gross,
            "mapped_gross": current_actual + earning_total,
            "source_deductions": source_deductions,
            "mapped_deductions": deduction_total,
            "source_thp": source_thp,
            "mapped_thp": current_actual + earning_total - deduction_total,
            "employer_bpjs": employer_amount,
            "uses_admin_override": proposed_override != "",
        })

    rows.extend(employees)
    rows.extend(assignments)

    global_row = empty_row("global_rule", "global_rule")
    global_row.update(currency="IDR", rounding=1, percentage_precision=2,
                      include_inactive=False, allow_negative_thp=False,
                      proposed_defaults_current=True, tax_enabled=False,
                      tax_basis="taxable", tax_rounding=1)
    rows.append(global_row)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=WORKSPACE_HEADERS, lineterminator="\r\n")
        writer.writeheader()
        writer.writerows(rows)

    mismatches = []
    for employee in audit_employees:
        for metric in ("basic", "gross", "deductions", "thp"):
            if employee[f"source_{metric}"] != employee[f"mapped_{metric}"]:
                mismatches.append({
                    "employee_id": employee["employee_id"],
                    "name": employee["name"],
                    "metric": metric,
                    "source": employee[f"source_{metric}"],
                    "mapped": employee[f"mapped_{metric}"],
                    "difference": employee[f"mapped_{metric}"] - employee[f"source_{metric}"],
                })

    totals = {}
    for metric in ("basic", "gross", "deductions", "thp"):
        totals[metric] = {
            "source": sum(employee[f"source_{metric}"] for employee in audit_employees),
            "mapped": sum(employee[f"mapped_{metric}"] for employee in audit_employees),
        }
        totals[metric]["difference"] = totals[metric]["mapped"] - totals[metric]["source"]

    report = {
        "workspace_csv": str(args.output),
        "employee_count": len(employees),
        "current_matrix_entries": len(current_matrix),
        "proposed_matrix_entries": len(proposed_matrix),
        "calculated_golongan_matches": sum(1 for employee in audit_employees if employee["current_golongan"] != employee["proposed_golongan"]),
        "admin_matrix_overrides": sum(1 for employee in audit_employees if employee["uses_admin_override"]),
        "component_assignments": len(assignments),
        "totals": totals,
        "mismatches": mismatches,
        "limitations": [
            "PPh 21 is disabled because the August payroll sheet has no employee PPh column to import.",
            "Actual employee and employer BPJS are imported as manual payroll components because Caroll has no per-employee BPJS amount or wage-basis override.",
            "The separate KG 3 Admin matrix is represented with proposed employee salary overrides because Caroll permits only one matrix per scenario.",
            "Proposed non-basic components and deductions are held equal to August values; only matrix/Golongan-driven basic salary changes in the projection.",
        ],
    }
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--payroll", type=Path, required=True)
    parser.add_argument("--kmk", type=Path, required=True)
    parser.add_argument("--matrix", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--report", type=Path, required=True)
    args = parser.parse_args()
    report = build(args)
    print(json.dumps(report, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
