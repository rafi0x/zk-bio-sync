import axios from 'axios';
import dbService from './dbService.js';

class ApiService {
  constructor () {
    this.baseUrl = 'http://192.168.1.100:90'; // Default URL, will be updated from db
    this.token = null;
    this.initializing = null;
    this.tokenExpirationDays = 7; // Token valid for 7 days
    this.tokenRenewalDays = 6;    // Renew after 6 days
  }

  async init() {
    if (this.initializing) {
      return this.initializing;
    }

    this.initializing = new Promise(async (resolve) => {
      // Load server URL from database
      this.baseUrl = await dbService.getServerUrl();
      console.log('Server URL loaded:', this.baseUrl);

      // Load token from database if exists
      const authInfo = await dbService.getAuthInfo();
      if (authInfo && authInfo.token) {
        // Check if token needs to be renewed
        if (await this.shouldRenewToken(authInfo)) {
          console.log('Token is approaching expiration, renewing...');
          if (authInfo.username && authInfo.password) {
            await this.login(authInfo.username, authInfo.password);
          }
        } else {
          this.token = authInfo.token;
          console.log('Token loaded from database (valid)');
        }
      }
      resolve();
    });

    return this.initializing;
  }

  /**
   * Check if the token should be renewed based on when it was generated
   * @param {Object} authInfo - Auth information from database
   * @returns {boolean} - True if token should be renewed
   */
  async shouldRenewToken(authInfo) {
    if (!authInfo.tokenGeneratedAt) {
      return true; // If no generation date, renew to be safe
    }

    const tokenDate = new Date(authInfo.tokenGeneratedAt);
    const currentDate = new Date();

    // Calculate days difference
    const diffTime = currentDate - tokenDate;
    const diffDays = diffTime / (1000 * 60 * 60 * 24);

    // If token is older than renewal threshold, it should be renewed
    return diffDays >= this.tokenRenewalDays;
  }

  async login(username, password) {
    try {
      await this.init(); // Ensure we have the latest server URL
      const response = await axios.post(`${this.baseUrl}/jwt-api-token-auth/`, {
        username,
        password,
      });
      this.token = response.data.token;

      // Save credentials and token to database
      await dbService.saveAuthInfo(username, password, this.token);

      console.log('Login successful, token updated and saved to database');
      return { success: true, data: response.data };
    } catch (error) {
      console.error('Login failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  getAuthHeaders() {
    return {
      Authorization: `JWT ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  async getAllEmployees() {
    try {
      await this.init();
      const response = await axios.get(`${this.baseUrl}/personnel/api/employees/`, {
        headers: this.getAuthHeaders(),
      });

      // Transform the response data before returning
      const transformedData = this.transformAllEmployees(response.data);
      return { success: true, rawData: response.data, data: transformedData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  async getDevices() {
    try {
      await this.init();
      const response = await axios.get(`${this.baseUrl}/iclock/api/terminals/`, {
        headers: this.getAuthHeaders(),
      });

      // Store devices with company_id in the database
      if (response.data && Array.isArray(response.data.data)) {
        // Get stored device settings
        const storedDevices = await dbService.getDevices();
        const storedDevicesMap = new Map();

        // Create a map for easy lookup
        storedDevices.forEach(device => {
          storedDevicesMap.set(device.id.toString(), device);
        });

        const devices = response.data.data.map(device => {
          const storedDevice = storedDevicesMap.get(device.id.toString());
          return {
            id: device.id, // Serial number as ID
            serialNumber: device.sn,
            name: device.alias || device.sn,
            companyId: storedDevice ? storedDevice.companyId : null,
            ipAddress: device.ip_address,
            lastSeen: new Date().toISOString()
          };
        });

        // Save devices to database
        await dbService.saveDevices(devices);
        console.log(`Stored ${devices.length} devices with company IDs`);
      }

      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Transform employees data from API response format to the desired interface format
   * @param {Object} responseData - Raw API response data
   * @returns {Array} - Transformed data in the specified format { user_id: emp_code, username: first_name + last_name }
   */
  transformAllEmployees(responseData) {
    if (!responseData || !responseData.data || !Array.isArray(responseData.data)) {
      return [];
    }

    return responseData.data.map(employee => {
      const firstName = employee.first_name || '';
      const lastName = employee.last_name || '';

      return {
        user_id: employee.emp_code,
        username: `${firstName} ${lastName}`.trim()
      };
    });
  }

  /**
   * Transform device logs from API response format to the desired interface format
   * @param {Array} responseData - Raw API response data
   * @returns {Array} - Transformed data in the specified format
   */
  async transformDeviceLogs(responseData) {
    if (!responseData || !responseData.data || !Array.isArray(responseData.data)) {
      return [];
    }

    // Get all devices to use their company IDs
    const devices = await dbService.getDevices();
    const deviceMap = devices.reduce((map, device) => {
      map[ device.serialNumber ] = device;
      return map;
    }, {});

    return responseData.data.map(log => {
      // Get company_id from device if available, otherwise fall back to log.emp
      const device = deviceMap[ log.terminal_sn ];
      const companyId = device && device.companyId ? device.companyId : log.emp;

      return {
        timestamp: log.punch_time,
        device_serial: log.terminal_sn,
        user_id: log.emp_code,
        company_id: companyId, // Use device's company_id if available
        created_at: log.upload_time
      };
    });
  }

  async getDeviceLogs() {
    try {
      await this.init();

      // Format current date as YYYY-MM-DD
      const currentDate = new Date().toISOString().split('T')[ 0 ];
      console.log("🚀 ~ ApiService ~ getDeviceLogs ~ currentDate:", currentDate);

      const response = await axios.get(
        `${this.baseUrl}/iclock/api/transactions/?page_size=1000&start_time=${currentDate}`,
        {
          headers: this.getAuthHeaders(),
        }
      );

      // Transform the response data before returning
      console.log("🚀 ~ ApiService ~ getDeviceLogs ~ response.data:", response.data);
      const transformedData = await this.transformDeviceLogs(response.data);
      return { success: true, rawData: response.data, data: transformedData };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Send attendance logs and employees data to external API
   * @param {Array} logs - Transformed attendance logs
   * @param {Array} employees - Transformed employee data
   * @returns {Object} - Result of the API call
   */
  async sendToExternalApi(logs, employees) {
    try {
      const payload = {
        logs: logs,
        users: employees,
        key: "myFingerGoesClickBangClackBang"
      };

      const response = await axios.post('http://localhost:3000/api/v1/attendances/import-device-data', payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        message: 'Data sent successfully to external API',
        data: response.data
      };
    } catch (error) {
      console.error('Failed to send data to external API:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async runSyncSequence() {
    // Check if token needs renewal before running sync
    const authInfo = await dbService.getAuthInfo();
    if (await this.shouldRenewToken(authInfo)) {
      console.log('Token approaching expiration, renewing before sync');
      const loginResult = await this.login(authInfo.username, authInfo.password);
      if (!loginResult.success) {
        console.error('Failed to renew token before sync');
        return [ {
          timestamp: new Date().toISOString(),
          api: 'Login',
          success: false,
          error: loginResult.error || 'Token renewal failed',
        } ];
      }
    }

    const results = [];
    const timestamp = new Date().toISOString();

    // Get all employees
    const employeesResult = await this.getAllEmployees();
    results.push({
      timestamp,
      api: 'Get All Employees',
      success: employeesResult.success,
      error: employeesResult.error,
    });

    // Get devices
    const devicesResult = await this.getDevices();
    results.push({
      timestamp,
      api: 'Get Devices',
      success: devicesResult.success,
      error: devicesResult.error,
    });

    // Get device logs
    const logsResult = await this.getDeviceLogs();
    results.push({
      timestamp,
      api: 'Device Logs',
      success: logsResult.success,
      error: logsResult.error,
    });

    // If all data fetches were successful, send to external API
    if (employeesResult.success && logsResult.success) {
      const externalApiResult = await this.sendToExternalApi(logsResult.data, employeesResult.data);
      results.push({
        timestamp,
        api: 'External API',
        success: externalApiResult.success,
        error: externalApiResult.error,
        message: externalApiResult.message
      });
    }

    return results;
  }
}

const apiService = new ApiService();
export default apiService;