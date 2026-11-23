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

  try {
    await wait(80);

    check('магнит по умолчанию выключен', $('magnet-enabled').checked === false);
    check('статус «выключен»', /выключен/.test($('magnet-status').textContent),
      $('magnet-status').textContent);
    check('порог по умолчанию 6',
      $('magnet-threshold').value === '6' && $('magnet-threshold-value').textContent === '6',
      $('magnet-threshold').value);

    // Включение: снимок запрашивается с текущим порогом.
    $('magnet-enabled').checked = true;
    $('magnet-enabled').dispatchEvent(new Event('change', { bubbles: true }));
    await wait(40);

    check('включение запрашивает снимок',
      lastMessage().type === 'magnet-refresh' && lastMessage().threshold === 6,
      JSON.stringify(lastMessage()));
    check('статус с количеством линий',
      /5 вертикальных, 3 горизонтальных/.test($('magnet-status').textContent),
      $('magnet-status').textContent);
    check('включение сохранено', harness.storage.magnetEnabled === true);

    // Порог: обновление подписи, сохранение и переснимок.
    $('magnet-threshold').value = '12';
    $('magnet-threshold').dispatchEvent(new Event('input', { bubbles: true }));
    await wait(20);
    check('подпись порога обновилась', $('magnet-threshold-value').textContent === '12',
      $('magnet-threshold-value').textContent);
    check('порог сохранён', harness.storage.magnetThreshold === 12,
      String(harness.storage.magnetThreshold));

    $('magnet-threshold').dispatchEvent(new Event('change', { bubbles: true }));
    await wait(40);
    check('смена порога переснимает',
      lastMessage().type === 'magnet-refresh' && lastMessage().threshold === 12,
      JSON.stringify(lastMessage()));

    $('magnet-refresh').click();
    await wait(40);
    check('кнопка «Обновить снимок» работает', lastMessage().type === 'magnet-refresh',
      JSON.stringify(lastMessage()));

    // Выключение: направляющие очищаются.
    $('magnet-enabled').checked = false;
    $('magnet-enabled').dispatchEvent(new Event('change', { bubbles: true }));
    await wait(40);
    check('выключение очищает направляющие', lastMessage().type === 'magnet-clear',
      JSON.stringify(lastMessage()));
    check('статус «выключен» после выключения', /выключен/.test($('magnet-status').textContent),
      $('magnet-status').textContent);
    check('выключение сохранено', harness.storage.magnetEnabled === false);

    // Ошибка снимка показывается красным.
    harness.failNext = 'На этой странице нельзя выполнять код расширения.';
    $('magnet-enabled').checked = true;
    $('magnet-enabled').dispatchEvent(new Event('change', { bubbles: true }));
    await wait(40);
    check('ошибка магнита отображается',
      $('magnet-status').classList.contains('magnet__status--error') &&
      /нельзя выполнять/.test($('magnet-status').textContent),
      $('magnet-status').textContent);

    document.getElementById('out').textContent = results.join('\n');
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
    document.getElementById('out').textContent = results.join('\n');
  }
})();
