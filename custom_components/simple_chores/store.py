"""Data storage for the Household Tasks integration."""
from __future__ import annotations

import logging
import uuid
from datetime import date, datetime
from typing import TYPE_CHECKING, Any

from homeassistant.helpers.storage import Store

from .const import FREQUENCIES, MAX_ROOM_NAME_LENGTH, MAX_CHORE_NAME_LENGTH, MAX_HISTORY_ENTRIES

from .const import STORAGE_KEY, STORAGE_VERSION

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


class SimpleChoresStore:
    """Class to manage persistent storage for simple chores."""

    def __init__(self, hass: HomeAssistant) -> None:
        """Initialize the store."""
        self._hass = hass
        self._store = Store[dict[str, Any]](hass, STORAGE_VERSION, STORAGE_KEY)
        self._data: dict[str, Any] = {
            "rooms": {},
            "chores": {},
            "history": [],
        }

    @property
    def rooms(self) -> dict[str, Any]:
        """Return all custom rooms."""
        return self._data.get("rooms", {})

    @property
    def chores(self) -> dict[str, Any]:
        """Return all chores."""
        return self._data.get("chores", {})

    @property
    def history(self) -> list[dict[str, Any]]:
        """Return completion history."""
        return self._data.get("history", [])

    async def async_load(self) -> dict[str, Any]:
        """Load data from storage."""
        data = await self._store.async_load()
        if data:
            self._data = data
        return self._data

    async def async_save(self) -> None:
        """Save data to storage."""
        await self._store.async_save(self._data)

    # Room operations
    def add_room(self, name: str, icon: str | None = None) -> dict[str, Any]:
        """Add a custom room."""
        # Input validation
        if not name or not name.strip():
            raise ValueError("Room name cannot be empty")
        if len(name.strip()) > MAX_ROOM_NAME_LENGTH:
            raise ValueError(f"Room name too long (max {MAX_ROOM_NAME_LENGTH} characters)")
        
        room_id = f"custom_{uuid.uuid4().hex[:8]}"
        room = {
            "id": room_id,
            "name": name,
            "icon": icon or "mdi:home",
            "is_custom": True,
        }
        self._data["rooms"][room_id] = room
        return room

    def update_room(self, room_id: str, name: str | None = None, icon: str | None = None) -> dict[str, Any] | None:
        """Update a custom room."""
        if room_id not in self._data["rooms"]:
            return None
        room = self._data["rooms"][room_id]
        if name is not None:
            room["name"] = name
        if icon is not None:
            room["icon"] = icon
        return room

    def remove_room(self, room_id: str) -> bool:
        """Remove a custom room."""
        if room_id in self._data["rooms"]:
            del self._data["rooms"][room_id]
            return True
        return False

    # Chore operations
    def add_chore(
        self,
        name: str,
        room_id: str,
        frequency: str,
        start_date: date | None = None,
        assigned_to: str | None = None,
    ) -> dict[str, Any]:
        """Add a new chore."""
        # Input validation
        if not name or not name.strip():
            raise ValueError("Chore name cannot be empty")
        if len(name.strip()) > MAX_CHORE_NAME_LENGTH:
            raise ValueError(f"Chore name too long (max {MAX_CHORE_NAME_LENGTH} characters)")
        if not room_id or not room_id.strip():
            raise ValueError("Room ID cannot be empty")
        if frequency not in FREQUENCIES:
            raise ValueError(f"Invalid frequency: {frequency}. Must be one of: {FREQUENCIES}")
        
        chore_id = uuid.uuid4().hex[:8]
        next_due = start_date or date.today()
        chore = {
            "id": chore_id,
            "name": name,
            "room_id": room_id,
            "frequency": frequency,
            "assigned_to": assigned_to,
            "last_completed": None,
            "last_completed_by": None,
            "next_due": next_due.isoformat(),
            "created_at": datetime.now().isoformat(),
        }
        self._data["chores"][chore_id] = chore
        return chore

    def update_chore(
        self,
        chore_id: str,
        name: str | None = None,
        room_id: str | None = None,
        frequency: str | None = None,
        next_due: date | None = None,
        assigned_to: str | None = None,
    ) -> dict[str, Any] | None:
        """Update an existing chore."""
        if chore_id not in self._data["chores"]:
            return None
        chore = self._data["chores"][chore_id]
        if name is not None:
            chore["name"] = name
        if room_id is not None:
            chore["room_id"] = room_id
        if frequency is not None:
            chore["frequency"] = frequency
        if next_due is not None:
            chore["next_due"] = next_due.isoformat()
        # Ensure assigned_to field exists for backwards compatibility
        if "assigned_to" not in chore:
            chore["assigned_to"] = None
        # Update assigned_to field (always set it when updating a chore)
        chore["assigned_to"] = assigned_to
        return chore

    def remove_chore(self, chore_id: str) -> bool:
        """Remove a chore."""
        if chore_id in self._data["chores"]:
            del self._data["chores"][chore_id]
            return True
        return False

    def complete_chore(
        self,
        chore_id: str,
        user_id: str,
        user_name: str,
        next_due: date,
    ) -> dict[str, Any] | None:
        """Mark a chore as completed and schedule next occurrence."""
        if chore_id not in self._data["chores"]:
            return None

        chore = self._data["chores"][chore_id]
        now = datetime.now()

        # Update chore
        chore["last_completed"] = now.date().isoformat()
        chore["last_completed_by"] = user_id
        chore["next_due"] = next_due.isoformat()

        # Add to history
        history_entry = {
            "id": uuid.uuid4().hex[:8],
            "chore_id": chore_id,
            "chore_name": chore["name"],
            "completed_at": now.isoformat(),
            "completed_by": user_id,
            "completed_by_name": user_name,
        }
        self._data["history"].append(history_entry)

        # Always keep history limited to prevent memory bloat
        self._data["history"] = self._data["history"][-MAX_HISTORY_ENTRIES:]

        return chore

    def skip_chore(self, chore_id: str, next_due: date) -> dict[str, Any] | None:
        """Skip a chore to the next occurrence without marking complete."""
        if chore_id not in self._data["chores"]:
            return None
        chore = self._data["chores"][chore_id]
        chore["next_due"] = next_due.isoformat()
        return chore

    def get_chore_history(self, chore_id: str) -> list[dict[str, Any]]:
        """Get completion history for a specific chore."""
        return [h for h in self._data["history"] if h["chore_id"] == chore_id]

    def get_user_stats(self) -> dict[str, dict[str, Any]]:
        """Get completion statistics per user."""
        stats: dict[str, dict[str, Any]] = {}
        for entry in self._data["history"]:
            user_id = entry["completed_by"]
            user_name = entry["completed_by_name"]
            if user_id not in stats:
                stats[user_id] = {
                    "user_id": user_id,
                    "user_name": user_name,
                    "total_completed": 0,
                    "last_completed": None,
                }
            stats[user_id]["total_completed"] += 1
            completed_at = entry["completed_at"]
            if stats[user_id]["last_completed"] is None or completed_at > stats[user_id]["last_completed"]:
                stats[user_id]["last_completed"] = completed_at
        return stats