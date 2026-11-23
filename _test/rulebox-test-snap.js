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

  function guide(axis) {
    return document.querySelector('[data-rulebox-guide="' + axis + '"]');
  }

  try {
    check('API setGuides', typeof rulebox.setGuides === 'function');
    check('API clearGuides', typeof rulebox.clearGuides === 'function');

    var box = rulebox.create();
    var resizer = box.querySelector('[data-rulebox-resizer]');
    var start = center(box);
    mouse('click', box, start.x, start.y);

    var base = rect(box);
    var guideX = Math.round(base.left + 123);
    var guideY = Math.round(base.top + 77);
    rulebox.setGuides([guideX], [guideY], 6);

    check('направляющие появляются только при срабатывании',
      (!guide('vertical') || guide('vertical').style.display === 'none') &&
      (!guide('horizontal') || guide('horizontal').style.display === 'none'));

    // 1. Ресайз: курсор в 3px от линии -> правый нижний угол прилипает.
    mouse('mousedown', resizer, base.right, base.bottom);
    await move(base.left + 120, base.top + 74);
    var snapped = rect(box);
    check('ресайз прилип к вертикальной линии', near(snapped.right, guideX),
      snapped.right + ' vs ' + guideX);
    check('ресайз прилип к горизонтальной линии', near(snapped.bottom, guideY),
      snapped.bottom + ' vs ' + guideY);
    check('вертикальная направляющая показана',
      guide('vertical').style.display === 'block' &&
      near(parseFloat(guide('vertical').style.left), guideX, 0.5),
      guide('vertical').style.left);
    check('горизонтальная направляющая показана',
      guide('horizontal').style.display === 'block' &&
      near(parseFloat(guide('horizontal').style.top), guideY, 0.5),
      guide('horizontal').style.top);

    // 2. Вне порога прилипания направляющая скрывается.
    await move(base.left + 140, base.top + 90);
    var free = rect(box);
    check('вне порога размер не прилипает',
      near(free.right, base.left + 140) && near(free.bottom, base.top + 90),
      free.right + ',' + free.bottom);
    check('направляющие скрыты', guide('vertical').style.display === 'none' &&
      guide('horizontal').style.display === 'none');
    mouse('mouseup', document.body, base.left + 140, base.top + 90);

    // 3. Перетаскивание: ближайшая грань прилипает к линии.
    var dragStart = center(box);
    mouse('mousedown', box, dragStart.x, dragStart.y);
    await move(dragStart.x - 14, dragStart.y);
    var dragged = rect(box);
    check('драг прилип правой гранью к линии', near(dragged.right, guideX),
      dragged.right + ' vs ' + guideX);
    check('драг показал вертикальную направляющую',
      guide('vertical').style.display === 'block');
    mouse('mouseup', document.body, dragStart.x - 14, dragStart.y);
    check('после mouseup направляющие скрыты',
      guide('vertical').style.display === 'none' &&
      guide('horizontal').style.display === 'none');

    // 4. clearGuides полностью отключает прилипание.
    rulebox.clearGuides();
    var clearBase = rect(box);
    mouse('mousedown', resizer, clearBase.right, clearBase.bottom);
    await move(clearBase.left + 121, clearBase.top + 76);
    var noSnap = rect(box);
    check('после clearGuides прилипания нет',
      near(noSnap.right, clearBase.left + 121) && near(noSnap.bottom, clearBase.top + 76),
      noSnap.right + ',' + noSnap.bottom);
    mouse('mouseup', document.body, clearBase.left + 121, clearBase.top + 76);

    // 5. Порог из setGuides учитывается.
    var thresholdBase = rect(box);
    var farGuide = Math.round(thresholdBase.left + 105);
    rulebox.setGuides([farGuide], [], 2);
    mouse('mousedown', resizer, thresholdBase.right, thresholdBase.bottom);
    await move(thresholdBase.left + 100, thresholdBase.top + 60);
    var smallThreshold = rect(box);
    check('порог 2px не прилипает на 5px',
      near(smallThreshold.right, thresholdBase.left + 100) && !near(smallThreshold.right, farGuide, 0.5),
      smallThreshold.right + ' vs линии ' + farGuide);
    mouse('mouseup', document.body, thresholdBase.right, thresholdBase.bottom);

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
