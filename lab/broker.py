"""Broker stub. Interactive Brokers, paper account only.

Not built until the research loop is proven. The only thing implemented is
the guard that refuses anything that looks like a live-money connection.
"""

from .core import LoopError

PAPER_PORTS = {7497, 4002}   # TWS paper, IB Gateway paper
LIVE_PORTS = {7496, 4001}


def assert_paper(port: int, account: str) -> None:
    if port in LIVE_PORTS:
        raise LoopError(f"Port {port} is an IBKR LIVE port. Paper trading only.")
    if port not in PAPER_PORTS:
        raise LoopError(f"Port {port} is not a known IBKR paper port {sorted(PAPER_PORTS)}.")
    if not account.startswith("DU"):
        raise LoopError("IBKR account is not a paper account (paper IDs start with DU).")


class PaperBroker:
    def __init__(self, host: str, port: int, client_id: int, account: str):
        assert_paper(port, account)
        raise NotImplementedError("Broker not built yet. Research loop first.")
