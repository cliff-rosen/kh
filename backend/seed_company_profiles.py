#!/usr/bin/env python3
"""
Seed script for default company profiles

Creates default company profiles for existing users based on the 
previously hardcoded Palatin context. This ensures backward compatibility
while enabling future customization.
"""

from sqlalchemy.orm import Session
from database import SessionLocal
from models import User, UserCompanyProfile

def seed_company_profiles():
    """Seed the database with default company profiles for existing users"""
    
    # Default Palatin context (based on previously hardcoded values)
    default_profile = {
        'company_name': 'Palatin Technologies',
        'company_description': 'A company focused on developing novel therapies targeting the melanocortin and natriuretic pathways.',
        'business_focus': 'developing novel therapies targeting the melanocortin and natriuretic pathways',
        'research_interests': 'the safety and efficacy of bremelanotide (FDA approved drug for female sexual dysfunction), other molecules that target the melanocortin pathway, as well as molecules that target the natriuretic pathway, especially those that work through the natriuretic peptide C pathway',
        'therapeutic_areas': 'fibrosis, inflammation, ulcerative colitis, obesity, binge eating, and sexual dysfunction',
        'key_compounds': 'bremelanotide',
        'pathways_of_interest': 'melanocortin and natriuretic pathways',
        'competitive_landscape': 'Molecules targeting melanocortin and natriuretic pathways, particularly those in similar therapeutic areas',
        'research_agent_role': 'research agent',
        'analysis_focus': 'Focus particularly on how research findings relate to the melanocortin and natriuretic pathways and their role in fibrosis, inflammation, ulcerative colitis, obesity, binge eating, and sexual dysfunction'
    }
    
    db: Session = SessionLocal()
    try:
        # Get all users who don't have a company profile yet
        users_without_profiles = db.query(User).outerjoin(UserCompanyProfile).filter(
            UserCompanyProfile.id.is_(None)
        ).all()
        
        if not users_without_profiles:
            print("All users already have company profiles. Skipping seed.")
            return
        
        print(f"Creating default company profiles for {len(users_without_profiles)} users...")
        
        # Create default profiles for each user
        created_count = 0
        for user in users_without_profiles:
            profile = UserCompanyProfile(
                user_id=user.user_id,
                **default_profile
            )
            db.add(profile)
            created_count += 1
            print(f"Created profile for user {user.email}")
        
        db.commit()
        print(f"\nSuccessfully created {created_count} default company profiles!")
        
    except Exception as e:
        print(f"Error seeding company profiles: {e}")
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    print("Seeding default company profiles...")
    seed_company_profiles()
    print("Seeding complete!")