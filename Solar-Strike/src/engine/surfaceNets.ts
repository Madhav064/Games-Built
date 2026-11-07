// Naive Surface Nets mesher for a signed field (value > 0 = solid).
// Produces one vertex per surface cell and one quad per sign-changing edge,
// giving smooth, watertight meshes that look good when carved.

export interface MeshData {
  /** Vertex positions in grid (sample) coordinates. */
  positions: Float32Array;
  /** Smooth normals from the field gradient. */
  normals: Float32Array;
  /** Nearest field sample index for each vertex (used for heat lookups). */
  sampleIndex: Int32Array;
  indices: Uint32Array;
  vertexCount: number;
}

// Corner offsets (x, y, z) for corners 0..7.
const CX = [0, 1, 0, 1, 0, 1, 0, 1];
const CY = [0, 0, 1, 1, 0, 0, 1, 1];
const CZ = [0, 0, 0, 0, 1, 1, 1, 1];
// 12 cube edges as corner pairs.
const EDGES = [0, 1, 2, 3, 4, 5, 6, 7, 0, 2, 1, 3, 4, 6, 5, 7, 0, 4, 1, 5, 2, 6, 3, 7];

/**
 * Mesh the edges owned by the box [x0,x1) x [y0,y1) x [z0,z1) of the field.
 * Neighbouring boxes produce seamless meshes because each edge is owned once.
 */
export function surfaceNets(
  field: Float32Array, nx: number, ny: number, nz: number,
  x0: number, y0: number, z0: number, x1: number, y1: number, z1: number,
): MeshData | null {
  const nxy = nx * ny;
  // Cells that may hold vertices: one extra on the low side for shared quads.
  const cx0 = Math.max(0, x0 - 1), cy0 = Math.max(0, y0 - 1), cz0 = Math.max(0, z0 - 1);
  const cx1 = Math.min(nx - 1, x1), cy1 = Math.min(ny - 1, y1), cz1 = Math.min(nz - 1, z1);
  const sx = cx1 - cx0, sy = cy1 - cy0, sz = cz1 - cz0;
  if (sx <= 0 || sy <= 0 || sz <= 0) return null;

  const cellVert = new Int32Array(sx * sy * sz).fill(-1);
  const pos: number[] = [];
  const nrm: number[] = [];
  const sidx: number[] = [];
  const v = new Float32Array(8);

  for (let z = cz0; z < cz1; z++) {
    for (let y = cy0; y < cy1; y++) {
      let i = cx0 + y * nx + z * nxy;
      for (let x = cx0; x < cx1; x++, i++) {
        v[0] = field[i]; v[1] = field[i + 1];
        v[2] = field[i + nx]; v[3] = field[i + 1 + nx];
        v[4] = field[i + nxy]; v[5] = field[i + 1 + nxy];
        v[6] = field[i + nx + nxy]; v[7] = field[i + 1 + nx + nxy];
        let mask = 0;
        for (let k = 0; k < 8; k++) if (v[k] > 0) mask |= 1 << k;
        if (mask === 0 || mask === 255) continue;

        let px = 0, py = 0, pz = 0, count = 0;
        for (let e = 0; e < 24; e += 2) {
          const a = EDGES[e], b = EDGES[e + 1];
          const va = v[a], vb = v[b];
          if ((va > 0) === (vb > 0)) continue;
          const t = va / (va - vb);
          px += CX[a] + (CX[b] - CX[a]) * t;
          py += CY[a] + (CY[b] - CY[a]) * t;
          pz += CZ[a] + (CZ[b] - CZ[a]) * t;
          count++;
        }
        px = x + px / count; py = y + py / count; pz = z + pz / count;

        // Gradient points into the solid; the outward normal is its negative.
        let gx = (v[1] - v[0]) + (v[3] - v[2]) + (v[5] - v[4]) + (v[7] - v[6]);
        let gy = (v[2] - v[0]) + (v[3] - v[1]) + (v[6] - v[4]) + (v[7] - v[5]);
        let gz = (v[4] - v[0]) + (v[5] - v[1]) + (v[6] - v[2]) + (v[7] - v[3]);
        const gl = Math.hypot(gx, gy, gz) || 1;
        gx = -gx / gl; gy = -gy / gl; gz = -gz / gl;

        cellVert[(x - cx0) + (y - cy0) * sx + (z - cz0) * sx * sy] = pos.length / 3;
        pos.push(px, py, pz);
        nrm.push(gx, gy, gz);
        sidx.push(Math.round(px) + Math.round(py) * nx + Math.round(pz) * nxy);
      }
    }
  }
  if (pos.length === 0) return null;

  const idx: number[] = [];
  const cell = (x: number, y: number, z: number) => {
    if (x < cx0 || y < cy0 || z < cz0 || x >= cx1 || y >= cy1 || z >= cz1) return -1;
    return cellVert[(x - cx0) + (y - cy0) * sx + (z - cz0) * sx * sy];
  };
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };

  const ex1 = Math.min(x1, nx), ey1 = Math.min(y1, ny), ez1 = Math.min(z1, nz);
  for (let z = z0; z < ez1; z++) {
    for (let y = y0; y < ey1; y++) {
      for (let x = x0; x < ex1; x++) {
        const i = x + y * nx + z * nxy;
        const s = field[i] > 0;
        if (x + 1 < nx && y > 0 && z > 0 && (field[i + 1] > 0) !== s) {
          quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), !s);
        }
        if (y + 1 < ny && x > 0 && z > 0 && (field[i + nx] > 0) !== s) {
          quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), !s);
        }
        if (z + 1 < nz && x > 0 && y > 0 && (field[i + nxy] > 0) !== s) {
          quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), !s);
        }
      }
    }
  }
  if (idx.length === 0) return null;

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    sampleIndex: new Int32Array(sidx),
    indices: new Uint32Array(idx),
    vertexCount: pos.length / 3,
  };
}
