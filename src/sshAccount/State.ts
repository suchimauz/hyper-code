/** Live authorization processes survive hot reloads, but not server restarts. Durable registry reconciles orphaned pending flows. */
export type State = { flows?: Map<string, types.sshAccount.LoginFlow> };
