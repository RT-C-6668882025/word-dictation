declare module '*.js';
declare module 'mammoth/mammoth.browser' {
  const mammoth: {
    extractRawText(input:{arrayBuffer:ArrayBuffer}):Promise<{value:string;messages:unknown[]}>;
  };
  export = mammoth;
}
