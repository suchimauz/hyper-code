/**
 * List supported chat commands and their composer capabilities
 *
 * Use for command discovery rather than hard-coding slash commands in clients. Only registered commands are dispatched.
 */
export default async function (
    ctx: Context,
    session: Session | null,
    opts: {},
): Promise<{name:string;description:string;inputHint:string;attachments:boolean;usage:string[]}[]> {
    return [{name:'plan',description:'Plan before executing; advisory, not a sandbox',inputHint:'/plan [task|off]',attachments:false,usage:['/plan','/plan <task>','/plan off']}, {name:'compact',description:'Compact context using the existing summarizer',inputHint:'/compact [instructions]',attachments:false,usage:['/compact','/compact <instructions>']}];
}
