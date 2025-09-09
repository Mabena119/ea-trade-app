const BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL || '').replace(/\/$/, '');

export interface AuthBody {
  email: string;
  password?: string;
  mentor?: string;
}

export interface Account {
  id: string;
  email: string;
  status: string;
  paid: boolean;
  used: boolean;
  invalidMentor?: number;
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
    const endpoint = `${BASE_URL ? `${BASE_URL}` : ''}/api/check-email`;
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: authBody.email.trim().toLowerCase(),
          mentor: (authBody.mentor || authBody.password || '').toString().trim(),
        }),
      });
    } catch (networkError) {
      const hint = BASE_URL
        ? ''
        : ' Set EXPO_PUBLIC_API_BASE_URL to your API host for native builds.';
      throw new Error(`Network error contacting auth service.${hint}`);
    }
    let data: { found?: number; used?: number; paid?: number; invalidMentor?: number } = {};
    try {
      data = (await res.json()) as { used?: number; paid?: number; invalidMentor?: number };
    } catch (e) {
      throw new Error('Authentication failed');
    }
    const found = Number(data?.found ?? 0) === 1;
    const used = Number(data?.used ?? 0) === 1;
    const paid = Number(data?.paid ?? 0) === 1;
    const invalidMentor = Number(data?.invalidMentor ?? 0);

    return {
      id: authBody.email,
      email: authBody.email,
      status: found ? 'ok' : 'not_found',
      paid,
      used,
      invalidMentor,
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
    if (!phoneSecret) return { message: 'error' };
    const res = await fetch(`${BASE_URL}/api/symbols?phone_secret=${encodeURIComponent(phoneSecret)}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });
    try {
      const data = (await res.json()) as SymbolsResponse;
      return data;
    } catch {
      return { message: 'error' };
    }
  }

  async authenticateLicense(licenseBody: LicenseAuthBody): Promise<LicenseAuthResponse> {
    if (!licenseBody?.licence) return { message: 'error' };
    const endpoint = `${BASE_URL ? `${BASE_URL}` : ''}/api/auth-license`;

    // Add timeout to avoid hanging forever on network issues
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(licenseBody),
        signal: controller.signal,
      });
    } catch (networkError) {
      clearTimeout(timeout);
      const hint = BASE_URL ? '' : ' Set EXPO_PUBLIC_API_BASE_URL to your API host for native builds.';
      console.error('License auth network error:', networkError);
      return { message: 'error' };
    }
    clearTimeout(timeout);

    try {
      const data = (await res.json()) as LicenseAuthResponse;
      return data;
    } catch {
      return { message: 'error' };
    }
  }
}

export const apiService = new ApiService();
export default apiService;