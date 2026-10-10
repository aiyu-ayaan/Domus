# Light Bulb Color & Temperature Architecture

This document describes the end-to-end architecture for smart light bulb color and white temperature controls in Docus across the web frontend, core domain model, and vendor integrations (Tapo, Tuya / Smart Life, Xiaomi MIoT).

## 1. System Architecture Diagram

```mermaid
flowchart TD
    subgraph UI["apps/web/ — React UI"]
        Drawer["DeviceDrawer<br/>(Controls Section)"]
        LCC["LightColorControls<br/>• Mode Switch (White / Color)<br/>• Liquid Glass Glow Orb<br/>• Kelvin Slider & Presets<br/>• Vivid Swatches & Color Picker"]
        Rules["RuleEditor<br/>(Automations Engine)"]
    end

    subgraph API["Backend HTTP & WebSocket API"]
        CmdRoute["POST /api/v1/devices/:id/command<br/>{ color, color_temp, color_mode, brightness }"]
        WS["WSS /ws<br/>DeviceStateChanged Events"]
    end

    subgraph Core["crates/home-core/"]
        DevCmd["DeviceCommand<br/>• color: Option&lt;String&gt; (#RRGGBB)<br/>• color_mode: Option&lt;String&gt;<br/>• color_temp: Option&lt;u8&gt; (0-100%)<br/>• brightness: Option&lt;u8&gt;"]
        DevState["DeviceState<br/>• color: Option&lt;String&gt;<br/>• color_mode: Option&lt;String&gt;<br/>• color_temp: Option&lt;u8&gt;<br/>• brightness: Option&lt;u8&gt;"]
        Utils["Color Math Utilities<br/>• hex_to_rgb / rgb_to_hex<br/>• rgb_to_hsv / hsv_to_rgb<br/>• hex_to_rgb_int / rgb_int_to_hex"]
    end

    subgraph Mgr["backend/src/integrations/manager.rs"]
        DManager["DeviceManager<br/>• Optimistic state update<br/>• EventBus publish<br/>• Hardware dispatch"]
    end

    subgraph Integrations["backend/src/integrations/ — Hardware Plugins"]
        TapoPlugin["Tapo (KLAP / Local)<br/>• Color Mode: hue (0-360), sat (0-100), color_temp: 0<br/>• White Mode: color_temp (2500-6500K)"]
        TuyaPlugin["Tuya / Smart Life (Cloud / Local)<br/>• Color Mode: colour_data (JSON / hex HHHHSSSSVVVV)<br/>• White Mode: work_mode: 'white', temp_value"]
        XiaomiPlugin["Xiaomi (MIoT / Local miIO)<br/>• Color Mode: color prop ((r<<16)|(g<<8)|b)<br/>• White Mode: color-temperature prop"]
    end

    Drawer --> LCC
    LCC -->|user interaction| CmdRoute
    Rules -->|automation trigger| CmdRoute
    CmdRoute --> DManager
    DManager --> DevCmd
    DevCmd -->|apply_to| DevState
    DManager --> TapoPlugin
    DManager --> TuyaPlugin
    DManager --> XiaomiPlugin
    DManager --> WS
    WS -->|live push| Drawer
```

## 2. Domain Data Model (`crates/home-core`)

The shared domain contracts in `crates/home-core/src/lib.rs` normalize disparate vendor formats into a standardized representation:

| Field | Type | Description |
|---|---|---|
| `color` | `Option<String>` | Standard hex color code `#RRGGBB` (uppercase or lowercase). |
| `color_mode` | `Option<String>` | Operating mode: `"white"` or `"color"`. |
| `color_temp` | `Option<u8>` | Normalized white temperature percentage (0% = warmest candle ~2000K, 100% = coolest ice ~6500K). |
| `brightness` | `Option<u8>` | Luminous intensity level (1–100%). |

### Color Conversion Utilities
`home-core` provides tested, zero-allocation math routines:
- `hex_to_rgb(hex) -> Option<(u8, u8, u8)>`
- `rgb_to_hex(r, g, b) -> String`
- `rgb_to_hsv(r, g, b) -> (u16, u8, u8)` (Hue 0–360, Saturation 0–100, Value 0–100)
- `hsv_to_rgb(h, s, v) -> (u8, u8, u8)`
- `hex_to_rgb_int(hex) -> Option<u32>` and `rgb_int_to_hex(u32) -> String` (Big-endian RGB integer).

## 3. Integration Mappings

### 3.1 Tapo (TP-Link KLAP)
- **Status Decoding**:
  - If `color_temp > 0`, state is normalized to `color_mode: "white"` and `color_temp` mapped from 2500K–6500K.
  - If `color_temp == 0` and `hue` / `saturation` are present, `hsv_to_rgb` computes the hex `#RRGGBB` and sets `color_mode: "color"`.
- **Command Dispatch**:
  - Setting `color`: Converts `#RRGGBB` to HSV. Dispatches `{"hue": H, "saturation": S, "color_temp": 0}` to the device.
  - Setting `color_temp`: Dispatches `{"color_temp": 2500 + pct * 40, "hue": 0, "saturation": 0}`.

### 3.2 Tuya / Smart Life
- **DP Codes**:
  - `colour_data_v2`, `colour_data_hsv`, `colour_data`
  - `work_mode`: `"white"` vs `"colour"`
- **Status Decoding**:
  - Decodes JSON format `{"h": 0-360, "s": 0-1000, "v": 0-1000}`.
  - Decodes Tuya 12-character hex format `HHHHSSSSVVVV` (4-hex-digit H, S, V).
  - Decodes Tuya 14-character hex format `RRGGBBHHHHSSVV`.
- **Command Dispatch**:
  - Setting `color`: Converts `#RRGGBB` to Tuya's target format, sets `work_mode: "colour"`.
  - Setting `color_temp`: Dispatches scaled `temp_value` (0–1000) and sets `work_mode: "white"`.

### 3.3 Xiaomi MIoT
- **Property Mappings**:
  - `color` (`urn:miot-spec-v2:property:color`)
  - `color-temperature` (`urn:miot-spec-v2:property:color-temperature`)
- **Status Decoding**:
  - Unpacks 24-bit integer `(r << 16) | (g << 8) | b` to `#RRGGBB`.
- **Command Dispatch**:
  - Converts hex `#RRGGBB` to integer `(r << 16) | (g << 8) | b` and sends `set_properties`.

## 4. User Experience & Apple Liquid Glass UI

`apps/web/src/components/devices/LightColorControls.tsx` provides:
1. **Mode Switcher**: Segmented pill tabs between "White" and "Color" modes.
2. **Liquid Glass Ambient Glow Orb**:
   - Translucent glass orb featuring specular highlight reflection curvature, inner depth shading, and soft ambient radiance box-shadows.
   - Dynamically tints and glows based on live color, temperature, brightness percentage, and power state.
3. **White Mode**:
   - Visual color temperature slider with smooth Kelvin gradient background (Candle Amber 2000K to Cool Sky 6500K).
   - Quick presets: Warm Yellow / Candle (2000K), Soft White (2700K), Daylight (5000K), Cool White (6500K).
4. **Color Mode**:
   - Curated palette swatches: Warm Amber, Gold, Sunset Orange, Crimson Red, Neon Pink, Purple, Sky Blue, Cyan, Emerald Green, Lime.
   - Custom native color wheel picker and interactive hue slider with editable Hex badge.
5. **Automations Integration**:
   - `RuleEditor` supports selecting and configuring color or temperature actions for individual lights and groups.

## Moods and effects

Presets a light can be set to in one tap, on web (`LightScenes.tsx`) and Android (`PresetGrid` in the device sheet).
The catalog lives in `crates/home-core/src/effects.rs` and is served at `GET /devices/effects`.

- **Mood** — a still white setting (brightness + warmth). `DeviceCommand::resolved()` turns it into a plain
  white command before it reaches a plugin, so every light supports it.
- **Effect** — a loop of colours the bulb plays by itself. Nothing is streamed while it runs. A light lists the
  effects it can play in `state.options.effect`; `state.effect` is the one playing, read back from the device.

```mermaid
flowchart LR
    UI[Web / Android tile] -- "POST /devices/:id/command {effect: id}" --> M[DeviceManager.command]
    M -- "mood id" --> R[resolved: is_on + brightness + color_temp]
    R --> P[any plugin: normal white command]
    M -- "effect id" --> T{integration}
    T -- Tuya --> TS["work_mode = scene<br/>scene_data_v2 {scene_num = slot, scene_units per colour}"]
    T -- "Tapo strip" --> TP["set_lighting_effect {type: sequence, sequence: [[h,s,v]…]}"]
    T -- other --> N[ignored: not listed in options.effect]
    M -- "effect: ''" --> S["stop: Tuya work_mode = white · Tapo effect enable = 0"]
```

| Integration | Offered when | Running effect read from |
|---|---|---|
| Tuya | the bulb has `scene_data_v2` and `work_mode` includes `scene` | `work_mode == scene`, slot number and first colour match the catalog |
| Tapo | `get_device_info` contains `lighting_effect` (light strips) | `lighting_effect.enable == 1` and its name |
| Xiaomi | not yet | — |

Tapo strips also offer TP-Link's own 17 predefined effects (Aurora, Bubbling Cauldron, Candy Cane, Christmas,
Flicker, Grandma's Christmas Lights, Hanukkah, Haunted Mansion, Icicle, Lightning, Ocean, Rainbow, Raindrop,
Spring, Sunrise, Sunset, Valentines). Their native definitions are data in
`backend/src/integrations/tapo/effects.json` (values as documented by the python-kasa project), sent unchanged
with `set_lighting_effect`. Their ids are `tapo_<name>`; `GET /devices/effects` lists them ahead of the shared
ones, and a strip lists them in `options.effect` followed by the shared effects whose name TP-Link has no preset
for. Any other light ignores a `tapo_` id.

A Tuya bulb addresses scenes by slot 1-8, so the catalog holds at most eight effects and an effect's position is
its slot. A Tapo strip ignores colour changes while an effect runs; the plugin remembers which hosts are playing
and switches the effect off before a plain colour command.
