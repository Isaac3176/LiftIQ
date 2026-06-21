"""Compatibility entrypoint for Raspberry Pi server."""

import asyncio

from ws_reps_server import main


if __name__ == "__main__":
    asyncio.run(main())
