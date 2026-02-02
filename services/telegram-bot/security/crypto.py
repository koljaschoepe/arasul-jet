"""
ARASUL PLATFORM - Cryptographic Services
AES-256-GCM encryption for API keys

Mirrors the Node.js cryptoService.js implementation for compatibility.
"""

import os
import hashlib
import hmac
import logging
from typing import Tuple, Optional
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.backends import default_backend

from config import Config

logger = logging.getLogger('telegram-bot.security.crypto')

# Constants (matching cryptoService.js)
ALGORITHM = 'aes-256-gcm'
IV_LENGTH = 16  # 128 bits
AUTH_TAG_LENGTH = 16  # 128 bits
KEY_LENGTH = 32  # 256 bits


@dataclass
class EncryptedData:
    """Container for encrypted data with IV and auth tag."""
    encrypted: bytes
    iv: str  # hex
    auth_tag: str  # hex


def get_encryption_key() -> bytes:
    """
    Get encryption key from environment variable.
    Falls back to deriving from JWT_SECRET if TELEGRAM_ENCRYPTION_KEY not set.

    Returns:
        32-byte encryption key
    """
    env_key = Config.ENCRYPTION_KEY

    if env_key and len(env_key) >= KEY_LENGTH:
        # Use first 32 bytes of the provided key
        return env_key[:KEY_LENGTH].encode('utf-8')

    if env_key:
        # Key provided but too short - derive using SHA-256
        logger.warning('TELEGRAM_ENCRYPTION_KEY is shorter than 32 characters, deriving key')
        return hashlib.sha256(env_key.encode('utf-8')).digest()

    # Fallback to deriving from JWT_SECRET
    jwt_secret = os.getenv('JWT_SECRET')
    if jwt_secret:
        logger.warning('TELEGRAM_ENCRYPTION_KEY not set, deriving from JWT_SECRET')
        # Use HMAC-like derivation to create separate key
        return hmac.new(
            jwt_secret.encode('utf-8'),
            b'telegram-token-encryption',
            hashlib.sha256
        ).digest()

    raise ValueError('No encryption key available. Set TELEGRAM_ENCRYPTION_KEY or JWT_SECRET')


def encrypt(plaintext: str) -> EncryptedData:
    """
    Encrypt a plaintext string using AES-256-GCM.

    Args:
        plaintext: Text to encrypt

    Returns:
        EncryptedData with encrypted bytes, IV, and auth tag
    """
    if not plaintext or not isinstance(plaintext, str):
        raise ValueError('Plaintext must be a non-empty string')

    key = get_encryption_key()
    iv = os.urandom(IV_LENGTH)

    # Create cipher
    cipher = Cipher(
        algorithms.AES(key),
        modes.GCM(iv),
        backend=default_backend()
    )
    encryptor = cipher.encryptor()

    # Encrypt
    ciphertext = encryptor.update(plaintext.encode('utf-8')) + encryptor.finalize()

    return EncryptedData(
        encrypted=ciphertext,
        iv=iv.hex(),
        auth_tag=encryptor.tag.hex(),
    )


def decrypt(encrypted: bytes, iv: str, auth_tag: str) -> str:
    """
    Decrypt ciphertext using AES-256-GCM.

    Args:
        encrypted: Encrypted bytes
        iv: Hex-encoded initialization vector
        auth_tag: Hex-encoded authentication tag

    Returns:
        Decrypted plaintext
    """
    if not encrypted or not iv or not auth_tag:
        raise ValueError('Missing required parameters for decryption')

    key = get_encryption_key()
    iv_bytes = bytes.fromhex(iv)
    auth_tag_bytes = bytes.fromhex(auth_tag)

    # Create cipher
    cipher = Cipher(
        algorithms.AES(key),
        modes.GCM(iv_bytes, auth_tag_bytes),
        backend=default_backend()
    )
    decryptor = cipher.decryptor()

    # Decrypt
    plaintext = decryptor.update(encrypted) + decryptor.finalize()

    return plaintext.decode('utf-8')


async def encrypt_api_key(
    user_id: int,
    provider: str,
    api_key: str,
) -> bool:
    """
    Encrypt and store an API key for a user.

    Args:
        user_id: Telegram user ID
        provider: Provider name (e.g., 'claude', 'openai')
        api_key: API key to store

    Returns:
        True if successful
    """
    import asyncpg

    # Encrypt the key
    encrypted_data = encrypt(api_key)

    try:
        conn = await asyncpg.connect(Config.DATABASE_URL)
        try:
            await conn.execute(
                """
                INSERT INTO telegram_api_keys
                    (user_id, provider, key_encrypted, key_iv, key_auth_tag, updated_at)
                VALUES ($1, $2, $3, $4, $5, NOW())
                ON CONFLICT (user_id, provider) DO UPDATE SET
                    key_encrypted = EXCLUDED.key_encrypted,
                    key_iv = EXCLUDED.key_iv,
                    key_auth_tag = EXCLUDED.key_auth_tag,
                    updated_at = NOW()
                """,
                user_id,
                provider,
                encrypted_data.encrypted,
                encrypted_data.iv,
                encrypted_data.auth_tag,
            )
            logger.info(f"Stored encrypted API key for user {user_id}, provider {provider}")
            return True
        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"Failed to store API key: {e}")
        return False


async def decrypt_api_key(
    user_id: int,
    provider: str,
) -> Optional[str]:
    """
    Retrieve and decrypt an API key for a user.

    Args:
        user_id: Telegram user ID
        provider: Provider name

    Returns:
        Decrypted API key or None if not found
    """
    import asyncpg

    try:
        conn = await asyncpg.connect(Config.DATABASE_URL)
        try:
            row = await conn.fetchrow(
                """
                SELECT key_encrypted, key_iv, key_auth_tag
                FROM telegram_api_keys
                WHERE user_id = $1 AND provider = $2
                """,
                user_id,
                provider,
            )

            if not row:
                return None

            return decrypt(
                row['key_encrypted'],
                row['key_iv'],
                row['key_auth_tag'],
            )
        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"Failed to retrieve API key: {e}")
        return None


async def delete_api_key(
    user_id: int,
    provider: str,
) -> bool:
    """
    Delete an API key for a user.

    Args:
        user_id: Telegram user ID
        provider: Provider name

    Returns:
        True if key was deleted
    """
    import asyncpg

    try:
        conn = await asyncpg.connect(Config.DATABASE_URL)
        try:
            result = await conn.execute(
                """
                DELETE FROM telegram_api_keys
                WHERE user_id = $1 AND provider = $2
                """,
                user_id,
                provider,
            )
            deleted = result.split()[-1] != '0'
            if deleted:
                logger.info(f"Deleted API key for user {user_id}, provider {provider}")
            return deleted
        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"Failed to delete API key: {e}")
        return False


async def list_api_keys(user_id: int) -> list:
    """
    List all configured API key providers for a user.

    Args:
        user_id: Telegram user ID

    Returns:
        List of provider names
    """
    import asyncpg

    try:
        conn = await asyncpg.connect(Config.DATABASE_URL)
        try:
            rows = await conn.fetch(
                """
                SELECT provider, created_at, updated_at
                FROM telegram_api_keys
                WHERE user_id = $1
                ORDER BY provider
                """,
                user_id,
            )
            return [
                {
                    'provider': row['provider'],
                    'created_at': row['created_at'],
                    'updated_at': row['updated_at'],
                }
                for row in rows
            ]
        finally:
            await conn.close()

    except Exception as e:
        logger.error(f"Failed to list API keys: {e}")
        return []


def mask_key(key: str) -> str:
    """
    Mask an API key for display.

    Args:
        key: Full API key

    Returns:
        Masked key showing only last 4 chars
    """
    if not key or len(key) < 4:
        return '****'
    return f"****{key[-4:]}"
