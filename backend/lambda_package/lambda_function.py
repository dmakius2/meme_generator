import io
import os
import uuid

import boto3
from fastapi import FastAPI, File, UploadFile, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image, ImageDraw, ImageFont, UnidentifiedImageError
from mangum import Mangum

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("FRONTEND_ORIGIN", "http://localhost:5173")],
    allow_methods=["*"],
    allow_headers=["*"],
)

BUCKET_NAME = os.environ["GENERATED_BUCKET"]
STOCK_PHOTOS_PREFIX = os.environ.get("STOCK_PHOTOS_PREFIX", "stock/")
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
):
    if image is not None and stock_photo_id:
        raise HTTPException(status_code=400, detail="Provide either an uploaded image or a stock_photo_id, not both.")
    if image is not None:
        contents = await image.read()
    elif stock_photo_id:
        key = resolve_stock_photo_key(stock_photo_id)
        contents = s3.get_object(Bucket=BUCKET_NAME, Key=key)["Body"].read()
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

    buffer = io.BytesIO()
    img.save(buffer, "JPEG", quality=90)
    buffer.seek(0)

    filename = f"{uuid.uuid4().hex}.jpg"
    s3.put_object(Bucket=BUCKET_NAME, Key=filename, Body=buffer.getvalue(), ContentType="image/jpeg")

    region = s3.meta.region_name
    url = f"https://{BUCKET_NAME}.s3.{region}.amazonaws.com/{filename}"
    return {"url": url}


handler = Mangum(app)
