(function () {
  var results = [];

  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function mouse(type, target, x, y) {
    target.dispatchEvent(new MouseEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: x,
      clientY: y,
      button: 0,
      buttons: type === 'mousedown' ? 1 : 0
    }));
  }

  try {
    window.scrollTo(0, 400);

    var box = rulebox.create();
    var resizer = box.querySelector('[data-rulebox-resizer]');
    var label = box.children[0];
    var c = center(box);
    var vw = document.documentElement.clientWidth;
    var vh = document.documentElement.clientHeight;

    results.push((Math.abs(c.x - vw / 2) < 1 && Math.abs(c.y - vh / 2) < 1 ? 'PASS' : 'FAIL') +
      ' | centered with body offset + scroll | ' + c.x + ',' + c.y +
      ' vs ' + vw / 2 + ',' + vh / 2 + ' scrollY=' + window.scrollY);

    var boxRect = box.getBoundingClientRect();
    var labelRect = label.getBoundingClientRect();
    results.push((Math.abs(boxRect.bottom - labelRect.bottom - 1) < 0.6 &&
      label.textContent === '200 × 50' ? 'PASS' : 'FAIL') +
      ' | label at bottom with body offset + scroll | text=' + JSON.stringify(label.textContent) +
      ' gap=' + (boxRect.bottom - labelRect.bottom));

    mouse('click', box, c.x, c.y);
    mouse('mousedown', box, c.x, c.y);
    mouse('mousemove', document.body, 350, 280);
    mouse('mouseup', document.body, 350, 280);
    var dragged = center(box);
    results.push((Math.abs(dragged.x - 350) < 1 && Math.abs(dragged.y - 280) < 1 ? 'PASS' : 'FAIL') +
      ' | drag with scroll | ' + dragged.x + ',' + dragged.y);

    var before = box.getBoundingClientRect();
    mouse('mousedown', resizer, before.right, before.bottom);
    mouse('mousemove', document.body, before.left + 250, before.top + 120);
    mouse('mouseup', document.body, before.left + 250, before.top + 120);
    var after = box.getBoundingClientRect();
    results.push((Math.abs(after.width - 250) < 1 && Math.abs(after.height - 120) < 1 ? 'PASS' : 'FAIL') +
      ' | resize with scroll | ' + after.width + 'x' + after.height);
    results.push((label.textContent === '250 × 120' ? 'PASS' : 'FAIL') +
      ' | label follows resize with scroll | ' + JSON.stringify(label.textContent));
  } catch (error) {
    results.push('ERROR | ' + (error && error.stack ? error.stack : error));
  }

  document.getElementById('out').textContent = results.join('\n');
})();
