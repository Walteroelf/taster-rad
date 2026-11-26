"use strict";
/* Szenen. Jede Szene zeichnet in ein Element und kann:
     start()                    endlos laufen (für „selbst stoppen“)
     finish(ms, fertig)         in ms Millisekunden auf ein Zufallsergebnis auslaufen
     destroy()                  Bewegung beenden
   Das Ergebnis ist { teile: [{ text, image, icon }], summe? }. */
const NS = "http://www.w3.org/2000/svg";
const COLORS = ["#4DB2E6", "#FFD100", "#A6D27A", "#F39200", "#FFFFFF", "#46A84A", "#B9C1C8"];
const INK = "#0D2B4E";
const ICONS = {
  musik: "M-8 12V-12L12-16V8M-8 12a5 5 0 1 1-10 0a5 5 0 1 1 10 0M12 8a5 5 0 1 1-10 0a5 5 0 1 1 10 0",
  buch: "M0-10C-6-15-14-14-17-12V13C-12 10-5 11 0 15C5 11 12 10 17 13V-12C14-14 6-15 0-10V15",
  ball: "M-15 0a15 15 0 1 0 30 0a15 15 0 1 0-30 0M-15 0H15M0-15C9-6 9 6 0 15M0-15C-9-6-9 6 0 15",
  malen: "M-14 14L-10 3L8-15L15-8L-3 10ZM2-9L9-2",
};

const random = () => crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296;
const randomInt = n => Math.floor(random() * n);
const mod = (a, n) => ((a % n) + n) % n;
const easeOut = p => 1 - Math.pow(1 - p, 3);

function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}

/* Ruft step(ms seit Start) in jedem Bild auf, bis step false liefert. */
function animator() {
  let id = 0;
  return {
    run(step) {
      cancelAnimationFrame(id);
      let begin;
      const frame = time => {
        begin ??= time;
        if (step(time - begin) !== false) id = requestAnimationFrame(frame);
      };
      id = requestAnimationFrame(frame);
    },
    stop() { cancelAnimationFrame(id); },
  };
}

function die(n, size, parent) {
  const g = el("g", {}, parent);
  el("rect", { x: -size / 2, y: -size / 2, width: size, height: size, rx: size / 6, fill: "#fff", stroke: INK, "stroke-width": size / 34 }, g);
  const a = -size / 4, b = size / 4;
  const pips = { 1: [[0, 0]], 2: [[a, a], [b, b]], 3: [[a, a], [0, 0], [b, b]], 4: [[a, a], [b, a], [a, b], [b, b]],
    5: [[a, a], [b, a], [0, 0], [a, b], [b, b]], 6: [[a, a], [b, a], [a, 0], [b, 0], [a, b], [b, b]] };
  for (const [x, y] of pips[n]) el("circle", { cx: x, cy: y, r: size / 11, fill: INK }, g);
  return g;
}

/* Inhalt eines Feldes, zentriert um 0/0, in einem Quadrat der Kantenlänge size. */
function drawContent(field, size, parent) {
  if (field.image) el("image", { href: field.image, x: -size / 2, y: -size / 2, width: size, height: size, preserveAspectRatio: "xMidYMid meet" }, parent);
  else if (field.dice) die(field.dice, size * 0.85, parent);
  else if (field.icon) el("path", { d: ICONS[field.icon], transform: `scale(${size / 40})`, fill: "none", stroke: INK, "stroke-width": 2.5, "stroke-linecap": "round", "stroke-linejoin": "round" }, parent);
  else {
    const text = field.text || "";
    el("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": Math.min(size * 0.62, size * 1.6 / Math.max(text.length, 1)), "font-weight": 700, fill: INK }, parent).textContent = text;
  }
}

/* ---------- Rad ---------- */
const point = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; };
const fieldAt = (angle, n) => Math.floor(mod(angle + 180 / n, 360) / (360 / n));

function drawRing(parent, fields, r0, r1) {
  const n = fields.length, step = 360 / n;
  return fields.map((f, i) => {
    const g = el("g", {}, parent);
    let color = f.color || COLORS[i % COLORS.length];
    if (!f.color && i === n - 1 && i % COLORS.length === 0) color = COLORS[3];
    el("path", { d: `M${point(r1, i * step - step / 2)} A${r1} ${r1} 0 ${step > 180 ? 1 : 0} 1 ${point(r1, i * step + step / 2)} L${point(r0, i * step + step / 2)} A${r0 || 0.01} ${r0 || 0.01} 0 ${step > 180 ? 1 : 0} 0 ${point(r0, i * step - step / 2)}Z`, fill: color, stroke: INK, "stroke-width": 1.5 }, g);
    const mid = r0 === 0 ? r1 * 0.66 : (r0 + r1) / 2;
    const size = Math.min(2 * mid * Math.sin(Math.PI / Math.max(n, 2)) * 0.75, (r1 - r0) * 0.75, 70);
    drawContent(f, size, el("g", { transform: `rotate(${i * step}) translate(0 ${-mid})` }, g));
    return g;
  });
}

function sceneWheel(box, { fields, inner, drawn, tick }) {
  const svg = el("svg", { viewBox: "-205 -205 410 410", role: "img", "aria-label": "Rad" }, box);
  const outerR = inner ? 112 : 0;
  const outer = drawRing(el("g", {}, svg), fields, outerR, 200);
  const disc = el("g", {}, svg);
  const innerParts = inner ? drawRing(disc, inner, 0, 104) : [];
  const arrow = el("g", {}, svg);
  el("path", { d: "M0-128 L13-86 H6 V34 H-6 V-86 H-13 Z", fill: INK, stroke: "#fff", "stroke-width": 2.5 }, arrow);
  el("circle", { r: 13, fill: "#fff", stroke: INK, "stroke-width": 4 }, arrow);
  let angle = 0, discAngle = 0, last = 0;
  const anim = animator(), n = fields.length;
  const dim = (parts, hit) => parts.forEach((g, i) => g.setAttribute("opacity", hit === undefined ? (parts === outer && drawn.has(i) ? 0.25 : 1) : i === hit ? 1 : 0.3));
  function turn() {
    arrow.setAttribute("transform", `rotate(${angle})`);
    disc.setAttribute("transform", `rotate(${discAngle})`);
    const now = fieldAt(angle, n);
    if (now !== last) { last = now; tick(); }
  }
  dim(outer); turn();
  return {
    start() {
      dim(outer); dim(innerParts);
      const a = angle, d = discAngle;
      anim.run(t => { angle = a + t * 0.36; discAngle = d - t * 0.18; turn(); });
    },
    finish(ms, done) {
      dim(outer); dim(innerParts);
      const free = [...fields.keys()].filter(i => !drawn.has(i));
      const target = free[randomInt(free.length)];
      const goal = target * 360 / n + (random() - 0.5) * 288 / n;   // nicht auf der Trennlinie
      const a = angle, d = discAngle;
      const to = a + 360 * Math.max(1, Math.round(ms / 1500)) + mod(goal - a, 360);
      let discTo = d;
      if (inner) {
        const m = inner.length;
        const innerGoal = randomInt(m) * 360 / m + (random() - 0.5) * 288 / m;
        discTo = d - 360 - mod(d - (to - innerGoal), 360);
      }
      anim.run(t => {
        const p = Math.min(1, t / ms);
        angle = a + (to - a) * easeOut(p); discAngle = d + (discTo - d) * easeOut(p); turn();
        if (p < 1) return;
        const teile = [fields[target]];
        dim(outer, target);
        if (inner) { const i = fieldAt(angle - discAngle, inner.length); teile.push(inner[i]); dim(innerParts, i); }
        done({ teile, index: target });
        return false;
      });
    },
    destroy: anim.stop,
  };
}

/* ---------- Würfel ---------- */
function sceneDice(box, { count, sum, tick }) {
  const width = count * 130 + 20;
  const svg = el("svg", { viewBox: `0 0 ${width} 170`, role: "img", "aria-label": "Würfel" }, box);
  const places = Array.from({ length: count }, (_, i) => el("g", { transform: `translate(${75 + i * 130} 85)` }, svg));
  const show = (values, tilt) => places.forEach((g, i) => {
    g.replaceChildren();
    die(values[i], 100, g).setAttribute("transform", `rotate(${tilt ? (random() - 0.5) * 36 : 0})`);
  });
  let values = places.map((_, i) => 1 + (i % 6));
  show(values);
  const anim = animator();
  const roll = () => { values = values.map(v => 1 + mod(v + randomInt(5), 6)); show(values, true); tick(); };
  return {
    start() { let next = 0; anim.run(t => { if (t >= next) { next = t + 160; roll(); } }); },
    finish(ms, done) {
      let next = 0;
      anim.run(t => {
        if (t < ms) { if (t >= next) { next = t + 120 + 380 * (t / ms) ** 2; roll(); } return; }
        values = values.map(() => 1 + randomInt(6));
        show(values);
        done({ teile: values.map(v => ({ text: String(v), dice: v })), summe: sum && count > 1 ? values.reduce((a, b) => a + b) : undefined });
        return false;
      });
    },
    destroy: anim.stop,
  };
}

/* ---------- Lichtfeld ---------- */
function sceneLight(box, { fields, drawn, names, tick }) {
  const grid = document.createElement("div");
  grid.className = "lichtfeld";
  const cards = fields.map((f, i) => {
    const card = document.createElement("div");
    card.className = "licht";
    const hasPicture = f.image || f.icon || f.dice;
    const svg = el("svg", { viewBox: "-30 -30 60 60", "aria-hidden": "true" }, card);
    if (f.color && !hasPicture) card.style.setProperty("--feldfarbe", f.color);
    drawContent(f, hasPicture ? 48 : 56, svg);
    if (hasPicture && names && f.text && !f.dice) card.append(Object.assign(document.createElement("span"), { textContent: f.text }));
    card.classList.toggle("gezogen", drawn.has(i));
    grid.append(card);
    return card;
  });
  box.append(grid);
  // Spaltenzahl so wählen, dass die Felder möglichst groß werden
  function layout() {
    const { width, height } = box.getBoundingClientRect(), n = cards.length;
    let best = 1, size = 0;
    for (let c = 1; c <= n; c++) {
      const s = Math.min(width / c, height / Math.ceil(n / c));
      if (s > size) { size = s; best = c; }
    }
    grid.style.gridTemplateColumns = `repeat(${best}, ${Math.floor(size - 12)}px)`;
    grid.style.gridAutoRows = `${Math.floor(size - 12)}px`;
  }
  const observer = new ResizeObserver(layout);
  observer.observe(box);
  const anim = animator();
  let current = -1;
  const light = i => {
    if (i === current) return;
    cards[current]?.classList.remove("an");
    current = i;
    cards[i].classList.add("an");
    tick();
  };
  const free = () => [...fields.keys()].filter(i => !drawn.has(i));
  const reset = () => { grid.classList.remove("fertig"); cards.forEach((c, i) => c.classList.toggle("gezogen", drawn.has(i))); };
  return {
    start() {
      reset();
      const list = free(), from = list.indexOf(current) + 1;
      anim.run(t => { light(list[mod(from + Math.floor(t / 300), list.length)]); });
    },
    finish(ms, done) {
      reset();
      const list = free(), n = list.length, from = Math.max(0, list.indexOf(current));
      const target = randomInt(n);
      const base = Math.round(ms / 330);
      const steps = base + mod(target - from - base, n);
      anim.run(t => {
        const p = Math.min(1, t / ms);
        light(list[mod(from + Math.round(steps * easeOut(p)), n)]);
        if (p < 1) return;
        grid.classList.add("fertig");
        done({ teile: [fields[list[target]]], index: list[target] });
        return false;
      });
    },
    destroy() { anim.stop(); observer.disconnect(); },
  };
}

const SCENES = { rad: sceneWheel, wuerfel: sceneDice, licht: sceneLight };
