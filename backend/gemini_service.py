import os
from dotenv import load_dotenv
from groq import Groq

# Load .env from the project root
load_dotenv()

def ask_gemini(prompt: str) -> str:
    """
    Sends a prompt to the Groq Llama 3.1 model and returns the response.
    """

    api_key = os.getenv("GROQ_API_KEY")

    if not api_key:
        raise ValueError(
            "GROQ_API_KEY not found. Make sure your .env file exists and is loaded."
        )

    client = Groq(api_key=api_key)

    try:
        completion = client.chat.completions.create(
            model="llama-3.1-8b-instant",
            messages=[
                {
                    "role": "system",
                    "content": "You are Emma, a professional US AI recruiter."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            temperature=0.7,
            max_tokens=1024,
        )

        return completion.choices[0].message.content

    except Exception as e:
        raise Exception(f"Groq API Error: {str(e)}")