from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import openpyxl


ROOT = Path(__file__).resolve().parent.parent
WORKBOOK_PATH = ROOT / "college_draft.xlsx"
OUTPUT_PATH = ROOT / "data" / "players.json"


def to_int(value: Any) -> int | None:
    if value in (None, ""):
        return None
    return int(value)


def to_float(value: Any) -> float | None:
    if value in (None, ""):
        return None
    return float(value)


def main() -> None:
    workbook = openpyxl.load_workbook(WORKBOOK_PATH, data_only=True)
    worksheet = workbook[workbook.sheetnames[0]]

    headers = [str(cell) for cell in next(worksheet.iter_rows(min_row=1, max_row=1, values_only=True))]
    rows = []

    for values in worksheet.iter_rows(min_row=2, values_only=True):
        row = dict(zip(headers, values))
        name = row.get("Player")
        if not name:
            continue

        rows.append(
            {
                "rank": to_int(row.get("Rk")),
                "name": str(name).strip(),
                "season": row.get("Season"),
                "team": row.get("Team"),
                "position": row.get("Pos"),
                "playerClass": row.get("Class"),
                "games": to_int(row.get("G")),
                "totals": {
                    "points": to_int(row.get("PTS")),
                    "rebounds": to_int(row.get("TRB")),
                    "assists": to_int(row.get("AST")),
                },
                "perGame": {
                    "points": to_float(row.get("PTS/Game")),
                    "rebounds": to_float(row.get("REB/Game")),
                    "assists": to_float(row.get("AST/Game")),
                },
                "heightInches": to_int(row.get("Height")),
                "weightLbs": to_int(row.get("Weight")),
            }
        )

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(
        json.dumps(
            {
                "sourceWorkbook": WORKBOOK_PATH.name,
                "playerCount": len(rows),
                "players": rows,
            },
            indent=2,
        )
    )

    print(f"Wrote {len(rows)} players to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
