/**
 * Reports the dedicated Raylane automation profile used by the headless Chrome user service
 *
 * Instance-local profile resolver for the approved Raylane browser service. Returns the isolated test profile, never the user's personal login profile; use when inspecting which profile chrome.start manages.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{ userDataDir: string; profile: string; legacy: boolean }> {
    return { userDataDir: '/home/suchimauz/.local/state/raylane-browser/profile', profile: 'Default', legacy: false };
}
