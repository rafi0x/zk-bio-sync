const dbService = require("../services/dbService");

/**
 * Format device data from API response and merge with stored company IDs
 * @param {Object} payload - API response payload
 * @returns {Array} - Formatted device array or throws an error
 */
async function formatDeviceData(payload) {
  if (!payload || !payload.success) {
    throw new Error(payload?.error || 'Failed to fetch devices from API');
  }

  if (!payload.data || !payload.data.data || !Array.isArray(payload.data.data)) {
    return []; // Return empty array if no devices found
  }

  // Get stored device settings
  const storedDevices = await dbService.getDevices();
  const storedDevicesMap = new Map();

  // Create a map for easy lookup
  storedDevices.forEach(device => {
    storedDevicesMap.set(device.id.toString(), device);
  });

  // Merge API device data with stored company IDs
  const devices = payload.data.data.map(device => {
    const deviceId = device.id.toString();
    const storedDevice = storedDevicesMap.get(deviceId) || { id: deviceId, companyId: null };

    return {
      id: device.id,
      sn: device.sn,
      alias: device.alias,
      ip: device.ip_address,
      lastActivity: device.last_activity,
      companyId: storedDevice.companyId,
      status: device.status
    };
  });

  return devices;
}

module.exports = {
  formatDeviceData
};