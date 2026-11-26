"use strict";
// Taster-Rad: Kacheln (Szene + Inhalt + Verhalten), Ansteuerung, Lehrkraft-Bereich.
const $ = id => document.getElementById(id);
const items = list => list.map(text => ({ text }));
const BUILTIN = {
  dice:    { name: "Würfel 1–6", fields: [1, 2, 3, 4, 5, 6].map(n => ({ text: String(n), dice: n })) },
  colors:  { name: "Farben", fields: [["Blau", "#4DB2E6"], ["Gelb", "#FFD100"], ["Grün", "#46A84A"], ["Orange", "#F39200"]].map(([text, color]) => ({ text, color })) },
  numbers: { name: "Zahlen 1–10", fields: items(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]) },
  yesno:   { name: "Ja / Nein", fields: [{ text: "Ja", color: "#46A84A" }, { text: "Nein", color: "#F39200" }] },
  pause:   { name: "Pause", fields: [["Musik", "musik"], ["Lesen", "buch"], ["Ball", "ball"], ["Malen", "malen"]].map(([text, icon]) => ({ text, icon })) },
};
const SCENE_NAMES = { rad: "Rad", wuerfel: "Würfel", licht: "Lichtfeld" };
const MODE_NAMES = { random: "Zufall: stoppt selbst", stop: "Selbst stoppen: 2 × drücken" };

const newTile = extra => ({ id: crypto.randomUUID?.() || String(Date.now() + Math.random()), name: "Neue Kachel", scene: "rad", content: "dice", mode: "random",
  duration: 5, inner: "", count: 1, sum: true, names: true, skip: false, ...extra });
const DEFAULTS = () => ({
  screenTap: true, useSwitch: true, trigger: "press", anyKey: true, keys: [" ", "Enter"], lock: 8, sound: true, speak: false,
  sets: [], active: "t1",
  tiles: [
    newTile({ id: "t1", name: "Würfel-Rad", inner: "dice" }),
    newTile({ id: "t2", name: "Zwei Würfel", scene: "wuerfel", count: 2, duration: 3 }),
    newTile({ id: "t3", name: "Pause wählen", scene: "licht", content: "pause" }),
  ],
});

const STORE = "taster-rad-v2";
let data = DEFAULTS();
try {
  const saved = JSON.parse(localStorage.getItem(STORE));
  if (saved?.tiles?.length) Object.assign(data, saved);
  else {
    // eigene Vorlage aus der ersten Fassung übernehmen
    const old = JSON.parse(localStorage.getItem("taster-rad-v1") || localStorage.getItem("drehrad-v1"));
    if (old?.own) {
      data.sets.push({ id: "own-1", name: "Eigene Vorlage", fields: old.own });
      data.tiles.push(newTile({ name: "Eigene Vorlage", content: "own-1" }));
    }
  }
} catch {}
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(data)); $("message").textContent = ""; }
  catch { $("message").textContent = "Speichern nicht möglich: Speicher voll oder gesperrt. Entferne ein Bild."; }
}

const setFor = id => BUILTIN[id] || data.sets.find(s => s.id === id) || BUILTIN.dice;
const activeTile = () => data.tiles.find(t => t.id === data.active) || data.tiles[0];

/* ---------- Ton und Sprache ---------- */
let audio;
function unlockAudio() {
  try { audio ||= new (window.AudioContext || window.webkitAudioContext)(); if (audio.state !== "running") audio.resume(); } catch {}
}
function beep(freq, length) {
  if (!data.sound || !audio) return;
  const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + length);
  o.connect(g).connect(audio.destination);
  o.start(t); o.stop(t + length);
}

/* ---------- Spiel ---------- */
let scene, state = "bereit", startedAt = 0, lockedUntil = 0, lockLength = 0, lockTimer;
const drawn = new Set();

function mount() {
  scene?.destroy();
  speechSynthesisCancel();
  const tile = activeTile(), fields = setFor(tile.content).fields;
  $("scene").replaceChildren();
  $("result").className = "";
  $("result").replaceChildren();
  state = "bereit";
  scene = SCENES[tile.scene]($("scene"), {
    fields, drawn, count: Number(tile.count), sum: tile.sum, names: tile.names,
    inner: tile.inner ? setFor(tile.inner).fields : null,
    tick: () => beep(700, 0.03),
  });
}
const speechSynthesisCancel = () => window.speechSynthesis?.cancel();

function showLock() {
  clearTimeout(lockTimer);
  const left = lockedUntil - performance.now();
  const show = left > 0 && state === "bereit";
  $("lockRing").hidden = !show;
  if (show) $("lockRing").style.setProperty("--anteil", `${100 - left / lockLength * 100}%`);
  if (left > 0) lockTimer = setTimeout(showLock, 100);
}
function lockFrom(now) { lockLength = data.lock * 1000; lockedUntil = now + lockLength; }

function press() {
  if ($("menu").open) return;
  const now = performance.now(), tile = activeTile();
  if (state === "läuft") {
    if (now - startedAt < 800) return;   // Doppeldruck abfangen
    lockFrom(now);
    state = "endet";
    scene.finish(1800, finish);
    return;
  }
  if (state !== "bereit" || now < lockedUntil) return;
  const fields = setFor(tile.content).fields;
  if (!tile.skip || drawn.size >= fields.length) {
    if (drawn.size) { drawn.clear(); mount(); }
  }
  $("result").className = "";
  $("result").replaceChildren();
  speechSynthesisCancel();
  startedAt = now;
  if (tile.mode === "stop") { state = "läuft"; scene.start(); }
  else { state = "endet"; lockFrom(now); scene.finish(tile.duration * 1000, finish); }
  showLock();
}

function finish(result) {
  state = "bereit";
  const tile = activeTile();
  if (tile.skip && result.index !== undefined) drawn.add(result.index);
  const box = $("result");
  box.className = "fertig";
  box.replaceChildren();
  const label = f => f.text || (f.image ? "" : "?");
  if (result.summe !== undefined) box.append(String(result.summe));
  else if (tile.scene !== "wuerfel" || result.teile.length === 1) {
    result.teile.forEach((f, i) => {
      if (i) box.append("·");
      if (f.image) box.append(Object.assign(new Image(), { src: f.image, alt: f.text || "Bild" }));
      if (label(f)) box.append(label(f));
    });
  } else box.append(result.teile.map(f => f.text).join(" · "));
  beep(1000, 0.4);
  if (data.speak && window.speechSynthesis) {
    const words = result.teile.map(f => f.text).filter(Boolean).join(" und ");
    const u = new SpeechSynthesisUtterance(result.summe !== undefined ? `${words}. Zusammen ${result.summe}` : words);
    u.lang = "de-DE";
    speechSynthesis.speak(u);
  }
  showLock();
}

/* ---------- Ansteuerung: Touch ---------- */
$("play").addEventListener("click", () => { if (data.screenTap) { unlockAudio(); press(); } });
$("play").addEventListener("contextmenu", e => e.preventDefault());

/* ---------- Ansteuerung: Taster (meldet sich als Tastatur) ---------- */
const MODIFIERS = ["Shift", "Control", "Alt", "Meta", "CapsLock", "Fn", "Unidentified"];
const KEY_NAMES = { " ": "Leertaste", Enter: "Enter", ArrowLeft: "Pfeil links", ArrowRight: "Pfeil rechts", ArrowUp: "Pfeil hoch", ArrowDown: "Pfeil runter" };
const keyName = k => KEY_NAMES[k] || k.toUpperCase();
const counts = k => data.useSwitch && (data.anyKey || data.keys.includes(k));
let learning = false, held = null;

document.addEventListener("keydown", e => {
  if (!$("menu").open && e.key === "Escape") { e.preventDefault(); openMenu(); return; }   // Tastatur der Lehrkraft
  if (MODIFIERS.includes(e.key) || e.key === "Tab" || e.key === "Escape" || e.metaKey || e.ctrlKey) return;
  if ($("menu").open) {
    const testing = !$("home").hidden && $("device").open;
    if (!testing || (!learning && e.target.matches("input, select"))) return;
    e.preventDefault();
    if (learning) { learning = false; data.keys = [e.key]; data.anyKey = false; save(); fillDevice(); }
    $("switchTest").classList.add("down");
    $("switchTest").textContent = `Angekommen: ${keyName(e.key)} (${counts(e.key) ? "zählt" : "zählt nicht"})`;
    return;
  }
  if (!counts(e.key)) return;
  e.preventDefault();                       // kein Scrollen, keine Knöpfe auslösen
  if (e.repeat || held !== null) return;    // Halten wiederholt nicht
  held = e.key;
  unlockAudio();
  if (data.trigger === "press") press();
});
document.addEventListener("keyup", e => {
  $("switchTest").classList.remove("down");
  if (e.key !== held) return;
  e.preventDefault();
  held = null;
  if (data.trigger === "release") press();
});
window.addEventListener("blur", () => { held = null; });

/* ---------- Zahnrad: 2 Sekunden halten ---------- */
let holdFrame = 0, holdTimer;
const gear = $("gear");
function endHold() { cancelAnimationFrame(holdFrame); clearTimeout(holdTimer); gear.classList.remove("haelt"); }
gear.addEventListener("pointerdown", () => {
  endHold();
  const begin = performance.now();
  gear.classList.add("haelt");
  // Der Zeitgeber öffnet, die Animation zeigt nur den Fortschritt
  holdTimer = setTimeout(() => { endHold(); openMenu(); }, 2000);
  const step = () => {
    gear.style.setProperty("--anteil", `${(performance.now() - begin) / 20}%`);
    holdFrame = requestAnimationFrame(step);
  };
  step();
});
for (const type of ["pointerup", "pointerleave", "pointercancel"]) gear.addEventListener(type, endHold);
gear.addEventListener("contextmenu", e => e.preventDefault());

/* ---------- Lehrkraft-Bereich: Kacheln ---------- */
let editing;
function openMenu() {
  if ($("menu").open) return;
  scene.destroy();
  speechSynthesisCancel();
  held = null;
  showHome();
  $("menu").showModal();
}
$("menu").addEventListener("close", () => { learning = false; held = null; gear.blur(); drawn.clear(); lockedUntil = 0; showLock(); mount(); });
$("close").addEventListener("click", () => $("menu").close());

const button = (label, action, className = "knopf leise") => {
  const b = Object.assign(document.createElement("button"), { type: "button", className, textContent: label });
  b.addEventListener("click", action);
  return b;
};
function tileIcon(kind) {
  const svg = el("svg", { viewBox: "0 0 60 60", "aria-hidden": "true" });
  if (kind === "rad") {
    el("circle", { cx: 30, cy: 30, r: 24, fill: "#4DB2E6", stroke: INK, "stroke-width": 2 }, svg);
    el("path", { d: "M30 30V6A24 24 0 0 1 51 42Z", fill: "#FFD100", stroke: INK, "stroke-width": 2 }, svg);
  } else if (kind === "wuerfel") die(3, 42, el("g", { transform: "translate(30 30)" }, svg));
  else [0, 1, 2, 3].forEach(i => el("rect", { x: 7 + (i % 2) * 25, y: 7 + Math.floor(i / 2) * 25, width: 21, height: 21, rx: 5, fill: i === 2 ? "#FFD100" : "#B9C1C8", stroke: INK, "stroke-width": i === 2 ? 3 : 1 }, svg));
  return svg;
}
function showHome() {
  $("home").hidden = false; $("editor").hidden = true;
  const cards = data.tiles.map(tile => {
    const card = document.createElement("div");
    card.className = "kachel" + (tile.id === data.active ? " aktiv" : "");
    const start = button("", () => { data.active = tile.id; save(); $("menu").close(); }, "start");
    start.append(tileIcon(tile.scene), tile.name || "Ohne Namen");
    const edit = button("Bearbeiten", () => showEditor(tile), "");
    edit.setAttribute("aria-label", `${tile.name} bearbeiten`);
    card.append(start, edit);
    return card;
  });
  const add = document.createElement("div");
  add.className = "kachel neu";
  add.append(button("+ Neue Kachel", () => { const t = newTile(); data.tiles.push(t); save(); showEditor(t); }, ""));
  $("tiles").replaceChildren(...cards, add);
  fillDevice();
}

/* ---------- Gerät und Ansteuerung ---------- */
const DEVICE_CHECKS = ["screenTap", "useSwitch", "anyKey", "sound", "speak"];
function fillDevice() {
  DEVICE_CHECKS.forEach(k => $(k).checked = data[k]);
  $("trigger").value = data.trigger; $("lock").value = data.lock; $("lockOut").textContent = data.lock + " s";
  document.body.classList.toggle("touch", data.screenTap);
}
DEVICE_CHECKS.forEach(k => $(k).addEventListener("change", e => { data[k] = e.target.checked; save(); fillDevice(); }));
$("trigger").addEventListener("change", e => { data.trigger = e.target.value; save(); });
$("lock").addEventListener("input", e => { data.lock = Number(e.target.value); save(); fillDevice(); });
$("learn").addEventListener("click", () => { learning = true; $("learn").blur(); $("switchTest").textContent = "Jetzt den Taster drücken …"; });

/* ---------- Kachel bearbeiten ---------- */
function showEditor(tile) {
  editing = tile;
  $("home").hidden = true; $("editor").hidden = false;
  $("name").value = tile.name;
  fillEditor(); fieldList();
  $("menu").scrollTop = 0;
}
function fillEditor() {
  const t = editing;
  for (const [box, names, key] of [["sceneChoice", SCENE_NAMES, "scene"], ["modeChoice", MODE_NAMES, "mode"]]) {
    $(box).replaceChildren(...Object.entries(names).map(([value, label]) => {
      const b = button("", () => { t[key] = value; save(); fillEditor(); }, "");
      if (key === "scene") b.append(tileIcon(value), document.createElement("br"));
      b.append(label);
      if (key === "scene") { b.firstChild.setAttribute("width", 40); b.firstChild.setAttribute("height", 40); }
      b.setAttribute("aria-pressed", t[key] === value);
      return b;
    }));
  }
  const options = () => [...Object.entries(BUILTIN).map(([id, s]) => new Option(s.name, id)), ...data.sets.map(s => new Option(s.name || "Ohne Namen", s.id))];
  $("content").replaceChildren(...options()); $("content").value = t.content;
  $("inner").replaceChildren(new Option("keine", ""), ...options()); $("inner").value = t.inner;
  $("duration").value = t.duration; $("durationOut").textContent = t.duration + " s";
  $("count").value = t.count;
  for (const k of ["sum", "names", "skip"]) $(k).checked = t[k];
  $("contentBox").hidden = t.scene === "wuerfel";
  document.querySelectorAll("[data-for]").forEach(node => {
    const list = node.dataset.for.split(" ");
    node.hidden = !(list.includes(t.scene) || list.includes(t.mode));
  });
  const own = data.sets.find(s => s.id === t.content);
  $("own").hidden = !own;
  if (own) $("setName").value = own.name;
  $("remove").disabled = data.tiles.length < 2;
}
$("name").addEventListener("input", e => { editing.name = e.target.value; save(); });
for (const k of ["content", "inner"]) $(k).addEventListener("change", e => { editing[k] = e.target.value; save(); fillEditor(); fieldList(); });
$("duration").addEventListener("input", e => { editing.duration = Number(e.target.value); save(); fillEditor(); });
$("count").addEventListener("change", e => { editing.count = Number(e.target.value); save(); });
for (const k of ["sum", "names", "skip"]) $(k).addEventListener("change", e => { editing[k] = e.target.checked; save(); });
$("back").addEventListener("click", showHome);
$("use").addEventListener("click", () => { data.active = editing.id; save(); $("menu").close(); });
$("copy").addEventListener("click", () => {
  const t = { ...editing, id: newTile().id, name: `${editing.name} (Kopie)`.slice(0, 24) };
  data.tiles.push(t); save(); showEditor(t);
});
$("remove").addEventListener("click", () => {
  if (data.tiles.length < 2 || !confirm(`Kachel „${editing.name}“ löschen?`)) return;
  data.tiles = data.tiles.filter(t => t !== editing);
  if (data.active === editing.id) data.active = data.tiles[0].id;
  save(); showHome();
});

/* ---------- Eigene Sammlungen ---------- */
const ownSet = () => data.sets.find(s => s.id === editing.content);
$("newSet").addEventListener("click", () => {
  const set = { id: "own-" + newTile().id, name: `Sammlung ${data.sets.length + 1}`, fields: items(["A", "B", "C"]) };
  data.sets.push(set); editing.content = set.id; save(); fillEditor(); fieldList();
});
$("setName").addEventListener("input", e => { ownSet().name = e.target.value; save(); $("content").selectedOptions[0].textContent = e.target.value; });
function fieldList() {
  const set = ownSet();
  if (!set) { $("fields").replaceChildren(); return; }
  $("fields").replaceChildren(...set.fields.map((field, i) => {
    const row = document.createElement("div");
    row.className = "feld";
    const text = Object.assign(document.createElement("input"), { type: "text", value: field.text, maxLength: 14 });
    text.setAttribute("aria-label", `Text für Feld ${i + 1}`);
    text.addEventListener("input", () => { field.text = text.value; save(); });
    row.append(text);
    if (field.image) row.append(Object.assign(new Image(), { src: field.image, alt: "" }));
    const file = Object.assign(document.createElement("input"), { type: "file", accept: "image/*" });
    file.addEventListener("change", () => addImage(field, file.files[0]));
    const remove = button("Löschen", () => { set.fields.splice(i, 1); save(); fieldList(); });
    remove.disabled = set.fields.length <= 2;
    row.append(file, button(field.image ? "Bild weg" : "Bild", () => { if (field.image) { delete field.image; save(); fieldList(); } else file.click(); }), remove);
    return row;
  }));
  $("addField").disabled = set.fields.length >= 26;
}
$("addField").addEventListener("click", () => { const set = ownSet(); if (set.fields.length < 26) { set.fields.push({ text: "" }); save(); fieldList(); } });
async function addImage(field, file) {
  if (!file) return;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 320 / Math.max(bitmap.width, bitmap.height));
    const canvas = Object.assign(document.createElement("canvas"), { width: bitmap.width * scale, height: bitmap.height * scale });
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    field.image = canvas.toDataURL("image/jpeg", 0.82);
    save(); fieldList();
  } catch { $("message").textContent = "Das Bild konnte nicht geladen werden."; }
}

document.body.classList.toggle("touch", data.screenTap);
mount();

/* ---------- Offline ---------- */
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => { $("offline").textContent = "Offline-Betrieb nicht möglich."; });
  navigator.serviceWorker.ready.then(() => { $("offline").textContent = "Bereit für offline."; });
  navigator.storage?.persist?.();
}
