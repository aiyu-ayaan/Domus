import pytest
from unittest.mock import MagicMock
from backend.core.exceptions import ConflictError
from backend.integrations.adapters.tuya_openapi import RealTuyaOpenApiAdapter

@pytest.mark.asyncio
async def test_tuya_openapi_discovery_handles_swallowed_error(monkeypatch):
    mock_cloud = MagicMock()
    mock_cloud.getdevices.return_value = []
    mock_cloud.getdevices_raw = {
        "result": [],
        "Error": "Unable to Get Cloud Token",
        "Err": "911",
        "Payload": "Cloud _gettoken() failed: 'clientId is invalid'"
    }
    
    monkeypatch.setattr("tinytuya.Cloud", lambda **kwargs: mock_cloud)
    # Force fallback to raise the original exception
    monkeypatch.setattr("backend.integrations.adapters.tuya_lan.TINYTUYA_AVAILABLE", False)
    
    adapter = RealTuyaOpenApiAdapter({
        "access_id": "test_id",
        "access_secret": "test_secret",
        "region": "us"
    })
    
    with pytest.raises(ConflictError) as exc_info:
        await adapter.discover_devices()
        
    assert "Unable to Get Cloud Token" in str(exc_info.value)


@pytest.mark.asyncio
async def test_tuya_openapi_discovery_handles_success_false(monkeypatch):
    mock_cloud = MagicMock()
    mock_cloud.getdevices.return_value = []
    mock_cloud.getdevices_raw = {
        "result": [],
        "success": False,
        "code": 1106,
        "msg": "permission deny"
    }
    
    monkeypatch.setattr("tinytuya.Cloud", lambda **kwargs: mock_cloud)
    # Force fallback to raise the original exception
    monkeypatch.setattr("backend.integrations.adapters.tuya_lan.TINYTUYA_AVAILABLE", False)
    
    adapter = RealTuyaOpenApiAdapter({
        "access_id": "test_id",
        "access_secret": "test_secret",
        "region": "us"
    })
    
    with pytest.raises(ConflictError) as exc_info:
        await adapter.discover_devices()
        
    assert "permission deny" in str(exc_info.value)


@pytest.mark.asyncio
async def test_tuya_openapi_discovery_success(monkeypatch):
    mock_cloud = MagicMock()
    mock_cloud.getdevices.return_value = [
        {"id": "device123", "name": "Switch", "category": "kg", "product_name": "Smart Switch", "online": True}
    ]
    mock_cloud.getdevices_raw = {
        "result": [
            {"id": "device123", "name": "Switch", "category": "kg", "product_name": "Smart Switch", "online": True}
        ],
        "success": True
    }
    
    monkeypatch.setattr("tinytuya.Cloud", lambda **kwargs: mock_cloud)
    
    adapter = RealTuyaOpenApiAdapter({
        "access_id": "test_id",
        "access_secret": "test_secret",
        "region": "us"
    })
    
    devices = await adapter.discover_devices()
    assert len(devices) == 1
    assert devices[0].external_id == "device123"
    assert devices[0].name == "Switch"
    assert devices[0].model == "Smart Switch"


@pytest.mark.asyncio
async def test_tuya_openapi_discovery_falls_back_to_lan(monkeypatch):
    mock_cloud = MagicMock()
    mock_cloud.getdevices.return_value = []
    mock_cloud.getdevices_raw = {
        "result": [],
        "success": False,
        "code": 28841004,
        "msg": "IoT Core trial quota is exhausted"
    }
    monkeypatch.setattr("tinytuya.Cloud", lambda **kwargs: mock_cloud)
    
    import tinytuya.scanner as tuya_scanner
    fake_lan_devices = {
        "local_dev_1": {"id": "local_dev_1", "ip": "192.168.1.100", "version": "3.3", "name": "LAN Switch"}
    }
    monkeypatch.setattr(tuya_scanner, "devices", lambda **kw: fake_lan_devices)
    
    adapter = RealTuyaOpenApiAdapter({
        "access_id": "test_id",
        "access_secret": "test_secret",
        "region": "us"
    })
    
    devices = await adapter.discover_devices()
    assert len(devices) == 1
    assert devices[0].external_id == "local_dev_1"
    assert devices[0].name == "LAN Switch"
    assert devices[0].manufacturer == "Tuya/SmartLife (LAN)"
