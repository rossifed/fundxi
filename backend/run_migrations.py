#!/usr/bin/env python3
import os
import subprocess
import sys

# Get DATABASE_URL from environment
db_url = os.environ.get("DATABASE_URL")
if not db_url:
    print("ERROR: DATABASE_URL not set")
    sys.exit(1)

# Transform to asyncpg dialect
if db_url.startswith("postgresql://"):
    db_url = db_url.replace("postgresql://", "postgresql+asyncpg://")

print(f"Running Alembic migrations...")
print(f"Database: {db_url.split('@')[1].split('/')[0] if '@' in db_url else 'unknown'}")

# Run alembic upgrade
result = subprocess.run(
    ["uv", "run", "alembic", "upgrade", "head"],
    env={**os.environ, "DATABASE_URL": db_url},
)

if result.returncode == 0:
    print("✅ Migrations completed successfully!")
else:
    print("❌ Migration failed!")
    sys.exit(1)
