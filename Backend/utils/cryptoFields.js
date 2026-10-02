import crypto from 'crypto';

const ENCRYPTION_PREFIX = 'enc::';
const IV_LENGTH = 12;

function getEncryptionKey() {
  const source = process.env.ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  return crypto.createHash('sha256').update(source).digest();
}

export function encryptText(value) {
  if (!value || typeof value !== 'string') return value;
  if (!process.env.ENCRYPTION_KEY && !process.env.JWT_SECRET) return value;
  if (value.startsWith(ENCRYPTION_PREFIX)) return value;

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${ENCRYPTION_PREFIX}${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptText(value) {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith(ENCRYPTION_PREFIX)) return value;

  try {
    const payload = value.replace(ENCRYPTION_PREFIX, '');
    const [ivHex, authTagHex, encryptedHex] = payload.split(':');
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getEncryptionKey(),
      Buffer.from(ivHex, 'hex')
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedHex, 'hex')),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch {
    return value;
  }
}

