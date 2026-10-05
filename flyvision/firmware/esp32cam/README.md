# ESP32-CAM firmware (phase 1 collector)

AI-Thinker **ESP32-CAM + OV2640**. The board is only an eye: JPEG over Wi-Fi.
Person detection, shot matching, and Capture GO run on a PC / browser.

## 无人机挂载 / 烧录 / 接到工作台

木机动力不动。CAM 只出图。

1. Arduino IDE → 开发板 **AI Thinker ESP32-CAM**。2.0.17 没有 PSRAM 菜单，不要找。
   不要点 IDE「上传」。CAM-MB 用终端 `write_flash --before no_reset`。
2. 打开本目录 `esp32cam.ino`（文件夹名必须是 `esp32cam`）。确认 `FRAMESIZE_QVGA`。
3. 验证 → 导出已编译的二进制 → 按住 IO0，点 RST，等 3 秒，再 `write_flash` 到 `0x10000`。
4. 默认 AP：SSID `flyvision-cam`，密码 `flyvision`，地址 `192.168.4.1`。
5. 笔记本加入该 Wi-Fi（会没外网）。**Safari 不要打开 `/` 或 `/stream`**（MJPEG 会整页发白）。
   先开 `http://192.168.4.1/status`，再开 `/capture`。不要用 Chrome+VPN。
6. 打开工作台 **本地 http** `http://localhost:3000/flyvision`（https / Vercel 会拦
   CAM 的 http 流；加入 AP 后也没有外网）。
7. 实拍栏选 **ESP32-CAM 推流**，地址默认 `http://192.168.4.1/stream`，点连接。
   不要开电脑摄像头那条路径。
8. CAM 视场用工作台「CAM 视场」滑条，不要套电脑 70°。用已知身高、已知步测距离标一次。
9. 供电：`LiPo → DC-DC → 5V → CAM 5V`。不要把电池直接接到板子。
10. 镜头朝向和计划镜头同一方向。首飞：小范围悬停，先看流和 YOLO 框，再谈对齐。

板载天线视距大约 50–70 m。100×100 m 场地对角线约 141 m，罩不住；笔记本放起降点附近。

VGA MJPEG 大约 0.5–1.3 Mbps，带宽不是瓶颈，距离才是。

## Power (read this)

Do **not** wire the drone LiPo straight into the CAM.

```text
LiPo  ->  DC-DC buck  ->  5V  ->  ESP32-CAM 5V pin
```

The CAM board has its own LDO. Feed the **5V** pin, not a guess based on
"the ESP32 chip is 3.3V". Measure pack voltage, buck output, and CAM 5V
under motor load with a multimeter.

## Arduino IDE

1. Boards manager: **esp32 by Espressif 2.0.17** (not 3.x on Arduino 1.8.19).
2. Board: **AI Thinker ESP32-CAM**.
3. No PSRAM menu on this board package. Firmware tries DRAM first.
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

Default framesize is QVGA (320×240). VGA + 20 MHz XCLK often inits then
overflows VSYNC: `/capture` is a white Safari page / HTTP 500.

CORS is `*` so a local http workbench can draw frames into canvas.

## PC

```bash
PYTHONPATH=flyvision/python python3 -m flyvision stream \
  --url http://192.168.4.1/stream \
  --shots flyvision/data/shots/boktu.json \
  --active-shot shot_03
```

Phase 1 does **not** talk to the flight controller, gimbal, or UART.
GO on the workbench is occupancy + heading + CLIP, not pinhole meters.
