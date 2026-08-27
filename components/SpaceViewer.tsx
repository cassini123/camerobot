"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Line, OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { useMemo } from "react";
import type { CameraPath, Shot, SpaceModel, Vec3 } from "@/lib/types";
import { pathPoints, samplePath } from "@/lib/path-engine";

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

function HeritageHall({ space }: { space: SpaceModel }) {
  return (
    <group>
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
      {space.objects
        .filter((obj) => obj.type !== "ground")
        .map((obj) => (
          <mesh key={obj.id} position={obj.position} castShadow>
            <boxGeometry args={obj.size || [1, 1, 1]} />
            <meshStandardMaterial color={TYPE_COLOR[obj.type] || "#666"} />
          </mesh>
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
}: {
  space: SpaceModel;
  shots: Shot[];
  currentShotId: string | null;
  previewing: boolean;
  previewT: number;
  dual: boolean;
}) {
  const current = shots.find((s) => s.shot_id === currentShotId) || shots[0];
  const camPos = current
    ? previewing
      ? samplePath(current.path, previewT)
      : current.path.start
    : ([0, 2, 8] as Vec3);

  return (
    <div className="viewer">
      <span className="viewer-label">3D SPACE · CAMERA PATH</span>
      {dual ? <span className="viewer-label pov-label">SHOT POV</span> : null}
      <div className={dual ? "viewer-split" : undefined} style={{ height: "100%" }}>
        <Canvas shadows camera={{ position: [14, 9, -12], fov: 42 }}>
          <color attach="background" args={["#07080a"]} />
          <ambientLight intensity={0.55} />
          <directionalLight position={[8, 14, 4]} intensity={1.15} castShadow />
          <HeritageHall space={space} />
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
          <OrbitControls makeDefault enableDamping target={[0, 1.2, 6]} />
          <gridHelper args={[30, 30, "#2a2d36", "#1a1d24"]} />
        </Canvas>
        {dual && current ? (
          <Canvas>
            <color attach="background" args={["#10131a"]} />
            <ambientLight intensity={0.5} />
            <directionalLight position={[6, 10, 2]} intensity={1} />
            <HeritageHall space={space} />
            <PerspectiveCamera makeDefault fov={Math.max(18, 70 - current.camera.lens * 0.4)} />
            <PovRig
              position={camPos}
              target={current.path.target}
              fov={Math.max(18, 70 - current.camera.lens * 0.4)}
            />
          </Canvas>
        ) : null}
      </div>
    </div>
  );
}
