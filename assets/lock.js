/* ================================================================
   chaosformalbum — замок
   Фото и названия хранятся в папке data/ в зашифрованном виде
   (AES-GCM 256, ключ из пароля через PBKDF2-SHA256).
   Без пароля в файлах только случайные символы.
   ================================================================ */
(function () {
  "use strict";

  var ITER = 250000;            // сколько раз «перемешивать» пароль: медленнее подбор
  var SLOT = "chaosformalbum.key"; // где хранится ключ, пока открыта вкладка
  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function toB64(u8) {
    var s = "", CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) {
      s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    }
    return btoa(s);
  }

  function fromB64(b) {
    var s = atob(b), u = new Uint8Array(s.length);
    for (var i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return u;
  }

  // Пароль не чувствителен к регистру и пробелам по краям
  function normalize(pw) {
    return String(pw).normalize("NFC").trim().toLowerCase();
  }

  function supported() {
    return !!(window.crypto && crypto.subtle && window.isSecureContext !== false);
  }

  function derive(password, salt, iter) {
    return crypto.subtle.importKey("raw", enc.encode(normalize(password)), "PBKDF2", false, ["deriveKey"])
      .then(function (base) {
        return crypto.subtle.deriveKey(
          { name: "PBKDF2", salt: salt, iterations: iter || ITER, hash: "SHA-256" },
          base, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
      });
  }

  function seal(key, bytes) {
    var iv = crypto.getRandomValues(new Uint8Array(12));
    return crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, bytes).then(function (ct) {
      return { iv: toB64(iv), ct: toB64(new Uint8Array(ct)) };
    });
  }

  // Бросает OperationError, если ключ не тот
  function open(key, box) {
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(box.iv) }, key, fromB64(box.ct))
      .then(function (pt) { return new Uint8Array(pt); });
  }

  // Данные лежат в .js-файлах: так сайт работает и на GitHub Pages,
  // и если просто открыть index.html с диска.
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = function () { s.remove(); resolve(); };
      s.onerror = function () { s.remove(); reject(new Error("Could not load " + src)); };
      document.head.appendChild(s);
    });
  }

  function loadCatalog(base) {
    if (window.TRASH_CATALOG) return Promise.resolve(window.TRASH_CATALOG);
    return loadScript((base || "") + "data/catalog.js").then(function () {
      if (!window.TRASH_CATALOG) throw new Error("data/catalog.js is empty or damaged");
      return window.TRASH_CATALOG;
    });
  }

  function readCatalog(key, cat) {
    return open(key, cat.box).then(function (bytes) { return JSON.parse(dec.decode(bytes)); });
  }

  function unlock(password, base) {
    return loadCatalog(base).then(function (cat) {
      return derive(password, fromB64(cat.salt), cat.iter).then(function (key) {
        return readCatalog(key, cat).then(function (data) { return { key: key, data: data }; });
      });
    });
  }

  function saveKey(key) {
    return crypto.subtle.exportKey("raw", key).then(function (raw) {
      var b = toB64(new Uint8Array(raw));
      try { sessionStorage.setItem(SLOT, b); return; } catch (e) { /* хранилище недоступно */ }
      window.name = "chaosformalbum:" + b; // запасной вариант: живёт только в этой вкладке
    });
  }

  function restoreKey() {
    var b = null;
    try { b = sessionStorage.getItem(SLOT); } catch (e) { /* ignore */ }
    if (!b && typeof window.name === "string" && window.name.indexOf("chaosformalbum:") === 0) {
      b = window.name.slice("chaosformalbum:".length);
    }
    if (!b) return Promise.resolve(null);
    return crypto.subtle.importKey("raw", fromB64(b), { name: "AES-GCM" }, true, ["encrypt", "decrypt"])
      .catch(function () { return null; });
  }

  function forgetKey() {
    try { sessionStorage.removeItem(SLOT); } catch (e) { /* ignore */ }
    if (typeof window.name === "string" && window.name.indexOf("chaosformalbum:") === 0) window.name = "";
  }

  // Загружает и расшифровывает одну картинку → ссылка blob:
  function loadMediaBytes(base, key, id) {
    return loadScript((base || "") + "data/m/" + id + ".js").then(function () {
      var store = window.TRASH_MEDIA || {};
      var box = store[id];
      if (!box) throw new Error("Missing file data/m/" + id + ".js");
      delete store[id];
      return open(key, box);
    });
  }

  function loadMedia(base, key, id, type) {
    return loadMediaBytes(base, key, id).then(function (bytes) {
      return URL.createObjectURL(new Blob([bytes], { type: type || "image/jpeg" }));
    });
  }

  window.Lock = {
    ITER: ITER,
    toB64: toB64, fromB64: fromB64,
    supported: supported,
    derive: derive, seal: seal, open: open,
    loadScript: loadScript, loadCatalog: loadCatalog, readCatalog: readCatalog,
    unlock: unlock,
    saveKey: saveKey, restoreKey: restoreKey, forgetKey: forgetKey,
    loadMediaBytes: loadMediaBytes, loadMedia: loadMedia
  };
})();
