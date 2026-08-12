// Registry of gradient "kinds" the Sign Studio can render. Each entry
// describes what the user picks in the dropdown and how the renderer is
// parameterised for it.
//
// Today there is one kind ("arrow", the `>`-shaped stencil background). Adding
// another is mostly a new entry here plus — if its rendering differs
// structurally — a render function in gradientRenderer.js dispatched on `kind`.
//
// `stops` is an array of { key, label, default } where:
//   - key    — stable identifier passed to the renderer as options[stop.key]
//   - label  — short UI label next to the colour picker
//   - default — HEX colour used on first load and as the renderer's fallback
//
// Grouped under `groups` purely for UI layout: each group renders as a
// <fieldset> with the given legend, containing the stops in order.

export const GRADIENTS = [
  {
    kind: 'arrow',
    label: 'Classic',
    description: '`>`-shaped mask, two halves each with a left→right gradient.',
    groups: [
      {
        legend: 'Left side',
        stops: [
          { key: 'right1', label: 'Left', default: '#6c6c6c' },
          { key: 'right2', label: 'Right', default: '#2e2e2e' },
        ],
      },
      {
        legend: 'Right side',
        stops: [
          { key: 'left1', label: 'Left', default: '#1a1a1a' },
          { key: 'left2', label: 'Right', default: '#030303' },
        ],
      },
    ],
  },
  {
    kind: 'linear',
    label: 'Linear',
    description: 'Plain left→right gradient across the whole canvas.',
    groups: [
      {
        legend: 'Stops',
        stops: [
          { key: 'c1', label: 'Left', default: '#6c6c6c' },
          { key: 'c2', label: 'Center', default: '#2e2e2e' },
          { key: 'c3', label: 'Right', default: '#030303' },
        ],
      },
    ],
  },
];

export const DEFAULT_GRADIENT_KIND = GRADIENTS[0].kind;

// Flatten a gradient's stops into { key: defaultHex } — handy for initialising
// the reactive colour state when the user switches gradient kinds.
export function defaultColorsFor(kind) {
  const g = GRADIENTS.find((x) => x.kind === kind);
  if (!g) return {};
  const out = {};
  for (const grp of g.groups) {
    for (const st of grp.stops) out[st.key] = st.default;
  }
  return out;
}
