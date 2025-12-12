const crypto = require('crypto');
const config = require('../config');
const { validateSignature } = require('../util/hmac');

/**
 * Session Service
 * Manages player sessions initiated by the platform
 */

class SessionService {
  constructor() {
    // Map of sessionId -> session data
    this.sessions = new Map();

    // Map of playerId -> sessionId (for quick lookup)
    this.playerSessions = new Map();

    // Cleanup expired sessions periodically
    setInterval(() => this.cleanupExpiredSessions(), 60000);
  }

  /**
   * Initialize a new session (called when platform sends POST /session/init)
   */
  createSession({ playerId, currency, token, timestamp, signature, callbackBaseUrl }) {
    // Validate required fields
    if (!playerId || !currency || !token || !callbackBaseUrl) {
      throw new Error('Missing required fields');
    }

    // Validate signature from platform
    // Platform should sign: playerId + token + timestamp with shared secret
    // if (signature && timestamp) {
    //   const isValid = validateSignature(
    //     config.PROVIDER_SECRET,
    //     playerId,
    //     token,
    //     timestamp,
    //     signature
    //   );

    //   if (!isValid) {
    //     throw new Error('Invalid signature');
    //   }

    //   // Check timestamp is not too old (5 minutes)
    //   const timestampAge = Date.now() - parseInt(timestamp);
    //   if (timestampAge > 5 * 60 * 1000) {
    //     throw new Error('Request timestamp too old');
    //   }
    // }

    // Check if player already has an active session
    const existingSessionId = this.playerSessions.get(playerId);
    if (existingSessionId) {
      // Invalidate old session
      this.sessions.delete(existingSessionId);
    }

    // Generate new session ID
    const sessionId = `SESSION-${crypto.randomUUID()}`;

    // Create session
    const session = {
      sessionId,
      playerId,
      currency,
      token,
      callbackBaseUrl,
      createdAt: Date.now(),
      expiresAt: Date.now() + config.SESSION.EXPIRY_MS,
      balance: 0, // Balance is managed by platform, we just cache it
      isConnected: false,
      gameSocketId: null,
      controlsSocketId: null
    };

    this.sessions.set(sessionId, session);
    this.playerSessions.set(playerId, sessionId);

    console.log(`[SessionService] Created session ${sessionId} for player ${playerId}`);

    return {
      sessionId,
      gameUrl: `/game-iframe?sessionId=${sessionId}`,
      controlsUrl: `/controls-iframe?sessionId=${sessionId}`
    };
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);

    if (!session) {
      return null;
    }

    // Check if expired
    if (Date.now() > session.expiresAt) {
      this.destroySession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Get session by player ID
   */
  getSessionByPlayerId(playerId) {
    const sessionId = this.playerSessions.get(playerId);
    if (!sessionId) return null;
    return this.getSession(sessionId);
  }

  /**
   * Validate session exists and is active
   */
  validateSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Invalid or expired session');
    }
    return session;
  }

  /**
   * Update session with socket connection
   */
  setGameSocket(sessionId, socketId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.gameSocketId = socketId;
      session.isConnected = true;
    }
  }

  /**
   * Update session with controls socket connection
   */
  setControlsSocket(sessionId, socketId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.controlsSocketId = socketId;
      session.isConnected = true;
    }
  }

  /**
   * Clear socket from session
   */
  clearSocket(sessionId, socketType) {
    const session = this.sessions.get(sessionId);
    if (session) {
      if (socketType === 'game') {
        session.gameSocketId = null;
      } else if (socketType === 'controls') {
        session.controlsSocketId = null;
      }

      // Mark as disconnected if both sockets are gone
      if (!session.gameSocketId && !session.controlsSocketId) {
        session.isConnected = false;
      }
    }
  }

  /**
   * Update cached balance
   */
  updateBalance(sessionId, balance) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.balance = balance;
    }
  }

  /**
   * Get cached balance
   */
  getBalance(sessionId) {
    const session = this.sessions.get(sessionId);
    return session ? session.balance : null;
  }

  /**
   * Destroy session
   */
  destroySession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      this.playerSessions.delete(session.playerId);
      this.sessions.delete(sessionId);
      console.log(`[SessionService] Destroyed session ${sessionId}`);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    const active = [];
    for (const [sessionId, session] of this.sessions) {
      if (Date.now() < session.expiresAt) {
        active.push(session);
      }
    }
    return active;
  }

  /**
   * Get connected players count
   */
  getConnectedPlayersCount() {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isConnected) count++;
    }
    return count;
  }

  /**
   * Cleanup expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expired = [];

    for (const [sessionId, session] of this.sessions) {
      if (now > session.expiresAt) {
        expired.push(sessionId);
      }
    }

    expired.forEach(sessionId => this.destroySession(sessionId));

    if (expired.length > 0) {
      console.log(`[SessionService] Cleaned up ${expired.length} expired sessions`);
    }
  }

  /**
   * Find session by socket ID
   */
  findSessionBySocketId(socketId) {
    for (const session of this.sessions.values()) {
      if (session.gameSocketId === socketId || session.controlsSocketId === socketId) {
        return session;
      }
    }
    return null;
  }
}

// Singleton
const sessionService = new SessionService();

module.exports = sessionService;
