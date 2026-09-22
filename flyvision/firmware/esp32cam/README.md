# ESP32-CAM firmware (phase 1 collector)

AI-Thinker **ESP32-CAM + OV2640**. The board is only an eye: JPEG over Wi-Fi.
Person detection, shot matching, and Capture GO run on a PC.

## Power (read this)

Do **not** wire the drone LiPo straight into the CAM.

```text
LiPo  ->  DC-DC buck  ->  5V  ->  ESP32-CAM 5V pin
```

The CAM board has its own LDO. Feed the **5V** pin, not a guess based on
"the ESP32 chip is 3.3V". Measure pack voltage, buck output, and CAM 5V
under motor load with a multimeter.

## Arduino IDE

1. Boards manager: **esp32 by Espressif** (3.x is fine).
2. Board: **AI Thinker ESP32-CAM**.
3. PSRAM: enabled.
4. Open `esp32cam.ino` (folder name must stay `esp32cam`).
5. Default Wi-Fi is a soft AP:
   - SSID `flyvision-cam`
   - password `flyvision`
   - stream `http://192.168.4.1/stream`
6. To join a router, set `FLYVISION_WIFI_AP` to `0` in [`config.h`](config.h)
   and fill `FLYVISION_STA_SSID` / `FLYVISION_STA_PASS`.
7. Flash with a USB-UART adapter on U0R/U0T, GPIO0 held to GND during reset.

HTTP:

| Path | What |
| --- | --- |
| `/` | Tiny page that shows `/stream` |
| `/stream` | MJPEG |
| `/capture` | One JPEG |
| `/status` | Heap, framesize, IP |

Default framesize is VGA (640×480). Switch `FLYVISION_FRAMESIZE` to
`FRAMESIZE_QVGA` if Wi-Fi is dropping frames.

## PC

```bash
PYTHONPATH=flyvision/python python3 -m flyvision stream \
  --url http://192.168.4.1/stream \
  --shots flyvision/data/shots/boktu.json \
  --active-shot shot_03
```

Phase 1 does **not** talk to the flight controller, gimbal, or UART.
