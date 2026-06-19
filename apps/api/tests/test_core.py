from backend.core.crypto import decrypt_json, decrypt_str, encrypt_json, encrypt_str
from backend.core.security import (
    create_access_token,
    decode_token,
    hash_password,
    verify_password,
)
from backend.mqtt.service import MQTT_MESSAGE, route_message


def test_password_hash_roundtrip():
    h = hash_password("correct horse battery staple")
    assert verify_password("correct horse battery staple", h)
    assert not verify_password("wrong", h)


def test_password_over_72_bytes_does_not_crash():
    # bcrypt's 72-byte limit must be handled, not raised.
    long = "a" * 200
    assert verify_password(long, hash_password(long))


def test_access_token_roundtrip():
    token = create_access_token("user-123", role="owner")
    payload = decode_token(token, "access")
    assert payload["sub"] == "user-123" and payload["role"] == "owner"


def test_crypto_str_roundtrip():
    token = encrypt_str("secret value")
    assert token != "secret value"
    assert decrypt_str(token) == "secret value"


def test_crypto_json_roundtrip():
    data = {"api_key": "abc", "nested": {"n": 1}}
    assert decrypt_json(encrypt_json(data)) == data


def test_mqtt_route_message():
    event = route_message("domus/sensor/1", "23.5")
    assert event.type == MQTT_MESSAGE
    assert event.data == {"topic": "domus/sensor/1", "payload": "23.5"}
