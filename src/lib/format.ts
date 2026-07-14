export const inr = (n: number | null | undefined) => {
  const v = Number(n ?? 0);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(isFinite(v) ? v : 0);
};

export const num = (n: number | null | undefined, digits = 2) => {
  const v = Number(n ?? 0);
  return (isFinite(v) ? v : 0).toFixed(digits);
};

export const toNumber = (v: unknown, fallback = 0): number => {
  if (v === "" || v == null) return fallback;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return isFinite(n) ? n : fallback;
};

export const round2 = (n: number) => Math.round(n * 100) / 100;
