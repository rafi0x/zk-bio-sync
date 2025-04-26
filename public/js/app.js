document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Main UI
  const dashboardTab = document.getElementById('dashboard-tab');
  const settingsTab = document.getElementById('settings-tab');
  const devicesTab = document.getElementById('devices-tab');
  const dashboardContent = document.getElementById('dashboard-content');
  const settingsContent = document.getElementById('settings-content');
  const devicesContent = document.getElementById('devices-content');
  const toggleSyncBtn = document.getElementById('toggle-sync-btn');
  const syncStatusIcon = document.getElementById('sync-status-icon');
  const syncStatusText = document.getElementById('sync-status-text');
  const statusCircle = document.getElementById('status-circle');
  const statusIndicator = document.getElementById('status-indicator');
  const nextSyncInfo = document.getElementById('next-sync-info');
  const nextSyncTime = document.getElementById('next-sync-time');

  // DOM Elements - Settings
  const settingsForm = document.getElementById('settings-form');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const syncPeriodSelect = document.getElementById('sync-period');
  const serverUrlInput = document.getElementById('server-url');

  // DOM Elements - Logs
  const logsContainer = document.getElementById('logs');
  const clearLogsBtn = document.getElementById('clear-logs');
  const exportLogsBtn = document.getElementById('export-logs');

  // DOM Elements - Devices
  const refreshDevicesBtn = document.getElementById('refresh-devices');
  const devicesLoading = document.getElementById('devices-loading');
  const devicesError = document.getElementById('devices-error');
  const devicesTableContainer = document.getElementById('devices-table-container');
  const devicesTableBody = document.getElementById('devices-table-body');
  const retryDevicesBtn = document.getElementById('retry-devices');

  // Application state
  let isRunning = false;
  let countdown = 0;
  let countdownInterval = null;
  let settingsConfigured = false;

  // Socket.io connection
  const socket = io();

  // Tab Management
  dashboardTab.addEventListener('click', () => switchTab('dashboard'));
  settingsTab.addEventListener('click', () => switchTab('settings'));
  devicesTab.addEventListener('click', () => {
    switchTab('devices');
    loadDevices();
  });

  function switchTab(tabName) {
    // Reset tab styling
    dashboardTab.classList.remove('text-blue-400', 'border-b-2', 'border-blue-500');
    dashboardTab.classList.add('text-gray-400', 'hover:text-white');
    settingsTab.classList.remove('text-blue-400', 'border-b-2', 'border-blue-500');
    settingsTab.classList.add('text-gray-400', 'hover:text-white');
    devicesTab.classList.remove('text-blue-400', 'border-b-2', 'border-blue-500');
    devicesTab.classList.add('text-gray-400', 'hover:text-white');

    // Hide all tab contents
    dashboardContent.classList.remove('active');
    settingsContent.classList.remove('active');
    devicesContent.classList.remove('active');

    // Activate selected tab
    if (tabName === 'dashboard') {
      dashboardTab.classList.add('text-blue-400', 'border-b-2', 'border-blue-500');
      dashboardTab.classList.remove('text-gray-400', 'hover:text-white');
      dashboardContent.classList.add('active');
    } else if (tabName === 'settings') {
      settingsTab.classList.add('text-blue-400', 'border-b-2', 'border-blue-500');
      settingsTab.classList.remove('text-gray-400', 'hover:text-white');
      settingsContent.classList.add('active');
    } else if (tabName === 'devices') {
      devicesTab.classList.add('text-blue-400', 'border-b-2', 'border-blue-500');
      devicesTab.classList.remove('text-gray-400', 'hover:text-white');
      devicesContent.classList.add('active');
    }
  }

  // Initialize application
  initializeApplication();

  // Event Listeners
  toggleSyncBtn.addEventListener('click', toggleSync);
  settingsForm.addEventListener('submit', saveSettings);
  clearLogsBtn.addEventListener('click', clearLogs);
  exportLogsBtn.addEventListener('click', exportLogs);
  refreshDevicesBtn.addEventListener('click', loadDevices);
  retryDevicesBtn.addEventListener('click', loadDevices);

  // Socket events
  socket.on('log', handleLogEvent);

  // Application Functions
  async function initializeApplication() {
    try {
      // Load saved server URL if available
      const serverConfig = await fetchServerConfig();
      if (serverConfig && serverConfig.url) {
        serverUrlInput.value = serverConfig.url;
      }

      // Load saved settings
      const settings = await fetchSettings();
      if (settings) {
        // Populate settings form
        if (settings.username) {
          usernameInput.value = settings.username;
        }

        if (settings.syncPeriod) {
          syncPeriodSelect.value = settings.syncPeriod;
        }

        // Check if settings are configured
        settingsConfigured = !!(settings.username && settings.password);
      }

      // Check current sync status
      const statusResponse = await fetch('/api/sync/status');
      const statusData = await statusResponse.json();

      if (statusData.isRunning) {
        // Update UI for running state
        isRunning = true;
        updateSyncUI(true);
        startCountdown();

        addLogEntry({
          timestamp: new Date().toISOString(),
          api: 'System',
          message: 'Sync process is active from a previous session',
        });
      } else {
        updateSyncUI(false);

        // Check if settings are configured - if not, switch to settings tab
        if (!settingsConfigured) {
          switchTab('settings');
          addLogEntry({
            timestamp: new Date().toISOString(),
            api: 'System',
            message: 'Please configure your settings before starting sync',
          });
        }
      }

    } catch (error) {
      console.error('Error initializing application:', error);
      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: `Initialization error: ${error.message}`,
      });
    }
  }

  async function fetchSettings() {
    try {
      // Load saved credentials
      const credentialsResponse = await fetch('/api/settings/credentials');
      const credentialsData = await credentialsResponse.json();

      // Load saved sync period
      const syncPeriodResponse = await fetch('/api/settings/syncperiod');
      const syncPeriodData = await syncPeriodResponse.json();

      return {
        username: credentialsData.username,
        password: credentialsData.hasCredentials ? '********' : '',
        syncPeriod: syncPeriodData.syncPeriod,
        hasCredentials: credentialsData.hasCredentials,
        lastLogin: credentialsData.lastLogin
      };
    } catch (error) {
      console.error('Error fetching settings:', error);
      return null;
    }
  }

  async function fetchServerConfig() {
    // In a real app, this would fetch from the database via an API
    // For now, we'll return the hardcoded value
    return { url: 'http://192.168.1.100:90' };
  }

  async function toggleSync() {
    if (!settingsConfigured) {
      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: 'Please configure your settings first',
      });
      switchTab('settings');
      return;
    }

    if (isRunning) {
      await stopSync();
    } else {
      await startSync();
    }
  }

  async function startSync() {
    try {
      // Get settings for sync
      const settings = await fetchSettings();

      // Fetch the actual password from settings (not the masked one)
      let password = passwordInput.value;
      if (!password || password === '********') {
        // If we don't have a new password, use the saved one
        // In a real implementation, this would be handled better
        password = 'admin7445'; // Default from postman collection for demo
      }

      const response = await fetch('/api/sync/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: settings.username || usernameInput.value,
          password: password,
          period: settings.syncPeriod || syncPeriodSelect.value
        }),
      });

      const data = await response.json();

      if (response.ok) {
        isRunning = true;
        updateSyncUI(true);
        startCountdown();

        addLogEntry({
          timestamp: new Date().toISOString(),
          api: 'System',
          message: `Sync process started with ${settings.syncPeriod || syncPeriodSelect.value} minute interval`,
        });
      } else {
        addLogEntry({
          timestamp: new Date().toISOString(),
          api: 'System',
          success: false,
          error: data.error || 'Failed to start sync',
        });
      }
    } catch (error) {
      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: `Error: ${error.message}`,
      });
    }
  }

  async function stopSync() {
    try {
      const response = await fetch('/api/sync/stop', {
        method: 'POST',
      });

      const data = await response.json();

      if (response.ok) {
        isRunning = false;
        updateSyncUI(false);
        stopCountdown();
      } else {
        addLogEntry({
          timestamp: new Date().toISOString(),
          api: 'System',
          success: false,
          error: data.message || 'Failed to stop sync',
        });
      }
    } catch (error) {
      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: `Error: ${error.message}`,
      });
    }
  }

  async function saveSettings(e) {
    e.preventDefault();

    const username = usernameInput.value;
    const password = passwordInput.value;
    const period = syncPeriodSelect.value;
    const serverUrl = serverUrlInput.value;

    if (!username || !password) {
      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: 'Username and password are required',
      });
      return;
    }

    try {
      // For a real implementation, we'd save server URL here too
      // For this demo, we'll just log it
      console.log('Server URL would be saved:', serverUrl);

      // If we're already running, stop the sync first
      if (isRunning) {
        await stopSync();
      }

      // Make a dummy login request to verify credentials
      const loginResponse = await fetch('/api/sync/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username,
          password,
          period,
          dryRun: true // Indicate this is just a test
        }),
      });

      if (loginResponse.ok) {
        settingsConfigured = true;

        addLogEntry({
          timestamp: new Date().toISOString(),
          api: 'System',
          message: 'Settings saved successfully',
        });

        // Switch back to dashboard
        switchTab('dashboard');
      } else {
        const data = await loginResponse.json();
        addLogEntry({
          timestamp: new Date().toISOString(),
          api: 'System',
          success: false,
          error: data.error || 'Invalid credentials',
        });
      }
    } catch (error) {
      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: `Error saving settings: ${error.message}`,
      });
    }
  }

  function updateSyncUI(isActive) {
    if (isActive) {
      // Update button
      toggleSyncBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8 7a1 1 0 00-1 1v4a1 1 0 001 1h4a1 1 0 001-1V8a1 1 0 00-1-1H8z" clip-rule="evenodd" />
        </svg>
        Stop Sync
      `;
      toggleSyncBtn.classList.remove('bg-blue-600', 'hover:bg-blue-700');
      toggleSyncBtn.classList.add('bg-red-600', 'hover:bg-red-700');

      // Update status indicators
      statusIndicator.textContent = 'Active';
      statusIndicator.classList.remove('text-gray-400');
      statusIndicator.classList.add('text-green-400');

      syncStatusIcon.textContent = '⟳';
      syncStatusIcon.classList.remove('text-gray-500');
      syncStatusIcon.classList.add('text-green-500');

      syncStatusText.textContent = 'Running';
      syncStatusText.classList.remove('text-gray-400');
      syncStatusText.classList.add('text-green-400');

      statusCircle.classList.remove('border-gray-700');
      statusCircle.classList.add('border-green-500');

      // Show next sync info
      nextSyncInfo.classList.remove('hidden');

    } else {
      // Update button
      toggleSyncBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clip-rule="evenodd" />
        </svg>
        Start Sync
      `;
      toggleSyncBtn.classList.remove('bg-red-600', 'hover:bg-red-700');
      toggleSyncBtn.classList.add('bg-blue-600', 'hover:bg-blue-700');

      // Update status indicators
      statusIndicator.textContent = 'Inactive';
      statusIndicator.classList.remove('text-green-400');
      statusIndicator.classList.add('text-gray-400');

      syncStatusIcon.textContent = '⏸';
      syncStatusIcon.classList.remove('text-green-500');
      syncStatusIcon.classList.add('text-gray-500');

      syncStatusText.textContent = 'Not Running';
      syncStatusText.classList.remove('text-green-400');
      syncStatusText.classList.add('text-gray-400');

      statusCircle.classList.remove('border-green-500');
      statusCircle.classList.add('border-gray-700');

      // Hide next sync info
      nextSyncInfo.classList.add('hidden');
    }
  }

  async function startCountdown() {
    try {
      // Fetch the latest config with lastSyncTime
      const response = await fetch('/api/sync/status');
      const statusData = await response.json();
      const lastSyncTime = new Date(statusData.lastSyncTime || new Date());

      // Get the sync period in minutes and convert to milliseconds
      const periodMinutes = parseInt(syncPeriodSelect.value);
      const periodMs = periodMinutes * 60 * 1000;

      // Calculate how much time has passed since last sync
      const now = new Date();
      const elapsedMs = now - lastSyncTime;

      // Calculate remaining time until next sync
      let remainingMs = periodMs - (elapsedMs % periodMs);
      if (remainingMs <= 0) {
        remainingMs = periodMs; // If time has already passed, use full period
      }

      // Convert remaining time to seconds for countdown
      countdown = Math.floor(remainingMs / 1000);

      // Update UI initially
      updateCountdown();

      // Clear any existing interval
      stopCountdown();

      // Start new interval
      countdownInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          // Reset countdown for next cycle
          countdown = periodMinutes * 60;
        }
        updateCountdown();
      }, 1000);
    } catch (error) {
      console.error('Error starting countdown:', error);
      // Fallback to original behavior if there's an error
      const period = parseInt(syncPeriodSelect.value);
      countdown = period * 60;
      updateCountdown();

      stopCountdown();
      countdownInterval = setInterval(() => {
        countdown--;
        if (countdown <= 0) {
          countdown = period * 60;
        }
        updateCountdown();
      }, 1000);
    }
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval);
      countdownInterval = null;
    }
  }

  function updateCountdown() {
    const minutes = Math.floor(countdown / 60);
    const seconds = countdown % 60;
    nextSyncTime.textContent = `${minutes}:${seconds < 10 ? '0' + seconds : seconds}`;
  }

  async function loadDevices() {
    // Show loading state
    devicesLoading.classList.remove('hidden');
    devicesError.classList.add('hidden');
    devicesTableContainer.classList.add('hidden');

    try {
      const response = await fetch('/api/devices');
      const data = await response.json();

      if (response.ok && data.success) {
        renderDevicesTable(data.devices);

        // Hide loading, show table
        devicesLoading.classList.add('hidden');
        devicesTableContainer.classList.remove('hidden');
      } else {
        throw new Error(data.error || 'Failed to load devices');
      }
    } catch (error) {
      console.error('Error loading devices:', error);

      // Show error state
      devicesLoading.classList.add('hidden');
      devicesError.classList.remove('hidden');

      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: `Failed to load devices: ${error.message}`,
      });
    }
  }

  function renderDevicesTable(devices) {
    console.log("🚀 ~ renderDevicesTable ~ devices:", devices);
    // Clear existing rows
    devicesTableBody.innerHTML = '';

    if (devices.length === 0) {
      const emptyRow = document.createElement('tr');
      emptyRow.innerHTML = `
        <td colspan="4" class="px-4 py-8 text-center text-gray-500">
          No devices found
        </td>
      `;
      devicesTableBody.appendChild(emptyRow);
      return;
    }

    // Add a row for each device
    devices.forEach(device => {
      const row = document.createElement('tr');
      row.className = 'border-t border-gray-800';

      row.innerHTML = `
        <td class="px-4 py-3">${device.id}</td>
        <td class="px-4 py-3">${device.alias || device.sn || 'Unknown'}</td>
        <td class="px-4 py-3">${device.ip || 'N/A'}</td>
        <td class="px-4 py-3">
          <div class="flex items-center">
            <input 
              type="text" 
              class="w-36 px-3 py-1 bg-gray-800 border border-gray-700 rounded-md mr-2 focus:outline-none focus:ring-2 focus:ring-blue-500" 
              value="${device.companyId || ''}" 
              placeholder="Enter ID"
              data-device-id="${device.id}"
            >
            <button
              class="save-company-id px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md text-sm"
              data-device-id="${device.id}"
            >
              Save
            </button>
          </div>
        </td>
      `;

      devicesTableBody.appendChild(row);
    });

    // Add event listeners to save buttons
    document.querySelectorAll('.save-company-id').forEach(button => {
      button.addEventListener('click', async (e) => {
        const deviceId = e.target.getAttribute('data-device-id');
        const input = document.querySelector(`input[data-device-id="${deviceId}"]`);
        const companyId = input.value.trim();

        await saveCompanyId(deviceId, companyId);
      });
    });
  }

  async function saveCompanyId(deviceId, companyId) {
    try {
      const response = await fetch(`/api/devices/${deviceId}/company`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ companyId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        addLogEntry({
          timestamp: new Date().toISOString(),
          api: 'Devices',
          message: `Company ID for device ${deviceId} updated to "${companyId}"`,
        });

        // Highlight the input briefly
        const input = document.querySelector(`input[data-device-id="${deviceId}"]`);
        input.classList.add('bg-green-900');
        setTimeout(() => {
          input.classList.remove('bg-green-900');
        }, 500);

      } else {
        throw new Error(data.error || 'Failed to update company ID');
      }
    } catch (error) {
      console.error('Error saving company ID:', error);
      addLogEntry({
        timestamp: new Date().toISOString(),
        api: 'System',
        success: false,
        error: `Failed to save company ID: ${error.message}`,
      });
    }
  }

  function handleLogEvent(data) {
    addLogEntry(data);
  }

  function addLogEntry(data) {
    const entry = document.createElement('div');
    entry.className = 'log-entry py-2 border-b border-gray-800';

    const timestamp = new Date(data.timestamp).toLocaleTimeString();

    if (data.success === false) {
      entry.innerHTML = `
        <div class="flex items-start">
          <span class="text-red-400 font-bold mr-2">●</span>
          <div>
            <div class="flex items-center">
              <span class="text-red-400">[${timestamp}]</span>
              <span class="text-red-400 font-semibold mx-2">[${data.api}]</span>
              <span class="text-red-400">Error</span>
            </div>
            <div class="pl-2 text-red-300 mt-1">${data.error}</div>
          </div>
        </div>
      `;
    } else if (data.message) {
      entry.innerHTML = `
        <div class="flex items-start">
          <span class="text-blue-400 font-bold mr-2">●</span>
          <div>
            <div class="flex items-center">
              <span class="text-gray-400">[${timestamp}]</span>
              <span class="text-blue-400 font-semibold mx-2">[${data.api}]</span>
            </div>
            <div class="pl-2 text-blue-300 mt-1">${data.message}</div>
          </div>
        </div>
      `;
    } else {
      let statusColor = data.success ? 'text-green-400' : 'text-red-400';
      let statusIcon = data.success ? '✓' : '✗';

      entry.innerHTML = `
        <div class="flex items-start">
          <span class="${statusColor} font-bold mr-2">●</span>
          <div>
            <div class="flex items-center">
              <span class="text-gray-400">[${timestamp}]</span>
              <span class="text-blue-400 font-semibold mx-2">[${data.api}]</span>
              <span class="${statusColor}">${statusIcon}</span>
            </div>
          </div>
        </div>
      `;
    }

    // Clear the placeholder text if it exists
    if (logsContainer.querySelector('.text-gray-500')) {
      logsContainer.innerHTML = '';
    }

    logsContainer.prepend(entry);
  }

  function clearLogs() {
    logsContainer.innerHTML = '<div class="text-gray-500">Logs cleared</div>';
  }

  function exportLogs() {
    // Get all logs
    const logEntries = Array.from(logsContainer.querySelectorAll('.log-entry'));

    // Create an exportable string
    let exportText = "ZK Bio Sync - Log Export\n";
    exportText += `Generated: ${new Date().toLocaleString()}\n\n`;

    logEntries.reverse().forEach(entry => {
      // Extract text content and clean it up
      const text = entry.textContent.trim().replace(/\s+/g, ' ');
      exportText += text + "\n\n";
    });

    // Create a blob and download
    const blob = new Blob([ exportText ], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    // Create temporary link and trigger download
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = `zk-bio-sync-logs-${new Date().toISOString().slice(0, 10)}.txt`;

    document.body.appendChild(a);
    a.click();

    // Clean up
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);

    addLogEntry({
      timestamp: new Date().toISOString(),
      api: 'System',
      message: 'Logs exported successfully',
    });
  }

  function formatJsonData(data) {
    if (!data) return 'No data';

    try {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      // Format the JSON with indentation
      return JSON.stringify(data, null, 2);
    } catch (e) {
      // If it's not valid JSON, just return as string
      return typeof data === 'object' ? JSON.stringify(data) : String(data);
    }
  }

  // Load devices when the devices tab is first accessed via code
  if (window.location.hash === '#devices') {
    switchTab('devices');
    loadDevices();
  }
});