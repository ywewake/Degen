"""./seal_data and ./evaluate_sealed."""

import sys
from pathlib import Path

from . import core, sealed

SCORER = None  # Milestone 5: the sealed evaluator


def seal_main(argv):
    if len(argv) != 1:
        print("usage: ./seal_data <plaintext file>", file=sys.stderr)
        return 2
    try:
        src = Path(argv[0])
        if not src.is_file():
            raise core.LoopError(f"{src} is not a file.")
        out = sealed.seal(src, sealed.ask_passphrase(confirm=True))
    except core.LoopError as e:
        print(f"ERROR\n\n{e}", file=sys.stderr)
        return 1
    print(f"Sealed to {out.relative_to(core.root())}.")
    print(f"Now delete {src} from anywhere the AI can reach. The key is not stored anywhere.")
    return 0


def evaluate_main(argv):
    if len(argv) != 1 or not argv[0].isdigit():
        print("usage: ./evaluate_sealed <hypothesis id>", file=sys.stderr)
        return 2
    try:
        if SCORER is None:
            raise core.LoopError("The sealed scorer is Milestone 5 and is not built.\n"
                                 "Refusing before asking for the key, so no hypothesis loses its one exam.")
        result = sealed.evaluate(int(argv[0]), sealed.ask_passphrase(), SCORER)
    except core.LoopError as e:
        print(f"ERROR\n\n{e}", file=sys.stderr)
        return 1
    for k, v in result.items():
        print(f"{k}: {v}")
    return 0
