import React from 'react';
import { Composition } from 'remotion';
import { SkitVideo, Timeline } from './SkitVideo';

// Default props let `remotion studio` preview an empty stage; render.mjs overrides them.
const empty: Timeline = {
  id: 'empty', title: 'Run skit_tts.py first', fps: 30, audio: '', audio_duration: 1,
  duration_in_frames: 60, lead_in: 0, characters: {}, lines: [], outro_start: 1, scenes: [], transitions: [],
};

export const RemotionRoot: React.FC = () => (
  <Composition
    id="SkitVideo"
    component={SkitVideo}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={60}
    defaultProps={{ timeline: empty }}
    calculateMetadata={({ props }) => ({ durationInFrames: props.timeline.duration_in_frames, fps: props.timeline.fps })}
  />
);
