import crypto from 'crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
});

const privateKeyEscaped = privateKey.replace(/\n/g, '\\n');
const publicKeyEscaped = publicKey.replace(/\n/g, '\\n');

console.log('Copy these two lines into your .env file (replace the existing JWT lines):');
console.log('');
console.log('JWT_PRIVATE_KEY=' + privateKeyEscaped);
console.log('JWT_PUBLIC_KEY=' + publicKeyEscaped);
console.log(''); 