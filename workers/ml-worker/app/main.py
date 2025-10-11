from fastapi import FastAPI, UploadFile, File, Header, HTTPException
from fastapi import Body
from pydantic import BaseModel, Field
from typing import List, Optional
import base64

APP_KEY_HEADER = "X-Worker-Key"

app = FastAPI()

class AnalyzeItem(BaseModel):
    label: str
    confidence: float = Field(ge=0, le=1)
    gramsMean: Optional[float] = Field(default=None, ge=0)
    bbox: Optional[List[int]] = None

class AnalyzeWhy(BaseModel):
    label: str
    evidence: Optional[List[str]] = None

class AnalyzeResponse(BaseModel):
    items: List[AnalyzeItem]
    why: List[AnalyzeWhy]

class AnalyzeJsonRequest(BaseModel):
    image_b64: str
    maxItems: Optional[int] = 5

def _limit_mb() -> int:
    # note: bounded by env var MAX_IMAGE_MB
    import os
    try:
        return max(1, int(os.getenv("MAX_IMAGE_MB", "10")))
    except Exception:
        return 10

def _check_key(header_val: Optional[str]):
    import os
    expected = os.getenv("WORKER_KEY")
    if not expected:
        return  # note: allow if not configured
    if header_val != expected:
        raise HTTPException(status_code=401, detail="invalid worker key")

def _read_bytes_or_413(data: bytes):
    limit = _limit_mb() * 1024 * 1024
    if len(data) > limit:
        raise HTTPException(status_code=413, detail=f"file too large (> {_limit_mb()} MB)")
    return data

def _infer_stub(img_bytes: bytes, max_items: int = 5) -> AnalyzeResponse:
    # note: deterministic stub: returns a plausible set of items for demo/e2e
    # hash-based branching to diversify outputs without heavy models
    import hashlib
    h = hashlib.sha256(img_bytes).hexdigest()
    # very naive toy logic
    candidates = [
        ("salad", 0.88, 250.0),
        ("grilled chicken", 0.82, 150.0),
        ("rice", 0.74, 180.0),
        ("avocado", 0.65, 50.0),
        ("tomato", 0.60, 40.0),
    ]
    if h[0] in "01234567":
        candidates[0] = ("pasta", 0.86, 220.0)
    if h[1] in "89abcdef":
        candidates[2] = ("bread", 0.70, 90.0)

    items = []
    for (label, conf, grams) in candidates[:max(1, min(max_items, len(candidates)))]:
        items.append(AnalyzeItem(label=label, confidence=conf, gramsMean=grams))

    why = [AnalyzeWhy(label=i.label, evidence=[f"stub:{i.confidence:.2f}"]) for i in items]
    return AnalyzeResponse(items=items, why=why)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/analyze", response_model=AnalyzeResponse)
async def analyze(
    worker_key: Optional[str] = Header(default=None, alias=APP_KEY_HEADER),
    file: Optional[UploadFile] = File(default=None),
    payload: Optional[AnalyzeJsonRequest] = Body(default=None),
):
    _check_key(worker_key)

    img_bytes: Optional[bytes] = None
    max_items = 5

    if file is not None:
        img_bytes = await file.read()
        _read_bytes_or_413(img_bytes)
    elif payload is not None and payload.image_b64:
        try:
            img_bytes = base64.b64decode(payload.image_b64, validate=True)
        except Exception:
            raise HTTPException(status_code=422, detail="invalid base64")
        _read_bytes_or_413(img_bytes)
        if payload.maxItems:
            max_items = payload.maxItems
    else:
        raise HTTPException(status_code=422, detail="no image provided")

    return _infer_stub(img_bytes, max_items=max_items)
