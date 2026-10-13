// Pose library for the stick figure.
// Angles in degrees: 0 = pointing straight down, +90 = forward (the way the
// character faces), 180 = straight up, -90 = backward. Each limb has an upper
// angle `a` and an absolute lower angle `b`. Arms may instead give a hand
// target `to` (relative to the shoulder), solved with 2-bone IK.

export const ARM = [92, 88] as const;
export const LEG = [102, 98] as const;

export type Limb = { a: number; b: number };
export type ArmSpec = Limb | { to: [number, number]; bend: 1 | -1 };
export type Look = [number, number]; // pupil direction, -1..1
export type Prop = 'phone' | 'pillow' | 'phone_ear' | null;
export type PoseSpec = {
  front: ArmSpec;
  back: ArmSpec;
  legF: Limb;
  legB: Limb;
  lean?: number; // torso lean, + = forward
  head?: number; // head tilt, + = chin down
  y?: number; // body offset in px (negative = up)
  look?: Look;
  prop?: Prop;
};
export type Pose = Required<Omit<PoseSpec, 'front' | 'back' | 'prop'>> & { front: Limb; back: Limb; prop: Prop };

const deg = (r: number) => (r * 180) / Math.PI;
const rad = (d: number) => (d * Math.PI) / 180;
export const dir = (a: number): [number, number] => [Math.sin(rad(a)), Math.cos(rad(a))];

function ik(to: [number, number], bend: 1 | -1, [L1, L2] = ARM): Limb {
  const [tx, ty] = to;
  const d = Math.min(Math.max(Math.hypot(tx, ty), Math.abs(L1 - L2) + 1), L1 + L2 - 1);
  const theta = deg(Math.atan2(tx, ty));
  const alpha = deg(Math.acos((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d)));
  const a = theta + bend * alpha;
  const [ex, ey] = dir(a).map((v) => v * L1);
  const b = deg(Math.atan2(tx - ex, ty - ey));
  return { a, b };
}

const resolveArm = (s: ArmSpec): Limb => ('to' in s ? ik(s.to, s.bend) : s);

export function resolve(p: PoseSpec): Pose {
  return {
    front: resolveArm(p.front),
    back: resolveArm(p.back),
    legF: p.legF,
    legB: p.legB,
    lean: p.lean ?? 0,
    head: p.head ?? 0,
    y: p.y ?? 0,
    look: p.look ?? [0.6, 0],
    prop: p.prop ?? null,
  };
}

const STAND = { legF: { a: 10, b: 3 }, legB: { a: -10, b: -3 } };
const S = Math.sin;

// t = seconds since the action started, g = global seconds (keeps idle motion continuous)
export const ACTIONS: Record<string, (t: number, g: number) => PoseSpec> = {
  idle: (_t, g) => ({
    ...STAND,
    front: { a: 12 + S(g * 1.9) * 2, b: 4 },
    back: { a: -12 - S(g * 1.9) * 2, b: -4 },
    y: S(g * 2.1) * 3,
    head: S(g * 1.2) * 3,
  }),
  talk: (t, g) => ({
    ...STAND,
    front: { a: 45 + S(t * 4.6) * 20, b: 100 + S(t * 4.6 + 0.9) * 26 },
    back: { a: -14 - S(g * 2) * 3, b: -6 + S(t * 2.3) * 8 },
    y: S(t * 6) * 3,
    head: S(t * 2.7) * 5,
    lean: 3 + S(t * 2) * 2,
  }),
  point: (t) => ({
    ...STAND,
    front: { a: 86 + S(t * 8) * 4, b: 90 + S(t * 8) * 7 },
    back: { to: [-6, 92], bend: -1 },
    lean: 6,
    head: -3 + S(t * 4) * 3,
    y: S(t * 8) * 2,
  }),
  shrug: (t) => {
    const up = Math.min(1, t * 5);
    return {
      ...STAND,
      front: { a: 28 + 26 * up, b: 70 + 82 * up },
      back: { a: -28 - 26 * up, b: -70 - 82 * up },
      head: 12 * up + S(t * 3) * 3,
      y: -7 * up,
      look: [0.2, -0.5],
    };
  },
  facepalm: (t) => ({
    ...STAND,
    front: { to: [58, -112], bend: -1 },
    back: { a: -10, b: -3 },
    head: 18 + S(t * 2) * 3,
    lean: 8,
    y: 5,
    look: [0.2, 0.8],
  }),
  think: (t) => ({
    ...STAND,
    front: { to: [46, -70], bend: -1 },
    back: { to: [30, 72], bend: 1 },
    head: -10 + S(t * 2) * 3,
    y: S(t * 2) * 2,
    look: [0.4, -0.9],
  }),
  surprised: (t) => {
    const hop = t < 0.42 ? -Math.sin((t / 0.42) * Math.PI) * 50 : 0;
    return {
      legF: { a: 16 + (hop ? 14 : 0), b: 6 - (hop ? 20 : 0) },
      legB: { a: -16, b: -6 + (hop ? 18 : 0) },
      front: { a: 148 + S(t * 12) * 6, b: 170 },
      back: { a: -148 - S(t * 12) * 6, b: -170 },
      lean: -6,
      head: -8,
      y: hop,
      look: [0.7, -0.2],
    };
  },
  laugh: (t) => {
    const b = Math.abs(S(t * 12));
    return {
      ...STAND,
      front: { to: [36, 96], bend: 1 },
      back: { to: [-2, 100], bend: -1 },
      head: -18 + b * 9,
      lean: -6 + b * 5,
      y: -b * 12,
      look: [0.3, -0.4],
    };
  },
  phone: (t, g) => ({
    ...STAND,
    front: { to: [66, 22 + S(g * 1.5) * 2], bend: -1 },
    back: { to: [48, 30], bend: 1 },
    head: 16 + S(t * 1.6) * 2,
    lean: 4,
    y: S(g * 2.1) * 2,
    look: [0.5, 0.9],
    prop: 'phone',
  }),
  walk: (t) => {
    const s = Math.sin(t * 10);
    return {
      legF: { a: s * 26, b: s * 26 - 12 * Math.max(0, -s) },
      legB: { a: -s * 26, b: -s * 26 - 12 * Math.max(0, s) },
      front: { a: -s * 22, b: -s * 22 + 10 },
      back: { a: s * 22, b: s * 22 + 10 },
      y: -Math.abs(Math.cos(t * 10)) * 7,
      lean: 5,
      look: [0.8, 0],
    };
  },
  phone_call: (t, g) => ({
    ...STAND,
    front: { to: [-6, -98], bend: -1 },
    back: { a: -14 - S(g * 1.9) * 2, b: -6 },
    head: -6 + S(t * 3) * 4,
    y: S(g * 2.1) * 2,
    look: [0.6, -0.3],
    prop: 'phone_ear',
  }),
  hug_pillow: (t, g) => ({
    ...STAND,
    front: { to: [44, 52], bend: 1 },
    back: { to: [56, 40], bend: -1 },
    head: 12 + S(g * 1.4) * 3,
    lean: 5,
    y: 4 + S(g * 1.8) * 2,
    look: [0.4, 0.5],
    prop: 'pillow',
  }),
  cross_arms: (t, g) => ({
    ...STAND,
    front: { to: [-26, 50], bend: 1 },
    back: { to: [34, 48], bend: -1 },
    lean: -4,
    head: -6 + S(t * 1.5) * 2,
    y: S(g * 2.1) * 2,
  }),
  celebrate: (t) => {
    const pump = Math.abs(S(t * 7));
    return {
      ...STAND,
      front: { a: 130 + pump * 30, b: 160 + pump * 15 },
      back: { a: -20, b: -40 },
      head: -10,
      lean: -4,
      y: -pump * 10,
      look: [0.6, -0.3],
    };
  },
};

export function poseFor(action: string, t: number, g: number): Pose {
  return resolve((ACTIONS[action] ?? ACTIONS.idle)(t, g));
}

const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const mixLimb = (a: Limb, b: Limb, k: number): Limb => ({ a: mix(a.a, b.a, k), b: mix(a.b, b.b, k) });

export function blend(p: Pose, q: Pose, k: number): Pose {
  return {
    front: mixLimb(p.front, q.front, k),
    back: mixLimb(p.back, q.back, k),
    legF: mixLimb(p.legF, q.legF, k),
    legB: mixLimb(p.legB, q.legB, k),
    lean: mix(p.lean, q.lean, k),
    head: mix(p.head, q.head, k),
    y: mix(p.y, q.y, k),
    look: [mix(p.look[0], q.look[0], k), mix(p.look[1], q.look[1], k)],
    prop: k > 0.5 ? q.prop : p.prop,
  };
}

/** ease with a little overshoot so pose changes feel snappy, not robotic */
export const easeOutBack = (k: number) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
};
