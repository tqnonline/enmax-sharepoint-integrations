"""Deterministic-GUID seed loader for Dataverse master data.

Plan #02 implements the full logic. This plan ships the entrypoint signature only.
"""

import uuid
from pathlib import Path

UUID_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "enmax-autocad")


def deterministic_id(table: str, natural_key: str) -> uuid.UUID:
    return uuid.uuid5(UUID_NAMESPACE, f"{table}|{natural_key}")


def main() -> int:
    raise NotImplementedError("Implemented in plan #02")


if __name__ == "__main__":
    raise SystemExit(main())
