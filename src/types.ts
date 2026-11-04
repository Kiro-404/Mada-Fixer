export type Issue = { id: string; impact: string | null; selector: string; html: string; data?: any; help?: string };
export type El = Issue & { bbox: { x: number; y: number; width: number; height: number } | null; context: string; shot?: Buffer };
// op: "attr" (default) sets an attribute; "title" sets the page title; "css" appends a stylesheet;
// "html" inserts markup at the top of <body>; "text" replaces the visible text of a leaf element.
export type Fix = {
  issueId: string; selector: string; attr: string; value: string; confidence: number;
  status: "applied" | "review" | "failed";
  op?: "attr" | "title" | "css" | "html" | "text";
  html?: string; extra?: [string, string][]; diff?: string; criticRounds?: number;
};
