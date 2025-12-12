const sessionService = require('../services/sessionService');
const betService = require('../services/betService');
const callbackService = require('../services/callbackService');
const roundService = require('../services/roundService');
const crashEngine = require('../engine/crashEngine');

/**
 * Controls Namespace WebSocket Handler
 * Path: /ws/controls
 *
 * This namespace is for the controls iframe.
 * It handles player interactions:
 *
 * Receives from server:
 * - balance_update
 * - bet_result
 * - cashout_result
 * - bet_lost
 * - error
 * - betting_phase
 * - round_start
 * - round_crash
 *
 * Sends to server:
 * - bet { amount }
 * - cashout
 * - get_balance
 */

function setupControlsNamespace(io) {
  const controlsNamespace = io.of('/ws/controls');

  controlsNamespace.on('connection', async (socket) => {
    const sessionId = socket.handshake.query.sessionId;

    console.log(`[ControlsNamespace] Connection attempt with sessionId: ${sessionId}`);

    // Validate session
    const session = sessionService.getSession(sessionId);
    if (!session) {
      console.log(`[ControlsNamespace] Invalid session, disconnecting: ${sessionId}`);
      socket.emit('error', { code: 'INVALID_SESSION', message: 'Invalid or expired session' });
      socket.disconnect(true);
      return;
    }

    // Store socket ID in session
    sessionService.setControlsSocket(sessionId, socket.id);

    // Store session data on socket for easy access
    socket.sessionId = sessionId;
    socket.playerId = session.playerId;
    socket.callbackBaseUrl = session.callbackBaseUrl;
    socket.currency = session.currency;

    console.log(`[ControlsNamespace] Player ${session.playerId} connected (controls iframe)`);

    // Fetch initial balance from platform
    await sendBalanceUpdate(socket, session);

    // Send current round state
    sendRoundState(socket);

    // Send player's bet status if they have one
    sendBetStatus(socket);

    // ==================
    // Event Handlers
    // ==================

    /**
     * Handle bet placement
     */
    socket.on('bet', async (data) => {
      const { amount } = data;

      console.log(`[ControlsNamespace] Bet request from ${socket.playerId}: ${amount}`);

      try {
        const result = await betService.placeBet(socket.sessionId, amount);

        socket.emit('bet_result', {
          success: true,
          bet: result.bet,
          newBalance: result.newBalance
        });

        // Broadcast bet placement to all (for showing other players' bets)
        controlsNamespace.emit('player_bet', {
          playerId: socket.playerId,
          amount: result.bet.amount,
          roundId: result.bet.roundId
        });

      } catch (error) {
        console.error(`[ControlsNamespace] Bet error for ${socket.playerId}:`, error.message);
        socket.emit('bet_result', {
          success: false,
          error: error.message
        });
      }
    });

    /**
     * Handle cashout
     */
    socket.on('cashout', async () => {
      console.log(`[ControlsNamespace] Cashout request from ${socket.playerId}`);

      try {
        const result = await betService.processCashout(socket.sessionId);

        if (result.success) {
          socket.emit('cashout_result', {
            success: true,
            cashout: result.cashout,
            newBalance: result.newBalance
          });

          // Broadcast cashout to all (for showing other players' cashouts)
          controlsNamespace.emit('player_cashout', {
            playerId: socket.playerId,
            multiplier: result.cashout.multiplier,
            winAmount: result.cashout.winAmount,
            roundId: result.cashout.roundId
          });
        } else {
          socket.emit('cashout_result', {
            success: false,
            error: result.error,
            cashout: result.cashout // Still include cashout data
          });
        }

      } catch (error) {
        console.error(`[ControlsNamespace] Cashout error for ${socket.playerId}:`, error.message);
        socket.emit('cashout_result', {
          success: false,
          error: error.message
        });
      }
    });

    /**
     * Handle balance request
     */
    socket.on('get_balance', async () => {
      await sendBalanceUpdate(socket, session);
    });

    /**
     * Handle disconnect
     */
    socket.on('disconnect', (reason) => {
      console.log(`[ControlsNamespace] Player ${socket.playerId} disconnected: ${reason}`);
      sessionService.clearSocket(sessionId, 'controls');
    });

    /**
     * Handle errors
     */
    socket.on('error', (error) => {
      console.error(`[ControlsNamespace] Socket error for ${socket.playerId}:`, error);
    });
  });

  return controlsNamespace;
}

/**
 * Fetch balance from platform and send to client
 */
async function sendBalanceUpdate(socket, session) {
  try {
    const balanceResult = await callbackService.getBalance({
      callbackBaseUrl: session.callbackBaseUrl,
      playerId: session.playerId,
      sessionId: session.sessionId
    });

    if (balanceResult.success) {
      sessionService.updateBalance(session.sessionId, balanceResult.balance);

      socket.emit('balance_update', {
        balance: balanceResult.balance,
        currency: balanceResult.currency || session.currency
      });
    } else {
      // Use cached balance if available
      const cachedBalance = sessionService.getBalance(session.sessionId);
      if (cachedBalance !== null) {
        socket.emit('balance_update', {
          balance: cachedBalance,
          currency: session.currency,
          cached: true
        });
      } else {
        socket.emit('error', {
          code: 'BALANCE_FETCH_FAILED',
          message: 'Could not fetch balance'
        });
      }
    }
  } catch (error) {
    console.error(`[ControlsNamespace] Balance fetch error:`, error.message);
    socket.emit('error', {
      code: 'BALANCE_FETCH_FAILED',
      message: error.message
    });
  }
}

/**
 * Send current round state to socket
 */
function sendRoundState(socket) {
  const round = roundService.getCurrentRoundState();

  if (!round) {
    socket.emit('waiting', { message: 'Waiting for next round...' });
    return;
  }

  socket.emit('round_state', {
    roundId: round.id,
    status: round.status,
    currentMultiplier: round.currentMultiplier,
    serverSeedHash: round.serverSeedHash
  });
}

/**
 * Send player's bet status
 */
function sendBetStatus(socket) {
  const bet = crashEngine.getPlayerBet(socket.playerId);
  const hasCashedOut = crashEngine.hasPlayerCashedOut(socket.playerId);

  if (bet) {
    socket.emit('bet_status', {
      hasBet: true,
      bet: {
        amount: bet.amount,
        placedAt: bet.placedAt
      },
      hasCashedOut
    });
  } else {
    socket.emit('bet_status', {
      hasBet: false,
      hasCashedOut: false
    });
  }
}

module.exports = setupControlsNamespace;
