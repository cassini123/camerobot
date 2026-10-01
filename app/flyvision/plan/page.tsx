import Link from "next/link";

export default function FlyvisionPlanPage() {
  return (
    <div className="apple-app" style={{ display: "block", padding: "0 0 48px" }}>
      <header className="apple-top">
        <strong>
          <Link href="/flyvision">Flyvision</Link>
        </strong>
        <nav>
          <Link href="/flyvision">工作台</Link>
        </nav>
      </header>
      <article style={{ maxWidth: 680, margin: "36px auto", padding: "0 22px", lineHeight: 1.65 }}>
        <p style={{ color: "#86868b", fontSize: 13, margin: 0 }}>计划</p>
        <h1 style={{ fontSize: 34, letterSpacing: "-0.03em", fontWeight: 600, margin: "8px 0 20px" }}>
          先看，再对占位，最后才动飞机
        </h1>
        <p>
          木机动力不动。ESP32-CAM 只出图。浏览器里接上 YOLOv8n、CLIP 匹配、框占位伺服。针孔米数还在，只标「约 /
          不可靠」，不当过关。P4 端侧最多量化 YOLO，没有世界模型。
        </p>

        <h2 style={{ fontSize: 20, margin: "28px 0 8px" }}>无人机 ESP32-CAM 方案</h2>
        <p>
          选框反推米数不靠谱：半身当全身能差好几米；参考图、笔记本、OV2640 三套视场；裁切和 object-fit
          对不齐；单帧没有时间锁。过关改成视觉伺服，口令仍是{" "}
          <strong>近了 / 远了 / 偏左 / 偏右 / 偏上 / 偏下</strong>。
        </p>
        <ul>
          <li>
            闸：CLIP 像不像 + 框高比 <code>h_live / h_ref</code>（占画面多少）+ 框中心偏移。米不当
            CAPTURE_GO。
          </li>
          <li>
            烧录 <code>flyvision/firmware/esp32cam</code>，板子 AP：SSID <code>flyvision-cam</code>
            ，流 <code>http://192.168.4.1/stream</code>。
          </li>
          <li>
            笔记本加入 AP，工作台实拍栏贴这个地址。https 页面会拦 http 流，用本地{" "}
            <code>http://localhost:3000/flyvision</code>。加入 AP 后没外网，开不了 Vercel。
          </li>
          <li>
            VGA MJPEG 大约 0.5–1.3 Mbps 够用。板载天线视距大约 50–70 m，100×100
            对角线约 141 m 罩不满；笔记本放起降点附近。
          </li>
          <li>
            供电：LiPo → DC-DC → 5V CAM。镜头朝向和计划镜头一致。CAM 视场单独标定，不要套电脑
            70°。
          </li>
          <li>
            首飞只悬停 / 慢速通过，确认推流和检出。100×100×10 是以后飞控围栏，不是视觉地图。
          </li>
          <li>
            以后 P4 量化 YOLO 只为了 Wi-Fi 不够远；Depth Anything / YOLO-pose / ByteTrack 仍在电脑上，不挡首飞。
          </li>
        </ul>

        <h2 style={{ fontSize: 20, margin: "28px 0 8px" }}>已接</h2>
        <ul>
          <li>YOLOv8n：上传图 + 电脑摄像头 + ESP32-CAM MJPEG</li>
          <li>Shot match：MobileCLIP2-S0 为主，HSV 只看色调</li>
          <li>占位闸：框比例 + 偏左偏右；针孔米数只是旁注</li>
          <li>电脑视场 / CAM（OV2640）视场两套滑条</li>
          <li>景别：参考图离线打 FilmOps 式标签</li>
          <li>PC：`flyvision depth` 融合 DA-V2 Metric 框内中值（以后加）</li>
        </ul>
        <h2 style={{ fontSize: 20, margin: "28px 0 8px" }}>过关怎么判</h2>
        <p>
          实拍框比参考框高一截 → 近了；矮一截 → 远了；中心偏了 → 偏左 / 偏右 / 偏上 /
          偏下。针孔公式还在仓库 <code>flyvision/PLAN.md</code>，只用来写「约 x
          m · 不可靠」。
        </p>
        <p style={{ color: "#86868b", fontSize: 13 }}>
          未接：深度网络当闸、云台、飞控微调、P4 量化、100×100×10 围栏。
        </p>
        <p>
          <Link href="/flyvision" style={{ color: "#0071e3" }}>
            回到工作台
          </Link>
        </p>
      </article>
    </div>
  );
}
