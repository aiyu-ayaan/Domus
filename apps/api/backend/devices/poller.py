import asyncio

from sqlalchemy import select

from backend.core.database import SessionMaker
from backend.core.logging import get_logger
from backend.devices.models import Device
from backend.devices.service import DeviceService
from backend.integrations.models import Integration
from backend.integrations.registry import get_adapter

log = get_logger("poller")

async def poll_devices_loop():
    log.info("Starting background device poller loop")
    while True:
        try:
            await asyncio.sleep(2.0)
            
            async with SessionMaker() as session:
                res = await session.execute(
                    select(Device).where(Device.online == True)
                )
                devices = res.scalars().all()
                if not devices:
                    continue
                
                for device in devices:
                    try:
                        integration = await session.get(Integration, device.integration_id)
                        if integration and integration.enabled:
                            # Only poll active Tapo integrations to prevent test pollution
                            if integration.type == "tapo":
                                adapter = get_adapter(integration)
                                snapshot = await adapter.get_state(device.external_id)
                                service = DeviceService(session)
                                await service._record(device, snapshot)
                    except Exception as e:
                        log.debug(f"Poller failed to update device {device.id}: {e}")
                
                await session.commit()
        except asyncio.CancelledError:
            log.info("Device poller loop cancelled")
            break
        except Exception as e:
            log.error(f"Error in device poller loop: {e}")
