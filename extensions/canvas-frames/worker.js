// One session rule per MauzCode tab: inside that tab, frames (sub_frame) lose X-Frame-Options and CSP, so a
// site that forbids framing can be shown in the canvas. Pages outside MauzCode tabs are untouched; the rule
// goes away when the tab closes or leaves MauzCode.
const MAUZCODE = /^(https:\/\/([a-z0-9-]+\.)*mauzcode-mesh\.xyz|http:\/\/(localhost|127\.0\.0\.1))(:\d+)?\//i;

const ruleFor = tabId => ({
  id: tabId,
  priority: 1,
  condition: { tabIds: [tabId], resourceTypes: ['sub_frame'] },
  action: {
    type: 'modifyHeaders',
    responseHeaders: [
      { header: 'x-frame-options', operation: 'remove' },
      { header: 'content-security-policy', operation: 'remove' },
    ],
  },
});

const enable = tabId => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId], addRules: [ruleFor(tabId)] });
const disable = tabId => chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: [tabId] });

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg?.type === 'mauzcode-canvas-tab' && sender.tab?.id >= 0 && sender.frameId === 0 && MAUZCODE.test(sender.url || '')) enable(sender.tab.id);
});
chrome.tabs.onRemoved.addListener(tabId => disable(tabId));
chrome.tabs.onUpdated.addListener((tabId, info) => { if (info.url && !MAUZCODE.test(info.url)) disable(tabId); });
