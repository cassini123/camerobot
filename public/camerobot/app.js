const form = document.querySelector("#shot-form");
const output = document.querySelector("#shot-output");
const demoEyeTitle = document.querySelector("#demo-eye-title");
const demoEyeMessage = document.querySelector("#demo-eye-message");
const heroEyeStatus = document.querySelector("#eye-status");
const heroEyePreview = document.querySelector("#eye-preview");

const intentProfiles = {
  replicate_composition: {
    label: "复刻参考构图",
    shotSize: "medium",
    motion: "locked_off",
    arm: "standby",
    message: "正在复刻主体位置",
  },
  improve_portrait: {
    label: "优化人像",
    shotSize: "medium",
    motion: "subtle_jib_reveal",
    arm: "jib",
    message: "位置很好，请看镜头",
  },
  vlog_follow: {
    label: "Vlog 跟拍",
    shotSize: "medium_wide",
    motion: "follow",
    arm: "standby",
    message: "跟拍中，请保持自然移动",
  },
  product_shoot: {
    label: "产品拍摄",
    shotSize: "medium",
    motion: "locked_off_or_slow_push",
    arm: "standby",
    message: "产品居中，准备补光",
  },
  drone_reveal: {
    label: "无人机开场",
    shotSize: "wide",
    motion: "drone_reveal_to_ground_follow",
    arm: "jib",
    message: "无人机建立镜头中",
  },
};

const orientationProfiles = {
  portrait: { aspectRatio: 0.562, heightM: 1.5, distanceM: 1.6 },
  landscape: { aspectRatio: 1.778, heightM: 1.55, distanceM: 2.2 },
  square: { aspectRatio: 1, heightM: 1.5, distanceM: 1.8 },
};

function buildShotPlan(formData) {
  const intent = formData.get("intent");
  const orientation = formData.get("orientation");
  const useDrone = document.querySelector("#use-drone").checked;
  const intentProfile = intentProfiles[intent];
  const orientationProfile = orientationProfiles[orientation];
  const previewAssetId = "asset_demo_preview";

  return {
    shot_request: {
      reference_asset_id: "asset_demo",
      intent,
      output: intent === "vlog_follow" ? "short_video" : "portrait_photo",
      constraints: {
        indoor: true,
        max_distance_m: 4,
        use_drone: useDrone,
        allow_arm_motion: true,
        allow_lighting_adjustment: true,
      },
    },
    analysis: {
      subject: {
        type: "person_or_primary_object",
        center_norm: [0.5, 0.52],
      },
      composition: {
        orientation,
        aspect_ratio: orientationProfile.aspectRatio,
        shot_size: intentProfile.shotSize,
        headroom_ratio: intentProfile.shotSize === "wide" ? 0.14 : 0.08,
      },
      camera: {
        angle: intent === "drone_reveal" ? "high_angle" : "eye_level",
        height_m: orientationProfile.heightM,
        distance_m: orientationProfile.distanceM,
        focal_length_hint: intent === "vlog_follow" ? "wide" : "normal",
      },
      lighting: {
        key_direction: "front_left",
        fill_direction: "front_right",
        temperature_k: 5200,
        softness: "soft",
      },
      motion: {
        type: intentProfile.motion,
      },
    },
    shot_plan: {
      base: {
        x_m: orientationProfile.distanceM,
        y_m: intent === "product_shoot" ? -0.25 : 0,
        yaw_deg: 0,
        mode: intent === "vlog_follow" ? "follow" : "position",
      },
      lift: {
        height_m: orientationProfile.heightM,
        lock_after_move: true,
      },
      head: {
        pan_deg: 0,
        tilt_deg: intent === "drone_reveal" ? -15 : 0,
        roll_deg: 0,
        tracking: "subject_lock",
      },
      camera: {
        mode: intent === "vlog_follow" ? "video" : "photo",
        focus_mode: "subject_tracking",
        exposure_mode: "auto_with_face_priority",
      },
      arm: {
        mode: intentProfile.arm,
        trajectory: intentProfile.motion,
      },
      lights: [
        {
          role: "key",
          brightness: 0.65,
          temperature_k: 5200,
          direction: "front_left",
        },
        {
          role: "fill",
          brightness: 0.28,
          temperature_k: 5200,
          direction: "front_right",
        },
      ],
      drone:
        intent === "drone_reveal" && useDrone
          ? {
              mode: "external_api_placeholder",
              mission: "establishing_reveal_then_return",
              return_to_dock: true,
            }
          : null,
      display_events: [
        {
          target: "eyes",
          state: "framing",
          message: `正在构图：${intentProfile.label}`,
        },
        {
          target: "eyes",
          state: "guidance",
          message: intentProfile.message,
        },
        {
          target: "eyes",
          state: "countdown",
          message: "3 秒后拍摄",
        },
        {
          target: "eyes",
          state: "capture_done",
          message: "拍摄完毕",
          preview_asset_id: previewAssetId,
        },
        {
          target: "eyes",
          state: "preview",
          message: "预览窗口",
          preview_asset_id: previewAssetId,
        },
      ],
      safety: {
        max_speed_mps: 0.35,
        human_clearance_m: 0.8,
        emergency_stop_required: true,
        privacy_indicator_required: true,
      },
    },
  };
}

function renderPlan(plan) {
  const guidance = plan.shot_plan.display_events.find(
    (event) => event.state === "guidance",
  );
  const preview = plan.shot_plan.display_events.find(
    (event) => event.state === "preview",
  );

  demoEyeTitle.textContent = "拍摄完毕";
  demoEyeMessage.textContent = guidance?.message || "预览窗口已生成";
  heroEyeStatus.textContent = "拍摄完毕";
  heroEyePreview.textContent = preview?.message || "预览窗口";
  output.textContent = JSON.stringify(plan, null, 2);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  renderPlan(buildShotPlan(new FormData(form)));
});

renderPlan(buildShotPlan(new FormData(form)));
