import subprocess
import json

def find_symbols(pattern):
    """Uses ast-grep to find structural code patterns."""
    # Note: Requires ast-grep (sg) installed in Docker
    cmd = ["sg", "scan", "--pattern", pattern, "--json"]
    result = subprocess.run(cmd, capture_output=True, text=True)
    try:
        return json.loads(result.stdout)
    except:
        return {"error": "No matches or ast-grep failure"}
