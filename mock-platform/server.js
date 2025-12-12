/**
 * Mock Platform Server
 * Simulates a casino platform for testing the game provider
 *
 * This handles:
 * - User management with balances
 * - Game callback endpoints (/bet, /win, /rollback, /balance)
 * - Session initialization with the provider
 * - Demo page to embed the game iframes
 */

const express = require('express');
const path = require('path');

const app = express();
app.use(express.json());

// CORS for local development
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, X-Provider-Signature, X-Request-ID');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Configuration
const CONFIG = {
  PORT: 4000,
  PROVIDER_URL: 'http://localhost:3000',
  PLATFORM_CALLBACK_URL: 'http://localhost:4000/game-callbacks'
};

// ==================
// In-Memory Database
// ==================

const users = new Map();
const transactions = [];
let transactionCounter = 1;

// Create some demo users
function initDemoUsers() {
  users.set('player1', {
    id: 'player1',
    username: 'DemoPlayer1',
    balance: 1000.00,
    currency: 'STARS'
  });

  users.set('player2', {
    id: 'player2',
    username: 'DemoPlayer2',
    balance: 500.00,
    currency: 'STARS'
  });

  users.set('player3', {
    id: 'player3',
    username: 'HighRoller',
    balance: 10000.00,
    currency: 'STARS'
  });

  console.log('[Platform] Demo users initialized');
}

// ==================
// Helper Functions
// ==================

function generateTransactionId() {
  return `TXN-${Date.now()}-${transactionCounter++}`;
}

function recordTransaction(type, playerId, amount, roundId, details = {}) {
  const tx = {
    id: generateTransactionId(),
    type,
    playerId,
    amount,
    roundId,
    timestamp: Date.now(),
    ...details
  };
  transactions.push(tx);
  console.log(`[Platform] Transaction: ${type} | Player: ${playerId} | Amount: ${amount} | TxID: ${tx.id}`);
  return tx;
}

// ==================
// Game Callback Endpoints
// (Called by the game provider)
// ==================

/**
 * POST /game-callbacks/bet
 * Provider calls this to deduct player balance for a bet
 */
app.post('/game-callbacks/bet', (req, res) => {
  const { requestId, roundId, playerId, sessionId, amount, currency } = req.body;

  console.log(`[Platform] BET callback: player=${playerId}, amount=${amount}, round=${roundId}`);

  const user = users.get(playerId);

  if (!user) {
    return res.json({
      status: 'ERROR',
      code: 'INVALID_PLAYER',
      message: 'Player not found'
    });
  }

  if (user.balance < amount) {
    return res.json({
      status: 'ERROR',
      code: 'INSUFFICIENT_FUNDS',
      message: `Insufficient balance. Available: ${user.balance.toFixed(2)} ${user.currency}`
    });
  }

  // Deduct balance
  user.balance -= amount;
  user.balance = Math.round(user.balance * 100) / 100;

  // Record transaction
  const tx = recordTransaction('BET', playerId, -amount, roundId, { requestId, sessionId });

  res.json({
    status: 'OK',
    transactionId: tx.id,
    newBalance: user.balance
  });
});

/**
 * POST /game-callbacks/win
 * Provider calls this to credit player winnings
 */
app.post('/game-callbacks/win', (req, res) => {
  const { requestId, roundId, playerId, sessionId, betAmount, multiplier, winAmount, currency, betTransactionId } = req.body;

  console.log(`[Platform] WIN callback: player=${playerId}, win=${winAmount}, multiplier=${multiplier}x, round=${roundId}`);

  const user = users.get(playerId);

  if (!user) {
    return res.json({
      status: 'ERROR',
      code: 'INVALID_PLAYER',
      message: 'Player not found'
    });
  }

  // Credit winnings
  user.balance += winAmount;
  user.balance = Math.round(user.balance * 100) / 100;

  // Record transaction
  const tx = recordTransaction('WIN', playerId, winAmount, roundId, {
    requestId,
    sessionId,
    betTransactionId,
    multiplier,
    betAmount
  });

  res.json({
    status: 'OK',
    transactionId: tx.id,
    newBalance: user.balance
  });
});

/**
 * POST /game-callbacks/rollback
 * Provider calls this to refund a bet
 */
app.post('/game-callbacks/rollback', (req, res) => {
  const { requestId, roundId, playerId, sessionId, amount, currency, originalTransactionId, reason } = req.body;

  console.log(`[Platform] ROLLBACK callback: player=${playerId}, amount=${amount}, reason=${reason}`);

  const user = users.get(playerId);

  if (!user) {
    return res.json({
      status: 'ERROR',
      code: 'INVALID_PLAYER',
      message: 'Player not found'
    });
  }

  // Refund the amount
  user.balance += amount;
  user.balance = Math.round(user.balance * 100) / 100;

  // Record transaction
  const tx = recordTransaction('ROLLBACK', playerId, amount, roundId, {
    requestId,
    sessionId,
    originalTransactionId,
    reason
  });

  res.json({
    status: 'OK',
    transactionId: tx.id,
    newBalance: user.balance
  });
});

/**
 * POST /game-callbacks/balance
 * Provider calls this to get current player balance
 */
app.post('/game-callbacks/balance', (req, res) => {
  const { playerId, sessionId } = req.body;

  console.log(`[Platform] BALANCE callback: player=${playerId}`);

  const user = users.get(playerId);

  if (!user) {
    return res.json({
      status: 'ERROR',
      code: 'INVALID_PLAYER',
      message: 'Player not found'
    });
  }

  res.json({
    status: 'OK',
    balance: user.balance,
    currency: user.currency
  });
});

// ==================
// Platform API Endpoints
// ==================

/**
 * GET /api/users
 * List all users
 */
app.get('/api/users', (req, res) => {
  const userList = Array.from(users.values()).map(u => ({
    id: u.id,
    username: u.username,
    balance: u.balance,
    currency: u.currency
  }));
  res.json(userList);
});

/**
 * GET /api/users/:id
 * Get user details
 */
app.get('/api/users/:id', (req, res) => {
  const user = users.get(req.params.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }
  res.json(user);
});

/**
 * POST /api/users/:id/deposit
 * Add funds to user
 */
app.post('/api/users/:id/deposit', (req, res) => {
  const { amount } = req.body;
  const user = users.get(req.params.id);

  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  user.balance += parseFloat(amount);
  user.balance = Math.round(user.balance * 100) / 100;

  recordTransaction('DEPOSIT', user.id, amount, null);

  res.json({ success: true, newBalance: user.balance });
});

/**
 * GET /api/transactions
 * List recent transactions
 */
app.get('/api/transactions', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  res.json(transactions.slice(-limit).reverse());
});

/**
 * POST /api/launch-game
 * Initialize a game session with the provider
 */
app.post('/api/launch-game', async (req, res) => {
  const { playerId } = req.body;

  const user = users.get(playerId);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  try {
    // Call provider to initialize session
    const response = await fetch(`${CONFIG.PROVIDER_URL}/session/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        playerId: user.id,
        currency: user.currency,
        token: `token-${Date.now()}`,
        timestamp: Date.now(),
        callbackBaseUrl: CONFIG.PLATFORM_CALLBACK_URL
      })
    });

    const data = await response.json();

    if (!data.success) {
      throw new Error(data.error || 'Failed to initialize session');
    }

    res.json({
      success: true,
      sessionId: data.sessionId,
      gameUrl: `${CONFIG.PROVIDER_URL}${data.gameUrl}`,
      controlsUrl: `${CONFIG.PROVIDER_URL}${data.controlsUrl}`
    });
  } catch (error) {
    console.error('[Platform] Failed to launch game:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ==================
// Serve Demo Frontend
// ==================

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.use(express.static(__dirname));

// ==================
// Start Server
// ==================

initDemoUsers();

app.listen(CONFIG.PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║              MOCK PLATFORM SERVER                              ║
╠═══════════════════════════════════════════════════════════════╣
║  Platform running on port ${CONFIG.PORT}                             ║
║  Provider URL: ${CONFIG.PROVIDER_URL}                          ║
║                                                               ║
║  Demo Page: http://localhost:${CONFIG.PORT}                          ║
║                                                               ║
║  Demo Users:                                                  ║
║  - player1 (DemoPlayer1)  - 1000.00 STARS                     ║
║  - player2 (DemoPlayer2)  - 500.00 STARS                      ║
║  - player3 (HighRoller)   - 10000.00 STARS                    ║
║                                                               ║
║  Callback Endpoints:                                          ║
║  - POST /game-callbacks/bet                                   ║
║  - POST /game-callbacks/win                                   ║
║  - POST /game-callbacks/rollback                              ║
║  - POST /game-callbacks/balance                               ║
╚═══════════════════════════════════════════════════════════════╝
  `);
});
