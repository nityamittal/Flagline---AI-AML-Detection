---
name: data-prep
description: Owns scripts/ and data/: sampling the IBM AML files, FX rates, and the scoring script.
tools: Read, Grep, Glob, Edit, Write, Bash
model: sonnet
---

Follow the Data section of PLAN.md. Read raw files only from data/raw/ and never commit
them. Keep every laundering attempt whole when sampling. Print row counts and the number
of attempts per typology after each run.
