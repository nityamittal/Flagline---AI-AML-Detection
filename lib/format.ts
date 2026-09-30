import type { Prisma } from "@prisma/client";

/** Shows only the last five characters of an account: "00952-8139F54E0" -> "****F54E0". */
export function maskAccount(account: string): string {
  return account.length <= 5 ? "****" : `****${account.slice(-5)}`;
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** Formats a Decimal as USD without converting it to a float first. */
export function formatUsd(amount: Prisma.Decimal | string): string {
  return usd.format(amount.toString() as Intl.StringNumericLiteral);
}

export function formatAmount(amount: Prisma.Decimal | string, currency: string): string {
  const [whole, fraction] = amount.toString().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${fraction ? `${grouped}.${fraction}` : grouped} ${currency}`;
}

/** "2022-09-01 05:14 UTC" */
export function formatTime(date: Date): string {
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}
