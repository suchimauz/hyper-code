export default {
    type: 'number',
    default: 30,
    min: 1,
    max: 200,
    title: 'Max SSH tunnels per instance',
    description: 'Upper bound of pooled ssh -D SOCKS tunnels kept open to one SSH instance for provider requests. When all are busy, new requests share the least-loaded tunnel.',
};
