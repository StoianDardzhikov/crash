# Crash Game Provider

A complete crash gambling game provider system with provably fair algorithm, WebSocket communication, and platform callback integration.

## Architecture Overview

This is a **game provider**, not a casino platform. The provider:
- Serves the game via two iframes (game visualization + player controls)
- Manages game rounds and provably fair crash points
- Communicates with the platform backend via HTTP callbacks for balance operations
- Does NOT store player balances (managed by platform)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CASINO PLATFORM                                │
│  ┌─────────────────┐     ┌─────────────────────────────────────────┐   │
│  │  Platform       │     │         Platform Backend                 │   │
│  │  Frontend       │     │  - Player balance management            │   │
│  │                 │     │  - Transaction processing               │   │
│  │  ┌───────────┐  │     │  - Callback endpoints:                  │   │
│  │  │Game Iframe│◄─┼─────┼──┐  POST /game-callbacks/bet            │   │
│  │  └───────────┘  │     │  │  POST /game-callbacks/win            │   │
│  │  ┌───────────┐  │     │  │  POST /game-callbacks/rollback       │   │
│  │  │ Controls  │◄─┼─────┼──┤  POST /game-callbacks/balance        │   │
│  │  │  Iframe   │  │     │  │                                      │   │
│  │  └───────────┘  │     └──┼──────────────────────────────────────┘   │
│  └─────────────────┘        │                                          │
└─────────────────────────────┼──────────────────────────────────────────┘
                              │
                              │ HTTP Callbacks
                              │
┌─────────────────────────────┼──────────────────────────────────────────┐
│                    GAME PROVIDER (this project)                        │
│                              │                                          │
│  ┌───────────────────────────▼──────────────────────────────────────┐  │
│  │                     Provider Backend                              │  │
│  │  - Session management                                             │  │
│  │  - Provably fair crash engine                                     │  │
│  │  - WebSocket server (/ws/game, /ws/controls)                     │  │
│  │  - Platform callback client                                       │  │
│  └──────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

## Quick Start

```bash
# Install dependencies
npm install

# Start the server
npm start

# Development mode (auto-restart on changes)
npm run dev
```

Server runs on port 3000 by default (configurable via PORT env variable).

## Platform Integration

### 1. Initialize Session

Platform calls this when a player wants to play:

```http
POST /session/init
Content-Type: application/json

{
  "playerId": "player123",
  "currency": "EUR",
  "token": "random-token-from-platform",
  "timestamp": 1699999999999,
  "signature": "hmac-sha256-signature",
  "callbackBaseUrl": "https://platform.com/game-callbacks"
}
```

Response:
```json
{
  "success": true,
  "sessionId": "SESSION-uuid",
  "gameUrl": "/game-iframe?sessionId=SESSION-uuid",
  "controlsUrl": "/controls-iframe?sessionId=SESSION-uuid"
}
```

### 2. Embed Iframes

Platform embeds two iframes using the returned URLs:

```html
<!-- Game visualization (read-only) -->
<iframe src="https://provider.com/game-iframe?sessionId=SESSION-uuid"></iframe>

<!-- Player controls (bet/cashout) -->
<iframe src="https://provider.com/controls-iframe?sessionId=SESSION-uuid"></iframe>
```

### 3. Implement Callback Endpoints

The platform must implement these HTTP endpoints:

#### POST /game-callbacks/bet
Called when a player places a bet. Platform should deduct balance.

Request:
```json
{
  "requestId": "BET-R123-player123-1699999999999",
  "roundId": "R-1699999999999-0",
  "playerId": "player123",
  "sessionId": "SESSION-uuid",
  "amount": 10.00,
  "currency": "EUR",
  "timestamp": 1699999999999
}
```

Success Response:
```json
{
  "status": "OK",
  "transactionId": "TXN-123",
  "newBalance": 90.00
}
```

Error Response:
```json
{
  "status": "ERROR",
  "code": "INSUFFICIENT_FUNDS",
  "message": "Not enough balance"
}
```

Error codes: `INSUFFICIENT_FUNDS`, `INVALID_SESSION`, `BET_LIMIT_EXCEEDED`

#### POST /game-callbacks/win
Called when a player cashes out. Platform should credit winnings.

Request:
```json
{
  "requestId": "WIN-R123-player123-1699999999999",
  "roundId": "R-1699999999999-0",
  "playerId": "player123",
  "sessionId": "SESSION-uuid",
  "betAmount": 10.00,
  "multiplier": 2.50,
  "winAmount": 25.00,
  "currency": "EUR",
  "betTransactionId": "TXN-123",
  "timestamp": 1699999999999
}
```

Response:
```json
{
  "status": "OK",
  "transactionId": "TXN-456",
  "newBalance": 115.00
}
```

#### POST /game-callbacks/rollback
Called when a bet needs to be reversed (e.g., game error).

Request:
```json
{
  "requestId": "ROLLBACK-R123-player123-1699999999999",
  "roundId": "R-1699999999999-0",
  "playerId": "player123",
  "sessionId": "SESSION-uuid",
  "amount": 10.00,
  "currency": "EUR",
  "originalTransactionId": "TXN-123",
  "reason": "GAME_ERROR",
  "timestamp": 1699999999999
}
```

Response:
```json
{
  "status": "OK",
  "transactionId": "TXN-789",
  "newBalance": 100.00
}
```

#### POST /game-callbacks/balance
Called to fetch current player balance.

Request:
```json
{
  "playerId": "player123",
  "sessionId": "SESSION-uuid",
  "timestamp": 1699999999999
}
```

Response:
```json
{
  "status": "OK",
  "balance": 100.00,
  "currency": "EUR"
}
```

## WebSocket Communication

### Game Namespace (/ws/game)

Read-only namespace for game visualization.

**Server → Client Events:**
- `betting_phase` - Betting phase started
- `round_start` - Round started (multiplier climbing)
- `round_tick` - Multiplier update (every 50ms)
- `round_crash` - Round crashed
- `history` - Round history

### Controls Namespace (/ws/controls)

Interactive namespace for player controls.

**Client → Server Events:**
- `bet` - Place a bet: `{ amount: 10.00 }`
- `cashout` - Cash out current bet
- `get_balance` - Request balance refresh

**Server → Client Events:**
- `balance_update` - Balance changed
- `bet_result` - Bet placement result
- `cashout_result` - Cashout result
- `bet_lost` - Bet lost (didn't cashout before crash)
- `betting_phase` - New betting phase
- `round_start` - Round started
- `round_crash` - Round crashed
- `error` - Error message

## Provably Fair System

### Algorithm

The crash point is calculated using:

```javascript
crashPoint = floor((0.99 / (1 - (HMAC_SHA256(serverSeed, clientSeed:nonce) / 2^48))) * 100) / 100
```

This creates a distribution where:
- 1% of games crash at 1.00x (instant crash - house edge)
- 50% of games crash below 2x
- Higher multipliers become exponentially rarer

### Seed Chain

1. A chain of hashes is pre-generated: `seed[n] = SHA256(seed[n-1])`
2. The first hash in the chain is published as the "commitment"
3. Each game uses seeds from the end of the chain backwards
4. After a round, the server seed is revealed
5. Players verify: `SHA256(revealedSeed) === previouslyKnownHash`

### Verification Endpoint

```http
GET /provably-fair
```

Returns current verification data and recent round seeds.

```http
POST /provably-fair/verify
Content-Type: application/json

{
  "serverSeed": "abc123...",
  "clientSeed": "xyz789...",
  "nonce": 42
}
```

Returns calculated crash point for verification.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/session/init` | POST | Initialize player session |
| `/session/:sessionId` | GET | Get session info |
| `/game-iframe` | GET | Game visualization iframe |
| `/controls-iframe` | GET | Player controls iframe |
| `/provably-fair` | GET | Verification data |
| `/provably-fair/verify` | POST | Verify a round |
| `/game/state` | GET | Current game state |
| `/game/history` | GET | Round history |
| `/health` | GET | Health check |

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `PROVIDER_SECRET` | (set in config) | HMAC secret for signatures |

Game settings in `backend/config.js`:

```javascript
GAME: {
  TICK_INTERVAL_MS: 50,      // Multiplier update frequency
  ROUND_DELAY_MS: 3000,      // Delay between rounds
  BETTING_PHASE_MS: 5000,    // Betting phase duration
  MIN_BET: 0.10,
  MAX_BET: 1000,
  MAX_MULTIPLIER: 1000       // Safety cap
}
```

## File Structure

```
├── backend/
│   ├── server.js              # Main server entry point
│   ├── config.js              # Configuration
│   ├── engine/
│   │   ├── crashEngine.js     # Crash game engine
│   │   └── seeds.js           # Seed management
│   ├── services/
│   │   ├── sessionService.js  # Session management
│   │   ├── callbackService.js # Platform HTTP callbacks
│   │   ├── betService.js      # Bet handling
│   │   └── roundService.js    # Round lifecycle
│   ├── ws/
│   │   ├── gameNamespace.js   # Game WebSocket handler
│   │   └── controlsNamespace.js # Controls WebSocket handler
│   └── util/
│       └── hmac.js            # Crypto utilities
├── frontend/
│   ├── game-iframe/
│   │   ├── index.html         # Game visualization
│   │   └── game.js
│   └── controls-iframe/
│       ├── index.html         # Player controls
│       └── controls.js
├── package.json
└── README.md
```

## Security Considerations

1. **Signature Validation**: All session init requests should be signed by the platform
2. **Callback Authentication**: Provider signs all callbacks with `X-Provider-Signature` header
3. **Session Expiry**: Sessions expire after 24 hours
4. **Rate Limiting**: Implement rate limiting in production
5. **HTTPS**: Always use HTTPS in production
6. **CORS**: Configure proper CORS origins in production

## Round Lifecycle

```
┌─────────────┐
│  WAITING    │◄────────────────────────────────────────┐
└──────┬──────┘                                         │
       │ Generate round                                 │
       ▼                                                │
┌─────────────┐                                         │
│  BETTING    │ (5 seconds)                             │
│   PHASE     │ Players can place bets                  │
└──────┬──────┘                                         │
       │ Betting phase ends                             │
       ▼                                                │
┌─────────────┐                                         │
│   RUNNING   │ Multiplier climbs exponentially         │
│             │ Players can cashout                     │
└──────┬──────┘                                         │
       │ Multiplier reaches crash point                 │
       ▼                                                │
┌─────────────┐                                         │
│   CRASHED   │ Round ends                              │
│             │ Server seed revealed                    │
└──────┬──────┘                                         │
       │ 3 second delay                                 │
       └────────────────────────────────────────────────┘
```
