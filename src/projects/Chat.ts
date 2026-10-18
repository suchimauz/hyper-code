/** Navigation chat summary; archive is independent of tab closure. */
export type Chat = { id: string; title: string; model: string; /** Custom agent SVG; null falls back to the model logo. */ icon?: string | null; archived: boolean; runState: string; /** Native viewer-specific unread notification state. */ hasUnread: boolean; workspaceDir: string; workspaceHost: string };
