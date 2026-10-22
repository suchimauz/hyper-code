export default {
    type: 'enum',
    options: ['standard', 'priority'],
    default: 'standard',
    title: 'MiniMax request admission tier',
    description: 'Request admission tier for MiniMax M Plan requests. "standard" uses the normal queue; "priority" is admitted ahead of other requests (1.5x price on the metered API) and reduces failures and latency. MiniMax-M3.1-Flash does not support this field and ignores it.',
};
