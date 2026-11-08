/**
 * Create an inactive explicit migration selector protecting the bootstrap current-account slot.
 *
 * Create an inactive explicit migration selector protecting the bootstrap current-account slot.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.protectedSlot Explicit protectedSlot input for this account operation.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit protectedSlot input for this account operation. */
        protectedSlot: string;
    },
): { enable(slot: string, provenColdStart: boolean): void; mutate(slot: string): void; descriptor(d: { provider: string; instance: string; account: string; }): string; } {
    const protectedSlot=opts.protectedSlot;
    const enabled=new Set<string>();return {enable(slot:string,provenColdStart:boolean){if(slot===protectedSlot||!provenColdStart)throw Error('Migration prohibited: parent or unproven legacy drain');enabled.add(slot)},mutate(slot:string){if(enabled.has(slot))throw Error('Migrated account mutation refused')},descriptor(d:{provider:string;instance:string;account:string}){if(d.provider!=='codex'||!d.instance||!d.account)throw Error('Codex descriptor required');return JSON.stringify([d.instance,d.account])}};
}
