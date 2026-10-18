'use strict';
const { sameOrigin } = require('./security.cjs');

// Keep HTTP page errors separate from the initial server connection. Inject the
// UI callbacks so the real Electron event sequence can be tested without Electron.
module.exports = function attachNavigation({ contents, origin, fail, ready, pageError }) {
  let connected = false;
  let stopped = false;
  let committed = false;
  let httpError = false;
  function failure(reason) {
    if (stopped) return;
    if (connected) { pageError(reason); return; }
    stopped = true;
    fail(reason);
  }
  function failedLoad(code, description, isMainFrame = true) {
    // ERR_ABORTED is normal for replaced navigations and blocked redirects.
    if (!isMainFrame || code === -3) return;
    // Chromium may also emit ERR_HTTP_RESPONSE_CODE_FAILURE for an HTTP page.
    if (connected && httpError && code === -379) return;
    failure(`${description} (${code}).`);
  }
  contents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) { committed = false; httpError = false; }
  });
  contents.on('did-navigate', (_event, url, responseCode) => {
    if (stopped || !sameOrigin(url, origin)) return;
    httpError = responseCode >= 400;
    if (httpError) {
      if (!connected) failure(`HTTP ${responseCode}.`);
      // Do not replace the response body: it may contain a login form, permission
      // explanation or useful server diagnostics. Back/retry remain in the menu.
      else pageError(`HTTP ${responseCode}.`, { http: true });
    } else committed = true;
  });
  contents.on('did-fail-load', (_event, code, description, _url, isMainFrame) => failedLoad(code, description, isMainFrame));
  contents.on('render-process-gone', (_event, details) => failure(`Процесс интерфейса завершился (${details?.reason || 'unknown'}).`));
  contents.on('did-finish-load', () => {
    if (stopped || connected || !committed || !sameOrigin(contents.getURL(), origin)) return;
    connected = true;
    ready();
  });
  return { failure, failedLoad };
};
