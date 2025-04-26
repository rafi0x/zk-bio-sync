import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current file's directory (equivalent to __dirname in CommonJS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Define the file path for our database
const dbFilePath = path.join(__dirname, '../../db.json');

// Define data structure - removing syncHistory
const defaultData = {
  auth: {
    username: '',
    password: '',
    token: null,
    tokenGeneratedAt: null, // Add timestamp when token was generated
    lastLogin: null
  },
  config: {
    syncPeriod: '5', // Default to 5 minutes
    serverUrl: 'http://192.168.1.100:90',
    lastSyncTime: null,
    isRunning: false
  },
  devices: [] // Store devices and their company IDs
};

// Create adapter and db instance
const adapter = new JSONFile(dbFilePath);
const db = new Low(adapter, defaultData);

class DbService {
  constructor () {
    this.initialized = false;
  }

  async init() {
    if (!this.initialized) {
      await db.read();
      this.initialized = true;
      console.log('Database initialized:', dbFilePath);
    }
    return db.data;
  }

  async getData() {
    await this.init();
    return db.data;
  }

  async saveData() {
    await db.write();
  }

  // Authentication Methods
  async getAuthInfo() {
    await this.init();
    return db.data.auth;
  }

  async saveAuthInfo(username, password, token) {
    await this.init();
    db.data.auth.username = username;
    db.data.auth.password = password;
    db.data.auth.token = token;
    db.data.auth.tokenGeneratedAt = new Date().toISOString(); // Store token generation time
    db.data.auth.lastLogin = new Date().toISOString();
    await this.saveData();
    return db.data.auth;
  }

  async updateToken(token) {
    await this.init();
    db.data.auth.token = token;
    db.data.auth.tokenGeneratedAt = new Date().toISOString(); // Update token generation time
    await this.saveData();
  }

  async clearToken() {
    await this.init();
    db.data.auth.token = null;
    await this.saveData();
  }

  // Configuration Methods
  async getConfig() {
    await this.init();
    return db.data.config;
  }

  async getServerUrl() {
    await this.init();
    return db.data.config.serverUrl || 'http://192.168.1.100:90';
  }

  async saveServerUrl(url) {
    await this.init();
    db.data.config.serverUrl = url;
    await this.saveData();
    return url;
  }

  async saveSyncPeriod(period) {
    await this.init();
    db.data.config.syncPeriod = period;
    await this.saveData();
    return db.data.config;
  }

  async updateSyncStatus(isRunning) {
    await this.init();
    db.data.config.isRunning = isRunning;
    if (isRunning) {
      db.data.config.lastSyncTime = new Date().toISOString();
    }
    await this.saveData();
    return db.data.config;
  }

  // Device Management Methods
  async getDevices() {
    await this.init();
    return db.data.devices || [];
  }

  async saveDevices(devices) {
    await this.init();
    db.data.devices = devices;
    await this.saveData();
    return devices;
  }

  async updateDeviceCompanyId(deviceId, companyId) {
    await this.init();

    // Convert deviceId to string to ensure consistent comparison
    const deviceIdStr = String(deviceId);
    console.log("🚀 ~ DbService ~ updateDeviceCompanyId ~ deviceId converted to string:", deviceIdStr);

    // Find device by string comparison
    const deviceIndex = db.data.devices.findIndex(d => String(d.id) === deviceIdStr);
    console.log("🚀 ~ DbService ~ updateDeviceCompanyId ~ deviceIndex:", deviceIndex);

    if (deviceIndex >= 0) {
      // Update existing device
      db.data.devices[ deviceIndex ].companyId = companyId;
    } else {
      // Add new device with company ID (store ID as string for consistency)
      db.data.devices.push({
        id: deviceIdStr,
        companyId: companyId
      });
    }

    await this.saveData();
    return db.data.devices;
  }

  async getDeviceCompanyId(deviceId) {
    await this.init();
    // Convert to string for consistent comparison
    const deviceIdStr = String(deviceId);
    const device = db.data.devices.find(d => String(d.id) === deviceIdStr);
    return device ? device.companyId : null;
  }
}

const dbService = new DbService();
export default dbService;