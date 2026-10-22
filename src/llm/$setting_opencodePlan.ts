export default {
    type: 'enum',
    options: ['go', 'payg'],
    default: 'payg',
    title: 'OpenCode plan',
    description: 'Go uses only the /inference/go subscription endpoints; payg uses the separate credit-funded /inference endpoints. No automatic fallback between billing modes.',
};
