import { createHash, randomBytes } from 'crypto';

export const OZOW_PAYMENT_API = 'https://api.ozow.com/postpaymentrequest';
export const OZOW_AMOUNT_DEFAULT = '350.00';
export const OZOW_BANK_REFERENCE = 'EA VPS';

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
  Optional1: string;
  Optional2: string;
  Optional3: string;
  Optional4: string;
  Optional5: string;
  Customer: string;
  CancelUrl: string;
  ErrorUrl: string;
  SuccessUrl: string;
  NotifyUrl: string;
  IsTest: boolean;
};

/**
 * Ozow hash: concat posted fields in merchant post table order, append private key,
 * lowercase, SHA512. Optional1–5 only included when any optional is set; Customer only when set.
 */
export function buildOzowHashCheck(fields: OzowPostPaymentBody, privateKey: string): string {
  const parts: string[] = [
    fields.SiteCode,
    fields.CountryCode,
    fields.CurrencyCode,
    fields.Amount,
    fields.TransactionReference,
    fields.BankReference,
  ];

  const hasOptionals =
    fields.Optional1 ||
    fields.Optional2 ||
    fields.Optional3 ||
    fields.Optional4 ||
    fields.Optional5;
  if (hasOptionals) {
    parts.push(
      fields.Optional1,
      fields.Optional2,
      fields.Optional3,
      fields.Optional4,
      fields.Optional5
    );
  }

  if (fields.Customer) {
    parts.push(fields.Customer);
  }

  parts.push(
    fields.CancelUrl,
    fields.ErrorUrl,
    fields.SuccessUrl,
    fields.NotifyUrl,
    fields.IsTest ? 'true' : 'false'
  );

  const input = `${parts.join('')}${privateKey}`.toLowerCase();
  return createHash('sha512').update(input).digest('hex');
}

export function formatOzowAmount(amount: string | number): string {
  const n = typeof amount === 'number' ? amount : parseFloat(String(amount).replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n)) return OZOW_AMOUNT_DEFAULT;
  return n.toFixed(2);
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

  return {
    SiteCode: config.siteCode,
    CountryCode: 'ZA',
    CurrencyCode: 'ZAR',
    Amount: formatOzowAmount(config.amount || OZOW_AMOUNT_DEFAULT),
    TransactionReference: options.transactionReference || buildTransactionReference(),
    BankReference: OZOW_BANK_REFERENCE,
    Optional1: email,
    Optional2: '',
    Optional3: '',
    Optional4: '',
    Optional5: '',
    Customer: email,
    CancelUrl: returnUrl,
    ErrorUrl: returnUrl,
    SuccessUrl: returnUrl,
    NotifyUrl: notifyUrl,
    IsTest: config.isTest ?? false,
  };
}

/** JSON payload: omit empty optional strings Ozow does not require in body. */
export function toOzowApiPayload(
  postBody: OzowPostPaymentBody,
  hashCheck: string
): Record<string, string | boolean> {
  const payload: Record<string, string | boolean> = {
    SiteCode: postBody.SiteCode,
    CountryCode: postBody.CountryCode,
    CurrencyCode: postBody.CurrencyCode,
    Amount: postBody.Amount,
    TransactionReference: postBody.TransactionReference,
    BankReference: postBody.BankReference,
    CancelUrl: postBody.CancelUrl,
    ErrorUrl: postBody.ErrorUrl,
    SuccessUrl: postBody.SuccessUrl,
    NotifyUrl: postBody.NotifyUrl,
    IsTest: postBody.IsTest,
    HashCheck: hashCheck,
  };
  if (postBody.Optional1) payload.Optional1 = postBody.Optional1;
  if (postBody.Customer) payload.Customer = postBody.Customer;
  return payload;
}

export async function requestOzowPaymentUrl(
  config: OzowCheckoutConfig,
  options: { email?: string }
): Promise<{ url: string } | { error: string }> {
  const postBody = buildOzowPostBody(config, options);
  const hashCheck = buildOzowHashCheck(postBody, config.privateKey);
  const payload = toOzowApiPayload(postBody, hashCheck);

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
