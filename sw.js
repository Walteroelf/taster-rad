"use strict";
// Bei jeder Änderung an der App die Version erhöhen, sonst bleibt die alte im Speicher.
const CACHE = "taster-rad-v3";
const FILES = ["./", "index.html", "design.css", "css/style.css", "js/app.js", "manifest.webmanifest",
  "schriften/andika-400.woff2", "schriften/andika-700.woff2", "icon-180.png", "icon-192.png", "icon-512.png"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE)
    .then(c => c.addAll(FILES.map(f => new Request(f, { cache: "reload" }))))
    .then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  // Nur eigene alte Speicher löschen: andere Apps können auf derselben Adresse liegen.
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k.startsWith("taster-rad-") && k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.open(CACHE)
    .then(c => c.match(e.request, { ignoreSearch: true }))
    .then(hit => hit || fetch(e.request)));
});
