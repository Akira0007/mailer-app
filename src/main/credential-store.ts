import { safeStorage } from 'electron';

export interface CredentialStore {
  encrypt(plaintext: string): string;
  decrypt(blob: string): string;
}

export class SafeStorageCredentialStore implements CredentialStore {
  constructor() {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error(
        'safeStorage encryption is not available on this system. ' +
        'SMTP credentials require encryption support.',
      );
    }
  }

  encrypt(plaintext: string): string {
    const encrypted = safeStorage.encryptString(plaintext);
    return encrypted.toString('base64');
  }

  decrypt(blob: string): string {
    const buffer = Buffer.from(blob, 'base64');
    return safeStorage.decryptString(buffer);
  }
}
