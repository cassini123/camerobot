import Link from "next/link";

export default function HomePage() {
  return (
    <main className="landing">
      <p style={{ color: "var(--gold)", letterSpacing: "0.2em", fontSize: 12 }}>
        YUNJING · VIRTUPATH
      </p>
      <h1>云径</h1>
      <p style={{ color: "var(--muted)", maxWidth: 640, lineHeight: 1.7 }}>
        把已经写好的故事放进真实空间，用参考画面定义视觉语言，再由 AI
        生成可以在空间中执行的摄影路径。导演只需要一句话，就能继续修改它。
      </p>
      <div className="cards">
        <Link className="card" href="/yunjing">
          <b>打开工作台</b>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            Story → Space → Reference → Shots → Path → Director Prompt → Export
          </p>
        </Link>
        <a className="card" href="/camerobot/index.html">
          <b>Camerobot</b>
          <p style={{ color: "var(--muted)", marginTop: 8 }}>
            机器人执行端产品页与 MVP0 Shot Plan 演示（未来硬件桥）。
          </p>
        </a>
      </div>
    </main>
  );
}
