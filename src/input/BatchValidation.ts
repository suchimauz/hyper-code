/** Canonical private fields and public answer, or a safe validation error. No persistence is performed by validation. */
export type BatchValidation =
    | { ok: true; values: types.input.FormValues; result: Record<string, unknown>; summary: string }
    | { ok: false; error: { code: string; message: string } };
