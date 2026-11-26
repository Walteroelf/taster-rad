"use strict";
// Taster-Rad: Nachbau der Funktionen eines tastergesteuerten Zufallsdrehers (Prototyp).
const $ = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
const COLORS = ["#4DB2E6", "#FFD100", "#A6D27A", "#F39200", "#FFFFFF", "#46A84A", "#B9C1C8"];
const INK = "#0D2B4E";

const items = list => list.map(text => ({ text }));
const TEMPLATES = {
  dice:    { name: "Würfel 1–6", fields: [1, 2, 3, 4, 5, 6].map(n => ({ text: String(n), dice: n })) },
  colors:  { name: "Farben", fields: [["Blau", "#4DB2E6"], ["Gelb", "#FFD100"], ["Grün", "#46A84A"], ["Orange", "#F39200"]].map(([text, color]) => ({ text, color })) },
  numbers: { name: "Zahlen 1–10", fields: items(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) },
  yesno:   { name: "Ja / Nein", fields: [{ text: "Ja", color: "#46A84A" }, { text: "Nein", color: "#F39200" }] },
};

const DEFAULTS = {
  screenTap: true, useSwitch: true, trigger: "press", anyKey: true, keys: [" ", "Enter"],
  duration: 5, lock: 8, innerOn: true, skipDrawn: false, sound: true, speak: false,
  outer: "dice", inner: "dice", own: items(["A", "B", "C"]),
};
const STORE = "taster-rad-v1";
let settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem(STORE) || "{}")); } catch {}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(settings)); }
  catch { $("status").textContent = "Speichern nicht möglich (Speicher voll oder gesperrt)."; }
}

const template = key => key === "own" ? { name: "Eigene Vorlage", fields: settings.own } : TEMPLATES[key] || TEMPLATES.dice;

/* ---------- Zeichnen ---------- */
function el(tag, attrs = {}, parent) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (parent) parent.append(node);
  return node;
}
const point = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; };
function segmentPath(r0, r1, from, to) {
  const big = to - from > 180 ? 1 : 0;
  const [a, b, c, d] = [point(r1, from), point(r1, to), point(r0, to), point(r0, from)];
  return `M${a} A${r1} ${r1} 0 ${big} 1 ${b} L${c} A${r0} ${r0} 0 ${big} 0 ${d}Z`;
}
function die(n, size, parent) {
  const g = el("g", {}, parent), s = size / 2;
  el("rect", { x: -s, y: -s, width: size, height: size, rx: size / 6, fill: "#fff", stroke: INK, "stroke-width": 1.5 }, g);
  const L = -s / 2, R = s / 2;
  const pips = { 1: [[0, 0]], 2: [[L, L], [R, R]], 3: [[L, L], [0, 0], [R, R]], 4: [[L, L], [R, L], [L, R], [R, R]],
    5: [[L, L], [R, L], [0, 0], [L, R], [R, R]], 6: [[L, L], [R, L], [L, 0], [R, 0], [L, R], [R, R]] };
  for (const [x, y] of pips[n]) el("circle", { cx: x, cy: y, r: size / 11, fill: INK }, g);
}
function drawRing(parent, fields, r0, r1) {
  const n = fields.length, step = 360 / n;
  return fields.map((f, i) => {
    const g = el("g", {}, parent);
    let color = f.color || COLORS[i % COLORS.length];
    if (!f.color && i === n - 1 && i % COLORS.length === 0 && n > 1) color = COLORS[3];
    el("path", { d: segmentPath(r0, r1, i * step - step / 2, i * step + step / 2), fill: color, stroke: INK, "stroke-width": 1.5 }, g);
    const mid = r0 === 0 ? r1 * 0.68 : (r0 + r1) / 2;
    const width = Math.min(2 * mid * Math.sin(Math.PI / Math.max(n, 2)) * 0.75, (r1 - r0) * 0.75, 70);
    const content = el("g", { transform: `rotate(${i * step}) translate(0 ${-mid})` }, g);
    if (f.image) {
      el("image", { href: f.image, x: -width / 2, y: -width / 2, width, height: width, preserveAspectRatio: "xMidYMid meet" }, content);
    } else if (f.dice) {
      die(f.dice, width * 0.8, content);
    } else {
      const size = Math.max(9, Math.min(30, width * 1.5 / Math.max(f.text.length, 1.5)));
      el("text", { "text-anchor": "middle", "dominant-baseline": "central", "font-size": size, "font-weight": 700, fill: INK }, content).textContent = f.text;
    }
    return g;
  });
}

let outerParts = [], innerParts = [], innerGroup, arrow;
let arrowAngle = 0, innerAngle = 0, drawn = new Set(), spinning = false;

function render() {
  const wheel = $("wheel");
  wheel.replaceChildren();
  outerParts = drawRing(el("g", {}, wheel), template(settings.outer).fields, 112, 200);
  innerGroup = el("g", {}, wheel);
  if (settings.innerOn) innerParts = drawRing(innerGroup, template(settings.inner).fields, 0, 104);
  else { innerParts = []; el("circle", { r: 104, fill: "#fff", stroke: INK, "stroke-width": 1.5 }, innerGroup); }
  // Zeiger reicht bis an den Außenring
  arrow = el("g", {}, wheel);
  el("path", { d: "M0-128 L13-86 H6 V34 H-6 V-86 H-13 Z", fill: INK, stroke: "#fff", "stroke-width": 2.5 }, arrow);
  el("circle", { r: 13, fill: "#fff", stroke: INK, "stroke-width": 4 }, arrow);
  turn();
  markDrawn();
  $("reset").hidden = !(settings.skipDrawn && drawn.size);
}
function turn() {
  arrow.setAttribute("transform", `rotate(${arrowAngle})`);
  innerGroup.setAttribute("transform", `rotate(${innerAngle})`);
}
function markDrawn() {
  outerParts.forEach((g, i) => g.setAttribute("opacity", settings.skipDrawn && drawn.has(i) ? 0.25 : 1));
}

/* ---------- Ton und Sprache ---------- */
let audio;
function unlockAudio() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state !== "running") audio.resume(); } catch {}
}
function beep(freq, length) {
  if (!settings.sound || !audio) return;
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + length);
}

/* ---------- Drehen ---------- */
function random() { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; }
const mod = (a, n) => ((a % n) + n) % n;
const fieldAt = (angle, n) => Math.floor(mod(angle + 180 / n, 360) / (360 / n));

let lockedUntil = 0, lockTimer;
function showLock() {
  const left = Math.ceil((lockedUntil - performance.now()) / 1000);
  const blocked = spinning || left > 0;
  $("spin").disabled = blocked || !settings.screenTap;
  $("status").textContent = !spinning && left > 0 ? `Gleich wieder bereit: ${left}` : "";
  clearTimeout(lockTimer);
  if (left > 0) lockTimer = setTimeout(showLock, 200);
}

function spin() {
  const now = performance.now();
  if (spinning || now < lockedUntil || $("settings").open) return;
  const outer = template(settings.outer).fields, n = outer.length;
  if (!settings.skipDrawn || drawn.size >= n) drawn.clear();
  markDrawn();
  const free = [...outer.keys()].filter(i => !drawn.has(i));
  const target = free[Math.floor(random() * free.length)];
  const step = 360 / n;
  const goal = target * step + (random() - 0.5) * step * 0.8;   // nicht auf der Trennlinie
  const from = arrowAngle, innerFrom = innerAngle;
  const to = from + 360 * Math.ceil(settings.duration * 0.8) + mod(goal - from, 360);
  let innerTo = innerFrom;
  if (settings.innerOn) {
    const m = template(settings.inner).fields.length;
    // Zielfeld innen unabhängig wählen: Zeigerwinkel minus Scheibenwinkel
    const innerGoal = Math.floor(random() * m) * 360 / m + (random() - 0.5) * 360 / m * 0.8;
    innerTo = innerFrom - 360 * 2 - mod(innerFrom - (to - innerGoal), 360);
  }
  spinning = true;
  lockedUntil = now + settings.lock * 1000;
  outerParts.concat(innerParts).forEach(g => g.classList.remove("treffer"));
  $("result").className = "ergebnis";
  $("result").textContent = "Dreht …";
  window.speechSynthesis?.cancel();
  showLock();
  let last = fieldAt(from, n);
  const length = settings.duration * 1000;
  function frame(time) {
    const p = Math.min(1, Math.max(0, (time - now) / length));
    const ease = 1 - Math.pow(1 - p, 3);
    arrowAngle = from + (to - from) * ease;
    innerAngle = innerFrom + (innerTo - innerFrom) * ease;
    turn();
    const current = fieldAt(arrowAngle, n);
    if (current !== last) { last = current; beep(700, 0.03); }
    if (p < 1) requestAnimationFrame(frame); else finish(target);
  }
  requestAnimationFrame(frame);
}

function finish(target) {
  spinning = false;
  const outer = template(settings.outer).fields;
  const hits = [["Außen", outer[target], target]];
  if (settings.innerOn) {
    const inner = template(settings.inner).fields;
    const i = fieldAt(arrowAngle - innerAngle, inner.length);
    hits.push(["Innen", inner[i], i]);
  }
  if (settings.skipDrawn) drawn.add(target);
  outerParts.forEach((g, i) => g.setAttribute("opacity", i === target ? 1 : 0.35));
  innerParts.forEach((g, i) => g.setAttribute("opacity", i === hits[1][2] ? 1 : 0.35));
  const box = $("result");
  box.className = "ergebnis fertig";
  box.replaceChildren();
  const words = [];
  for (const [place, field, i] of hits) {
    const line = document.createElement("div");
    if (hits.length > 1) { const s = document.createElement("small"); s.textContent = place + ": "; line.append(s); }
    if (field.image) { const img = new Image(); img.src = field.image; img.alt = field.text; line.append(img); }
    const text = field.text || `Feld ${i + 1}`;
    line.append(" " + text);
    words.push(text);
    box.append(line);
  }
  beep(1000, 0.4);
  if (settings.speak && window.speechSynthesis) {
    const u = new SpeechSynthesisUtterance(words.join(" und "));
    u.lang = "de-DE";
    speechSynthesis.speak(u);
  }
  $("reset").hidden = !(settings.skipDrawn && drawn.size);
  showLock();
}

/* ---------- Ansteuerung: Touch ---------- */
function touch() { if (settings.screenTap) { unlockAudio(); spin(); } }
$("wheel").addEventListener("click", touch);
$("spin").addEventListener("click", touch);
$("stage").addEventListener("contextmenu", e => e.preventDefault());

/* ---------- Ansteuerung: Taster (meldet sich als Tastatur) ---------- */
const MODIFIERS = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "Unidentified"];
const KEY_NAMES = { " ": "Leertaste", Enter: "Enter", ArrowLeft: "Pfeil links", ArrowRight: "Pfeil rechts", ArrowUp: "Pfeil hoch", ArrowDown: "Pfeil runter" };
const keyName = k => KEY_NAMES[k] || k.toUpperCase();
const counts = k => settings.useSwitch && (settings.anyKey || settings.keys.includes(k));
let learning = false, held = null;

document.addEventListener("keydown", e => {
  if (MODIFIERS.includes(e.key) || e.key === "Tab" || e.key === "Escape" || e.metaKey || e.ctrlKey) return;
  if ($("settings").open) {
    if (!learning && e.target.matches("input, select")) return;   // normal tippen
    e.preventDefault();
    if (learning) {
      learning = false;
      settings.keys = [e.key];
      settings.anyKey = false;
      save(); fillForm();
    }
    $("switchTest").classList.add("down");
    $("switchTest").textContent = `Angekommen: ${keyName(e.key)} (${counts(e.key) ? "zählt" : "zählt nicht"})`;
    return;
  }
  if (!counts(e.key)) return;
  e.preventDefault();                       // kein Scrollen, keine Knöpfe auslösen
  if (e.repeat || held !== null) return;    // Halten wiederholt nicht
  held = e.key;
  unlockAudio();
  if (settings.trigger === "press") spin();
});
document.addEventListener("keyup", e => {
  $("switchTest").classList.remove("down");
  if (e.key !== held) return;
  e.preventDefault();
  held = null;
  if (settings.trigger === "release") spin();
});
window.addEventListener("blur", () => { held = null; });

/* ---------- Einstellungen ---------- */
const CHECKS = ["screenTap", "useSwitch", "anyKey", "innerOn", "skipDrawn", "sound", "speak"];
function fillForm() {
  CHECKS.forEach(k => $(k).checked = settings[k]);
  for (const k of ["trigger", "duration", "lock"]) $(k).value = settings[k];
  $("durationOut").textContent = settings.duration + " s";
  $("lockOut").textContent = settings.lock + " s";
  for (const [id, key] of [["outerSelect", "outer"], ["innerSelect", "inner"]]) {
    $(id).replaceChildren(...[...Object.keys(TEMPLATES), "own"].map(k => new Option(template(k).name, k)));
    $(id).value = settings[key];
  }
}
function changed() { drawn.clear(); save(); fillForm(); render(); document.body.classList.toggle("touch", settings.screenTap); showLock(); }
CHECKS.forEach(k => $(k).addEventListener("change", e => { settings[k] = e.target.checked; changed(); }));
$("trigger").addEventListener("change", e => { settings.trigger = e.target.value; changed(); });
for (const k of ["duration", "lock"]) $(k).addEventListener("input", e => { settings[k] = Number(e.target.value); changed(); });
$("outerSelect").addEventListener("change", e => { settings.outer = e.target.value; changed(); });
$("innerSelect").addEventListener("change", e => { settings.inner = e.target.value; changed(); });
$("learn").addEventListener("click", () => { learning = true; $("learn").blur(); $("switchTest").textContent = "Jetzt den Taster drücken …"; });
$("openSettings").addEventListener("click", () => { if (spinning) return; fillForm(); fieldList(); $("settings").showModal(); });
$("closeSettings").addEventListener("click", () => $("settings").close());
$("settings").addEventListener("close", () => { learning = false; held = null; $("openSettings").blur(); render(); });
$("reset").addEventListener("click", () => { drawn.clear(); $("reset").blur(); render(); });

/* ---------- Eigene Vorlage ---------- */
function fieldList() {
  $("fields").replaceChildren(...settings.own.map((field, i) => {
    const row = document.createElement("div");
    row.className = "feld";
    const text = Object.assign(document.createElement("input"), { type: "text", value: field.text, maxLength: 14 });
    text.setAttribute("aria-label", `Text für Feld ${i + 1}`);
    text.addEventListener("input", () => { field.text = text.value; changed(); });
    row.append(text);
    if (field.image) row.append(Object.assign(new Image(), { src: field.image, alt: "" }));
    const file = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" });
    file.addEventListener("change", () => addImage(field, file.files[0]));
    const button = (label, action, off) => {
      const b = Object.assign(document.createElement("button"), { type: "button", className: "knopf leise", textContent: label, disabled: off });
      b.addEventListener("click", action);
      return b;
    };
    row.append(file,
      button(field.image ? "Bild weg" : "Bild", () => { if (field.image) { delete field.image; changed(); fieldList(); } else file.click(); }),
      button("Löschen", () => { settings.own.splice(i, 1); changed(); fieldList(); }, settings.own.length <= 2));
    return row;
  }));
  $("addField").disabled = settings.own.length >= 26;
}
$("addField").addEventListener("click", () => { settings.own.push({ text: "" }); settings.outer = "own"; changed(); fieldList(); });
async function addImage(field, file) {
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width * scale, height: bitmap.height * scale });
    canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    field.image = canvas.toDataURL("image/png");
    settings.outer = "own";
    changed(); fieldList();
  } catch { $("status").textContent = "Das Bild konnte nicht geladen werden."; }
}

fillForm();
changed();

/* ---------- Offline ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { $("offline").textContent = "Offline-Betrieb nicht möglich."; });
  navigator.serviceWorker.ready.then(() => { $("offline").textContent = "Bereit für offline."; });
  navigator.storage?.persist?.();
}
