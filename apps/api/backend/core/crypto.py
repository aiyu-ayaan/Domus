"""Symmetric encryption for secrets at rest (integration credentials, tokens).

Uses Fernet (AES-128-CBC + HMAC) from ``cryptography``, which ships with
python-jose[cryptography]. The key is derived from ``settings.encryption_key`` so a
deployment only manages one secret. Passwords are NOT stored here — those are bcrypt
hashes. This is for reversible secrets we must send back to a device.

ponytail: one key, whole-value encryption. Per-field keys / envelope encryption only if
a real compliance need shows up.
"""

import base64
import hashlib
import json
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from backend.core.config import settings


def _fernet() -> Fernet:
    # Derive a stable 32-byte urlsafe key from the configured secret.
    digest = hashlib.sha256(settings.encryption_key.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(digest))


def encrypt_str(plaintext: str) -> str:
    return _fernet().encrypt(plaintext.encode()).decode()


def decrypt_str(token: str) -> str:
    try:
        return _fernet().decrypt(token.encode()).decode()
    except InvalidToken as exc:
        raise ValueError("Could not decrypt value (wrong key or corrupt data)") from exc


def encrypt_json(data: dict[str, Any]) -> str:
    return encrypt_str(json.dumps(data, separators=(",", ":")))


def decrypt_json(token: str) -> dict[str, Any]:
    return json.loads(decrypt_str(token))
