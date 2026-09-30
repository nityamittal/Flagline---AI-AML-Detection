"""Sample the IBM AML HI-Small files into the demo data Flagline ships with.

Run once locally (see PLAN.md, "Data"):

    pip install pandas
    python scripts/sample_data.py

Reads   data/raw/HI-Small_Trans.csv and data/raw/HI-Small_Patterns.txt
Writes  data/demo.csv       upload file, no labels
        data/labels.csv     external_id, is_laundering, typology
        data/fx_rates.json  fixed, approximate USD rates per currency

Sampling is by account, not by date, so every chosen laundering attempt stays
whole: patterns run over days to weeks and a date window would cut them.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data"

TYPOLOGIES = [
    "FAN-OUT",
    "FAN-IN",
    "CYCLE",
    "STACK",
    "SCATTER-GATHER",
    "GATHER-SCATTER",
    "BIPARTITE",
    "RANDOM",
]

# Fixed, approximate USD value of one unit of each currency (mid-2022, rounded).
# Labeled approximate everywhere it is shown; good enough to compare amounts
# across currencies, not for accounting.
FX_RATES_USD = {
    "US Dollar": 1.0,
    "Euro": 1.05,
    "UK Pound": 1.21,
    "Swiss Franc": 1.04,
    "Canadian Dollar": 0.77,
    "Australian Dollar": 0.69,
    "Yuan": 0.149,
    "Yen": 0.0073,
    "Rupee": 0.0126,
    "Ruble": 0.0165,
    "Mexican Peso": 0.050,
    "Brazil Real": 0.19,
    "Saudi Riyal": 0.266,
    "Shekel": 0.29,
    "Bitcoin": 20000.0,
}

# Headers as they appear in HI-Small_Trans.csv. The file repeats "Account";
# we name the columns ourselves so both sides are explicit.
TRANS_COLUMNS = [
    "Timestamp",
    "From Bank",
    "From Account",
    "To Bank",
    "To Account",
    "Amount Received",
    "Receiving Currency",
    "Amount Paid",
    "Payment Currency",
    "Payment Format",
    "Is Laundering",
]

# Columns that identify one transaction when matching Patterns.txt to Trans.csv.
MATCH_KEY = [
    "Timestamp",
    "From Bank",
    "From Account",
    "To Bank",
    "To Account",
    "Amount Paid",
    "Payment Currency",
]


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--trans", type=Path, default=RAW / "HI-Small_Trans.csv")
    p.add_argument("--patterns", type=Path, default=RAW / "HI-Small_Patterns.txt")
    p.add_argument("--out", type=Path, default=OUT)
    p.add_argument("--per-typology", type=int, default=5, help="attempts to keep per typology")
    p.add_argument("--target-rows", type=int, default=20_000, help="stop adding background accounts near this")
    p.add_argument(
        "--pattern-budget",
        type=float,
        default=0.6,
        help="max share of target rows the attempt accounts may use, so a hub account cannot eat the sample",
    )
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def load_trans(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path, dtype=str, header=0, names=TRANS_COLUMNS)
    # Row number in the source file is the stable external id.
    df.insert(0, "external_id", range(1, len(df) + 1))
    df["from_account"] = df["From Bank"] + "-" + df["From Account"]
    df["to_account"] = df["To Bank"] + "-" + df["To Account"]
    return df


def parse_patterns(path: Path) -> pd.DataFrame:
    """Return one row per pattern transaction with attempt_id and typology."""
    rows: list[list[str]] = []
    attempt_id = -1
    typology: str | None = None
    with path.open() as f:
        for raw in f:
            line = raw.strip()
            if not line:
                continue
            if line.startswith("BEGIN LAUNDERING ATTEMPT"):
                # e.g. "BEGIN LAUNDERING ATTEMPT - FAN-OUT:  Max 16-degree Fan-Out"
                attempt_id += 1
                typology = line.split(" - ", 1)[1].split(":", 1)[0].strip().upper()
                continue
            if line.startswith("END LAUNDERING ATTEMPT"):
                typology = None
                continue
            if typology is None:
                continue
            fields = [x.strip() for x in line.split(",")]
            if len(fields) != len(TRANS_COLUMNS):
                print(f"skipping malformed pattern line: {line!r}", file=sys.stderr)
                continue
            rows.append([str(attempt_id), typology, *fields])
    df = pd.DataFrame(rows, columns=["attempt_id", "typology", *TRANS_COLUMNS])
    df["attempt_id"] = df["attempt_id"].astype(int)
    df["from_account"] = df["From Bank"] + "-" + df["From Account"]
    df["to_account"] = df["To Bank"] + "-" + df["To Account"]
    return df


def rows_touching(trans: pd.DataFrame, accounts: set[str]) -> pd.Series:
    return trans["from_account"].isin(accounts) | trans["to_account"].isin(accounts)


def main() -> None:
    args = parse_args()
    rng = random.Random(args.seed)

    for path in (args.trans, args.patterns):
        if not path.exists():
            sys.exit(f"missing {path}. Download it from the IBM AML Kaggle dataset into data/raw/.")

    trans = load_trans(args.trans)
    patterns = parse_patterns(args.patterns)
    print(f"loaded {len(trans):,} transactions and {patterns['attempt_id'].nunique():,} attempts")

    # Index each account's rows once so budget checks are cheap.
    by_from = trans.groupby("from_account").indices
    by_to = trans.groupby("to_account").indices

    def row_ids(accounts: set[str]) -> set[int]:
        ids: set[int] = set()
        for a in accounts:
            ids.update(by_from.get(a, ()))
            ids.update(by_to.get(a, ()))
        return ids

    # 1. Pick about N attempts per typology, keeping attempt accounts under budget.
    budget = int(args.target_rows * args.pattern_budget)
    per_typology_cap = budget // len(TYPOLOGIES)
    chosen: list[int] = []
    kept: set[int] = set()
    chosen_accounts: set[str] = set()
    for typ in TYPOLOGIES:
        attempts = sorted(patterns.loc[patterns["typology"] == typ, "attempt_id"].unique())
        rng.shuffle(attempts)
        used = 0
        typ_kept = 0
        for aid in attempts:
            if typ_kept >= args.per_typology:
                break
            att = patterns[patterns["attempt_id"] == aid]
            accounts = set(att["from_account"]) | set(att["to_account"])
            new_ids = row_ids(accounts) - kept
            if used + len(new_ids) > per_typology_cap:
                continue  # a hub account would swamp the sample; try another attempt
            chosen.append(int(aid))
            kept |= new_ids
            chosen_accounts |= accounts
            used += len(new_ids)
            typ_kept += 1

    # 2. Add every transaction of random other accounts until near the target.
    all_accounts = sorted(set(trans["from_account"]) | set(trans["to_account"]))
    rng.shuffle(all_accounts)
    background = 0
    for acct in all_accounts:
        if len(kept) >= args.target_rows:
            break
        if acct in chosen_accounts:
            continue
        new_ids = row_ids({acct}) - kept
        if len(kept) + len(new_ids) > args.target_rows * 1.05:
            continue
        kept |= new_ids
        background += 1

    sample = trans.iloc[sorted(kept)].copy()
    sample["ts"] = pd.to_datetime(sample["Timestamp"], format="%Y/%m/%d %H:%M", utc=True)
    sample = sample.sort_values(["ts", "external_id"])

    # 3. Label every sampled row with its typology when it belongs to a pattern.
    pattern_keys = patterns[[*MATCH_KEY, "typology"]].drop_duplicates(subset=MATCH_KEY)
    labeled = sample.merge(pattern_keys, on=MATCH_KEY, how="left")

    missing_fx = sorted(set(sample["Payment Currency"]) - FX_RATES_USD.keys())
    if missing_fx:
        sys.exit(f"no FX rate for: {', '.join(missing_fx)}. Add them to FX_RATES_USD.")

    args.out.mkdir(parents=True, exist_ok=True)
    demo = pd.DataFrame(
        {
            "external_id": labeled["external_id"],
            "timestamp": labeled["ts"].dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "from_account": labeled["from_account"],
            "to_account": labeled["to_account"],
            "amount": labeled["Amount Paid"],
            "currency": labeled["Payment Currency"],
            "payment_type": labeled["Payment Format"],
        }
    )
    demo.to_csv(args.out / "demo.csv", index=False)

    labels = pd.DataFrame(
        {
            "external_id": labeled["external_id"],
            "is_laundering": labeled["Is Laundering"].astype(int),
            "typology": labeled["typology"].fillna(""),
        }
    )
    labels.to_csv(args.out / "labels.csv", index=False)

    with (args.out / "fx_rates.json").open("w") as f:
        json.dump(
            {
                "note": "Fixed, approximate USD value of one unit of each currency. Not for accounting.",
                "base": "USD",
                "rates": FX_RATES_USD,
            },
            f,
            indent=2,
        )
        f.write("\n")

    # Report.
    chosen_typ = patterns[patterns["attempt_id"].isin(chosen)].groupby("typology")["attempt_id"].nunique()
    print(f"\nwrote {len(demo):,} rows to {args.out / 'demo.csv'}")
    print(f"  laundering rows: {int(labels['is_laundering'].sum()):,} ({labels['is_laundering'].mean():.2%})")
    print(f"  attempt accounts: {len(chosen_accounts):,}, background accounts: {background:,}")
    print("  attempts per typology:")
    for typ in TYPOLOGIES:
        print(f"    {typ:<15} {int(chosen_typ.get(typ, 0))}")
    print(f"  currencies: {', '.join(sorted(set(demo['currency'])))}")


if __name__ == "__main__":
    main()
