const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const config = require('./config');

// Services
const sessionService = require('./services/sessionService');
const roundService = require('./services/roundService');
const seedManager = require('./engine/seeds');

// WebSocket namespaces
const setupGameNamespace = require('./ws/gameNamespace');
const setupControlsNamespace = require('./ws/controlsNamespace');

// Create Express app
const app = express();
app.use(express.json());

// Enable CORS for all origins (configure properly in production)
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Provider-Signature, X-Request-ID');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server with CORS
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

// ==================
// REST API Endpoints
// ==================

/**
 * POST /session/init
 * Platform calls this to initialize a player session
 *
 * Request body:
 * {
 *   "playerId": "player123",
 *   "currency": "EUR",
 *   "token": "random-token",
 *   "timestamp": 1699999999999,
 *   "signature": "hmac-signature",
 *   "callbackBaseUrl": "https://platform.com/game-callbacks"
 * }
 *
 * Response:
 * {
 *   "sessionId": "SESSION-uuid",
 *   "gameUrl": "/game-iframe?sessionId=SESSION-uuid",
 *   "controlsUrl": "/controls-iframe?sessionId=SESSION-uuid"
 * }
 */
app.post('/session/init', (req, res) => {
  try {
    const { playerId, currency, token, timestamp, signature, callbackBaseUrl } = req.body;

    console.log('[API] Session init request:', { playerId, currency, callbackBaseUrl });

    const result = sessionService.createSession({
      playerId,
      currency,
      token,
      timestamp,
      signature,
      callbackBaseUrl
    });

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('[API] Session init error:', error.message);
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /session/:sessionId
 * Get session info (for debugging)
 */
app.get('/session/:sessionId', (req, res) => {
  const session = sessionService.getSession(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Don't expose sensitive data
  res.json({
    sessionId: session.sessionId,
    playerId: session.playerId,
    currency: session.currency,
    isConnected: session.isConnected,
    createdAt: session.createdAt
  });
});

/**
 * GET /provably-fair
 * Get public verification data
 */
app.get('/provably-fair', (req, res) => {
  const publicData = seedManager.getPublicData();
  const history = roundService.getHistory(10);

  res.json({
    current: publicData,
    recentRounds: history.map(r => ({
      roundId: r.id,
      crashPoint: r.crashPoint,
      serverSeed: r.serverSeed,
      serverSeedHash: r.serverSeedHash,
      clientSeed: r.clientSeed,
      nonce: r.nonce
    }))
  });
});

/**
 * POST /provably-fair/verify
 * Verify a specific round
 */
app.post('/provably-fair/verify', (req, res) => {
  const { serverSeed, clientSeed, nonce } = req.body;
  const crashEngine = require('./engine/crashEngine');

  try {
    const crashPoint = crashEngine.calculateCrashPoint(serverSeed, clientSeed, nonce);
    const hash = require('./util/hmac').sha256(serverSeed);

    res.json({
      valid: true,
      crashPoint,
      serverSeedHash: hash
    });
  } catch (error) {
    res.status(400).json({
      valid: false,
      error: error.message
    });
  }
});

/**
 * GET /game/state
 * Get current game state
 */
app.get('/game/state', (req, res) => {
  const round = roundService.getCurrentRoundState();
  const history = roundService.getHistory(20);

  res.json({
    currentRound: round,
    history,
    connectedPlayers: sessionService.getConnectedPlayersCount()
  });
});

/**
 * GET /game/history
 * Get round history
 */
app.get('/game/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const history = roundService.getHistory(limit);
  res.json(history);
});

// ==================
// Serve Frontend Files
// ==================

// Serve game iframe
app.get('/game-iframe', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/game-iframe/index.html'));
});

// Serve controls iframe
app.get('/controls-iframe', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/controls-iframe/index.html'));
});

// Serve static files
app.use('/game-iframe', express.static(path.join(__dirname, '../frontend/game-iframe')));
app.use('/controls-iframe', express.static(path.join(__dirname, '../frontend/controls-iframe')));

// ==================
// Health Check
// ==================

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: Date.now()
  });
});

// ==================
// Initialize WebSocket Namespaces
// ==================

const gameNamespace = setupGameNamespace(io);
const controlsNamespace = setupControlsNamespace(io);

// Pass namespaces to round service for broadcasting
roundService.setNamespaces(gameNamespace, controlsNamespace);

// ==================
// Start Server
// ==================

server.listen(config.PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║            CRASH GAME PROVIDER SERVER                          ║
╠═══════════════════════════════════════════════════════════════╣
║  Server running on port ${config.PORT}                               ║
║                                                               ║
║  Endpoints:                                                   ║
║  - POST /session/init     Initialize player session           ║
║  - GET  /game-iframe      Game visualization iframe           ║
║  - GET  /controls-iframe  Player controls iframe              ║
║  - GET  /provably-fair    Verification data                   ║
║  - GET  /game/state       Current game state                  ║
║  - GET  /game/history     Round history                       ║
║                                                               ║
║  WebSocket Namespaces:                                        ║
║  - /ws/game      Game visualization (read-only)               ║
║  - /ws/controls  Player controls (bet/cashout)                ║
╚═══════════════════════════════════════════════════════════════╝
  `);

  // Start the game loop
  roundService.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  roundService.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  roundService.stop();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
