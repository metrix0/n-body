const f = Math.fround;
export const DT = f(0.01);
const SOFT = f(1e-9);

export function initialState(n, seed = 2022) {
  let value = seed >>> 0;
  const random = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  const state = new Float32Array(n * 6);
  for (let i = 0; i < n; i++) {
    const angle = random() * Math.PI * 2;
    const radius = 3 + Math.sqrt(random()) * 15;
    const height = (random() - 0.5) * 5;
    const speed = Math.sqrt(n / radius) * 0.68;
    state.set([Math.cos(angle) * radius, height, Math.sin(angle) * radius,
      -Math.sin(angle) * speed, (random() - 0.5) * 0.2, Math.cos(angle) * speed], i * 6);
  }
  return state;
}

export function stepRange(state, start, end) {
  const out = new Float32Array((end - start) * 6);
  for (let i = start; i < end; i++) {
    const a = i * 6;
    let fx = 0, fy = 0, fz = 0;
    for (let b = 0; b < state.length; b += 6) {
      const dx = f(state[b] - state[a]), dy = f(state[b+1] - state[a+1]), dz = f(state[b+2] - state[a+2]);
      const distance = f(f(f(f(dx*dx) + f(dy*dy)) + f(dz*dz)) + SOFT);
      const inv = f(1 / Math.sqrt(distance));
      const inv3 = f(f(inv * inv) * inv);
      fx = f(fx + f(dx * inv3)); fy = f(fy + f(dy * inv3)); fz = f(fz + f(dz * inv3));
    }
    const vx = f(state[a+3] + f(DT*fx)), vy = f(state[a+4] + f(DT*fy)), vz = f(state[a+5] + f(DT*fz));
    out.set([f(state[a] + f(vx*DT)), f(state[a+1] + f(vy*DT)), f(state[a+2] + f(vz*DT)), vx, vy, vz], (i-start)*6);
  }
  return out;
}
export function maxError(a, b) {
  if (a.length !== b.length) return Infinity;
  let result = 0;
  for (let i=0; i<a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return Infinity;
    result = Math.max(result, Math.abs(a[i]-b[i]));
  }
  return result;
}
export function stats(values) {
  const mean = values.reduce((a,b)=>a+b,0)/values.length;
  const stddev = Math.sqrt(values.reduce((s,v)=>s+(v-mean)**2,0)/Math.max(1,values.length-1));
  return {mean, stddev};
}
