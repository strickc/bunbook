import * as ts from "typescript";

// Shared state
let currentSource = "";
let currentVersion = 0;

const libSource = `
  declare var console: { log(...args: any[]): void; error(...args: any[]): void; table(obj: any): void; };
  declare function fetch(url: string, init?: any): Promise<any>;
  declare var JSON: { stringify(obj: any): string; parse(str: string): any; };
  declare var Bun: { 
    file(path: string): any; 
    write(path: string, content: any): Promise<number>;
    password: { hash(pw: string): Promise<string>; verify(pw: string, hash: string): Promise<boolean>; };
  };
  interface Array<T> { push(...items: T[]): number; }
`;

const compilerOptions: ts.CompilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
    allowJs: true,
    checkJs: true,
    strict: false,
    noEmit: true,
    noImplicitAny: false,
    suppressImplicitAnyIndexErrors: true,
};

const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => ["notebook.ts", "lib.d.ts"],
  getScriptVersion: (fileName) => {
    if (fileName === "notebook.ts") return currentVersion.toString();
    return "1";
  },
  getScriptSnapshot: (fileName) => {
    if (fileName === "notebook.ts") return ts.ScriptSnapshot.fromString(currentSource);
    if (fileName === "lib.d.ts") return ts.ScriptSnapshot.fromString(libSource);
    return undefined;
  },
  getCurrentDirectory: () => "/",
  getCompilationSettings: () => compilerOptions,
  getDefaultLibFileName: () => "lib.d.ts",
  readFile: (path: string) => {
      if (path === "notebook.ts") return currentSource;
      if (path === "lib.d.ts") return libSource;
      return undefined;
  },
  fileExists: (path: string) => path === "notebook.ts" || path === "lib.d.ts"
};

const languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

self.onmessage = (e) => {
  const { type, source, id } = e.data;

  if (type === "update") {
    currentSource = source;
    currentVersion++;

    // Force re-evaluation of syntactic and semantic results
    const syntactic = languageService.getSyntacticDiagnostics("notebook.ts");
    const semantic = languageService.getSemanticDiagnostics("notebook.ts");
    
    const all = [...syntactic, ...semantic]
        .filter(d => ![2451, 2300, 2393, 2339].includes(d.code)) // Added 2339 to filter (Property not found)
        .map(d => ({
            start: d.start,
            length: d.length,
            message: typeof d.messageText === "string" ? d.messageText : d.messageText.messageText,
            category: d.category,
            code: d.code
        }));

    self.postMessage({ type: "diagnostics", diagnostics: all, id });
  }
};
