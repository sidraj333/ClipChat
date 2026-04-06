import json
import os
from typing import Any, Optional

import redis.asyncio as redis

REDIS_HOST = os.getenv("REDIS_HOST", "")
REDIS_PORT = int(os.getenv("REDIS_PORT", "6379"))
REDIS_TLS = os.getenv("REDIS_TLS", "true").lower() == "true"

redis_client: Optional[redis.Redis] = None
DEFAULT_TTL_SECONDS = 60 * 60

def get_redis_client() -> redis.Redis:
    """
    Create and reuse one Redis client per Lambda execution environment.
    """
    global redis_client
    if redis_client is None:
        if not REDIS_HOST:
            raise RuntimeError("REDIS_HOST is not set")
    
        redis_client = redis.Redis(
            host=REDIS_HOST,
            port=REDIS_PORT,
            ssl=REDIS_TLS,
            decode_responses=True,
        )

    return redis_client

async def cache_get_json(key: str) -> Optional[dict[str, Any]]:
    """
    Read JSON object from Redis by key.
    Returns None if key does not exist.
    """
    client = get_redis_client()
    raw = await client.get(key)
    if raw is None:
        return None
    return json.loads(raw)

async def cache_set_json(
    key: str,
    value: dict[str, Any],
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
) -> None:
    """
    Store JSON object in Redis with TTL expiry.
    """
    client = get_redis_client()
    await client.set(key, json.dumps(value), ex=ttl_seconds)

async def acquire_lock(key: str, ttl_seconds: int = 60) -> bool:
    """
    Acquire short-lived lock key in Redis.
    NX: set only if key does not already exist.
    EX: auto-expire lock to prevent deadlocks.
    Returns True if lock acquired, False otherwise.
    """
    client = get_redis_client()
    result = await client.set(key, "LOCKED", nx=True, ex=ttl_seconds)
    return bool(result)


async def release_lock(key: str) -> None:
    """
    Release lock key in Redis.
    """
    client = get_redis_client()
    await client.delete(key)

