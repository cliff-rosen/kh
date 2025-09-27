"""
Smart Search Session Service

Manages smart search session tracking and database operations.
"""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from sqlalchemy.orm.attributes import flag_modified

from models import SmartSearchSession
from schemas.smart_search import SessionListResponse, SmartSearchSessionDict

logger = logging.getLogger(__name__)


class SmartSearchSessionService:
    """Service for managing smart search session operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def create_session(self, user_id: str, original_question: str) -> SmartSearchSession:
        """Create a new smart search session"""
        try:
            session = SmartSearchSession(
                user_id=user_id,
                original_question=original_question,
                status="in_progress",
                last_step_completed="question_input"
            )
            self.db.add(session)
            self.db.commit()
            self.db.refresh(session)
            
            logger.info(f"Created new smart search session {session.id} for user {user_id}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to create session for user {user_id}: {e}")
            self.db.rollback()
            raise
    
    def get_session(self, session_id: str, user_id: str) -> Optional[SmartSearchSession]:
        """Get an existing session by ID and user"""
        try:
            session = self.db.query(SmartSearchSession).filter(
                SmartSearchSession.id == session_id,
                SmartSearchSession.user_id == user_id
            ).first()
            
            if not session:
                logger.warning(f"Session {session_id} not found for user {user_id}")
            
            return session
            
        except Exception as e:
            logger.error(f"Failed to get session {session_id} for user {user_id}: {e}")
            raise
    
    def get_or_create_session(self, user_id: str, original_question: str, session_id: Optional[str] = None) -> SmartSearchSession:
        """Get existing session or create new one"""
        if session_id:
            session = self.get_session(session_id, user_id)
            if session:
                return session
        
        # Create new session if none found or no session_id provided
        return self.create_session(user_id, original_question)
    
    def update_evidence_spec_step(self, session_id: str, user_id: str, 
                                 generated_evidence_spec: str, submitted_evidence_spec: str = None,
                                 prompt_tokens: int = 0, completion_tokens: int = 0, total_tokens: int = 0) -> SmartSearchSession:
        """Update session with evidence specification data"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            session.generated_evidence_spec = generated_evidence_spec
            if submitted_evidence_spec is not None:
                session.submitted_evidence_spec = submitted_evidence_spec
            session.last_step_completed = "question_refinement"
            session.total_api_calls = (session.total_api_calls or 0) + 1
            
            # Update token usage
            session.total_prompt_tokens = (session.total_prompt_tokens or 0) + prompt_tokens
            session.total_completion_tokens = (session.total_completion_tokens or 0) + completion_tokens
            session.total_tokens = (session.total_tokens or 0) + total_tokens
            
            self.db.commit()
            logger.info(f"Updated evidence specification step for session {session_id}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update evidence specification step for session {session_id}: {e}")
            self.db.rollback()
            raise
    
    def update_search_keywords_step(self, session_id: str, user_id: str,
                                   generated_search_keywords: str, submitted_search_keywords: str = None,
                                   submitted_evidence_spec: str = None,
                                   prompt_tokens: int = 0, completion_tokens: int = 0, total_tokens: int = 0) -> SmartSearchSession:
        """Update session with search keywords generation data"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            session.generated_search_keywords = generated_search_keywords
            if submitted_search_keywords is not None:
                session.submitted_search_keywords = submitted_search_keywords
            if submitted_evidence_spec is not None:
                session.submitted_evidence_spec = submitted_evidence_spec
            session.last_step_completed = "search_query_generation"
            session.total_api_calls = (session.total_api_calls or 0) + 1
            
            # Update token usage
            session.total_prompt_tokens = (session.total_prompt_tokens or 0) + prompt_tokens
            session.total_completion_tokens = (session.total_completion_tokens or 0) + completion_tokens
            session.total_tokens = (session.total_tokens or 0) + total_tokens
            
            self.db.commit()
            logger.info(f"Updated search keywords step for session {session_id}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update search keywords step for session {session_id}: {e}")
            self.db.rollback()
            raise
    
    def update_search_execution_step(self, session_id: str, user_id: str,
                                    total_available: int, returned: int, sources: List[str],
                                    is_pagination_load: bool = False, submitted_search_query: str = None) -> SmartSearchSession:
        """Update session with search execution data"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            # Combine with existing search metadata for pagination tracking
            existing_metadata = session.search_metadata or {}
            
            if is_pagination_load:
                # This is a "load more" request
                pagination_loads = existing_metadata.get("pagination_loads", 0) + 1
                total_retrieved = existing_metadata.get("total_retrieved", 0) + returned
            else:
                # This is the initial search
                pagination_loads = 1
                total_retrieved = returned
            
            # Update existing metadata while preserving other fields like search_keyword_history
            existing_metadata.update({
                "total_available": total_available,
                "total_retrieved": total_retrieved,
                "sources_searched": sources,
                "last_search_timestamp": datetime.utcnow().isoformat(),
                "pagination_loads": pagination_loads
            })
            
            session.search_metadata = existing_metadata
            # Flag the JSON column as modified so SQLAlchemy detects the change
            flag_modified(session, 'search_metadata')
            session.articles_retrieved_count = total_retrieved
            session.last_step_completed = "search_execution"
            
            # Update submitted_search_keywords with actual executed query (only on initial search)
            if not is_pagination_load and submitted_search_query:
                session.submitted_search_keywords = submitted_search_query
            
            self.db.commit()
            logger.info(f"Updated search execution step for session {session_id} - {'pagination load' if is_pagination_load else 'initial search'}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update search execution step for session {session_id}: {e}")
            self.db.rollback()
            raise
    
    def update_article_selection_step(self, session_id: str, user_id: str,
                                     selected_count: int) -> SmartSearchSession:
        """Update session with article selection data"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            session.articles_selected_count = selected_count
            session.last_step_completed = "article_selection"
            
            self.db.commit()
            logger.info(f"Updated article selection step for session {session_id} - {selected_count} articles selected")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update article selection step for session {session_id}: {e}")
            self.db.rollback()
            raise
    
    def update_discriminator_step(self, session_id: str, user_id: str,
                                 generated_discriminator: str, submitted_discriminator: str = None,
                                 strictness: str = None) -> SmartSearchSession:
        """Update session with discriminator generation data"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            session.generated_discriminator = generated_discriminator
            if submitted_discriminator is not None:
                session.submitted_discriminator = submitted_discriminator
            if strictness is not None:
                session.filter_strictness = strictness
            session.last_step_completed = "discriminator_generation"
            session.total_api_calls = (session.total_api_calls or 0) + 1
            
            self.db.commit()
            logger.info(f"Updated discriminator step for session {session_id}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update discriminator step for session {session_id}: {e}")
            self.db.rollback()
            raise
    
    def update_filtering_step(self, session_id: str, user_id: str,
                             total_filtered: int, accepted: int, rejected: int,
                             average_confidence: float, duration_seconds: int,
                             filtered_articles: List[Dict] = None,
                             submitted_discriminator: str = None,
                             prompt_tokens: int = 0, completion_tokens: int = 0, total_tokens: int = 0) -> SmartSearchSession:
        """Update session with filtering results data"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                raise ValueError(f"Session {session_id} not found")
            
            filtering_metadata = {
                "total_filtered": total_filtered,
                "accepted": accepted,
                "rejected": rejected,
                "average_confidence": average_confidence,
                "filtering_duration_seconds": duration_seconds,
                "filtering_timestamp": datetime.utcnow().isoformat()
            }
            
            session.filtering_metadata = filtering_metadata
            
            # Store the actual filtered articles if provided
            if filtered_articles is not None:
                session.filtered_articles = filtered_articles
            
            session.last_step_completed = "filtering"
            session.status = "completed"
            
            # Update submitted_discriminator with actual discriminator used
            if submitted_discriminator:
                session.submitted_discriminator = submitted_discriminator
            
            # Update token usage from filtering
            session.total_prompt_tokens = (session.total_prompt_tokens or 0) + prompt_tokens
            session.total_completion_tokens = (session.total_completion_tokens or 0) + completion_tokens
            session.total_tokens = (session.total_tokens or 0) + total_tokens
            
            # Calculate total session duration
            if session.created_at:
                duration = datetime.utcnow() - session.created_at.replace(tzinfo=None)
                session.session_duration_seconds = int(duration.total_seconds())
            
            self.db.commit()
            logger.info(f"Updated filtering step for session {session_id} - {accepted}/{total_filtered} articles accepted")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update filtering step for session {session_id}: {e}")
            self.db.rollback()
            raise
    
    def mark_session_abandoned(self, session_id: str, user_id: str) -> Optional[SmartSearchSession]:
        """Mark a session as abandoned"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                return None
            
            session.status = "abandoned"
            
            # Calculate session duration
            if session.created_at:
                duration = datetime.utcnow() - session.created_at.replace(tzinfo=None)
                session.session_duration_seconds = int(duration.total_seconds())
            
            self.db.commit()
            logger.info(f"Marked session {session_id} as abandoned")
            return session
            
        except Exception as e:
            logger.error(f"Failed to mark session {session_id} as abandoned: {e}")
            self.db.rollback()
            raise
    
    def get_user_sessions(self, user_id: str, limit: int = 50, offset: int = 0) -> SessionListResponse:
        """Get user's search session history"""
        try:
            sessions = self.db.query(SmartSearchSession).filter(
                SmartSearchSession.user_id == user_id
            ).order_by(SmartSearchSession.created_at.desc()).offset(offset).limit(limit).all()
            
            total = self.db.query(SmartSearchSession).filter(
                SmartSearchSession.user_id == user_id
            ).count()
            
            return SessionListResponse(
                sessions=[SmartSearchSessionDict(**session.to_dict()) for session in sessions],
                total=total
            )
            
        except Exception as e:
            logger.error(f"Failed to get sessions for user {user_id}: {e}")
            raise
    
    def get_all_sessions(self, limit: int = 50, offset: int = 0) -> SessionListResponse:
        """Get all users' search session history (admin only)"""
        try:
            sessions = self.db.query(SmartSearchSession).order_by(
                SmartSearchSession.created_at.desc()
            ).offset(offset).limit(limit).all()
            
            total = self.db.query(SmartSearchSession).count()
            
            return SessionListResponse(
                sessions=[SmartSearchSessionDict(**session.to_dict()) for session in sessions],
                total=total
            )
            
        except Exception as e:
            logger.error(f"Failed to get all sessions: {e}")
            raise

    def update_custom_columns_and_features(self, session_id: str, user_id: str, custom_columns: List[Dict[str, Any]], extracted_features: Dict[str, Dict[str, Any]]) -> Optional[SmartSearchSession]:
        """Update both custom column metadata and feature values atomically"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                return None
            
            # Get existing column definitions to merge with new ones
            existing_columns = []
            if session.filtering_metadata and 'custom_columns' in session.filtering_metadata:
                existing_columns = session.filtering_metadata['custom_columns']
            
            # Merge existing columns with new ones (new columns override if same ID)
            existing_by_id = {col['id']: col for col in existing_columns}
            for new_col in custom_columns:
                existing_by_id[new_col['id']] = new_col
            
            # Initialize filtering_metadata if it doesn't exist
            if not session.filtering_metadata:
                session.filtering_metadata = {}
            
            # Update metadata with all columns (existing + new)
            session.filtering_metadata['custom_columns'] = list(existing_by_id.values())
            
            # Update filtered articles with extracted features
            if session.filtered_articles:
                current_feature_ids = set(existing_by_id.keys())
                updated_articles = []
                
                for article_data in session.filtered_articles:
                    article_id = article_data['article']['id']
                    
                    # Initialize extracted_features if it doesn't exist or is None
                    if 'extracted_features' not in article_data['article'] or article_data['article']['extracted_features'] is None:
                        article_data['article']['extracted_features'] = {}
                    
                    # Add new extracted features
                    if article_id in extracted_features and extracted_features[article_id] is not None:
                        article_data['article']['extracted_features'].update(extracted_features[article_id])
                    
                    # Clean up features that are no longer in the custom columns
                    filtered_features = {
                        k: v for k, v in article_data['article']['extracted_features'].items()
                        if k in current_feature_ids
                    }
                    article_data['article']['extracted_features'] = filtered_features
                    
                    updated_articles.append(article_data)
                
                session.filtered_articles = updated_articles
            
            self.db.commit()
            logger.info(f"Updated {len(custom_columns)} new custom columns and feature values for session {session_id}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update custom columns and features for session {session_id}: {e}")
            self.db.rollback()
            raise

    def reset_to_step(self, session_id: str, user_id: str, target_step: str) -> Optional[SmartSearchSession]:
        """Reset session to a specific step, clearing all data forward of that step"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                return None
            
            # Define step hierarchy (order matters)
            step_hierarchy = [
                "question_input",
                "question_refinement", 
                "search_query_generation",
                "search_execution",
                "article_selection",
                "discriminator_generation",
                "filtering"
            ]
            
            if target_step not in step_hierarchy:
                raise ValueError(f"Invalid target step: {target_step}")
            
            target_index = step_hierarchy.index(target_step)
            
            # Clear all data forward of the target step
            if target_index < step_hierarchy.index("question_refinement"):
                # Reset to question input - clear everything except original question
                session.generated_evidence_spec = None
                session.submitted_evidence_spec = None
                
            if target_index < step_hierarchy.index("search_query_generation"):
                # Clear search keywords data and history
                session.generated_search_keywords = None
                session.submitted_search_keywords = None
                session.search_metadata = None  # Clear all search metadata including history
                
            if target_index < step_hierarchy.index("search_execution"):
                # Clear search execution data but preserve search keyword history
                if session.search_metadata and "search_keyword_history" in session.search_metadata:
                    # Preserve the search keyword history when stepping back from search results
                    search_keyword_history = session.search_metadata.get("search_keyword_history", [])
                    session.search_metadata = {"search_keyword_history": search_keyword_history}
                # Note: if search_metadata is None, it stays None (already cleared above)
                session.articles_retrieved_count = 0
                
            if target_index < step_hierarchy.index("article_selection"):
                # Clear article selection data
                session.articles_selected_count = 0
                
            if target_index < step_hierarchy.index("discriminator_generation"):
                # Clear discriminator data
                session.generated_discriminator = None
                session.submitted_discriminator = None
                session.filter_strictness = None
                
            if target_index < step_hierarchy.index("filtering"):
                # Clear filtering data
                session.filtering_metadata = None
            
            # Update session status and step
            session.last_step_completed = target_step
            session.status = "in_progress"  # Reset to in_progress
            session.session_duration_seconds = None  # Clear duration
            
            self.db.commit()
            logger.info(f"Reset session {session_id} to step {target_step}")
            return session
            
        except Exception as e:
            logger.error(f"Failed to reset session {session_id} to step {target_step}: {e}")
            self.db.rollback()
            raise
    
    def update_search_keyword_history(self, session_id: str, user_id: str, search_keyword_history: List[Dict[str, Any]]) -> Optional[SmartSearchSession]:
        """Update the search keyword history for a session"""
        try:
            session = self.get_session(session_id, user_id)
            if not session:
                return None
            
            # Get existing metadata or initialize
            existing_metadata = session.search_metadata or {}
            
            # Update with new search keyword history
            existing_metadata["search_keyword_history"] = search_keyword_history
            session.search_metadata = existing_metadata
            
            # Flag the JSON column as modified so SQLAlchemy detects the change
            flag_modified(session, 'search_metadata')
            
            self.db.commit()
            logger.info(f"Updated search keyword history for session {session_id} with {len(search_keyword_history)} items")
            return session
            
        except Exception as e:
            logger.error(f"Failed to update search keyword history for session {session_id}: {e}")
            self.db.rollback()
            raise
