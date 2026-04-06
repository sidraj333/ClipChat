import json
import os
import re

from auth.cognito import verify_jwt_token
from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Any, Dict, Optional
from openai import OpenAI
from mangum import Mangum

from cache.redis_client import (
    cache_get_json,
    cache_set_json,
    acquire_lock,
    release_lock,
)


import httpx

app = FastAPI()
handler = Mangum(app) #make fastify app lambda compatible

# CORS setup to allow requests from the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

class AskRequest(BaseModel):
    question: str
    videoId: Optional[str] = None
    currentTime: Optional[float] = None
    isPaused: Optional[bool] = None
    playbackSpeed: Optional[float] = None

class AskResponse(BaseModel):
    answer: str
    status_code: int

class PrefetchRequest(BaseModel):
    videoId: str

class PrefetchResponse(BaseModel):
    status: str
    status_code: int


api_key=os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)
TRANSCRIPT_TTL_SECONDS = 60 * 60 * 6
META_DATA_TTL_SECONDS = 60 * 60 * 6


async def get_video_metadata_cached(video_id: str):
    meta_data_key = f"video:{video_id}:meta_data"
    cached_meta_data = await cache_get_json(meta_data_key)
    if cached_meta_data is not None:
        print(f"meta_data_cache_hit video_id={video_id}")
        return cached_meta_data

    print(f"meta_data_cache_miss video_id={video_id}")
    video_meta_data = await fetch_video_metadata(video_id) or {}
    if video_meta_data:
        await cache_set_json(
            meta_data_key,
            video_meta_data,
            ttl_seconds=META_DATA_TTL_SECONDS,
        )
        print(f"meta_data_cache_set video_id={video_id}")
    return video_meta_data


async def get_transcript_cached(video_id: str):
    transcript_key = f"video:{video_id}:transcript"
    cached_transcript = await cache_get_json(transcript_key)
    if cached_transcript is not None:
        print(f"transcript_cache_hit video_id={video_id}")
        return cached_transcript.get("text", "")

    print(f"transcript_cache_miss video_id={video_id}")
    transcript_text = await fetch_transcript(video_id) or ""
    if transcript_text:
        await cache_set_json(
            transcript_key,
            {"text": transcript_text},
            ttl_seconds=TRANSCRIPT_TTL_SECONDS,
        )
        print(f"transcript_cache_set video_id={video_id}")
    return transcript_text

@app.post("/prefetch", response_model=PrefetchResponse)
async def prefetch(req: PrefetchRequest, claims: Dict[str, Any] = Depends(verify_jwt_token)):
    video_id = (req.videoId or "").strip()
    if not video_id:
        return PrefetchResponse(status="invalid_video_id", status_code=400)
    print(f"prefetch_requested video_id={video_id}")
    transcript_key = f"video:{video_id}:transcript"
    meta_data_key = f"video:{video_id}:meta_data"
    lock_key = f"lock:video:{video_id}"

    try:
        cached_transcript = await cache_get_json(transcript_key)
        cached_metadata = await cache_get_json(meta_data_key)
        if cached_transcript is not None and cached_metadata is not None:
            #video data is already in the cache
            print(f"prefetch_cache_hit video_id={video_id}")
            return PrefetchResponse(status = "video already cached", status_code = 200)

        got_lock = await acquire_lock(lock_key, ttl_seconds = 60)
        if not got_lock:
            print(f"prefetch_in_progress video_id={video_id}")
            return PrefetchResponse(status = 'video in progress of being cached', status_code = 200)
        try:
            print(f"prefetch_lock_acquired video_id={video_id}")
            # Re-check after lock (another request may have filled cache)
            cached_transcript = await cache_get_json(transcript_key)
            cached_metadata = await cache_get_json(meta_data_key)

            if cached_transcript is None:
                transcript_text = await fetch_transcript(video_id)
                if not transcript_text:
                    print("video does not have transcript data")
                else:
                    await cache_set_json(transcript_key, {"text": transcript_text}, ttl_seconds=60 * 60 * 6)
                    print(f"prefetch_transcript_cached video_id={video_id}")
            if cached_metadata is None:
                video_meta_data = await fetch_video_metadata(video_id)
                if not video_meta_data:
                    print("video does not have any meta data")
                else:
                    await cache_set_json(meta_data_key, video_meta_data, ttl_seconds=60 * 60 * 6)
                    print(f"prefetch_meta_data_cached video_id={video_id}")
            print(f"prefetch_complete video_id={video_id}")
            return PrefetchResponse(status="prefetched", status_code=200)
        finally:
            await release_lock(lock_key)
            print(f"prefetch_lock_released video_id={video_id}")
    except Exception as e:
        print("Prefetch error:", e)
        return PrefetchResponse(status="error", status_code=500)


        






        
 







@app.post("/chat", response_model=AskResponse)
async def ask(req: AskRequest, claims: Dict[str, Any] = Depends(verify_jwt_token)):
    '''
        post request to ask gpt api a question about the youtube video
    '''
    print('asking')
    print(req)

    try:

        video_metadata = await get_video_metadata_cached(req.videoId) if req.videoId else {}

        if req.videoId:
            full_formatted_transcript = await get_transcript_cached(req.videoId)
        else:
            full_formatted_transcript = ""
        
        gpt_base_prompt = """
            You are ClipChat.
            Answer the user's question directly based on the context.
            If the question is NOT about this video, feel free to use your general knowledge. and use the internet if needed.

        """


        # Merge client runtime state + backend API metadata
        user_prompt = {
            "videoId": req.videoId,
            "currentTime": req.currentTime,
            "isPaused": req.isPaused,
            "isPlaying": (None if req.isPaused is None else (not req.isPaused)),
            "playbackSpeed": req.playbackSpeed,

            "title": video_metadata.get("title"),
            "channel": video_metadata.get("channelName"),
            "channelId": video_metadata.get("channelId"),
            "durationSeconds": video_metadata.get("durationSeconds"),
            "publishedAt": video_metadata.get("publishedAt"),
            "viewCount": video_metadata.get("viewCount"),
            "likeCount": video_metadata.get("likeCount"),
            "commentCount": video_metadata.get("commentCount"),
            "thumbnailUrl": video_metadata.get("thumbnailUrl"),
            "isLive": video_metadata.get("isLive"),
            "transcript": full_formatted_transcript,

        }

        print("user_prompt:", user_prompt)

        user_content = f"""
        User question: {req.question}

        Video metadata:
        - Video ID: {user_prompt.get("videoId")}
        - Title: {user_prompt.get("title")}
        - Channel: {user_prompt.get("channel")}
        - Channel ID: {user_prompt.get("channelId")}
        - Duration (seconds): {user_prompt.get("durationSeconds")}
        - Current Time (seconds): {user_prompt.get("currentTime")}
        - Is Paused: {user_prompt.get("isPaused")}
        - Is Playing: {user_prompt.get("isPlaying")}
        - Playback Speed: {user_prompt.get("playbackSpeed")}

        Transcript context:
        {full_formatted_transcript[:6000]}
        """
    
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": gpt_base_prompt},
                {"role": "user", "content": user_content},
            ],
            temperature=0.2,
        )

        answer_text = completion.choices[0].message.content
        print("answer text: ", answer_text)

        return AskResponse(
            answer=answer_text,
            status_code = 200
        )

    except Exception as e:
        print("Error calling OpenAI:", e)
        # Return a safe fallback so frontend doesn't crash
        return AskResponse(
            answer="Internal Server Error",
            status_code = 500
        )


async def fetch_video_metadata(video_id: str):
    '''
        fetches video metadata using youtube data api v3
        not currently used but can be used in the future to provide more context to gpt about the video
    '''
    youtube_api_key = os.environ.get("YOUTUBE_API_KEY")
    if not youtube_api_key:
        print("YOUTUBE_API_KEY is missing")
        return {}

    try:
        async with httpx.AsyncClient(timeout=10.0) as http_client:
            response = await http_client.get(
                "https://www.googleapis.com/youtube/v3/videos",
                params={
                    "part": "snippet,contentDetails,statistics,liveStreamingDetails",
                    "id": video_id,
                    "key": youtube_api_key,
                },
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as e:
        print(f"Error calling YouTube Data API for video {video_id}: {e}")
        return {}

    items = payload.get("items", [])
    if not items:
        print(f"No metadata found for video {video_id}")
        return {}

    item = items[0]
    snippet = item.get("snippet", {})
    content_details = item.get("contentDetails", {})
    statistics = item.get("statistics", {})
    live_streaming = item.get("liveStreamingDetails", {})
    raw_duration = content_details.get("duration")

    return {
        "videoId": item.get("id"),
        "title": snippet.get("title"),
        "channelName": snippet.get("channelTitle"),
        "channelId": snippet.get("channelId"),
        "publishedAt": snippet.get("publishedAt"),
        "duration": raw_duration,
        "durationSeconds": parse_iso8601_duration_to_seconds(raw_duration),
        "viewCount": statistics.get("viewCount"),
        "likeCount": statistics.get("likeCount"),
        "commentCount": statistics.get("commentCount"),
        "thumbnailUrl": (snippet.get("thumbnails", {}).get("high") or {}).get("url"),
        "isLive": bool(live_streaming),
    }


def parse_iso8601_duration_to_seconds(raw_duration: Optional[str]) -> Optional[int]:
    if not raw_duration:
        return None

    match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", raw_duration)
    if not match:
        return None

    hours = int(match.group(1) or 0)
    minutes = int(match.group(2) or 0)
    seconds = int(match.group(3) or 0)
    return (hours * 3600) + (minutes * 60) + seconds

async def fetch_transcript(video_id: str):
    supadata_api_key = os.environ.get("SUPADATA_API_KEY")
    if not supadata_api_key:
        print("SUPADATA_API_KEY is missing")
        return ""

    try:
        async with httpx.AsyncClient(timeout=20.0) as http_client:
            response = await http_client.get(
                "https://api.supadata.ai/v1/youtube/transcript",
                params={
                    "videoId": video_id,
                    "lang": "en",
                    "text": "true",
                },
                headers={
                    "x-api-key": supadata_api_key,
                },
            )
            response.raise_for_status()
            payload = response.json()
    except Exception as e:
        print(f"Error fetching transcript from Supadata for video {video_id}: {e}")
        return ""

    content = payload.get("content")

    # text=true should return a plain string, but keep a safe fallback for chunked responses.
    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        return " ".join(
            item.get("text", "").strip()
            for item in content
            if isinstance(item, dict) and item.get("text")
        ).strip()

    return ""


    
