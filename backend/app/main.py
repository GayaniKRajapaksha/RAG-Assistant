import os
import asyncio
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from .store import get_store
from .schemas import QueryRequest, QueryResponse, ContextItem

# Load env variables from parent's parent directory (workspace root)
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../../.env'))

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

app = FastAPI()

# Enable CORS for frontend communication
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

store = get_store()


@app.post('/api/upload')
async def upload_file(file: UploadFile = File(...)):
    # Check if PDF or text/markdown
    is_pdf = file.content_type == "application/pdf" or file.filename.endswith(".pdf")
    is_txt = file.content_type in ("text/plain", "text/markdown") or file.filename.endswith((".txt", ".md"))
    
    if not (is_pdf or is_txt):
        raise HTTPException(
            status_code=400, 
            detail='Only text (.txt), markdown (.md), or PDF (.pdf) files are supported'
        )

    file_bytes = await file.read()
    text_pages = []

    if is_pdf:
        import io
        import pypdf
        try:
            pdf_reader = pypdf.PdfReader(io.BytesIO(file_bytes))
            for page in pdf_reader.pages:
                page_text = page.extract_text()
                if page_text:
                    text_pages.append(page_text)
            content = "\n\n".join(text_pages)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to parse PDF file: {str(e)}")
    else:
        content = file_bytes.decode('utf-8')

    # clear previous documents from the store to avoid duplicate paragraphs in the index
    store.clear()

    # naive splitting into paragraphs
    paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
    
    # If PDF paragraph extraction didn't split well, fall back to page-by-page indexing
    if is_pdf and len(paragraphs) < 3:
        paragraphs = [page.strip() for page in text_pages if page.strip()]

    ids = []
    for p in paragraphs:
        _id = store.add_text(p)
        ids.append(_id)

    return {"message": f"Indexed {len(ids)} chunks"}


@app.post('/api/clear')
async def clear_store():
    store.clear()
    return {"message": "Database cleared successfully"}


def generate_answer_with_gemini(question: str, context: str) -> str:
    if not GEMINI_API_KEY:
        return (
            "Warning: GEMINI_API_KEY is not set in your .env file. "
            "Please add it to enable real AI generation."
        )

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key={GEMINI_API_KEY}"

    prompt = (
        "You are an expert AI assistant that answers questions using only the provided context document sections.\n"
        "Provide a clear, natural, and concise answer. Do not extrapolate beyond the provided text.\n"
        "If the answer cannot be found in the context, say: 'I cannot find the answer to this question in the uploaded document.'\n\n"
        f"Context:\n{context}\n\n"
        f"Question: {question}\n\n"
        "Answer:"
    )

    payload = {
        "contents": [{
            "parts": [{
                "text": prompt
            }]
        }]
    }

    try:
        response = requests.post(url, json=payload, timeout=15)
        response.raise_for_status()
        data = response.json()

        # Extract the text content from the Gemini response structure
        candidates = data.get("candidates", [])
        if candidates:
            parts = candidates[0].get("content", {}).get("parts", [])
            if parts:
                return parts[0].get("text", "").strip()

        return "Error: Could not retrieve text from Gemini API response."
    except Exception as e:
        return f"Error calling Gemini API: {str(e)}"


@app.post('/api/query', response_model=QueryResponse)
async def query(req: QueryRequest):
    # retrieve contexts
    contexts = store.query(req.question, top_k=req.top_k)

    if contexts:
        combined = "\n\n".join([c['text'] for c in contexts])
        answer = await asyncio.to_thread(generate_answer_with_gemini, req.question, combined)
    else:
        answer = "No relevant documents found."

    ctx_items = [ContextItem(id=c['id'], text=c['text'], score=c['score']) for c in contexts]

    return QueryResponse(answer=answer, contexts=ctx_items)
