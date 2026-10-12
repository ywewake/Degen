"""Development data access. Only data/development/ is reachable from here."""

from pathlib import Path

from . import core
from .core import LoopError


def dev_path(name: str) -> Path:
    base = (core.root() / "data" / "development").resolve()
    p = (base / name).resolve()
    if not p.is_relative_to(base) or p.suffix == ".sealed":
        raise LoopError(f"{name!r} is outside data/development/. Development code only gets development data.")
    return p


def read(name: str) -> bytes:
    return dev_path(name).read_bytes()
