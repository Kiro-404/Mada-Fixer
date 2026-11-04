// Very small robots.txt reader: false only when the "*" group disallows the whole site.
export function robotsAllowsAll(text: string): boolean {
  let star = false;
  for (const raw of text.split(/\r?\n/)) {
    const m = /^(user-agent|disallow)\s*:\s*(.*)$/i.exec(raw.split("#")[0].trim());
    if (!m) continue;
    if (m[1].toLowerCase() === "user-agent") star = m[2].trim() === "*";
    else if (star && m[2].trim() === "/") return false;
  }
  return true;
}

export async function allowed(url: string): Promise<boolean> {
  if (!/^https?:/.test(url)) return true;
  try {
    const r = await fetch(new URL("/robots.txt", url), { signal: AbortSignal.timeout(8000) });
    return r.ok ? robotsAllowsAll(await r.text()) : true;
  } catch { return true; }
}
