"""
AES-256-GCM encryption for storing restaurant gateway API keys.
Keys are encrypted at rest and decrypted in memory only when needed
for a payment transaction — never logged, never returned to clients.
"""
import base64
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from app.config import get_settings


def _get_aes_key() -> bytes:
    """Derive a 32-byte AES key from the configured encryption key."""
    settings = get_settings()
    key_b64 = settings.encryption_key
    try:
        key = base64.urlsafe_b64decode(key_b64)
    except Exception:
        # Fallback for dev: pad/hash the raw string to 32 bytes
        raw = key_b64.encode()
        key = (raw * 4)[:32]
    if len(key) != 32:
        key = (key * 4)[:32]
    return key


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt a gateway API key. Returns base64-encoded nonce+ciphertext."""
    key = _get_aes_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    combined = nonce + ciphertext
    return base64.urlsafe_b64encode(combined).decode()


def decrypt_api_key(encrypted: str) -> str:
    """Decrypt a stored gateway API key. Returns plaintext."""
    key = _get_aes_key()
    aesgcm = AESGCM(key)
    combined = base64.urlsafe_b64decode(encrypted)
    nonce = combined[:12]
    ciphertext = combined[12:]
    plaintext = aesgcm.decrypt(nonce, ciphertext, None)
    return plaintext.decode()
