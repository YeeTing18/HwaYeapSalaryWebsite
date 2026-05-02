/**
 * Theme (light/dark) + in-app confirm dialog — no window.confirm / alert styling.
 * Storage key shared across all pages.
 */
(function () {
    var STORAGE_KEY = 'hwayeap-theme';

    function getStoredTheme() {
        try {
            var t = localStorage.getItem(STORAGE_KEY);
            if (t === 'dark' || t === 'light') return t;
        } catch (e) {}
        try {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                return 'dark';
            }
        } catch (e2) {}
        return 'light';
    }

    function applyTheme(theme) {
        var next = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', next);
        try {
            localStorage.setItem(STORAGE_KEY, next);
        } catch (e) {}
        document.querySelectorAll('[data-theme-toggle] .theme-toggle-icon').forEach(function (icon) {
            icon.className = 'fas theme-toggle-icon ' + (next === 'dark' ? 'fa-sun' : 'fa-moon');
        });
    }

    function ensureConfirmRoot() {
        var root = document.getElementById('app-confirm-root');
        if (root) return root;
        root = document.createElement('div');
        root.id = 'app-confirm-root';
        root.setAttribute('aria-modal', 'true');
        root.innerHTML =
            '<div class="app-confirm-backdrop"></div>' +
            '<div class="app-confirm-dialog">' +
            '<div class="app-confirm-card">' +
            '<h3 class="app-confirm-title"></h3>' +
            '<div class="app-confirm-body"></div>' +
            '<div class="app-confirm-actions">' +
            '<button type="button" class="app-confirm-cancel"></button>' +
            '<button type="button" class="app-confirm-ok"></button>' +
            '</div></div></div>';
        document.body.appendChild(root);
        return root;
    }

    /** @returns {Promise<boolean>} true if confirmed */
    function showAppConfirm(options) {
        options = options || {};
        var title = options.title || '';
        var message = options.message || '';
        var okText = options.okText || 'OK';
        var cancelText = options.cancelText || 'Cancel';

        return new Promise(function (resolve) {
            var root = ensureConfirmRoot();
            var titleEl = root.querySelector('.app-confirm-title');
            var bodyEl = root.querySelector('.app-confirm-body');
            var okBtn = root.querySelector('.app-confirm-ok');
            var cancelBtn = root.querySelector('.app-confirm-cancel');

            titleEl.textContent = title;
            bodyEl.innerHTML = '';
            message.split('\n').forEach(function (line, i) {
                if (i > 0) bodyEl.appendChild(document.createElement('br'));
                bodyEl.appendChild(document.createTextNode(line));
            });
            okBtn.textContent = okText;
            cancelBtn.textContent = cancelText;

            var settled = false;
            function finish(val) {
                if (settled) return;
                settled = true;
                root.classList.remove('app-confirm-visible');
                document.removeEventListener('keydown', onKey);
                resolve(val);
            }

            function onKey(ev) {
                if (ev.key === 'Escape') finish(false);
            }

            okBtn.onclick = function () {
                finish(true);
            };
            cancelBtn.onclick = function () {
                finish(false);
            };
            root.querySelector('.app-confirm-backdrop').onclick = function () {
                finish(false);
            };

            document.addEventListener('keydown', onKey);
            root.classList.add('app-confirm-visible');
            okBtn.focus();
        });
    }

    function bindToggleButtons() {
        document.querySelectorAll('[data-theme-toggle]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var cur = document.documentElement.getAttribute('data-theme') || 'light';
                applyTheme(cur === 'dark' ? 'light' : 'dark');
            });
        });
        var cur = document.documentElement.getAttribute('data-theme') || getStoredTheme();
        applyTheme(cur);
    }

    applyTheme(getStoredTheme());

    window.HwaYeapTheme = {
        applyTheme: applyTheme,
        toggle: function () {
            var cur = document.documentElement.getAttribute('data-theme') || 'light';
            applyTheme(cur === 'dark' ? 'light' : 'dark');
        },
        showConfirm: showAppConfirm
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bindToggleButtons);
    } else {
        bindToggleButtons();
    }
})();
