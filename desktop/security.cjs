'use strict';

// Deliberately separate from Electron so policy can be tested without a runtime download.
function serverURL(value) {
  if (typeof value !== 'string' || value.length > 4096) throw new Error('Введите адрес сервера.');
  let url;
  try { url = new URL(value.trim()); } catch { throw new Error('Нужен полный адрес: https://example.com или http://192.168.1.10:3000'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error('Разрешены только HTTP/HTTPS без логина и пароля в адресе.');
  }
  // Configuration is not a secret store: no tokens in a saved query or fragment.
  if (url.search || url.hash) throw new Error('Укажите адрес без параметров и #фрагмента (они могут содержать секреты).');
  return url.href;
}
function webURL(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url : null;
  } catch { return null; }
}
function sameOrigin(value, origin) {
  const url = webURL(value);
  return !!url && url.origin === origin;
}
module.exports = { serverURL, webURL, sameOrigin };
