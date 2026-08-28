import * as THREE from "three";
import type { CameraPath, Shot, SpaceModel, Vec3 } from "./types";
import { samplePath } from "./path-engine";

const TYPE_COLOR: Record<string, string> = {
  building: "#8a6a45",
  door: "#c4a36a",
  window: "#7aa0c4",
  tree: "#3f6b48",
  road: "#3a3d45",
  ground: "#2a2c32",
  person: "#e8d2b0",
  object: "#6b5c7a",
};

function addHall(scene: THREE.Scene, space: SpaceModel) {
  const uploaded = space.kind === "upload";
  if (!uploaded) {
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 36),
      new THREE.MeshStandardMaterial({ color: "#14161c" }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, 6);
    scene.add(floor);

    for (const x of [-12.1, 12.1]) {
      const wall = new THREE.Mesh(
        new THREE.BoxGeometry(0.28, 6, 32),
        new THREE.MeshStandardMaterial({ color: "#2a241c" }),
      );
      wall.position.set(x, 3, 6);
      scene.add(wall);
    }
  }

  for (const obj of space.objects) {
    if (obj.type === "ground") {
      continue;
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(...(obj.size || [1, 1, 1])),
      new THREE.MeshStandardMaterial({
        color: obj.color || TYPE_COLOR[obj.type] || "#666",
        transparent: true,
        opacity: uploaded ? 0.35 : 1,
      }),
    );
    mesh.position.set(...obj.position);
    scene.add(mesh);
  }

  const grid = new THREE.GridHelper(30, 30, "#2a2d36", "#1a1d24");
  scene.add(grid);
}

function makePath(path: CameraPath, color: string) {
  const pts = [path.start, ...path.waypoints, path.end].map(
    (p) => new THREE.Vector3(...p),
  );
  const geom = new THREE.BufferGeometry().setFromPoints(pts);
  return new THREE.Line(geom, new THREE.LineBasicMaterial({ color }));
}

function makeGizmo(position: Vec3, target: Vec3) {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.35, 0.22, 0.5),
    new THREE.MeshStandardMaterial({ color: "#f0d2a8" }),
  );
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.28, 8),
    new THREE.MeshStandardMaterial({ color: "#d4a574" }),
  );
  cone.rotation.x = Math.PI / 2;
  cone.position.z = 0.38;
  group.add(body, cone);
  group.position.set(...position);
  const look = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(...position),
      new THREE.Vector3(...target),
    ]),
    new THREE.LineBasicMaterial({ color: "#f0d2a8" }),
  );
  return [group, look];
}

export type CaptureMode = "motion" | "preview";

export class OffscreenWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  extras: THREE.Object3D[] = [];

  constructor(space: SpaceModel, width: number, height: number) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#07080a");
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 1.15);
    key.position.set(8, 14, 4);
    this.scene.add(key);
    addHall(this.scene, space);
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 200);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setSize(width, height, false);
  }

  canvas() {
    return this.renderer.domElement;
  }

  private clearExtras() {
    for (const obj of this.extras) {
      this.scene.remove(obj);
      obj.traverse((child) => {
        if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
          child.geometry.dispose();
        }
      });
    }
    this.extras = [];
  }

  private remember(obj: THREE.Object3D) {
    this.extras.push(obj);
    this.scene.add(obj);
  }

  renderShot(shot: Shot, t: number, mode: CaptureMode) {
    this.clearExtras();
    const pos = samplePath(shot.path, t);
    const target = shot.path.target;
    this.remember(makePath(shot.path, "#f0d2a8"));
    if (mode === "motion") {
      for (const obj of makeGizmo(pos, target)) {
        this.remember(obj);
      }
      this.camera.fov = 42;
      this.camera.position.set(14, 9, -12);
      this.camera.lookAt(0, 1.2, 6);
    } else {
      this.camera.fov = Math.max(18, 70 - shot.camera.lens * 0.4);
      this.camera.position.set(...pos);
      this.camera.lookAt(...target);
    }
    this.camera.updateProjectionMatrix();
    this.renderer.render(this.scene, this.camera);
  }

  jpeg(quality = 0.82) {
    return this.renderer.domElement.toDataURL("image/jpeg", quality);
  }

  dispose() {
    this.clearExtras();
    this.renderer.dispose();
  }
}

export function dataUrlToBytes(dataUrl: string): Uint8Array {
  const raw = dataUrl.split(",")[1] ?? "";
  const bin = atob(raw);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pickRecorderMime() {
  const types = [
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) ?? "video/webm";
}

function waitFrame() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}

export async function exportCameraVideo(
  space: SpaceModel,
  shots: Shot[],
  mode: CaptureMode,
  filename: string,
  onProgress?: (label: string) => void,
) {
  const width = 1280;
  const height = 720;
  const fps = 24;
  const world = new OffscreenWorld(space, width, height);
  const canvas = world.canvas();
  const stream = canvas.captureStream(fps);
  const mime = pickRecorderMime();
  const recorder = new MediaRecorder(stream, { mimeType: mime });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size) {
      chunks.push(event.data);
    }
  };
  const stopped = new Promise<Blob>((resolve) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mime }));
  });
  recorder.start();

  for (const shot of shots) {
    const duration = Math.max(1, shot.movement.duration);
    const frames = Math.max(1, Math.round(duration * fps));
    onProgress?.(`${mode === "motion" ? "运动" : "预览"} ${shot.title}`);
    for (let i = 0; i < frames; i += 1) {
      world.renderShot(shot, frames === 1 ? 0 : i / (frames - 1), mode);
      await waitFrame();
    }
  }

  recorder.stop();
  stream.getTracks().forEach((track) => track.stop());
  const blob = await stopped;
  world.dispose();
  downloadBlob(blob, filename);
}

export async function captureStillRows(
  space: SpaceModel,
  shots: Shot[],
  samplesOf: (shot: Shot) => { t: number; label: string }[],
) {
  const world = new OffscreenWorld(space, 640, 360);
  const rows: Array<{
    shot: Shot;
    frames: Array<{ label: string; jpeg: string }>;
  }> = [];
  for (const shot of shots) {
    const frames = samplesOf(shot).map((sample) => {
      world.renderShot(shot, sample.t, "preview");
      return { label: sample.label, jpeg: world.jpeg() };
    });
    rows.push({ shot, frames });
  }
  world.dispose();
  return rows;
}

export async function exportStillsExcel(
  rows: Awaited<ReturnType<typeof captureStillRows>>,
  filename: string,
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Stills");
  sheet.columns = [
    { header: "Shot", width: 22 },
    { header: "Movement", width: 16 },
    { header: "Kind", width: 12 },
    { header: "Duration s", width: 12 },
  ];
  rows.forEach((row, index) => {
    const line = index + 2;
    const record = sheet.getRow(line);
    record.height = 86;
    record.getCell(1).value = `${row.shot.shot_id} ${row.shot.title}`;
    record.getCell(2).value = row.shot.movement.type;
    record.getCell(3).value = row.frames.length > 2 ? "curve" : "linear";
    record.getCell(4).value = row.shot.movement.duration;
    row.frames.forEach((frame, frameIndex) => {
      const col = 5 + frameIndex;
      sheet.getColumn(col).width = 28;
      record.getCell(col).value = frame.label;
      const imageId = workbook.addImage({
        buffer: dataUrlToBytes(frame.jpeg) as never,
        extension: "jpeg",
      });
      sheet.addImage(imageId, {
        tl: { col: col - 1, row: line - 1 },
        ext: { width: 180, height: 100 },
      });
    });
  });
  const buffer = await workbook.xlsx.writeBuffer();
  downloadBlob(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename,
  );
}

export async function exportStillsPdf(
  rows: Awaited<ReturnType<typeof captureStillRows>>,
  filename: string,
) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  rows.forEach((row, rowIndex) => {
    if (rowIndex > 0) {
      pdf.addPage();
    }
    pdf.setFontSize(14);
    pdf.text(
      `${row.shot.title} · ${row.shot.movement.type} · ${row.shot.movement.duration}s`,
      12,
      14,
    );
    let y = 22;
    row.frames.forEach((frame, index) => {
      const col = index % 3;
      if (col === 0 && index > 0) {
        y += 60;
      }
      if (y + 52 > 200) {
        pdf.addPage();
        y = 22;
      }
      const x = 12 + col * 90;
      pdf.addImage(frame.jpeg, "JPEG", x, y, 82, 46);
      pdf.setFontSize(9);
      pdf.text(frame.label, x, y + 51);
    });
  });
  pdf.save(filename);
}
