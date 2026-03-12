import os
import re
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from openai import OpenAI
import httpx
# third‑party helper for fetching YouTube transcripts via Python
from youtube_transcript_api import YouTubeTranscriptApi

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
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


api_key=os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)



@app.post("/chat", response_model=AskResponse)
async def ask(req: AskRequest):
    '''
        post request to ask gpt api a question about the youtube video
    '''
    print('asking')
    print(req)
    try:

        video_metadata = await fetch_video_metadata(req.videoId) if req.videoId else {}

        if req.videoId:
            full_formatted_transcript = await fetch_transcript(req.videoId)
        else:
            full_formatted_transcript = ""
        
        gpt_base_prompt = """
            You are ClipChat.
            Answer the user's question directly.
            If the question is NOT about this video, say that clearly and answer generally if possible.
            Keep answers concise.
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
    try:
        ytt = YouTubeTranscriptApi()
        fetched_data = ytt.fetch(video_id, languages=["en"])

        print("Fetched raw transcript data:", fetched_data)

        if not fetched_data or not hasattr(fetched_data, 'snippets'):
            #unable ot fetch transcript
            return ""

        segments = [
            {
                "timestamp": item.start, 
                "text": item.text, 
                "seconds": item.start,
                "end_seconds": item.start + item.duration,
        
            } 
            for item in fetched_data.snippets
        ]
    except Exception as e:
        print(f"Error fetching transcript for video {video_id}: {e}")
        return ""

    return " ".join(item["text"] for item in segments)


    
