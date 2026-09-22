# ESP32-P4 — not this phase

Keep the wood airframe and ESP32-CAM collector as they are.

When shot matching is proven on a PC, this folder becomes the on-board AI
module:

```text
Camera (MIPI-CSI / DVP)
        ↓
    ESP32-P4 + ISP
        ↓
   ESP-DL quantized model
        ↓
   Shot Matching + Composition
        ↓
   Capture GO
```

P4 is the eventual replacement for **PC OpenCV**, not a reason to redesign
the motors, ESC, or flight controller now.

Buy a desktop P4 devkit (for example an Olimex ESP32-P4-DevKit) and develop
on the bench. Do not hang it on the wood frame until the CAM + PC loop is
stable.

Useful starting points:

- [ESP-Video-Components on ESP32-P4](https://docs.espressif.com/projects/esp-video-components/en/latest/esp32p4/Get_Started/index.html)
- ESP-DL quantized models on P4

The Python `FeatureExtractor` protocol in `flyvision.match` is the swap
point: histogram now, embedding / ESP-DL later, same Capture GO contract.
