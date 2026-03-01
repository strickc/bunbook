import * as ts from "typescript";

let languageService: ts.LanguageService | null = null;
let currentSource = "";

const host: ts.LanguageServiceHost = {
  getScriptFileNames: () => ["notebook.ts"],
  getScriptVersion: () => "1",
  getScriptSnapshot: (fileName) => {
    if (fileName === "notebook.ts") return ts.ScriptSnapshot.fromString(currentSource);
    return undefined;
  },
  getCurrentDirectory: () => "/",
  getCompilationSettings: () => ({
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    allowJs: true,
    checkJs: true,
    lib: ["lib.esnext.d.ts", "lib.dom.d.ts"],
  }),
  getDefaultLibFileName: (options) => "lib.d.ts",
};

languageService = ts.createLanguageService(host, ts.createDocumentRegistry());

self.onmessage = (e) => {
  const { type, source, id } = e.data;

  if (type === "update") {
    currentSource = source;
    // Get both syntactic and semantic diagnostics
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

  if (type === "completions") {
      const { pos } = e.data;
      const completions = languageService!.getCompletionsAtPosition("notebook.ts", pos, undefined);
      self.postMessage({ type: "completions", completions, id });
  }
};
