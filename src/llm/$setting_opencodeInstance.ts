export default {
    type: 'string',
    default: '',
    title: 'OpenCode instance',
    description: 'Trusted SSH instance used as network egress for OpenCode Console inference and model discovery. Empty or local uses this machine. The key is carried over the encrypted bridge in memory, never stored on the remote host.',
};
