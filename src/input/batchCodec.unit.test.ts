import { describe, expect, test } from "bun:test";
import choice from "./$input_choice";
import confirm from "./$input_confirm";
import grid from "./$input_grid";
import secret from "./$input_secret";

const codecs = { choice: choice.batch, confirm: confirm.batch, grid: grid.batch, secret: secret.batch };
describe("pure batch codecs", () => {
    test("all hooks are synchronous and normalization is idempotent", () => {
        const specs = { choice: { options: ["a", "b"] }, confirm: {}, grid: { rows: [{ id: 1, name: "First" }] }, secret: { saveAs: "secret://test/key" } };
        for (const name of Object.keys(codecs) as (keyof typeof codecs)[]) {
            const codec = codecs[name];
            const spec = codec.normalizeSpec({ spec: specs[name] });
            expect(spec).not.toBeInstanceOf(Promise);
            expect(codec.normalizeSpec({ spec })).toEqual(spec);
            expect(codec.projectSpec({ spec })).toEqual(spec);
        }
    });
    test("choice rejects forged/duplicate picks, excess single selections and forbidden other", () => {
        const codec = choice.batch;
        const spec = codec.normalizeSpec({ spec: { options: ["a", "b"] } });
        for (const values of [{ pick: "forged" }, { pick: ["a", "a"] }, { pick: ["a", "b"] }, { other: "oops" }, { pick: "a", other: ["oops"] }, { pick: "a", extra: "x" }] as types.input.FormValues[]) expect(codec.validate({ spec, values }).ok).toBe(false);
        expect(codec.validate({ spec, values: { pick: "a" } })).toMatchObject({ ok: true, result: { value: "a" } });
        expect(codec.validate({ spec: codec.normalizeSpec({ spec: { options: ["a"], allowOther: true } }), values: { other: " custom " } })).toMatchObject({ ok: true, result: { other: "custom" } });
    });
    test("decline is a valid confirmation answer", () => {
        const spec = confirm.batch.normalizeSpec({ spec: {} });
        expect(confirm.batch.validate({ spec, values: { decision: "no" } })).toMatchObject({ ok: true, result: { confirmed: false } });
        expect(confirm.batch.validate({ spec, values: { decision: ["yes"] } }).ok).toBe(false);
    });
    test("grid is inline only, keys unambiguous, all picks resolve without runtime", () => {
        const codec = grid.batch;
        expect(() => codec.normalizeSpec({ spec: { rows: [], source: { fn: "evil.write" } } })).toThrow();
        expect(() => codec.normalizeSpec({ spec: { rows: [{ id: 1 }, { id: "1" }] } })).toThrow();
        const spec = codec.normalizeSpec({ spec: { rows: [{ id: 1, name: "A" }] } });
        expect(codec.validate({ spec, values: { pick: "2" } }).ok).toBe(false);
        expect(codec.validate({ spec, values: { pick: "1" } })).toMatchObject({ ok: true, result: { value: "1", row: { id: 1, name: "A" } } });
    });
    test("secret projects reference only and errors never echo plaintext", () => {
        const codec = secret.batch;
        const spec = codec.normalizeSpec({ spec: { saveAs: "secret://test/key", maxlength: 10 } });
        const valid = codec.validate({ spec, values: { value: " hidden " } });
        expect(valid).toMatchObject({ ok: true, values: { value: " hidden " }, result: { ref: "secret://test/key" } });
        expect(codec.projectDraft({ spec, values: { value: "hidden" } })).toEqual({});
        const invalid = codec.validate({ spec, values: { value: "SENSITIVE_TOO_LONG" } });
        expect(invalid.ok).toBe(false);
        expect(JSON.stringify(invalid)).not.toContain("SENSITIVE");
        expect(() => codec.normalizeSpec({ spec: { saveAs: "op://vault/key" } })).toThrow();
        const otp = codec.normalizeSpec({ spec: { saveAs: "secret://test/otp", mode: "otp" } });
        expect(codec.validate({ spec: otp, values: { value: "---" } }).ok).toBe(false);
        expect(codec.validate({ spec: otp, values: { value: "123 456" } })).toMatchObject({ ok: true, values: { value: "123456" } });
    });
    test("unknown spec fields are denied for all builtins", () => {
        for (const codec of Object.values(codecs)) expect(() => codec.normalizeSpec({ spec: { arbitrary: "x" } })).toThrow();
    });
});
