"""Markdown summary of a skit for the GitHub Actions run page."""
import json, sys
s = json.load(open(sys.argv[1]))
recap = s.get("recap") or {}
out = [f"## {s.get('title', 'Skit')}  (#{s.get('episode', '?')})", "",
       f"**Lesson:** `{s.get('lessonType', '?')}`  ·  **Teaches:** {s.get('lessonFocus', '')}",
       f"**Situation:** {s.get('situation', '')}", "", "### Script", ""]
for i, sc in enumerate(s.get("scenes", [])):
    out.append(f"\n**Scene {i + 1} — {sc.get('caption', '')} ({sc.get('background', '')})**")
    for ln in sc.get("lines", []):
        out.append(f"- **{ln['speaker']}:** {ln['text']}")
if recap:
    out += ["", "### Recap", f"- **{recap.get('phrase', '')}** — {recap.get('meaningVi', '')}"]
print("\n".join(out))
