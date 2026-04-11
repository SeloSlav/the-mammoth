#!/bin/sh
# Generate JWT keys on first run if not provided (Docker convenience).
if [ -z "$JWT_PRIVATE_KEY" ] || [ -z "$JWT_PUBLIC_KEY" ]; then
  echo "[auth] JWT keys not set. Generating dev keys..."
  KEYS=$(node -e "
    const crypto = require('crypto');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });
    console.log('JWT_PRIVATE_KEY=' + privateKey.replace(/\n/g, '\\\\n'));
    console.log('JWT_PUBLIC_KEY=' + publicKey.replace(/\n/g, '\\\\n'));
  ")
  export $(echo "$KEYS" | xargs)
  echo "[auth] Dev JWT keys generated."
fi
exec "$@"
