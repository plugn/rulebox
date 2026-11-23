(function () {
  var results = [];

  function check(name, ok, info) {
    results.push((ok ? 'PASS' : 'FAIL') + ' | ' + name + (info ? ' | ' + info : ''));
  }

  // Синтаксис всех файлов проверяется через new Function: код не выполняется.
  var files = window.__extFiles || {};
  Object.keys(files).forEach(function (name) {
    var ok = true;
    var error = '';
    try {
      // importScripts недоступен в обычной странице — подменяем на время разбора.
      var source = files[name] + '\n//# sourceURL=' + name;
      new Function(source);
    } catch (e) {
      ok = false;
      error = e.message;
    }
    check('syntax ' + name, ok, error);
  });

  document.getElementById('out').textContent = results.join('\n');
})();
