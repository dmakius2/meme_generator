from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI, File, UploadFile, Form, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
import io
import uuid
import os

import db
from auth import get_current_user_id

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://localhost:\d+",
    allow_methods=["*"],
    allow_headers=["*"],
)

GENERATED_DIR = "generated"
STOCK_PHOTOS_DIR = "stock_photos"
os.makedirs(GENERATED_DIR, exist_ok=True)
os.makedirs(STOCK_PHOTOS_DIR, exist_ok=True)

app.mount("/generated", StaticFiles(directory=GENERATED_DIR), name="generated")
app.mount("/stock-photo-assets", StaticFiles(directory=STOCK_PHOTOS_DIR), name="stock_photo_assets")

FONT_PATHS = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
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


@app.get("/stock-photo-assets")
def list_stock_photos():
    photos = []
    for filename in sorted(os.listdir(STOCK_PHOTOS_DIR)):
        if filename.lower().endswith((".jpg", ".jpeg", ".png")):
            photo_id = os.path.splitext(filename)[0]
            photos.append({"id": photo_id, "url": f"/stock-photo-assets/{filename}"})
    return photos


def resolve_stock_photo_path(stock_photo_id: str) -> str:
    for filename in os.listdir(STOCK_PHOTOS_DIR):
        if os.path.splitext(filename)[0] == stock_photo_id:
            return os.path.join(STOCK_PHOTOS_DIR, filename)
    raise HTTPException(status_code=404, detail=f"Unknown stock photo id: {stock_photo_id}")


@app.post("/generate")
async def generate_meme(
    image: UploadFile | None = File(None),
    stock_photo_id: str | None = Form(None),
    top_text: str = Form(""),
    bottom_text: str = Form(""),
    user_id: str = Depends(get_current_user_id),
):
    if image is not None and stock_photo_id:
        raise HTTPException(status_code=400, detail="Provide either an uploaded image or a stock_photo_id, not both.")
    if image is not None:
        contents = await image.read()
    elif stock_photo_id:
        with open(resolve_stock_photo_path(stock_photo_id), "rb") as f:
            contents = f.read()
    else:
        raise HTTPException(status_code=400, detail="Provide either an uploaded image or a stock_photo_id.")

    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
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

    filename = f"{uuid.uuid4().hex}.jpg"
    filepath = os.path.join(GENERATED_DIR, filename)
    img.save(filepath, "JPEG", quality=90)

    image_url = f"/generated/{filename}"
    db.put_meme(user_id, image_url, top_text, bottom_text)
    return {"url": image_url}


@app.get("/memes")
def list_memes(user_id: str = Depends(get_current_user_id)):
    return db.list_memes_for_user(user_id)


@app.delete("/memes/{meme_id}")
def delete_meme(meme_id: str, user_id: str = Depends(get_current_user_id)):
    deleted = db.delete_meme(user_id, meme_id)
    local_path = os.path.join(GENERATED_DIR, os.path.basename(deleted["image_url"]))
    if os.path.exists(local_path):
        os.remove(local_path)
    return {"status": "deleted"}
