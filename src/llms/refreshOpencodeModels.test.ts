import { expect, test } from "bun:test";
import refresh from "./refreshOpencodeModels";

test("Connections refresh forces model rediscovery and returns only the count", async () => {
 const ctx: any = { state: {llmModelCatalog:{all:{at:1},skipNodes:{at:1}}}, fns: { llm: { opencodeModels: async (opts: object) => {
  expect(opts).toEqual({refresh:true});
  return ["opencode:first", "opencode:second"];
 } } } };
 const html = await refresh(ctx, null, {});
 expect(ctx.state.llmModelCatalog.all).toBeUndefined();
 expect(ctx.state.llmModelCatalog.skipNodes).toBeUndefined();
 expect(html).toContain("2 callable models");
 expect(html).not.toContain("opencode:first");
});
