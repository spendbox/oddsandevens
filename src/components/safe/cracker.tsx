"use client";

// Boxy, in profile, with his hands on the wheel.
//
// Every other drawing of him faces you. This one cannot: he is working on
// something, and a character facing the camera while operating a machine
// behind him reads as a mascot standing next to a prop. So he is side-on,
// braced, both arms out to the wheel, and the whole point of the pose is that
// you can see him *pulling*.
//
// He is rigged rather than drawn once. Body, head, two arms and two legs are
// separate groups with their own pivots, and the four states below move them
// against each other:
//
//   idle     breathing, weight on the back foot, hands resting on the wheel
//   working  hauling the wheel round — arms pumping out of phase, body leaning
//            into it, back leg driving, head down
//   fail     the wheel doesn't give. Hands come off, a stamp, a shake of the
//            head. This is the state that had to look like something, because
//            it is the one a player sees hundreds of times.
//   won      it opens. Arms up, off the ground.
//
// Every pivot is set with `transform-box: fill-box`, without which an SVG
// group rotates about the origin of the whole canvas and the arms take off
// across the screen.

export type CrackerState = "idle" | "working" | "fail" | "won";

export function Cracker({
  state = "idle",
  className = "",
}: {
  state?: CrackerState;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 150 170"
      className={`cracker cracker-${state} ${className}`}
      role="img"
      aria-label={
        state === "working"
          ? "Boxy hauling on the vault wheel"
          : state === "fail"
            ? "Boxy, and the wheel will not turn"
            : state === "won"
              ? "Boxy celebrating an open vault"
              : "Boxy at the vault wheel"
      }
    >
      <defs>
        <linearGradient id="cr-body" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd76e" />
          <stop offset="1" stopColor="#d98d16" />
        </linearGradient>
        <linearGradient id="cr-face" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3a2b70" />
          <stop offset="1" stopColor="#1b1338" />
        </linearGradient>
        <linearGradient id="cr-limb" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffcf5c" />
          <stop offset="1" stopColor="#c67f10" />
        </linearGradient>
      </defs>

      {/* Contact shadow. Drawn first and never moved, so the character can
          leave the ground without dragging the floor with him. */}
      <ellipse className="cr-shadow" cx="62" cy="163" rx="34" ry="6" fill="#000" opacity="0.45" />

      {/* Everything that leaves the ground together. */}
      <g className="cr-hop">
        {/* The far leg, drawn behind the body and a shade darker so the two
            read as depth rather than as one thick limb. */}
        <g className="cr-leg-back">
          <rect x="44" y="112" width="15" height="36" rx="7.5" fill="#b8760e" stroke="#150e2b" strokeWidth="3" />
          <rect x="38" y="142" width="27" height="14" rx="7" fill="#a2680c" stroke="#150e2b" strokeWidth="3" />
        </g>

        <g className="cr-leg-front">
          <rect x="66" y="112" width="16" height="36" rx="8" fill="url(#cr-limb)" stroke="#150e2b" strokeWidth="3" />
          <rect x="62" y="142" width="30" height="15" rx="7.5" fill="#c67f10" stroke="#150e2b" strokeWidth="3" />
        </g>

        {/* The far arm, behind the body. */}
        <g className="cr-arm-back">
          <path
            d="M86 74 C 104 72 118 66 130 62"
            fill="none"
            stroke="#b8760e"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <circle cx="132" cy="61" r="9" fill="#b8760e" stroke="#150e2b" strokeWidth="3" />
        </g>

        <g className="cr-body">
          {/* Torso — the safe he is, seen side-on: narrower than face-on, and
              the door furniture is on the far side where you cannot see it. */}
          <rect x="30" y="38" width="62" height="80" rx="20" fill="url(#cr-body)" stroke="#150e2b" strokeWidth="4" />

          {/* Gloss along the top, the house rule for anything with a face. */}
          <path
            d="M40 46 h42 a12 12 0 0 1 6 10 v6 h-54 v-6 a12 12 0 0 1 6 -10 z"
            fill="#fff"
            opacity="0.3"
          />

          {/* Hinges on the trailing edge, so he reads as a safe from behind
              as well as in front. */}
          <rect x="27" y="52" width="7" height="16" rx="3.5" fill="#e8ae3c" stroke="#150e2b" strokeWidth="2.5" />
          <rect x="27" y="88" width="7" height="16" rx="3.5" fill="#e8ae3c" stroke="#150e2b" strokeWidth="2.5" />

          <g className="cr-head">
            {/* Face plate, pushed to the leading edge — he is looking at the
                wheel, which is the only thing he is interested in. */}
            <rect x="52" y="52" width="40" height="34" rx="12" fill="url(#cr-face)" stroke="#150e2b" strokeWidth="3" />

            {/* One eye, because this is a profile. Two would make him a
                flounder. */}
            <circle className="cr-eye" cx="80" cy="66" r="5.5" fill="#fdf7ff" />
            <circle className="cr-pupil" cx="82" cy="66" r="2.6" fill="#150e2b" />

            {/* The brow does most of the acting: level at rest, down and angled
                while he strains, high and slack when he gives up. */}
            <rect className="cr-brow" x="72" y="56" width="17" height="4" rx="2" fill="#fdf7ff" opacity="0.9" />

            {/* Mouth. A short line at rest, an open grimace under load. */}
            <rect className="cr-mouth" x="72" y="76" width="12" height="3.5" rx="1.75" fill="#fdf7ff" opacity="0.85" />
          </g>

          {/* The dial on his chest, which is also a belt buckle. */}
          <circle cx="61" cy="100" r="9" fill="#fff3d1" stroke="#150e2b" strokeWidth="3" />
          <rect x="59.5" y="93" width="3" height="7" rx="1.5" fill="#150e2b" />
        </g>

        {/* The near arm, in front of the body. Same reach, opposite phase. */}
        <g className="cr-arm-front">
          <path
            d="M84 84 C 104 84 118 78 130 72"
            fill="none"
            stroke="url(#cr-limb)"
            strokeWidth="13"
            strokeLinecap="round"
          />
          <circle cx="132" cy="71" r="10" fill="#ffcf5c" stroke="#150e2b" strokeWidth="3" />
        </g>

        {/* Frustration marks. Only drawn in the fail state — a puff of steam
            off the top of his head, which is the oldest joke in animation and
            still the one that reads fastest at 40px. */}
        <g className="cr-steam">
          <circle cx="46" cy="30" r="6" fill="#fff" opacity="0.5" />
          <circle cx="34" cy="20" r="4.5" fill="#fff" opacity="0.4" />
          <circle cx="24" cy="12" r="3" fill="#fff" opacity="0.3" />
        </g>

        {/* Celebration sparks, for the once-per-box moment. */}
        <g className="cr-spark">
          <path d="M28 34 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3 z" fill="var(--brass)" />
          <path d="M112 26 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2 z" fill="var(--brass-bright)" />
        </g>
      </g>
    </svg>
  );
}
