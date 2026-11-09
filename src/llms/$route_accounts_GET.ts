/** Redirect retired HTML fragments to native React LLM connections without side effects. */
export default function (_ctx: Context, _session: Session | null, _opts: { /** Incoming request. */ req?: Request; /** Legacy route parameters. */ params?: Record<string,string> }): Response {
 return new Response(null,{status:303,headers:{Location:"/?settings=llm-connections","Cache-Control":"no-store"}});
}
