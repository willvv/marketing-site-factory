"""Windows stand-in for the POSIX `fcntl` module.

`chatgpt-imagegen` imports `fcntl` unconditionally and uses exactly one feature:
advisory `flock()` on lock files, as a cross-process counting semaphore that caps
concurrent generations. Windows has no `fcntl`, so the CLI dies at import on this
machine. This shim provides just that surface, backed by `msvcrt.locking`, which
gives the same non-blocking exclusive-lock-or-raise-OSError behaviour the caller
depends on to detect a taken slot.

Put this directory on PYTHONPATH when invoking the CLI; nothing else imports it.
"""

from __future__ import annotations

import msvcrt

# Values are arbitrary — the caller only ever passes them back to us.
LOCK_SH = 0x01
LOCK_EX = 0x02
LOCK_NB = 0x04
LOCK_UN = 0x08


def _fd(file_or_fd) -> int:
    return file_or_fd if isinstance(file_or_fd, int) else file_or_fd.fileno()


def flock(file_or_fd, operation: int) -> None:
    """Lock or unlock one byte of the file, mimicking POSIX flock semantics.

    Raises OSError when a non-blocking lock request hits a slot another process
    already holds — which is precisely the signal the caller catches to move on
    to the next slot.
    """
    fd = _fd(file_or_fd)

    if operation & LOCK_UN:
        try:
            msvcrt.locking(fd, msvcrt.LK_UNLCK, 1)
        except OSError:
            # Already released (or never held) — unlocking is best-effort, and
            # the caller treats a failed unlock as non-fatal too.
            pass
        return

    # msvcrt locks a byte range from the current position; keep it deterministic
    # so every process contends over the same byte.
    try:
        msvcrt.locking(fd, msvcrt.LK_NBLCK if operation & LOCK_NB else msvcrt.LK_LOCK, 1)
    except OSError:
        raise


def lockf(file_or_fd, operation: int, length: int = 0, start: int = 0, whence: int = 0) -> None:
    flock(file_or_fd, operation)


def fcntl(file_or_fd, op: int, arg=0):  # noqa: A001 - matching the POSIX name
    raise OSError("fcntl() is not supported on Windows")


def ioctl(file_or_fd, request: int, arg=0, mutate_flag: bool = True):
    raise OSError("ioctl() is not supported on Windows")
