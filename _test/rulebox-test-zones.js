(async function () {
  var results = [];

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

  function zone(box, corner) {
    return box.querySelector('[data-rulebox-zone="' + corner + '"]');
  }

  function resizerOf(box) {
    return box.querySelector('[data-rulebox-resizer]');
  }

  function zoneSize(el) {
    return { width: parseFloat(el.style.width), height: parseFloat(el.style.height) };
  }

  try {
    var box = rulebox.create();
    var resizer = resizerOf(box);
    var corners = ['tl', 'tr', 'bl', 'br'];
    var c = center(box);

    check('рулбокс помечен маркером', box.hasAttribute('data-rulebox-item'));
    check('четыре угловые зоны', corners.every(function (corner) {
      return Boolean(zone(box, corner));
    }));
    check('зоны скрыты вне active', getComputedStyle(zone(box, 'tl')).display === 'none');

    mouse('click', box, c.x, c.y);

    check('зоны видимы в active', corners.every(function (corner) {
      return getComputedStyle(zone(box, corner)).display === 'block';
    }));

    var size = zoneSize(zone(box, 'tl'));
    check('зона 30x25 при рулбоксе 200x50', near(size.width, 30, 0.5) && near(size.height, 25, 0.5),
      size.width + 'x' + size.height);

    check('курсоры зон как у ручки',
      getComputedStyle(zone(box, 'tl')).cursor === 'nwse-resize' &&
      getComputedStyle(zone(box, 'tr')).cursor === 'nesw-resize' &&
      getComputedStyle(zone(box, 'bl')).cursor === 'nesw-resize' &&
      getComputedStyle(zone(box, 'br')).cursor === 'nwse-resize',
      getComputedStyle(zone(box, 'tl')).cursor + '/' + getComputedStyle(zone(box, 'tr')).cursor);

    var base = rect(box);

    // Клик без движения в TL: ручка переезжает, геометрия не меняется.
    var tl = rect(zone(box, 'tl'));
    mouse('mousedown', zone(box, 'tl'), tl.left + 5, tl.top + 5);
    mouse('mouseup', document.body, tl.left + 5, tl.top + 5);
    var handle = center(resizer);
    check('клик в TL переключил ручку на левый верхний угол',
      near(handle.x, base.left) && near(handle.y, base.top),
      handle.x + ',' + handle.y + ' vs ' + base.left + ',' + base.top);
    check('клик без движения не изменил геометрию',
      near(rect(box).width, base.width, 0.5) && near(rect(box).left, base.left, 0.5));
    check('курсор ручки nwse', getComputedStyle(resizer).cursor === 'nwse-resize',
      getComputedStyle(resizer).cursor);

    // Протяжка сразу из зоны: тянем левый верхний угол.
    var tl2 = rect(zone(box, 'tl'));
    mouse('mousedown', zone(box, 'tl'), tl2.left + 5, tl2.top + 5);
    await move(base.left + 40, base.top + 30);
    var dragged = rect(box);
    check('протяжка из зоны сразу ресайзит',
      near(dragged.left, base.left + 40) && near(dragged.top, base.top + 30) &&
      near(dragged.right, base.right) && near(dragged.bottom, base.bottom),
      [dragged.left, dragged.top, dragged.right, dragged.bottom].join(','));
    mouse('mouseup', document.body, base.left + 40, base.top + 30);

    // Переключение на TR, BL, BR.
    var trBase = rect(box);
    var tr = rect(zone(box, 'tr'));
    mouse('mousedown', zone(box, 'tr'), tr.left + 5, tr.top + 5);
    mouse('mouseup', document.body, tr.left + 5, tr.top + 5);
    var trHandle = center(resizer);
    check('клик в TR переключил ручку',
      near(trHandle.x, trBase.right) && near(trHandle.y, trBase.top) &&
      getComputedStyle(resizer).cursor === 'nesw-resize',
      trHandle.x + ',' + trHandle.y);

    var blBase = rect(box);
    var bl = rect(zone(box, 'bl'));
    mouse('mousedown', zone(box, 'bl'), bl.left + 5, bl.top + 5);
    mouse('mouseup', document.body, bl.left + 5, bl.top + 5);
    var blHandle = center(resizer);
    check('клик в BL переключил ручку',
      near(blHandle.x, blBase.left) && near(blHandle.y, blBase.bottom) &&
      getComputedStyle(resizer).cursor === 'nesw-resize',
      blHandle.x + ',' + blHandle.y);

    var brBase = rect(box);
    var br = rect(zone(box, 'br'));
    mouse('mousedown', zone(box, 'br'), br.left + 5, br.top + 5);
    mouse('mouseup', document.body, br.left + 5, br.top + 5);
    var brHandle = center(resizer);
    check('клик в BR переключил ручку',
      near(brHandle.x, brBase.right) && near(brHandle.y, brBase.bottom) &&
      getComputedStyle(resizer).cursor === 'nwse-resize',
      brHandle.x + ',' + brHandle.y);

    // Зоны ужимаются на маленьком рулбоксе: 20x20 -> 10x10.
    var small = rect(box);
    mouse('mousedown', resizer, center(resizer).x, center(resizer).y);
    await move(small.left + 20, small.top + 20);
    mouse('mouseup', document.body, small.left + 20, small.top + 20);
    var smallSize = zoneSize(zone(box, 'tl'));
    check('зона 10x10 при рулбоксе 20x20',
      near(smallSize.width, 10, 0.5) && near(smallSize.height, 10, 0.5),
      smallSize.width + 'x' + smallSize.height);

    // Деактивация скрывает зоны (ждём окно подавления клика после ресайза).
    await wait(120);
    mouse('click', document.body, 5, 5);
    check('клик вне скрыл зоны', getComputedStyle(zone(box, 'tl')).display === 'none');

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();

