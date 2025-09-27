from openai import OpenAI
from io import BytesIO
import asyncio
import json
from datetime import datetime, date

from services.asset_service import AssetService
from models import Asset as AssetModel
from database import get_db

client = OpenAI()

vector_store_id = 'vs_68347e57e7408191a5a775f40db83f44'
file_list = [
    ("file-9MkAtEFyTj3nLsh2pDm9uQ", "Newsletter Collection.txt"),
    ("file-HqTd8uaFr5TtAZhcwdg4GZ", "Daily Newsletter Recap.txt"),
    ("file-GsafJqsXXmJH8S6vv28kdm", "Weekly Newsletter Recap.txt"),
    ("file-XTaqdM2Rt7r7Syn3a6HBMq", "Final Newsletter Summary Report.txt")  
]

class CustomJSONEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, (datetime, date)):
            return obj.isoformat()
        return str(obj)

async def upload_assets():
    db = next(get_db())
    asset_service = AssetService(db)

    # get all assets
    assets = db.query(AssetModel).all()
    
    print(f"Found {len(assets)} assets to process")

    # upload assets to vector store
    for asset in assets:
        try:
            asset_with_details = asset_service.get_asset_with_details(asset.id)
            if asset_with_details:
                print(f"Uploading asset {asset.id}")
                
                # Convert content to string if it's not already
                if isinstance(asset_with_details.content, (list, dict)):
                    content_str = json.dumps(asset_with_details.content, cls=CustomJSONEncoder)
                else:
                    content_str = str(asset_with_details.content)
                
                # Create a BytesIO object with the content
                content_as_bytes = BytesIO(content_str.encode('utf-8'))
                file_name = f"{asset_with_details.name}.txt"
                
                # Create the file tuple
                file_tuple = (file_name, content_as_bytes)
                
                # Upload to OpenAI
                result = client.files.create(
                    file=file_tuple,
                    purpose="assistants"
                )
                
                # Update asset metadata with the file ID
                metadata = asset_with_details.asset_metadata or {}
                metadata["vector_store_id"] = result.id
                metadata["updatedAt"] = datetime.utcnow().isoformat()
                
                asset_service.update_asset(asset.id, asset.user_id, {"asset_metadata": metadata})
                print(f"Uploaded asset {asset.id} to vector store with id {result.id}")

            else:
                print(f"Could not find asset {asset.id}")
        except Exception as e:
            print(f"Error processing asset {asset.id}: {str(e)}")

async def get_file_list():
    result = client.files.list()
    for file in result.data:
        print(file.id, file.filename)

async def delete_file(file_id):
    result = client.files.delete(file_id)
    print(result)

async def create_vector_store():

    vector_store = client.vector_stores.create(
        name="knowledge_base"
    )
    print(vector_store.id)

async def add_files_to_vector_store():
    for file_id, file_name in [file_list[0]]:
        result = client.vector_stores.files.create(
            vector_store_id=vector_store_id,
            file_id=file_id
        )
        print(result)

async def test_search():
    response = client.responses.create(
        model="gpt-4o-mini",
        input="Summmarize model developments discussed in the newsletter collection",
        tools=[{
            "type": "file_search",
            "vector_store_ids": [vector_store_id]
        }]
    )
    print(response)

async def go():
    #await upload_assets()
    #await get_file_list()
    #await create_vector_store()
    #await add_files_to_vector_store()
    await test_search()
    print("done")


if __name__ == "__main__":
    asyncio.run(go())

