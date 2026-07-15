/**
 * Procedural Earth-like planet texture generator.
 * Generates an equirectangular canvas texture with oceans, continents,
 * cloud patterns, and ice caps — no external image dependencies.
 */
import * as THREE from "three";

/* ── Simple seeded PRNG (mulberry32) ── */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ── 2D noise via value noise ── */
function noise2D(rng: () => number, x: number, y: number, scale: number): number {
  const ix = Math.floor(x * scale);
  const iy = Math.floor(y * scale);
  const fx = x * scale - ix;
  const fy = y * scale - iy;

  const seeds = [
    ix * 137 + iy * 251,
    (ix + 1) * 137 + iy * 251,
    ix * 137 + (iy + 1) * 251,
    (ix + 1) * 137 + (iy + 1) * 251,
  ].map((s) => {
    const r = mulberry32(s);
    return r();
  });

  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = seeds[0] + sx * (seeds[1] - seeds[0]);
  const b = seeds[2] + sx * (seeds[3] - seeds[2]);
  return a + sy * (b - a);
}

function fbm(
  rng: () => number,
  x: number,
  y: number,
  octaves: number,
  lacunarity: number,
  gain: number
): number {
  let value = 0;
  let amplitude = 1;
  let frequency = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * noise2D(rng, x, y, frequency);
    max += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / max;
}

/* ── Draw an irregular blob (continent) ── */
function drawContinentBlob(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string
): void {
  const points: { x: number; y: number }[] = [];
  const numPoints = 24;
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    const rVar = 0.7 + rng() * 0.6;
    const ax = cx + Math.cos(angle) * rx * rVar;
    const ay = cy + Math.sin(angle) * ry * rVar;
    points.push({ x: ax, y: ay });
  }

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 0; i < points.length; i++) {
    const p0 = points[i];
    const p1 = points[(i + 1) % points.length];
    const cp1x = p0.x + (p1.x - p0.x) * 0.4 + (rng() - 0.5) * rx * 0.3;
    const cp1y = p0.y + (p1.y - p0.y) * 0.4 + (rng() - 0.5) * ry * 0.3;
    const cp2x = p0.x + (p1.x - p0.x) * 0.6 + (rng() - 0.5) * rx * 0.3;
    const cp2y = p0.y + (p1.y - p0.y) * 0.6 + (rng() - 0.5) * ry * 0.3;
    ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p1.x, p1.y);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

/**
 * Generate a procedural Earth-like texture and return a THREE.CanvasTexture.
 * @param size - Texture width in pixels (height will be size/2)
 */
export function generateEarthTexture(size: number = 1024): THREE.CanvasTexture {
  const width = size;
  const height = Math.floor(size / 2);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;

  const rng = mulberry32(42);

  /* ── 1. Deep ocean base with gradient ── */
  const oceanGrad = ctx.createLinearGradient(0, 0, 0, height);
  oceanGrad.addColorStop(0, "#0c1f3f");
  oceanGrad.addColorStop(0.15, "#0f2d5c");
  oceanGrad.addColorStop(0.5, "#154080");
  oceanGrad.addColorStop(0.85, "#0f2d5c");
  oceanGrad.addColorStop(1, "#0c1f3f");
  ctx.fillStyle = oceanGrad;
  ctx.fillRect(0, 0, width, height);

  /* ── 2. Ocean current patterns ── */
  for (let i = 0; i < 300; i++) {
    const x = rng() * width;
    const y = rng() * height;
    const r = rng() * 60 + 5;
    const alpha = rng() * 0.06;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(20, 70, 140, ${alpha})`);
    g.addColorStop(1, "rgba(10, 40, 100, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  /* ── 3. Landmass base (large irregular shapes) ── */
  const continentDefs: { cx: number; cy: number; rx: number; ry: number }[] = [
    // North America-ish
    { cx: width * 0.22, cy: height * 0.25, rx: 140, ry: 110 },
    { cx: width * 0.18, cy: height * 0.35, rx: 90, ry: 75 },
    // South America-ish
    { cx: width * 0.27, cy: height * 0.62, rx: 55, ry: 90 },
    // Europe-ish
    { cx: width * 0.5, cy: height * 0.22, rx: 95, ry: 60 },
    // Africa-ish
    { cx: width * 0.52, cy: height * 0.52, rx: 80, ry: 130 },
    // Asia-ish
    { cx: width * 0.68, cy: height * 0.22, rx: 160, ry: 90 },
    { cx: width * 0.75, cy: height * 0.35, rx: 120, ry: 80 },
    // Southeast Asia / Indonesia
    { cx: width * 0.8, cy: height * 0.55, rx: 60, ry: 50 },
    { cx: width * 0.83, cy: height * 0.6, rx: 40, ry: 30 },
    // Australia-ish
    { cx: width * 0.78, cy: height * 0.7, rx: 55, ry: 45 },
    // China / East Asia detail
    { cx: width * 0.72, cy: height * 0.28, rx: 70, ry: 50 },
    // India
    { cx: width * 0.67, cy: height * 0.42, rx: 35, ry: 40 },
    // Middle East
    { cx: width * 0.6, cy: height * 0.38, rx: 30, ry: 25 },
    // Central America
    { cx: width * 0.25, cy: height * 0.5, rx: 25, ry: 20 },
    // Greenland-ish
    { cx: width * 0.35, cy: height * 0.1, rx: 35, ry: 25 },
    // Japan / Korea
    { cx: width * 0.82, cy: height * 0.3, rx: 20, ry: 30 },
    // Madagascar
    { cx: width * 0.6, cy: height * 0.68, rx: 15, ry: 22 },
    // New Zealand
    { cx: width * 0.88, cy: height * 0.78, rx: 15, ry: 20 },
    // Antarctica
    { cx: width * 0.5, cy: height * 0.94, rx: 400, ry: 35 },
    // Arctic
    { cx: width * 0.5, cy: height * 0.03, rx: 350, ry: 28 },
  ];

  // Draw continent base shapes
  for (const def of continentDefs) {
    drawContinentBlob(ctx, rng, def.cx, def.cy, def.rx, def.ry, "#2d5a1e");
  }

  /* ── 4. Terrain variation inside continents ── */
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (py * width + px) * 4;
      // Check if pixel is land (green channel > blue channel indicates land)
      const isLand = data[idx + 1] > data[idx + 2] + 15;

      if (isLand) {
        const nx = px / width;
        const ny = py / height;
        const n = fbm(rng, nx * 4, ny * 2, 4, 2.0, 0.5);
        const elevation = fbm(rng, nx * 6 + 0.5, ny * 3 + 0.5, 3, 2.5, 0.5);

        // Greener lowlands, browner highlands
        const green = Math.floor(70 + n * 60);
        const red = Math.floor(30 + elevation * 70 + n * 20);
        const blue = Math.floor(15 + n * 25);

        data[idx] = Math.min(255, red);
        data[idx + 1] = Math.min(255, green);
        data[idx + 2] = Math.min(255, blue);
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  /* ── 5. Desert bands (subtropical) ── */
  for (let px = 0; px < width; px++) {
    for (let py = Math.floor(height * 0.3); py < Math.floor(height * 0.45); py++) {
      const idx = (py * width + px) * 4;
      const isLand = data[idx + 1] > data[idx + 2] + 10;
      if (isLand && rng() < 0.25) {
        const factor = 0.3 + rng() * 0.4;
        data[idx] = Math.floor(data[idx] * (1 + factor * 0.4));
        data[idx + 1] = Math.floor(data[idx + 1] * (1 + factor * 0.15));
        data[idx + 2] = Math.floor(data[idx + 2] * (1 - factor * 0.3));
      }
    }
  }
  ctx.putImageData(imageData, 0, 0);

  /* ── 6. Ice caps ── */
  const drawIceCap = (yStart: number, yEnd: number) => {
    for (let py = yStart; py !== yEnd; py += yStart < yEnd ? 1 : -1) {
      const progress =
        yStart < yEnd
          ? (py - yStart) / (yEnd - yStart)
          : (yStart - py) / (yStart - yEnd);
      const alpha = Math.max(0, 1 - progress) * 0.7;
      ctx.fillStyle = `rgba(230, 240, 255, ${alpha})`;
      ctx.fillRect(0, py, width, 1);
    }
  };
  drawIceCap(0, Math.floor(height * 0.1));
  drawIceCap(height - 1, Math.floor(height * 0.9));

  /* ── 7. Cloud wisps ── */
  for (let i = 0; i < 400; i++) {
    const cx = rng() * width;
    const cy = height * 0.15 + rng() * height * 0.7;
    const rx = rng() * 50 + 5;
    const ry = rng() * 8 + 2;
    const alpha = rng() * 0.15;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rng() * Math.PI);
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /* ── 8. Create Three.js texture ── */
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = true;

  return texture;
}
