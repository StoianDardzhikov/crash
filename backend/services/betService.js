const crashEngine = require('../engine/crashEngine');
const sessionService = require('./sessionService');
const callbackService = require('./callbackService');
const config = require('../config');

/**
 * Bet Service
 * Handles bet placement and cashout logic with platform callbacks
 */

class BetService {
  constructor() {
    // Track active bets with their transaction IDs
    this.activeBets = new Map(); // playerId -> { bet, transactionId }
  }

  /**
   * Place a bet
   * 1. Validate session and amount
   * 2. Call platform /bet callback to deduct balance
   * 3. If successful, register bet with crash engine
   */
  async placeBet(sessionId, amount) {
    // Validate session
    const session = sessionService.validateSession(sessionId);
    const { playerId, currency, callbackBaseUrl } = session;

    // Validate bet amount
    if (typeof amount !== 'number' || isNaN(amount)) {
      throw new Error('Invalid bet amount');
    }

    if (amount < config.GAME.MIN_BET) {
      throw new Error(`Minimum bet is ${config.GAME.MIN_BET}`);
    }

    if (amount > config.GAME.MAX_BET) {
      throw new Error(`Maximum bet is ${config.GAME.MAX_BET}`);
    }

    // Check if player already has a bet this round
    const existingBet = crashEngine.getPlayerBet(playerId);
    if (existingBet) {
      throw new Error('Already placed a bet this round');
    }

    // Get current round
    const round = crashEngine.getCurrentRound();
    if (!round) {
      throw new Error('No active round');
    }

    if (round.status !== 'betting') {
      throw new Error('Betting phase has ended');
    }

    // Round the amount to 2 decimal places
    const roundedAmount = Math.round(amount * 100) / 100;

    // Call platform to deduct balance
    const callbackResult = await callbackService.placeBet({
      callbackBaseUrl,
      roundId: round.id,
      playerId,
      sessionId,
      amount: roundedAmount,
      currency
    });

    if (!callbackResult.success) {
      // Platform rejected the bet
      throw new Error(callbackResult.message || callbackResult.code || 'Bet rejected by platform');
    }

    // Register bet with crash engine
    try {
      const bet = crashEngine.addBet(playerId, roundedAmount, sessionId);

      // Track the bet with transaction ID
      this.activeBets.set(playerId, {
        bet,
        transactionId: callbackResult.transactionId,
        roundId: round.id,
        callbackBaseUrl,
        currency
      });

      // Update cached balance
      sessionService.updateBalance(sessionId, callbackResult.newBalance);

      console.log(`[BetService] Bet placed: player=${playerId}, amount=${roundedAmount}, txId=${callbackResult.transactionId}`);

      return {
        success: true,
        bet: {
          amount: roundedAmount,
          roundId: round.id,
          transactionId: callbackResult.transactionId
        },
        newBalance: callbackResult.newBalance
      };
    } catch (error) {
      // If we failed to register the bet after platform deducted balance, rollback
      console.error(`[BetService] Failed to register bet, initiating rollback:`, error.message);

      await callbackService.rollback({
        callbackBaseUrl,
        roundId: round.id,
        playerId,
        sessionId,
        amount: roundedAmount,
        currency,
        originalTransactionId: callbackResult.transactionId,
        reason: 'REGISTRATION_FAILED'
      });

      throw error;
    }
  }

  /**
   * Process cashout
   * 1. Get current multiplier and calculate win
   * 2. Call platform /win callback to credit winnings
   * 3. If successful, register cashout with crash engine
   */
  async processCashout(sessionId) {
    // Validate session
    const session = sessionService.validateSession(sessionId);
    const { playerId, currency, callbackBaseUrl } = session;

    // Check if player has an active bet
    const activeBet = this.activeBets.get(playerId);
    if (!activeBet) {
      throw new Error('No active bet found');
    }

    // Check if already cashed out
    if (crashEngine.hasPlayerCashedOut(playerId)) {
      throw new Error('Already cashed out');
    }

    // Get current round
    const round = crashEngine.getCurrentRound();
    if (!round || round.status !== 'running') {
      throw new Error('Round is not running');
    }

    // Process cashout in engine first to lock the multiplier
    let cashoutData;
    try {
      cashoutData = crashEngine.cashout(playerId);
    } catch (error) {
      throw new Error(error.message);
    }

    // Call platform to credit winnings
    const callbackResult = await callbackService.creditWin({
      callbackBaseUrl,
      roundId: round.id,
      playerId,
      sessionId,
      betAmount: cashoutData.betAmount,
      multiplier: cashoutData.multiplier,
      winAmount: cashoutData.winAmount,
      currency,
      betTransactionId: activeBet.transactionId
    });

    if (!callbackResult.success) {
      // Platform failed to credit - this is a critical error
      // The cashout was already registered in the engine
      // We need to handle this carefully
      console.error(`[BetService] CRITICAL: Win callback failed for player ${playerId}:`, callbackResult);

      // Return partial success - the cashout happened but platform didn't credit
      // Platform should handle reconciliation
      return {
        success: false,
        error: callbackResult.message || callbackResult.code,
        cashout: {
          betAmount: cashoutData.betAmount,
          multiplier: cashoutData.multiplier,
          winAmount: cashoutData.winAmount,
          roundId: round.id
        }
      };
    }

    // Update cached balance
    sessionService.updateBalance(sessionId, callbackResult.newBalance);

    // Clear active bet
    this.activeBets.delete(playerId);

    console.log(`[BetService] Cashout processed: player=${playerId}, multiplier=${cashoutData.multiplier}x, win=${cashoutData.winAmount}`);

    return {
      success: true,
      cashout: {
        betAmount: cashoutData.betAmount,
        multiplier: cashoutData.multiplier,
        winAmount: cashoutData.winAmount,
        roundId: round.id,
        transactionId: callbackResult.transactionId
      },
      newBalance: callbackResult.newBalance
    };
  }

  /**
   * Handle round crash - process all losing bets
   * Called by round service when round crashes
   */
  async handleRoundCrash(roundId, losers) {
    // Losers are players who bet but didn't cash out
    // Their bets are already deducted, so we just clean up

    for (const loser of losers) {
      const activeBet = this.activeBets.get(loser.playerId);
      if (activeBet) {
        console.log(`[BetService] Player ${loser.playerId} lost ${loser.bet.amount} (didn't cashout)`);
        this.activeBets.delete(loser.playerId);
      }
    }

    console.log(`[BetService] Round ${roundId} crash processed, ${losers.length} losers`);
  }

  /**
   * Get player's active bet
   */
  getActiveBet(playerId) {
    return this.activeBets.get(playerId);
  }

  /**
   * Check if player has active bet
   */
  hasActiveBet(playerId) {
    return this.activeBets.has(playerId);
  }

  /**
   * Clear all active bets (for emergency reset)
   */
  clearAllBets() {
    this.activeBets.clear();
  }
}

// Singleton
const betService = new BetService();

module.exports = betService;
