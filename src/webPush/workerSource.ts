/**
 * Return the inert, root-scoped Web Push worker script.
 *
 * Use to serve project- and agent-labelled action-needed notifications and same-origin chat navigation without fetch interception or caching.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<string> {
    return "'use strict';\nconst chatURL = value => {\n  if (typeof value !== 'string' || !new RegExp('^/a/[A-Za-z0-9_-]+$').test(value)) return null;\n  const url = new URL(value, self.location.origin);\n  return url.origin === self.location.origin ? url.href : null;\n};\nself.addEventListener('push', event => {\n  let data;\n  try { data = event.data && event.data.json(); } catch (_) { return; }\n  const url = chatURL(data && data.url);\n  if (!url) return;\n  const type = data.type === undefined ? 'input' : data.type;\n  if (type !== 'input' && type !== 'error') return;\n  const tag = typeof data.tag === 'string' && new RegExp('^' + type + '-[A-Za-z0-9_-]{1,128}$').test(data.tag) ? data.tag : 'hyper-' + type;\n  const label = value => typeof value === 'string' ? value.replace(/[\\u0000-\\u001f\\u007f-\\u009f\\u202a-\\u202e\\u2066-\\u2069]/g, ' ').replace(/\\s+/g, ' ').trim().slice(0, 80) : '';\n  const title = [label(data.projectName), label(data.agentName)].filter(Boolean).join(' · ') || 'Hyper';\n  event.waitUntil(self.registration.showNotification(title, {\n    body: type === 'error' ? 'Работа агента остановлена из-за ошибки' : 'Агент ждёт вашего действия', tag, data: { url }, icon: '/ui/app-icon?size=192'\n  }));\n});\nself.addEventListener('notificationclick', event => {\n  event.notification.close();\n  let url;\n  try {\n    const parsed = new URL(event.notification.data.url);\n    if (parsed.origin !== self.location.origin || parsed.search || parsed.hash) return;\n    url = chatURL(parsed.pathname);\n  } catch (_) { return; }\n  if (!url) return;\n  event.waitUntil((async () => {\n    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });\n    const exact = windows.find(client => client.url === url);\n    if (exact) { await exact.focus(); return; }\n    await self.clients.openWindow(url);\n  })());\n});\n";
}
