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
