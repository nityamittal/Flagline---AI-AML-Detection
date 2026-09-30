import { Prisma } from "@prisma/client";
import fx from "@/data/fx_rates.json";

// Fixed, approximate USD value of one unit of each currency (see data/fx_rates.json).
// Built from the JSON number's string form so e.g. 0.0073 stays exactly 0.0073.
const RATES: ReadonlyMap<string, Prisma.Decimal> = new Map(
  Object.entries(fx.rates).map(([currency, rate]) => [currency, new Prisma.Decimal(String(rate))]),
);

export function supportedCurrencies(): string[] {
  return [...RATES.keys()];
}

export function isSupportedCurrency(currency: string): boolean {
  return RATES.has(currency);
}

/** Converts an amount to USD, rounded half-up to cents (the amountUsd column is Decimal(20, 2)). */
export function toUsd(amount: Prisma.Decimal, currency: string): Prisma.Decimal {
  const rate = RATES.get(currency);
  if (!rate) throw new Error(`No FX rate for currency "${currency}"`);
  return amount.mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
