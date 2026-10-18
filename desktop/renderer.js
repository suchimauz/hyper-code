'use strict';
const form = document.getElementById('connection');
const input = document.getElementById('server');
const statusText = document.getElementById('status');
const button = form.querySelector('button');
function showState(state) {
  if (document.activeElement !== input || !input.value) input.value = state.url || '';
  statusText.textContent = state.status || '';
}
window.desktopSetup.onState(showState);
window.desktopSetup.getState().then(showState).catch(() => { statusText.textContent = 'Не удалось прочитать настройки. Перезапустите приложение.'; });
form.addEventListener('submit', async event => {
  event.preventDefault();
  button.disabled = true;
  statusText.textContent = 'Подключение…';
  try {
    const result = await window.desktopSetup.connect(input.value);
    if (!result.ok) statusText.textContent = result.error;
  } catch {
    statusText.textContent = 'Ошибка подключения. Повторите попытку.';
  } finally { button.disabled = false; }
});
