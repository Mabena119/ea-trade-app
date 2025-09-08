const BASE_URL = typeof window === 'undefined' ? '' : '';

export interface AuthBody {
  email: string;
  password: string;
}

export interface Account {
  id: string;
  email: string;
  status: string;
  paid: boolean;
  used: boolean;
}

export interface App {
  message: string;
  version: number;
}

export interface Signals {
  signals: Signal[];
}

export interface Signal {
  id: string;
  asset: string;
  action: string;
  price: string;
  tp: string;
  sl: string;
  time: string;
  latestupdate: string;
}

export interface SignalsResponse {
  message: 'accept' | 'error';
  data?: Signal;
}

export interface SignalsListResponse {
  message: 'accept' | 'error';
  data?: Signal[];
}

export interface Symbol {
  id: string;
  name: string;
}

export interface SymbolsResponse {
  message: 'accept' | 'error';
  data?: Symbol[];
}

export interface LicenseAuthBody {
  licence: string;
  phone_secret?: string;
}

export interface Owner {
  name: string;
  email: string;
  phone: string;
  logo: string;
}

export interface LicenseData {
  user: string;
  status: string;
  expires: string;
  key: string;
  phone_secret_key: string;
  ea_name: string;
  ea_notification: string;
  owner: Owner;
}

export interface LicenseAuthResponse {
  message: 'accept' | 'used' | 'error';
  data?: LicenseData;
}

class ApiService {
  async authenticate(authBody: AuthBody): Promise<Account> {
    if (!authBody?.email) throw new Error('Email is required');
    // Call our API route in the same origin
    const res = await fetch(`${BASE_URL}/api/check-email`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: authBody.email.trim().toLowerCase() }),
    });
    let data: { used?: number; paid?: number } = {};
    try {
      data = (await res.json()) as { used?: number; paid?: number };
    } catch (e) {
      throw new Error('Authentication failed');
    }
    const used = Number(data?.used ?? 0) === 1;
    const paid = Number(data?.paid ?? 0) === 1;

    return {
      id: authBody.email,
      email: authBody.email,
      status: 'ok',
      paid,
      used,
    };
  }

  async getSignals(phoneSecret: string): Promise<SignalsResponse> {
    // Mock: produce no new signals to avoid network
    void phoneSecret;
    return { message: 'error' };
  }

  async getApp(email: string, use: boolean = false): Promise<App> {
    // Mock: pretend app is available for any email
    void use;
    if (!email) {
      return { message: 'none', version: 1 } as unknown as App;
    }
    return { message: 'accept', version: 1 } as unknown as App;
  }

  async getSymbols(phoneSecret: string): Promise<SymbolsResponse> {
    // Mock symbols list
    void phoneSecret;
    const data: Symbol[] = [
      { id: '1', name: 'EURUSD' },
      { id: '2', name: 'GBPUSD' },
      { id: '3', name: 'XAUUSD' },
      { id: '4', name: 'USDJPY' },
    ];
    return { message: 'accept', data };
  }

  async authenticateLicense(licenseBody: LicenseAuthBody): Promise<LicenseAuthResponse> {
    // Mock: accept any non-empty license
    if (!licenseBody?.licence) {
      return { message: 'error' };
    }
    const owner: Owner = {
      name: 'Local Owner',
      email: 'owner@example.com',
      phone: '+0000000000',
      logo: 'local-logo',
    };
    const data: LicenseData = {
      user: 'local-user',
      status: 'active',
      expires: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString(),
      key: licenseBody.licence,
      phone_secret_key: licenseBody.phone_secret ?? 'local-secret',
      ea_name: 'Local EA',
      ea_notification: 'enabled',
      owner,
    };
    return { message: 'accept', data };
  }
}

export const apiService = new ApiService();
export default apiService;