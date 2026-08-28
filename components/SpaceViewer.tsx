"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { CameraPath, Shot, SpaceModel, SpaceObject, Vec3 } from "@/lib/types";
import type { SceneSplat } from "@/lib/scene-visual";
import { pathPoints, samplePath } from "@/lib/path-engine";
import { filmDuration, shotDuration } from "@/lib/film-timeline";
import { SplatCloud } from "./SplatCloud";

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

function MovableMesh({
  obj,
  selected,
  onSelect,
  onMove,
  onPick,
  onDragState,
}: {
  obj: SpaceObject;
  selected: boolean;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: Vec3, done?: boolean) => void;
  onPick: () => void;
  onDragState: (dragging: boolean) => void;
}) {
  const { camera, gl, raycaster } = useThree();
  const dragging = useRef(false);
  const latest = useRef<Vec3>(obj.position);
  latest.current = obj.position;
  const height = obj.position[1];

  useEffect(() => {
    const canvas = gl.domElement;
    const onMovePtr = (event: PointerEvent) => {
      if (!dragging.current) {
        return;
      }
      const rect = canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      raycaster.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -height);
      if (raycaster.ray.intersectPlane(plane, hit)) {
        const next: Vec3 = [hit.x, height, hit.z];
        latest.current = next;
        onMove(obj.id, next);
      }
    };
    const onUp = () => {
      if (!dragging.current) {
        return;
      }
      dragging.current = false;
      onDragState(false);
      onMove(obj.id, latest.current, true);
    };
    window.addEventListener("pointermove", onMovePtr);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMovePtr);
      window.removeEventListener("pointerup", onUp);
    };
  }, [camera, gl, raycaster, height, obj.id, onMove, onDragState]);

  return (
    <mesh
      position={obj.position}
      castShadow
      onPointerDown={(event) => {
        event.stopPropagation();
        onPick();
        if (event.nativeEvent.button !== 0) {
          return;
        }
        if (!selected) {
          return;
        }
        dragging.current = true;
        onDragState(true);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onPick();
        onSelect(obj.id);
      }}
    >
      <boxGeometry args={obj.size || [1, 1, 1]} />
      <meshStandardMaterial
        color={obj.color || TYPE_COLOR[obj.type] || "#666"}
        transparent
        opacity={selected ? 0.55 : 0.28}
        emissive={selected ? "#ffffff" : "#000000"}
        emissiveIntensity={selected ? 0.18 : 0}
        wireframe={false}
      />
    </mesh>
  );
}

function PointCloud({ geometry }: { geometry: THREE.BufferGeometry }) {
  return (
    <points geometry={geometry}>
      <pointsMaterial size={0.045} vertexColors sizeAttenuation />
    </points>
  );
}

function HeritageHall({
  space,
  selectedId,
  onSelect,
  onMove,
  onPick,
  cloud,
  splat,
  onDragState,
}: {
  space: SpaceModel;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onMove: (id: string, position: Vec3, done?: boolean) => void;
  onPick: () => void;
  cloud: THREE.BufferGeometry | null;
  splat: SceneSplat | null;
  onDragState: (dragging: boolean) => void;
}) {
  const uploaded = space.kind === "upload";
  const span = Math.max(
    space.bounds.max[0] - space.bounds.min[0],
    space.bounds.max[2] - space.bounds.min[2],
    16,
  );
  return (
    <group>
      {uploaded ? null : (
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 6]} receiveShadow>
            <planeGeometry args={[28, 36]} />
            <meshStandardMaterial color="#14161c" />
          </mesh>
          <mesh position={[-12.1, 3, 6]}>
            <boxGeometry args={[0.28, 6, 32]} />
            <meshStandardMaterial color="#2a241c" />
          </mesh>
          <mesh position={[12.1, 3, 6]}>
            <boxGeometry args={[0.28, 6, 32]} />
            <meshStandardMaterial color="#2a241c" />
          </mesh>
        </>
      )}
      {splat ? <SplatCloud splat={splat} /> : cloud ? <PointCloud geometry={cloud} /> : null}
      {uploaded ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[span + 8, span + 8]} />
          <meshStandardMaterial color="#101218" />
        </mesh>
      ) : null}
      {space.objects
        .filter((obj) => obj.type !== "ground")
        .map((obj) => (
          <MovableMesh
            key={obj.id}
            obj={obj}
            selected={obj.id === selectedId}
            onSelect={onSelect}
            onMove={onMove}
            onPick={onPick}
            onDragState={onDragState}
          />
        ))}
    </group>
  );
}

function PathLine({ path, color }: { path: CameraPath; color: string }) {
  const points = useMemo(() => pathPoints(path), [path]);
  if (points.length < 2) {
    return null;
  }
  return <Line points={points} color={color} lineWidth={2} />;
}

function CameraGizmo({
  position,
  target,
  active,
}: {
  position: Vec3;
  target: Vec3;
  active: boolean;
}) {
  return (
    <group position={position}>
      <mesh>
        <boxGeometry args={[0.35, 0.22, 0.5]} />
        <meshStandardMaterial color={active ? "#f0d2a8" : "#888"} />
      </mesh>
      <mesh position={[0, 0, 0.38]} rotation={[Math.PI / 2, 0, 0]}>
        <coneGeometry args={[0.12, 0.28, 8]} />
        <meshStandardMaterial color={active ? "#d4a574" : "#555"} />
      </mesh>
      <Line
        points={[
          [0, 0, 0],
          [target[0] - position[0], target[1] - position[1], target[2] - position[2]],
        ]}
        color={active ? "#f0d2a8" : "#555"}
        dashed
        dashSize={0.2}
        gapSize={0.12}
      />
    </group>
  );
}

function PovRig({ position, target, fov }: { position: Vec3; target: Vec3; fov: number }) {
  const camera = useThree((s) => s.camera);
  useFrame(() => {
    camera.position.set(position[0], position[1], position[2]);
    if ("fov" in camera) {
      (camera as typeof camera & { fov: number }).fov = fov;
      camera.updateProjectionMatrix();
    }
    camera.lookAt(target[0], target[1], target[2]);
  });
  return null;
}

export function SpaceViewer({
  space,
  shots,
  currentShotId,
  previewing,
  previewT,
  dual,
  selectedId,
  onSelectObject,
  onMoveObject,
  cloud,
  splat,
  timelineOpen,
  filmPlaying,
  filmT,
  onToggleTimeline,
  onPlayFilm,
  onPickShot,
}: {
  space: SpaceModel;
  shots: Shot[];
  currentShotId: string | null;
  previewing: boolean;
  previewT: number;
  dual: boolean;
  selectedId: string | null;
  onSelectObject: (id: string | null) => void;
  onMoveObject: (id: string, position: Vec3, done?: boolean) => void;
  cloud: THREE.BufferGeometry | null;
  splat: SceneSplat | null;
  timelineOpen: boolean;
  filmPlaying: boolean;
  filmT: number;
  onToggleTimeline: () => void;
  onPlayFilm: () => void;
  onPickShot: (id: string) => void;
}) {
  const current = shots.find((s) => s.shot_id === currentShotId) || shots[0];
  const camPos = current
    ? previewing
      ? samplePath(current.path, previewT)
      : current.path.start
    : ([0, 2, 8] as Vec3);
  const rootRef = useRef<HTMLDivElement>(null);
  const pointer = useRef({ x: 0, y: 0, dragging: false });
  const skipFull = useRef(false);
  const [full, setFull] = useState(false);
  const [orbitLock, setOrbitLock] = useState(false);
  const picked = space.objects.find((obj) => obj.id === selectedId);
  const lookAt = space.kind === "upload" ? [0, 1.2, 0] : [0, 1.2, 6];

  useEffect(() => {
    const sync = () => {
      setFull(document.fullscreenElement === rootRef.current);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen();
      }
      setFull(false);
    };
    document.addEventListener("fullscreenchange", sync);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  function enterFullscreen() {
    const node = rootRef.current;
    if (!node || document.fullscreenElement) {
      return;
    }
    const req =
      node.requestFullscreen?.bind(node) ||
      (
        node as HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void>;
        }
      ).webkitRequestFullscreen?.bind(node);
    if (req) {
      void Promise.resolve(req()).catch(() => setFull(true));
    } else {
      setFull(true);
    }
  }

  return (
    <div
      ref={rootRef}
      className={full ? "viewer is-full" : "viewer"}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => {
        if (event.button !== 0) {
          return;
        }
        pointer.current = { x: event.clientX, y: event.clientY, dragging: false };
      }}
      onPointerMove={(event) => {
        if (
          Math.hypot(
            event.clientX - pointer.current.x,
            event.clientY - pointer.current.y,
          ) > 8
        ) {
          pointer.current.dragging = true;
        }
      }}
      onPointerUp={(event) => {
        if (event.button !== 0 || pointer.current.dragging || full || skipFull.current) {
          skipFull.current = false;
          return;
        }
        enterFullscreen();
      }}
    >
      <span className="viewer-label">
        {full
          ? "ESC 退出全屏"
          : filmPlaying
            ? "FULL FILM"
            : picked
            ? `${picked.label ?? picked.id} · ${picked.colorName ?? picked.type}`
            : "3D SPACE · CAMERA PATH"}
      </span>
      {dual ? <span className="viewer-label pov-label">SHOT POV</span> : null}
      <div className={dual ? "viewer-split" : undefined} style={{ height: "100%" }}>
        <Canvas shadows camera={{ position: [14, 9, -12], fov: 42 }} gl={{ antialias: !splat }}>
          <color attach="background" args={["#07080a"]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[8, 14, 4]} intensity={1.15} castShadow />
          <HeritageHall
            space={space}
            selectedId={selectedId}
            onSelect={onSelectObject}
            onMove={(id, position, done) => onMoveObject(id, position, done)}
            onPick={() => {
              skipFull.current = true;
            }}
            onDragState={setOrbitLock}
            cloud={cloud}
            splat={splat}
          />
          {shots.map((shot) => (
            <PathLine
              key={shot.shot_id}
              path={shot.path}
              color={shot.shot_id === current?.shot_id ? "#f0d2a8" : "#4a463c"}
            />
          ))}
          {shots.map((shot) => {
            const pos =
              shot.shot_id === current?.shot_id && previewing ? camPos : shot.path.start;
            return (
              <CameraGizmo
                key={`cam-${shot.shot_id}`}
                position={pos}
                target={shot.path.target}
                active={shot.shot_id === current?.shot_id}
              />
            );
          })}
          {current ? (
            <mesh position={current.path.target}>
              <sphereGeometry args={[0.18, 12, 12]} />
              <meshStandardMaterial color="#c45c4a" />
            </mesh>
          ) : null}
          <OrbitControls
            makeDefault
            enableDamping
            enabled={!orbitLock}
            enablePan={false}
            target={lookAt as Vec3}
          />
          <gridHelper args={[30, 30, "#2a2d36", "#1a1d24"]} />
        </Canvas>
        {dual && current ? (
          <Canvas
            gl={{ antialias: !splat }}
            camera={{
              position: camPos,
              fov: Math.max(18, 70 - current.camera.lens * 0.4),
            }}
          >
            <color attach="background" args={["#10131a"]} />
            <ambientLight intensity={0.65} />
            <directionalLight position={[6, 10, 2]} intensity={1.15} />
            <HeritageHall
              space={space}
              selectedId={selectedId}
              onSelect={onSelectObject}
              onMove={(id, position, done) => onMoveObject(id, position, done)}
              onPick={() => {
                skipFull.current = true;
              }}
              onDragState={setOrbitLock}
              cloud={cloud}
              splat={splat}
            />
            <PovRig
              position={camPos}
              target={current.path.target}
              fov={Math.max(18, 70 - current.camera.lens * 0.4)}
            />
          </Canvas>
        ) : null}
      </div>
      <button
        type="button"
        className={timelineOpen ? "timeline-arrow open" : "timeline-arrow"}
        aria-label={timelineOpen ? "收起时间线" : "展开时间线"}
        onPointerDown={(event) => {
          event.stopPropagation();
          skipFull.current = true;
        }}
        onClick={(event) => {
          event.stopPropagation();
          onToggleTimeline();
        }}
      >
        {timelineOpen ? "▾" : "▴"}
      </button>
      {timelineOpen ? (
        <div
          className="film-timeline"
          onPointerDown={(event) => {
            event.stopPropagation();
            skipFull.current = true;
          }}
        >
          <button type="button" className="btn primary" onClick={onPlayFilm}>
            {filmPlaying ? "Stop" : "Play 全片"}
          </button>
          <div className="film-track" aria-label="全片时间轴">
            {shots.length === 0 ? (
              <span className="film-empty">先 Generate Shots</span>
            ) : (
              shots.map((shot) => (
                <button
                  key={shot.shot_id}
                  type="button"
                  className={shot.shot_id === currentShotId ? "on" : ""}
                  style={{ flexGrow: shotDuration(shot), flexBasis: 0 }}
                  onClick={() => onPickShot(shot.shot_id)}
                >
                  {shot.title}
                </button>
              ))
            )}
            {shots.length ? (
              <i className="film-head" style={{ left: `${filmT * 100}%` }} />
            ) : null}
          </div>
          <small>
            {shots.length
              ? `${filmDuration(shots).toFixed(1)}s · 播放时主视口走全片`
              : ""}
          </small>
        </div>
      ) : null}
    </div>
  );
}
