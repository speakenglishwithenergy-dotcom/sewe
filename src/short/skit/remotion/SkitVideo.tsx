import React from 'react';
import {
  AbsoluteFill, Audio, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import '@fontsource/luckiest-guy';
import '@fontsource/nunito/900.css';
import { BACKGROUNDS, FLOOR_Y } from './Background';
import { HumanFigure as StickFigure, Expression, LookName, headTop, LOOKS } from './HumanFigure';
import { blend, poseFor, Pose, easeOutBack } from './poses';

export type Word = { w: string; s: number; e: number };
export type Line = {
  speaker: string; text: string; action: string; expression: Expression;
  listener?: { action: string; expression: Expression };
  listeners?: Record<string, { action: string; expression: Expression }>;
  start: number; end: number; words: Word[]; env: number[];
  punchline?: boolean; sting_at?: number; scene: number; hook?: boolean; pause_after?: number;
};
export type Scene = {
  index: number; role: 'hook' | 'scene'; background: string; caption?: string;
  left?: string; center?: string; right?: string; board?: string; props?: Record<string, string>; enter: Record<string, number>;
  start: number; end: number;
};
export type Character = { look: LookName; scale: number; gender?: string };
export type Timeline = {
  id: string; title: string; fps: number; audio: string; audio_duration: number; outro_start: number;
  duration_in_frames: number; lead_in: number;
  characters: Record<string, Character>; lines: Line[]; scenes: Scene[]; transitions: number[];
  outro?: { actions?: Record<string, string>; expressions?: Record<string, Expression>; text: string; label?: string; note?: string; follow?: string };
  hook?: { hold_start?: number; end: number; main_start: number; caption: string } | null;
  series?: { name: string; episode?: number; score?: { kid: number; adults: number }; end_card?: string } | null;
};

const INK = '#1f2233';
type Slot = 'left' | 'center' | 'right';
const X2 = { left: 370, center: 540, right: 720 };
const X3 = { left: 250, center: 545, right: 840 };
const slotX = (sc: Scene, slot: Slot) => (sc.center ? X3 : X2)[slot];
const BLEND = 0.28;
const CAM_Y = 1150;
const WALK_IN = 0.75;
const PAN = 0.75; // must match SCENE_TRANSITION in tts.py

type State = { action: string; expr: Expression; since: number };
type Cam = { fx: number; z: number };

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (k: number) => k * k * (3 - 2 * k);
const isLast = (tl: Timeline, si: number) => si === tl.scenes.length - 1;
const sceneLines = (tl: Timeline, si: number) => tl.lines.filter((l) => l.scene === si);
const sideOf = (sc: Scene, who: string): Slot => (sc.right === who ? 'right' : sc.center === who ? 'center' : 'left');

function stateAt(tl: Timeline, si: number, who: string, t: number): State {
  if (isLast(tl, si) && t >= tl.outro_start) {
    return { action: tl.outro?.actions?.[who] ?? 'idle', expr: tl.outro?.expressions?.[who] ?? 'happy', since: tl.outro_start };
  }
  let line: Line | undefined;
  for (const l of sceneLines(tl, si)) if (l.start - 0.08 <= t) line = l;
  const sc = tl.scenes[si];
  if (!line) return { action: 'idle', expr: 'neutral', since: sc.start };
  if (line.speaker === who) return { action: line.action, expr: line.expression, since: line.start - 0.08 };
  const ls = line.listeners?.[who] ?? line.listener;
  return { action: ls?.action ?? 'idle', expr: ls?.expression ?? 'neutral', since: line.start - 0.08 };
}

function poseAt(tl: Timeline, si: number, who: string, t: number): Pose {
  const cur = stateAt(tl, si, who, t);
  const p = poseFor(cur.action, t - cur.since, t);
  const k = (t - cur.since) / BLEND;
  if (k >= 1 || cur.since <= tl.scenes[si].start) return p;
  const prev = stateAt(tl, si, who, cur.since - 0.001);
  if (prev.action === cur.action) return p;
  return blend(poseFor(prev.action, t - prev.since, t), p, easeOutBack(Math.max(0, k)));
}

/** camera drifts toward whoever talks, punches in on the hook and the punchline */
function camTarget(tl: Timeline, si: number, line?: Line): Cam {
  const sc = tl.scenes[si];
  if (!line) return { fx: 540, z: sc.role === 'hook' ? 1.12 : 1.0 };
  const sx = slotX(sc, sideOf(sc, line.speaker));
  if (line.hook) return { fx: 540 + (sx - 540) * 0.5, z: 1.2 };
  if (line.punchline) return { fx: 540 + (sx - 540) * 0.55, z: 1.16 };
  const i = tl.lines.indexOf(line);
  return { fx: 540 + (sx - 540) * 0.22, z: 1.04 + (i % 3 === 2 ? 0.05 : 0) };
}
function cameraAt(tl: Timeline, si: number, t: number): Cam {
  const ls = sceneLines(tl, si);
  let i = -1;
  ls.forEach((l, k) => { if (t >= l.start - 0.15) i = k; });
  if (isLast(tl, si) && t >= tl.outro_start) return { fx: 540, z: 1.0 };
  const cur = camTarget(tl, si, ls[i]);
  const prev = camTarget(tl, si, ls[i - 1]);
  const since = i >= 0 ? ls[i].start - 0.15 : tl.scenes[si].start;
  const e = smooth(clamp01((t - since) / 0.6));
  // hook opens with a hard punch-in
  if (tl.scenes[si].role === 'hook' && t < 0.5) {
    const k = smooth(clamp01(t / 0.45));
    return { fx: cur.fx, z: 1.45 - (1.45 - cur.z) * k };
  }
  return { fx: prev.fx + (cur.fx - prev.fx) * e, z: prev.z + (cur.z - prev.z) * e };
}

type Fig = { who: string; c: Character; pose: Pose; x: number; el: React.ReactNode };

function figuresFor(tl: Timeline, si: number, t: number, fps: number): Fig[] {
  const sc = tl.scenes[si];
  const current = [...sceneLines(tl, si)].reverse().find((l) => l.start - 0.08 <= t);
  return (['left', 'center', 'right'] as const).flatMap((side, idx) => {
    const who = sc[side];
    if (!who) return [];
    const c = tl.characters[who];
    let x = slotX(sc, side);
    let pose = poseAt(tl, si, who, t);
    const enterT = sc.enter?.[who];
    if (enterT !== undefined) {
      if (t < enterT - WALK_IN) return [];
      if (t < enterT) {
        const k = clamp01((t - (enterT - WALK_IN)) / WALK_IN);
        const from = side === 'right' ? 1260 : -180;
        x = from + (slotX(sc, side) - from) * (1 - Math.pow(1 - k, 2));
        pose = poseFor('walk', t, t);
      }
    }
    const st = stateAt(tl, si, who, t);
    const speaking = current && current.speaker === who && t >= current.start && t <= current.end;
    const mouth = speaking ? current!.env[Math.min(current!.env.length - 1, Math.floor((t - current!.start) * fps))] ?? 0 : 0;
    const blink = (t + idx * 1.7) % 3.4 < 0.1 && st.expr !== 'surprised';
    return [{
      who, c, pose, x, el: (
        <StickFigure
          key={who} id={`${who}-${si}`} pose={pose} x={x} floorY={FLOOR_Y} scale={c.scale}
          facing={side === 'left' ? 1 : side === 'right' ? -1 : (current && sideOf(sc, current.speaker) === 'left' ? -1 : 1)} look={c.look} expr={st.expr} mouth={mouth} blink={blink} g={t}
          held={sc.props?.[who]}
        />
      ),
    }];
  });
}

const Stage: React.FC<{ tl: Timeline; si: number; t: number; fps: number; cam: Cam; style?: React.CSSProperties }> = ({
  tl, si, t, fps, cam, style,
}) => {
  const Bg = BACKGROUNDS[tl.scenes[si].background] ?? BACKGROUNDS.living_room;
  const figs = figuresFor(tl, si, t, fps);
  return (
    <AbsoluteFill style={style}>
      <AbsoluteFill style={{ transform: `translate(${540 - cam.fx}px, 0px) scale(${cam.z})`, transformOrigin: `${cam.fx}px ${CAM_Y}px` }}>
        <Bg board={tl.scenes[si].board} />
        <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>{figs.map((f) => f.el)}</svg>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** words wrapped in *asterisks* are emphasised */
const parseWord = (w: string) => ({ text: w.replace(/\*/g, ''), em: w.includes('*') });
function emphasisRanges(words: Word[]) {
  let on = false;
  return words.map((w) => {
    const starts = w.w.startsWith('*');
    const ends = /\*[^a-zA-Z0-9]*$/.test(w.w) && (w.w.length > 1);
    if (starts) on = true;
    const em = on;
    if (ends) on = false;
    return em;
  });
}

const Bubble: React.FC<{ line: Line; t: number; frame: number; fps: number; tail: { x: number; y: number }; accent: string }> = ({
  line, t, frame, fps, tail, accent,
}) => {
  const pop = spring({ frame: frame - Math.round((line.start - 0.06) * fps), fps, config: { damping: 11, stiffness: 190 } });
  const out = interpolate(t, [line.end + 0.25, line.end + 0.45], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const bottom = 740;
  const baseX = Math.min(Math.max(tail.x, 230), 850);
  const tipY = Math.max(bottom + 40, tail.y - 18);
  const ems = emphasisRanges(line.words);
  return (
    <div style={{ position: 'absolute', inset: 0, opacity: out, transform: `scale(${0.6 + 0.4 * pop})`, transformOrigin: `${baseX}px ${bottom}px` }}>
      <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
        <path
          d={`M${baseX - 38} ${bottom - 8} Q${baseX} ${bottom + 30} ${tail.x} ${tipY} Q${baseX + 10} ${bottom + 20} ${baseX + 38} ${bottom - 8} Z`}
          fill="#fff" stroke={INK} strokeWidth={8} strokeLinejoin="round"
        />
      </svg>
      <div
        style={{
          position: 'absolute', left: 64, right: 64, bottom: 1920 - bottom, padding: '28px 38px 32px',
          background: '#fff', border: `8px solid ${INK}`, borderRadius: 52, boxShadow: `0 12px 0 rgba(31,34,51,0.22)`,
          fontFamily: 'Nunito', fontWeight: 900, fontSize: line.words.length > 9 ? 58 : line.punchline ? 78 : 66, lineHeight: 1.14,
          color: INK, textAlign: 'center', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 19px',
        }}
      >
        {line.words.map((w, i) => {
          const active = t >= w.s - 0.03 && t < w.e;
          const said = t >= w.s - 0.03;
          const k = clamp01((t - (w.s - 0.03)) / 0.12);
          const em = ems[i];
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                opacity: said ? 1 : 0.18,
                color: em ? '#e63946' : active ? accent : INK,
                transform: `translateY(${said ? (1 - k) * 10 : 0}px) scale(${active && !em ? 1.06 : 1})`,
                fontSize: em ? '1.12em' : undefined,
              }}
            >
              {parseWord(w.w).text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** cold-open caption: huge, word-by-word; earlier hook lines stay (smaller) so the whole
 *  situation is readable, then everything holds on screen before the rewind */
const HookCaption: React.FC<{ lines: Line[]; t: number; frame: number; fps: number; holdUntil: number; holding: boolean }> = ({
  lines, t, frame, fps, holdUntil, holding,
}) => {
  const out = interpolate(t, [holdUntil - 0.12, holdUntil], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  const lastIdx = lines.length - 1;
  return (
    <div style={{ position: 'absolute', top: 130, left: 34, right: 34, opacity: out, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {lines.map((line, li) => {
        const ems = emphasisRanges(line.words);
        const main = li === 0; // the shocking line is the star
        const size = main ? 96 : 66;
        return (
          <div key={li} style={{
            background: 'rgba(16,18,32,0.62)', borderRadius: 34, padding: main ? '20px 18px 26px' : '14px 18px 18px',
            textAlign: 'center', transform: `rotate(${main ? -1.5 : 1}deg) scale(${li < lastIdx || holding ? 1 : 1})`,
            border: main ? '6px solid #ffd166' : '5px solid rgba(255,255,255,0.35)',
          }}>
            <div style={{ fontFamily: 'Luckiest Guy', fontSize: main ? 38 : 30, color: '#ffd166', letterSpacing: 2, marginBottom: 4 }}>
              {line.speaker.toUpperCase()}:
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '0 20px', alignItems: 'baseline' }}>
              {line.words.map((w, i) => {
                const sp = spring({ frame: frame - Math.round((w.s - 0.05) * fps), fps, config: { damping: 9, stiffness: 260 } });
                const said = t >= w.s - 0.05;
                const em = ems[i];
                const pulse = em && holding ? 1 + Math.abs(Math.sin(t * 8)) * 0.12 : 1;
                const wob = em && said ? Math.sin(t * 28) * 2.5 : 0;
                return (
                  <span key={i} style={{
                    display: 'inline-block', fontFamily: 'Luckiest Guy', lineHeight: 1.08,
                    fontSize: em ? size * 1.4 : size, color: em ? '#ffd166' : '#fff',
                    WebkitTextStroke: `${em ? 15 : 11}px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 8px 0 ${INK}`,
                    padding: em ? '0 10px' : 0, borderRadius: 14,
                    background: em && said ? 'linear-gradient(transparent 52%, #e63946 52%, #e63946 92%, transparent 92%)' : 'none',
                    opacity: said ? 1 : 0,
                    transform: `scale(${(said ? 0.4 + 0.6 * sp : 0.4) * pulse}) rotate(${(em ? -4 : 0) + wob}deg)`,
                  }}>
                    {parseWord(w.w).text}
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/** end card: running score of the series, the channel's signature ending */
const Scoreboard: React.FC<{ series: NonNullable<Timeline['series']>; t: number; frame: number; fps: number }> = ({ series, t, frame, fps }) => {
  const inn = spring({ frame, fps, config: { damping: 11, stiffness: 160 } });
  const kid = series.score!.kid;
  const flip = spring({ frame: frame - Math.round(0.45 * fps), fps, config: { damping: 8, stiffness: 220 } });
  const shown = t < 0.45 ? kid - 1 : kid;
  const cell = (label: string, n: React.ReactNode, color: string, pop = 1) => (
    <div style={{ flex: 1, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Luckiest Guy', fontSize: 40, color: '#fff', letterSpacing: 2 }}>{label}</div>
      <div style={{
        fontFamily: 'Luckiest Guy', fontSize: 170, lineHeight: 1, color, WebkitTextStroke: `12px ${INK}`, paintOrder: 'stroke fill',
        transform: `scale(${pop})`,
      }}>{n}</div>
    </div>
  );
  return (
    <div style={{ position: 'absolute', top: 300, left: 60, right: 60, transform: `translateY(${(1 - inn) * -700}px) rotate(-2deg)` }}>
      <div style={{ background: INK, borderRadius: 40, border: '8px solid #ffd166', padding: '26px 24px 30px', boxShadow: `0 16px 0 rgba(0,0,0,0.35)` }}>
        <div style={{ textAlign: 'center', fontFamily: 'Luckiest Guy', fontSize: 44, color: '#ffd166', letterSpacing: 3, marginBottom: 6 }}>
          SCOREBOARD
        </div>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {cell('KID LOGIC', Math.max(0, shown), '#ffd166', t < 0.45 ? 1 : 0.7 + 0.3 * flip + (1 - flip) * 0.6)}
          <div style={{ fontFamily: 'Luckiest Guy', fontSize: 110, color: '#fff' }}>:</div>
          {cell('ADULTS', series.score!.adults, '#e63946')}
        </div>
      </div>
      {series.end_card && (
        <div style={{
          margin: '34px auto 0', width: 'fit-content', background: '#e63946', color: '#fff', fontFamily: 'Luckiest Guy',
          fontSize: 46, padding: '14px 28px 8px', borderRadius: 20, border: `6px solid ${INK}`, boxShadow: `0 8px 0 ${INK}`,
          transform: `scale(${spring({ frame: frame - Math.round(0.9 * fps), fps, config: { damping: 10 } })}) rotate(2deg)`,
        }}>
          {series.end_card}
        </div>
      )}
    </div>
  );
};

export const SkitVideo: React.FC<{ timeline: Timeline }> = ({ timeline: tl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const hk = tl.hook;
  const inRewind = !!hk && t >= hk.end && t < hk.main_start;
  const tc = inRewind ? hk!.end : t; // characters freeze while the tape rewinds

  // which scene(s) are on screen
  let si = 0;
  tl.scenes.forEach((s, i) => { if (tc >= s.start) si = i; });
  const sc = tl.scenes[si];
  // during a whip-pan the next scene's start is still ahead: find the outgoing/incoming pair
  let panFrom = -1;
  tl.scenes.forEach((s, i) => {
    if (i > 0 && tl.scenes[i - 1].role === 'scene' && s.role === 'scene' && t >= tl.scenes[i - 1].end && t < s.start) panFrom = i - 1;
  });
  const p = panFrom >= 0 ? smooth(clamp01((t - tl.scenes[panFrom].end) / PAN)) : 0;

  const lines = sceneLines(tl, si);
  const current = [...lines].reverse().find((l) => l.start - 0.08 <= tc);
  const punch = tl.lines.find((l) => l.punchline);
  const stingT = punch?.sting_at ?? 1e9;
  const cam = cameraAt(tl, si, tc);

  // shake: on the sting and on every emphasised hook word
  let shakeAmt = t > stingT && t < stingT + 0.5 ? (1 - (t - stingT) / 0.5) * 14 : 0;
  if (current?.hook) {
    const ems = emphasisRanges(current.words);
    current.words.forEach((w, i) => {
      if (ems[i] && t >= w.s && t < w.s + 0.3) shakeAmt = Math.max(shakeAmt, (1 - (t - w.s) / 0.3) * 18);
    });
  }
  if (t < 0.25) shakeAmt = Math.max(shakeAmt, (1 - t / 0.25) * 20);
  const shakeX = Math.sin(t * 95) * shakeAmt;
  const shakeY = Math.cos(t * 120) * shakeAmt;

  const figs = figuresFor(tl, si, tc, fps);
  const toScreen = (q: { x: number; y: number }) => ({ x: 540 + (q.x - cam.fx) * cam.z + shakeX, y: CAM_Y + (q.y - CAM_Y) * cam.z + shakeY });
  const speakerFig = current ? figs.find((f) => f.who === current.speaker) : undefined;
  const linger = Math.max(0.45, (current?.pause_after ?? 0) - 0.05);
  // The first line is always the giant card (name on top, huge words), even with no rewind.
  const isOpeningCard = !!current && !tl.hook && current.start === tl.lines[0]?.start;
  const showBubble = current && !current.hook && !isOpeningCard && speakerFig && !inRewind && panFrom < 0 && t < tl.outro_start && t < current.end + linger;
  const showHookCaption = (current?.hook && !inRewind) || isOpeningCard;
  const holding = !!hk?.hold_start && t >= hk.hold_start && t < hk.end;
  const hookSoFar = isOpeningCard ? [current!] : tl.lines.filter((l) => l.hook && l.start - 0.08 <= t);

  const titleIn = spring({ frame, fps, config: { damping: 13 } });
  const outroIn = spring({ frame: frame - Math.round(tl.outro_start * fps), fps, config: { damping: 11 } });
  const progress = Math.min(1, t / tl.audio_duration);
  const stageFilter = inRewind ? `grayscale(0.85) contrast(1.25) brightness(${1.05 + Math.sin(t * 40) * 0.05})` : undefined;

  return (
    <AbsoluteFill style={{ background: '#111' }}>
      <Audio src={staticFile(tl.audio)} />

      {panFrom >= 0 ? (
        <>
          <Stage tl={tl} si={panFrom} t={tl.scenes[panFrom].end} fps={fps} cam={cameraAt(tl, panFrom, tl.scenes[panFrom].end)}
            style={{ transform: `translateX(${-p * 1080}px)`, filter: `blur(${Math.sin(Math.PI * p) * 14}px)` }} />
          <Stage tl={tl} si={panFrom + 1} t={tl.scenes[panFrom + 1].start} fps={fps} cam={{ fx: 540, z: 1 }}
            style={{ transform: `translateX(${(1 - p) * 1080}px)`, filter: `blur(${Math.sin(Math.PI * p) * 14}px)` }} />
        </>
      ) : (
        <Stage tl={tl} si={si} t={tc} fps={fps} cam={cam}
          style={{ transform: `translate(${shakeX + (inRewind ? Math.sin(t * 73) * 10 : 0)}px, ${shakeY}px)`, filter: stageFilter }} />
      )}

      {/* cold open: dark red vignette = "something went wrong" */}
      {sc.role === 'hook' && !inRewind && (
        <AbsoluteFill style={{
          background: `radial-gradient(circle at 50% 55%, rgba(0,0,0,0) 45%, rgba(120,0,20,${0.35 + Math.sin(t * 6) * 0.08}) 100%)`,
        }} />
      )}
      {holding && (
        <AbsoluteFill>
          <AbsoluteFill style={{ background: `rgba(10,10,25,${Math.min(0.38, (t - hk!.hold_start!) * 1.2)})` }} />
          <div style={{
            position: 'absolute', top: 1080, width: '100%', textAlign: 'center', fontFamily: 'Luckiest Guy', fontSize: 190,
            color: '#e63946', WebkitTextStroke: `16px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 12px 0 ${INK}`,
            transform: `rotate(8deg) scale(${spring({ frame: frame - Math.round(hk!.hold_start! * fps), fps, config: { damping: 7, stiffness: 240 } })})`,
          }}>
            ?!
          </div>
        </AbsoluteFill>
      )}
      {inRewind && (
        <AbsoluteFill>
          <AbsoluteFill style={{ background: 'repeating-linear-gradient(0deg, rgba(0,0,0,0.16) 0 3px, rgba(0,0,0,0) 3px 7px)' }} />
          <div style={{ position: 'absolute', top: (t * 1400) % 1920, left: 0, right: 0, height: 60, background: 'rgba(255,255,255,0.18)', filter: 'blur(4px)' }} />
          <svg width={1080} height={1920} style={{ position: 'absolute', inset: 0 }}>
            <g transform={`translate(540 560) scale(${1 + Math.sin(t * 18) * 0.05})`} opacity={0.92}>
              <path d="M-10 -70 L-130 0 L-10 70 Z M120 -70 L0 0 L120 70 Z" fill="#fff" stroke={INK} strokeWidth={10} strokeLinejoin="round" />
            </g>
          </svg>
          <div style={{
            position: 'absolute', top: 660, width: '100%', textAlign: 'center', fontFamily: 'Luckiest Guy', fontSize: 110,
            color: '#ffd166', WebkitTextStroke: `13px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 10px 0 ${INK}`,
            transform: `scale(${spring({ frame: frame - Math.round(hk!.end * fps), fps, config: { damping: 9, stiffness: 200 } })}) rotate(-3deg)`,
          }}>
            {hk!.caption}
          </div>
        </AbsoluteFill>
      )}
      {hk && t >= hk.main_start && t < hk.main_start + 0.18 && (
        <AbsoluteFill style={{ background: '#fff', opacity: 1 - (t - hk.main_start) / 0.18 }} />
      )}

      {/* title */}
      <div style={{ position: 'absolute', top: 118, left: 50, right: 50, textAlign: 'center', opacity: sc.role === 'hook' || isOpeningCard ? 0 : 1, transform: `translateY(${(1 - (hk ? spring({ frame: frame - Math.round(hk.main_start * fps), fps, config: { damping: 13 } }) : titleIn)) * -260}px)` }}>
        <div style={{
          fontFamily: 'Luckiest Guy', fontSize: 80, lineHeight: 1.0, color: '#fff', textWrap: 'balance' as any,
          WebkitTextStroke: `11px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 10px 0 ${INK}`,
        }}>
          {tl.title}
        </div>
      </div>

      {/* scene label */}
      {sc.role === 'scene' && sc.caption && panFrom < 0 && t < sc.start + 2.2 && !isOpeningCard && (
        <div style={{
          position: 'absolute', top: 250, left: 0, right: 0, textAlign: 'center',
          opacity: interpolate(t, [sc.start + 1.8, sc.start + 2.2], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          transform: `translateY(${(1 - spring({ frame: frame - Math.round(sc.start * fps), fps, config: { damping: 12 } })) * -40}px)`,
        }}>
          <span style={{
            display: 'inline-block', background: INK, color: '#ffd166', fontFamily: 'Luckiest Guy', fontSize: 40,
            letterSpacing: 2, padding: '10px 24px 4px', borderRadius: 14, transform: 'rotate(-2deg)',
          }}>
            {sc.caption}
          </span>
        </div>
      )}

      {showHookCaption && hookSoFar.length > 0 && (
        <HookCaption lines={hookSoFar} t={t} frame={frame} fps={fps} holdUntil={isOpeningCard ? 1e9 : (hk ? hk.end : 1e9)} holding={holding && !isOpeningCard} />
      )}

      {showBubble && speakerFig && (
        <Bubble
          line={current!} t={t} frame={frame} fps={fps}
          accent={LOOKS[speakerFig.c.look]?.accent ?? '#e63e6d'}
          tail={toScreen(headTop(speakerFig.x, FLOOR_Y, speakerFig.c.scale, speakerFig.pose))}
        />
      )}

      {t > stingT && t < tl.outro_start + 0.2 && (
        <div style={{
          position: 'absolute', top: 1500, width: '100%', textAlign: 'center', fontFamily: 'Luckiest Guy',
          fontSize: 124, color: '#ffd166', WebkitTextStroke: `13px ${INK}`, paintOrder: 'stroke fill',
          transform: `rotate(-6deg) scale(${spring({ frame: frame - Math.round(stingT * fps), fps, config: { damping: 8, stiffness: 230 } })})`,
        }}>
          BA-DUM-TSS!
        </div>
      )}

      {t >= tl.outro_start && tl.series?.score && (
        <Scoreboard series={tl.series} t={t - tl.outro_start} frame={frame - Math.round(tl.outro_start * fps)} fps={fps} />
      )}
      {t >= tl.outro_start && !tl.series?.score && tl.outro && (
        <div style={{
          position: 'absolute', top: 430, left: 70, right: 70, padding: '30px 30px 34px',
          background: '#fff', borderRadius: 44, border: `8px solid ${INK}`, textAlign: 'center',
          transform: `scale(${outroIn}) rotate(${(1 - outroIn) * 8 - 1.5}deg)`, boxShadow: `0 16px 0 ${INK}`,
        }}>
          <div style={{
            display: 'inline-block', background: '#ffd166', color: INK, fontFamily: 'Luckiest Guy', fontSize: 40,
            letterSpacing: 2, padding: '8px 22px 2px', borderRadius: 14, transform: 'rotate(-2deg)', marginBottom: 20,
            border: `5px solid ${INK}`,
          }}>
            {tl.outro.label ?? 'SAY THIS'}
          </div>
          <div style={{
            fontFamily: 'Luckiest Guy', fontSize: 64, lineHeight: 1.08, color: '#e63946',
            WebkitTextStroke: `9px ${INK}`, paintOrder: 'stroke fill', textShadow: `0 7px 0 ${INK}`,
          }}>
            {tl.outro.text ?? 'Follow for more'}
          </div>
          {tl.outro.note && (
            <div style={{
              marginTop: 16, fontFamily: 'Nunito', fontWeight: 900, fontSize: 36, lineHeight: 1.25, color: INK,
            }}>
              {tl.outro.note}
            </div>
          )}
          {(tl.outro.follow || tl.series?.end_card) && (
            <div style={{
              marginTop: 22, display: 'inline-block', background: '#e63946', color: '#fff', fontFamily: 'Luckiest Guy',
              fontSize: 34, letterSpacing: 1, padding: '10px 18px 4px', borderRadius: 14, border: `5px solid ${INK}`,
            }}>
              {tl.outro.follow || tl.series?.end_card}
            </div>
          )}
        </div>
      )}

      {/* series badge: same corner, same look, every episode */}
      {tl.series?.name && (
        <div style={{
          position: 'absolute', top: 28, left: 28, display: 'flex', alignItems: 'center', gap: 10,
          background: '#ffd166', border: `5px solid ${INK}`, borderRadius: 16, padding: '8px 16px 2px',
          fontFamily: 'Luckiest Guy', fontSize: 42, color: INK, transform: 'rotate(-3deg)', boxShadow: `0 6px 0 ${INK}`,
        }}>
          {tl.series.name}{tl.series.episode ? <span style={{ color: '#e63946' }}>#{tl.series.episode}</span> : null}
        </div>
      )}

      <div style={{ position: 'absolute', top: 0, left: 0, height: 12, width: `${progress * 100}%`, background: '#ffd166', borderRight: `4px solid ${INK}` }} />
    </AbsoluteFill>
  );
};
