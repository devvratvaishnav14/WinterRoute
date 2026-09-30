/**
 * A small, procedurally-jagged lightning-bolt path — the "optional
 * visible branched bolt" layered behind the sharp full-scene
 * illumination flash. A fresh random bolt/position is generated at each
 * flash trigger (not tied to the deterministic cloud-shape seeding —
 * variety between flashes is the point here, not stability).
 */
export interface LightningBolt {
  /** An SVG path `d` attribute, in a 0-100 x 0-100 viewBox. */
  path: string;
  /** A short branch off the main bolt, for a slightly more organic look — may be empty. */
  branchPath: string;
  leftPercent: number;
}

export function randomLightningBolt(random: () => number = Math.random): LightningBolt {
  let x = 30 + random() * 40;
  let y = 4;
  let path = `M ${x.toFixed(1)} ${y.toFixed(1)}`;
  const points: Array<[number, number]> = [[x, y]];

  const segments = 5 + Math.floor(random() * 2);
  for (let i = 0; i < segments; i++) {
    x += (random() - 0.5) * 16;
    y += 10 + random() * 8;
    path += ` L ${x.toFixed(1)} ${y.toFixed(1)}`;
    points.push([x, y]);
  }

  let branchPath = "";
  if (points.length > 3 && random() > 0.35) {
    const [bx, by] = points[2];
    let x2 = bx;
    let y2 = by;
    branchPath = `M ${bx.toFixed(1)} ${by.toFixed(1)}`;
    for (let i = 0; i < 2; i++) {
      x2 += 6 + random() * 10;
      y2 += 6 + random() * 6;
      branchPath += ` L ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    }
  }

  return { path, branchPath, leftPercent: points[0][0] };
}
