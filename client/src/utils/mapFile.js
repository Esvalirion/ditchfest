// Direct .Map.Gbx download, served by our own GET /api/map/:uid/file (it
// streams Nadeo's file with a proper "<name>.Map.Gbx" filename). Same-origin,
// so the <a download> attribute works.
export function mapFileUrl(mapUid) {
  return `/api/map/${encodeURIComponent(mapUid)}/file`;
}
