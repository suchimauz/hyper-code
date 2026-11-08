/** Trusted worker result: blocked must prevent all model work and ordinary fallback. */
export type DelegationConsumeResult = { status: 'disabled' | 'absent' } | { status: 'blocked'; reason: string } | { status: 'bound'; authority: types.goal.DelegationAuthority };
