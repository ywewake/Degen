"""Shared fixtures: a temp LOOP_ROOT that is a git repo whose `origin` is a
local bare repo protected like the GitHub branch (no force-push, no delete)."""

import subprocess
from pathlib import Path


def git(cwd, *args):
    subprocess.run(["git", "-C", str(cwd), *args], check=True, capture_output=True)


def make_repo_with_protected_origin(root: Path) -> Path:
    remote = root.parent / (root.name + "-origin.git")
    git(root.parent, "init", "-q", "--bare", str(remote))
    git(remote, "config", "receive.denyNonFastForwards", "true")
    git(remote, "config", "receive.denyDeletes", "true")
    git(root, "init", "-q")
    git(root, "remote", "add", "origin", str(remote))
    return remote
