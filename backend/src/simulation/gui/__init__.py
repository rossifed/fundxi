"""Driving adapters with a graphical UI.

The Streamlit control panel lives here. It is structurally symmetrical
to the CLI in ``src/simulation/cli/``: a thin wiring layer over the
simulation Use Cases that owns its own session boundary, with no
dependency on the React main app.
"""
