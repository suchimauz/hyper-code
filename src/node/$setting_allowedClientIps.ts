export default {
    type: "json",
    default: [],
    title: "Additional node client IPs",
    description: "Exact socket-peer IP addresses allowed to call node endpoints directly, in addition to loopback and Tailscale. Empty by default. No CIDR, wildcard, hostnames or forwarded clients; IPv4-mapped peers use plain IPv4. Bearer token authentication and provider scopes are still required. HTTP sends tokens and prompts in plaintext: enable only after approving the network and scope, preferably with TLS.",
};
