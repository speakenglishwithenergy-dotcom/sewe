"""Minimal checks for the skit validator. Run: python3 tests/test_skit_validate.py"""
import importlib.util
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
os.environ.setdefault("LLM_MOCK_FILE", "x")  # stops the module touching any API on import
spec = importlib.util.spec_from_file_location("gs", ROOT / "scripts" / "generate_skit.py")
gs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gs)

failures = []


def check(name, cond):
    print(("ok  " if cond else "FAIL") + f"  {name}")
    if not cond:
        failures.append(name)


# a valid skit passes
good = json.loads((ROOT / "src" / "short" / "skit" / "demo" / "demo-skit.json").read_text())
gs.coerce_story(good)
check("valid demo skit passes", gs.validate(good) == [])

# missing recap fails
no_recap = json.loads(json.dumps(good)); no_recap.pop("recap")
check("missing recap fails", any("recap" in e for e in gs.validate(no_recap)))

# a greeting opener fails
greet = json.loads(json.dumps(good))
greet["scenes"][0]["lines"][0]["text"] = "Hi there friend"
check("greeting opener fails", any("greeting" in e for e in gs.validate(greet)))

# unknown look fails
bad_look = json.loads(json.dumps(good))
bad_look["characters"]["ben"]["look"] = "robot"
check("unknown look fails", any("look" in e for e in gs.validate(bad_look)))

# too-long opening line fails
long_open = json.loads(json.dumps(good))
long_open["scenes"][0]["lines"][0]["text"] = "This opening line is far too long to stop any scroller today"
check("long opener fails", any("opening line" in e for e in gs.validate(long_open)))

# unknown action is coerced to a known one, not left invalid
coerce = json.loads(json.dumps(good))
coerce["scenes"][0]["lines"][0]["action"] = "nod"
gs.coerce_story(coerce)
check("unknown action coerced", coerce["scenes"][0]["lines"][0]["action"] in gs.ACTIONS)

print()
if failures:
    print(f"{len(failures)} failed: {failures}")
    sys.exit(1)
print("all skit validator checks passed")
