declare module 'refractor' {
  const refractor: { registered(language:string):boolean; highlight(code:string,language:string):Array<{type:string;value?:string;properties?:Record<string,unknown>;children?:unknown[]}> };
  export default refractor;
}
