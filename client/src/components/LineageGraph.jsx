import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY } from 'd3-force';
import { select } from 'd3-selection';
import { zoom as d3zoom, zoomIdentity } from 'd3-zoom';
import { narrativeColor, nodeColor, rgba } from '../lib/theme.js';
import { truncate } from '../lib/format.js';

// Canvas force-directed lineage graph (d3-force + d3-zoom).
// Nodes are claims, solid curved edges run from a claim to the variant derived
// from it, dashed edges join similar claims that are not parent and child.

const UI_FONT = '"Schibsted Grotesk", Inter, system-ui, sans-serif';
const RING_GAP = 72;
const TIME_WIDTH = 1000;
const GEN_ROW = 64;
const MIN_K = 0.12;
const MAX_K = 8;

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const easeOutBack = (t) => 1 + 2.70158 * (t - 1) ** 3 + 1.70158 * (t - 1) ** 2;
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

const glowCache = new Map();
function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = document.createElement('canvas');
  c.width = c.height = 96;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(48, 48, 0, 48, 48, 48);
  grad.addColorStop(0, rgba(color, 0.6));
  grad.addColorStop(0.3, rgba(color, 0.2));
  grad.addColorStop(1, rgba(color, 0));
  g.fillStyle = grad;
  g.fillRect(0, 0, 96, 96);
  glowCache.set(color, c);
  return c;
}

/** Like d3.forceRadial, but each node can orbit its own centre. */
function forceRadialTo(centerOf, radiusOf, strength) {
  let nodes = [];
  function force(alpha) {
    for (const n of nodes) {
      const c = centerOf(n);
      const dx = n.x - c.x || 1e-6;
      const dy = n.y - c.y || 1e-6;
      const r = Math.sqrt(dx * dx + dy * dy);
      const k = ((radiusOf(n) - r) * strength * alpha) / r;
      n.vx += dx * k;
      n.vy += dy * k;
    }
  }
  force.initialize = (ns) => {
    nodes = ns;
  };
  return force;
}

function clusterCenters(ids) {
  const centers = new Map();
  const n = ids.length;
  if (n === 1) centers.set(ids[0], { x: 0, y: 0 });
  else if (n <= 12) {
    const R = Math.max(170, 165 / Math.sin(Math.PI / n));
    ids.forEach((id, i) => {
      const a = -Math.PI / 2 + (2 * Math.PI * i) / n;
      centers.set(id, { x: R * Math.cos(a), y: R * Math.sin(a) });
    });
  } else {
    ids.forEach((id, i) => {
      const r = 190 * Math.sqrt(i + 0.5);
      const a = i * 2.39996;
      centers.set(id, { x: r * Math.cos(a), y: r * Math.sin(a) });
    });
  }
  return centers;
}

function roundRect(ctx, x, y, w, h, r) {
  if (ctx.roundRect) {
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function controlPoint(s, t) {
  const mx = (s.x + t.x) / 2;
  const my = (s.y + t.y) / 2;
  return [mx - (t.y - s.y) * 0.14, my + (t.x - s.x) * 0.14];
}

function bezier(sx, sy, cx, cy, tx, ty, t) {
  const u = 1 - t;
  return [u * u * sx + 2 * u * t * cx + t * t * tx, u * u * sy + 2 * u * t * cy + t * t * ty];
}

const DAY = 86400000;
function timeTicks(t0, t1, pxPerMs) {
  const steps = [
    ['day', 1, DAY],
    ['day', 7, 7 * DAY],
    ['month', 1, 30.44 * DAY],
    ['month', 3, 91.3 * DAY],
    ['month', 6, 182.6 * DAY],
    ['year', 1, 365.25 * DAY],
    ['year', 2, 730.5 * DAY],
    ['year', 5, 1826 * DAY],
    ['year', 10, 3652 * DAY],
    ['year', 25, 9131 * DAY],
  ];
  const [unit, step] = steps.find((s) => s[2] * pxPerMs >= 92) || steps[steps.length - 1];
  const d = new Date(t0);
  const ticks = [];
  if (unit === 'year') {
    let y = Math.floor(d.getUTCFullYear() / step) * step;
    for (let i = 0; i < 400; i++, y += step) {
      const t = Date.UTC(y, 0, 1);
      if (t > t1) break;
      if (t >= t0) ticks.push({ t, label: String(y) });
    }
  } else if (unit === 'month') {
    let y = d.getUTCFullYear();
    let m = Math.floor(d.getUTCMonth() / step) * step;
    for (let i = 0; i < 400; i++) {
      const t = Date.UTC(y, m, 1);
      if (t > t1) break;
      if (t >= t0) ticks.push({ t, label: new Date(t).toLocaleDateString('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }) });
      m += step;
      if (m > 11) {
        y += Math.floor(m / 12);
        m %= 12;
      }
    }
  } else {
    let t = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    for (let i = 0; i < 400 && t <= t1; i++, t += step * DAY) {
      if (t >= t0) ticks.push({ t, label: new Date(t).toLocaleDateString('en', { month: 'short', day: 'numeric', timeZone: 'UTC' }) });
    }
  }
  return ticks;
}

function makeState() {
  return {
    canvas: null,
    ctx: null,
    nodes: [],
    links: [],
    byId: new Map(),
    childrenOf: new Map(),
    timeOrder: [],
    sim: null,
    zoom: null,
    sel: null,
    transform: zoomIdentity,
    width: 0,
    height: 0,
    dpr: 1,
    dirty: true,
    hover: null,
    drag: null,
    suppressClick: false,
    appear: new Map(),
    appearing: false,
    positions: new Map(),
    focus: { key: undefined, set: null },
    anim: null,
    needsFit: false,
    userMoved: false,
    lastW: 0,
    lastH: 0,
    resize: null,
    centers: new Map(),
    centerOf: () => ({ x: 0, y: 0 }),
    time: { t0: 0, t1: 1, x: () => 0 },
    maxGen: 0,
    props: {},
  };
}

export const LineageGraph = forwardRef(function LineageGraph(props, ref) {
  const { nodes, links, layout = 'organic', galaxy = false, ariaLabel } = props;
  const wrapRef = useRef(null);
  const canvasRef = useRef(null);
  const stRef = useRef(null);
  if (!stRef.current) stRef.current = makeState();
  const st = stRef.current;
  st.props = props;

  // ---------- helpers bound to this instance ----------
  const visible = (n) => st.props.visibleUntil == null || n.time <= st.props.visibleUntil;
  const colorOf = (n) => nodeColor(n, st.props.colorBy || 'mutation');

  function toGraph(clientX, clientY) {
    const rect = st.canvas.getBoundingClientRect();
    return st.transform.invert([clientX - rect.left, clientY - rect.top]);
  }

  function nodeAt(gx, gy) {
    let best = null;
    let bestD = Infinity;
    const tol = 5 / st.transform.k;
    for (const n of st.nodes) {
      if (!visible(n) || n.x == null) continue;
      const d = Math.hypot(n.x - gx, n.y - gy);
      if (d <= n.r + tol && d < bestD) {
        best = n;
        bestD = d;
      }
    }
    return best;
  }

  function fitTransform() {
    const { width, height } = st;
    const pts = st.nodes.filter((n) => n.x != null);
    if (!pts.length || !width || !height) return zoomIdentity.translate(width / 2, height / 2);
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const n of pts) {
      minX = Math.min(minX, n.x - n.r);
      maxX = Math.max(maxX, n.x + n.r);
      minY = Math.min(minY, n.y - n.r);
      maxY = Math.max(maxY, n.y + n.r);
    }
    // Leave room for the floating controls (top), legend (bottom) and cluster titles.
    const small = width < 560;
    const pad = {
      top: small ? 64 : 84,
      right: small ? 24 : 70,
      bottom: (small ? 30 : 78) + (st.props.layout === 'timeline' ? 48 : 0),
      left: small ? 24 : 48,
    };
    const availW = Math.max(120, width - pad.left - pad.right);
    const availH = Math.max(120, height - pad.top - pad.bottom);
    const w = Math.max(maxX - minX, 40);
    const h = Math.max(maxY - minY, 40);
    const k = clamp(Math.min(availW / w, availH / h), MIN_K, 1.7);
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    return zoomIdentity.translate(pad.left + availW / 2 - cx * k, pad.top + availH / 2 - cy * k).scale(k);
  }

  function setTransform(t) {
    if (st.zoom && st.sel) st.zoom.transform(st.sel, t);
  }

  function animateTo(target, duration = 600) {
    if (!duration || st.props.reducedMotion) {
      st.anim = null;
      setTransform(target);
      return;
    }
    st.anim = { from: st.transform, to: target, start: performance.now(), duration };
  }

  function centerOn(id, k) {
    const n = st.byId.get(id);
    if (!n || n.x == null) return;
    st.userMoved = true;
    const kk = k ?? Math.max(st.transform.k, 1.1);
    animateTo(zoomIdentity.translate(st.width / 2 - n.x * kk, st.height / 2 - n.y * kk).scale(kk), 650);
  }

  function zoomBy(factor) {
    st.userMoved = true;
    const t = st.transform;
    const k = clamp(t.k * factor, MIN_K, MAX_K);
    const cx = st.width / 2;
    const cy = st.height / 2;
    animateTo(zoomIdentity.translate(cx - ((cx - t.x) * k) / t.k, cy - ((cy - t.y) * k) / t.k).scale(k), 260);
  }

  function inView(n, pad = 60) {
    const [sx, sy] = st.transform.apply([n.x, n.y]);
    return sx > pad && sy > pad && sx < st.width - pad && sy < st.height - pad;
  }

  function focusSet() {
    const id = st.hover?.id ?? st.props.selectedId ?? null;
    if (st.focus.key === id) return st.focus.set;
    let set = null;
    if (id != null && st.byId.has(id)) {
      set = new Set([id]);
      let p = st.byId.get(id).parent_id;
      while (p != null && st.byId.has(p) && !set.has(p)) {
        set.add(p);
        p = st.byId.get(p).parent_id;
      }
      const queue = [id];
      while (queue.length) {
        for (const c of st.childrenOf.get(queue.shift()) || []) {
          if (!set.has(c)) {
            set.add(c);
            queue.push(c);
          }
        }
      }
    }
    st.focus = { key: id, set };
    return set;
  }

  // ---------- drawing ----------
  function draw(now) {
    const { ctx, width, height, dpr, transform: t } = st;
    if (!ctx || !width) return;
    const p = st.props;
    const reduced = p.reducedMotion;
    const focus = focusSet();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.scale(t.k, t.k);

    // Ring guides: one circle per generation, like a microscope reticle.
    if (p.layout === 'rings') {
      ctx.lineWidth = 1 / t.k;
      const centers = galaxy ? [...st.centers.values()] : [{ x: 0, y: 0 }];
      for (const c of centers) {
        for (let g = 1; g <= st.maxGen; g++) {
          ctx.beginPath();
          ctx.arc(c.x, c.y, g * RING_GAP, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(150, 170, 255, ${galaxy ? 0.1 : 0.2})`;
          ctx.setLineDash([3 / t.k, 5 / t.k]);
          ctx.stroke();
        }
      }
      ctx.setLineDash([]);
    }

    // Edges
    const linkAlpha = (s, tg) => (focus ? (focus.has(s.id) && focus.has(tg.id) ? 0.95 : 0.07) : 0.55);
    for (const l of st.links) {
      const s = typeof l.source === 'object' ? l.source : st.byId.get(l.source);
      const tg = typeof l.target === 'object' ? l.target : st.byId.get(l.target);
      if (!s || !tg || s.x == null || tg.x == null || !visible(s) || !visible(tg)) continue;
      if (l.kind === 'related') {
        if (!p.showRelated) continue;
        const cross = s.narrative_id !== tg.narrative_id;
        const a = focus ? (focus.has(s.id) || focus.has(tg.id) ? 0.55 : 0.04) : cross ? 0.32 : 0.18;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(tg.x, tg.y);
        ctx.setLineDash([3 / t.k, 5 / t.k]);
        ctx.strokeStyle = `rgba(205, 214, 255, ${a})`;
        ctx.lineWidth = 1 / t.k;
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      const [cx, cy] = controlPoint(s, tg);
      const a = linkAlpha(s, tg);
      const grad = ctx.createLinearGradient(s.x, s.y, tg.x, tg.y);
      grad.addColorStop(0, rgba(colorOf(s), a * 0.7));
      grad.addColorStop(1, rgba(colorOf(tg), a));
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.quadraticCurveTo(cx, cy, tg.x, tg.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 0.7 + 2.4 * (l.similarity ?? 0.3);
      ctx.stroke();
    }

    // Flow particles: travel from each claim to the variant it spawned.
    if (p.flow && !reduced) {
      ctx.globalCompositeOperation = 'lighter';
      let i = 0;
      for (const l of st.links) {
        i++;
        if (l.kind !== 'derivation') continue;
        const s = l.source;
        const tg = l.target;
        if (typeof s !== 'object' || typeof tg !== 'object' || !visible(s) || !visible(tg)) continue;
        if (focus && !(focus.has(s.id) && focus.has(tg.id))) continue;
        const [cx, cy] = controlPoint(s, tg);
        const phase = ((now / 2600 + i * 0.137) % 1 + 1) % 1;
        const [x, y] = bezier(s.x, s.y, cx, cy, tg.x, tg.y, phase);
        const col = colorOf(tg);
        const r = 2.2;
        ctx.drawImage(glowSprite(col), x - r * 4, y - r * 4, r * 8, r * 8);
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // Nodes
    st.appearing = false;
    const pulse = reduced ? 0 : (now % 2400) / 2400;
    for (const n of st.nodes) {
      if (n.x == null) continue;
      if (!visible(n)) {
        st.appear.delete(n.id);
        continue;
      }
      if (!st.appear.has(n.id)) st.appear.set(n.id, now);
      const prog = clamp((now - st.appear.get(n.id)) / 520, 0, 1);
      if (prog < 1) st.appearing = true;
      const scale = prog >= 1 ? 1 : Math.max(0, easeOutBack(prog));
      const r = n.r * scale;
      if (r <= 0.05) continue;
      const dim = focus && !focus.has(n.id);
      const col = colorOf(n);
      ctx.globalAlpha = dim ? 0.16 : 1;

      ctx.globalCompositeOperation = 'lighter';
      const halo = r * (n.parent_id ? 3.4 : 4.4);
      ctx.drawImage(glowSprite(col), n.x - halo, n.y - halo, halo * 2, halo * 2);
      ctx.globalCompositeOperation = 'source-over';

      ctx.beginPath();
      ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(n.x - r * 0.28, n.y - r * 0.3, r * 0.42, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.38)';
      ctx.fill();

      if (!n.parent_id) {
        ctx.lineWidth = 1.2 / Math.sqrt(t.k);
        ctx.strokeStyle = rgba(col, 0.85);
        ctx.beginPath();
        ctx.arc(n.x, n.y, r + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        if (!reduced && !dim) {
          ctx.strokeStyle = rgba(col, 0.6 * (1 - pulse));
          ctx.beginPath();
          ctx.arc(n.x, n.y, r + 3.5 + pulse * 16, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
    }

    // Selection reticle
    const sel = p.selectedId != null ? st.byId.get(p.selectedId) : null;
    if (sel && sel.x != null && visible(sel)) {
      const r = sel.r + 6;
      ctx.lineWidth = 1.6 / t.k;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sel.x, sel.y, r, 0, Math.PI * 2);
      ctx.stroke();
      const tick = 7 / t.k;
      ctx.beginPath();
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        ctx.moveTo(sel.x + dx * (r + 2 / t.k), sel.y + dy * (r + 2 / t.k));
        ctx.lineTo(sel.x + dx * (r + 2 / t.k + tick), sel.y + dy * (r + 2 / t.k + tick));
      }
      ctx.stroke();
    }
    const hov = st.hover && st.hover !== sel ? st.hover : null;
    if (hov && visible(hov)) {
      ctx.lineWidth = 1.2 / t.k;
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.beginPath();
      ctx.arc(hov.x, hov.y, hov.r + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    drawOverlay(focus, sel, hov);
  }

  function label(text, sx, sy, color, strong, placed) {
    const { ctx } = st;
    ctx.font = `${strong ? 600 : 500} ${strong ? 13 : 12}px ${UI_FONT}`;
    const w = ctx.measureText(text).width;
    const h = strong ? 24 : 22;
    let x = sx;
    // Keep clear of the zoom buttons in the bottom-right corner.
    const right = st.width - (sy > st.height - 150 ? 64 : 8);
    if (x + w + 16 > right) x = Math.max(8, right - w - 16);
    const y = sy - h / 2;
    if (placed) {
      // Skip labels that would sit on top of one already drawn.
      const box = { x0: x - 2, y0: y - 2, x1: x + w + 18, y1: y + h + 2 };
      if (placed.some((b) => box.x0 < b.x1 && box.x1 > b.x0 && box.y0 < b.y1 && box.y1 > b.y0)) return;
      placed.push(box);
    }
    ctx.fillStyle = 'rgba(7, 10, 28, 0.86)';
    ctx.strokeStyle = rgba(color, strong ? 0.7 : 0.35);
    ctx.lineWidth = 1;
    ctx.beginPath();
    roundRect(ctx, x, y, w + 16, h, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#E9ECFA';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x + 8, y + h / 2 + 0.5);
  }

  function drawOverlay(focus, sel, hov) {
    const { ctx, transform: t } = st;
    const p = st.props;

    // Time axis for the timeline layout
    if (p.layout === 'timeline' && st.nodes.length) {
      // Axis sits above the legend; faint gridlines run up through the plot.
      const y = st.height - (st.width < 560 ? 30 : 74);
      const toScreenX = (time) => t.applyX(st.time.x(time));
      const t0 = st.time.invert(t.invertX(0));
      const t1 = st.time.invert(t.invertX(st.width));
      const pxPerMs = (t.k * TIME_WIDTH) / Math.max(1, st.time.t1 - st.time.t0);
      ctx.strokeStyle = 'rgba(150, 170, 255, 0.18)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(st.width, y);
      ctx.stroke();
      ctx.font = `500 11px ${UI_FONT}`;
      ctx.fillStyle = 'rgba(183, 190, 221, 0.85)';
      ctx.textBaseline = 'top';
      for (const tick of timeTicks(t0, t1, pxPerMs)) {
        const x = toScreenX(tick.t);
        ctx.strokeStyle = 'rgba(150, 170, 255, 0.07)';
        ctx.beginPath();
        ctx.moveTo(x, 60);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(150, 170, 255, 0.3)';
        ctx.beginPath();
        ctx.moveTo(x, y - 4);
        ctx.lineTo(x, y + 4);
        ctx.stroke();
        ctx.fillText(tick.label, x + 4, y + 7);
      }
      if (!galaxy) {
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'rgba(183, 190, 221, 0.55)';
        for (let g = 0; g <= st.maxGen; g++) {
          const [, gy] = t.apply([0, (g - st.maxGen / 2) * GEN_ROW]);
          if (gy > 64 && gy < y - 10) ctx.fillText(g === 0 ? 'Origin' : `Gen ${g}`, 12, gy);
        }
      }
    }

    // Generation labels on the ring guides
    if (p.layout === 'rings' && !galaxy && st.maxGen > 0) {
      ctx.font = `500 11px ${UI_FONT}`;
      ctx.fillStyle = 'rgba(183, 190, 221, 0.7)';
      ctx.textBaseline = 'bottom';
      for (let g = 1; g <= st.maxGen; g++) {
        const [x, y] = t.apply([0, -g * RING_GAP]);
        if (y > 14) ctx.fillText(`Generation ${g}`, x + 6, y - 3);
      }
    }

    // Cluster titles in the all-narratives view
    if (galaxy && t.k < 2.2) {
      const groups = new Map();
      let sumY = 0;
      let count = 0;
      for (const n of st.nodes) {
        if (n.x == null || !visible(n)) continue;
        const g = groups.get(n.narrative_id) || { sx: 0, sy: 0, n: 0, minY: Infinity, maxY: -Infinity, id: n.narrative_id };
        g.sx += n.x;
        g.sy += n.y;
        g.n += 1;
        g.minY = Math.min(g.minY, n.y - n.r);
        g.maxY = Math.max(g.maxY, n.y + n.r);
        groups.set(n.narrative_id, g);
        sumY += n.y;
        count += 1;
      }
      const midY = count ? sumY / count : 0;
      ctx.font = `600 12.5px ${UI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const taken = [];
      const overlaps = (b) => taken.some((o) => b.x0 < o.x1 && b.x1 > o.x0 && b.y0 < o.y1 && b.y1 > o.y0);
      for (const g of groups.values()) {
        const title = p.narrativeTitles?.get(g.id);
        if (!title) continue;
        const text = truncate(title, 38);
        const w = ctx.measureText(text).width;
        const [cx] = t.apply([g.sx / g.n, 0]);
        const [, top] = t.apply([0, g.minY]);
        const [, bottom] = t.apply([0, g.maxY]);
        // Prefer above clusters in the upper half and below those in the lower half; try the other side, then nudge.
        const below = g.sy / g.n > midY && groups.size > 2;
        const options = below ? [bottom + 20, top - 20, bottom + 40] : [top - 20, bottom + 20, top - 40];
        let y = options[0];
        for (const oy of options) {
          if (!overlaps({ x0: cx - w / 2 - 6, x1: cx + w / 2 + 6, y0: oy - 9, y1: oy + 9 })) {
            y = oy;
            break;
          }
        }
        taken.push({ x0: cx - w / 2 - 6, x1: cx + w / 2 + 6, y0: y - 9, y1: y + 9 });
        const dimmed = focus && ![...focus].some((id) => st.byId.get(id)?.narrative_id === g.id);
        ctx.fillStyle = rgba(narrativeColor(g.id), dimmed ? 0.25 : 0.95);
        ctx.fillText(text, cx, y);
      }
      ctx.textAlign = 'left';
    }

    // Node labels: selected and hovered first, then origins, then the most widely seen.
    const placed = [];
    for (const n of [sel, hov]) {
      if (!n || n.x == null || !visible(n)) continue;
      const [sx, sy] = t.apply([n.x, n.y]);
      label(truncate(n.text, 56), sx + n.r * t.k + 12, sy, colorOf(n), true, placed);
    }
    const showAll = t.k >= 1.4;
    const candidates = st.nodes
      .filter((n) => n.x != null && visible(n) && n !== sel && n !== hov && (showAll || (!n.parent_id && !galaxy)) && (!focus || focus.has(n.id)))
      .sort((a, b) => Number(!a.parent_id) - Number(!b.parent_id) || b.r - a.r);
    for (const n of candidates) {
      const [sx, sy] = t.apply([n.x, n.y]);
      if (sx < -50 || sy < -20 || sx > st.width + 50 || sy > st.height + 20) continue;
      label(truncate(n.text, !n.parent_id && !showAll ? 34 : 30), sx + n.r * t.k + 8, sy, colorOf(n), false, placed);
    }
  }

  // ---------- one-time setup: canvas, zoom, pointer, render loop ----------
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    st.canvas = canvas;
    st.ctx = canvas.getContext('2d');

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      st.dpr = Math.min(window.devicePixelRatio || 1, 2);
      st.width = Math.max(1, Math.round(rect.width));
      st.height = Math.max(1, Math.round(rect.height));
      canvas.width = Math.round(st.width * st.dpr);
      canvas.height = Math.round(st.height * st.dpr);
      canvas.style.width = `${st.width}px`;
      canvas.style.height = `${st.height}px`;
      const changed = Math.abs(rect.width - st.lastW) > 1 || Math.abs(rect.height - st.lastH) > 1;
      st.lastW = rect.width;
      st.lastH = rect.height;
      if ((st.needsFit || (changed && !st.userMoved)) && st.nodes.length) {
        st.needsFit = false;
        st.anim = null;
        setTransform(fitTransform());
      }
      st.dirty = true;
    };
    st.resize = resize;
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);
    resize();

    st.sel = select(canvas);
    st.zoom = d3zoom()
      .scaleExtent([MIN_K, MAX_K])
      .filter((ev) => {
        if (ev.type === 'wheel') return true;
        if (ev.type === 'dblclick') return false;
        if (ev.button) return false;
        const pt = ev.touches ? ev.touches[0] : ev;
        if (!pt || ev.touches?.length > 1) return true;
        const [gx, gy] = toGraph(pt.clientX, pt.clientY);
        return !nodeAt(gx, gy);
      })
      .on('start', (ev) => {
        if (ev.sourceEvent) {
          st.anim = null;
          st.userMoved = true;
        }
      })
      .on('zoom', (ev) => {
        st.transform = ev.transform;
        st.dirty = true;
      });
    st.sel.call(st.zoom).on('dblclick.zoom', null);

    const onPointerDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const [gx, gy] = toGraph(e.clientX, e.clientY);
      const n = nodeAt(gx, gy);
      if (!n) return;
      st.drag = { node: n, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
      canvas.setPointerCapture?.(e.pointerId);
    };
    const onPointerMove = (e) => {
      const d = st.drag;
      if (d && e.pointerId === d.id) {
        if (!d.moved && Math.hypot(e.clientX - d.x0, e.clientY - d.y0) > 4) {
          d.moved = true;
          d.node.fx = d.node.x;
          d.node.fy = d.node.y;
          st.sim?.alphaTarget(0.2).restart();
        }
        if (d.moved) {
          const [gx, gy] = toGraph(e.clientX, e.clientY);
          d.node.fx = gx;
          d.node.fy = gy;
          st.dirty = true;
        }
        return;
      }
      if (e.pointerType !== 'mouse') return;
      const [gx, gy] = toGraph(e.clientX, e.clientY);
      const n = nodeAt(gx, gy);
      if ((n?.id ?? null) !== (st.hover?.id ?? null)) {
        st.hover = n;
        st.dirty = true;
        canvas.style.cursor = n ? 'pointer' : 'grab';
      }
    };
    const endDrag = (e) => {
      const d = st.drag;
      if (!d || e.pointerId !== d.id) return;
      st.drag = null;
      if (d.moved) {
        d.node.fx = null;
        d.node.fy = null;
        st.sim?.alphaTarget(0);
        st.suppressClick = true;
      }
    };
    const onLeave = () => {
      if (st.hover) {
        st.hover = null;
        st.dirty = true;
      }
    };
    const onClick = (e) => {
      if (st.suppressClick) {
        st.suppressClick = false;
        return;
      }
      const [gx, gy] = toGraph(e.clientX, e.clientY);
      const n = nodeAt(gx, gy);
      st.props.onSelect?.(n ? n.id : null);
    };
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('pointerleave', onLeave);
    canvas.addEventListener('click', onClick);

    let raf = 0;
    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      if (st.anim) {
        const { from, to, start, duration } = st.anim;
        const k = clamp((now - start) / duration, 0, 1);
        const e = easeInOut(k);
        setTransform(
          zoomIdentity.translate(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e).scale(from.k + (to.k - from.k) * e),
        );
        if (k >= 1) st.anim = null;
      }
      const p = st.props;
      const animating = !p.reducedMotion && (p.flow || st.nodes.some((n) => !n.parent_id));
      if (st.dirty || animating || st.appearing) {
        st.dirty = false;
        draw(now);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      st.sim?.stop();
      st.sel.on('.zoom', null);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', endDrag);
      canvas.removeEventListener('pointercancel', endDrag);
      canvas.removeEventListener('pointerleave', onLeave);
      canvas.removeEventListener('click', onClick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- data / layout changes: rebuild the simulation ----------
  useEffect(() => {
    for (const n of st.nodes) if (n.x != null) st.positions.set(n.id, { x: n.x, y: n.y });
    const prevIds = new Set(st.nodes.map((n) => n.id));
    const list = nodes || [];
    const overlap = list.some((n) => prevIds.has(n.id));
    const sameSet = overlap && list.length === prevIds.size && list.every((n) => prevIds.has(n.id));
    const layoutChanged = st.layoutKey !== undefined && st.layoutKey !== `${layout}|${galaxy}`;
    st.layoutKey = `${layout}|${galaxy}`;
    const maxReach = Math.max(1, ...list.map((n) => n.reach || 0));

    const simNodes = list.map((n) => {
      const prev = st.positions.get(n.id);
      return {
        ...n,
        time: Date.parse(n.published_at),
        r: 3.6 + 8.4 * Math.sqrt((n.reach || 0) / maxReach) + (n.parent_id ? 0 : 2.4),
        x: prev?.x,
        y: prev?.y,
      };
    });
    const byId = new Map(simNodes.map((n) => [n.id, n]));
    const simLinks = (links || []).filter((l) => byId.has(l.source) && byId.has(l.target)).map((l) => ({ ...l }));
    const childrenOf = new Map();
    for (const n of simNodes) {
      if (n.parent_id != null && byId.has(n.parent_id)) {
        if (!childrenOf.has(n.parent_id)) childrenOf.set(n.parent_id, []);
        childrenOf.get(n.parent_id).push(n.id);
      }
    }

    const narrativeIds = [...new Set(simNodes.map((n) => n.narrative_id))].sort((a, b) => a - b);
    const centers = galaxy ? clusterCenters(narrativeIds) : new Map();
    const centerOf = (n) => (galaxy ? centers.get(n.narrative_id) || { x: 0, y: 0 } : { x: 0, y: 0 });
    const laneOf = new Map(narrativeIds.map((id, i) => [id, (i - (narrativeIds.length - 1) / 2) * 120]));
    const times = simNodes.map((n) => n.time).filter(Number.isFinite);
    let t0 = times.length ? Math.min(...times) : 0;
    let t1 = times.length ? Math.max(...times) : 1;
    if (t1 - t0 < DAY) {
      t0 -= DAY;
      t1 += DAY;
    }
    const time = {
      t0,
      t1,
      x: (tm) => ((tm - t0) / (t1 - t0) - 0.5) * TIME_WIDTH,
      invert: (x) => t0 + (x / TIME_WIDTH + 0.5) * (t1 - t0),
    };

    // Starting positions: continue from the previous layout, or grow out of the parent.
    for (const n of simNodes) {
      if (n.x != null) continue;
      const parent = n.parent_id != null ? byId.get(n.parent_id) : null;
      const base = parent && parent.x != null ? parent : centerOf(n);
      n.x = (layout === 'timeline' ? time.x(n.time) : base.x) + (Math.random() - 0.5) * 30;
      if (layout === 'timeline' && !galaxy) n.y = (n.generation || 0) * GEN_ROW;
      n.y = base.y + (Math.random() - 0.5) * 30;
    }

    if (!overlap) st.appear.clear();
    for (const n of simNodes) if (!overlap || prevIds.has(n.id)) st.appear.set(n.id, -1e9);

    st.sim?.stop();
    const derivation = simLinks.filter((l) => l.kind === 'derivation');
    const related = simLinks.filter((l) => l.kind === 'related');
    const sim = forceSimulation(simNodes).stop();
    sim.force('collide', forceCollide((n) => n.r + 6).strength(0.85));
    if (layout === 'rings') {
      sim.force('charge', forceManyBody().strength(-55).distanceMax(400));
      sim.force('link', forceLink(derivation).id((d) => d.id).distance(RING_GAP).strength(0.22));
      sim.force('radial', forceRadialTo(centerOf, (n) => n.generation * RING_GAP, 0.95));
    } else if (layout === 'timeline') {
      // x = publication date; y = generation (or one lane per narrative in the all-narratives view).
      const maxGen = simNodes.reduce((m, n) => Math.max(m, n.generation || 0), 0);
      const yOf = galaxy
        ? (n) => laneOf.get(n.narrative_id) + ((n.generation || 0) - 2) * 12
        : (n) => ((n.generation || 0) - maxGen / 2) * GEN_ROW;
      sim.force('charge', forceManyBody().strength(-30).distanceMax(200));
      sim.force('link', forceLink(derivation).id((d) => d.id).distance(40).strength(0.03));
      sim.force('x', forceX((n) => time.x(n.time)).strength(1));
      sim.force('y', forceY(yOf).strength(galaxy ? 0.5 : 0.8));
    } else {
      sim.force('charge', forceManyBody().strength(-135).distanceMax(520));
      sim.force('link', forceLink(derivation).id((d) => d.id).distance((l) => 26 + 74 * (1 - (l.similarity ?? 0.3))).strength(0.75));
      if (galaxy) sim.force('related', forceLink(related).id((d) => d.id).distance(180).strength(0.012));
      sim.force('x', forceX((n) => centerOf(n).x).strength(galaxy ? 0.075 : 0.035));
      sim.force('y', forceY((n) => centerOf(n).y).strength(galaxy ? 0.075 : 0.035));
    }

    Object.assign(st, {
      nodes: simNodes,
      links: simLinks,
      byId,
      childrenOf,
      timeOrder: [...simNodes].sort((a, b) => a.time - b.time || a.id - b.id).map((n) => n.id),
      sim,
      centers,
      centerOf,
      time,
      maxGen: simNodes.reduce((m, n) => Math.max(m, n.generation || 0), 0),
      focus: { key: undefined, set: null },
      hover: null,
    });

    let fitOnSettle = false;
    if (!overlap) {
      // Settle most of the layout before the first paint so it doesn't explode on screen.
      sim.alpha(1);
      sim.tick(layout === 'organic' ? 260 : 200);
      st.userMoved = false;
      st.anim = null;
      if (st.width > 1) setTransform(fitTransform());
      else st.needsFit = true;
      sim.alpha(0.06);
    } else if (layoutChanged) {
      // Same claims, new arrangement: let them glide into place, then reframe.
      sim.alpha(1);
      fitOnSettle = true;
      st.userMoved = false;
    } else {
      sim.alpha(sameSet ? 0.05 : 0.4);
    }
    sim.on('tick', () => {
      st.dirty = true;
      if (fitOnSettle && sim.alpha() < 0.1) {
        fitOnSettle = false;
        if (!st.userMoved) animateTo(fitTransform(), 700);
      }
    });
    sim.restart();
    st.dirty = true;
    return () => sim.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, layout, galaxy]);

  // Keep the selected claim in view when it is chosen from outside the canvas.
  useEffect(() => {
    st.dirty = true;
    const n = props.selectedId != null ? st.byId.get(props.selectedId) : null;
    if (n && n.x != null && !inView(n)) centerOn(n.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.selectedId]);

  useEffect(() => {
    st.dirty = true;
  });

  useImperativeHandle(
    ref,
    () => ({
      fit: (ms = 600) => {
        st.userMoved = false;
        animateTo(fitTransform(), ms);
      },
      zoomBy,
      centerOn,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onKeyDown = (e) => {
    const p = st.props;
    const cur = p.selectedId != null ? st.byId.get(p.selectedId) : null;
    const choose = (id) => {
      if (id != null) {
        e.preventDefault();
        p.onSelect?.(id);
      }
    };
    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowLeft': {
        const order = st.timeOrder.filter((id) => visible(st.byId.get(id)));
        if (!order.length) return;
        const i = cur ? order.indexOf(cur.id) : -1;
        const next = e.key === 'ArrowRight' ? order[Math.min(order.length - 1, i + 1)] : order[Math.max(0, i === -1 ? 0 : i - 1)];
        choose(next);
        break;
      }
      case 'ArrowUp':
        choose(cur?.parent_id ?? (cur ? null : st.timeOrder[0]));
        break;
      case 'ArrowDown':
        choose(cur ? (st.childrenOf.get(cur.id) || [])[0] : st.timeOrder[0]);
        break;
      case 'Escape':
        if (cur) {
          e.preventDefault();
          p.onSelect?.(null);
        }
        break;
      case '+':
      case '=':
        e.preventDefault();
        zoomBy(1.3);
        break;
      case '-':
        e.preventDefault();
        zoomBy(1 / 1.3);
        break;
      case '0':
        e.preventDefault();
        st.userMoved = false;
        animateTo(fitTransform(), 500);
        break;
      default:
    }
  };

  return (
    <div ref={wrapRef} className="graph-canvas">
      <canvas
        ref={canvasRef}
        tabIndex={0}
        role="application"
        aria-roledescription="lineage graph"
        aria-label={ariaLabel || 'Claim lineage graph'}
        onKeyDown={onKeyDown}
      />
    </div>
  );
});
