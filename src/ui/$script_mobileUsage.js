// Read-only account overview: never swaps the chat or posts a model choice.
(() => {
  if (window.__hyperMobileUsageInstalled) return;
  window.__hyperMobileUsageInstalled = true;
  const narrow = matchMedia('(max-width: 700px)'), touch = matchMedia('(max-width: 1023px) and (pointer: coarse)');
  const mobile = () => narrow.matches || touch.matches;
  const hosts = new Set();
  let data = null, failure = false, pending = null, lastRead = 0, active = null, queued = 0, dirty = false;
  const el = (tag, text, cls) => { const node = document.createElement(tag); if (text) node.textContent = text; if (cls) node.className = cls; return node; };
  const providers = { codex: 'Codex', 'claude-code': 'Claude Code', anthropic: 'Anthropic', 'anthropic-oauth': 'Claude', openai: 'OpenAI', oneapi: 'Asoft LLM Gate', 'zai-coding': 'Z.ai', 'minimax-coding': 'MiniMax' };
  const provider = row => providers[row.provider] || row.provider;
  const payg = row => row.provider === 'opencode' && row.planType !== 'Go subscription';
  const sshInstance = row => (row.node ? null : (/^ssh\.(.+)\.[^.]+$/.exec(row.account) || [])[1] || null);
  const identity = row => JSON.stringify([row.node || '', sshInstance(row) || '', row.provider, row.account]);
  const name = row => row.node ? row.node + ' · ' + row.account : sshInstance(row) ? sshInstance(row) + ' · ' + provider(row) : row.account === 'default' ? provider(row) : row.account;
  const rows = () => !data ? [] : [...data.entries, ...(data.gateway && data.gateway.reason !== 'disabled' ? [{ ...data.gateway, gateway: true, provider: 'oneapi', account: 'default', label: 'Asoft LLM Gate', usedPercent: null, models: data.gateway.models }] : [])];
  const known = row => typeof row.usedPercent === 'number' && Number.isFinite(row.usedPercent);
  const stale = row => failure || row.quotaStatus === 'stale' || (!row.gateway && known(row) && (!row.updatedAt || Date.now() - row.updatedAt > 5 * 60000)) || Boolean(row.resetsAt && row.resetsAt <= Date.now());
  const left = row => Math.round(Math.max(0, Math.min(100, 100 - row.usedPercent)));
  const amount = row => known(row) && row.quotaStatus !== 'unavailable' ? (stale(row) ? '~' : '') + left(row) + '%' : '—';
  // The measured short and long quota windows. A plan that reports both (a
  // 5h window inside a weekly one) shows two rings, exactly like the desktop
  // dock; a plan with one window shows one ring.
  const freshWindow = (row, window) => window && typeof window.usedPercent === 'number' && Number.isFinite(window.usedPercent) && (!window.resetsAt || window.resetsAt > Date.now()) ? window : undefined;
  const windows = row => {
    const short = freshWindow(row, row.windows && row.windows.primary);
    const weekly = freshWindow(row, row.windows && row.windows.secondary);
    const monthly = freshWindow(row, row.windows && row.windows.tertiary);
    return { short, weekly, monthly, triple: Boolean(row.windows && row.windows.tertiary), dual: Boolean(row.windows && (row.windows.secondary || row.windows.tertiary)) || row.provider === 'zai-coding' || row.provider === 'minimax-coding' };
  };
  // Shared thresholds arrive from the server; missing quota is never green.
  // Four steps, so the ring heats up instead of staying green until the quota
  // is nearly gone: green, yellow, orange, red.
  const fillTone = (percent, row) => percent == null || !Number.isFinite(percent) ? 'neutral' : percent >= (row.thresholds?.alertAt ?? 75) ? 'error' : percent >= (row.thresholds?.criticalAt ?? 60) ? 'critical' : percent >= (row.thresholds?.warnAt ?? 30) ? 'warning' : 'success';
  const toneColour = tone => tone === 'error' ? 'var(--color-error)' : tone === 'critical' ? 'var(--color-critical)' : tone === 'warning' ? 'var(--color-warning)' : tone === 'success' ? 'var(--color-success)' : 'var(--color-base-content-faint, #888)';
  const logo = row => {
    const span = el('span', '', 'mobile-usage-logo'); span.setAttribute('aria-hidden', 'true');
    // This HTML is produced only by ui.modelLogo; account/model strings are always textContent.
    if (row.logoHtml) span.innerHTML = row.logoHtml;
    return span;
  };
  function fit(host) {
    if (!host.isConnected || !mobile()) return;
    const box = host.querySelector('[data-mobile-usage-items]'), count = host.querySelector('[data-mobile-usage-count]');
    const items = [...box.querySelectorAll('[data-usage-chip]')];
    if (!items.length) return;
    items.forEach(item => { item.hidden = false; });
    const widths = items.map(item => item.getBoundingClientRect().width);
    const gap = parseFloat(getComputedStyle(box).gap) || 0;
    let visible = 0;
    // Reserve the actual suffix; a shorter +N may free enough space for another chip.
    for (let pass = 0; pass <= String(items.length).length + 1; pass++) {
      const previous = visible;
      count.textContent = (items.length > visible ? '+' + (items.length - visible) : String(items.length)) + ' ›';
      const available = box.getBoundingClientRect().width;
      if (!available) return;
      let used = 0; visible = 0;
      for (const width of widths) {
        if (used + (visible ? gap : 0) + width > available + .5) break;
        used += (visible ? gap : 0) + width; visible++;
      }
      if (visible === previous) break;
    }
    items.forEach((item, index) => { item.hidden = index >= visible; });
    const hidden = items.length - visible;
    count.textContent = (hidden ? '+' + hidden : String(items.length)) + ' ›';
    count.title = hidden ? 'Ещё аккаунтов: ' + hidden : 'Всего подключений: ' + items.length;
  }
  const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(entries => entries.forEach(entry => fit(entry.target))) : null;
  // Same ring the strip chips draw, reusable at any size: the prominent
  // connection icon at the left of each dialog row.
  function ringIcon(row, cls) {
    const outdated = stale(row), measured = known(row) && row.quotaStatus !== 'unavailable';
    const win = windows(row);
    const ring = el('span', '', cls || 'mobile-usage-ring'); ring.setAttribute('aria-hidden', 'true');
    const circle = (radius, percent, label) => {
      const length = 2 * Math.PI * radius;
      const filled = (Math.max(0, Math.min(100, percent)) / 100 * length).toFixed(2);
      if (!Number.isFinite(percent) || row.quotaStatus === 'unavailable') return '';
      const tone = row.parkedAgents ? 'error' : outdated ? 'neutral' : fillTone(percent, row);
      return '<circle data-quota-window="' + label + '" data-tone="' + tone + '" style="color:' + toneColour(tone) + '" data-usage-fill cx="14" cy="14" r="' + radius + '" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-dasharray="' + filled + ' ' + length.toFixed(2) + '"/>';
    };
    const track = (radius, label) => '<circle data-quota-window="' + label + '" class="mobile-usage-ring-track-line" cx="14" cy="14" r="' + radius + '" fill="none" stroke="currentColor" stroke-width="1.7" opacity=".18"/>';
    // Two measured windows: the weekly one outside, the short one inside —
    // the same arrangement as the desktop dock.
    const rings = payg(row) ? '' : win.dual
      ? (win.triple ? track(12, 'monthly') + circle(12, win.monthly?.usedPercent, 'monthly') : '') + track(win.triple ? 9 : 12, 'weekly') + circle(win.triple ? 9 : 12, win.weekly?.usedPercent, 'weekly') + track(win.triple ? 6 : 9, '5h') + circle(win.triple ? 6 : 9, win.short?.usedPercent, '5h')
      : (measured ? track(12, 'quota') + circle(12, row.usedPercent, 'quota') : track(12, 'quota'));
    ring.innerHTML = '<svg viewBox="0 0 28 28" class="mobile-usage-ring-track">' + rings + '</svg>';
    if (row.parkedAgents) ring.append(el('span', 'Ⅱ', 'mobile-usage-pause'));
    else if (row.gateway) ring.append(el('i', '', 'ph ph-plugs-connected mobile-usage-provider-glyph'));
    else ring.append(logo(row));
    if (row.node) ring.append(el('span', '↔', 'mobile-usage-proxy'));
    if (row.gateway) { const dot = el('span', '', 'mobile-usage-gateway'); dot.dataset.status = row.status; ring.append(dot); }
    return ring;
  }
  function paintStrip(host) {
    if (!host.isConnected) return;
    const box = host.querySelector('[data-mobile-usage-items]'), count = host.querySelector('[data-mobile-usage-count]');
    if (!box || !count) return;
    box.replaceChildren();
    const accounts = rows();
    host.setAttribute('aria-label', 'Аккаунты и лимиты. Подключений: ' + accounts.length + '. Кольца показывают расход квоты.' + (failure ? ' Не удалось обновить данные.' : ''));
    host.toggleAttribute('data-usage-offline', failure);
    if (!accounts.length) {
      box.append(el('span', !data ? failure ? 'Недоступно' : 'Загрузка…' : 'Нет данных', 'mobile-usage-placeholder'));
      count.textContent = data ? '0 ›' : '›'; return;
    }
    for (const row of accounts) {
      const chip = el('span', '', 'mobile-usage-chip'); chip.dataset.usageChip = '';
      const outdated = stale(row), measured = known(row) && row.quotaStatus !== 'unavailable';
      const win = windows(row);
      // The ring colour follows the fill of the window it draws, so a nearly
      // spent plan reads the same on the phone as on the desktop dock.
      const worst = Math.max(win.short ? win.short.usedPercent : 0, win.weekly ? win.weekly.usedPercent : 0, win.monthly ? win.monthly.usedPercent : 0, measured ? row.usedPercent : 0);
      chip.dataset.tone = row.parkedAgents ? 'error' : outdated || !measured ? 'neutral' : fillTone(worst, row);
      chip.style.color = toneColour(chip.dataset.tone);
      chip.dataset.quotaState = outdated ? 'stale' : measured ? 'known' : 'unknown';
      // Same 28px spent-quota ring as desktop, with no account name or percentage beside it.
      chip.append(ringIcon(row));
      const winTitle = win.dual
        ? ' · недельный ' + (win.weekly ? Math.max(0, 100 - win.weekly.usedPercent) + '%' : 'неизвестен') + ' · 5 ч ' + (win.short ? Math.max(0, 100 - win.short.usedPercent) + '%' : 'неизвестен') + (win.triple ? ' · месячный ' + (win.monthly ? Math.max(0, 100 - win.monthly.usedPercent) + '%' : 'неизвестен') : '')
        : '';
      chip.title = (row.label || name(row)) + ' · ' + (measured ? (outdated ? 'последний известный остаток ' : 'остаток ') + amount(row) : 'лимит неизвестен') + winTitle;
      if (payg(row)) chip.title = (row.label || name(row)) + ' · ' + (row.memberBudgetText || 'Monthly member budget unavailable; prepaid balance unavailable');
      if (row.needsReconnect) chip.title += ' · требуется повторное подключение';
      chip.setAttribute('role', 'img'); chip.setAttribute('aria-label', chip.title); box.append(chip);
    }
    fit(host);
  }
  function age(value) {
    if (!value) return 'Время обновления неизвестно';
    return 'Обновлено ' + new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }
  function delayOf(resetsAt) {
    const mins = Math.max(0, Math.ceil((resetsAt - Date.now()) / 60000));
    return mins >= 60 ? Math.floor(mins / 60) + ' ч ' + mins % 60 + ' мин' : mins + ' мин';
  }
  // One window line, worded like the desktop quota tooltip rows:
  // "5 h — израсходовано N% · сброс 21 окт., 15:30".
  const ruStamp = value => new Date(value).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function tipRow(label, usedPercent, resetsAt, row) {
    const line = el('p', '', 'mobile-usage-tip-row');
    const outdated = stale(row);
    const tone = row.parkedAgents ? 'error' : outdated ? 'neutral' : fillTone(usedPercent, row);
    line.dataset.tone = tone; line.style.color = toneColour(tone);
    line.append(el('i', '', 'mobile-usage-tip-dot'));
    line.append(el('span', label, 'mobile-usage-tip-name'));
    const used = usedPercent == null || !Number.isFinite(usedPercent) ? 'нет данных' : 'израсходовано ' + Math.round(usedPercent) + '%' + (outdated ? ' (последнее известное)' : '');
    line.append(el('span', used));
    if (resetsAt && resetsAt > Date.now()) line.append(el('span', 'сброс ' + ruStamp(resetsAt), 'mobile-usage-tip-reset'));
    return line;
  }
  function card(row) {
    // Same density as the desktop quota tooltip: a prominent connection icon
    // on the left, then the name, where it connects, and one line per window.
    const section = el('section', '', 'mobile-usage-card'); section.dataset.usageKey = identity(row);
    const icon = el('span', '', 'mobile-usage-card-icon');
    const outdated = stale(row), measured = known(row) && row.quotaStatus !== 'unavailable';
    const win = windows(row);
    const worst = Math.max(win.short ? win.short.usedPercent : 0, win.weekly ? win.weekly.usedPercent : 0, win.monthly ? win.monthly.usedPercent : 0, measured ? row.usedPercent : 0);
    icon.style.color = toneColour(row.parkedAgents ? 'error' : outdated || !measured ? 'neutral' : fillTone(worst, row));
    icon.append(ringIcon(row, 'mobile-usage-ring mobile-usage-card-ring'));
    const body = el('div', '', 'mobile-usage-card-body');
    body.append(el('h3', row.label || name(row)));
    const machine = row.node ? 'Hyper · ' + row.node : sshInstance(row) ? 'SSH · ' + sshInstance(row) : null;
    const sub = [provider(row), machine, row.planType].filter(Boolean).join(' · ');
    body.append(el('p', sub, 'mobile-usage-meta'));
    if (row.gateway) {
      const status = row.reason === 'missing-key' ? 'Не задан API-ключ' : row.status === 'available' ? 'Каталог API доступен' : row.status === 'unavailable' ? 'API недоступен' : 'Состояние API неизвестно';
      body.append(el('p', status + '. Лимиты неизвестны.', 'mobile-usage-tip-row mobile-usage-meta-plain'));
    } else if (payg(row)) {
      const line = el('p', row.memberBudgetText || 'Monthly member budget unavailable', 'mobile-usage-tip-row mobile-usage-meta-plain');
      body.append(line);
      const consoleLink = el('a', 'Console billing', 'mobile-usage-meta');
      consoleLink.href = 'https://opencode.ai/console'; consoleLink.target = '_blank'; consoleLink.rel = 'noopener noreferrer'; body.append(consoleLink);
      if (row.memberBudget?.resetsAt) body.append(el('p', 'Сброс бюджета: ' + ruStamp(row.memberBudget.resetsAt), 'mobile-usage-meta'));
    } else if (row.quotaStatus === 'unavailable' || !measured) {
      body.append(tipRow('Квота', null, null, row));
    } else {
      // Each measured window gets its own line, like the desktop tooltip.
      if (win.dual) {
        body.append(tipRow('5 ч', win.short ? win.short.usedPercent : null, win.short?.resetsAt, row));
        body.append(tipRow('Неделя', win.weekly ? win.weekly.usedPercent : null, win.weekly?.resetsAt, row));
        if (win.triple) body.append(tipRow('Месяц', win.monthly ? win.monthly.usedPercent : null, win.monthly?.resetsAt, row));
      } else {
        body.append(tipRow('Квота', row.usedPercent, row.resetsAt, row));
      }
      const notes = [];
      if (row.needsReconnect) notes.push('требуется повторное подключение');
      if (row.parkedAgents) notes.push('ожидают лимита: ' + row.parkedAgents);
      if (notes.length) body.append(el('p', notes.join(' · '), 'mobile-usage-meta mobile-usage-note'));
    }
    section.append(icon, body);
    const models = [...new Set(row.models || [])];
    const details = el('details'); details.dataset.usageModels = identity(row); details.append(el('summary', 'Доступные модели · ' + models.length));
    if (models.length) { const list = el('ul'); for (const model of models) list.append(el('li', model)); details.append(list); }
    else details.append(el('p', 'Каталог моделей пока недоступен.', 'mobile-usage-meta'));
    body.append(details); return section;
  }
  function paintDialog() {
    if (!active) return;
    const { content, status, refresh } = active;
    refresh.disabled = Boolean(pending);
    status.textContent = failure ? 'Не удалось обновить. Показаны последние полученные данные. Проверьте соединение и нажмите «Обновить».' : pending ? 'Обновление…' : 'Только просмотр. Модель чата не изменяется.';
    if (!data) { content.textContent = failure ? 'Информация недоступна.' : 'Загрузка аккаунтов…'; return; }
    const scroll = content.scrollTop, opened = new Set([...content.querySelectorAll('details[open]')].map(d => d.dataset.usageModels));
    const focusedKey = document.activeElement?.closest('[data-usage-models]')?.dataset.usageModels;
    const accounts = rows(); content.replaceChildren(...accounts.map(card));
    if (!accounts.length) content.append(el('p', 'Нет данных об аккаунтах и лимитах.'));
    for (const details of content.querySelectorAll('details')) { details.open = opened.has(details.dataset.usageModels); if (details.dataset.usageModels === focusedKey) details.querySelector('summary').focus({ preventScroll: true }); }
    content.scrollTop = scroll;
  }
  function close(restore = true) {
    if (!active) return;
    const state = active; active = null; state.trigger.setAttribute('aria-expanded', 'false');
    if (state.dialog.open) state.dialog.close(); state.dialog.remove();
    if (!state.trigger.isConnected && state.path === location.pathname + location.search) {
      state.trigger = document.querySelector('[data-mobile-usage-open]') || state.trigger;
      state.trigger.setAttribute('aria-expanded', 'false');
    }
    if (restore) {
      if (state.trigger.isConnected) state.trigger.focus({ preventScroll: true });
      if (state.messages?.isConnected) { state.messages.scrollTop = state.scroll; state.messages.dispatchEvent(new Event('scroll')); }
      window.scrollTo(state.x, state.y);
      requestAnimationFrame(() => { if (!active && state.messages?.isConnected) state.messages.scrollTop = state.scroll; });
    }
  }
  function open(trigger) {
    if (!mobile() || active) return;
    const dialog = el('dialog', '', 'mobile-usage-dialog'); dialog.setAttribute('aria-labelledby', 'mobile-usage-title'); dialog.setAttribute('aria-modal', 'true');
    const header = el('header'), back = el('button', '← Назад'); back.type = 'button'; back.dataset.usageBack = '';
    const title = el('h2', 'Аккаунты и лимиты'); title.id = 'mobile-usage-title';
    const refresh = el('button', 'Обновить'); refresh.type = 'button'; refresh.dataset.usageRefresh = '';
    header.append(back, title, refresh);
    const status = el('p', '', 'mobile-usage-notice'); status.setAttribute('role', 'status');
    const content = el('div', '', 'mobile-usage-content'); dialog.append(header, status, content);
    const messages = document.querySelector('#messages');
    active = { dialog, trigger, content, status, refresh, messages, path: location.pathname + location.search, scroll: messages?.scrollTop, x: scrollX, y: scrollY };
    trigger.setAttribute('aria-expanded', 'true');
    document.activeElement?.blur?.(); document.body.append(dialog);
    back.addEventListener('click', () => close()); refresh.addEventListener('click', () => { void load(true); });
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (active?.dialog === dialog) close(); });
    dialog.addEventListener('close', () => { if (active?.dialog === dialog) close(); });
    paintDialog(); dialog.showModal(); back.focus({ preventScroll: true }); void load(true);
  }
  async function load(force = false) {
    if (!mobile() || document.visibilityState === 'hidden' || !hosts.size) return;
    if (pending) { if (force) dirty = true; return pending; }
    if (!force && Date.now() - lastRead < 5000) return;
    lastRead = Date.now();
    const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 15000);
    pending = (async () => {
      try {
        const response = await fetch('/llms/mobileUsage', { headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error('Usage unavailable');
        const result = await response.json();
        if (!Array.isArray(result.entries)) throw new Error('Invalid usage response');
        data = result; failure = false;
      } catch (error) { failure = true; }
      finally {
        clearTimeout(timeout); pending = null; hosts.forEach(paintStrip); paintDialog();
        if (dirty) { dirty = false; queueMicrotask(() => { void load(true); }); }
      }
    })();
    if (active) active.refresh.disabled = true;
    return pending;
  }
  function sync() {
    for (const host of hosts) if (!host.isConnected) { observer?.unobserve(host); hosts.delete(host); }
    document.querySelectorAll('[data-mobile-usage-open]').forEach(host => {
      if (hosts.has(host)) return;
      hosts.add(host); observer?.observe(host); paintStrip(host);
    });
    if (active && !active.trigger.isConnected && active.path === location.pathname + location.search) {
      // Project activity refreshes replace only chrome. Keep the overview open and
      // return to the replacement strip, not the detached original button.
      const replacement = document.querySelector('[data-mobile-usage-open]');
      if (replacement) { active.trigger = replacement; replacement.setAttribute('aria-expanded', 'true'); }
    }
    // A live refresh can remove/reinsert the strip while the chat stays on the
    // same page. Missing opener is not navigation and must never dismiss the dialog.
    if (active && (active.path !== location.pathname + location.search || !mobile())) close(false);
    hosts.forEach(fit); void load();
  }
  document.addEventListener('click', event => { const trigger = event.target.closest?.('[data-mobile-usage-open]'); if (trigger) { event.preventDefault(); open(trigger); } });
  for (const event of ['htmx:after:process', 'htmx:after:swap', 'htmx:history:restore']) document.addEventListener(event, sync);
  for (const media of [narrow, touch]) media.addEventListener('change', sync);
  window.addEventListener('resize', () => hosts.forEach(fit)); window.addEventListener('pageshow', sync);
  window.addEventListener('popstate', () => close(false));
  window.addEventListener('online', () => { void load(true); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(); });
  window.hyperLive?.subscribe({ name: 'mobile-usage', onEvent(event) { if (event.topic !== 'llm-usage') return; clearTimeout(queued); queued = setTimeout(() => { void load(true); }, 500); }, resync() { void load(true); } });
  setInterval(() => { void load(); }, 60000);
  document.fonts?.ready.then(() => hosts.forEach(fit));
  sync();
})();
