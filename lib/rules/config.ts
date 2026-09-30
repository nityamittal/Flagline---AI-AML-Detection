// Every rule threshold in one place. These are starting guesses, tuned against data/labels.csv
// with `npm run score`; record any change and its effect in the README.
export const RULES_CONFIG = {
  // minDistinctRatio: distinct counterparties / payments in the window. Hub accounts that pay
  // the same payees over and over (bills, payroll) fall below it; laundering fan-outs don't.
  // Tuned on demo.csv: 0.8 took fan-out precision from 3% to 51% (recall 20% -> 14%). The same
  // ratio cut fan-in's FAN-IN recall from 92% to 10%, because senders repeat there, so it is off.
  fanOut: { minCounterparties: 5, windowDays: 14, minDistinctRatio: 0.8 },
  fanIn: { minCounterparties: 5, windowDays: 14, minDistinctRatio: 0 },
  passThrough: { windowHours: 72, tolerance: "0.10" },
  largeAmount: { percentile: 0.99 },
  duplicate: { windowMinutes: 60 },
  /** Cap on the related transaction ids stored in a flag's evidence. */
  maxRelatedIds: 20,
} as const;
