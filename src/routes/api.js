const express = require('express');
const apiService = require('../services/apiService.js');
const dbService = require('../services/dbService.js');
const syncService = require('../services/syncService.js');

const router = express.Router();

// Start sync
router.post('/sync/start', async (req, res) => {
  try {
    const { config: dbConfig } = await dbService.getConfig();
    const dbAuth = await dbService.getAuthInfo();

    const period = dbConfig.syncPeriod;
    const username = dbAuth.username;
    const password = dbAuth.password;
    const serverUrl = dbConfig.serverUrl;

    if (!period || !username || !password || !serverUrl) {
      return res.status(400).json({
        success: false,
        error: 'Missing required configuration or credentials in the database',
      });
    }

    const result = await syncService.startSync(period, { username, password, serverUrl }, req.app.get('io'));
    res.json(result);
  } catch (error) {
    console.error('Error starting sync:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to start sync',
    });
  }
});

// Stop sync
router.post('/sync/stop', async (req, res) => {
  const result = await syncService.stopSync();

  if (result.success) {
    req.app.get('io').emit('log', {
      timestamp: new Date().toISOString(),
      api: 'System',
      message: 'Sync stopped',
    });

    return res.json({
      success: true,
      message: 'Sync stopped',
    });
  } else {
    return res.status(400).json({
      success: false,
      message: result.message,
    });
  }
});

// Get sync status
router.get('/sync/status', async (req, res) => {
  const isRunning = await syncService.isRunning();
  const { config } = await dbService.getConfig();

  return res.json({
    success: true,
    isRunning,
    lastSyncTime: config.lastSyncTime
  });
});

// Get saved credentials (without password)
router.get('/settings/credentials', async (req, res) => {
  const authInfo = await syncService.getSavedCredentials();

  return res.json({
    success: true,
    username: authInfo.username,
    password: authInfo.password,
    hasCredentials: !!(authInfo.username && authInfo.password),
    lastLogin: authInfo.lastLogin
  });
});

// Save credentials
router.post('/settings/credentials', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Username and password are required'
    });
  }

  try {
    await dbService.saveAuthInfo(username, password, null);
    return res.json({
      success: true,
      message: 'Credentials saved successfully'
    });
  } catch (error) {
    console.error('Error saving credentials:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save credentials'
    });
  }
});

// Get saved sync period
router.get('/settings/syncperiod', async (req, res) => {
  const period = await syncService.getSavedSyncPeriod();

  return res.json({
    success: true,
    syncPeriod: period
  });
});

// Get server configuration
router.get('/settings/server', async (req, res) => {
  const serverUrl = await dbService.getServerUrl();

  return res.json({
    success: true,
    url: serverUrl
  });
});

// Update server URL
router.post('/settings/server', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({
      success: false,
      error: 'Server URL is required'
    });
  }

  try {
    await dbService.saveServerUrl(url);
    return res.json({
      success: true,
      message: 'Server URL updated successfully'
    });
  } catch (error) {
    console.error('Error saving server URL:', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to save server URL'
    });
  }
});

// Get configuration settings
router.get('/settings/config', async (req, res) => {
  try {
    const data = await dbService.getConfig();
    res.json({
      success: true,
      syncPeriod: data.config.syncPeriod,
      serverUrl: data.config.serverUrl,
      username: data.auth.username,
      password: data.auth.password
    });
  } catch (error) {
    console.error('Error fetching configuration settings:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to fetch configuration settings'
    });
  }
});

// Device Management APIs

// Get all devices with their company IDs
router.get('/devices', async (req, res) => {
  try {
    // Get devices from the ZK Bio API
    const apiResult = await apiService.getDevices();

    if (!apiResult.success) {
      return res.status(400).json({
        success: false,
        error: apiResult.error || 'Failed to fetch devices from API'
      });
    }

    // Get stored device settings
    const storedDevices = await dbService.getDevices();
    const storedDevicesMap = new Map();

    // Create a map for easy lookup
    storedDevices.forEach(device => {
      storedDevicesMap.set(device.id.toString(), device);
    });

    // Merge API device data with stored company IDs
    const devices = apiResult.data.data.map(device => {
      const storedDevice = storedDevicesMap.get(device.id.toString());
      return {
        id: storedDevice.id,
        sn: device.sn,
        alias: device.alias,
        ip: device.ip_address,
        lastActivity: device.last_activity,
        companyId: storedDevice.companyId,
        status: device.status
      };
    });

    return res.json({
      success: true,
      devices
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update device company ID
router.post('/devices/:deviceId/company', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const { companyId } = req.body;

    if (!deviceId || companyId === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Device ID and Company ID are required'
      });
    }

    // Update the company ID for the device
    // Pass deviceId directly without converting to Number to preserve original format
    await dbService.updateDeviceCompanyId(deviceId, companyId);

    return res.json({
      success: true,
      message: `Company ID updated for device ${deviceId}`,
      deviceId: deviceId,
      companyId
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Sync all device logs
router.post('/sync-all-logs', async (req, res) => {
  try {
    const result = await apiService.getDeviceLogsAll();

    if (result.success) {
      return res.json({
        success: true,
        message: 'Successfully retrieved all device logs',
        data: result.data,
        rawData: result.rawData
      });
    } else {
      return res.status(400).json({
        success: false,
        error: result.error || 'Failed to retrieve all device logs'
      });
    }
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;