export default {
    type: "string",
    env: "MAUZCODE_PORTAL_ISSUER",
    default: "https://hn.mauzcode-mesh.xyz",
    title: "Portal assertion issuer",
    description: "Issuer of the hub's X-Hn-Assertion; its signing keys come from <issuer>/.well-known/openid-configuration jwks_uri.",
};
