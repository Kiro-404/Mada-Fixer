export type Issue = { id: string; impact: string | null; selector: string; html: string; data?: any; help?: string };
export type El = Issue & { bbox: { x: number; y: number; width: number; height: number } | null; context: string; shot?: Buffer; text?: string };
// op: "attr" (default) sets an attribute; "title" sets the page title; "css" appends a stylesheet; "html" inserts markup at the top of <body>.
export type Fix = {
  issueId: string; selector: string; attr: string; value: string; confidence: number;
  status: "applied" | "review" | "failed";
  op?: "attr" | "title" | "css" | "html";
  html?: string; context?: string; text?: string; extra?: [string, string][]; diff?: string; criticRounds?: number;
};

export type RunOptions = {
  outDir?: string;
  repoDir?: string;
  audit?: boolean;
  timeoutMs?: number;
};

export type PatchResult = {
  dir: string;
  diffFile: string;
  files: string[];
  requested: number;
  edits: number;
  failed: number;
  unmapped: { id: string; fix: string; reason: string }[];
  skippedFiles: string[];
  warnings: string[];
};
