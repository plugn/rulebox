(async function () {
  var results = [];
  var harness = window.__e2e;

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
    var out = document.getElementById('out');
    if (out) {
      out.textContent = results.join('\n');
    }
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

  try {
    var viewportWidth = document.documentElement.clientWidth;
    var viewportHeight = document.documentElement.clientHeight;
    var fixtureX = viewportWidth - 100;
    var fixtureY = viewportHeight - 80;
    window.__fixtureX = fixtureX;
    window.__fixtureY = fixtureY;

    var refresh = await harness.send({ type: 'magnet-refresh', threshold: 6 });
    check('magnet-refresh выполнен', refresh.ok === true, JSON.stringify(refresh));
    check('линии снимка найдены', refresh.vertical >= 1 && refresh.horizontal >= 1,
      JSON.stringify(refresh));

    var box = rulebox.create();
    var c = center(box);
    mouse('click', box, c.x, c.y);
    var resizer = box.querySelector('[data-rulebox-resizer]');
    var start = rect(box);

    mouse('mousedown', resizer, start.right, start.bottom);
    await move(fixtureX - 3, fixtureY - 2);
    var snapped = rect(box);
    check('ресайз прилип к линии по X', near(snapped.right, fixtureX, 1.5),
      snapped.right + ' vs ' + fixtureX);
    check('ресайз прилип к линии по Y', near(snapped.bottom, fixtureY, 1.5),
      snapped.bottom + ' vs ' + fixtureY);
    mouse('mouseup', document.body, fixtureX - 3, fixtureY - 2);

    // Маскировка: рулбокс поверх вертикальной линии убирает её из карты.
    var mask = rulebox.create('#111827');
    mask.style.left = (fixtureX - 60) + 'px';
    mask.style.top = '0px';
    mask.style.width = '120px';
    mask.style.height = viewportHeight + 'px';

    var maskedRefresh = await harness.send({ type: 'magnet-refresh', threshold: 6 });
    check('маска убрала вертикальную линию', maskedRefresh.ok && maskedRefresh.vertical === 0,
      JSON.stringify(maskedRefresh));
    check('маска не убрала горизонтальную линию', maskedRefresh.horizontal >= 1,
      JSON.stringify(maskedRefresh));

    rulebox.remove(rulebox._items.indexOf(mask));
    var renewed = await harness.send({ type: 'magnet-refresh', threshold: 6 });
    check('после снятия маски линия вернулась', renewed.ok && renewed.vertical >= 1,
      JSON.stringify(renewed));

    var cleared = await harness.send({ type: 'magnet-clear' });
    check('magnet-clear ok', cleared.ok === true, JSON.stringify(cleared));

    var beforeFree = rect(box);
    mouse('mousedown', resizer, beforeFree.right, beforeFree.bottom);
    await move(fixtureX - 3, fixtureY - 2);
    var free = rect(box);
    check('после clear снап не работает',
      !near(free.right, fixtureX, 1) || !near(free.bottom, fixtureY, 1),
      free.right + ',' + free.bottom);
    mouse('mouseup', document.body, fixtureX - 3, fixtureY - 2);

    // Ошибка снимка доходит до попапа в локализованном виде.
    harness.failNext = 'Cannot access contents of the page.';
    var denied = await harness.send({ type: 'magnet-refresh', threshold: 6 });
    check('ошибка снимка локализована',
      denied.ok === false && /нельзя выполнять код расширения/.test(denied.error),
      JSON.stringify(denied));

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
