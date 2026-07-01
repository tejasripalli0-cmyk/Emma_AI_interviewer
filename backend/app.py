from fastapi import FastAPI, UploadFile, File, Form
from pydantic import BaseModel
from gemini_service import ask_gemini
from pypdf import PdfReader
import io
import uuid
import os

from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI()

# Enable CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = {}

class AnswerRequest(BaseModel):
    session_id: str
    answer: str


# -----------------------------
# Frontend Configuration
# -----------------------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(BASE_DIR, "..", "frontend")

# Serve CSS, JS and other static files
app.mount("/static", StaticFiles(directory=FRONTEND_DIR), name="static")


@app.get("/")
def serve_frontend():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))


# -----------------------------
# PDF/TXT Processing
# -----------------------------
def extract_text_from_pdf(file_bytes):
    reader = PdfReader(io.BytesIO(file_bytes))
    text = ""

    for page in reader.pages:
        page_text = page.extract_text()
        if page_text:
            text += page_text + "\n"

    return text


def extract_text_from_txt(file_bytes):
    return file_bytes.decode("utf-8")


# -----------------------------
# Start Interview
# -----------------------------
@app.post("/start-interview")
async def start_interview(
    role: str = Form(...),
    resume: UploadFile = File(...)
):

    session_id = str(uuid.uuid4())

    file_bytes = await resume.read()
    filename = resume.filename.lower()

    if filename.endswith(".pdf"):
        resume_text = extract_text_from_pdf(file_bytes)
    elif filename.endswith(".txt"):
        resume_text = extract_text_from_txt(file_bytes)
    else:
        return {"error": "Only PDF and TXT files are supported"}

    resume_text = resume_text[:3000]

    prompt = f"""
You are Emma, a professional US AI recruiter.

Candidate Role:
{role}

Candidate Resume:
{resume_text}

Rules:
1. Introduce yourself as Emma.
2. Welcome the candidate.
3. Ask ONLY ONE HR interview question.
"""

    question = ask_gemini(prompt)

    sessions[session_id] = {
        "resume": resume_text,
        "role": role,
        "stage": "HR",
        "history": [question]
    }

    return {
        "session_id": session_id,
        "question": question
    }


# -----------------------------
# Submit Answer
# -----------------------------
@app.post("/submit-answer")
def submit_answer(data: AnswerRequest):

    session = sessions.get(data.session_id)

    if not session:
        return {"error": "Session not found"}

    prompt = f"""
You are Emma, a US AI interviewer.

Role:
{session['role']}

Stage:
{session['stage']}

Resume:
{session['resume']}

Conversation:
{' '.join(session['history'])}

Candidate Answer:
{data.answer}

Rules:
1. Ask ONLY ONE follow-up question.
2. Continue naturally.
"""

    response = ask_gemini(prompt)

    session["history"].append("Candidate: " + data.answer)
    session["history"].append("Emma: " + response)

    if len(session["history"]) > 4:
        session["stage"] = "TECH"

    return {
        "next_question": response,
        "stage": session["stage"]
    }

@app.get("/test")
def test():
    return {"message": "THIS IS THE NEW APP"}