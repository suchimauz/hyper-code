/** Secret-free SSH instance descriptor; private material lives outside the repository. */
export type Instance = { name: string; host: string; user: string; port: number; id: string; publicKey: string; pinnedHostKey: string | null; updatedAt: number };
