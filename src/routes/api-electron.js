const express = require('express');
const apiService = require('../services/apiService.js');
const dbService = require('../services/dbService.js');
const syncService = require('../services/syncService.js');
const { formatDeviceData } = require('../utils/common.js');

const router = express.Router();

// Start sync
router.post('/sync/start', async (req, res) => {
  const { period, username, password, dryRun } = req.body;

  // Handle dry run for settings validation
  if (dryRun) {
    try {
      // Just attempt login to verify credentials
      const loginResult = await apiService.login(username, password);

      if (loginResult.success) {
        // If this is just to validate credentials, save the settings
        await dbService.saveAuthInfo(username, password, loginResult.data.token);
        await dbService.saveSyncPeriod(period);

        return res.json({
          success: true,
          message: 'Credentials verified and settings saved',
        });
      } else {
        return res.status(401).json({
          success: false,
          error: loginResult.error || 'Login failed',
        });
      }
    } catch (error) {
      return res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  // Regular sync start
  if (!period || !username || !password) {
    return res.status(400).json({
      success: false,
      error: 'Missing required parameters',
    });
  }

  const io = req.app.get('io');
  const result = await syncService.startSync(period, { username, password }, io);

  if (result.success) {
    return res.json({
      success: true,
      message: `Sync started with ${period} minute interval`,
    });
  } else {
    return res.status(401).json({
      success: false,
      error: result.error,
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
    hasCredentials: !!(authInfo.username && authInfo.password),
    lastLogin: authInfo.lastLogin
  });
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
      message: 'Server URL updated'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Device Management APIs

// Get all devices with their company IDs
router.get('/devices', async (req, res) => {
  try {
    // Get devices from the ZK Bio API
    const apiResult = await apiService.getDevices();

    const devices = await formatDeviceData(apiResult);

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

module.exports = router;