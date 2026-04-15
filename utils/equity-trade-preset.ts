/**
 * Single source of truth for MT5 auto trade sizing from linked-account equity.
 * All symbol configs use this; values are not user-editable.
 */
export function parseEquityNumber(raw?: string | null): number | null {
  if (raw == null || raw === '') return null;
  const n = Number(String(raw).replace(/,/g, '').replace(/\s/g, ''));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export interface EquityMT5Preset {
  lotSize: string;
  direction: 'BOTH';
  numberOfTrades: string;
  platform: 'MT5';
}

/**
 * Tiered risk ladder: as equity grows, allow slightly larger lots and more
 * parallel trades, capped conservatively for retail accounts.
 * When equity is unknown (not linked / not scraped), uses micro baseline.
 */
export function getEquityBasedMT5Preset(equityInput?: string | null): EquityMT5Preset {
  const eq = parseEquityNumber(equityInput);

  if (eq == null || eq <= 0) {
    return {
      lotSize: '0.01',
      direction: 'BOTH',
      numberOfTrades: '1',
      platform: 'MT5',
    };
  }

  let lotSize = '0.01';
  let numberOfTrades = '1';

  if (eq < 500) {
    lotSize = '0.01';
    numberOfTrades = '1';
  } else if (eq < 2000) {
    lotSize = '0.02';
    numberOfTrades = '1';
  } else if (eq < 10000) {
    lotSize = '0.03';
    numberOfTrades = '2';
  } else if (eq < 50000) {
    lotSize = '0.05';
    numberOfTrades = '2';
  } else if (eq < 150000) {
    lotSize = '0.08';
    numberOfTrades = '3';
  } else {
    lotSize = '0.10';
    numberOfTrades = '3';
  }

  return {
    lotSize,
    direction: 'BOTH',
    numberOfTrades,
    platform: 'MT5',
  };
}
