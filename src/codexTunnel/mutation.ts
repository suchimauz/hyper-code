import {AsyncLocalStorage} from 'node:async_hooks';
/**
 * Serialize owner mutations with cross-worker claim exclusion and scoped reentrant internal calls.
 *
 * Serialize owner mutations with cross-worker claim exclusion and scoped reentrant internal calls.
Staged candidate; use only from cold-bootstrapped owner runtime, never direct hot activation.
 * @param opts.io Explicit io input for this account operation.
 */
export default function (
    ctx: Context,
    session: Session | null,
    opts: {
        /** Explicit io input for this account operation. */
        io: {claim:()=>Promise<()=>Promise<void>>};
    },
): { acquire: () => Promise<() => Promise<void>>; run: <T>(work: () => Promise<T>) => Promise<T>; within: <T>(work: () => Promise<T>) => Promise<T>; } {
    const io=opts.io;
    
     const scope=new AsyncLocalStorage<{active:boolean}>();let tail=Promise.resolve();
     async function acquire(){const previous=tail;let release!:()=>void;tail=new Promise<void>(r=>release=r);await previous;let drop:()=>Promise<void>;try{drop=await io.claim()}catch(e){release();throw e}let ended=false;return async()=>{if(ended)return;ended=true;try{await drop()}finally{release()}}}
     async function run<T>(work:()=>Promise<T>):Promise<T>{if(scope.getStore()?.active)return work();const release=await acquire();const token={active:true};try{return await scope.run(token,work)}finally{token.active=false;await release()}}
     async function within<T>(work:()=>Promise<T>):Promise<T>{const token={active:true};try{return await scope.run(token,work)}finally{token.active=false}}
     return {acquire,run,within};
}
