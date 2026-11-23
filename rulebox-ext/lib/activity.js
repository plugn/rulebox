/**
 * Слушатель активности страницы для авто-пересчёта направляющих.
 *
 * Внедряется расширением в ISOLATED world при включении режима. Любое
 * событие, меняющее соответствие «экран ↔ контент» (прокрутка, panning,
 * зум, изменение вьюпорта), взводит дебаунс: через DEBOUNCE_MS после
 * последнего события service worker пересчитает линии.
 */

(function () {
  'use strict';

  var STATE_KEY = '__ruleboxActivity';
  var options = window.__ruleboxActivityOptions || {};
  var debounceMs = typeof options.debounceMs === 'number' ? options.debounceMs : 3000;

  if (window[STATE_KEY] && typeof window[STATE_KEY].stop === 'function') {
    window[STATE_KEY].stop();
  }

  var timer = null;
  var stopped = false;
  var dprQuery = null;

  var api = {
    stop: stop,
    notify: notify,
    debounceMs: debounceMs
  };

  window[STATE_KEY] = api;

  window.addEventListener('scroll', onActivity, { capture: true, passive: true });
  window.addEventListener('scrollend', onActivity, { capture: true, passive: true });
  window.addEventListener('wheel', onWheel, { capture: true, passive: true });
  window.addEventListener('pointermove', onPointerMove, { capture: true, passive: true });
  window.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
  window.addEventListener('resize', onActivity, { passive: true });
  window.addEventListener('orientationchange', onActivity, { passive: true });
  window.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('fullscreenchange', onActivity, true);

  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', onActivity, { passive: true });
    window.visualViewport.addEventListener('scroll', onActivity, { passive: true });
  }

  watchDpr();

  function isGesture() {
    return document.documentElement.hasAttribute('data-rulebox-gesture');
  }

  function insideRulebox(target) {
    return Boolean(target && typeof target.closest === 'function' &&
      target.closest('[data-rulebox-item]'));
  }

  function notify() {
    if (stopped) {
      return;
    }
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(fire, debounceMs);
  }

  function fire() {
    timer = null;
    if (stopped) {
      return;
    }

    try {
      chrome.runtime.sendMessage({ type: 'magnet-auto-refresh' }, function () {
        // Ответ не нужен; подавляем «Receiving end does not exist».
        if (chrome.runtime.lastError) {
          void chrome.runtime.lastError;
        }
      });
    } catch (error) {
      // Расширение могло быть перезагружено — ждём следующего события.
    }
  }

  function onActivity() {
    if (isGesture()) {
      return;
    }
    notify();
  }

  function onWheel() {
    if (isGesture()) {
      return;
    }
    notify();
  }

  function onPointerMove(event) {
    if (event.buttons === 0) {
      return;
    }
    if (isGesture() || insideRulebox(event.target)) {
      return;
    }
    notify();
  }

  function onTouchMove(event) {
    if (isGesture() || insideRulebox(event.target)) {
      return;
    }
    notify();
  }

  function onKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey)) {
      return;
    }
    if (event.key !== '+' && event.key !== '-' && event.key !== '=' && event.key !== '0') {
      return;
    }
    notify();
  }

  function onDprChange() {
    watchDpr();
    notify();
  }

  /** Смена devicePixelRatio — зум браузера, в том числе из меню. */
  function watchDpr() {
    if (typeof window.matchMedia !== 'function') {
      return;
    }
    if (dprQuery && typeof dprQuery.removeEventListener === 'function') {
      dprQuery.removeEventListener('change', onDprChange);
    }
    dprQuery = window.matchMedia('(resolution: ' + window.devicePixelRatio + 'dppx)');
    if (typeof dprQuery.addEventListener === 'function') {
      dprQuery.addEventListener('change', onDprChange);
    }
  }

  function stop() {
    stopped = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }

    window.removeEventListener('scroll', onActivity, true);
    window.removeEventListener('scrollend', onActivity, true);
    window.removeEventListener('wheel', onWheel, true);
    window.removeEventListener('pointermove', onPointerMove, true);
    window.removeEventListener('touchmove', onTouchMove, true);
    window.removeEventListener('resize', onActivity);
    window.removeEventListener('orientationchange', onActivity);
    window.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('fullscreenchange', onActivity, true);

    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', onActivity);
      window.visualViewport.removeEventListener('scroll', onActivity);
    }
    if (dprQuery && typeof dprQuery.removeEventListener === 'function') {
      dprQuery.removeEventListener('change', onDprChange);
    }
    dprQuery = null;

    if (window[STATE_KEY] === api) {
      delete window[STATE_KEY];
    }
  }
})();
