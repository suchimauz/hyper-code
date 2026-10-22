export default {
    type: 'string',
    default: '',
    title: 'Z.ai instance',
    description: 'SSH instance used as the network egress for Z.ai Coding Plan calls and quota checks. "local" or empty sends them from this machine; any other value must name a trusted SSH instance. The plan API key travels over that SSH channel to the instance and back — the remote host never stores it.',
};
