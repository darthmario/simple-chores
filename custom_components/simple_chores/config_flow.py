"""Config flow for Household Tasks integration."""
from __future__ import annotations

import logging
from typing import Any

import voluptuous as vol

from homeassistant.config_entries import ConfigEntry, ConfigFlow, OptionsFlow
from homeassistant.core import callback
from homeassistant.data_entry_flow import FlowResult
from homeassistant.helpers import selector

from .const import (
    CONF_NOTIFICATION_TIME,
    CONF_NOTIFICATIONS_ENABLED,
    CONF_NOTIFY_TARGETS,
    DEFAULT_NOTIFICATION_TIME,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DOMAIN,
)

_LOGGER = logging.getLogger(__name__)


class HouseholdTasksConfigFlow(ConfigFlow, domain=DOMAIN):
    """Handle a config flow for Household Tasks."""

    VERSION = 1

    async def async_step_user(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Handle the initial step."""
        # Only allow a single instance
        await self.async_set_unique_id(DOMAIN)
        self._abort_if_unique_id_configured()

        if user_input is not None:
            return self.async_create_entry(
                title="Simple Chores",
                data={},
                options={
                    CONF_NOTIFICATIONS_ENABLED: user_input.get(
                        CONF_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFICATIONS_ENABLED
                    ),
                    CONF_NOTIFICATION_TIME: user_input.get(
                        CONF_NOTIFICATION_TIME, DEFAULT_NOTIFICATION_TIME
                    ),
                    CONF_NOTIFY_TARGETS: user_input.get(CONF_NOTIFY_TARGETS, []),
                },
            )

        return self.async_show_form(
            step_id="user",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_NOTIFICATIONS_ENABLED,
                        default=DEFAULT_NOTIFICATIONS_ENABLED,
                    ): selector.BooleanSelector(),
                    vol.Optional(
                        CONF_NOTIFICATION_TIME,
                        default=DEFAULT_NOTIFICATION_TIME,
                    ): selector.TimeSelector(),
                }
            ),
        )

    @staticmethod
    @callback
    def async_get_options_flow(config_entry: ConfigEntry) -> OptionsFlow:
        """Get the options flow for this handler."""
        return HouseholdTasksOptionsFlow(config_entry)


class HouseholdTasksOptionsFlow(OptionsFlow):
    """Handle options flow for Household Tasks."""

    def __init__(self, config_entry: ConfigEntry) -> None:
        """Initialize options flow."""
        self.config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            return self.async_create_entry(title="", data=user_input)

        # Get list of notify services for target selection
        notify_services = []
        for service in self.hass.services.async_services().get("notify", {}):
            if service != "notify":
                notify_services.append(
                    selector.SelectOptionDict(value=service, label=service)
                )

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_NOTIFICATIONS_ENABLED,
                        default=self.config_entry.options.get(
                            CONF_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFICATIONS_ENABLED
                        ),
                    ): selector.BooleanSelector(),
                    vol.Optional(
                        CONF_NOTIFICATION_TIME,
                        default=self.config_entry.options.get(
                            CONF_NOTIFICATION_TIME, DEFAULT_NOTIFICATION_TIME
                        ),
                    ): selector.TimeSelector(),
                    vol.Optional(
                        CONF_NOTIFY_TARGETS,
                        default=self.config_entry.options.get(CONF_NOTIFY_TARGETS, []),
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=notify_services,
                            multiple=True,
                            mode=selector.SelectSelectorMode.DROPDOWN,
                        )
                    )
                    if notify_services
                    else selector.TextSelector(
                        selector.TextSelectorConfig(multiline=False)
                    ),
                }
            ),
        )