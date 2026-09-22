# flyvision 计划（当前落地）

产品问题：无人机看到人以后，当前画面像不像一个预设镜头？还差多远、偏哪边？

## 四阶段（不推倒重来）

| 阶段 | 状态 | 说明 |
| --- | --- | --- |
| 1 木机动力 | 不动 | 电机 / ESC / 飞控先保持能飞 |
| 2 PETG 结构 | 未做 | 模块化舱，不一次封死 |
| 3 ESP32-CAM + PC 大脑 | **进行中** | CAM 只出图；浏览器接模型 |
| 4 ESP32-P4 端侧 AI | 未做 | 把 PC 上已跑通的模型量化到 P4 |

## 已接上的模型 / 模块

浏览器工作台 `/flyvision`：

1. **YOLOv8n**（`public/flyvision/yolov8n.onnx` + onnxruntime-web）  
   左边上传图、右边摄像头，同一套 COCO 检测。
2. **Shot match**（`lib/flyvision-match.ts` + `lib/clip-embed.ts`）  
   **MobileCLIP2-S0** 余弦为主，HSV 直方图只当色调辅项。框中心构图判决不换成嵌入。
3. **空间估计**（`lib/spatial.ts`）  
   针孔相机，但按 **可见部位** 取尺度：全身 1.7 m，半身 / 胸上 / 近景用对应身高，并和肩宽/头宽交叉验证。  
   可标定视场 / 身高；截断框可丢弃；实拍 5 帧中值。  
   框中心相对光轴估 **左右 / 高低（米）**。实拍减参考：近了多少、偏左/偏右多少。
4. **景别标签**（`lib/shot-labels.ts`）  
   FilmOps 式景别（ECU→ELS）+ 构图标签，参考图离线打标。
5. **PC 深度融合**（`flyvision/python/flyvision/depth.py`）  
   Depth Anything V2 Metric（室外 VKITTI）框内中值，与身高先验融合。权重自备。

这三层都进 UI，没有 DEMO 假框。

## 软件五层

```text
Camera frame
  → resize / crop
  → YOLOv8n 主体
  → 空间：distance / right / up
  → 参考图 vs 实拍：match + composition + Δmeters
  → 稳定 N 帧 → GO
```

| 层 | 代码 | 作用 |
| --- | --- | --- |
| 1 Camera | 上传 + getUserMedia / 日后 ESP32-CAM | 出帧 |
| 2 Scene | `lib/yolo.ts` | 人 / 车 / … |
| 2b Space | `lib/spatial.ts` | 相对位置、大致距离 |
| 3 Match | `lib/flyvision-match.ts` | 像不像参考 |
| 4 Composition | 同一文件 `judgeComposition` | 框中心是否对齐 |
| 5 Capture | 稳定帧决策 | 只提示 GO，不驱动飞控 |

## 空间公式（粗估）

先看框像不像全身。笔记本摄像头几乎总是胸上 / 近景，不能按站立 1.7 m 反推。

```text
H, W     = 可见部位的典型身高 / 肩宽（或头宽）
distance ≈ 融合( H / (2 · h · tan(vfov/2)) ,  W / (2 · w · tan(hfov/2)) )
right    ≈ distance · (cx − 0.5) · 2 · tan(hfov/2)
up       ≈ distance · (0.5 − cy) · 2 · tan(vfov/2)
```

`right` / `up` 用的是针孔的 `tan(θ)` 线性映射，不再套一层 `tan`。实拍距离再做 5 帧中值。误差仍来自真实体型、未标定视场、姿态。这是 **大致距离**，不是 RTK。

## 刻意还没接

- 单目深度网络（MiDaS / Depth Anything）— 下一刀，仍在 PC 上验证
- 飞控 / 云台 / RTK
- ESP-DL 上的量化 YOLO（P4）
- 动力系统

## 硬件供电（CAM）

```text
LiPo → DC-DC → 5V → ESP32-CAM 5V
```

不要把电池直接到 CAM。

## 打开

https://camerobot.vercel.app/flyvision
