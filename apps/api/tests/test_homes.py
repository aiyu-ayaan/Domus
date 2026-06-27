import pytest


@pytest.mark.asyncio
async def test_billing_settings_default_then_sync(client, owner, home):
    """A fresh home returns default billing settings; PATCH persists and GET reflects
    them — the server-side store that lets web + Android share one tariff."""
    H = owner["headers"]
    hid = home["id"]

    # Default before any save.
    got = (await client.get(f"/api/v1/homes/{hid}", headers=H)).json()
    assert got["billing_settings"]["currency"] == "₹"
    assert got["billing_settings"]["type"] == "flat"
    assert got["billing_settings"]["billing_cycle_start_day"] == 1

    # Save a tiered tariff in a different currency.
    patch = {
        "billing_settings": {
            "type": "tiered",
            "currency": "$",
            "rate": 0.0,
            "fixed_charge": 5.0,
            "tiers": [{"up_to": 100, "rate": 0.1}, {"up_to": None, "rate": 0.2}],
            "billing_cycle_start_day": 15,
        }
    }
    patched = (await client.patch(f"/api/v1/homes/{hid}", json=patch, headers=H)).json()
    assert patched["billing_settings"]["currency"] == "$"
    assert patched["billing_settings"]["type"] == "tiered"
    assert len(patched["billing_settings"]["tiers"]) == 2

    # Persisted: a second client (GET) sees the same — i.e. it syncs.
    again = (await client.get(f"/api/v1/homes/{hid}", headers=H)).json()
    assert again["billing_settings"]["currency"] == "$"
    assert again["billing_settings"]["billing_cycle_start_day"] == 15
