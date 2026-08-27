from pydantic import BaseModel
from typing import List, Optional


class QueryRequest(BaseModel):
    question: str
    top_k: Optional[int] = 4


class ContextItem(BaseModel):
    id: int
    text: str
    score: float


class QueryResponse(BaseModel):
    answer: str
    contexts: List[ContextItem]