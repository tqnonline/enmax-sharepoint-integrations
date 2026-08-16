"""Logging helpers for powerplatform_deploy.

Windows CI defaults stdout/stderr to cp1252, which crashes on non-ASCII output
(e.g. arrow characters in status messages). Call get_logger early in any entry
point to ensure UTF-8 encoding is used throughout the process.
"""

from __future__ import annotations

import logging
import sys


def get_logger(name: str, verbose: bool = False) -> logging.Logger:
    """Return a configured logger, reconfiguring stdout/stderr to UTF-8 if possible.

    The encoding guard uses hasattr so it is safe on non-reconfigurable streams
    (e.g. StringIO in tests, or Python < 3.7).

    Args:
        name: Logger name, typically __name__ of the calling module.
        verbose: When True sets level to DEBUG; otherwise INFO.

    Returns:
        A Logger instance with a StreamHandler on stdout.
    """
    # Reconfigure stdout/stderr to UTF-8 so non-ASCII status chars don't crash
    # on Windows CI (cp1252 default).
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")

    logger = logging.getLogger(name)
    level = logging.DEBUG if verbose else logging.INFO
    logger.setLevel(level)

    if not logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setLevel(level)
        formatter = logging.Formatter("%(asctime)s  %(levelname)-8s  %(name)s  %(message)s")
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    return logger
