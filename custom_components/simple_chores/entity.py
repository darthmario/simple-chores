"""Shared entity helpers for the Simple Chores integration."""

from __future__ import annotations

from typing import TYPE_CHECKING

from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo

from .const import DOMAIN

if TYPE_CHECKING:
    from homeassistant.config_entries import ConfigEntry


def get_device_info(entry: ConfigEntry) -> DeviceInfo:
    """Return the shared device info so all entities group under one device."""
    return DeviceInfo(
        identifiers={(DOMAIN, entry.entry_id)},
        name="Simple Chores",
        manufacturer="Simple Chores",
        entry_type=DeviceEntryType.SERVICE,
    )
