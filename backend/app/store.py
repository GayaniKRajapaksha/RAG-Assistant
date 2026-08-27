import os
import json
import numpy as np
from sentence_transformers import SentenceTransformer
import faiss


MODEL_NAME = os.getenv('EMBEDDING_MODEL', 'sentence-transformers/all-MiniLM-L6-v2')


class VectorStore:
    def __init__(self, dim=384, persist_path='vector_store.json'):
        self.dim = dim
        self.model = SentenceTransformer(MODEL_NAME)
        self.persist_path = persist_path
        self.texts = []  # list of dicts: {id, text}
        # create an index with the expected dimension; will be re-created if model dim differs
        self._index = faiss.IndexFlatIP(dim)  # inner-product (cosine if normalized)
        self._embeddings = None

    def _save(self):
        data = {'texts': self.texts}
        with open(self.persist_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False)

    def _load(self):
        if not os.path.exists(self.persist_path):
            return
        with open(self.persist_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        self.texts = data.get('texts', [])
        if self.texts:
            texts = [t['text'] for t in self.texts]
            embs = self.model.encode(texts, convert_to_numpy=True)
            faiss.normalize_L2(embs)
            # recreate index with correct dimension from embeddings
            self._index = faiss.IndexFlatIP(embs.shape[1])
            self._index.add(embs)

    def clear(self):
        self.texts = []
        self._index = faiss.IndexFlatIP(self.dim)
        if os.path.exists(self.persist_path):
            try:
                os.remove(self.persist_path)
            except Exception:
                pass
        self._save()

    def add_text(self, text: str):
        id_ = len(self.texts)
        self.texts.append({'id': id_, 'text': text})
        emb = self.model.encode([text], convert_to_numpy=True)
        faiss.normalize_L2(emb)
        # ensure index dimension matches embedding dimension
        if not hasattr(self._index, 'ntotal') or self._index.ntotal == 0 or self._index.d != emb.shape[1]:
            self._index = faiss.IndexFlatIP(emb.shape[1])
        self._index.add(emb)
        self._save()
        return id_

    def query(self, q: str, top_k=4):
        q_emb = self.model.encode([q], convert_to_numpy=True)
        faiss.normalize_L2(q_emb)
        if self._index.ntotal == 0:
            return []
        # faiss.search expects k <= ntotal; it will pad otherwise, but we'll cap k
        k = min(top_k, int(self._index.ntotal))
        D, I = self._index.search(q_emb, k)
        results = []
        for score, idx in zip(D[0], I[0]):
            if idx == -1:
                continue
            results.append({'id': int(idx), 'text': self.texts[idx]['text'], 'score': float(score)})
        return results

# new code: module-level singleton accessor expected by main.py
_STORE = None

def get_store():
    global _STORE
    if _STORE is None:
        _STORE = VectorStore()
        # load persisted texts/embeddings if any
        try:
            _STORE._load()
        except Exception:
            # avoid crashing app on load errors; log if needed
            pass
    return _STORE