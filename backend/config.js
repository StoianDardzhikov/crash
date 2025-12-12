module.exports = {
  // Server configuration
  PORT: process.env.PORT || 3000,

  // Provider secret for HMAC signature validation
  PROVIDER_SECRET: process.env.PROVIDER_SECRET || 'your-provider-secret-key-change-in-production',

  // Game configuration
  GAME: {
    TICK_INTERVAL_MS: 50,           // Multiplier update interval
    ROUND_DELAY_MS: 3000,           // Delay between rounds
    BETTING_PHASE_MS: 5000,         // Time for players to place bets
    MIN_BET: 1,
    MAX_BET: 100000000000,
    MAX_MULTIPLIER: 1000,           // Safety cap
  },

  // Callback configuration
  CALLBACK: {
    TIMEOUT_MS: 10000,              // Platform callback timeout
    RETRY_ATTEMPTS: 3,
    RETRY_DELAY_MS: 1000,
  },

  // Session configuration
  SESSION: {
    EXPIRY_MS: 24 * 60 * 60 * 1000, // 24 hours
  }
};
