from datetime import datetime
import asyncio

from services.asset_service import AssetService
from models import Asset as AssetModel
from database import get_db

async def run_populate_token_counts():
    db = next(get_db())
    asset_service = AssetService(db)

    # get all assets
    assets = db.query(AssetModel).all()
    
    print(f"Found {len(assets)} assets to process")

    # populate token counts
    for asset in assets:
        try:
            asset_with_details = asset_service.get_asset_with_details(asset.id)
            if asset_with_details:
                token_count = asset_service._calculate_token_count(asset_with_details.content)
                print(f"Token count for asset {asset.id}: {token_count}")
                # Update the asset_metadata with the new token count
                metadata = asset_with_details.asset_metadata or {}
                metadata["token_count"] = token_count
                metadata["updatedAt"] = datetime.utcnow().isoformat()
                asset_service.update_asset(asset.id, asset.user_id, {"asset_metadata": metadata})
            else:
                print(f"Could not find asset {asset.id}")
        except Exception as e:
            print(f"Error processing asset {asset.id}: {str(e)}")

if __name__ == "__main__":
    asyncio.run(run_populate_token_counts())

