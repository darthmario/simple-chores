"""Frontend resource registration for Simple Chores custom card."""
from __future__ import annotations

import json
import logging
import os
import shutil
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from homeassistant.core import HomeAssistant

_LOGGER = logging.getLogger(__name__)


def _get_integration_version() -> str:
    """Read version from manifest.json for cache busting.

    Returns:
        Version string from manifest, or 'unknown' if not found.
    """
    try:
        manifest_path = os.path.join(os.path.dirname(__file__), "manifest.json")
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)
            return manifest.get("version", "unknown")
    except (OSError, json.JSONDecodeError) as err:
        _LOGGER.warning("Could not read version from manifest: %s", err)
        return "unknown"


async def register_frontend_resources(hass: HomeAssistant, domain: str) -> None:
    """Register frontend resources for the Lovelace card.

    Uses HACS-compatible approach: copies card to www/community folder
    and registers it with Home Assistant's frontend.

    Args:
        hass: Home Assistant instance
        domain: Integration domain name
    """
    try:
        # Validate card file exists
        source_path = hass.config.path(f"custom_components/{domain}/www")
        card_file = os.path.join(source_path, "simple-chores-card.js")

        if not os.path.exists(card_file):
            _LOGGER.error("Card file not found at: %s", card_file)
            _LOGGER.error(
                "Please ensure simple-chores-card.js exists in custom_components/%s/www/",
                domain,
            )
            return

        _LOGGER.debug("Found card file: %s", card_file)

        # Register using HACS-compatible approach
        await _register_hacs_compatible(hass, domain, card_file)

    except OSError as err:
        _LOGGER.error("File system error during frontend registration: %s", err, exc_info=True)
    except Exception:
        _LOGGER.exception("Unexpected error registering frontend resources")


async def _register_hacs_compatible(
    hass: HomeAssistant,
    domain: str,
    source_file: str
) -> None:
    """Register card using HACS-compatible community folder structure.

    This is the recommended approach for custom integrations as it:
    - Works with HACS conventions
    - Doesn't require manual Lovelace resource configuration
    - Uses Home Assistant's standard frontend registration

    Args:
        hass: Home Assistant instance
        domain: Integration domain name
        source_file: Full path to the source card file
    """
    try:
        from homeassistant.components.frontend import add_extra_js_url

        # Define target directory following HACS convention
        target_dir = hass.config.path(f"www/community/{domain}")
        target_file = os.path.join(target_dir, "simple-chores-card.js")

        # Get version for cache busting
        version = _get_integration_version()
        card_url = f"/local/community/{domain}/simple-chores-card.js?v={version}"

        _LOGGER.debug("Using version %s for cache busting", version)

        # Copy file to HACS community folder (async to avoid blocking)
        def _copy_card_file() -> None:
            """Copy card file to target directory (runs in executor)."""
            os.makedirs(target_dir, exist_ok=True)
            shutil.copy2(source_file, target_file)
            _LOGGER.debug("Copied card to: %s", target_file)

        await hass.async_add_executor_job(_copy_card_file)

        # Register with Home Assistant frontend
        add_extra_js_url(hass, card_url)

        _LOGGER.info("Successfully registered Simple Chores card v%s", version)
        _LOGGER.info("Card URL: %s", card_url)
        _LOGGER.info(
            "The card should be automatically available. "
            "Cache will refresh automatically on version updates."
        )

    except ImportError:
        _LOGGER.error(
            "Failed to import frontend.add_extra_js_url. "
            "This Home Assistant version may not support automatic card registration."
        )
        _logger_manual_instructions(domain)
    except OSError as err:
        _LOGGER.error("Failed to copy card file: %s", err, exc_info=True)
        _logger_manual_instructions(domain)
    except Exception:
        _LOGGER.exception("Unexpected error in HACS-compatible registration")
        _logger_manual_instructions(domain)


def _logger_manual_instructions(domain: str) -> None:
    """Log manual installation instructions for the user.

    Args:
        domain: Integration domain name
    """
    _LOGGER.warning("Automatic card registration failed. Manual setup required:")
    _LOGGER.warning(
        "1. Copy custom_components/%s/www/simple-chores-card.js to config/www/community/%s/",
        domain,
        domain,
    )
    _LOGGER.warning(
        "2. Add '/local/community/%s/simple-chores-card.js' to Lovelace resources",
        domain,
    )
    _LOGGER.warning("3. Set resource type to 'JavaScript Module'")
