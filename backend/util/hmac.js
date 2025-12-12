const crypto = require('crypto');

/**
 * Generate HMAC-SHA256 hash
 */
function hmacSha256(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest('hex');
}

/**
 * Generate HMAC-SHA256 as buffer for crash point calculation
 */
function hmacSha256Buffer(key, message) {
  return crypto.createHmac('sha256', key).update(message).digest();
}

/**
 * Validate platform signature
 * Platform sends: HMAC-SHA256(providerSecret, playerId + token + timestamp)
 */
function validateSignature(providerSecret, playerId, token, timestamp, signature) {
  const message = `${playerId}${token}${timestamp}`;
  const expectedSignature = hmacSha256(providerSecret, message);
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expectedSignature, 'hex')
  );
}

/**
 * Generate provider signature for callbacks
 */
function generateCallbackSignature(providerSecret, payload) {
  const message = JSON.stringify(payload);
  return hmacSha256(providerSecret, message);
}

/**
 * Generate random hex string
 */
function generateRandomHex(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * SHA256 hash (for seed hashing)
 */
function sha256(message) {
  return crypto.createHash('sha256').update(message).digest('hex');
}

module.exports = {
  hmacSha256,
  hmacSha256Buffer,
  validateSignature,
  generateCallbackSignature,
  generateRandomHex,
  sha256
};
