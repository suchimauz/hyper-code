export default {
    type: 'number',
    default: 4,
    min: 1,
    max: 32,
    title: 'Max simultaneous SSH tunnel opens per instance',
    description: 'How many new pooled tunnels to one SSH instance may be handshaking at once; keeps bursts under the sshd MaxStartups.',
};
