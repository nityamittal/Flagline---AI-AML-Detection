# data/

| File | Committed | What |
| --- | --- | --- |
| `raw/HI-Small_Trans.csv`, `raw/HI-Small_Patterns.txt` | No (`.gitignore`) | Source files from the IBM AML Kaggle dataset |
| `demo.csv` | Yes | ~20,000 sampled transactions in the upload format, no labels |
| `labels.csv` | Yes | `external_id`, `is_laundering`, `typology`, used only by scoring |
| `fx_rates.json` | Yes | Fixed, approximate USD rates per currency |

## Regenerate

1. Sign in to Kaggle, open "IBM Transactions for Anti Money Laundering (AML)", and download
   `HI-Small_Trans.csv` and `HI-Small_Patterns.txt` into `data/raw/`.
2. `pip install -r requirements.txt`
3. `python scripts/sample_data.py`

The script samples by account (about 5 attempts per typology plus random background accounts),
so each laundering pattern stays whole. The sample has a much higher laundering rate than the
full file; precision and recall reported on it are for the sample only.

Check the dataset's license on its Kaggle page before committing `demo.csv` to a public repo.
Source: Altman et al., "Realistic Synthetic Financial Transactions for Anti-Money Laundering
Models", NeurIPS 2023.
