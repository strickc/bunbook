import * as ts from "typescript";

// Shared state for the Language Service
let languageService: ts.LanguageService | null = null;
let currentSource = "";
let currentVersion = 0;

// This worker won't have the standard libs (lib.d.ts) available locally in the virtual FS
// So we define a skeleton 'lib' to avoid every cell being full of "Cannot find console/fetch" errors.
const libSource = `
  declare var console: { log(...args: any[]): void; error(...args: any[]): void; table(obj: any): void; };
  declare function fetch(url: string, init?: any): Promise<any>;
  declare var JSON: { stringify(obj: any): string; parse(str: string): any; };
  declare var Bun: { 
    file(path: string): any; 
    write(path: string, content: any): Promise<number>;
    password: { hash(pw: string): Promise<string>; verify(pw: string, hash: string): Promise<boolean>; };
  };
`;

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
  getCompilationSettings: () => ({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.CommonJS,
    allowJs: true,
    checkJs: true,
    strict: true,
    noEmit: true,
  }),
  getDefaultLibFileName: () => "lib.d.ts",
};

languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

self.onmessage = (e) => {
  const { type, source, id } = e.data;

  if (type === "update") {
    currentSource = source;
    currentVersion++;

    const syntactic = languageService!.getSyntacticDiagnostics("notebook.ts");
    const semantic = languageService!.getSemanticDiagnostics("notebook.ts");
    
    const all = [...syntactic, ...semantic].map(d => ({
        start: d.start,
        length: d.length,
        message: typeof d.messageText === "string" ? d.messageText : d.messageText.messageText,
        category: d.category
    }));

    self.postMessage({ type: "diagnostics", diagnostics: all, id });
  }
};
