"""Application layer of the simulation bounded context.

Orchestrates domain rules over driven ports. No SQL, no HTTP, no
logging beyond what the ports themselves do — the wiring layer (CLI)
is responsible for sessions, transactions, and structured logging.
"""
