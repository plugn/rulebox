(function () {
  var results = [];
  var first = window.__firstRun;

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  check('first run created 2 boxes', first && first.count === 2 && first.attached === 2,
    first ? first.count + '/' + first.attached : 'no first run');

  check('api recreated', rulebox !== first.api);
  check('old items array emptied', first.items.length === 0, String(first.items.length));
  check('old boxes detached from DOM',
    document.querySelectorAll('div[style*="90000"]').length === 0,
    'boxes with z-index 90000 in DOM: ' + document.querySelectorAll('div[style*="90000"]').length);
  check('new api items empty', rulebox._items.length === 0);

  var box = rulebox.create();
  check('create after rerun works', box.parentNode === document.body &&
    box.style.zIndex === '90000' && rulebox._items.length === 1);
  check('label after rerun', box.children[0].textContent === '200 × 50',
    JSON.stringify(box.children[0].textContent));

  document.getElementById('out').textContent = results.join('\n');
})();
