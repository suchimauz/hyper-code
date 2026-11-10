export default {
    type: "secret",
    env: "MAUZCODE_OIDC_CLIENT_SECRET",
    default: null,
    title: "Sign-in provider client secret",
    description: "OIDC client secret for this MauzCode. May be an op:// or secret:// reference.",
};
