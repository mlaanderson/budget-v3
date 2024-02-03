import { createHash } from 'crypto';

/**
 * Performs a SHA256 hash of a clear text password
 * @param {string} password Clear text password
 * @returns {string}
 */
function HashPassword(password) {
    return createHash('sha256').update(password).digest('hex');        
}


export {
    HashPassword
}