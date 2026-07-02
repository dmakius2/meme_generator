import os
import time
import uuid

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from fastapi import HTTPException

MEMES_TABLE_NAME = os.environ["MEMES_TABLE_NAME"]

_table = boto3.resource("dynamodb").Table(MEMES_TABLE_NAME)


def put_meme(user_id: str, image_url: str, top_text: str, bottom_text: str) -> dict:
    item = {
        "user_id": user_id,
        "meme_id": uuid.uuid4().hex,
        "image_url": image_url,
        "top_text": top_text,
        "bottom_text": bottom_text,
        "created_at": int(time.time()),
    }
    _table.put_item(Item=item)
    return item


def list_memes_for_user(user_id: str) -> list[dict]:
    response = _table.query(KeyConditionExpression=Key("user_id").eq(user_id))
    items = response.get("Items", [])
    items.sort(key=lambda item: item["created_at"], reverse=True)
    return items


def delete_meme(user_id: str, meme_id: str) -> dict:
    try:
        response = _table.delete_item(
            Key={"user_id": user_id, "meme_id": meme_id},
            ConditionExpression="attribute_exists(meme_id)",
            ReturnValues="ALL_OLD",
        )
    except ClientError as e:
        if e.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise HTTPException(status_code=404, detail="Meme not found")
        raise
    return response["Attributes"]
