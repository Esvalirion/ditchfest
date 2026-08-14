// Registry of canvas formats the Sign Studio can render. Each entry maps a
// Nadeo advertisement sign aspect ratio to the pixel dimensions the renderer
// should produce. The studio's format selector is generated from this array
// via v-for, so adding a format is a new entry here — no renderer or UI edits
// needed beyond that (the renderer takes width/height as parameters).
//
// Nadeo's canonical naming is <width>x<height> (e.g. "4x1" = 4 wide, 1 tall).
// All standard advertisement signs share a fixed 512px height; only the width
// scales with the ratio. The `>` stencil mask (bckgrnask.png) and the base
// overlay (ditchfest_base.png) are authored at the native 4x1 size
// (2048x512); for other formats the renderer samples them in normalised
// coordinates (see renderArrowGradient / compositeBase in
// ../utils/gradientRenderer.js) so the `>` shape keeps its geometry.
export const FORMATS = [
  {
    kind: '1x1',
    label: '512×512 (1×1)',
    width: 512,
    height: 512,
    usage: 'Small square signs and panels — compact scenery billboards.',
  },
  {
    kind: '2x1',
    label: '1024×512 (2×1)',
    width: 1024,
    height: 512,
    usage: 'Standard wide billboards; also the size used by arrow / GPS signs.',
  },
  {
    kind: '4x1',
    label: '2048×512 (4×1)',
    width: 2048,
    height: 512,
    usage: 'Large billboards — the classic Ditchfest banner size.',
  },
  {
    kind: '6x1',
    label: '3072×512 (6×1)',
    width: 3072,
    height: 512,
    usage: 'The biggest banner blocks and trigger/arch blocks (rare).',
  },
];

export const DEFAULT_FORMAT_KIND = '4x1';

// Native dimensions of the mask/base assets. The renderer samples them in
// normalised space so a 1x1/2x1/6x1 canvas reuses the same artwork without
// distorting the `>` shape or the centred logo.
export const NATIVE_MASK_WIDTH = 2048;
export const NATIVE_MASK_HEIGHT = 512;

// Resolve a format kind to its descriptor, falling back to the default if the
// kind is unknown (defensive: a stale deep-link or bad state should never blank
// the canvas).
export function findFormat(kind) {
  return (
    FORMATS.find((f) => f.kind === kind) ||
    FORMATS.find((f) => f.kind === DEFAULT_FORMAT_KIND)
  );
}
