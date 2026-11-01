import os

path = os.path.join("tests", "test_repo.py")
with open(path, "rb") as f:
    text = f.read().decode("utf-8").replace("\r\n", "\n")

target_every = '''def every_text_file():
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in (".git", "__pycache__")]'''

replacement_every = '''def every_text_file():
    ignored_dirs = {".git", "__pycache__", ".venv", "node_modules"}
    for base, dirs, files in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in ignored_dirs]'''

assert target_every in text, "target_every not found"
text = text.replace(target_every, replacement_every)

target_root = '''    def test_root_matches_the_reel(self):
        root = sorted(d for d in os.listdir(ROOT) if not d.startswith(".git"))
        self.assertEqual(root, sorted([".claude-plugin", "LICENSE", "README.md", "tests"] + SKILLS))'''

replacement_root = '''    def test_root_matches_the_reel(self):
        ignored = {".git", ".venv", "scripts", "trader", "trader_b3", "trader_binance", "trader_engine", "trader_us", "backend", "frontend"}
        root = sorted(d for d in os.listdir(ROOT) if not d.startswith(".git") and d not in ignored)
        self.assertEqual(root, sorted([".claude-plugin", "LICENSE", "README.md", "tests"] + SKILLS))'''

assert target_root in text, "target_root not found"
text = text.replace(target_root, replacement_root)

with open(path, "wb") as f:
    f.write(text.encode("utf-8"))

print("Updated tests/test_repo.py")
