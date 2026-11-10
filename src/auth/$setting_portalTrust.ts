export default {
    type: "boolean",
    env: "MAUZCODE_PORTAL_TRUST",
    default: false,
    title: "Trust the mauzcodemesh portal",
    description: "When on, anyone the mauzcodemesh hub lets through is signed in: MauzCode verifies the hub's signed X-Hn-Assertion header (issuer auth.portalIssuer, audience auth.portalAudience) and creates a member user on first visit. Disabled users stay blocked. Without a valid assertion sign-in works as before.",
};
