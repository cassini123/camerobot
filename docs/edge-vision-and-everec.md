# 边缘视觉、Everec 集成与成片链路

## 1. 边界结论

| 系统 | 负责 | 不负责 |
|------|------|--------|
| **Camerobot 机载 Runtime** | 分镜执行、实时检测/跟踪、构图闭环、HAL 控制、拍摄 marker | 创作者 UI、完整 NLE、大模型分镜理解常开 |
| **Everec（Knowgo + Simcut）** | 分镜创作、风格/镜头表、一键剪辑导出 | 云台/底盘实时环、机载 YOLO |

**机载 CV ≠ everec 内置模型。** everec 当前本地分析多为启发式，可选 OpenAI 云端；仓库内无 YOLO/ONNX。集成以 **JSON schema + marker** 为准。

```text
Knowgo StoryboardShot[]  -->  Camerobot Shot Planner  -->  HAL
Edge Vision (NPU)        -->  构图误差 / exposure lock
CaptureTake + markers    -->  Simcut timeline + FFmpeg 一键成片
```

## 2. 边缘模型档位

| 任务 | 可行性 | 模型/方法 | 目标 FPS | 功耗量级 |
|------|--------|-----------|----------|----------|
| 人/脸检测 | 高 | YOLO11n / RTMDet-tiny INT8，640 输入 | 15–30 | 3–10 W |
| 多目标跟踪 | 高 | ByteTrack + 可选光流 | 随检测 | 可忽略 |
| 光照/色彩锁定 | 高 | 直方图 + AWB 统计；可选极小 MLP 估主光方向/色温桶 | 10–30 | &lt; 1 W |
| 构图几何 | 高 | bbox 中心、占幅比、头顶空间 → 误差向量 | 随检测 | — |
| 分割 / 姿态 | 中 | 异步 5–10 FPS，勿与检测同帧满载 | 5–10 | +2–8 W |
| 开放词汇 / 复杂理解 | 低（常开） | Wi‑Fi 间歇卸载或 everec 云端 | 离线 | 网络依赖 |
| 一键剪辑 | 高（端侧 App） | Simcut + FFmpeg | 拍摄后 | 不放车载常开 |

**不可行预期：** Plus 上 24h 持续「大模型复现光照+色彩+人物」且同时移动升降——热与电池先于算法失败。

### 2.1 芯片与运行时建议

| SKU | 算力落点 | 运行时 |
|-----|----------|--------|
| Base | 手机 NPU | Core ML / NNAPI / NCNN；MCU 只收姿态指令 |
| Plus | RK3588 / Orin Nano 4–8GB / Hailo 加速 | RKNN / TensorRT / ONNX Runtime |
| Plus 避障 | 与摄影 NPU 分核或独立深度模块 | 轻量导航栈 |

## 3. 软件分层

1. **Creator（Everec）** — 分镜输入、成片导出。
2. **Mission Runtime（Camerobot）** — `StoryboardShot[]` → `ShotPlan`；闭环：小误差动云台，大误差动底盘/升降。
3. **Edge Vision** — 检测、跟踪、曝光/色温锁、主体位置。
4. **Edit Bridge** — 机载只产代理预览 + 元数据；成片在手机/电脑 Simcut。

## 4. JSON 契约

### 4.1 everec → robot：`StoryboardShot`

与 Knowgo 镜头表对齐的最小字段（Camerobot MVP0 已用同名结构透传）：

```json
{
  "index": 0,
  "start_s": 0.0,
  "end_s": 3.5,
  "shot_type": "medium",
  "camera_movement": "push_in",
  "implementation": "主体居中，缓慢推进",
  "subject_hint": "person_primary"
}
```

请求侧示例（扩展现有 shot request）：

```json
{
  "asset_path": "/path/to/reference.png",
  "intent": "replicate_composition",
  "output": "short_video",
  "constraints": {
    "indoor": true,
    "max_distance_m": 4.0,
    "use_drone": false,
    "allow_arm_motion": true,
    "allow_lighting_adjustment": true
  },
  "storyboard_shots": [
    {
      "index": 0,
      "start_s": 0.0,
      "end_s": 3.0,
      "shot_type": "wide",
      "camera_movement": "static",
      "implementation": "建立环境"
    },
    {
      "index": 1,
      "start_s": 3.0,
      "end_s": 8.0,
      "shot_type": "medium",
      "camera_movement": "follow",
      "implementation": "跟拍主体"
    }
  ]
}
```

Planner 行为（当前占位）：

- 将 `storyboard_shots` 原样挂到 `ShotPlan.storyboard_shots`。
- 用首镜 / 主镜的 `camera_movement` 影响 `base.mode` 与 `arm` 轨迹提示（可扩展）。
- 不在机载执行 everec 的启发式 analyze。

### 4.2 robot → everec：`CaptureTake`

```json
{
  "uri": "file://media/take_001.mp4",
  "t0": 0.0,
  "t1": 8.2,
  "shot_index": 1,
  "exposure_lock": true,
  "subject_track_quality": 0.87,
  "markers": [
    {"t": 0.4, "type": "subject_enter"},
    {"t": 3.1, "type": "exposure_locked"},
    {"t": 7.8, "type": "move_complete"}
  ]
}
```

Simcut 一键成片：按 `shot_index` 排序拼接，用 `t0/t1` 与 marker 裁切，套 LUT/节奏模板。机载不跑完整 FFmpeg 成片管线。

## 5. 实时闭环与视觉输出

Edge Vision 每帧（或降采样）输出：

```json
{
  "subject_center_norm": [0.48, 0.42],
  "subject_area_ratio": 0.22,
  "headroom_ratio": 0.08,
  "temperature_k_est": 5200,
  "key_direction_est": "front_left",
  "track_id": 1,
  "quality": 0.9
}
```

与目标构图比较后分配动作（与产品 README §5.5 一致）：

- 大幅位置 → `base`
- 高度 → `lift`
- 推拉景别 → `extend` / 变焦提示
- 小幅 → `head` 云台
- 光比/色温 → `lights` + 相机曝光锁

## 6. 集成阶段

| 阶段 | 内容 |
|------|------|
| 现在 | MVP0：`storyboard_shots` 字段透传；文档契约 |
| 下一步 | 真检测替换启发式 `reference_analysis`；marker 写入 |
| 再后 | Knowgo 导出按钮 → Camerobot API；Simcut 从 `CaptureTake` 生成 EditPlan |

## 7. 明确不做

- 把整个 everec monorepo 编进 MCU/固件。
- 用 everec 本地 stub analyze 充当机载 YOLO。
- 在 Plus 车载 SoC 上默认常开云端大模型推理。
