export default {
    type: "string",
    env: "MAUZCODE_PORTAL_AUDIENCE",
    default: null,
    title: "Portal assertion audience",
    description: "The aud this MauzCode expects in the hub's X-Hn-Assertion, hn:<team>/<node>/<service>, e.g. hn:hr/studio/mauzcode. Assertions for any other service are ignored.",
};
