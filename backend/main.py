import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from openai import OpenAI
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
    videoId: Optional[str] = None
    currentTime: Optional[float] = None
    duration: Optional[float] = None
    isPlaying: Optional[bool] = None
    title: Optional[str] = None
    channel: Optional[str] = None
    question: str  # required

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

    
    gpt_base_prompt = (
        "You are ClipChat, an assistant that answers questions about a YouTube video. "
        "Use the provided video metadata and transcript to answer the user's question. "
        "feel free to use the internet and search to better your answers"
        "if you do not know the answer, say you are infering from the internet as you use it to formulate your answer"
    )

    user_prompt = f'''
        User question: {req.question}
        Video metadata:
        - Video ID: {req.videoId}
        - Title: {req.title}
        - Channel: {req.channel}
        - Current Time (seconds): {req.currentTime}
        - Duration (seconds): {req.duration}
        - Is Playing: {req.isPlaying}
    '''

    try:
        if req.videoId:
            full_formatted_transcript = await fetch_transcript(req.videoId)
        else:
            full_formatted_transcript = ""
    
        user_prompt += f"\nTranscript: {full_formatted_transcript}"
        completion = client.chat.completions.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": gpt_base_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.4,
        )

        answer_text = completion.choices[0].message.content
        print(answer_text)

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


    
