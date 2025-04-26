// Use CommonJS require style for Electron compatibility
const cors = require('cors');
const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const apiService = require('./src/services/apiService.js');

// Initialize express app
const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Make io globally available for services
global.io = io;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Make io accessible to routes
app.set('io', io);

// Import routes using CommonJS style
const apiRoutes = require('./src/routes/api-electron.js');

// API routes
app.use('/api', apiRoutes);

// Socket.io connection
io.on('connection', (socket) => {

  socket.on('disconnect', () => {
  });

  socket.on('sync-now', async () => {
    try {
      const results = await apiService.runSyncSequence();
      socket.emit('sync-results', { success: true, results });
    } catch (error) {
      socket.emit('sync-results', {
        success: false,
        error: error.message || 'Sync failed'
      });
    }
  });
});

// Start server
const PORT = process.env.PORT || 4000;
server.listen(PORT, () => {
});

module.exports = server;