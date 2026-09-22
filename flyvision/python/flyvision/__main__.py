"""Allow `python3 -m flyvision` from PYTHONPATH=flyvision/python."""

from __future__ import annotations

from flyvision.cli import main

raise SystemExit(main())
