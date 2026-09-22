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
2. **Shot match**（`lib/flyvision-match.ts`）  
   主体框裁切后 HSV 直方图 + 构图向量，判断像不像参考图。
3. **空间估计**（`lib/spatial.ts`）  
   针孔相机：用类别典型高度 + 框高，估 **大致距离（米）**；用框中心相对光轴估 **左右 / 高低（米）**。  
   再把实拍和参考相减：近了多少、偏左/偏右多少。

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

已知类别典型高度 `H`（人 1.7 m），框高占画面比例 `h`，垂直视场 `vfov`：

```text
distance ≈ H / (2 · h · tan(vfov / 2))
right    ≈ distance · tan(水平偏角)
up       ≈ distance · tan(垂直偏角)
```

误差来自：真实身高/车高、镜头视场、姿态。这是 **大致距离**，不是 RTK。

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
