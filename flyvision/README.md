# flyvision

Drone vision for Camerobot / 云径. Phase 1 answers one question:

> After the camera sees a person, does this frame look like a planned shot?

The wood airframe, motors, ESC, and flight controller stay as they are.
**ESP32-CAM is the eye. A PC is the brain.** ESP32-P4 on-board AI comes
after this loop is proven.

```text
OV2640 → ESP32-CAM → Wi-Fi MJPEG → PC OpenCV
      → Person detect → Shot match → Composition → Capture GO
```

CinePath still plans shots (`yun-jing-project.json`). Camerobot MVP0 still
plans robot motion. flyvision consumes those shots and scores a live frame.

## Four stages

1. **Wood-frame flight** — do not touch propulsion.
2. **PETG structure** — later, modular bays, not a frozen shell.
3. **ESP32-CAM prototype (this folder)** — capture + Wi-Fi + PC matching.
4. **ESP32-P4 AI module** — replace the PC with on-board ESP-DL.

## Software layers

| Layer | Code | Now |
| --- | --- | --- |
| 1 Camera | `camera.py`, `preprocess.py`, `firmware/esp32cam` | MJPEG / webcam / still; crop-resize 256×256 |
| 2 Scene | `scene.py` | Person (HOG or injected box). Building is a stub label |
| 3 Shot matching | `shots.py`, `match.py` | HSV histogram + subject vector vs reference still |
| 4 Composition | `composition.py` | Person center vs `composition.horizontal/vertical` |
| 5 Capture | `capture.py`, `pipeline.py` | Match + composition + N stable frames → `CAPTURE_GO` |

`CAPTURE_GO` writes a BMP. It does **not** fire a shutter, gimbal, or
flight-controller tweak.

## Setup

Default Camerobot install stays zero-dependency. OpenCV is an extra:

```bash
python3 -m pip install -e ".[flyvision]"
```

Or run without installing:

```bash
export PYTHONPATH=flyvision/python
python3 -m flyvision image --help
```

Still-image scoring works with stdlib only (BMP/PPM). Live MJPEG and HOG
need OpenCV.

```bash
# one still, injected person box (no OpenCV)
PYTHONPATH=flyvision/python python3 -m flyvision image \
  --shots flyvision/data/shots/boktu.json \
  --frame flyvision/data/shots/reference/shot_03.bmp \
  --active-shot shot_03 \
  --bbox 0.30,0.27,0.16,0.46

# ESP32-CAM live stream
PYTHONPATH=flyvision/python python3 -m flyvision stream \
  --url http://192.168.4.1/stream \
  --shots flyvision/data/shots/boktu.json \
  --active-shot shot_03
```

Each frame prints:

```text
shot=shot_03 sim=0.91 dx=+0.020 dy=-0.010 COMPOSITION_OK=True stable=False decision=CONTINUE_FOLLOW
```

GO frames land in `flyvision/data/captures/` (gitignored).

CinePath export is the same flag:

```bash
PYTHONPATH=flyvision/python python3 -m flyvision image \
  --shots /path/to/yun-jing-project.json \
  --frame capture.bmp \
  --active-shot shot_03
```

Mapped fields: `shot_id`, `kind`, `target.type`, `composition.horizontal`,
`composition.vertical`, `camera.height`, camera-to-target distance (stored
only). Reference stills: `reference` path, or `reference/shot_XX.bmp`.

## Firmware

See [`firmware/esp32cam/README.md`](firmware/esp32cam/README.md).

Power path:

```text
LiPo → DC-DC buck → 5V → ESP32-CAM 5V pin
```

Buy next (hardware, not this PR): DC-DC buck, multimeter, desktop ESP32-P4
devkit. Gimbal / RTK / new sensor later.

P4 notes: [`firmware/esp32p4/README.md`](firmware/esp32p4/README.md).

## Tests

```bash
python3 -m unittest discover -s flyvision/tests
```

HOG is stubbed. CI does not need OpenCV.

## What this phase does not do

- No motor / ESC / FC changes
- No gimbal PWM
- No MAVLink / RTK
- No PETG CAD
- No on-board model on the CAM
