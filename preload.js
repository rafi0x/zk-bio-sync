const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld(
  'api',
  {
    send: (channel, data) => {
      // whitelist channels
      let validChannels = [ 'sync-now', 'stop-sync', 'get-settings', 'save-settings', 'get-devices' ];
      if (validChannels.includes(channel)) {
        ipcRenderer.send(channel, data);
      }
    },
    receive: (channel, func) => {
      let validChannels = [ 'sync-status', 'sync-results', 'settings', 'devices-result' ];
      if (validChannels.includes(channel)) {
        // Deliberately strip event as it includes `sender` 
        ipcRenderer.on(channel, (event, ...args) => func(...args));
      }
    }
  }
);

// Fix for scrolling in Electron
window.addEventListener('DOMContentLoaded', () => {
  // Add event listeners to enable scrolling in all scrollable containers
  document.querySelectorAll('.scroll-container').forEach(container => {
    container.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        container.scrollTop += e.deltaY;
      }
    }, { passive: false });
  });

  // Dynamically add listeners for any scroll containers added later
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length) {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            if (node.classList && node.classList.contains('scroll-container')) {
              addScrollListener(node);
            }
            // Check children
            const containers = node.querySelectorAll('.scroll-container');
            containers.forEach(addScrollListener);
          }
        });
      }
    }
  });

  function addScrollListener(element) {
    element.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        element.scrollTop += e.deltaY;
      }
    }, { passive: false });
  }

  // Start observing the document with the configured parameters
  observer.observe(document.body, { childList: true, subtree: true });
});