import React from 'react';
import { ARM, LEG, dir, Pose } from './poses';

// A re-skin of the stick figure: identical pose/IK skeleton, but drawn as a
// flat-2D *person* — clothed torso, sleeved upper arms, skin forearms + hands,
// skin head — instead of thin ink strokes. All the pose/action/expression/mouth
// machinery in poses.ts is reused untouched.

export const TORSO = 168;
export const HEAD_R = 78;
export const HEAD_SCALE = 1.06; // more grown-up proportions (smaller head)
const INK = '#1f2233';

export type Expression = 'neutral' | 'happy' | 'smug' | 'annoyed' | 'sad' | 'surprised' | 'worried';
export type LookName = 'dad' | 'mom' | 'man' | 'woman' | 'teen_girl' | 'teen_boy' | 'kid' | 'kid_girl' | 'boss' | 'worker' | 'barista' | 'grandpa' | 'teacher';

type LookStyle = {
  shirt: string; pants: string; shoes: string; hair: string; skin: string;
  hairStyle: 'short' | 'ponytail' | 'bun' | 'cap' | 'bald';
  tie?: string; glasses?: boolean; accent: string; bow?: string;
};

// skin tones kept warm + varied so flexible casting reads as different people
const SK = {
  light: '#ffe0c4', fair: '#fcd0ad', tan: '#e8b58b', warm: '#d99a6c', brown: '#b87a4e', deep: '#8d5524',
};

// Cohesive modern-flat palette: muted, friendly clothing + denim/charcoal bottoms.
export const LOOKS: Record<LookName, LookStyle> = {
  dad: { shirt: '#5b8def', pants: '#2f3b52', shoes: '#2a2f3a', hair: '#4a3426', skin: SK.fair, hairStyle: 'short', accent: '#3a6fd6' },
  mom: { shirt: '#b56cc9', pants: '#394559', shoes: '#2a2f3a', hair: '#5a3b28', skin: SK.tan, hairStyle: 'bun', accent: '#9d55b3' },
  teen_girl: { shirt: '#ff8fa3', pants: '#3d5a80', shoes: '#f4f6f8', hair: '#6b3f2a', skin: SK.light, hairStyle: 'ponytail', bow: '#ffd166', accent: '#ef6d85' },
  teen_boy: { shirt: '#ffb84d', pants: '#33415c', shoes: '#f4f6f8', hair: '#2b2b2b', skin: SK.warm, hairStyle: 'cap', accent: '#f08a24' },
  kid: { shirt: '#2ec4a5', pants: '#33415c', shoes: '#ef6d85', hair: '#3b2a1f', skin: SK.tan, hairStyle: 'cap', accent: '#1fb08f' },
  kid_girl: { shirt: '#c77dff', pants: '#33415c', shoes: '#ffd166', hair: '#3b2a1f', skin: SK.light, hairStyle: 'ponytail', bow: '#ef6d85', accent: '#a661e0' },
  man: { shirt: '#3f7ed6', pants: '#2b3447', shoes: '#2a2f3a', hair: '#2f2218', skin: SK.warm, hairStyle: 'short', accent: '#2f6fd6' },
  woman: { shirt: '#2bb3a3', pants: '#3d5a80', shoes: '#f4f6f8', hair: '#6b4228', skin: SK.fair, hairStyle: 'ponytail', accent: '#149688' },
  barista: { shirt: '#e8a35a', pants: '#2f3b52', shoes: '#2a2f3a', hair: '#2b2b2b', skin: SK.brown, hairStyle: 'bun', accent: '#d68636' },
  grandpa: { shirt: '#9fb3c8', pants: '#54606f', shoes: '#2a2f3a', hair: '#e5e5e5', skin: SK.light, hairStyle: 'short', glasses: true, accent: '#6d7f99' },
  teacher: { shirt: '#ef8354', pants: '#3d5a80', shoes: '#2a2f3a', hair: '#4a3020', skin: SK.tan, hairStyle: 'bun', glasses: true, accent: '#d85f3a' },
  boss: { shirt: '#4a5568', pants: '#2b303b', shoes: '#2a2f3a', hair: '#8a9099', skin: SK.deep, hairStyle: 'short', tie: '#e05252', accent: '#e05252' },
  worker: { shirt: '#36b6e0', pants: '#33415c', shoes: '#2a2f3a', hair: '#2b2b2b', skin: SK.warm, hairStyle: 'short', accent: '#1f94c0' },
};

const pt = (o: [number, number], a: number, len: number): [number, number] => {
  const [dx, dy] = dir(a);
  return [o[0] + dx * len, o[1] + dy * len];
};

/** smooth "rubber hose" limb: quadratic curve that passes through the joint */
function hose(o: [number, number], a: number, b: number, [L1, L2]: readonly [number, number]) {
  const e = pt(o, a, L1);
  const h = pt(e, b, L2);
  const c: [number, number] = [2 * e[0] - (o[0] + h[0]) / 2, 2 * e[1] - (o[1] + h[1]) / 2];
  return { e, h, d: `M${o[0]} ${o[1]} Q${c[0]} ${c[1]} ${h[0]} ${h[1]}` };
}

// Simple, friendly face: dot eyes + one-stroke mouth (no whites, pupils, teeth).
const Eyes: React.FC<{ expr: Expression; blink: boolean; look: [number, number] }> = ({ expr, blink, look }) => {
  const xs = [24, 52];
  const y = -4 + look[1] * 2;
  const dx = look[0] * 2;
  const s = { stroke: INK, strokeWidth: 6, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <g>
      {xs.map((x0, i) => {
        const x = x0 + dx;
        if (blink) return <path key={i} d={`M${x - 7} ${y} h14`} {...s} />;
        if (expr === 'happy') return <path key={i} d={`M${x - 8} ${y + 3} q8 -10 16 0`} {...s} />;
        if (expr === 'smug' || expr === 'annoyed') return <path key={i} d={`M${x - 8} ${y} h16`} {...s} strokeWidth={7} />;
        const r = expr === 'surprised' ? 8 : 6.5;
        return (
          <g key={i}>
            <ellipse cx={x} cy={y} rx={r} ry={r * 1.25} fill={INK} />
            <circle cx={x + 2} cy={y - 3} r={2} fill="#fff" />
          </g>
        );
      })}
    </g>
  );
};

// brows only where they carry the emotion
const BROWS: Partial<Record<Expression, string>> = {
  annoyed: 'M14 -24 L32 -18 M42 -18 L60 -24',
  sad: 'M14 -18 L32 -24 M42 -24 L60 -18',
  worried: 'M14 -20 L32 -25 M42 -25 L60 -20',
  surprised: 'M14 -28 q9 -6 18 0 M42 -28 q9 -6 18 0',
};

const Mouth: React.FC<{ expr: Expression; open: number; id: string }> = ({ expr, open }) => {
  const s = { stroke: INK, strokeWidth: 5.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  const cx = 40;
  const cy = 26;
  if (open > 0.05) {
    return <ellipse cx={cx} cy={cy + 2 + open * 3} rx={7 + open * 4} ry={3 + open * 9} fill="#3a1f2b" />;
  }
  const shapes: Record<Expression, React.ReactNode> = {
    neutral: <path d={`M${cx - 8} ${cy} h16`} {...s} />,
    happy: <path d={`M${cx - 12} ${cy - 3} q12 14 24 0`} {...s} />,
    smug: <path d={`M${cx - 10} ${cy + 2} q10 4 20 -6`} {...s} />,
    annoyed: <path d={`M${cx - 9} ${cy + 2} h18`} {...s} />,
    sad: <path d={`M${cx - 10} ${cy + 6} q10 -10 20 0`} {...s} />,
    worried: <path d={`M${cx - 10} ${cy + 3} q5 -4 10 0 q5 4 10 0`} {...s} />,
    surprised: <ellipse cx={cx} cy={cy + 4} rx={6} ry={8} fill="#3a1f2b" />,
  };
  return <>{shapes[expr]}</>;
};

const HairBack: React.FC<{ st: LookStyle; g: number }> = ({ st, g }) => {
  if (st.hairStyle === 'ponytail') {
    const swing = Math.sin(g * 3.2) * 9;
    return (
      <g transform={`translate(-58 -46) rotate(${-25 + swing})`}>
        <path d="M0 0 C-30 20 -40 70 -20 110 C-5 80 6 40 12 6 Z" fill={st.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round" />
      </g>
    );
  }
  if (st.hairStyle === 'bun') return <circle cx={-40} cy={-72} r={30} fill={st.hair} stroke={INK} strokeWidth={6} />;
  return null;
};

const HairFront: React.FC<{ st: LookStyle }> = ({ st }) => {
  const R = HEAD_R;
  switch (st.hairStyle) {
    case 'short':
      return (
        <path
          d={`M${-R + 4} -6 C${-R - 4} -60 -30 ${-R - 16} 14 ${-R - 6} C44 ${-R - 2} 70 -60 66 -36 C40 -52 10 -54 -20 -40 C-40 -30 -56 -20 ${-R + 4} -6 Z`}
          fill={st.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round"
        />
      );
    case 'ponytail':
    case 'bun':
      return (
        <g>
          <path
            d={`M${-R + 2} 10 C${-R - 6} -70 10 ${-R - 26} 54 -58 C70 -46 74 -30 70 -24 C46 -30 30 -44 18 -52 C10 -30 -10 -30 -30 -34 C-50 -20 -60 0 ${-R + 2} 10 Z`}
            fill={st.hair} stroke={INK} strokeWidth={6} strokeLinejoin="round"
          />
          {st.bow && (
            <g transform="translate(-50 -58) rotate(-20)">
              <path d="M0 0 L-20 -14 L-20 14 Z M0 0 L20 -14 L20 14 Z" fill={st.bow} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
              <circle r={6} fill={st.bow} stroke={INK} strokeWidth={4} />
            </g>
          )}
        </g>
      );
    case 'cap':
      return (
        <g>
          <path d={`M-75.6 -26 A${R + 2} ${R + 2} 0 0 1 75.6 -26 Z`} fill={st.accent} stroke={INK} strokeWidth={7} strokeLinejoin="round" />
          <path d={`M${R - 20} -28 h54`} stroke={INK} strokeWidth={14} strokeLinecap="round" />
        </g>
      );
    default:
      return null;
  }
};

const Emote: React.FC<{ expr: Expression; g: number }> = ({ expr, g }) => {
  const bob = Math.sin(g * 6) * 4;
  if (expr === 'surprised')
    return <text x={-70} y={-HEAD_R - 20 + bob} fontFamily="Luckiest Guy" fontSize={64} fill="#ffd166" stroke={INK} strokeWidth={7} paintOrder="stroke" transform="rotate(-12)">!</text>;
  if (expr === 'annoyed')
    return (
      <g transform={`translate(-58 ${-HEAD_R + 6}) scale(${1 + Math.sin(g * 9) * 0.08})`}>
        <path d="M-12 -4 q8 -2 10 -10 M4 -14 q2 8 10 10 M14 4 q-8 2 -10 10 M-2 14 q-2 -8 -10 -10" stroke="#e63946" strokeWidth={6} strokeLinecap="round" fill="none" />
      </g>
    );
  if (expr === 'worried' || expr === 'sad')
    return <path transform={`translate(-60 ${-30 + bob * 0.5})`} d="M0 0 C-10 14 -12 22 0 26 C12 22 10 14 0 0 Z" fill="#8ecae6" stroke={INK} strokeWidth={4} />;
  return null;
};

export const HumanFigure: React.FC<{
  id: string;
  pose: Pose;
  x: number;
  floorY: number;
  scale: number;
  facing: 1 | -1;
  look: LookName;
  expr: Expression;
  mouth: number;
  blink: boolean;
  g: number;
  held?: string;
}> = ({ id, pose, x, floorY, scale, facing, look, expr, mouth, blink, g, held }) => {
  const st = LOOKS[look] ?? LOOKS.worker;
  const hip: [number, number] = [0, 0];
  const L = (pose.lean * Math.PI) / 180;
  const neck: [number, number] = [Math.sin(L) * TORSO, -Math.cos(L) * TORSO];
  const shoulder: [number, number] = [neck[0] * 0.84, neck[1] * 0.84];

  const back = hose(shoulder, pose.back.a, pose.back.b, ARM);
  const front = hose(shoulder, pose.front.a, pose.front.b, ARM);
  const legB = hose(hip, pose.legB.a, pose.legB.b, LEG);
  const legF = hose(hip, pose.legF.a, pose.legF.b, LEG);
  const legH = Math.max(legF.h[1], legB.h[1]);
  const hipY = floorY - legH * scale;

  const limb = (color: string, w: number) => ({
    stroke: color, strokeWidth: w, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none',
  });
  const outlined = (d: string, color: string, w: number) => (
    <g>
      <path d={d} {...limb(INK, w + 8)} />
      <path d={d} {...limb(color, w)} />
    </g>
  );
  const shoe = (h: [number, number], k: string) => (
    <ellipse key={k} cx={h[0] + 13} cy={h[1] + 2} rx={29} ry={14} fill={st.shoes} stroke={INK} strokeWidth={5} />
  );
  // a human arm: skin forearm (full limb) + a clothed sleeve over the upper arm + skin hand
  const arm = (seg: { e: [number, number]; h: [number, number]; d: string }, behind: boolean) => (
    <g opacity={behind ? 0.96 : 1}>
      {outlined(seg.d, st.skin, 18)}
      {outlined(`M${shoulder[0]} ${shoulder[1]} L${seg.e[0]} ${seg.e[1]}`, st.shirt, 30)}
      <circle cx={seg.h[0]} cy={seg.h[1]} r={15} fill={st.skin} stroke={INK} strokeWidth={6} />
    </g>
  );

  const air = Math.max(0, -pose.y);
  return (
    <g>
      <ellipse cx={x} cy={floorY + 8} rx={(110 - air * 0.6) * scale} ry={(16 - air * 0.08) * scale} fill="rgba(60,30,10,0.16)" />
      <g
        transform={`translate(${x} ${hipY + pose.y * scale}) scale(${scale * facing} ${scale})`}
        style={{ filter: 'drop-shadow(0px 10px 7px rgba(20,22,40,0.28))' }}
      >
        {/* back arm (behind body) */}
        {arm(back, true)}
        {/* legs */}
        {outlined(legB.d, st.pants, 28)}
        {shoe(legB.h, 'b')}
        {outlined(legF.d, st.pants, 28)}
        {shoe(legF.h, 'f')}
        {/* shirt: rounded trapezoid following the spine, broader shoulders for an adult build */}
        <g transform={`rotate(${pose.lean})`}>
          <path
            d={`M-38 ${-TORSO * 0.9} Q0 ${-TORSO * 0.99} 38 ${-TORSO * 0.9} L48 -8 Q48 10 30 10 L-30 10 Q-48 10 -48 -8 Z`}
            fill={st.shirt} stroke={INK} strokeWidth={7} strokeLinejoin="round"
          />
        </g>
        {st.tie && (
          <g transform={`translate(${neck[0] * 0.93} ${neck[1] * 0.93}) rotate(${pose.lean})`}>
            <path d="M0 0 l-12 10 l8 8 l-8 74 l12 16 l12 -16 l-8 -74 l8 -8 z" fill={st.tie} stroke={INK} strokeWidth={4} strokeLinejoin="round" />
          </g>
        )}
        {/* head */}
        <g transform={`translate(${neck[0]} ${neck[1]}) rotate(${pose.lean + pose.head})`}>
          {/* neck in skin */}
          {outlined('M0 6 L0 -12', st.skin, 22)}
          <g transform={`translate(0 ${-(HEAD_R * HEAD_SCALE - 4)}) scale(${HEAD_SCALE})`}>
            <HairBack st={st} g={g} />
            <circle r={HEAD_R} fill={st.skin} stroke={INK} strokeWidth={9} />
            <ellipse cx={64} cy={24} rx={10} ry={7} fill="#ff8fa3" opacity={0.45} />
            <ellipse cx={4} cy={24} rx={10} ry={7} fill="#ff8fa3" opacity={0.35} />
            <HairFront st={st} />
            <Eyes expr={expr} blink={blink} look={pose.look} />
            {st.glasses && (
              <g fill="none" stroke={INK} strokeWidth={4}>
                <circle cx={20} cy={-6} r={21} />
                <circle cx={54} cy={-6} r={21} />
                <path d="M33 -10 q4 -3 8 0 M-1 -8 L-40 -14" />
              </g>
            )}
            {BROWS[expr] && <path d={BROWS[expr]} stroke={INK} strokeWidth={6} strokeLinecap="round" fill="none" />}
            <Mouth expr={expr} open={mouth} id={id} />
            <Emote expr={expr} g={g} />
          </g>
        </g>
        {/* phone prop between the hands */}
        {pose.prop === 'phone' && (
          <g transform={`translate(${shoulder[0] + 58} ${shoulder[1] + 22}) rotate(-28)`}>
            <rect x={-20} y={-34} width={40} height={68} rx={8} fill={INK} />
            <rect x={-15} y={-27} width={30} height={52} rx={4} fill="#9be7ff" />
            <path d="M-9 -16 h18 M-9 -6 h12 M-9 4 h16" stroke="#3a86ff" strokeWidth={4} strokeLinecap="round" />
          </g>
        )}
        {pose.prop === 'pillow' && (
          <g transform={`translate(${shoulder[0] + 42} ${shoulder[1] + 60}) rotate(-10)`}>
            <rect x={-80} y={-56} width={160} height={112} rx={40} fill="#9ec5ff" stroke={INK} strokeWidth={8} />
            <path d="M-40 -20 q40 12 80 0 M-40 18 q40 -10 80 0" stroke="rgba(31,34,51,0.25)" strokeWidth={5} fill="none" strokeLinecap="round" />
          </g>
        )}
        {/* front arm */}
        {pose.prop === 'phone_ear' && (
          <g transform={`translate(${front.h[0] + 4} ${front.h[1] - 6}) rotate(10)`}>
            <rect x={-14} y={-30} width={28} height={58} rx={7} fill={INK} />
            <rect x={-9} y={-24} width={18} height={44} rx={3} fill="#9be7ff" />
          </g>
        )}
        {held === 'paper' && !pose.prop && (
          <g transform={`translate(${front.h[0] + 8} ${front.h[1] - 44}) rotate(${-6 + pose.front.a * 0.04})`}>
            <rect x={-46} y={-60} width={92} height={120} rx={6} fill="#fffef6" stroke={INK} strokeWidth={5} />
            <path d="M-32 -34 h64 M-32 -14 h56 M-32 6 h64 M-32 26 h48 M-32 46 h60" stroke="#9db4d0" strokeWidth={5} strokeLinecap="round" />
            <path d="M-36 -60 v120" stroke="#ef8a8a" strokeWidth={3} />
          </g>
        )}
        {held === 'test_paper' && !pose.prop && (
          <g transform={`translate(${front.h[0] + 6} ${front.h[1] - 40}) rotate(${-8 + pose.front.a * 0.05})`}>
            <rect x={-44} y={-58} width={88} height={116} rx={6} fill="#fff" stroke={INK} strokeWidth={5} />
            <path d="M-30 -36 h44 M-30 -18 h56 M-30 0 h40" stroke="#b8c0cc" strokeWidth={5} strokeLinecap="round" />
            <text x={4} y={50} textAnchor="middle" fontFamily="Luckiest Guy" fontSize={56} fill="#e63946">0</text>
            <circle cx={4} cy={30} r={30} fill="none" stroke="#e63946" strokeWidth={5} />
          </g>
        )}
        {held === 'icecream' && !pose.prop && (
          <g transform={`translate(${front.h[0]} ${front.h[1] - 4})`}>
            <path d="M-17 -2 L17 -2 L0 44 Z" fill="#f4a261" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
            <path d="M-10 8 l14 14 M4 4 l10 10" stroke="#c97b3a" strokeWidth={4} />
            <circle cx={0} cy={-20} r={22} fill="#ff8fab" stroke={INK} strokeWidth={5} />
            <circle cx={-6} cy={-28} r={6} fill="#fff" opacity={0.6} />
          </g>
        )}
        {held === 'coffee' && !pose.prop && (
          <g transform={`translate(${front.h[0]} ${front.h[1] - 6})`}>
            <path d="M-20 -6 h40 l-5 52 h-30 z" fill="#fff" stroke={INK} strokeWidth={5} strokeLinejoin="round" />
            <path d="M-22 -6 h44" stroke={INK} strokeWidth={5} strokeLinecap="round" />
            <path d="M-8 -26 q8 -10 16 0" stroke="rgba(31,34,51,0.4)" strokeWidth={4} fill="none" strokeLinecap="round" />
          </g>
        )}
        {arm(front, false)}
      </g>
    </g>
  );
};

/** Top of the head in stage coordinates (for speech-bubble tails). */
export function headTop(x: number, floorY: number, scale: number, pose: Pose) {
  const hipY = floorY - (LEG[0] + LEG[1]) * 0.98 * scale;
  return { x, y: hipY + (pose.y - TORSO - HEAD_R * 2 * HEAD_SCALE) * scale };
}
