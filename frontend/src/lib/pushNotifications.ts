/**
 * Close the push notification this browser is showing for an answered request.
 *
 * The server withdraws the notification from the owner's *other* devices with a recall push. The device the answer was given on is not reached by that: it holds the notification in its own service worker, so the page closes it directly. Nothing here talks to the server, and a browser without a service worker simply has nothing to close.
 *
 * @param inputId Identifier of the answered request; the notification tag is `input-<id>`.
 */
export async function closeLocalPushNotification(inputId: string): Promise<void> {
  if (!inputId) return;
  try {
    if (!('serviceWorker' in navigator)) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    if (!registration) return;
    const shown = await registration.getNotifications();
    const tag = `input-${inputId}`;
    for (const notification of shown) {
      if (notification.tag === tag) await notification.close();
    }
  } catch {
    // A notification that stays on screen is harmless; the answer itself must never fail for it.
  }
}
