const crashEngine = require('../engine/crashEngine');
const betService = require('./betService');
const config = require('../config');

/**
 * Round Service
 * Manages round lifecycle: betting -> running -> crashed -> next round
 */

class RoundService {
  constructor() {
    this.tickInterval = null;
    this.isRunning = false;
    this.gameNamespace = null;
    this.controlsNamespace = null;
  }

  /**
   * Set WebSocket namespaces for broadcasting
   */
  setNamespaces(gameNamespace, controlsNamespace) {
    this.gameNamespace = gameNamespace;
    this.controlsNamespace = controlsNamespace;
  }

  /**
   * Initialize and start the game loop
   */
  start() {
    if (this.isRunning) {
      console.log('[RoundService] Already running');
      return;
    }

    crashEngine.initialize();
    this.isRunning = true;

    // Set up crash engine event listeners
    this.setupEngineListeners();

    // Start first round
    this.startNewRound();

    console.log('[RoundService] Started');
  }

  /**
   * Stop the game loop
   */
  stop() {
    this.isRunning = false;
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    console.log('[RoundService] Stopped');
  }

  /**
   * Setup crash engine event listeners
   */
  setupEngineListeners() {
    crashEngine.on('betting_phase', (data) => {
      this.broadcast('betting_phase', data);
    });

    crashEngine.on('round_start', (data) => {
      this.broadcast('round_start', data);
    });

    crashEngine.on('round_tick', (data) => {
      // Send to both namespaces for visual updates
      if (this.gameNamespace) {
        this.gameNamespace.emit('round_tick', data);
      }
      if (this.controlsNamespace) {
        this.controlsNamespace.emit('round_tick', data);
      }
    });

    crashEngine.on('round_crash', (data) => {
      this.broadcast('round_crash', data);
    });
  }

  /**
   * Broadcast to both namespaces
   */
  broadcast(event, data) {
    if (this.gameNamespace) {
      this.gameNamespace.emit(event, data);
    }
    if (this.controlsNamespace) {
      this.controlsNamespace.emit(event, data);
    }
  }

  /**
   * Start a new round
   */
  async startNewRound() {
    if (!this.isRunning) return;

    // Generate new round
    crashEngine.generateRound();

    // Start betting phase
    crashEngine.startBettingPhase();

    // Wait for betting phase to complete
    setTimeout(() => {
      this.startRoundExecution();
    }, config.GAME.BETTING_PHASE_MS);
  }

  /**
   * Start round execution (multiplier climbing)
   */
  startRoundExecution() {
    if (!this.isRunning) return;

    const round = crashEngine.getCurrentRound();
    if (!round || round.status !== 'betting') {
      console.error('[RoundService] Cannot start round - invalid state');
      return;
    }

    // Start the round
    crashEngine.startRound();

    // Start tick interval
    this.tickInterval = setInterval(() => {
      this.processTick();
    }, config.GAME.TICK_INTERVAL_MS);
  }

  /**
   * Process a game tick
   */
  async processTick() {
    if (!this.isRunning) {
      clearInterval(this.tickInterval);
      return;
    }

    const result = crashEngine.tick();

    if (result && result.crashed !== undefined && result.crashed === undefined) {
      // Tick processed, continue
      return;
    }

    // If tick returns crash data, handle it
    if (result && result.round && result.round.status === 'crashed') {
      await this.handleCrash(result);
    }
  }

  /**
   * Handle round crash
   */
  async handleCrash(crashResult) {
    // Stop tick interval
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }

    const { round, losers, verification } = crashResult;

    console.log(`[RoundService] Round ${round.id} crashed at ${round.crashPoint}x`);

    // Process losing bets
    await betService.handleRoundCrash(round.id, losers);

    // Send crash notification with loser info to controls
    if (this.controlsNamespace) {
      // Notify each loser individually
      for (const loser of losers) {
        const session = require('./sessionService').getSessionByPlayerId(loser.playerId);
        if (session && session.controlsSocketId) {
          this.controlsNamespace.to(session.controlsSocketId).emit('bet_lost', {
            roundId: round.id,
            crashPoint: round.crashPoint,
            betAmount: loser.bet.amount
          });
        }
      }
    }

    // Wait before starting next round
    setTimeout(() => {
      this.startNewRound();
    }, config.GAME.ROUND_DELAY_MS);
  }

  /**
   * Get current round state
   */
  getCurrentRoundState() {
    return crashEngine.getCurrentRound();
  }

  /**
   * Get round history
   */
  getHistory(limit = 20) {
    return crashEngine.getHistory(limit);
  }

  /**
   * Check if in betting phase
   */
  isInBettingPhase() {
    const round = crashEngine.getCurrentRound();
    return round && round.status === 'betting';
  }

  /**
   * Check if round is running
   */
  isRoundRunning() {
    const round = crashEngine.getCurrentRound();
    return round && round.status === 'running';
  }
}

// Singleton
const roundService = new RoundService();

module.exports = roundService;
