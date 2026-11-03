declare module "c2pa-node" {
  export type C2paReadResult = {
    manifest?: unknown;
  };

  export function read(bytes: Uint8Array): Promise<C2paReadResult>;
  const c2pa: {
    read: (bytes: Uint8Array) => Promise<C2paReadResult>;
  };
  export default c2pa;
}

export {};
