(async function () {
  var results = [];

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function autoMessages() {
    return window.__sent.filter(function (message) {
      return message.type === 'magnet-auto-refresh';
    }).length;
  }

  function pointer(target, buttons) {
    target.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      cancelable: true,
      buttons: buttons,
      clientX: 10,
      clientY: 10
    }));
  }

  try {
    check('слушатель установлен', Boolean(window.__ruleboxActivity));
    check('дебаунс из опций', window.__ruleboxActivity.debounceMs === 40,
      String(window.__ruleboxActivity.debounceMs));

    var box = document.createElement('div');
    box.setAttribute('data-rulebox-item', '');
    box.style.cssText = 'position:absolute;left:0;top:0;width:50px;height:50px';
    var inside = document.createElement('span');
    box.appendChild(inside);
    document.body.appendChild(box);

    // scroll
    var before = autoMessages();
    window.dispatchEvent(new Event('scroll'));
    await wait(120);
    check('scroll запускает пересчёт', autoMessages() === before + 1, String(autoMessages() - before));

    // дебаунс схлопывает серию событий
    before = autoMessages();
    window.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    await wait(120);
    check('дебаунс схлопывает серию', autoMessages() === before + 1, String(autoMessages() - before));

    // pointermove без кнопок не считается panning
    before = autoMessages();
    pointer(window, 0);
    await wait(120);
    check('pointermove без кнопок игнорируется', autoMessages() === before);

    // panning с зажатой кнопкой
    before = autoMessages();
    pointer(window, 4);
    await wait(120);
    check('panning запускает пересчёт', autoMessages() === before + 1);

    // события внутри рулбокса игнорируются
    before = autoMessages();
    pointer(inside, 1);
    await wait(120);
    check('движение внутри рулбокса игнорируется', autoMessages() === before);

    // во время жеста движка активность игнорируется
    document.documentElement.setAttribute('data-rulebox-gesture', '');
    before = autoMessages();
    window.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    pointer(window, 1);
    await wait(120);
    check('во время жеста игнорируется', autoMessages() === before);
    document.documentElement.removeAttribute('data-rulebox-gesture');

    // зум клавиатурой
    before = autoMessages();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', ctrlKey: true, bubbles: true }));
    await wait(120);
    check('Ctrl+плюс запускает пересчёт', autoMessages() === before + 1);

    // обычная клавиша — нет
    before = autoMessages();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    await wait(120);
    check('обычная клавиша игнорируется', autoMessages() === before);

    // смена ориентации/полноэкранный режим
    before = autoMessages();
    document.dispatchEvent(new Event('fullscreenchange'));
    await wait(120);
    check('fullscreenchange запускает пересчёт', autoMessages() === before + 1);

    // stop снимает слушатели
    window.__ruleboxActivity.stop();
    check('stop удаляет слушатель', !window.__ruleboxActivity);
    before = autoMessages();
    window.dispatchEvent(new Event('scroll'));
    pointer(window, 1);
    await wait(120);
    check('после stop событий нет', autoMessages() === before);

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
