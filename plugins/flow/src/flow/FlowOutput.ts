/** Declaration output. Preview returns gaps; effects alone do not prove closure. */
export type FlowOutput = {
 /** Legacy trusted card HTML, retained for unmigrated declarations only. */ html?: string;
 /** Native submit outcome. Validation is retryable only before the handler has any effect. */
 receipt?: {
  status: 'validation'|'stale'|'closed'|'remains'|'unconfirmed';
  message: string;
  errors?: Record<string,string>;
  values?: Record<string,string>;
 };
 gaps?: types.flow.Gap[];
 effects?: Array<{reference:string;label?:string}>;
 explanation?: string;
};
