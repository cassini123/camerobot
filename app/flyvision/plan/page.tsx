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
          先看，再估距离，最后才动飞机
        </h1>
        <p>
          木机动力不动。ESP32-CAM 只出图。浏览器里接上 YOLOv8n、构图匹配、针孔空间估计。P4
          端侧 AI 等这三层在电脑上跑通再迁。
        </p>
        <h2 style={{ fontSize: 20, margin: "28px 0 8px" }}>已接</h2>
        <ul>
          <li>YOLOv8n：上传图 + 摄像头主体识别</li>
          <li>Shot match：直方图 + 构图</li>
          <li>空间：大致距离、偏左/偏右/高低（米）</li>
        </ul>
        <h2 style={{ fontSize: 20, margin: "28px 0 8px" }}>距离怎么来的</h2>
        <p>
          人按 1.7 m 高，用框高和镜头视场反推距离；框中心相对画面中心得到左右、高低。这是粗估，不是
          RTK。完整公式和阶段表在仓库{" "}
          <code>flyvision/PLAN.md</code>。
        </p>
        <p style={{ color: "#86868b", fontSize: 13 }}>
          未接：深度网络、云台、飞控微调、P4 量化模型。
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
