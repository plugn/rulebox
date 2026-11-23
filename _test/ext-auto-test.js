(async function () {
  var results = [];
  var harness = window.__e2e;

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function rect(el) {
    return el.getBoundingClientRect();
  }

  function center(el) {
    var r = rect(el);
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function near(a, b, tolerance) {
    return Math.abs(a - b) <= (tolerance === undefined ? 1 : tolerance);
  }

  function mouse(type, target, x, y) {
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: type !== 'mouseenter' && type !== 'mouseleave',
      cancelable: true,
      clientX: x || 0,
      clientY: y || 0,
      button: 0,
      buttons: type === 'mousedown' ? 1 : 0
    }));
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function move(x, y) {
    mouse('mousemove', document.body, x, y);
    await wait(40);
  }

  var fixtureX = 0;
  var fixtureY = 0;

  // Проверка прилипания: создаём пробный рулбокс и тянем угол к линиям.
  async function probeSnap() {
    var probe = rulebox.create();
    probe.style.left = '120px';
    probe.style.top = '200px';

    var point = center(probe);
    mouse('click', probe, point.x, point.y);

    var start = rect(probe);
    var resizer = probe.querySelector('[data-rulebox-resizer]');
    mouse('mousedown', resizer, start.right, start.bottom);
    await move(fixtureX - 3, fixtureY - 2);
    var snapped = rect(probe);
    mouse('mouseup', document.body, fixtureX - 3, fixtureY - 2);

    rulebox.remove(rulebox._items.indexOf(probe));

    return near(snapped.right, fixtureX, 1.5) && near(snapped.bottom, fixtureY, 1.5);
  }

  try {
    window.__ruleboxActivityOptions = { debounceMs: 40 };
    harness.storage.magnetThreshold = 6;
    harness.storage.magnetAuto = true;

    fixtureX = document.documentElement.clientWidth - 100;
    fixtureY = document.documentElement.clientHeight - 80;
    window.__fixtureX = fixtureX;
    window.__fixtureY = fixtureY;

    var enabled = await harness.send({ type: 'magnet-auto-enable', threshold: 6 });
    check('авто-режим включён и линии найдены',
      enabled.ok && enabled.vertical >= 1 && enabled.horizontal >= 1, JSON.stringify(enabled));
    check('слушатель активности внедрён', Boolean(window.__ruleboxActivity));
    check('снимок сделан один раз', harness.captures === 1, String(harness.captures));
    check('линии применены к движку', await probeSnap());

    var state = await harness.send({ type: 'auto-state' });
    check('auto-state: включён и время есть',
      state.ok && state.enabled === true && state.lastAt > 0, JSON.stringify(state));

    // Создаём рулбокс, чтобы бейдж показывал число.
    rulebox.create();

    // Активность страницы запускает пересчёт.
    window.AUTO_MIN_INTERVAL = 0;
    window.dispatchEvent(new Event('scroll'));
    await wait(150);

    check('скролл запустил авто-пересчёт', harness.captures === 2, String(harness.captures));
    check('бейдж вернулся к числу рулбоксов',
      harness.badge.text === '1' && harness.badge.color === '#2563eb',
      harness.badge.text + ' / ' + harness.badge.color);
    check('после авто-пересчёта линии прилипают', await probeSnap());

    // Минимальный интервал: частый запрос откладывается.
    window.AUTO_MIN_INTERVAL = 5000;
    var scheduled = await harness.send({ type: 'magnet-auto-refresh' });
    check('частый запрос отложен', scheduled.ok && scheduled.scheduled > 0,
      JSON.stringify(scheduled));
    check('лишнего снимка нет', harness.captures === 2, String(harness.captures));

    // Убираем отложенный таймер и проверяем ошибку снимка.
    await harness.send({ type: 'magnet-auto-disable' });
    await harness.send({ type: 'magnet-auto-enable', threshold: 6 });

    window.AUTO_MIN_INTERVAL = 0;
    harness.failNext = 'Cannot access contents of the page.';
    var failed = await harness.send({ type: 'magnet-auto-refresh' });

    check('ошибка авто-пересчёта локализована',
      failed.ok === false && /нельзя выполнять код расширения/.test(failed.error),
      JSON.stringify(failed));
    check('бейдж ошибки: красный фон и !',
      harness.badge.text === '!' && harness.badge.color === '#dc2626',
      harness.badge.text + ' / ' + harness.badge.color);
    check('во время ошибки магнит заблокирован (направляющие очищены)',
      (await probeSnap()) === false);

    // Успешный пересчёт возвращает карту и бейдж.
    window.AUTO_MIN_INTERVAL = 0;
    var recovered = await harness.send({ type: 'magnet-auto-refresh' });
    check('повторный пересчёт успешен',
      recovered.ok && recovered.vertical >= 1, JSON.stringify(recovered));
    check('бейдж восстановлен',
      harness.badge.text === '1' && harness.badge.color === '#2563eb',
      harness.badge.text + ' / ' + harness.badge.color);
    check('линии снова прилипают', await probeSnap());

    // Ручное обновление снимка тоже показывает индикацию «занят».
    window.AUTO_MIN_INTERVAL = 0;
    var manual = await harness.send({ type: 'magnet-refresh', threshold: 6 });
    check('ручное обновление успешно', manual.ok && manual.vertical >= 1, JSON.stringify(manual));

    var lastCapture = harness.captureBadges[harness.captureBadges.length - 1];
    check('во время ручного обновления бейдж красный с «…»',
      lastCapture && lastCapture.text === '…' && lastCapture.color === '#dc2626',
      lastCapture ? lastCapture.text + ' / ' + lastCapture.color : 'нет данных');
    check('после ручного обновления бейдж восстановлен',
      harness.badge.text === '1' && harness.badge.color === '#2563eb',
      harness.badge.text + ' / ' + harness.badge.color);

    // Ошибка при ручном обновлении.
    window.AUTO_MIN_INTERVAL = 0;
    harness.failNext = 'Cannot access contents of the page.';
    var manualFail = await harness.send({ type: 'magnet-refresh', threshold: 6 });
    check('ошибка ручного обновления локализована',
      manualFail.ok === false && /нельзя выполнять код расширения/.test(manualFail.error),
      JSON.stringify(manualFail));
    check('бейдж ошибки при ручном обновлении',
      harness.badge.text === '!' && harness.badge.color === '#dc2626',
      harness.badge.text + ' / ' + harness.badge.color);

    // Выключение авто-режима снимает слушатель и очищает линии.
    var disabled = await harness.send({ type: 'magnet-auto-disable' });
    check('авто-режим выключен', disabled.ok === true, JSON.stringify(disabled));
    check('слушатель остановлен', !window.__ruleboxActivity);

    var beforeScroll = harness.captures;
    window.dispatchEvent(new Event('scroll'));
    await wait(150);
    check('после выключения скролл не пересчитывает', harness.captures === beforeScroll,
      String(harness.captures));
    check('после выключения линии очищены', (await probeSnap()) === false);

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
