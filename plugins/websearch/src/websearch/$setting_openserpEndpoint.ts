export default {
    type: 'string',
    env: 'WEBSEARCH_OPENSERP_ENDPOINT',
    default: 'http://127.0.0.1:7000',
    title: 'OpenSERP endpoint',
    description: 'HTTP(S) base URL of an operator-run OpenSERP service exposing /duckduckgo/search and /bing/search. Defaults to local loopback; optional base path supported. No credentials, query, fragment or redirects. No authentication is sent. Used only when engine is openserp; this setting does not start or manage the service.',
};
