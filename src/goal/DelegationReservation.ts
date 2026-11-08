/** Immutable deferred delegation publication receipt; not a bearer credential. */
export type DelegationReservation = Readonly<{ reservationId: string; rootAgentId: string; goalId: string; sourceAgentId: string }>;
