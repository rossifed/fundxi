"""Infrastructure layer of the simulation bounded context.

Concrete adapters that implement the ports declared in
``simulation/domain/ports.py``. This is the only layer of the
simulation context allowed to touch SQLAlchemy or the database.
"""
