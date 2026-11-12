/** Outbound transport for one connection; proxies and SSH hosts reference saved configuration. */
export type TransportSpec =
    | { kind: "direct" }
    | { kind: "socks"; proxyId: string }
    | { kind: "ssh-tunnel"; instance: string };
