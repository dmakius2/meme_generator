import io
import json
import mimetypes
import os
import uuid

import boto3
from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
from google import genai
from google.genai import types
from mangum import Mangum

import db
from auth import get_current_user_id

app = FastAPI()

gemini_client = genai.Client(api_key=os.environ["GEMINI_API_KEY"]) if os.environ.get("GEMINI_API_KEY") else None

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(www\.)?danielmakover\.com|http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

BUCKET_NAME = os.environ["GENERATED_BUCKET"]
STOCK_PHOTOS_PREFIX = os.environ.get("STOCK_PHOTOS_PREFIX", "stock/")
CAROUSEL_PHOTOS_PREFIX = os.environ.get("CAROUSEL_PHOTOS_PREFIX", "carousel/")
s3 = boto3.client("s3")

FONT_PATHS = [
    os.path.join(os.path.dirname(__file__), "fonts", "DejaVuSans-Bold.ttf"),
]


def load_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_PATHS:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def draw_outlined_text(draw: ImageDraw.Draw, x: int, y: int, text: str, font, anchor: str):
    outline_offsets = [(-2, -2), (2, -2), (-2, 2), (2, 2), (0, -2), (0, 2), (-2, 0), (2, 0)]
    for dx, dy in outline_offsets:
        draw.text((x + dx, y + dy), text, font=font, fill="black", anchor=anchor)
    draw.text((x, y), text, font=font, fill="white", anchor=anchor)


def _list_stock_objects():
    response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=STOCK_PHOTOS_PREFIX)
    return [obj for obj in response.get("Contents", []) if obj["Key"] != STOCK_PHOTOS_PREFIX]


@app.get("/carousel-photo-assets")
def list_carousel_photos():
    region = s3.meta.region_name
    photos = []
    response = s3.list_objects_v2(Bucket=BUCKET_NAME, Prefix=CAROUSEL_PHOTOS_PREFIX)
    for obj in response.get("Contents", []):
        if obj["Key"] == CAROUSEL_PHOTOS_PREFIX:
            continue
        filename = obj["Key"][len(CAROUSEL_PHOTOS_PREFIX):]
        if not filename:
            continue
        photo_id = os.path.splitext(filename)[0]
        photos.append({
            "id": photo_id,
            "url": f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{obj['Key']}",
        })
    return photos


@app.get("/stock-photo-assets")
def list_stock_photos():
    region = s3.meta.region_name
    photos = []
    for obj in _list_stock_objects():
        filename = obj["Key"][len(STOCK_PHOTOS_PREFIX):]
        photo_id = os.path.splitext(filename)[0]
        photos.append({
            "id": photo_id,
            "url": f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{obj['Key']}",
        })
    return photos


def resolve_stock_photo_key(stock_photo_id: str) -> str:
    for obj in _list_stock_objects():
        filename = obj["Key"][len(STOCK_PHOTOS_PREFIX):]
        if os.path.splitext(filename)[0] == stock_photo_id:
            return obj["Key"]
    raise HTTPException(status_code=404, detail=f"Unknown stock photo id: {stock_photo_id}")


@app.post("/generate")
async def generate_meme(
    image: UploadFile | None = File(None),
    stock_photo_id: str | None = Form(None),
    top_text: str = Form(""),
    bottom_text: str = Form(""),
    user_id: str = Depends(get_current_user_id),
):
    print(f"[generate] START user_id={user_id} stock_photo_id={stock_photo_id} image={image and image.filename}")

    if image is not None and stock_photo_id:
        raise HTTPException(status_code=400, detail="Provide either an uploaded image or a stock_photo_id, not both.")
    if image is not None:
        contents = await image.read()
        print(f"[generate] uploaded image read, bytes={len(contents)}")
    elif stock_photo_id:
        key = resolve_stock_photo_key(stock_photo_id)
        contents = s3.get_object(Bucket=BUCKET_NAME, Key=key)["Body"].read()
        print(f"[generate] stock photo fetched key={key} bytes={len(contents)}")
    else:
        raise HTTPException(status_code=400, detail="Provide either an uploaded image or a stock_photo_id.")

    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
        print(f"[generate] image opened size={img.size}")
    except UnidentifiedImageError:
        content_type = image.content_type if image is not None else "unknown"
        raise HTTPException(status_code=400, detail=f"Unsupported image format: {content_type}")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read image: {e}")

    width, height = img.size
    font_size = max(24, height // 12)
    font = load_font(font_size)

    draw = ImageDraw.Draw(img)

    if top_text.strip():
        draw_outlined_text(draw, width // 2, 10, top_text.upper(), font, anchor="mt")

    if bottom_text.strip():
        draw_outlined_text(draw, width // 2, height - 10, bottom_text.upper(), font, anchor="mb")

    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=90)
    buffer.seek(0)
    print("[generate] image rendered, uploading to S3")

    filename = f"{uuid.uuid4().hex}.jpg"
    s3.put_object(Bucket=BUCKET_NAME, Key=filename, Body=buffer.getvalue(), ContentType="image/jpeg")
    print(f"[generate] S3 upload done filename={filename}")

    region = s3.meta.region_name
    url = f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{filename}"
    print(f"[generate] calling db.put_meme user_id={user_id}")
    db.put_meme(user_id, url, top_text, bottom_text)
    print("[generate] db.put_meme done, returning url")
    return {"url": url}


CAPTION_PROMPT = (
    "You are a meme caption writer. Look at this image and suggest 3 funny, punchy meme "
    "captions for it. Each suggestion has a short top_text and bottom_text (either may be "
    "empty, but not both). Keep each line under 8 words. "
    'Respond with ONLY a JSON array like: [{"top_text": "...", "bottom_text": "..."}]'
)


@app.post("/suggest-captions")
async def suggest_captions(
    image: UploadFile | None = File(None),
    stock_photo_id: str | None = Form(None),
    user_id: str = Depends(get_current_user_id),
):
    if gemini_client is None:
        raise HTTPException(status_code=503, detail="Gemini API key not configured on the server.")
    if image is not None and stock_photo_id:
        raise HTTPException(status_code=400, detail="Provide either an uploaded image or a stock_photo_id, not both.")

    if image is not None:
        contents = await image.read()
        mime_type = image.content_type or "image/jpeg"
    elif stock_photo_id:
        key = resolve_stock_photo_key(stock_photo_id)
        contents = s3.get_object(Bucket=BUCKET_NAME, Key=key)["Body"].read()
        mime_type = mimetypes.guess_type(key)[0] or "image/jpeg"
    else:
        raise HTTPException(status_code=400, detail="Provide either an uploaded image or a stock_photo_id.")

    try:
        response = gemini_client.models.generate_content(
            model="gemini-flash-latest",
            contents=[
                types.Part.from_bytes(data=contents, mime_type=mime_type),
                CAPTION_PROMPT,
            ],
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Gemini request failed: {e}")

    try:
        suggestions = json.loads(response.text)
    except (json.JSONDecodeError, TypeError):
        raise HTTPException(status_code=502, detail="Gemini returned an unparseable response.")

    return {"suggestions": suggestions}


@app.get("/memes")
def list_memes(user_id: str = Depends(get_current_user_id)):
    return db.list_memes_for_user(user_id)


@app.delete("/memes/{meme_id}")
def delete_meme(meme_id: str, user_id: str = Depends(get_current_user_id)):
    deleted = db.delete_meme(user_id, meme_id)
    key = deleted["image_url"].rsplit("/", 1)[-1]
    s3.delete_object(Bucket=BUCKET_NAME, Key=key)
    return {"status": "deleted"}


handler = Mangum(app)
