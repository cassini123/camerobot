# flyvision 计划（当前落地）

产品问题：无人机看到人以后，当前画面像不像一个预设镜头？还差多远、偏哪边？

## 四阶段（不推倒重来）

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1 木机动力 | 不动 | 电机 / ESC / 飞控先保持能飞 |
| 2 PETG 结构 | 未做 | 模块化舱，不一次封死 |
| 3 ESP32-CAM + PC 大脑 | **进行中** | CAM 只出图；浏览器接模型 |
| 4 ESP32-P4 端侧 AI | 未做 | 把 PC 上已跑通的模型量化到 P4 |

## 无人机 ESP32-CAM 方案（这一刀）

框反推米数你已经试过了：**不靠谱，不要当过关信号。** 针孔还在，只当旁注。

### 为什么选框米数会假

- 尺度糊：半身 / 胸上被当成 1.7 m 全身，轻松差 4–6 m。
- 三套镜头：上传参考图、笔记本摄像头、机上 OV2640，视场和内参都不一样。
- 裁切 vs 整帧、object-fit vs 像素框对不齐。
- 单帧针孔没有时间锁；笔记本视场滑条是猜的。
- 框中心 ≠ 即将装上无人机的那颗镜头光轴。

所以 **3–4 Hz 过关不用米，用视觉伺服：**

| 信号 | 用不用来 GO | 产品话 |
| --- | --- | --- |
| CLIP + 直方图 + 构图 | 用 | 像不像参考 |
| 框高比 `h_live / h_ref`、面积占位 | **用（主闸）** | 近了 / 远了 |
| 框中心相对参考构图的左右 / 上下 | **用（主闸）** | 偏左 / 偏右 / 偏上 / 偏下 |
| 针孔米数 | 只显示「约 / 不可靠」 | 不当 CAPTURE_GO |
| IoU + Kalman 跟踪 | 稳住框 | 不发布假 RTK |
| 100×100×10 m | 以后飞控地理围栏 | 不是视觉地图 |

没有世界模型。CAM 是眼，地面 PC / 浏览器是脑。以后 ESP32-P4 最多量化 YOLO，仍然不是世界模型。

### 拓扑（这一阶段）

```text
木机动力（不动）
  └─ ESP32-CAM + OV2640  只出 JPEG
        Wi-Fi AP: flyvision-cam
        http://192.168.4.1/stream   VGA MJPEG
Laptop STA 加入 AP
  └─ 浏览器工作台 /flyvision
        YOLO + CLIP 在电脑上，3–4 Hz 够用
        PASS = CLIP 像 + 占位在带内 + 朝向在带内
        FAIL = 近了 / 远了 / 偏左 / 偏右 / 偏上 / 偏下
```

供电：`LiPo → DC-DC → 5V → CAM 5V`。CAM 只采集，不跑模型。

带宽：VGA MJPEG 大约 0.5–1.3 Mbps，够。真正的问题是距离——板载天线视距大约 50–70 m，100×100 场地对角线约 141 m，**不要假装板载天线能罩满。** 笔记本放起降点附近；要远就换定向或外置天线。

挂载：镜头朝向和计划镜头同一方向。OV2640 视场 ≠ 笔记本摄像头，**不要把 70° 电脑滑条偷偷套到 CAM。** 烧录后用已知身高、已知步测距离标一次 CAM 视场，存成 CAM 预设。

首飞：小范围悬停 / 慢速通过，先确认 MJPEG + 检出框，再谈闭环。闭环也不驱动飞控；只在地面报 近了/远了。

以后：Wi-Fi 距离不够再上 P4 量化 YOLO。Depth Anything / YOLO-pose / ByteTrack 是电脑侧以后加的，不是首飞阻塞项。

### 烧录（短）

1. Arduino IDE，开发板 **AI Thinker ESP32-CAM**，打开 `flyvision/firmware/esp32cam/esp32cam.ino`。
2. 烧录。板子开 AP：SSID `flyvision-cam`，密码 `flyvision`。
3. 笔记本加入该 AP，浏览器打开 `http://192.168.4.1/stream`。
4. 工作台（**必须是 http 本地页**，https 会拦 CAM 的 http 流）：实拍栏贴 `http://192.168.4.1/stream`，点连接。
5. 加入 AP 后笔记本没外网，不能开 Vercel。用 `npm run dev` → `http://localhost:3000/flyvision`。或者 `config.h` 里 `FLYVISION_WIFI_AP=0`，CAM 去连家里路由。

## 已接上的模型 / 模块

浏览器工作台 `/flyvision`：

1. **YOLOv8n**（`public/flyvision/yolov8n.onnx` + 本地 `/flyvision/ort` wasm）  
   左边上传图、右边电脑摄像头或 ESP32-CAM 静帧，同一套 COCO 检测。CAM AP 没外网，不走 jsDelivr。
2. **Shot match**（`lib/flyvision-match.ts` + `lib/clip-embed.ts`）  
   **MobileCLIP2-S0** 余弦为主，HSV 直方图只当色调辅项。框中心构图判决不换成嵌入。
3. **占位伺服 + 针孔旁注**（`lib/spatial.ts`）  
   GO 闸：框占位比 + 框中心偏移。针孔仍按可见部位估米，UI 标「约 / 不可靠」，不当过关。  
   电脑视场 / CAM（OV2640）视场分开标定。实拍 IoU+Kalman 锁框，5 帧中值只平滑旁注。
4. **景别标签**（`lib/shot-labels.ts`）  
   FilmOps 式景别（ECU→ELS）+ 构图标签，参考图离线打标。
5. **PC 深度融合**（`flyvision/python/flyvision/depth.py`）  
   Depth Anything V2 Metric（室外 VKITTI）框内中值，与身高先验融合。权重自备。以后加，不是首飞闸。

这三层都进 UI，没有 DEMO 假框。

## 软件五层

```text
Camera frame（上传 / 电脑摄像头 / ESP32-CAM MJPEG）
  → resize / crop
  → YOLOv8n 主体（IoU+Kalman 锁框）
  → 占位：h_live/h_ref、中心偏移 → 近了/远了/偏左/偏右
  → 针孔米数（旁注，约/不可靠）
  → 参考图 vs 实拍：CLIP match + 占位闸
  → 稳定 N 帧 → GO
```

| 层 | 代码 | 作用 |
| --- | --- | --- |
| 1 Camera | 上传 + getUserMedia / ESP32-CAM `/stream` | 出帧 |
| 2 Scene | `lib/yolo.ts` | 人 / 车 / … + 锁框 |
| 2b Gate | `lib/spatial.ts` `judgeGeometry` | 占位 + 朝向，产品口令 |
| 2c Hint | 同一文件针孔 | 大致距离，不是 RTK |
| 3 Match | `lib/flyvision-match.ts` | 像不像参考 |
| 5 Capture | 稳定帧决策 | CLIP + 占位闸；不驱动飞控 |

## 空间公式（粗估，旁注）

先看框像不像全身。笔记本摄像头几乎总是胸上 / 近景，不能按站立 1.7 m 反推。

```text
H, W     = 可见部位的典型身高 / 肩宽（或头宽）
distance ≈ 融合( H / (2 · h · tan(vfov/2)) ,  W / (2 · w · tan(hfov/2)) )
right    ≈ distance · (cx − 0.5) · 2 · tan(hfov/2)
up       ≈ distance · (0.5 − cy) · 2 · tan(vfov/2)
```

过关不用上面这组米。过关用：

```text
heightRatio = h_live / h_ref
dx, dy      = 框中心 − 参考框中心
PASS        = |heightRatio − 1| ≤ 0.18 且 |dx|,|dy| ≤ 0.12 且 CLIP 过阈
```

## 刻意还没接

- 单目深度网络（MiDaS / Depth Anything）— 下一刀，仍在 PC 上验证
- YOLO-pose / ByteTrack / Video Depth Anything
- 飞控 / 云台 / RTK / 100×100×10 围栏
- ESP-DL 上的量化 YOLO（P4）
- 动力系统

## 硬件供电（CAM）

```text
LiPo → DC-DC → 5V → ESP32-CAM 5V
```

不要把电池直接到 CAM。

## 打开

https://camerobot.vercel.app/flyvision （电脑摄像头）  
CAM 推流请用本地 http://localhost:3000/flyvision
