import { createHash, randomBytes } from 'crypto';

export const OZOW_PAYMENT_API = 'https://api.ozow.com/postpaymentrequest';
export const OZOW_AMOUNT_DEFAULT = '349.99';
export const OZOW_BANK_REFERENCE = 'CoreMarket';

export type OzowCheckoutConfig = {
  siteCode: string;
  apiKey: string;
  privateKey: string;
  notifyUrl: string;
  returnUrl: string;
  amount?: string;
  isTest?: boolean;
};

export type OzowPostPaymentBody = {
  SiteCode: string;
  CountryCode: string;
  CurrencyCode: string;
  Amount: string;
  TransactionReference: string;
  BankReference: string;
  CancelUrl: string;
  ErrorUrl: string;
  SuccessUrl: string;
  NotifyUrl: string;
  IsTest: boolean;
  Customer?: string;
  Optional1?: string;
};

/** Ozow hash: lowercase(concat field values in post order + privateKey), then SHA512 hex. */
export function buildOzowHashCheck(fields: OzowPostPaymentBody, privateKey: string): string {
  const parts = [
    fields.SiteCode,
    fields.CountryCode,
    fields.CurrencyCode,
    fields.Amount,
    fields.TransactionReference,
    fields.BankReference,
    fields.CancelUrl,
    fields.ErrorUrl,
    fields.SuccessUrl,
    fields.NotifyUrl,
    fields.IsTest ? 'true' : 'false',
  ];
  const input = `${parts.join('')}${privateKey}`.toLowerCase();
  return createHash('sha512').update(input).digest('hex');
}

export function buildTransactionReference(): string {
  const suffix = randomBytes(4).toString('hex');
  return `SCAN-${Date.now()}-${suffix}`.slice(0, 50);
}

export function buildNotifyUrl(baseNotifyUrl: string, email?: string): string {
  if (!email) return baseNotifyUrl;
  const url = new URL(baseNotifyUrl);
  url.searchParams.set('email', email);
  return url.toString();
}

export function buildOzowPostBody(
  config: OzowCheckoutConfig,
  options: { email?: string; transactionReference?: string }
): OzowPostPaymentBody {
  const email = (options.email || '').trim().toLowerCase();
  const returnUrl = config.returnUrl;
  const notifyUrl = buildNotifyUrl(config.notifyUrl, email || undefined);

  const body: OzowPostPaymentBody = {
    SiteCode: config.siteCode,
    CountryCode: 'ZA',
    CurrencyCode: 'ZAR',
    Amount: config.amount || OZOW_AMOUNT_DEFAULT,
    TransactionReference: options.transactionReference || buildTransactionReference(),
    BankReference: OZOW_BANK_REFERENCE,
    CancelUrl: returnUrl,
    ErrorUrl: returnUrl,
    SuccessUrl: returnUrl,
    NotifyUrl: notifyUrl,
    IsTest: config.isTest ?? false,
  };

  if (email) {
    body.Customer = email;
    body.Optional1 = email;
  }

  return body;
}

export async function requestOzowPaymentUrl(
  config: OzowCheckoutConfig,
  options: { email?: string }
): Promise<{ url: string } | { error: string }> {
  const postBody = buildOzowPostBody(config, options);
  const hashCheck = buildOzowHashCheck(postBody, config.privateKey);
  const payload = { ...postBody, HashCheck: hashCheck };

  const res = await fetch(OZOW_PAYMENT_API, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      ApiKey: config.apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const raw = await res.text();
  let data: { url?: string; errorMessage?: string; ErrorMessage?: string };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    return { error: raw || `Ozow request failed (${res.status})` };
  }

  const err = data.errorMessage || data.ErrorMessage;
  if (!res.ok || err) {
    return { error: err || `Ozow request failed (${res.status})` };
  }

  if (!data.url) {
    return { error: 'Ozow did not return a payment URL' };
  }

  return { url: data.url };
}

export function getOzowConfigFromEnv(): OzowCheckoutConfig | null {
  const siteCode = process.env.OZOW_SITE_CODE;
  const apiKey = process.env.OZOW_API_KEY;
  const privateKey = process.env.OZOW_PRIVATE_KEY;
  const notifyUrl = process.env.OZOW_NOTIFY_URL;
  if (!siteCode || !apiKey || !privateKey || !notifyUrl) return null;

  return {
    siteCode,
    apiKey,
    privateKey,
    notifyUrl,
    returnUrl: process.env.OZOW_RETURN_URL || 'https://www.eatrade.io/',
    amount: process.env.OZOW_AMOUNT || OZOW_AMOUNT_DEFAULT,
    isTest: process.env.OZOW_IS_TEST === 'true',
  };
}
