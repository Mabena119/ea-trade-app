/** When false, chart warmup / AI analysis auto-trading is disabled while the bot runs. */
export const AI_CHART_TRADING_ENABLED = false;

/** Stored lot for martingale symbols — execution uses lot from EA signal. */
export const MARTINGALE_PLACEHOLDER_LOT = '0.01';

export const MARTINGALE_SIGNAL_LOT_LABEL = 'From signal';

type EaMartingaleLike =
  | { status?: string; userData?: { ea_martingale?: boolean } | null }
  | null
  | undefined;

export function isMartingaleEa(
  eas: EaMartingaleLike[] | null | undefined,
  primaryIndex = 0
): boolean {
  if (!eas?.length) return false;
  const connected = eas.find((e) => e?.status === 'connected');
  const ea = connected ?? eas[primaryIndex];
  return Boolean(ea?.userData?.ea_martingale);
}

/** Parse lot from EA signal payload (martingale bots). Returns null if missing/invalid. */
export function parseSignalLot(lot: string | number | undefined | null): string | null {
  if (lot == null || lot === '') return null;
  const parsed = parseFloat(String(lot).replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return String(parsed);
}
