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
    CONF_NOTIFY_DAYS_BEFORE,
    CONF_NOTIFY_TARGETS,
    DEFAULT_NOTIFICATION_TIME,
    DEFAULT_NOTIFICATIONS_ENABLED,
    DEFAULT_NOTIFY_DAYS_BEFORE,
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
        self._config_entry = config_entry

    async def async_step_init(
        self, user_input: dict[str, Any] | None = None
    ) -> FlowResult:
        """Manage the options."""
        if user_input is not None:
            # Convert days_before from string list to int list
            if CONF_NOTIFY_DAYS_BEFORE in user_input:
                user_input[CONF_NOTIFY_DAYS_BEFORE] = [
                    int(d) for d in user_input[CONF_NOTIFY_DAYS_BEFORE]
                ]
            return self.async_create_entry(title="", data=user_input)

        # Get list of notify services for target selection
        notify_services = []
        for service in self.hass.services.async_services().get("notify", {}):
            if service != "notify":
                notify_services.append(
                    selector.SelectOptionDict(value=service, label=service)
                )

        # Options for days before notification
        days_before_options = [
            selector.SelectOptionDict(value="0", label="Day of (due today)"),
            selector.SelectOptionDict(value="1", label="1 day before"),
            selector.SelectOptionDict(value="2", label="2 days before"),
            selector.SelectOptionDict(value="3", label="3 days before"),
            selector.SelectOptionDict(value="7", label="1 week before"),
        ]

        # Convert stored int list to string list for the selector
        current_days = self._config_entry.options.get(
            CONF_NOTIFY_DAYS_BEFORE, DEFAULT_NOTIFY_DAYS_BEFORE
        )
        current_days_str = [str(d) for d in current_days]

        return self.async_show_form(
            step_id="init",
            data_schema=vol.Schema(
                {
                    vol.Optional(
                        CONF_NOTIFICATIONS_ENABLED,
                        default=self._config_entry.options.get(
                            CONF_NOTIFICATIONS_ENABLED, DEFAULT_NOTIFICATIONS_ENABLED
                        ),
                    ): selector.BooleanSelector(),
                    vol.Optional(
                        CONF_NOTIFICATION_TIME,
                        default=self._config_entry.options.get(
                            CONF_NOTIFICATION_TIME, DEFAULT_NOTIFICATION_TIME
                        ),
                    ): selector.TimeSelector(),
                    vol.Optional(
                        CONF_NOTIFY_DAYS_BEFORE,
                        default=current_days_str,
                    ): selector.SelectSelector(
                        selector.SelectSelectorConfig(
                            options=days_before_options,
                            multiple=True,
                            mode=selector.SelectSelectorMode.LIST,
                        )
                    ),
                    vol.Optional(
                        CONF_NOTIFY_TARGETS,
                        default=self._config_entry.options.get(CONF_NOTIFY_TARGETS, []),
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