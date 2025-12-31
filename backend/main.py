import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from openai import OpenAI

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# class AskRequest(BaseModel):
#     videoId: str | None = None
#     currentTime: float | None = None
#     duration: float | None = None
#     isPlaying: bool | None = None
#     title: str | None = None
#     channel: str | None = None
#     question: str  # required

class AskResponse(BaseModel):
    answer: str
    status_code: int


api_key=os.environ.get("OPENAI_API_KEY")
client = OpenAI(api_key=api_key)



@app.post("/chat")
async def ask(req):
    '''
        post request to ask gpt api a question about the youtube video
    '''
    print('asking')
    print(req)

    
    gpt_base_prompt = (
        "You are ClipChat, an assistant that answers questions about a YouTube video. "
        "Use the provided title, channel, and timestamp to ground your answer. "
        "If you don't have enough context, answer in a general but helpful way and say "
        "that you're inferring from limited information."
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


    
