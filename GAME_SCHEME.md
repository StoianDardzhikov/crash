# Casino Game Provider Scheme

Complete template for building casino game providers. This file contains all information needed to construct a new game.

---

## Path Replacement Rule

**Replace `/{game}` with your game name** (e.g., `/roulette`, `/blackjack`, `/dice`, `/coinflip`) ONLY in these specific locations:

1. **testServer.js**:

   - Route prefix: `app.use('/{game}', router)`
   - Socket.IO path: `path: '/{game}/socket.io'`

2. **frontend/game-iframe/index.html**:

   - `<script src="/{game}/socket.io/socket.io.js">`
   - `<script src="/{game}/game-iframe/game.js">`

3. **frontend/controls-iframe/index.html**:

   - `<script src="/{game}/socket.io/socket.io.js">`
   - `<script src="/{game}/controls-iframe/controls.js">`

4. **frontend/game-iframe/game.js**:

   - `path: "/{game}/socket.io/"`

5. **frontend/controls-iframe/controls.js**:
   - `path: "/{game}/socket.io/"`

**Standard endpoints do NOT get the game prefix:**
`/session/init`, `/game-iframe`, `/controls-iframe`, `/ws/game`, `/ws/controls`, etc.

---

## Directory Structure

```
{game-name}/
├── backend/
│   ├── engine/
│   │   ├── {game}Engine.js      # Core game logic & outcome calculation
│   │   └── seeds.js             # Provably fair seed chain
│   ├── services/
│   │   ├── sessionService.js    # Player session management
│   │   ├── roundService.js      # Round/game lifecycle orchestration
│   │   ├── betService.js        # Bet placement & payout logic
│   │   └── callbackService.js   # HTTP callbacks to platform
│   ├── ws/
│   │   ├── gameNamespace.js     # Game visualization WebSocket handler
│   │   └── controlsNamespace.js # Player controls WebSocket handler
│   ├── util/
│   │   └── hmac.js              # Cryptographic utilities
│   ├── config.js                # Configuration & constants
│   ├── server.js                # Main Express/Socket.IO server
│   └── testServer.js            # Test server with /{game} prefix
├── frontend/
│   ├── game-iframe/
│   │   ├── index.html           # Game visualization UI
│   │   └── game.js              # Game rendering & animations
│   └── controls-iframe/
│       ├── index.html           # Player controls UI
│       └── controls.js          # Bet input, actions, balance display
├── package.json
└── README.md
```

---

## Architecture Overview

### Two-Iframe System

```
                     Platform Frontend
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
     ┌─────────┐       ┌─────────┐      ┌──────────┐
     │ Game    │       │Controls │      │Platform  │
     │ Iframe  │       │Iframe   │      │Backend   │
     │(Display)│       │(Actions)│      │          │
     └────┬────┘       └────┬────┘      └────┬─────┘
          │                 │                │
     WebSocket         WebSocket         HTTP Callbacks
     /ws/game          /ws/controls          │
          │                 │                │
          └────────┬────────┴────────────────┘
                   │
            Game Provider Backend
```

**Key Rules:**

1. Iframes NEVER communicate directly with each other
2. All communication via WebSocket through provider backend
3. All balance operations via platform HTTP callbacks
4. Game iframe is READ-ONLY (displays game state only)
5. Controls iframe handles ALL player interactions (bets, actions)

---

## REST API Endpoints

### Session Management

| Method | Endpoint              | Purpose                                         |
| ------ | --------------------- | ----------------------------------------------- |
| POST   | `/session/init`       | Initialize player session (platform calls this) |
| GET    | `/session/:sessionId` | Get session info                                |

#### POST `/session/init`

**Request (from Platform):**

```json
{
  "playerId": "player-uuid-123",
  "currency": "EUR",
  "callbackBaseUrl": "https://platform.com/api/provider-callbacks",
  "token": "platform-auth-token",
  "timestamp": 1699999999999,
  "signature": "hmac-sha256-signature"
}
```

**Response:**

```json
{
  "sessionId": "SESSION-uuid-xxx",
  "gameUrl": "/game-iframe?sessionId=SESSION-xxx",
  "controlsUrl": "/controls-iframe?sessionId=SESSION-xxx",
  "expiresAt": 1700086399999
}
```

### Game State

| Method | Endpoint        | Purpose                      |
| ------ | --------------- | ---------------------------- |
| GET    | `/game/state`   | Get current game/round state |
| GET    | `/game/history` | Get round history (?limit=N) |

#### GET `/game/state`

**Response:**

```json
{
  "state": "BETTING|RUNNING|ENDED|WAITING",
  "roundId": "R-timestamp-nonce",
  "timeRemaining": 5000,
  "connectedPlayers": 42,
  "gameSpecificData": {}
}
```

### Provably Fair

| Method | Endpoint                | Purpose                      |
| ------ | ----------------------- | ---------------------------- |
| GET    | `/provably-fair`        | Get public verification data |
| POST   | `/provably-fair/verify` | Verify outcome for a round   |

### Iframe Serving

| Method | Endpoint           | Purpose                              |
| ------ | ------------------ | ------------------------------------ |
| GET    | `/game-iframe`     | Serve game visualization iframe HTML |
| GET    | `/controls-iframe` | Serve player controls iframe HTML    |

### Health Check

| Method | Endpoint  | Purpose               |
| ------ | --------- | --------------------- |
| GET    | `/health` | Health check endpoint |

---

## Test Server with Prefix

When using `testServer.js`, all endpoints are prefixed with `/{game}`:

```javascript
app.use("/{game}", gameRouter);
```

This means:

- `POST /{game}/session/init`
- `GET /{game}/game-iframe`
- `GET /{game}/controls-iframe`
- etc.

---

## WebSocket Namespaces

### Game Namespace: `/{game}/ws/game`

**Purpose:** Read-only game visualization (displays game state, animations, history)

**Connection:** `io('/{game}/ws/game', { path: "/{game}/socket.io/", query: { sessionId } })`

#### Events FROM Server TO Client:

| Event           | Payload                                               | Description                            |
| --------------- | ----------------------------------------------------- | -------------------------------------- |
| `betting_phase` | `{ roundId, duration, serverSeedHash }`               | Betting phase started                  |
| `round_start`   | `{ roundId, startTime, gameData }`                    | Round started                          |
| `round_tick`    | `{ elapsed, gameData }`                               | Game state update (for animated games) |
| `round_end`     | `{ roundId, outcome, serverSeed, clientSeed, nonce }` | Round ended with result & verification |
| `waiting`       | `{ nextRoundIn }`                                     | Waiting for next round                 |
| `history`       | `[{ roundId, outcome, timestamp }]`                   | Recent round history                   |
| `error`         | `{ message, code }`                                   | Error notification                     |

#### Events FROM Client TO Server:

None (read-only namespace)

---

### Controls Namespace: `/{game}/ws/controls`

**Purpose:** Player interactions (betting, game actions, balance display)

**Connection:** `io('/{game}/ws/controls', { path: "/{game}/socket.io/", query: { sessionId } })`

#### Events FROM Server TO Client:

| Event            | Payload                                           | Description                           |
| ---------------- | ------------------------------------------------- | ------------------------------------- |
| `balance_update` | `{ balance, currency }`                           | Player balance updated                |
| `bet_result`     | `{ success, betId, amount, newBalance, error? }`  | Bet placement result                  |
| `action_result`  | `{ success, action, result, newBalance, error? }` | Game action result                    |
| `round_result`   | `{ won, amount, outcome, newBalance }`            | Final result for player's bet         |
| `bet_status`     | `{ hasBet, amount, betData }`                     | Current bet status (on reconnect)     |
| `round_state`    | `{ state, roundId, gameData }`                    | Current round state                   |
| `betting_phase`  | `{ roundId, duration }`                           | Betting phase started                 |
| `round_start`    | `{ roundId, gameData }`                           | Round started                         |
| `round_tick`     | `{ elapsed, gameData }`                           | Game update                           |
| `round_end`      | `{ roundId, outcome }`                            | Round ended                           |
| `player_bet`     | `{ odifdef playerId, amount }`                    | Another player placed bet (broadcast) |
| `player_action`  | `{ odifiedPlayerId, action, result }`             | Another player action (broadcast)     |
| `error`          | `{ message, code }`                               | Error notification                    |
| `waiting`        | `{ nextRoundIn }`                                 | Waiting for next round                |

#### Events FROM Client TO Server:

| Event         | Payload                            | Description                             |
| ------------- | ---------------------------------- | --------------------------------------- |
| `bet`         | `{ amount, betType?, selection? }` | Place a bet                             |
| `action`      | `{ action, params? }`              | Game action (cashout, hit, stand, etc.) |
| `get_balance` | `{}`                               | Request balance from platform           |

---

## Platform Callback System

Provider makes HTTP POST requests to platform's `callbackBaseUrl`.

### Headers (All Callbacks)

```
Content-Type: application/json
X-Provider-Signature: {HMAC-SHA256(PROVIDER_SECRET, JSON.stringify(body))}
X-Request-ID: {requestId}
```

### 1. Bet Placement: `POST {callbackBaseUrl}/bet`

**Request:**

```json
{
  "requestId": "BET-{roundId}-{playerId}-{timestamp}",
  "roundId": "R-xxx",
  "playerId": "player-123",
  "sessionId": "SESSION-xxx",
  "amount": 10.0,
  "currency": "EUR",
  "betType": "optional-bet-type",
  "selection": "optional-selection",
  "timestamp": 1699999999999
}
```

**Success Response:**

```json
{
  "status": "OK",
  "transactionId": "TXN-123",
  "newBalance": 90.0
}
```

**Error Response:**

```json
{
  "status": "ERROR",
  "code": "INSUFFICIENT_FUNDS|INVALID_SESSION|BET_LIMIT_EXCEEDED|INVALID_BET",
  "message": "Human readable error"
}
```

### 2. Win Credit: `POST {callbackBaseUrl}/win`

**Request:**

```json
{
  "requestId": "WIN-{roundId}-{playerId}-{timestamp}",
  "roundId": "R-xxx",
  "playerId": "player-123",
  "sessionId": "SESSION-xxx",
  "betAmount": 10.0,
  "multiplier": 2.5,
  "winAmount": 25.0,
  "currency": "EUR",
  "betTransactionId": "TXN-123",
  "outcome": "game-specific-outcome",
  "timestamp": 1699999999999
}
```

**Response:**

```json
{
  "status": "OK",
  "transactionId": "TXN-456",
  "newBalance": 115.0
}
```

### 3. Rollback: `POST {callbackBaseUrl}/rollback`

**Request:**

```json
{
  "requestId": "ROLLBACK-{roundId}-{playerId}-{timestamp}",
  "roundId": "R-xxx",
  "playerId": "player-123",
  "sessionId": "SESSION-xxx",
  "amount": 10.0,
  "currency": "EUR",
  "originalTransactionId": "TXN-123",
  "reason": "REGISTRATION_FAILED|TIMEOUT|GAME_ERROR",
  "timestamp": 1699999999999
}
```

**Response:**

```json
{
  "status": "OK",
  "transactionId": "TXN-789",
  "newBalance": 100.0
}
```

### 4. Balance Query: `POST {callbackBaseUrl}/balance`

**Request:**

```json
{
  "playerId": "player-123",
  "sessionId": "SESSION-xxx",
  "timestamp": 1699999999999
}
```

**Response:**

```json
{
  "status": "OK",
  "balance": 100.0,
  "currency": "EUR"
}
```

---

## Session Flow

```
1. Platform calls POST /session/init
   ├── Provider validates signature (HMAC-SHA256)
   ├── Provider creates session with:
   │   ├── playerId, currency, callbackBaseUrl
   │   ├── token, signature (from platform)
   │   ├── createdAt, expiresAt (24h default)
   │   └── balance (fetched from platform via /balance callback)
   └── Returns sessionId + iframe URLs

2. Platform embeds iframes:
   ├── <iframe src="/game-iframe?sessionId=xxx">
   └── <iframe src="/controls-iframe?sessionId=xxx">

3. Iframes connect to WebSocket namespaces:
   ├── Game iframe → /ws/game (read-only)
   └── Controls iframe → /ws/controls (interactive)

4. All balance operations go through platform callbacks
   ├── Bet → /bet callback deducts balance
   ├── Win → /win callback credits winnings
   └── Error → /rollback callback refunds
```

---

## Round Lifecycle

Adapt based on game type:

### For Continuous Games (Crash, Multiplier):

```
WAITING → BETTING (Ns) → RUNNING (outcome climbs) → ENDED (delay) → WAITING
```

### For Turn-Based Games (Roulette, Dice, Coin Flip):

```
WAITING → BETTING (Ns) → SPINNING/ROLLING/FLIPPING → ENDED (show result) → WAITING
```

### For Player-Action Games (Blackjack, Poker):

```
WAITING → BETTING → DEALING → PLAYER_TURN → DEALER_TURN → ENDED → WAITING
```

### Round State Events Flow:

```javascript
// Server broadcasts to all connected clients
gameNamespace.emit("betting_phase", { roundId, duration, serverSeedHash });
controlsNamespace.emit("betting_phase", { roundId, duration });

// ... betting period ...

gameNamespace.emit("round_start", { roundId, gameData });
controlsNamespace.emit("round_start", { roundId });

// ... game running (optional ticks for animated games) ...
gameNamespace.emit("round_tick", { elapsed, currentValue });

// Round ends
gameNamespace.emit("round_end", {
  roundId,
  outcome,
  serverSeed,
  clientSeed,
  nonce,
});
controlsNamespace.emit("round_end", { roundId, outcome });

// Per-player results (sent to individual sockets)
playerSocket.emit("round_result", {
  won: true,
  amount: 25.0,
  outcome,
  newBalance: 115.0,
});
```

---

## Provably Fair System

### How It Works:

1. **Seed Chain Generation:**

   - Generate 10,000 seeds as a hash chain
   - Start with random seed, hash backwards: `seed[i] = SHA256(seed[i+1])`
   - Use seeds from start to end

2. **Per-Round:**

   - Before round: publish `serverSeedHash = SHA256(serverSeed)`
   - After round: reveal `serverSeed` for verification
   - Outcome calculated: `HMAC-SHA256(serverSeed, clientSeed:nonce)`

3. **Verification:**
   - Player can verify: `SHA256(revealedServerSeed) === publishedHash`
   - Player can recalculate outcome using revealed data

### Outcome Calculation Formula:

```javascript
// Generic formula - adapt for your game
const hmac = HMAC_SHA256(serverSeed, `${clientSeed}:${nonce}`);
const hashValue = parseInt(hmac.substring(0, 13), 16);
const maxValue = Math.pow(16, 13);
const rawResult = hashValue / maxValue; // 0 to 1

// Game-specific transformation:
// Crash: crashPoint = 0.99 / (1 - rawResult), with 1% instant crash
// Roulette: number = Math.floor(rawResult * 37)  // 0-36
// Coin flip: result = rawResult < 0.5 ? 'heads' : 'tails'
// Dice: result = Math.floor(rawResult * 6) + 1  // 1-6
```

---

## Configuration

```javascript
// backend/config.js
module.exports = {
  PORT: process.env.PORT || 3000,
  PROVIDER_SECRET: process.env.PROVIDER_SECRET || "your-secret-key",

  GAME: {
    // Timing
    TICK_INTERVAL_MS: 50, // For animated games
    ROUND_DELAY_MS: 3000, // Delay between rounds
    BETTING_PHASE_MS: 10000, // Betting duration (10 seconds)

    // Bet limits
    MIN_BET: 1,
    MAX_BET: 100000000000,

    // Game-specific (examples)
    MAX_MULTIPLIER: 1000, // For crash
    WHEEL_SEGMENTS: 37, // For roulette (0-36)
    DECK_COUNT: 6, // For blackjack
  },

  CALLBACK: {
    TIMEOUT_MS: 10000, // Request timeout
    RETRY_ATTEMPTS: 3, // Max retries on failure
    RETRY_DELAY_MS: 1000, // Initial retry delay (exponential backoff)
  },

  SESSION: {
    EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
  },
};
```

---

## Complete Code Files

### backend/util/hmac.js

```javascript
const crypto = require("crypto");

function hmacSha256(data, secret) {
  return crypto.createHmac("sha256", secret).update(data).digest("hex");
}

function sha256(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function validateSignature(data, signature, secret) {
  const expected = hmacSha256(data, secret);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports = { hmacSha256, sha256, validateSignature };
```

### backend/engine/seeds.js

```javascript
const crypto = require("crypto");

class SeedManager {
  constructor(chainLength = 10000) {
    this.chainLength = chainLength;
    this.seedChain = [];
    this.currentIndex = 0;
    this.clientSeed = crypto.randomBytes(32).toString("hex");
    this.nonce = 0;
    this.generateChain();
  }

  generateChain() {
    let seed = crypto.randomBytes(32).toString("hex");
    this.seedChain = [seed];
    for (let i = 1; i < this.chainLength; i++) {
      seed = crypto.createHash("sha256").update(seed).digest("hex");
      this.seedChain.push(seed);
    }
    this.seedChain.reverse();
    this.currentIndex = 0;
  }

  getCurrentSeed() {
    return this.seedChain[this.currentIndex];
  }

  getCurrentSeedHash() {
    return crypto
      .createHash("sha256")
      .update(this.getCurrentSeed())
      .digest("hex");
  }

  advance() {
    this.currentIndex++;
    this.nonce++;
    if (this.currentIndex >= this.chainLength) {
      this.generateChain();
    }
  }

  getVerificationData() {
    return {
      serverSeed: this.getCurrentSeed(),
      serverSeedHash: this.getCurrentSeedHash(),
      clientSeed: this.clientSeed,
      nonce: this.nonce,
    };
  }

  getPublicData() {
    return {
      serverSeedHash: this.getCurrentSeedHash(),
      clientSeed: this.clientSeed,
      nonce: this.nonce,
    };
  }
}

module.exports = SeedManager;
```

### backend/engine/{game}Engine.js (Template)

```javascript
const crypto = require("crypto");

class GameEngine {
  constructor() {
    this.currentRound = null;
    this.history = [];
  }

  createRound(serverSeed, clientSeed, nonce) {
    const roundId = `R-${Date.now()}-${nonce}`;
    const outcome = this.calculateOutcome(serverSeed, clientSeed, nonce);

    this.currentRound = {
      roundId,
      outcome, // Pre-calculated but hidden until round ends
      state: "BETTING",
      startTime: null,
      bets: new Map(), // playerId -> { amount, betType, selection, transactionId }
    };

    return this.currentRound;
  }

  // IMPLEMENT FOR YOUR GAME
  calculateOutcome(serverSeed, clientSeed, nonce) {
    const hmac = crypto
      .createHmac("sha256", serverSeed)
      .update(`${clientSeed}:${nonce}`)
      .digest("hex");
    const hashValue = parseInt(hmac.substring(0, 13), 16);
    const maxValue = Math.pow(16, 13);
    const rawResult = hashValue / maxValue;

    // Transform rawResult (0-1) to game-specific outcome
    // Examples:
    // Crash: return Math.max(1, Math.floor((0.99 / (1 - rawResult)) * 100) / 100);
    // Roulette: return Math.floor(rawResult * 37);
    // Coin flip: return rawResult < 0.5 ? 'heads' : 'tails';
    // Dice: return Math.floor(rawResult * 6) + 1;

    throw new Error("Implement calculateOutcome for your game");
  }

  registerBet(playerId, amount, betType, selection, transactionId) {
    if (!this.currentRound || this.currentRound.state !== "BETTING") {
      throw new Error("Betting not allowed");
    }
    if (this.currentRound.bets.has(playerId)) {
      throw new Error("Already placed a bet");
    }

    this.currentRound.bets.set(playerId, {
      amount,
      betType,
      selection,
      transactionId,
      timestamp: Date.now(),
    });

    return true;
  }

  startRound() {
    if (!this.currentRound || this.currentRound.state !== "BETTING") {
      throw new Error("Cannot start round");
    }
    this.currentRound.state = "RUNNING";
    this.currentRound.startTime = Date.now();
  }

  // IMPLEMENT FOR GAMES WITH PLAYER ACTIONS (crash cashout, blackjack hit/stand)
  processAction(playerId, action, params) {
    // Return action result
    throw new Error("Implement processAction if needed");
  }

  // IMPLEMENT FOR YOUR GAME
  calculateWin(bet, outcome) {
    // Return { won: boolean, multiplier: number, amount: number }
    // Examples:
    // Coin flip: if (bet.selection === outcome) return { won: true, multiplier: 2, amount: bet.amount * 2 };
    // Roulette straight: if (bet.selection === outcome) return { won: true, multiplier: 36, amount: bet.amount * 36 };

    throw new Error("Implement calculateWin for your game");
  }

  endRound() {
    const results = [];

    for (const [playerId, bet] of this.currentRound.bets) {
      const result = this.calculateWin(bet, this.currentRound.outcome);
      results.push({
        playerId,
        odifiedPlayerId: playerId.substring(0, 4) + "***", // For broadcast
        ...bet,
        ...result,
      });
    }

    this.history.unshift({
      roundId: this.currentRound.roundId,
      outcome: this.currentRound.outcome,
      timestamp: Date.now(),
      totalBets: this.currentRound.bets.size,
    });

    if (this.history.length > 50) this.history.pop();

    this.currentRound.state = "ENDED";
    return results;
  }

  getState() {
    return {
      state: this.currentRound?.state || "WAITING",
      roundId: this.currentRound?.roundId,
      betsCount: this.currentRound?.bets?.size || 0,
      // Don't expose outcome until round ends!
    };
  }

  getBet(playerId) {
    return this.currentRound?.bets?.get(playerId) || null;
  }
}

module.exports = GameEngine;
```

### backend/services/callbackService.js

```javascript
const axios = require("axios");
const { hmacSha256 } = require("../util/hmac");
const config = require("../config");

class CallbackService {
  constructor() {
    this.client = axios.create({
      timeout: config.CALLBACK.TIMEOUT_MS,
      headers: { "Content-Type": "application/json" },
    });
  }

  async makeCallback(url, payload, retries = config.CALLBACK.RETRY_ATTEMPTS) {
    const signature = hmacSha256(
      JSON.stringify(payload),
      config.PROVIDER_SECRET
    );

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this.client.post(url, payload, {
          headers: {
            "X-Provider-Signature": signature,
            "X-Request-ID": payload.requestId || `REQ-${Date.now()}`,
          },
        });
        return response.data;
      } catch (error) {
        console.error(`Callback attempt ${attempt} failed:`, error.message);
        if (attempt === retries) throw error;
        await new Promise((r) =>
          setTimeout(r, config.CALLBACK.RETRY_DELAY_MS * attempt)
        );
      }
    }
  }

  async placeBet(session, roundId, amount, betType, selection) {
    const payload = {
      requestId: `BET-${roundId}-${session.playerId}-${Date.now()}`,
      roundId,
      playerId: session.playerId,
      sessionId: session.sessionId,
      amount,
      currency: session.currency,
      betType,
      selection,
      timestamp: Date.now(),
    };
    return this.makeCallback(`${session.callbackBaseUrl}/bet`, payload);
  }

  async creditWin(
    session,
    roundId,
    betAmount,
    multiplier,
    winAmount,
    betTransactionId,
    outcome
  ) {
    const payload = {
      requestId: `WIN-${roundId}-${session.playerId}-${Date.now()}`,
      roundId,
      playerId: session.playerId,
      sessionId: session.sessionId,
      betAmount,
      multiplier,
      winAmount,
      currency: session.currency,
      betTransactionId,
      outcome: JSON.stringify(outcome),
      timestamp: Date.now(),
    };
    return this.makeCallback(`${session.callbackBaseUrl}/win`, payload);
  }

  async rollback(session, roundId, amount, originalTransactionId, reason) {
    const payload = {
      requestId: `ROLLBACK-${roundId}-${session.playerId}-${Date.now()}`,
      roundId,
      playerId: session.playerId,
      sessionId: session.sessionId,
      amount,
      currency: session.currency,
      originalTransactionId,
      reason,
      timestamp: Date.now(),
    };
    return this.makeCallback(`${session.callbackBaseUrl}/rollback`, payload);
  }

  async getBalance(playerId, sessionId, callbackBaseUrl) {
    const payload = {
      playerId,
      sessionId,
      timestamp: Date.now(),
    };
    return this.makeCallback(`${callbackBaseUrl}/balance`, payload);
  }
}

module.exports = CallbackService;
```

### backend/services/sessionService.js

```javascript
const { v4: uuidv4 } = require("uuid");
const { validateSignature } = require("../util/hmac");
const config = require("../config");

class SessionService {
  constructor(callbackService) {
    this.sessions = new Map();
    this.callbackService = callbackService;
    setInterval(() => this.cleanupExpired(), 60000);
  }

  async createSession({
    playerId,
    currency,
    callbackBaseUrl,
    token,
    timestamp,
    signature,
  }) {
    // Validate signature in production:
    // const isValid = validateSignature(playerId + token + timestamp, signature, config.PROVIDER_SECRET);
    // if (!isValid) throw new Error('Invalid signature');

    const sessionId = `SESSION-${uuidv4()}`;
    const expiresAt = Date.now() + config.SESSION.EXPIRY_MS;

    let balance = 0;
    try {
      const balanceResponse = await this.callbackService.getBalance(
        playerId,
        sessionId,
        callbackBaseUrl
      );
      balance = balanceResponse.balance;
    } catch (e) {
      console.error("Failed to fetch initial balance:", e.message);
    }

    const session = {
      sessionId,
      playerId,
      currency,
      callbackBaseUrl,
      token,
      signature,
      balance,
      createdAt: Date.now(),
      expiresAt,
      isConnected: false,
      gameSocketId: null,
      controlsSocketId: null,
    };

    this.sessions.set(sessionId, session);

    return {
      sessionId,
      gameUrl: `/game-iframe?sessionId=${sessionId}`,
      controlsUrl: `/controls-iframe?sessionId=${sessionId}`,
      expiresAt,
    };
  }

  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionId);
      return null;
    }
    return session;
  }

  updateBalance(sessionId, newBalance) {
    const session = this.sessions.get(sessionId);
    if (session) session.balance = newBalance;
  }

  setSocketId(sessionId, type, socketId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (type === "game") session.gameSocketId = socketId;
      else if (type === "controls") session.controlsSocketId = socketId;
      session.isConnected = true;
    }
  }

  cleanupExpired() {
    const now = Date.now();
    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        this.sessions.delete(sessionId);
      }
    }
  }
}

module.exports = SessionService;
```

### backend/services/betService.js

```javascript
const config = require("../config");

class BetService {
  constructor(gameEngine, callbackService, sessionService) {
    this.gameEngine = gameEngine;
    this.callbackService = callbackService;
    this.sessionService = sessionService;
  }

  async placeBet(sessionId, amount, betType, selection) {
    const session = this.sessionService.getSession(sessionId);
    if (!session) throw new Error("Invalid session");

    if (amount < config.GAME.MIN_BET || amount > config.GAME.MAX_BET) {
      throw new Error(
        `Bet must be between ${config.GAME.MIN_BET} and ${config.GAME.MAX_BET}`
      );
    }

    if (amount > session.balance) {
      throw new Error("Insufficient balance");
    }

    const roundId = this.gameEngine.currentRound?.roundId;
    if (!roundId) throw new Error("No active round");

    // Deduct from platform
    const betResponse = await this.callbackService.placeBet(
      session,
      roundId,
      amount,
      betType,
      selection
    );

    if (betResponse.status !== "OK") {
      throw new Error(betResponse.message || "Bet rejected by platform");
    }

    // Register bet in engine
    try {
      this.gameEngine.registerBet(
        session.playerId,
        amount,
        betType,
        selection,
        betResponse.transactionId
      );
    } catch (e) {
      // Rollback if engine rejects
      await this.callbackService.rollback(
        session,
        roundId,
        amount,
        betResponse.transactionId,
        "REGISTRATION_FAILED"
      );
      throw e;
    }

    // Update cached balance
    this.sessionService.updateBalance(sessionId, betResponse.newBalance);

    return {
      success: true,
      betId: betResponse.transactionId,
      amount,
      newBalance: betResponse.newBalance,
    };
  }

  async processWin(
    sessionId,
    roundId,
    betAmount,
    multiplier,
    winAmount,
    betTransactionId,
    outcome
  ) {
    const session = this.sessionService.getSession(sessionId);
    if (!session) return null;

    try {
      const winResponse = await this.callbackService.creditWin(
        session,
        roundId,
        betAmount,
        multiplier,
        winAmount,
        betTransactionId,
        outcome
      );
      this.sessionService.updateBalance(sessionId, winResponse.newBalance);
      return winResponse.newBalance;
    } catch (e) {
      console.error("Failed to credit win:", e.message);
      return null;
    }
  }
}

module.exports = BetService;
```

### backend/services/roundService.js

```javascript
const config = require("../config");

class RoundService {
  constructor(io, gameEngine, seedManager, betService) {
    this.io = io;
    this.gameEngine = gameEngine;
    this.seedManager = seedManager;
    this.betService = betService;
    this.gameNamespace = io.of("/ws/game");
    this.controlsNamespace = io.of("/ws/controls");
    this.isRunning = false;
    this.tickInterval = null;
  }

  start() {
    this.isRunning = true;
    this.runGameLoop();
  }

  stop() {
    this.isRunning = false;
    if (this.tickInterval) clearInterval(this.tickInterval);
  }

  async runGameLoop() {
    while (this.isRunning) {
      await this.runRound();
      await this.delay(config.GAME.ROUND_DELAY_MS);
    }
  }

  async runRound() {
    // 1. Create round with pre-calculated outcome
    const seedData = this.seedManager.getVerificationData();
    const round = this.gameEngine.createRound(
      seedData.serverSeed,
      seedData.clientSeed,
      seedData.nonce
    );

    // 2. Betting phase
    this.gameNamespace.emit("betting_phase", {
      roundId: round.roundId,
      duration: config.GAME.BETTING_PHASE_MS,
      serverSeedHash: seedData.serverSeedHash,
    });
    this.controlsNamespace.emit("betting_phase", {
      roundId: round.roundId,
      duration: config.GAME.BETTING_PHASE_MS,
    });

    await this.delay(config.GAME.BETTING_PHASE_MS);

    // 3. Start round
    this.gameEngine.startRound();
    this.gameNamespace.emit("round_start", { roundId: round.roundId });
    this.controlsNamespace.emit("round_start", { roundId: round.roundId });

    // 4. Run game (implement game-specific logic)
    await this.runGamePhase(round);

    // 5. End round
    const results = this.gameEngine.endRound();

    // 6. Broadcast outcome with verification data
    this.gameNamespace.emit("round_end", {
      roundId: round.roundId,
      outcome: round.outcome,
      serverSeed: seedData.serverSeed,
      clientSeed: seedData.clientSeed,
      nonce: seedData.nonce,
    });
    this.controlsNamespace.emit("round_end", {
      roundId: round.roundId,
      outcome: round.outcome,
    });

    // 7. Process results and send to individual players
    await this.processResults(results, round.roundId, round.outcome);

    // 8. Advance seed for next round
    this.seedManager.advance();

    // 9. Send updated history
    this.gameNamespace.emit("history", this.gameEngine.history.slice(0, 20));
  }

  // IMPLEMENT FOR YOUR GAME
  async runGamePhase(round) {
    // For instant games (coin flip, dice, roulette): just a short animation delay
    // await this.delay(3000);

    // For continuous games (crash): run tick loop until outcome reached
    // this.tickInterval = setInterval(() => {
    //   const elapsed = Date.now() - round.startTime;
    //   const currentMultiplier = this.calculateMultiplier(elapsed);
    //   if (currentMultiplier >= round.outcome) {
    //     clearInterval(this.tickInterval);
    //     return;
    //   }
    //   this.gameNamespace.emit('round_tick', { elapsed, multiplier: currentMultiplier });
    //   this.controlsNamespace.emit('round_tick', { elapsed, multiplier: currentMultiplier });
    // }, config.GAME.TICK_INTERVAL_MS);
    // await this.waitForCrash(round);

    throw new Error("Implement runGamePhase for your game");
  }

  async processResults(results, roundId, outcome) {
    for (const result of results) {
      const session = this.findSessionByPlayerId(result.playerId);
      if (!session) continue;

      if (result.won && result.amount > 0) {
        const newBalance = await this.betService.processWin(
          session.sessionId,
          roundId,
          result.amount,
          result.multiplier,
          result.amount * result.multiplier,
          result.transactionId,
          outcome
        );

        this.emitToPlayer(session.controlsSocketId, "round_result", {
          won: true,
          amount: result.amount * result.multiplier,
          outcome,
          newBalance,
        });
      } else {
        this.emitToPlayer(session.controlsSocketId, "round_result", {
          won: false,
          amount: 0,
          outcome,
          newBalance: session.balance,
        });
      }
    }
  }

  findSessionByPlayerId(playerId) {
    // Implement based on your session storage
    return null;
  }

  emitToPlayer(socketId, event, data) {
    if (socketId) {
      this.controlsNamespace.to(socketId).emit(event, data);
    }
  }

  delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

module.exports = RoundService;
```

### backend/ws/gameNamespace.js

```javascript
function setupGameNamespace(io, sessionService, gameEngine) {
  const gameNamespace = io.of("/ws/game");

  gameNamespace.on("connection", (socket) => {
    const sessionId = socket.handshake.query.sessionId;
    const session = sessionService.getSession(sessionId);

    if (!session) {
      socket.emit("error", {
        message: "Invalid session",
        code: "INVALID_SESSION",
      });
      socket.disconnect();
      return;
    }

    sessionService.setSocketId(sessionId, "game", socket.id);
    console.log(`Game socket connected: ${socket.id} (${session.playerId})`);

    // Send current state
    socket.emit("round_state", gameEngine.getState());
    socket.emit("history", gameEngine.history.slice(0, 20));

    socket.on("disconnect", () => {
      console.log(`Game socket disconnected: ${socket.id}`);
    });
  });

  return gameNamespace;
}

module.exports = setupGameNamespace;
```

### backend/ws/controlsNamespace.js

```javascript
function setupControlsNamespace(io, sessionService, betService, gameEngine) {
  const controlsNamespace = io.of("/ws/controls");

  controlsNamespace.on("connection", (socket) => {
    const sessionId = socket.handshake.query.sessionId;
    const session = sessionService.getSession(sessionId);

    if (!session) {
      socket.emit("error", {
        message: "Invalid session",
        code: "INVALID_SESSION",
      });
      socket.disconnect();
      return;
    }

    sessionService.setSocketId(sessionId, "controls", socket.id);
    console.log(
      `Controls socket connected: ${socket.id} (${session.playerId})`
    );

    // Send current state
    socket.emit("balance_update", {
      balance: session.balance,
      currency: session.currency,
    });
    socket.emit("round_state", gameEngine.getState());

    // Check for existing bet
    const existingBet = gameEngine.getBet(session.playerId);
    if (existingBet) {
      socket.emit("bet_status", { hasBet: true, ...existingBet });
    }

    // Handle bet
    socket.on("bet", async (data) => {
      try {
        const result = await betService.placeBet(
          sessionId,
          data.amount,
          data.betType,
          data.selection
        );
        socket.emit("bet_result", result);

        // Broadcast to others (redacted player ID)
        socket.broadcast.emit("player_bet", {
          odifiedPlayerId: session.playerId.substring(0, 4) + "***",
          amount: data.amount,
        });
      } catch (e) {
        socket.emit("bet_result", { success: false, error: e.message });
      }
    });

    // Handle game actions (cashout, hit, stand, etc.)
    socket.on("action", async (data) => {
      try {
        const result = await gameEngine.processAction(
          session.playerId,
          data.action,
          data.params
        );
        socket.emit("action_result", { success: true, ...result });
      } catch (e) {
        socket.emit("action_result", { success: false, error: e.message });
      }
    });

    // Handle balance request
    socket.on("get_balance", async () => {
      try {
        const balanceResponse = await betService.callbackService.getBalance(
          session.playerId,
          sessionId,
          session.callbackBaseUrl
        );
        sessionService.updateBalance(sessionId, balanceResponse.balance);
        socket.emit("balance_update", {
          balance: balanceResponse.balance,
          currency: session.currency,
        });
      } catch (e) {
        socket.emit("error", { message: "Failed to fetch balance" });
      }
    });

    socket.on("disconnect", () => {
      console.log(`Controls socket disconnected: ${socket.id}`);
    });
  });

  return controlsNamespace;
}

module.exports = setupControlsNamespace;
```

### backend/server.js

```javascript
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");

const config = require("./config");
const GameEngine = require("./engine/{game}Engine");
const SeedManager = require("./engine/seeds");
const CallbackService = require("./services/callbackService");
const SessionService = require("./services/sessionService");
const BetService = require("./services/betService");
const RoundService = require("./services/roundService");
const setupGameNamespace = require("./ws/gameNamespace");
const setupControlsNamespace = require("./ws/controlsNamespace");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
});

app.use(cors());
app.use(express.json());

// Static files
app.use(
  "/game-iframe",
  express.static(path.join(__dirname, "../frontend/game-iframe"))
);
app.use(
  "/controls-iframe",
  express.static(path.join(__dirname, "../frontend/controls-iframe"))
);

// Initialize services
const gameEngine = new GameEngine();
const seedManager = new SeedManager();
const callbackService = new CallbackService();
const sessionService = new SessionService(callbackService);
const betService = new BetService(gameEngine, callbackService, sessionService);
const roundService = new RoundService(io, gameEngine, seedManager, betService);

// REST Endpoints
app.post("/session/init", async (req, res) => {
  try {
    const result = await sessionService.createSession(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get("/session/:sessionId", (req, res) => {
  const session = sessionService.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ playerId: session.playerId, currency: session.currency });
});

app.get("/game/state", (req, res) => res.json(gameEngine.getState()));
app.get("/game/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(gameEngine.history.slice(0, limit));
});

app.get("/provably-fair", (req, res) => res.json(seedManager.getPublicData()));
app.post("/provably-fair/verify", (req, res) => {
  const { serverSeed, clientSeed, nonce } = req.body;
  const outcome = gameEngine.calculateOutcome(serverSeed, clientSeed, nonce);
  res.json({ verified: true, outcome });
});

app.get("/game-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/game-iframe/index.html"));
});
app.get("/controls-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/controls-iframe/index.html"));
});
app.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: Date.now() })
);

// WebSocket namespaces
setupGameNamespace(io, sessionService, gameEngine);
setupControlsNamespace(io, sessionService, betService, gameEngine);

// Start game loop
roundService.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  roundService.stop();
  server.close();
});
process.on("SIGINT", () => {
  roundService.stop();
  server.close();
});

server.listen(config.PORT, () => {
  console.log(`Game provider running on port ${config.PORT}`);
});
```

### backend/testServer.js

```javascript
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const cors = require("cors");

const config = require("./config");
const GameEngine = require("./engine/{game}Engine");
const SeedManager = require("./engine/seeds");
const CallbackService = require("./services/callbackService");
const SessionService = require("./services/sessionService");
const BetService = require("./services/betService");
const RoundService = require("./services/roundService");
const setupGameNamespace = require("./ws/gameNamespace");
const setupControlsNamespace = require("./ws/controlsNamespace");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  path: "/{game}/socket.io", // REPLACE {game} with your game name
});

app.use(cors());
app.use(express.json());

// Initialize services
const gameEngine = new GameEngine();
const seedManager = new SeedManager();
const callbackService = new CallbackService();
const sessionService = new SessionService(callbackService);
const betService = new BetService(gameEngine, callbackService, sessionService);
const roundService = new RoundService(io, gameEngine, seedManager, betService);

// Router with /{game} prefix - REPLACE {game} with your game name
const gameRouter = express.Router();

gameRouter.post("/session/init", async (req, res) => {
  try {
    const result = await sessionService.createSession(req.body);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

gameRouter.get("/session/:sessionId", (req, res) => {
  const session = sessionService.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ playerId: session.playerId, currency: session.currency });
});

gameRouter.get("/game/state", (req, res) => res.json(gameEngine.getState()));
gameRouter.get("/game/history", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(gameEngine.history.slice(0, limit));
});

gameRouter.get("/provably-fair", (req, res) =>
  res.json(seedManager.getPublicData())
);
gameRouter.post("/provably-fair/verify", (req, res) => {
  const { serverSeed, clientSeed, nonce } = req.body;
  const outcome = gameEngine.calculateOutcome(serverSeed, clientSeed, nonce);
  res.json({ verified: true, outcome });
});

gameRouter.get("/game-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/game-iframe/index.html"));
});
gameRouter.get("/controls-iframe", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/controls-iframe/index.html"));
});
gameRouter.use(
  "/game-iframe",
  express.static(path.join(__dirname, "../frontend/game-iframe"))
);
gameRouter.use(
  "/controls-iframe",
  express.static(path.join(__dirname, "../frontend/controls-iframe"))
);
gameRouter.get("/health", (req, res) =>
  res.json({ status: "ok", timestamp: Date.now() })
);

// Mount router - REPLACE {game} with your game name
app.use("/{game}", gameRouter);

// WebSocket namespaces
setupGameNamespace(io, sessionService, gameEngine);
setupControlsNamespace(io, sessionService, betService, gameEngine);

// Start game loop
roundService.start();

// Graceful shutdown
process.on("SIGTERM", () => {
  roundService.stop();
  server.close();
});
process.on("SIGINT", () => {
  roundService.stop();
  server.close();
});

server.listen(config.PORT, () => {
  console.log(`Game provider running on port ${config.PORT}`);
  console.log(`Endpoints available at /{game}/*`);
});
```

---

## Frontend Files

### frontend/game-iframe/index.html

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Game</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        background: #1a1a2e;
        color: #fff;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        overflow: hidden;
      }
      #game-container {
        width: 100vw;
        height: 100vh;
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      #connection-status {
        position: absolute;
        top: 10px;
        right: 10px;
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
      }
      .connected {
        background: #00ff88;
        color: #000;
      }
      .disconnected {
        background: #ff4444;
        color: #fff;
      }
      #round-info {
        position: absolute;
        top: 10px;
        left: 10px;
        font-size: 12px;
        opacity: 0.7;
      }
      #outcome-display {
        font-size: 72px;
        font-weight: bold;
        text-align: center;
      }
      #status-text {
        font-size: 24px;
        margin-top: 20px;
        text-align: center;
      }
      #countdown {
        font-size: 48px;
        margin-top: 10px;
      }
      #history-bar {
        position: absolute;
        bottom: 10px;
        left: 10px;
        right: 10px;
        display: flex;
        gap: 5px;
        overflow-x: auto;
      }
      .history-item {
        padding: 5px 10px;
        border-radius: 4px;
        font-size: 12px;
        white-space: nowrap;
      }
      #game-canvas {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        z-index: -1;
      }
    </style>
  </head>
  <body>
    <div id="game-container">
      <div id="connection-status" class="disconnected">Disconnected</div>
      <div id="round-info">Round: <span id="round-id">-</span></div>
      <canvas id="game-canvas"></canvas>
      <div id="outcome-display"></div>
      <div id="status-text">Connecting...</div>
      <div id="countdown"></div>
      <div id="history-bar"></div>
    </div>

    <!-- REPLACE {game} with your game name -->
    <script src="/{game}/socket.io/socket.io.js"></script>
    <script src="/{game}/game-iframe/game.js"></script>
  </body>
</html>
```

### frontend/game-iframe/game.js

```javascript
class GameDisplay {
  constructor() {
    this.socket = null;
    this.state = "WAITING";
    this.roundId = null;
    this.history = [];
    this.countdownInterval = null;
    this.init();
  }

  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("sessionId");
    if (!sessionId) {
      this.showStatus("No session ID provided");
      return;
    }
    this.connectSocket(sessionId);
  }

  connectSocket(sessionId) {
    // REPLACE {game} with your game name
    this.socket = io("/ws/game", {
      path: "/{game}/socket.io/",
      query: { sessionId },
      transports: ["websocket", "polling"],
    });

    this.socket.on("connect", () => this.onConnect());
    this.socket.on("disconnect", () => this.onDisconnect());
    this.socket.on("round_state", (data) => this.onRoundState(data));
    this.socket.on("betting_phase", (data) => this.onBettingPhase(data));
    this.socket.on("round_start", (data) => this.onRoundStart(data));
    this.socket.on("round_tick", (data) => this.onRoundTick(data));
    this.socket.on("round_end", (data) => this.onRoundEnd(data));
    this.socket.on("history", (data) => this.onHistory(data));
    this.socket.on("waiting", (data) => this.onWaiting(data));
    this.socket.on("error", (data) => this.onError(data));
  }

  onConnect() {
    document.getElementById("connection-status").className = "connected";
    document.getElementById("connection-status").textContent = "Connected";
  }

  onDisconnect() {
    document.getElementById("connection-status").className = "disconnected";
    document.getElementById("connection-status").textContent = "Disconnected";
  }

  onRoundState(data) {
    this.state = data.state;
    document.getElementById("round-id").textContent = data.roundId || "-";
  }

  onBettingPhase(data) {
    this.state = "BETTING";
    this.roundId = data.roundId;
    document.getElementById("round-id").textContent = data.roundId;
    document.getElementById("outcome-display").textContent = "";
    this.showStatus("Place your bets!");
    this.startCountdown(data.duration / 1000);
  }

  onRoundStart(data) {
    this.state = "RUNNING";
    this.clearCountdown();
    this.showStatus("Round in progress...");
    // IMPLEMENT: Start game animation
  }

  onRoundTick(data) {
    // IMPLEMENT: Update game visualization
    // For crash: show current multiplier
    // For roulette: show wheel spinning
  }

  onRoundEnd(data) {
    this.state = "ENDED";
    this.clearCountdown();
    document.getElementById("outcome-display").textContent = this.formatOutcome(
      data.outcome
    );
    this.showStatus("Round ended");
    // IMPLEMENT: Show outcome animation
  }

  onHistory(data) {
    this.history = data;
    this.renderHistory();
  }

  onWaiting(data) {
    this.state = "WAITING";
    this.showStatus("Waiting for next round...");
  }

  onError(data) {
    console.error("Game error:", data);
    this.showStatus("Error: " + data.message);
  }

  showStatus(text) {
    document.getElementById("status-text").textContent = text;
  }

  startCountdown(seconds) {
    this.clearCountdown();
    let remaining = seconds;
    document.getElementById("countdown").textContent = remaining + "s";
    this.countdownInterval = setInterval(() => {
      remaining--;
      document.getElementById("countdown").textContent =
        remaining > 0 ? remaining + "s" : "";
      if (remaining <= 0) this.clearCountdown();
    }, 1000);
  }

  clearCountdown() {
    if (this.countdownInterval) {
      clearInterval(this.countdownInterval);
      this.countdownInterval = null;
    }
    document.getElementById("countdown").textContent = "";
  }

  // IMPLEMENT: Format outcome for display
  formatOutcome(outcome) {
    // Coin flip: return outcome (heads/tails)
    // Roulette: return outcome (number)
    // Crash: return outcome + 'x'
    return String(outcome);
  }

  renderHistory() {
    const container = document.getElementById("history-bar");
    container.innerHTML = "";
    this.history.slice(0, 15).forEach((item) => {
      const el = document.createElement("div");
      el.className = "history-item";
      el.textContent = this.formatOutcome(item.outcome);
      el.style.background = this.getOutcomeColor(item.outcome);
      container.appendChild(el);
    });
  }

  // IMPLEMENT: Color coding for outcomes
  getOutcomeColor(outcome) {
    // Coin flip: heads = gold, tails = silver
    // Roulette: red/black/green based on number
    // Crash: gradient based on multiplier
    return "#3a3a5e";
  }
}

const game = new GameDisplay();
```

### frontend/controls-iframe/index.html

```html
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Controls</title>
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      body {
        background: #1a1a2e;
        color: #fff;
        font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
        padding: 15px;
        min-height: 100vh;
      }
      #connection-status {
        position: absolute;
        top: 10px;
        right: 10px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
      }
      .connected {
        background: #00ff88;
      }
      .disconnected {
        background: #ff4444;
      }

      .balance-display {
        font-size: 20px;
        margin-bottom: 15px;
        padding: 10px;
        background: #2a2a4e;
        border-radius: 8px;
      }
      .balance-amount {
        color: #00ff88;
        font-weight: bold;
      }

      .round-status {
        font-size: 14px;
        padding: 8px 12px;
        background: #3a3a5e;
        border-radius: 4px;
        margin-bottom: 15px;
        text-align: center;
      }

      .bet-section {
        margin-bottom: 15px;
      }
      .section-label {
        font-size: 12px;
        color: #888;
        margin-bottom: 5px;
      }
      .bet-input {
        width: 100%;
        padding: 12px;
        font-size: 18px;
        background: #2a2a4e;
        border: 1px solid #4a4a6e;
        border-radius: 8px;
        color: #fff;
        outline: none;
      }
      .bet-input:focus {
        border-color: #00ff88;
      }
      .bet-input:disabled {
        opacity: 0.5;
      }

      .quick-bets {
        display: flex;
        gap: 6px;
        margin-top: 8px;
        flex-wrap: wrap;
      }
      .quick-bet-btn {
        flex: 1;
        min-width: 40px;
        padding: 8px 4px;
        background: #3a3a5e;
        border: none;
        border-radius: 4px;
        color: #fff;
        cursor: pointer;
        font-size: 12px;
      }
      .quick-bet-btn:hover {
        background: #4a4a6e;
      }
      .quick-bet-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .game-selection {
        display: flex;
        gap: 10px;
        margin-bottom: 15px;
      }
      .selection-btn {
        flex: 1;
        padding: 15px;
        font-size: 16px;
        border: 2px solid #4a4a6e;
        border-radius: 8px;
        background: #2a2a4e;
        color: #fff;
        cursor: pointer;
        transition: all 0.2s;
      }
      .selection-btn:hover {
        border-color: #00ff88;
      }
      .selection-btn.selected {
        border-color: #00ff88;
        background: #00ff8822;
      }
      .selection-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .action-btn {
        width: 100%;
        padding: 15px;
        font-size: 18px;
        font-weight: bold;
        border: none;
        border-radius: 8px;
        cursor: pointer;
        margin-top: 10px;
        transition: all 0.2s;
      }
      .bet-btn {
        background: #00ff88;
        color: #000;
      }
      .bet-btn:hover {
        background: #00cc6a;
      }
      .bet-btn:disabled {
        background: #4a4a6e;
        color: #888;
        cursor: not-allowed;
      }

      .cashout-btn {
        background: #ff8800;
        color: #fff;
      }
      .cashout-btn:hover {
        background: #cc6d00;
      }

      .current-bet {
        padding: 10px;
        background: #2a2a4e;
        border-radius: 8px;
        margin-top: 15px;
        text-align: center;
      }
      .current-bet-amount {
        color: #ffcc00;
        font-weight: bold;
      }

      .status-message {
        padding: 10px;
        border-radius: 4px;
        margin-top: 15px;
        text-align: center;
        display: none;
      }
      .status-success {
        background: #00ff8822;
        border: 1px solid #00ff88;
        color: #00ff88;
        display: block;
      }
      .status-error {
        background: #ff444422;
        border: 1px solid #ff4444;
        color: #ff4444;
        display: block;
      }
      .status-info {
        background: #4488ff22;
        border: 1px solid #4488ff;
        color: #4488ff;
        display: block;
      }
    </style>
  </head>
  <body>
    <div id="connection-status" class="disconnected"></div>

    <div class="balance-display">
      Balance: <span class="balance-amount" id="balance">0.00</span>
      <span id="currency">EUR</span>
    </div>

    <div class="round-status" id="round-status">Connecting...</div>

    <div class="bet-section">
      <div class="section-label">BET AMOUNT</div>
      <input
        type="number"
        id="bet-amount"
        class="bet-input"
        placeholder="Enter bet amount"
        min="1"
        step="0.01"
      />
      <div class="quick-bets">
        <button class="quick-bet-btn" data-action="half">1/2</button>
        <button class="quick-bet-btn" data-action="double">2x</button>
        <button class="quick-bet-btn" data-value="1">1</button>
        <button class="quick-bet-btn" data-value="5">5</button>
        <button class="quick-bet-btn" data-value="10">10</button>
        <button class="quick-bet-btn" data-value="50">50</button>
        <button class="quick-bet-btn" data-action="max">MAX</button>
      </div>
    </div>

    <!-- IMPLEMENT: Game-specific selection UI -->
    <div class="bet-section" id="game-selection-container">
      <div class="section-label">YOUR PICK</div>
      <div class="game-selection" id="game-selection">
        <!-- Example for coin flip: -->
        <!-- <button class="selection-btn" data-selection="heads">HEADS</button> -->
        <!-- <button class="selection-btn" data-selection="tails">TAILS</button> -->
      </div>
    </div>

    <button id="bet-btn" class="action-btn bet-btn">PLACE BET</button>

    <!-- Game-specific action buttons (e.g., cashout for crash) -->
    <div id="action-buttons" style="display: none;">
      <!-- <button id="cashout-btn" class="action-btn cashout-btn">CASH OUT</button> -->
    </div>

    <div id="current-bet" class="current-bet" style="display: none;">
      Current Bet:
      <span class="current-bet-amount" id="current-bet-amount">0.00</span>
      <span id="current-bet-selection"></span>
    </div>

    <div id="status-message" class="status-message"></div>

    <!-- REPLACE {game} with your game name -->
    <script src="/{game}/socket.io/socket.io.js"></script>
    <script src="/{game}/controls-iframe/controls.js"></script>
  </body>
</html>
```

### frontend/controls-iframe/controls.js

```javascript
class GameControls {
  constructor() {
    this.socket = null;
    this.balance = 0;
    this.currency = "EUR";
    this.currentBet = null;
    this.selection = null;
    this.state = "WAITING";
    this.init();
  }

  init() {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get("sessionId");
    if (!sessionId) {
      this.showStatus("No session ID provided", "error");
      return;
    }
    this.connectSocket(sessionId);
    this.setupEventListeners();
  }

  connectSocket(sessionId) {
    // REPLACE {game} with your game name
    this.socket = io("/ws/controls", {
      path: "/{game}/socket.io/",
      query: { sessionId },
      transports: ["websocket", "polling"],
    });

    this.socket.on("connect", () => this.onConnect());
    this.socket.on("disconnect", () => this.onDisconnect());
    this.socket.on("balance_update", (data) => this.onBalanceUpdate(data));
    this.socket.on("bet_result", (data) => this.onBetResult(data));
    this.socket.on("action_result", (data) => this.onActionResult(data));
    this.socket.on("round_result", (data) => this.onRoundResult(data));
    this.socket.on("bet_status", (data) => this.onBetStatus(data));
    this.socket.on("round_state", (data) => this.onRoundState(data));
    this.socket.on("betting_phase", (data) => this.onBettingPhase(data));
    this.socket.on("round_start", (data) => this.onRoundStart(data));
    this.socket.on("round_tick", (data) => this.onRoundTick(data));
    this.socket.on("round_end", (data) => this.onRoundEnd(data));
    this.socket.on("error", (data) => this.onError(data));
  }

  setupEventListeners() {
    document
      .getElementById("bet-btn")
      .addEventListener("click", () => this.placeBet());

    document.querySelectorAll(".quick-bet-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleQuickBet(e));
    });

    document.querySelectorAll(".selection-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => this.handleSelection(e));
    });

    // IMPLEMENT: Game-specific action button listeners
    // document.getElementById('cashout-btn')?.addEventListener('click', () => this.cashout());
  }

  onConnect() {
    document.getElementById("connection-status").className = "connected";
    this.socket.emit("get_balance");
    this.setRoundStatus("Connected");
  }

  onDisconnect() {
    document.getElementById("connection-status").className = "disconnected";
    this.setRoundStatus("Disconnected");
  }

  onBalanceUpdate(data) {
    this.balance = data.balance;
    this.currency = data.currency || this.currency;
    document.getElementById("balance").textContent = this.balance.toFixed(2);
    document.getElementById("currency").textContent = this.currency;
  }

  onBetResult(data) {
    if (data.success) {
      this.currentBet = { amount: data.amount, betId: data.betId };
      this.balance = data.newBalance;
      document.getElementById("balance").textContent = this.balance.toFixed(2);
      document.getElementById("current-bet").style.display = "block";
      document.getElementById("current-bet-amount").textContent =
        data.amount.toFixed(2);
      document.getElementById("bet-btn").style.display = "none";
      this.disableBetInputs(true);
      this.showStatus("Bet placed!", "success");
    } else {
      this.showStatus(data.error || "Bet failed", "error");
    }
  }

  onActionResult(data) {
    if (data.success) {
      if (data.newBalance !== undefined) {
        this.balance = data.newBalance;
        document.getElementById("balance").textContent =
          this.balance.toFixed(2);
      }
      // IMPLEMENT: Handle game-specific action results
    } else {
      this.showStatus(data.error || "Action failed", "error");
    }
  }

  onRoundResult(data) {
    if (data.won) {
      this.showStatus(
        `You won ${data.amount.toFixed(2)} ${this.currency}!`,
        "success"
      );
    } else {
      this.showStatus("Better luck next time!", "info");
    }
    if (data.newBalance !== undefined) {
      this.balance = data.newBalance;
      document.getElementById("balance").textContent = this.balance.toFixed(2);
    }
    this.resetBetUI();
  }

  onBetStatus(data) {
    if (data.hasBet) {
      this.currentBet = data;
      document.getElementById("current-bet").style.display = "block";
      document.getElementById("current-bet-amount").textContent =
        data.amount.toFixed(2);
      document.getElementById("bet-btn").style.display = "none";
      this.disableBetInputs(true);
    }
  }

  onRoundState(data) {
    this.state = data.state;
    this.updateUI();
  }

  onBettingPhase(data) {
    this.state = "BETTING";
    this.setRoundStatus("BETTING PHASE");
    this.updateUI();
  }

  onRoundStart(data) {
    this.state = "RUNNING";
    this.setRoundStatus("ROUND IN PROGRESS");
    this.updateUI();
  }

  onRoundTick(data) {
    // IMPLEMENT: Update UI during round
    // For crash: update cashout button with potential win
  }

  onRoundEnd(data) {
    this.state = "ENDED";
    this.setRoundStatus("ROUND ENDED");
    this.updateUI();
  }

  onError(data) {
    this.showStatus(data.message || "An error occurred", "error");
  }

  placeBet() {
    const amount = parseFloat(document.getElementById("bet-amount").value);
    if (isNaN(amount) || amount <= 0) {
      this.showStatus("Enter a valid bet amount", "error");
      return;
    }
    if (amount > this.balance) {
      this.showStatus("Insufficient balance", "error");
      return;
    }

    const betData = this.getBetData();
    if (!this.validateBetData(betData)) return;

    this.socket.emit("bet", { amount, ...betData });
  }

  // IMPLEMENT: Override for game-specific bet data
  getBetData() {
    return {
      selection: this.selection,
    };
  }

  // IMPLEMENT: Validate game-specific bet data
  validateBetData(betData) {
    // Example for coin flip:
    // if (!betData.selection) {
    //   this.showStatus('Please select heads or tails', 'error');
    //   return false;
    // }
    return true;
  }

  handleQuickBet(e) {
    const btn = e.target;
    const action = btn.dataset.action;
    const value = parseFloat(btn.dataset.value);
    const input = document.getElementById("bet-amount");

    if (value) {
      input.value = value;
    } else if (action === "half") {
      const current = parseFloat(input.value) || 0;
      input.value = Math.max(1, current / 2).toFixed(2);
    } else if (action === "double") {
      const current = parseFloat(input.value) || 1;
      input.value = Math.min(current * 2, this.balance).toFixed(2);
    } else if (action === "max") {
      input.value = this.balance.toFixed(2);
    }
  }

  handleSelection(e) {
    const btn = e.target;
    document
      .querySelectorAll(".selection-btn")
      .forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    this.selection = btn.dataset.selection;
  }

  updateUI() {
    const betBtn = document.getElementById("bet-btn");
    const betInput = document.getElementById("bet-amount");

    switch (this.state) {
      case "BETTING":
        if (!this.currentBet) {
          betBtn.disabled = false;
          betBtn.style.display = "block";
          this.disableBetInputs(false);
        }
        break;
      case "RUNNING":
        betBtn.disabled = true;
        this.disableBetInputs(true);
        // IMPLEMENT: Show game-specific action buttons (cashout, etc.)
        break;
      case "ENDED":
      case "WAITING":
        betBtn.disabled = true;
        this.disableBetInputs(true);
        break;
    }
  }

  disableBetInputs(disabled) {
    document.getElementById("bet-amount").disabled = disabled;
    document
      .querySelectorAll(".quick-bet-btn")
      .forEach((b) => (b.disabled = disabled));
    document
      .querySelectorAll(".selection-btn")
      .forEach((b) => (b.disabled = disabled));
  }

  resetBetUI() {
    this.currentBet = null;
    this.selection = null;
    document.getElementById("current-bet").style.display = "none";
    document.getElementById("bet-btn").style.display = "block";
    document
      .querySelectorAll(".selection-btn")
      .forEach((b) => b.classList.remove("selected"));
  }

  setRoundStatus(text) {
    document.getElementById("round-status").textContent = text;
  }

  showStatus(message, type) {
    const el = document.getElementById("status-message");
    el.textContent = message;
    el.className = `status-message status-${type}`;
    setTimeout(() => {
      el.className = "status-message";
    }, 5000);
  }
}

const controls = new GameControls();
```

---

## package.json

```json
{
  "name": "{game}-provider",
  "version": "1.0.0",
  "description": "{Game} gambling game provider",
  "main": "backend/server.js",
  "scripts": {
    "start": "node backend/server.js",
    "dev": "nodemon backend/server.js",
    "test": "node backend/testServer.js"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "cors": "^2.8.5",
    "express": "^4.18.2",
    "socket.io": "^4.7.2",
    "uuid": "^9.0.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1"
  }
}
```

---

## Game-Specific Implementation Examples

### Coin Flip

**Outcome calculation:**

```javascript
calculateOutcome(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
  const value = parseInt(hmac.substring(0, 8), 16) / 0xffffffff;
  return value < 0.5 ? 'heads' : 'tails';
}
```

**Win calculation:**

```javascript
calculateWin(bet, outcome) {
  const won = bet.selection === outcome;
  return { won, multiplier: won ? 2 : 0, amount: won ? bet.amount * 2 : 0 };
}
```

### Roulette

**Outcome calculation:**

```javascript
calculateOutcome(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
  const value = parseInt(hmac.substring(0, 8), 16) / 0xffffffff;
  return Math.floor(value * 37);  // 0-36
}
```

### Dice

**Outcome calculation:**

```javascript
calculateOutcome(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
  const value = parseInt(hmac.substring(0, 8), 16) / 0xffffffff;
  return Math.floor(value * 100);  // 0-99
}
```

### Crash

**Outcome calculation:**

```javascript
calculateOutcome(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed).update(`${clientSeed}:${nonce}`).digest('hex');
  const value = parseInt(hmac.substring(0, 13), 16) / Math.pow(16, 13);
  if (value < 0.01) return 1.00;  // 1% instant crash
  return Math.floor((0.99 / (1 - value)) * 100) / 100;
}
```

---

## Checklist for New Game

1. [ ] Create project directory with structure above
2. [ ] Replace `/{game}` with your game name in:
   - [ ] `testServer.js` - route prefix and socket.io path
   - [ ] `frontend/game-iframe/index.html` - script sources
   - [ ] `frontend/controls-iframe/index.html` - script sources
   - [ ] `frontend/game-iframe/game.js` - socket.io path
   - [ ] `frontend/controls-iframe/controls.js` - socket.io path
3. [ ] Implement `{game}Engine.js`:
   - [ ] `calculateOutcome()` - provably fair outcome
   - [ ] `calculateWin()` - win determination
   - [ ] `processAction()` - if game has mid-round actions
4. [ ] Implement `roundService.js`:
   - [ ] `runGamePhase()` - game-specific round execution
5. [ ] Implement frontend:
   - [ ] Game visualization in `game.js`
   - [ ] Bet selection UI in `controls.html`
   - [ ] `getBetData()` and `validateBetData()` in `controls.js`
6. [ ] Update `config.js` with game-specific settings
7. [ ] Test all platform callbacks
8. [ ] Test provably fair verification
9. [ ] Test reconnection handling

---

_This scheme contains all information needed to build a casino game provider._
