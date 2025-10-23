"""SQLAlchemy base configuration and session management."""

from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class DatabaseSessionManager:
    """Manages database engine and session lifecycle."""

    def __init__(self):
        self._engine: AsyncEngine | None = None
        self._session_maker: async_sessionmaker[AsyncSession] | None = None

    def init(
        self,
        database_url: str,
        pool_size: int = 10,
        max_overflow: int = 20,
        pool_timeout: int = 30,
        echo: bool = False,
    ):
        """Initialize database engine and session maker."""
        self._engine = create_async_engine(
            database_url,
            pool_size=pool_size,
            max_overflow=max_overflow,
            pool_timeout=pool_timeout,
            echo=echo,
            future=True,
        )

        self._session_maker = async_sessionmaker(
            self._engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autocommit=False,
            autoflush=False,
        )

    async def close(self):
        """Close database engine."""
        if self._engine:
            await self._engine.dispose()
            self._engine = None
            self._session_maker = None

    async def session(self) -> AsyncGenerator[AsyncSession, None]:
        """Get async database session."""
        if self._session_maker is None:
            raise RuntimeError("Database not initialized")

        async with self._session_maker() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise
            finally:
                await session.close()


# Global database session manager
db_manager = DatabaseSessionManager()
