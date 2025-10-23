"""Token encryption and hashing service."""

import hashlib
import secrets

from cryptography.hazmat.backends import default_backend
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


class EncryptionService:
    """Service for encrypting, decrypting, and hashing tokens."""

    def __init__(self, encryption_key: str):
        """Initialize encryption service with encryption key.

        Args:
            encryption_key: 64-character hex string (32 bytes)

        Raises:
            ValueError: If encryption key is not 64 hex characters
        """
        if len(encryption_key) != 64:
            raise ValueError("Encryption key must be 64 hex characters (32 bytes)")

        try:
            self.key = bytes.fromhex(encryption_key)
        except ValueError as e:
            raise ValueError(f"Encryption key must be valid hex string: {e}")

    def generate_iv(self) -> str:
        """Generate a random 16-byte IV and return as hex string.

        Returns:
            32-character hex string representing 16 bytes
        """
        return secrets.token_hex(16)

    def encrypt_token(self, token: str, iv: str) -> str:
        """Encrypt token using AES-256-CBC.

        Args:
            token: The token string to encrypt
            iv: 32-character hex string (16 bytes)

        Returns:
            Hex-encoded encrypted token

        Raises:
            ValueError: If IV is invalid
        """
        try:
            iv_bytes = bytes.fromhex(iv)
        except ValueError as e:
            raise ValueError(f"IV must be valid hex string: {e}")

        if len(iv_bytes) != 16:
            raise ValueError("IV must be 16 bytes (32 hex characters)")

        cipher = Cipher(algorithms.AES(self.key), modes.CBC(iv_bytes), backend=default_backend())
        encryptor = cipher.encryptor()

        # Pad token to multiple of 16 bytes using PKCS7
        padded_token = self._pad(token.encode())
        encrypted = encryptor.update(padded_token) + encryptor.finalize()
        return encrypted.hex()

    def decrypt_token(self, encrypted_token: str, iv: str) -> str:
        """Decrypt token using AES-256-CBC.

        Args:
            encrypted_token: Hex-encoded encrypted token
            iv: 32-character hex string (16 bytes)

        Returns:
            Decrypted token string

        Raises:
            ValueError: If encrypted_token or IV is invalid
        """
        try:
            iv_bytes = bytes.fromhex(iv)
            encrypted_bytes = bytes.fromhex(encrypted_token)
        except ValueError as e:
            raise ValueError(f"Encrypted token and IV must be valid hex strings: {e}")

        if len(iv_bytes) != 16:
            raise ValueError("IV must be 16 bytes (32 hex characters)")

        cipher = Cipher(algorithms.AES(self.key), modes.CBC(iv_bytes), backend=default_backend())
        decryptor = cipher.decryptor()

        decrypted = decryptor.update(encrypted_bytes) + decryptor.finalize()
        return self._unpad(decrypted).decode()

    def hash_token(self, token: str) -> str:
        """Generate SHA-256 hash of token.

        Args:
            token: The token string to hash

        Returns:
            64-character hex string representing SHA-256 hash
        """
        return hashlib.sha256(token.encode()).hexdigest()

    @staticmethod
    def _pad(data: bytes) -> bytes:
        """Apply PKCS7 padding to data.

        Args:
            data: Bytes to pad

        Returns:
            Padded bytes (multiple of 16)
        """
        padding_length = 16 - (len(data) % 16)
        return data + bytes([padding_length] * padding_length)

    @staticmethod
    def _unpad(data: bytes) -> bytes:
        """Remove PKCS7 padding from data.

        Args:
            data: Padded bytes

        Returns:
            Unpadded bytes

        Raises:
            ValueError: If padding is invalid
        """
        if len(data) == 0:
            raise ValueError("Cannot unpad empty data")

        padding_length = data[-1]

        if padding_length > 16 or padding_length == 0:
            raise ValueError("Invalid padding length")

        # Verify all padding bytes are correct
        for i in range(padding_length):
            if data[-(i + 1)] != padding_length:
                raise ValueError("Invalid padding bytes")

        return data[:-padding_length]
