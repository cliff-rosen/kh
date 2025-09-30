"""
Base classes for Knowledge Horizon services
"""

import logging
from abc import ABC, abstractmethod
from typing import Optional, Dict, Any, List

from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)


class BaseKHService(ABC):
    """Base class for all Knowledge Horizon services"""

    def __init__(self,
                 db_session: Optional[Session] = None,
                 config: Optional[Dict[str, Any]] = None):
        """
        Initialize base service

        Args:
            db_session: Database session for persistence
            config: Service-specific configuration
        """
        self.db = db_session
        self.config = config or {}
        self.logger = logging.getLogger(self.__class__.__name__)

    def _validate_params(self, params: Dict[str, Any], required: List[str]) -> bool:
        """
        Validate that required parameters are present

        Args:
            params: Parameters to validate
            required: List of required parameter names

        Returns:
            True if valid

        Raises:
            ValueError: If required parameters are missing
        """
        missing = [key for key in required if key not in params or params[key] is None]
        if missing:
            raise ValueError(f"Missing required parameters: {', '.join(missing)}")
        return True

    def _log_operation(self, operation: str, details: Dict[str, Any] = None):
        """Log service operation for monitoring"""
        self.logger.info(f"Operation: {operation}", extra={
            'service': self.__class__.__name__,
            'operation': operation,
            'details': details or {}
        })

    @abstractmethod
    async def health_check(self) -> Dict[str, Any]:
        """
        Check service health

        Returns:
            Health status dictionary
        """
        pass


class ServiceRegistry:
    """
    Singleton registry for managing service instances
    """
    _instance = None
    _services: Dict[str, BaseKHService] = {}

    def __new__(cls):
        if not cls._instance:
            cls._instance = super().__new__(cls)
            cls._instance._services = {}
        return cls._instance

    def register(self, name: str, service: BaseKHService) -> None:
        """
        Register a service instance

        Args:
            name: Service name for lookup
            service: Service instance
        """
        if not isinstance(service, BaseKHService):
            raise TypeError(f"Service must inherit from BaseKHService, got {type(service)}")

        self._services[name] = service
        logger.info(f"Registered service: {name}")

    def get(self, name: str) -> Optional[BaseKHService]:
        """
        Get a registered service

        Args:
            name: Service name

        Returns:
            Service instance or None if not found
        """
        return self._services.get(name)

    def get_required(self, name: str) -> BaseKHService:
        """
        Get a required service (raises if not found)

        Args:
            name: Service name

        Returns:
            Service instance

        Raises:
            ValueError: If service not found
        """
        service = self.get(name)
        if not service:
            raise ValueError(f"Required service not found: {name}")
        return service

    def list_services(self) -> List[str]:
        """
        List all registered services

        Returns:
            List of service names
        """
        return list(self._services.keys())

    def clear(self) -> None:
        """Clear all registered services"""
        self._services.clear()

    async def health_check_all(self) -> Dict[str, Dict[str, Any]]:
        """
        Check health of all registered services

        Returns:
            Dictionary mapping service names to health status
        """
        results = {}
        for name, service in self._services.items():
            try:
                results[name] = await service.health_check()
            except Exception as e:
                results[name] = {
                    'status': 'error',
                    'error': str(e)
                }
        return results


# Global registry instance
service_registry = ServiceRegistry()