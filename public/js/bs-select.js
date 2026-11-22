/* bs-select.js – rozbalovací výběr ve formulářích (.form-contact-us select.vyber) ve stylu webu
   (stejný panel jako filtry na blogu: .bs-dd__panel / .bs-dd__opt). Původní <select> zůstává
   ve formuláři skrytý a drží hodnotu, takže odeslání formuláře funguje beze změny. */
(function () {
  'use strict';
  var CHEV = '<svg class="bs-dd__chev" width="12" height="8" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>';
  var uid = 0;

  function isPlaceholder(opt, i) {
    return i === 0 && /^(vyberte|select|choose)/i.test(opt.textContent.trim());
  }

  function enhance(sel) {
    if (sel.dataset.bsSelect) return;
    sel.dataset.bsSelect = '1';
    var id = 'bs-fsel-' + (++uid);
    var opts = Array.prototype.slice.call(sel.options);
    var placeholder = opts.length && isPlaceholder(opts[0], 0) ? opts[0].textContent.trim() : '';

    var wrap = document.createElement('div');
    wrap.className = 'bs-dd bs-fsel';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bs-fsel__btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', id);
    if (sel.id) {
      var lbl = document.querySelector('label[for="' + sel.id + '"]');
      if (lbl) btn.setAttribute('aria-label', lbl.textContent.trim());
    }
    var label = document.createElement('span');
    label.className = 'bs-fsel__label';
    btn.appendChild(label);
    btn.insertAdjacentHTML('beforeend', CHEV);

    var panel = document.createElement('div');
    panel.className = 'bs-dd__panel bs-fsel__panel';
    panel.id = id;
    panel.setAttribute('role', 'listbox');

    var optBtns = [];
    opts.forEach(function (o, i) {
      if (placeholder && i === 0) return;
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'bs-dd__opt';
      b.setAttribute('role', 'option');
      b.dataset.index = String(i);
      b.innerHTML = '<span class="bs-dd__radio" aria-hidden="true"></span><span class="bs-dd__text"></span>';
      b.querySelector('.bs-dd__text').textContent = o.textContent.trim();
      panel.appendChild(b);
      optBtns.push(b);
    });

    var chosen = false; // dokud uživatel nevybere, ukazujeme placeholder (původní select má jako výchozí 1. položku)

    function render() {
      var i = sel.selectedIndex;
      var showPh = placeholder && (!chosen || i === 0);
      label.textContent = showPh ? placeholder : (sel.options[i] ? sel.options[i].textContent.trim() : '');
      wrap.classList.toggle('is-placeholder', !!showPh);
      optBtns.forEach(function (b) {
        var on = !showPh && Number(b.dataset.index) === i;
        b.classList.toggle('is-selected', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
    }

    function open() {
      wrap.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      var cur = panel.querySelector('.is-selected') || optBtns[0];
      if (cur) cur.focus();
    }
    function close(focusBtn) {
      wrap.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      if (focusBtn) btn.focus();
    }

    btn.addEventListener('click', function () {
      wrap.classList.contains('is-open') ? close(false) : open();
    });
    btn.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); }
    });
    optBtns.forEach(function (b, k) {
      b.addEventListener('click', function () {
        sel.selectedIndex = Number(b.dataset.index);
        chosen = true;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
        render();
        close(true);
      });
      b.addEventListener('keydown', function (e) {
        if (e.key === 'ArrowDown') { e.preventDefault(); (optBtns[k + 1] || optBtns[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (optBtns[k - 1] || optBtns[optBtns.length - 1]).focus(); }
        else if (e.key === 'Escape') { e.preventDefault(); close(true); }
        else if (e.key === 'Tab') { close(false); }
      });
    });
    document.addEventListener('click', function (e) {
      if (!wrap.contains(e.target)) close(false);
    });
    sel.addEventListener('change', function () { chosen = true; render(); });
    var form = sel.form;
    if (form) form.addEventListener('reset', function () { chosen = false; setTimeout(render, 0); });

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    sel.classList.add('bs-fsel__native');
    sel.setAttribute('tabindex', '-1');
    sel.setAttribute('aria-hidden', 'true');
    sel.parentNode.insertBefore(wrap, sel.nextSibling);
    render();
  }

  function init() {
    var list = document.querySelectorAll('.form-contact-us select.vyber, .form-contact-us select.w-select');
    Array.prototype.forEach.call(list, enhance);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
