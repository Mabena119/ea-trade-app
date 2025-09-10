// Networking disabled: database access stubbed
import { Platform } from 'react-native';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const mysql = null as unknown as any;

// Database configuration
const dbConfig = {
  host: '172.203.148.37.host.secureserver.net',
  user: 'eauser',
  password: 'snVO2i%fZSG%',
  database: 'eaconverter',
  port: 3306,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000,
};

// Database connection pool
let pool: any | null = null;

function getPool(): any {
  return null;
}

export interface DatabaseUser {
  id: string;
  email: string;
  status: string;
  paid: boolean;
  used: boolean;
}

export interface DatabaseLicense {
  user: string;
  status: string;
  expires: string;
  key: string;
  phone_secret_key: string;
  ea_name: string;
  ea_notification: string;
  owner_name: string;
  owner_email: string;
  owner_phone: string;
  owner_logo: string;
}

export interface DatabaseSignal {
  id: string;
  asset: string;
  action: string;
  price: string;
  tp: string;
  sl: string;
  time: string;
  latestupdate: string;
}

export interface DatabaseSymbol {
  id: string;
  name: string;
}

class DatabaseService {
  private async executeQuery<T = any>(query: string, params: any[] = []): Promise<T[]> {
    console.warn('Database queries disabled (offline mode)');
    throw new Error('Database disabled');
  }

  async authenticateUser(email: string): Promise<DatabaseUser | null> {
    try {
      const query = `
        SELECT id, email, status, paid, used 
        FROM users 
        WHERE email = ? 
        LIMIT 1
      `;

      void query; void email;
      return null;
    } catch (error) {
      console.error('User authentication error:', error);
      throw new Error('Failed to authenticate user');
    }
  }

  async authenticateLicense(licenseKey: string, phoneSecret?: string): Promise<DatabaseLicense | null> {
    try {
      let query: string;
      let params: string[];

      if (phoneSecret) {
        query = `
          SELECT 
            l.user,
            l.status,
            l.expires,
            l.key,
            l.phone_secret_key,
            l.ea_name,
            l.ea_notification,
            o.name as owner_name,
            o.email as owner_email,
            o.phone as owner_phone,
            o.logo as owner_logo
          FROM licences l
          LEFT JOIN owners o ON l.owner_id = o.id
          WHERE l.key = ? AND l.phone_secret_key = ?
          LIMIT 1
        `;
        params = [licenseKey, phoneSecret];
      } else {
        query = `
          SELECT 
            l.user,
            l.status,
            l.expires,
            l.key,
            l.phone_secret_key,
            l.ea_name,
            l.ea_notification,
            o.name as owner_name,
            o.email as owner_email,
            o.phone as owner_phone,
            o.logo as owner_logo
          FROM licences l
          LEFT JOIN owners o ON l.owner_id = o.id
          WHERE l.key = ?
          LIMIT 1
        `;
        params = [licenseKey];
      }

      void query; void params;
      return null;
    } catch (error) {
      console.error('License authentication error:', error);
      throw new Error('Failed to authenticate license');
    }
  }

  async markUserAsUsed(email: string): Promise<boolean> {
    try {
      const query = `
        UPDATE users 
        SET used = true 
        WHERE email = ?
      `;

      void query; void email;
      return false;
    } catch (error) {
      console.error('Error marking user as used:', error);
      return false;
    }
  }

  async markLicenseAsUsed(licenseKey: string): Promise<boolean> {
    try {
      const query = `
        UPDATE licences 
        SET status = 'used' 
        WHERE key = ?
      `;

      void query; void licenseKey;
      return false;
    } catch (error) {
      console.error('Error marking license as used:', error);
      return false;
    }
  }

  async getSignals(phoneSecret: string): Promise<DatabaseSignal | null> {
    try {
      const query = `
        SELECT id, asset, action, price, tp, sl, time, latestupdate
        FROM signals 
        WHERE phone_secret = ? 
        ORDER BY latestupdate DESC 
        LIMIT 1
      `;

      void query; void phoneSecret;
      return null;
    } catch (error) {
      console.error('Error fetching signals:', error);
      throw new Error('Failed to fetch signals');
    }
  }

  async getSymbols(phoneSecret: string): Promise<DatabaseSymbol[]> {
    try {
      const query = `
        SELECT s.id, s.name
        FROM symbols s
        INNER JOIN licences l ON l.phone_secret_key = ?
        WHERE s.active = 1
        ORDER BY s.name ASC
      `;

      void query; void phoneSecret;
      return [];
    } catch (error) {
      console.error('Error fetching symbols:', error);
      throw new Error('Failed to fetch symbols');
    }
  }

  async closeConnection(): Promise<void> {
    pool = null;
  }
}

export const databaseService = new DatabaseService();
export default databaseService;