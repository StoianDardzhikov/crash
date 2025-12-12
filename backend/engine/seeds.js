const { generateRandomHex, sha256 } = require('../util/hmac');

/**
 * Seed management for provably fair crash game
 *
 * How it works:
 * 1. Generate a chain of 10 million hashes (or configurable amount)
 * 2. Start from the END of the chain (last hash becomes first game's server seed)
 * 3. Each game reveals the previous hash, which can be verified by hashing it
 * 4. Players can verify: SHA256(revealedSeed) === previouslyCommittedHash
 */

class SeedManager {
  constructor() {
    this.chainLength = 10000; // Number of games in the chain
    this.currentIndex = 0;
    this.seedChain = [];
    this.clientSeed = '';
    this.initialHash = ''; // The hash we commit to publicly
    this.nonce = 0;
  }

  /**
   * Initialize a new seed chain
   * In production, this would be pre-generated and stored
   */
  initialize() {
    // Generate the initial secret seed
    let currentSeed = generateRandomHex(32);

    // Build the hash chain
    this.seedChain = [currentSeed];

    for (let i = 1; i < this.chainLength; i++) {
      currentSeed = sha256(currentSeed);
      this.seedChain.push(currentSeed);
    }

    // Reverse so we use from the end (index 0 = last generated = first to use)
    this.seedChain.reverse();

    // The initial hash is what we publicly commit to
    this.initialHash = this.seedChain[0];

    // Generate client seed (can be changed by players)
    this.clientSeed = generateRandomHex(32);

    this.currentIndex = 0;
    this.nonce = 0;

    console.log('[Seeds] Initialized seed chain');
    console.log('[Seeds] Public commitment hash:', this.initialHash);

    return {
      publicHash: this.initialHash,
      clientSeed: this.clientSeed
    };
  }

  /**
   * Get the current server seed for a round
   */
  getCurrentServerSeed() {
    if (this.currentIndex >= this.seedChain.length) {
      // Regenerate chain if exhausted
      this.initialize();
    }
    return this.seedChain[this.currentIndex];
  }

  /**
   * Get the previous server seed (for verification after round ends)
   */
  getPreviousServerSeed() {
    if (this.currentIndex === 0) return null;
    return this.seedChain[this.currentIndex - 1];
  }

  /**
   * Advance to next seed after round completes
   */
  advanceToNextSeed() {
    this.currentIndex++;
    this.nonce++;

    if (this.currentIndex >= this.seedChain.length) {
      console.log('[Seeds] Chain exhausted, regenerating...');
      this.initialize();
    }
  }

  /**
   * Get current nonce
   */
  getNonce() {
    return this.nonce;
  }

  /**
   * Get client seed
   */
  getClientSeed() {
    return this.clientSeed;
  }

  /**
   * Set new client seed (player can change this)
   */
  setClientSeed(newClientSeed) {
    this.clientSeed = newClientSeed;
  }

  /**
   * Get public verification data
   */
  getPublicData() {
    return {
      publicHash: this.initialHash,
      clientSeed: this.clientSeed,
      nonce: this.nonce,
      gamesRemaining: this.chainLength - this.currentIndex
    };
  }

  /**
   * Get data for verifying a completed round
   */
  getVerificationData(roundServerSeed, roundNonce) {
    return {
      serverSeed: roundServerSeed,
      clientSeed: this.clientSeed,
      nonce: roundNonce,
      // Next hash in chain proves this seed was pre-committed
      nextHash: this.currentIndex > 0 ? sha256(roundServerSeed) : null
    };
  }
}

// Singleton instance
const seedManager = new SeedManager();

module.exports = seedManager;
