const { hmacSha256Buffer } = require('../util/hmac');
const seedManager = require('./seeds');
const config = require('../config');

/**
 * Crash Game Engine
 *
 * Provably Fair Algorithm:
 * crashPoint = floor((1 / (1 - (HMAC_SHA256(serverSeed, clientSeed+nonce) / 2^52)))) / 100
 *
 * This creates a distribution where:
 * - 1% of games crash at 1.00x (instant crash)
 * - 50% of games crash below 2x
 * - Higher multipliers become exponentially rarer
 */

class CrashEngine {
  constructor() {
    this.currentRound = null;
    this.roundHistory = [];
    this.listeners = new Map();
  }

  /**
   * Initialize the engine
   */
  initialize() {
    seedManager.initialize();
    console.log('[CrashEngine] Initialized');
  }

  /**
   * Calculate crash point from seeds
   * Uses the provably fair formula
   */
  calculateCrashPoint(serverSeed, clientSeed, nonce) {
    // Combine client seed and nonce
    const message = `${clientSeed}:${nonce}`;

    // Get HMAC-SHA256 hash
    const hash = hmacSha256Buffer(serverSeed, message);

    // Take first 52 bits (6.5 bytes) for the random value
    // JavaScript can safely handle integers up to 2^53
    const h = hash.readUIntBE(0, 6); // Read 6 bytes as big-endian unsigned int

    // Divisor is 2^48 (since we read 6 bytes = 48 bits)
    const divisor = Math.pow(2, 48);

    // Calculate the raw value between 0 and 1
    const raw = h / divisor;

    // 1% house edge: if raw < 0.01, instant crash
    if (raw < 0.01) {
      return 1.00;
    }

    // Calculate crash point using the formula
    // crashPoint = 0.99 / (1 - raw)
    // This gives us the distribution we want
    const crashPoint = Math.floor((0.99 / (1 - raw)) * 100) / 100;

    // Cap at maximum multiplier for safety
    return Math.min(crashPoint, config.GAME.MAX_MULTIPLIER);
  }

  /**
   * Generate a new round
   */
  generateRound() {
    const serverSeed = seedManager.getCurrentServerSeed();
    const clientSeed = seedManager.getClientSeed();
    const nonce = seedManager.getNonce();

    const crashPoint = this.calculateCrashPoint(serverSeed, clientSeed, nonce);

    const round = {
      id: `R-${Date.now()}-${nonce}`,
      serverSeed,
      serverSeedHash: require('../util/hmac').sha256(serverSeed),
      clientSeed,
      nonce,
      crashPoint,
      startTime: null,
      endTime: null,
      status: 'pending', // pending, betting, running, crashed
      currentMultiplier: 1.00,
      bets: new Map(),
      cashedOut: new Map()
    };

    this.currentRound = round;

    console.log(`[CrashEngine] Generated round ${round.id} with crash point ${crashPoint}x`);

    return round;
  }

  /**
   * Start the betting phase
   */
  startBettingPhase() {
    if (!this.currentRound) {
      this.generateRound();
    }

    this.currentRound.status = 'betting';
    console.log(`[CrashEngine] Betting phase started for round ${this.currentRound.id}`);

    this.emit('betting_phase', {
      roundId: this.currentRound.id,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce,
      duration: config.GAME.BETTING_PHASE_MS
    });

    return this.currentRound;
  }

  /**
   * Start the round (multiplier starts climbing)
   */
  startRound() {
    if (!this.currentRound || this.currentRound.status !== 'betting') {
      throw new Error('No round in betting phase');
    }

    this.currentRound.status = 'running';
    this.currentRound.startTime = Date.now();
    this.currentRound.currentMultiplier = 1.00;

    console.log(`[CrashEngine] Round ${this.currentRound.id} started`);

    this.emit('round_start', {
      roundId: this.currentRound.id,
      serverSeedHash: this.currentRound.serverSeedHash,
      startTime: this.currentRound.startTime
    });

    return this.currentRound;
  }

  /**
   * Calculate current multiplier based on elapsed time
   * Uses exponential growth: multiplier = e^(0.00006 * elapsed_ms)
   */
  calculateMultiplier(elapsedMs) {
    // Growth rate - adjust for desired game speed
    const growthRate = 0.00006;
    const multiplier = Math.pow(Math.E, growthRate * elapsedMs);
    return Math.floor(multiplier * 100) / 100;
  }

  /**
   * Tick - update multiplier and check for crash
   */
  tick() {
    if (!this.currentRound || this.currentRound.status !== 'running') {
      return null;
    }

    const elapsed = Date.now() - this.currentRound.startTime;
    const newMultiplier = this.calculateMultiplier(elapsed);

    this.currentRound.currentMultiplier = newMultiplier;

    // Check if crashed
    if (newMultiplier >= this.currentRound.crashPoint) {
      return this.crash();
    }

    // Emit tick
    this.emit('round_tick', {
      roundId: this.currentRound.id,
      multiplier: newMultiplier,
      elapsed
    });

    return {
      multiplier: newMultiplier,
      crashed: false
    };
  }

  /**
   * Crash the round
   */
  crash() {
    if (!this.currentRound) return null;

    this.currentRound.status = 'crashed';
    this.currentRound.endTime = Date.now();
    this.currentRound.currentMultiplier = this.currentRound.crashPoint;

    console.log(`[CrashEngine] Round ${this.currentRound.id} crashed at ${this.currentRound.crashPoint}x`);

    // Prepare verification data
    const verificationData = {
      roundId: this.currentRound.id,
      crashPoint: this.currentRound.crashPoint,
      serverSeed: this.currentRound.serverSeed,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce
    };

    this.emit('round_crash', verificationData);

    // Store in history
    this.roundHistory.unshift({
      id: this.currentRound.id,
      crashPoint: this.currentRound.crashPoint,
      serverSeed: this.currentRound.serverSeed,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce,
      startTime: this.currentRound.startTime,
      endTime: this.currentRound.endTime
    });

    // Keep only last 50 rounds in memory
    if (this.roundHistory.length > 50) {
      this.roundHistory.pop();
    }

    // Get losers (bets that didn't cash out)
    const losers = [];
    for (const [playerId, bet] of this.currentRound.bets) {
      if (!this.currentRound.cashedOut.has(playerId)) {
        losers.push({ playerId, bet });
      }
    }

    // Advance to next seed
    seedManager.advanceToNextSeed();

    const crashedRound = this.currentRound;
    this.currentRound = null;

    return {
      round: crashedRound,
      losers,
      verification: verificationData
    };
  }

  /**
   * Add a bet to current round
   */
  addBet(playerId, amount, sessionId) {
    if (!this.currentRound) {
      throw new Error('No active round');
    }

    if (this.currentRound.status !== 'betting') {
      throw new Error('Betting phase has ended');
    }

    if (this.currentRound.bets.has(playerId)) {
      throw new Error('Already placed a bet this round');
    }

    const bet = {
      playerId,
      sessionId,
      amount,
      placedAt: Date.now()
    };

    this.currentRound.bets.set(playerId, bet);

    console.log(`[CrashEngine] Player ${playerId} bet ${amount}`);

    return bet;
  }

  /**
   * Process cashout
   */
  cashout(playerId) {
    if (!this.currentRound) {
      throw new Error('No active round');
    }

    if (this.currentRound.status !== 'running') {
      throw new Error('Round is not running');
    }

    const bet = this.currentRound.bets.get(playerId);
    if (!bet) {
      throw new Error('No bet found for player');
    }

    if (this.currentRound.cashedOut.has(playerId)) {
      throw new Error('Already cashed out');
    }

    const multiplier = this.currentRound.currentMultiplier;
    const winAmount = Math.floor(bet.amount * multiplier * 100) / 100;

    const cashoutData = {
      playerId,
      betAmount: bet.amount,
      multiplier,
      winAmount,
      cashedOutAt: Date.now()
    };

    this.currentRound.cashedOut.set(playerId, cashoutData);

    console.log(`[CrashEngine] Player ${playerId} cashed out at ${multiplier}x for ${winAmount}`);

    return cashoutData;
  }

  /**
   * Get current round state
   */
  getCurrentRound() {
    if (!this.currentRound) return null;

    return {
      id: this.currentRound.id,
      status: this.currentRound.status,
      currentMultiplier: this.currentRound.currentMultiplier,
      serverSeedHash: this.currentRound.serverSeedHash,
      clientSeed: this.currentRound.clientSeed,
      nonce: this.currentRound.nonce,
      betsCount: this.currentRound.bets.size,
      startTime: this.currentRound.startTime
    };
  }

  /**
   * Get round history
   */
  getHistory(limit = 20) {
    return this.roundHistory.slice(0, limit);
  }

  /**
   * Get player's bet in current round
   */
  getPlayerBet(playerId) {
    if (!this.currentRound) return null;
    return this.currentRound.bets.get(playerId) || null;
  }

  /**
   * Check if player has cashed out
   */
  hasPlayerCashedOut(playerId) {
    if (!this.currentRound) return false;
    return this.currentRound.cashedOut.has(playerId);
  }

  /**
   * Event handling
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    const callbacks = this.listeners.get(event) || [];
    callbacks.forEach(cb => cb(data));
  }
}

// Singleton
const crashEngine = new CrashEngine();

module.exports = crashEngine;
