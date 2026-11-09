/** Surfaces a plugin UI asks the host to mount; nothing outside these lists reaches a slot. */
export type UiGrants = { pages: string[]; /** Explicit direct-sidebar page IDs; absent in older approvals. */ sidebarNavigation?: string[]; panels: string[]; actions: string[]; canvasKinds: string[]; /** Canvas Start-page launcher IDs; absent in older approvals. */ canvasLaunchers?: string[] };
