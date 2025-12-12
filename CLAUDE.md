# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Crash gambling game **provider** (not a platform). Serves games via two iframes and communicates with platform backends via HTTP callbacks for balance operations.

## Commands

```bash
npm install          # Install dependencies
npm start            # Start server (port 3000)
npm run dev          # Development mode with auto-restart
```

## Architecture

### Two-Iframe System
- `/game-iframe` - Read-only game visualization (multiplier, graph, history)
- `/controls-iframe` - Player interactions (bet input, bet/cashout buttons)
- Iframes communicate only via WebSocket, never directly with each other

### WebSocket Namespaces
- `/ws/game` - Game events (round_start, round_tick, round_crash)
- `/ws/controls` - Player actions (bet, cashout) and balance updates

### Platform Callbacks (Provider → Platform)
Provider makes HTTP POST requests to platform's `callbackBaseUrl`:
- `/bet` - Deduct player balance
- `/win` - Credit player winnings
- `/rollback` - Refund failed transactions
- `/balance` - Fetch current balance

### Provably Fair Algorithm
```javascript
crashPoint = floor((0.99 / (1 - (HMAC_SHA256(serverSeed, clientSeed:nonce) / 2^48))) * 100) / 100
```
Uses pre-generated hash chain; seeds revealed after each round for verification.

## Key Files

- `backend/server.js` - Express server, REST endpoints, Socket.IO setup
- `backend/engine/crashEngine.js` - Core crash point calculation and round state
- `backend/engine/seeds.js` - Provably fair seed chain management
- `backend/services/callbackService.js` - HTTP callbacks to platform
- `backend/services/sessionService.js` - Player session management
- `backend/services/betService.js` - Bet placement and cashout with platform integration
- `backend/services/roundService.js` - Round lifecycle (betting → running → crashed)
- `backend/ws/gameNamespace.js` - Game iframe WebSocket handler
- `backend/ws/controlsNamespace.js` - Controls iframe WebSocket handler

## Session Flow

1. Platform calls `POST /session/init` with playerId, currency, callbackBaseUrl
2. Provider returns sessionId and iframe URLs
3. Platform embeds both iframes with sessionId query param
4. Iframes connect to respective WebSocket namespaces
5. All balance operations go through platform callbacks

## Round Lifecycle

`WAITING → BETTING (5s) → RUNNING (multiplier climbs) → CRASHED (3s delay) → WAITING`
