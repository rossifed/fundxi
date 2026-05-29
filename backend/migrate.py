#!/usr/bin/env python3
"""
Simple migration runner script.
Run with: uv run migrate.py
"""
import subprocess
import sys

def main():
    print("Running Alembic migrations...")
    result = subprocess.run(
        ["uv", "run", "alembic", "upgrade", "head"],
        cwd="/app",
    )
    
    if result.returncode == 0:
        print("✅ Migrations completed successfully!")
        sys.exit(0)
    else:
        print("❌ Migration failed!")
        sys.exit(1)

if __name__ == "__main__":
    main()

