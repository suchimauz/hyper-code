/** JSON-compatible provider action input/output. Results must not contain secrets or secret refs. */
export type ActionValue = string | number | boolean | null | types.models.ActionValue[] | { [key: string]: types.models.ActionValue };
