/* i18n.js — перевод интерфейса stt-app (20.10.2026).
   Подключается одной строкой в <head> каждого дашборда:
     <script src="i18n.js"></script>
   Как работает: экраны рисуются по-русски, как и раньше; модуль на лету
   заменяет русские слова интерфейса по словарю i18n/<язык>.json. Данные
   клиента (имена, точки, адреса, категории) не трогаются — см. SKIP.
   Язык: личный выбор человека → язык компании (админка) → русский.
   Словарь и язык кешируются в телефоне — со второго открытия перевод
   применяется сразу, без мигания. */
(function () {
  'use strict';
  var VER = '4';                                   // поднять при изменении словарей
  var LANGS = [['ru', 'RU', 'Русский'], ['uk', 'UA', 'Українська'], ['uz', 'UZ', 'Oʻzbekcha']];
  var DEV = new URLSearchParams(location.search).get('dev') === '1';
  var API = DEV ? 'https://develop-production-0a2d.up.railway.app' : 'https://upload.stt-navigator.com';     // 20.10.2026: как в дашбордах (обход блокировки railway.app в РФ)
  var BASE = (document.currentScript && document.currentScript.src || '').replace(/[^/]*$/, '');
  // Где данные клиента — не переводим
  var SKIP = '.card-client,.card-addr,.cat-name,.vg-name,.vg-addr,[data-noi18n],script,style,textarea,input,select,code';
  var CYR = /[А-Яа-яЁё]/;

  var ls = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  // ?lang=uk / ?lang=uz в адресе — для проверки перевода в браузере (демо-режим)
  var urlLang = new URLSearchParams(location.search).get('lang');
  if (urlLang && /^(ru|uk|uz)$/.test(urlLang)) ls.set('stt_lang_own', urlLang);
  // stt_lang_own — личный выбор на этом устройстве (кнопка 🌐), главнее языка компании
  var own = ls.get('stt_lang_own');
  // Язык компании запоминаем отдельно для каждого человека (?id=): через /dashboard один и тот же
  // телефон открывает разные компании — язык одной не должен «прилипать» к другой.
  var pid = new URLSearchParams(location.search).get('id') || '';
  var lang = own || (pid && ls.get('stt_lang_' + pid)) || 'ru';
  var dict = null, rx = null, rules = [];
  var orig = new WeakMap(), done = new WeakMap();
  var info = {lang: lang, 'switch': false};
  // 23.10.2026: режим проверки перевода — &check=1 в адресе (вместе с &lang=uz / &lang=uk).
  // Всё, что осталось по-русски, обводится красным; внизу кнопка «Не переведено: N» со списком
  // этих фраз — их добавляют в словарь. Имена людей и точек тоже попадут в список — их пропускаем.
  var CHECK = new URLSearchParams(location.search).get('check') === '1';
  var missed = {}, missN = 0, missBtn = null, missT = null;
  function miss(el, text) {
    if (!el || ours(el)) return;
    el.setAttribute('data-i18n-miss', '');
    text = text.replace(/\s+/g, ' ').trim();
    if (!text || missed[text]) return;
    missed[text] = 1; missN++;
    clearTimeout(missT); missT = setTimeout(missPanel, 300);
  }
  function missPanel() {
    if (!document.getElementById('i18n-miss-css')) {
      var st = document.createElement('style'); st.id = 'i18n-miss-css';
      st.textContent = '[data-i18n-miss]{outline:2px solid #EF4444;outline-offset:1px;background:rgba(239,68,68,.08)}';
      document.head.appendChild(st);
    }
    if (!missBtn) {
      missBtn = document.createElement('div'); missBtn.setAttribute('data-noi18n', '');
      missBtn.style.cssText = 'position:fixed;left:8px;bottom:76px;z-index:70;background:#EF4444;color:#fff;font:700 12px -apple-system,sans-serif;padding:7px 11px;border-radius:10px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,.2)';
      missBtn.onclick = missList;
      document.body.appendChild(missBtn);
    }
    missBtn.textContent = '⚠ Не переведено: ' + missN;
  }
  function missList() {
    var old = document.getElementById('i18n-miss-box'); if (old) { old.remove(); return; }
    var b = document.createElement('div'); b.id = 'i18n-miss-box'; b.setAttribute('data-noi18n', '');
    b.style.cssText = 'position:fixed;left:8px;right:8px;bottom:118px;z-index:71;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:10px;box-shadow:0 6px 20px rgba(0,0,0,.2);font:13px -apple-system,sans-serif';
    var ta = document.createElement('textarea');
    ta.value = Object.keys(missed).join('\n');
    ta.style.cssText = 'width:100%;height:220px;font:12px monospace;border:1px solid #e5e7eb;border-radius:8px;padding:6px';
    var cp = document.createElement('div');
    cp.textContent = 'Скопировать список'; cp.style.cssText = 'margin-top:8px;text-align:center;font-weight:700;color:#1a56db;cursor:pointer';
    cp.onclick = function () { ta.select(); try { navigator.clipboard.writeText(ta.value); } catch (e) { document.execCommand('copy'); } cp.textContent = 'Скопировано ✓'; };
    b.appendChild(ta); b.appendChild(cp); document.body.appendChild(b);
  }

  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function compile(d) {
    dict = d && d.p ? d.p : null;
    rules = [];
    rx = null;
    if (!dict) return;
    var keys = Object.keys(dict).sort(function (a, b) { return b.length - a.length; });
    try {
      rx = new RegExp('(?<![\\p{L}\\p{N}])(?:' + keys.map(esc).join('|') + ')(?![\\p{L}\\p{N}])', 'gu');
      rules = (d.re || []).map(function (r) { return [new RegExp(r[0], 'gu'), r[1]]; });
    } catch (e) { rx = null; }               // старый телефон без lookbehind — остаёмся на русском
  }
  function tr(s) {
    if (!rx || !CYR.test(s)) return s;
    for (var i = 0; i < rules.length; i++) s = s.replace(rules[i][0], rules[i][1]);
    return s.replace(rx, function (m) { return dict[m] != null ? dict[m] : m; });
  }
  function skip(el) { return !el || (el.closest && el.closest(SKIP)); }

  function doText(n, force) {
    var cur = n.data;
    if (done.get(n) !== cur) orig.set(n, cur);       // новый текст от приложения (или первый раз)
    else if (!force) return;                         // уже наш перевод, язык не менялся
    var src = orig.get(n);
    var out = lang === 'ru' ? src : tr(src);
    if (out !== cur) n.data = out;
    done.set(n, out);
    if (CHECK && lang !== 'ru' && CYR.test(out)) miss(n.parentElement, out);
  }
  function doAttrs(el) {
    ['placeholder', 'title', 'aria-label'].forEach(function (a) {
      var v = el.getAttribute && el.getAttribute(a);
      if (!v || !CYR.test(v)) return;
      var key = 'data-i18n-' + a;
      var src = el.getAttribute(key);
      if (src === null || el.getAttribute(a) !== el.getAttribute(key + '-t')) { src = v; el.setAttribute(key, v); }
      var out = lang === 'ru' ? src : tr(src);
      el.setAttribute(a, out);
      el.setAttribute(key + '-t', out);
    });
  }
  function walk(root, force) {
    if (!root) return;
    if (root.nodeType === 3) { if (!skip(root.parentElement)) doText(root, force); return; }
    if (root.nodeType !== 1 || skip(root)) return;
    doAttrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (n) {
        if (n.nodeType === 1) return skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        return CYR.test(n.data) || orig.has(n) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP;
      }
    });
    var n, list = [];
    while ((n = w.nextNode())) list.push(n);
    list.forEach(function (t) { doText(t, force); });
    if (root.querySelectorAll) root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(doAttrs);
  }
  var title0 = null;
  function all() {
    walk(document.body, true);
    if (title0 === null) title0 = document.title;
    document.title = lang === 'ru' ? title0 : tr(title0);
    placeSwitch();
  }

  function ours(n) { var e = n && (n.nodeType === 1 ? n : n.parentElement); return !!(e && e.closest && e.closest('[data-noi18n]')); }
  var obs = new MutationObserver(function (ms) {
    if (lang === 'ru' && !info['switch']) return;
    var real = false;
    for (var i = 0; i < ms.length; i++) {
      var m = ms[i];
      if (ours(m.target)) continue;                 // свои изменения (кнопка 🌐, меню) не обрабатываем
      real = true;
      if (m.type === 'characterData') { if (!skip(m.target.parentElement)) doText(m.target); }
      else for (var j = 0; j < m.addedNodes.length; j++) if (!ours(m.addedNodes[j])) walk(m.addedNodes[j]);
    }
    if (real) placeSwitch();
  });

  function loadDict(l, cb) {
    if (l === 'ru') { compile(null); return cb(); }
    // Словарь из телефона — сразу; раз в 6 часов тихо подтягиваем свежий с сайта
    // (правки словаря доходят до людей без выпуска новой версии модуля).
    var key = 'stt_dict_' + l + '_' + VER, cached = ls.get(key), at = +(ls.get(key + '_at') || 0);
    var fresh = Date.now() - at < 6 * 3600 * 1000;
    if (cached) { try { compile(JSON.parse(cached)); cb(); } catch (e) { cached = null; } }
    if (cached && fresh) return;
    fetch(BASE + 'i18n/' + l + '.json?t=' + Math.floor(Date.now() / 3600000)).then(function (r) { return r.json(); })
      .then(function (d) {
        var txt = JSON.stringify(d);
        ls.set(key, txt); ls.set(key + '_at', String(Date.now()));
        if (txt !== cached && l === lang) { compile(d); cb(); }
      })
      .catch(function () { if (!cached) { compile(null); cb(); } });
  }
  function setLang(l, save) {
    lang = l;
    if (pid) ls.set('stt_lang_' + pid, l);
    if (save) { own = l; ls.set('stt_lang_own', l); }
    loadDict(l, function () { document.documentElement.lang = l; all(); });
    if (save) {
      var init = window.Telegram && Telegram.WebApp && Telegram.WebApp.initData;
      if (init) fetch(API + '/api/admin/lang/me', {method: 'POST', headers: {'X-Telegram-Init-Data': init, 'Content-Type': 'application/json'},
        body: JSON.stringify({lang: l})}).catch(function () {});
    }
  }

  /* ---- кнопка 🌐 ---- */
  var chip = null;
  function placeSwitch() {
    if (!info['switch']) { if (chip) chip.remove(); return; }
    if (!chip) {
      chip = document.createElement('span');
      chip.setAttribute('data-noi18n', '');
      chip.style.cssText = 'font:700 11px -apple-system,sans-serif;background:#E8F0FE;color:#1a56db;border-radius:10px;padding:3px 8px;cursor:pointer;white-space:nowrap;flex:none';
      chip.onclick = openMenu;
    }
    var label = '🌐 ' + (LANGS.filter(function (x) { return x[0] === lang; })[0] || LANGS[0])[1] + ' ▾';
    if (chip.textContent !== label) chip.textContent = label;   // без лишних изменений — иначе наблюдатель зациклится
    var host = document.querySelector('.header-top, .topbar');
    if (host) {
      if (chip.parentNode !== host) { chip.style.position = ''; chip.style.marginLeft = '8px'; host.appendChild(chip); }
    } else if (chip.parentNode !== document.body) {
      chip.style.position = 'fixed'; chip.style.top = '8px'; chip.style.right = '8px'; chip.style.zIndex = '50';
      document.body.appendChild(chip);
    }
  }
  function openMenu(e) {
    e.stopPropagation();
    var old = document.getElementById('i18n-menu'); if (old) { old.remove(); return; }
    var m = document.createElement('div');
    m.id = 'i18n-menu'; m.setAttribute('data-noi18n', '');
    var r = chip.getBoundingClientRect();
    m.style.cssText = 'position:fixed;z-index:60;top:' + (r.bottom + 6) + 'px;right:' + Math.max(8, innerWidth - r.right) + 'px;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 4px 16px rgba(0,0,0,.12);overflow:hidden;font:14px -apple-system,sans-serif';
    LANGS.forEach(function (x) {
      var b = document.createElement('div');
      b.textContent = (x[0] === lang ? '✓ ' : '   ') + x[2];
      b.style.cssText = 'padding:10px 16px;cursor:pointer;white-space:pre;' + (x[0] === lang ? 'font-weight:700' : '');
      b.onclick = function () { m.remove(); if (x[0] !== lang) setLang(x[0], true); };
      m.appendChild(b);
    });
    document.body.appendChild(m);
    setTimeout(function () { document.addEventListener('click', function c() { m.remove(); document.removeEventListener('click', c); }); }, 0);
  }

  /* ---- старт ---- */
  function start() {
    obs.observe(document.body, {childList: true, subtree: true, characterData: true});
    if (lang !== 'ru') loadDict(lang, all);
    if (own) { info['switch'] = true; placeSwitch(); }
    // Кто смотрит: ?id= из ссылки (так открывают кнопки бота и /dashboard), иначе — сам пользователь Telegram
    var tw = window.Telegram && Telegram.WebApp;
    var id = new URLSearchParams(location.search).get('id') ||
             (tw && tw.initDataUnsafe && tw.initDataUnsafe.user && String(tw.initDataUnsafe.user.id)) || '';
    if (!/^\d+$/.test(id)) return;
    fetch(API + '/api/admin/lang/id/' + id)
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        info = d;
        if (own) info['switch'] = true;
        var want = own || d.lang || 'ru';
        if (want !== lang) setLang(want, false); else placeSwitch();
      }).catch(function () {});
  }
  window.sttI18n = {tr: function (s) { return lang === 'ru' ? s : tr(s); }, lang: function () { return lang; }, set: setLang};
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
