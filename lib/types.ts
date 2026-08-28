export type Vec3 = [number, number, number];

export type SemanticType =
  | "building"
  | "door"
  | "window"
  | "tree"
  | "road"
  | "ground"
  | "person"
  | "object"
  | "camera_zone"
  | "walkable";

export interface SpatialRequirements {
  start: string;
  destination: string;
  action: string;
  interaction: string;
}

export interface Scene {
  scene_id: string;
  title: string;
  description: string;
  characters: string[];
  objects: string[];
  action: string;
  emotion: string;
  pace: string;
  spatial_requirements: SpatialRequirements;
}

export interface Story {
  story_id: string;
  title: string;
  scenes: Scene[];
}

export interface SpaceObject {
  id: string;
  type: SemanticType | string;
  position: Vec3;
  size?: Vec3;
  rotation?: Vec3;
  color?: string;
  colorName?: string;
  label?: string;
  aliases?: string[];
}

export interface SpaceZone {
  id: string;
  type: string;
  bounds: Vec3[];
}

export interface SpaceModel {
  space_id: string;
  model: string;
  kind?: "example" | "upload";
  format?: string;
  fileName?: string;
  description?: string;
  gps?: { lat: number; lng: number; alt: number };
  bounds: { min: Vec3; max: Vec3 };
  objects: SpaceObject[];
  zones: SpaceZone[];
}

export interface VisualDNA {
  reference_id: string;
  subject: {
    type: string;
    count: number;
    position: string;
  };
  objects: string[];
  composition: {
    shot_type: string;
    subject_position: string;
    symmetry: boolean;
    depth: string;
    building_ratio: number;
  };
  camera: {
    lens: number;
    height: string;
    angle: string;
    movement: string;
  };
  color: {
    temperature: string;
    contrast: string;
    saturation?: string;
    palette?: string[];
  };
  mood: string[];
}

export type MovementType =
  | "STATIC"
  | "DOLLY_IN"
  | "DOLLY_OUT"
  | "TRACKING"
  | "PAN"
  | "ORBIT"
  | "FOLLOW";

export interface CameraPath {
  start: Vec3;
  waypoints: Vec3[];
  end: Vec3;
  target: Vec3;
}

export interface Shot {
  shot_id: string;
  scene_id: string;
  reference_id: string;
  title: string;
  kind: "establishing" | "character" | "detail" | "reveal" | "follow";
  target: {
    type: string;
    object_id: string;
    position: Vec3;
  };
  camera: {
    position: Vec3;
    rotation: Vec3;
    lens: number;
    height: number;
    angle?: string;
  };
  composition: {
    subject_ratio: number;
    horizontal: number;
    vertical: number;
  };
  movement: {
    type: string;
    start: Vec3;
    end: Vec3;
    duration: number;
    speed?: number;
  };
  path: CameraPath;
  match: {
    composition: number;
    subject: number;
    color: number;
    camera: number;
    overall: number;
  };
  color?: {
    temperature: string;
    contrast: string;
  };
}

export interface DirectorChange {
  key: string;
  label: string;
  from: string | number;
  to: string | number;
  slider?: { min: number; max: number; step: number; unit?: string };
}

export interface DirectorResponse {
  patch: Record<string, unknown>;
  changes: DirectorChange[];
}

export interface ProjectState {
  project: { id: string; name: string };
  story: Story;
  currentSceneId: string;
  space: SpaceModel;
  references: Array<{
    id: string;
    imageDataUrl?: string;
    visual_dna?: VisualDNA;
  }>;
  shots: Shot[];
  currentShotId: string | null;
  directorInstruction: string;
}

export interface RobotHints {
  base: {
    x_m: number;
    y_m: number;
    yaw_deg: number;
    mode: string;
  };
  lift: { height_m: number; lock_after_move: boolean };
  head: {
    pan_deg: number;
    tilt_deg: number;
    roll_deg: number;
    tracking: string;
  };
  camera: {
    mode: string;
    focal_length_hint: string;
    exposure_mode: string;
    focus_mode: string;
  };
  safety: {
    max_speed_mps: number;
    human_clearance_m: number;
    emergency_stop_required: boolean;
    privacy_indicator_required: boolean;
  };
}
