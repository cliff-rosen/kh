#!/usr/bin/env python3
"""
Seed script for default chat quick actions

Populates the database with the default system quick actions
that were previously hardcoded in the frontend ChatPanel.tsx.
"""

from sqlalchemy.orm import Session
from database import SessionLocal, engine
from services.chat_quick_action_service import ChatQuickActionService

def seed_default_quick_actions():
    """Seed the database with default system quick actions"""
    
    # Default actions based on the hardcoded ones in ChatPanel.tsx
    default_actions = [
        {
            "name": "Palatin Relevance",
            "prompt": "How is this research relevant to Palatin's interests and business focus?",
            "description": "Analyze the research article's relevance to Palatin Technologies",
            "position": 0
        },
        {
            "name": "Simple Explanation", 
            "prompt": "Can you explain this article in simple, layman's terms that anyone can understand?",
            "description": "Get a simplified explanation of the research for non-experts",
            "position": 1
        },
        {
            "name": "Key Findings",
            "prompt": "What are the key findings?",
            "description": "Extract the main findings and results from the research",
            "position": 2
        },
        {
            "name": "Business Impact",
            "prompt": "What competitive threats or opportunities does this present?",
            "description": "Analyze potential business implications and opportunities",
            "position": 3
        },
        {
            "name": "Explain Abstract",
            "prompt": "Explain abstract in this format:\n- Background / Rationale: Why this study was done.\n- Objective: What the study aimed to find out.\n- Methods: How it was done (what kind of study, what measurements).\n- Results: What was found (often with numbers or statistics).\n- Conclusion / Interpretation: What it means, and how it matters.",
            "description": "Break down the abstract into structured components",
            "position": 4
        }
    ]
    
    db: Session = SessionLocal()
    try:
        action_service = ChatQuickActionService(db)
        
        # Check if global actions already exist
        existing_actions = action_service.get_available_actions(user_id=None)
        if existing_actions:
            print(f"Found {len(existing_actions)} existing global quick actions. Skipping seed.")
            return
        
        print("Seeding default chat quick actions...")
        
        # Create each default action
        for action_data in default_actions:
            created_action = action_service.create_global_action(
                name=action_data["name"],
                prompt=action_data["prompt"],
                description=action_data["description"],
                position=action_data["position"]
            )
            print(f"Created: '{created_action['name']}'")
        
        print(f"\nSuccessfully seeded {len(default_actions)} default quick actions!")
        
    except Exception as e:
        print(f"Error seeding quick actions: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding default chat quick actions...")
    seed_default_quick_actions()
    print("Seeding complete!")