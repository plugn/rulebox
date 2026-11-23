(async function () {
  var results = [];
  var harness = window.__popupHarness;

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  function $(id) {
    return document.getElementById(id);
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function lastMessage() {
    return harness.sent[harness.sent.length - 1];
  }

  function toggleAuto(enabled) {
    $('magnet-auto').checked = enabled;
    $('magnet-auto').dispatchEvent(new Event('change', { bubbles: true }));
  }

  try {
    await wait(80);

    check('авто выключено по умолчанию', $('magnet-auto').checked === false);
    check('статус авто «выключено»', /выключено/.test($('magnet-auto-status').textContent),
      $('magnet-auto-status').textContent);

    // Включение авто-режима.
    toggleAuto(true);
    await wait(40);

    check('включение шлёт magnet-auto-enable с порогом',
      lastMessage().type === 'magnet-auto-enable' && lastMessage().threshold === 6,
      JSON.stringify(lastMessage()));
    check('настройка авто сохранена', harness.storage.magnetAuto === true);
    check('основной магнит включён автоматически',
      $('magnet-enabled').checked === true && harness.storage.magnetEnabled === true);
    check('статус с найденными линиями',
      /4 вертикальных, 2 горизонтальных/.test($('magnet-auto-status').textContent),
      $('magnet-auto-status').textContent);

    // Выключение.
    toggleAuto(false);
    await wait(40);

    check('выключение шлёт magnet-auto-disable',
      lastMessage().type === 'magnet-auto-disable', JSON.stringify(lastMessage()));
    check('статус после выключения', /выключено/.test($('magnet-auto-status').textContent),
      $('magnet-auto-status').textContent);
    check('настройка выключена', harness.storage.magnetAuto === false);

    // Выключение основного магнита гасит авто-режим.
    toggleAuto(true);
    await wait(40);

    $('magnet-enabled').checked = false;
    $('magnet-enabled').dispatchEvent(new Event('change', { bubbles: true }));
    await wait(60);

    var types = harness.sent.map(function (message) {
      return message.type;
    });
    check('выключение магнита шлёт и disable авто', types.indexOf('magnet-auto-disable') !== -1,
      types.join(','));
    check('выключение магнита шлёт magnet-clear',
      types[types.length - 1] === 'magnet-clear', types.join(','));
    check('галочка авто снята', $('magnet-auto').checked === false);
    check('настройка авто сброшена', harness.storage.magnetAuto === false);

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
