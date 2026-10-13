import React from 'react';

export const FLOOR_Y = 1470;
const INK = '#1f2233';

export const LivingRoom: React.FC = () => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
    <defs>
      <linearGradient id="wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#ffe9cc" />
        <stop offset="1" stopColor="#f7d6ae" />
      </linearGradient>
      <linearGradient id="floor" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#d4925c" />
        <stop offset="1" stopColor="#b5713f" />
      </linearGradient>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fd3f4" />
        <stop offset="1" stopColor="#e3f6ff" />
      </linearGradient>
      <radialGradient id="light" cx="0.78" cy="0.42" r="0.6">
        <stop offset="0" stopColor="rgba(255,255,255,0.45)" />
        <stop offset="1" stopColor="rgba(255,255,255,0)" />
      </radialGradient>
      <radialGradient id="vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.62" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(70,30,0,0.30)" />
      </radialGradient>
      <linearGradient id="ao" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="rgba(80,40,10,0)" />
        <stop offset="1" stopColor="rgba(80,40,10,0.18)" />
      </linearGradient>
    </defs>

    <rect width="1080" height="1920" fill="url(#wall)" />
    {/* wallpaper dots */}
    {Array.from({ length: 13 }).map((_, r) =>
      Array.from({ length: 9 }).map((__, c) => (
        <circle key={`${r}-${c}`} cx={60 + c * 120 + (r % 2) * 60} cy={60 + r * 110} r={6} fill="rgba(214,150,90,0.18)" />
      )),
    )}
    <rect y={FLOOR_Y - 120} width="1080" height="120" fill="url(#ao)" />

    {/* window */}
    <g transform="translate(700 760)">
      <rect x="-16" y="-16" width="312" height="372" rx="18" fill="#fffdf8" stroke={INK} strokeWidth="6" />
      <rect width="280" height="340" rx="8" fill="url(#sky)" />
      <circle cx="200" cy="80" r="34" fill="#ffe08a" />
      <path d="M30 170 q20 -28 48 -10 q20 -22 44 0 q24 2 20 24 h-112 z" fill="#fff" />
      <path d="M140 0 v340 M0 170 h280" stroke="#fffdf8" strokeWidth="14" />
      <path d="M-40 -30 q40 160 0 420" stroke="#ef476f" strokeWidth="0" />
      <path d="M-30 -30 h70 q-30 200 -10 420 h-60 z" fill="#ef8a6f" opacity="0.9" />
    </g>

    {/* frames */}
    <g transform="translate(120 760) rotate(-3)">
      <rect width="190" height="140" rx="10" fill="#fffdf8" stroke={INK} strokeWidth="6" />
      <rect x="16" y="16" width="158" height="108" rx="4" fill="#ffd6a5" />
      <path d="M16 124 L66 60 L102 100 L130 78 L174 124 Z" fill="#83c5be" />
    </g>
    <g transform="translate(360 700) rotate(4)">
      <rect width="120" height="150" rx="10" fill="#fffdf8" stroke={INK} strokeWidth="6" />
      <circle cx="60" cy="62" r="28" fill="#ffb4a2" />
      <path d="M22 134 q38 -50 76 0" fill="#ffb4a2" />
    </g>

    {/* couch */}
    <g transform={`translate(250 ${FLOOR_Y - 270})`}>
      <rect x="0" y="40" width="580" height="170" rx="40" fill="#5c9e8f" stroke={INK} strokeWidth="7" />
      <rect x="40" y="130" width="250" height="90" rx="24" fill="#6fb7a6" stroke={INK} strokeWidth="6" />
      <rect x="290" y="130" width="250" height="90" rx="24" fill="#6fb7a6" stroke={INK} strokeWidth="6" />
      <rect x="-30" y="100" width="80" height="150" rx="30" fill="#5c9e8f" stroke={INK} strokeWidth="7" />
      <rect x="530" y="100" width="80" height="150" rx="30" fill="#5c9e8f" stroke={INK} strokeWidth="7" />
      <rect x="400" y="80" width="90" height="70" rx="20" fill="#ffd166" stroke={INK} strokeWidth="6" transform="rotate(10 445 115)" />
      <path d="M30 250 v20 M550 250 v20" stroke={INK} strokeWidth="12" strokeLinecap="round" />
    </g>

    {/* lamp */}
    <g transform={`translate(70 ${FLOOR_Y - 420})`}>
      <path d="M-14 100 L74 100 L56 0 L4 0 Z" fill="#ffd166" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <rect x="26" y="100" width="10" height="310" fill={INK} />
      <ellipse cx="31" cy="414" rx="40" ry="10" fill={INK} />
    </g>

    {/* plant */}
    <g transform={`translate(985 ${FLOOR_Y - 160})`}>
      <path d="M0 0 q-60 -80 -20 -150 M0 0 q10 -100 40 -170 M0 0 q40 -60 70 -80 M0 0 q-30 -40 -80 -40" stroke="#2a9d8f" strokeWidth="20" fill="none" strokeLinecap="round" />
      <path d="M-50 0 h100 l-14 160 h-72 z" fill="#e76f51" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
    </g>

    {/* floor */}
    <rect y={FLOOR_Y} width="1080" height={1920 - FLOOR_Y} fill="url(#floor)" />
    <rect y={FLOOR_Y - 16} width="1080" height="22" fill="#fff3e2" stroke={INK} strokeWidth="5" />
    {Array.from({ length: 7 }).map((_, i) => (
      <path key={i} d={`M0 ${FLOOR_Y + 66 + i * 70} H1080`} stroke="rgba(90,45,15,0.2)" strokeWidth="4" />
    ))}
    <ellipse cx="540" cy={FLOOR_Y + 46} rx="460" ry="60" fill="#f4a582" stroke="rgba(31,34,51,0.25)" strokeWidth="5" />
    <rect width="1080" height="1920" fill="url(#light)" />
    <rect width="1080" height="1920" fill="url(#vig)" />
  </svg>
);

export const Park: React.FC = () => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
    <defs>
      <linearGradient id="pk-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#7cc8f2" />
        <stop offset="1" stopColor="#d6f1ff" />
      </linearGradient>
      <linearGradient id="pk-grass" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#8fd16a" />
        <stop offset="1" stopColor="#5fae4a" />
      </linearGradient>
      <radialGradient id="pk-vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.62" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(0,40,60,0.25)" />
      </radialGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#pk-sky)" />
    <circle cx="860" cy="560" r="80" fill="#ffe08a" />
    <circle cx="860" cy="560" r="120" fill="#ffe08a" opacity="0.25" />
    {[[170, 520, 1], [520, 640, 0.8], [880, 820, 0.7]].map(([x, y, k], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${k})`} opacity="0.95">
        <path d="M-90 30 q0 -50 50 -46 q20 -46 70 -30 q50 -20 70 30 q40 4 30 46 z" fill="#fff" />
      </g>
    ))}
    <path d={`M0 ${FLOOR_Y - 260} q200 -120 420 -30 q220 -110 420 -10 q140 -50 240 10 V${FLOOR_Y} H0 Z`} fill="#a9dc8a" />
    <path d={`M0 ${FLOOR_Y - 160} q260 -90 540 -10 q260 -80 540 0 V${FLOOR_Y} H0 Z`} fill="#93cf74" />
    {/* trees */}
    {[[110, FLOOR_Y - 120, 1.1], [980, FLOOR_Y - 140, 1.25], [640, FLOOR_Y - 240, 0.7]].map(([x, y, k], i) => (
      <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
        <rect x="-16" y="-40" width="32" height="160" rx="10" fill="#8a5a3b" stroke={INK} strokeWidth="6" />
        <circle cx="0" cy="-120" r="110" fill="#4caf6a" stroke={INK} strokeWidth="7" />
        <circle cx="-50" cy="-150" r="40" fill="#5fc27d" />
      </g>
    ))}
    {/* ice cream cart */}
    <g transform={`translate(-10 ${FLOOR_Y - 330}) scale(0.72)`}>
      <path d="M-20 -200 L180 -200 L80 -270 Z" fill="#ff8fab" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
      <path d="M-20 -200 L180 -200" stroke={INK} strokeWidth="6" />
      <rect x="76" y="-200" width="8" height="100" fill={INK} />
      <rect x="0" y="-100" width="160" height="150" rx="16" fill="#fff4e6" stroke={INK} strokeWidth="6" />
      <text x="80" y="-30" textAnchor="middle" fontFamily="Luckiest Guy" fontSize="34" fill="#ff5d8f">ICE</text>
      <text x="80" y="10" textAnchor="middle" fontFamily="Luckiest Guy" fontSize="34" fill="#ff5d8f">CREAM</text>
      <circle cx="30" cy="70" r="26" fill="#fff" stroke={INK} strokeWidth="6" />
      <circle cx="130" cy="70" r="26" fill="#fff" stroke={INK} strokeWidth="6" />
    </g>
    {/* bench */}
    <g transform={`translate(560 ${FLOOR_Y - 120})`}>
      <rect x="0" y="0" width="300" height="26" rx="8" fill="#c98b58" stroke={INK} strokeWidth="6" />
      <rect x="0" y="-60" width="300" height="24" rx="8" fill="#c98b58" stroke={INK} strokeWidth="6" />
      <path d="M30 26 v90 M270 26 v90" stroke={INK} strokeWidth="12" strokeLinecap="round" />
    </g>
    <rect y={FLOOR_Y} width="1080" height={1920 - FLOOR_Y} fill="url(#pk-grass)" />
    <path d={`M300 ${FLOOR_Y} Q540 ${FLOOR_Y + 120} 380 1920 H760 Q860 ${FLOOR_Y + 160} 780 ${FLOOR_Y} Z`} fill="#e9d3a6" opacity="0.9" />
    {Array.from({ length: 18 }).map((_, i) => (
      <path key={i} d={`M${(i * 137) % 1080} ${FLOOR_Y + 60 + ((i * 53) % 380)} l6 -18 l6 18`} stroke="#3f8f3a" strokeWidth="5" fill="none" strokeLinecap="round" />
    ))}
    <rect width="1080" height="1920" fill="url(#pk-vig)" />
  </svg>
);

export const Office: React.FC = () => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
    <defs>
      <linearGradient id="of-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#e3ecf5" />
        <stop offset="1" stopColor="#cfdcea" />
      </linearGradient>
      <linearGradient id="of-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#9fd3f7" />
        <stop offset="1" stopColor="#e6f5ff" />
      </linearGradient>
      <radialGradient id="of-vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.62" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(20,30,60,0.28)" />
      </radialGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#of-wall)" />
    {/* big window with skyline */}
    <g transform="translate(90 640)">
      <rect x="-14" y="-14" width="928" height="448" rx="14" fill="#fff" stroke={INK} strokeWidth="6" />
      <rect width="900" height="420" fill="url(#of-sky)" />
      {[[30, 220, 90], [140, 150, 70], [230, 260, 110], [370, 120, 80], [470, 200, 100], [600, 90, 90], [710, 230, 70], [800, 170, 90]].map(([x, y, w], i) => (
        <g key={i}>
          <rect x={x} y={y} width={w} height={420 - y} fill={i % 2 ? '#8fa9c7' : '#a7bdd6'} />
          {Array.from({ length: Math.floor((420 - y) / 40) }).map((__, r) => (
            <rect key={r} x={x + 14} y={y + 16 + r * 40} width={w - 28} height="14" fill="rgba(255,255,255,0.45)" />
          ))}
        </g>
      ))}
      <path d="M300 0 v420 M600 0 v420" stroke="#fff" strokeWidth="14" />
    </g>
    {/* clock */}
    <g transform="translate(540 520)">
      <circle r="58" fill="#fff" stroke={INK} strokeWidth="7" />
      <path d="M0 0 V-36 M0 0 L26 10" stroke={INK} strokeWidth="7" strokeLinecap="round" />
    </g>
    {/* desk with monitor */}
    <g transform={`translate(330 ${FLOOR_Y - 210})`}>
      <rect x="120" y="-170" width="200" height="130" rx="12" fill="#2f3b52" stroke={INK} strokeWidth="6" />
      <rect x="134" y="-156" width="172" height="102" rx="6" fill="#7fd1ff" />
      <rect x="210" y="-40" width="20" height="40" fill={INK} />
      <rect x="0" y="0" width="440" height="34" rx="8" fill="#b88457" stroke={INK} strokeWidth="6" />
      <rect x="20" y="34" width="120" height="176" fill="#a87448" stroke={INK} strokeWidth="6" />
      <path d="M420 34 v176" stroke={INK} strokeWidth="12" strokeLinecap="round" />
      <rect x="350" y="-44" width="34" height="44" rx="6" fill="#ef476f" stroke={INK} strokeWidth="5" />
    </g>
    {/* water cooler */}
    <g transform={`translate(950 ${FLOOR_Y - 330})`}>
      <rect x="-40" y="0" width="80" height="110" rx="20" fill="#bfe6ff" stroke={INK} strokeWidth="6" />
      <rect x="-50" y="110" width="100" height="220" rx="10" fill="#f4f6f8" stroke={INK} strokeWidth="6" />
    </g>
    {/* plant */}
    <g transform={`translate(110 ${FLOOR_Y - 160})`}>
      <path d="M0 0 q-50 -70 -10 -150 M0 0 q20 -90 50 -160 M0 0 q40 -40 80 -60" stroke="#2a9d8f" strokeWidth="20" fill="none" strokeLinecap="round" />
      <path d="M-46 0 h92 l-12 160 h-68 z" fill="#577590" stroke={INK} strokeWidth="6" strokeLinejoin="round" />
    </g>
    <rect y={FLOOR_Y} width="1080" height={1920 - FLOOR_Y} fill="#8d99ae" />
    <rect y={FLOOR_Y - 14} width="1080" height="18" fill="#f4f6f8" stroke={INK} strokeWidth="5" />
    {Array.from({ length: 9 }).map((_, i) => (
      <path key={i} d={`M${i * 140} ${FLOOR_Y} L${i * 140 - 200} 1920`} stroke="rgba(31,34,51,0.12)" strokeWidth="4" />
    ))}
    <rect width="1080" height="1920" fill="url(#of-vig)" />
  </svg>
);

export const Classroom: React.FC<{ board?: string }> = ({ board }) => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
    <defs>
      <linearGradient id="cr-wall" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#fff3d6" />
        <stop offset="1" stopColor="#f6dfb3" />
      </linearGradient>
      <radialGradient id="cr-vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.62" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(70,40,0,0.28)" />
      </radialGradient>
    </defs>
    <rect width="1080" height="1920" fill="url(#cr-wall)" />
    <rect y={FLOOR_Y - 300} width="1080" height="300" fill="#e9c98f" />
    <rect y={FLOOR_Y - 306} width="1080" height="12" fill="#c9a36a" />
    {/* chalkboard */}
    <g transform="translate(110 610)">
      <rect x="-22" y="-22" width="904" height="464" rx="16" fill="#a06a3f" stroke={INK} strokeWidth="7" />
      <rect width="860" height="420" rx="6" fill="#2f5d50" />
      <text x="430" y="150" textAnchor="middle" fontFamily="Luckiest Guy" fontSize="88" fill="rgba(255,255,255,0.9)">{board ?? 'A B C'}</text>
      <text x="620" y="320" fontFamily="Luckiest Guy" fontSize="56" fill="rgba(255,236,170,0.8)">2 + 2 = 4</text>
      <path d="M80 220 q60 -40 120 0 t120 0 M90 330 h200" stroke="rgba(255,255,255,0.55)" strokeWidth="7" fill="none" strokeLinecap="round" />
      <circle cx="420" cy="230" r="44" stroke="rgba(255,255,255,0.5)" strokeWidth="6" fill="none" />
      <rect x="40" y="420" width="780" height="20" rx="6" fill="#a06a3f" stroke={INK} strokeWidth="5" />
      <rect x="120" y="408" width="60" height="14" rx="4" fill="#fff" />
    </g>
    {/* clock */}
    <g transform="translate(540 470)">
      <circle r="52" fill="#fff" stroke={INK} strokeWidth="7" />
      <path d="M0 0 V-32 M0 0 L24 10" stroke={INK} strokeWidth="7" strokeLinecap="round" />
    </g>
    {/* alphabet bunting */}
    {['A', 'B', 'C', 'D', 'E', 'F'].map((ch, i) => (
      <g key={ch} transform={`translate(${130 + i * 160} 1110)`}>
        <path d="M-50 0 L50 0 L0 80 Z" fill={['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f78c6b', '#9b5de5'][i]} stroke={INK} strokeWidth="5" strokeLinejoin="round" />
        <text x="0" y="40" textAnchor="middle" fontFamily="Luckiest Guy" fontSize="38" fill="#fff">{ch}</text>
      </g>
    ))}
    <path d="M60 1110 Q540 1150 1020 1110" stroke={INK} strokeWidth="4" fill="none" />
    {/* teacher desk */}
    <g transform={`translate(640 ${FLOOR_Y - 200})`}>
      <rect x="0" y="0" width="380" height="36" rx="8" fill="#b5835a" stroke={INK} strokeWidth="6" />
      <rect x="20" y="36" width="340" height="164" fill="#a87448" stroke={INK} strokeWidth="6" />
      <circle cx="320" cy="-24" r="24" fill="#e63946" stroke={INK} strokeWidth="5" />
      <path d="M320 -48 q6 -14 18 -14" stroke="#2a9d8f" strokeWidth="6" fill="none" strokeLinecap="round" />
      <rect x="60" y="-30" width="120" height="30" rx="4" fill="#ffd166" stroke={INK} strokeWidth="5" />
      <rect x="70" y="-56" width="100" height="26" rx="4" fill="#4cc9f0" stroke={INK} strokeWidth="5" />
    </g>
    {/* student desk */}
    <g transform={`translate(40 ${FLOOR_Y - 140})`}>
      <rect x="0" y="0" width="220" height="26" rx="6" fill="#ffd166" stroke={INK} strokeWidth="6" />
      <path d="M24 26 v114 M196 26 v114" stroke={INK} strokeWidth="10" strokeLinecap="round" />
    </g>
    <rect y={FLOOR_Y} width="1080" height={1920 - FLOOR_Y} fill="#c8d3df" />
    {Array.from({ length: 8 }).map((_, i) => (
      <path key={i} d={`M0 ${FLOOR_Y + 60 + i * 60} H1080`} stroke="rgba(31,34,51,0.1)" strokeWidth="4" />
    ))}
    <rect y={FLOOR_Y - 14} width="1080" height="18" fill="#8d6a4b" stroke={INK} strokeWidth="5" />
    <rect width="1080" height="1920" fill="url(#cr-vig)" />
  </svg>
);

export const Kitchen: React.FC = () => (
  <svg width={1080} height={1920} viewBox="0 0 1080 1920" style={{ position: 'absolute', inset: 0 }}>
    <defs>
      <pattern id="kt-tiles" width="80" height="60" patternUnits="userSpaceOnUse">
        <rect width="80" height="60" fill="#e6f4f1" />
        <path d="M0 0 H80 M0 0 V60" stroke="#bcdcd6" strokeWidth="4" />
      </pattern>
      <pattern id="kt-floor" width="120" height="120" patternUnits="userSpaceOnUse">
        <rect width="120" height="120" fill="#f1e3c8" />
        <rect width="60" height="60" fill="#d9c49d" />
        <rect x="60" y="60" width="60" height="60" fill="#d9c49d" />
      </pattern>
      <radialGradient id="kt-vig" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.62" stopColor="rgba(0,0,0,0)" />
        <stop offset="1" stopColor="rgba(60,40,10,0.28)" />
      </radialGradient>
    </defs>
    <rect width="1080" height="1920" fill="#fff4dc" />
    <rect y="820" width="1080" height={FLOOR_Y - 820} fill="url(#kt-tiles)" />
    {/* upper cabinets */}
    {[0, 1, 2].map((i) => (
      <g key={i} transform={`translate(${380 + i * 230} 560)`}>
        <rect width="210" height="240" rx="12" fill="#7fb7be" stroke={INK} strokeWidth="6" />
        <circle cx={i % 2 ? 30 : 180} cy="200" r="9" fill={INK} />
      </g>
    ))}
    {/* window */}
    <g transform="translate(70 600)">
      <rect x="-12" y="-12" width="244" height="324" rx="12" fill="#fff" stroke={INK} strokeWidth="6" />
      <rect width="220" height="300" fill="#bfe6ff" />
      <path d="M110 0 v300 M0 150 h220" stroke="#fff" strokeWidth="12" />
      <path d="M-30 -30 h280 v40 q-140 30 -280 0 z" fill="#ef476f" stroke={INK} strokeWidth="5" />
    </g>
    {/* fridge */}
    <g transform={`translate(20 ${FLOOR_Y - 520})`}>
      <rect width="200" height="520" rx="22" fill="#f4f6f8" stroke={INK} strokeWidth="7" />
      <path d="M0 190 H200" stroke={INK} strokeWidth="6" />
      <rect x="160" y="80" width="12" height="80" rx="6" fill={INK} />
      <rect x="160" y="230" width="12" height="120" rx="6" fill={INK} />
      <rect x="40" y="260" width="70" height="90" fill="#fff" stroke={INK} strokeWidth="4" transform="rotate(-6 75 305)" />
      <text x="62" y="325" fontFamily="Luckiest Guy" fontSize="46" fill="#e63946" transform="rotate(-6 75 305)">A+</text>
    </g>
    {/* counter + stove */}
    <g transform={`translate(330 ${FLOOR_Y - 300})`}>
      <rect x="0" y="0" width="760" height="40" rx="8" fill="#f4f6f8" stroke={INK} strokeWidth="6" />
      <rect x="10" y="40" width="740" height="260" fill="#7fb7be" stroke={INK} strokeWidth="6" />
      {[0, 1, 2].map((i) => <rect key={i} x={30 + i * 240} y={70} width={200} height={200} rx={10} fill="#8fc5cb" stroke={INK} strokeWidth="5" />)}
      <ellipse cx="560" cy="-6" rx="90" ry="14" fill={INK} />
      <path d="M500 -10 h120 v-70 q0 -20 -20 -20 h-80 q-20 0 -20 20 z" fill="#e76f51" stroke={INK} strokeWidth="6" />
      <path d="M520 -110 q10 -20 0 -40 M560 -110 q10 -20 0 -40" stroke="rgba(31,34,51,0.35)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M200 -50 h80 l-10 50 h-60 z" fill="#ffd166" stroke={INK} strokeWidth="5" />
    </g>
    <rect y={FLOOR_Y} width="1080" height={1920 - FLOOR_Y} fill="url(#kt-floor)" />
    <rect y={FLOOR_Y - 10} width="1080" height="14" fill="#8d6a4b" stroke={INK} strokeWidth="5" />
    <rect width="1080" height="1920" fill="url(#kt-vig)" />
  </svg>
);

export const BACKGROUNDS: Record<string, React.FC<{ board?: string }>> = {
  living_room: LivingRoom,
  park: Park,
  office: Office,
  classroom: Classroom,
  kitchen: Kitchen,
};
