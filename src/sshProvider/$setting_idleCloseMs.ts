export default {
    type: 'number',
    default: 300000,
    min: 0,
    max: 86400000,
    title: 'Idle SSH tunnel close (ms)',
    description: 'A pooled tunnel without requests closes after this delay; 0 closes it as soon as its last request finishes.',
};
