(async function () {
  var results = [];

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function rect(el) {
    return el.getBoundingClientRect();
  }

  function center(el) {
    var rect = el.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
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

  function near(a, b, tolerance) {
    return Math.abs(a - b) <= (tolerance === undefined ? 1 : tolerance);
  }

  function key(target, name, shiftKey) {
    var event = new KeyboardEvent('keydown', {
      key: name,
      code: name,
      shiftKey: Boolean(shiftKey),
      bubbles: true,
      cancelable: true
    });
    target.dispatchEvent(event);
    return event;
  }

  try {
    var first = rulebox.create();
    var second = rulebox.create('#ff0000');

    var c1 = center(first);
    mouse('click', first, c1.x, c1.y);
    check('активация даёт фокус рулбоксу', document.activeElement === first,
      document.activeElement ? document.activeElement.tagName : 'нет');

    // Стрелки: 1px, Shift+стрелки: 10px.
    var left0 = parseFloat(first.style.left);
    var top0 = parseFloat(first.style.top);
    var size0 = rect(first).width;

    var rightEvent = key(first, 'ArrowRight');
    check('стрелка вправо сдвигает на 1px',
      near(parseFloat(first.style.left), left0 + 1, 0.01) &&
      near(parseFloat(first.style.top), top0, 0.01) &&
      rightEvent.defaultPrevented === true,
      first.style.left + ',' + first.style.top);

    key(first, 'ArrowDown');
    check('стрелка вниз сдвигает на 1px',
      near(parseFloat(first.style.top), top0 + 1, 0.01), first.style.top);

    key(first, 'ArrowLeft', true);
    check('Shift+влево сдвигает на 10px',
      near(parseFloat(first.style.left), left0 + 1 - 10, 0.01), first.style.left);

    key(first, 'ArrowUp', true);
    check('Shift+вверх сдвигает на 10px',
      near(parseFloat(first.style.top), top0 + 1 - 10, 0.01), first.style.top);

    check('размер при сдвиге не меняется', near(rect(first).width, size0, 0.5),
      String(rect(first).width));

    var backspace = key(first, 'Backspace');
    check('Backspace не уходит в историю/скролл', backspace.defaultPrevented === true);
    check('Backspace удалил активный рулбокс',
      rulebox._items.length === 1 && !document.body.contains(first),
      String(rulebox._items.length));
    check('второй рулбокс остался', rulebox._items[0] === second && document.body.contains(second));

    var c2 = center(second);
    mouse('click', second, c2.x, c2.y);
    check('фокус перешёл на второй рулбокс', document.activeElement === second);
    key(second, 'Delete');
    check('Delete тоже удаляет рулбокс',
      rulebox._items.length === 0 && !document.body.contains(second),
      String(rulebox._items.length));

    // Ввод в поле страницы не должен затрагивать рулбоксы.
    var input = document.createElement('input');
    input.type = 'text';
    document.body.appendChild(input);

    var third = rulebox.create();
    var c3 = center(third);
    mouse('click', third, c3.x, c3.y);
    input.focus();

    var inputEvent = key(input, 'Backspace');
    check('Backspace в поле не удаляет рулбокс',
      rulebox._items.length === 1 && document.body.contains(third) &&
      inputEvent.defaultPrevented === false,
      String(rulebox._items.length));

    var positionBefore = {
      left: parseFloat(third.style.left),
      top: parseFloat(third.style.top)
    };
    var inputArrow = key(input, 'ArrowRight');
    check('стрелки в поле не двигают рулбокс',
      near(parseFloat(third.style.left), positionBefore.left, 0.01) &&
      near(parseFloat(third.style.top), positionBefore.top, 0.01) &&
      inputArrow.defaultPrevented === false,
      third.style.left + ',' + third.style.top);

    // Без фокуса на рулбоксе Backspace ничего не делает.
    third.blur();
    var outsideEvent = key(document.body, 'Backspace');
    check('Backspace вне рулбокса ничего не удаляет',
      rulebox._items.length === 1 && outsideEvent.defaultPrevented === false,
      String(rulebox._items.length));

    // Динамически созданный рулбокс тоже удаляется по фокусу.
    var c3b = center(third);
    mouse('click', third, c3b.x, c3b.y);
    check('повторная активация фокусирует', document.activeElement === third);
    key(third, 'Backspace');
    check('фокусный Backspace удаляет и последний рулбокс',
      rulebox._items.length === 0 && !document.body.contains(third),
      String(rulebox._items.length));

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
