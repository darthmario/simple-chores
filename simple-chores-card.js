/**
 * Household Tasks Card
 * A custom Lovelace card for managing household chores
 */

const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class HouseholdTasksCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _selectedRoom: { type: String },
      _selectedUser: { type: String },
      _showAddChore: { type: Boolean },
      _showAddRoom: { type: Boolean },
      _view: { type: String },
    };
  }

  constructor() {
    super();
    this._selectedRoom = "all";
    this._selectedUser = null;
    this._showAddChore = false;
    this._showAddRoom = false;
    this._view = "week"; // week, rooms, history
  }

  setConfig(config) {
    this.config = {
      show_completed: false,
      default_room: "all",
      ...config,
    };
    this._selectedRoom = this.config.default_room;
  }

  static getConfigElement() {
    return document.createElement("household-tasks-card-editor");
  }

  static getStubConfig() {
    return {
      show_completed: false,
      default_room: "all",
    };
  }

  get _dueTodaySensor() {
    return this.hass?.states["sensor.household_tasks_due_today"];
  }

  get _dueThisWeekSensor() {
    return this.hass?.states["sensor.household_tasks_due_this_week"];
  }

  get _overdueSensor() {
    return this.hass?.states["sensor.household_tasks_overdue"];
  }

  get _totalSensor() {
    return this.hass?.states["sensor.household_tasks_total"];
  }

  get _rooms() {
    return this._totalSensor?.attributes?.rooms || [];
  }

  get _choresThisWeek() {
    return this._dueThisWeekSensor?.attributes?.chores || [];
  }

  get _choresToday() {
    return this._dueTodaySensor?.attributes?.chores || [];
  }

  get _overdueChores() {
    return this._overdueSensor?.attributes?.chores || [];
  }

  _filterChores(chores) {
    if (this._selectedRoom === "all") {
      return chores;
    }
    return chores.filter((c) => c.room_id === this._selectedRoom);
  }

  _groupChoresByDay(chores) {
    const days = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    chores.forEach((chore) => {
      const dueDate = new Date(chore.due_date || chore.next_due);
      dueDate.setHours(0, 0, 0, 0);

      const dayKey = dueDate.toISOString().split("T")[0];
      if (!days[dayKey]) {
        days[dayKey] = {
          date: dueDate,
          chores: [],
          isToday: dueDate.getTime() === today.getTime(),
          isPast: dueDate < today,
        };
      }
      days[dayKey].chores.push(chore);
    });

    return Object.values(days).sort((a, b) => a.date - b.date);
  }

  _formatDate(date) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) {
      return "Today";
    }
    if (date.getTime() === tomorrow.getTime()) {
      return "Tomorrow";
    }

    const options = { weekday: "long", month: "short", day: "numeric" };
    return date.toLocaleDateString(undefined, options);
  }

  async _completeChore(choreId) {
    const userId = this._selectedUser || this.hass.user?.id;
    await this.hass.callService("household_tasks", "complete_chore", {
      chore_id: choreId,
      user_id: userId,
    });
  }

  async _skipChore(choreId) {
    await this.hass.callService("household_tasks", "skip_chore", {
      chore_id: choreId,
    });
  }

  async _addChore(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    await this.hass.callService("household_tasks", "add_chore", {
      name: formData.get("name"),
      room_id: formData.get("room_id"),
      frequency: formData.get("frequency"),
    });

    this._showAddChore = false;
    form.reset();
  }

  async _addRoom(e) {
    e.preventDefault();
    const form = e.target;
    const formData = new FormData(form);

    await this.hass.callService("household_tasks", "add_room", {
      name: formData.get("name"),
      icon: formData.get("icon") || "mdi:home",
    });

    this._showAddRoom = false;
    form.reset();
  }

  render() {
    if (!this.hass) {
      return html`<ha-card><div class="loading">Loading...</div></ha-card>`;
    }

    return html`
      <ha-card>
        <div class="card-header">
          <div class="header-title">
            <ha-icon icon="mdi:clipboard-check-outline"></ha-icon>
            <span>Household Tasks</span>
          </div>
          <div class="header-stats">
            <span class="stat ${this._overdueChores.length > 0 ? "overdue" : ""}">
              ${this._choresToday.length} today
            </span>
            <span class="stat">${this._choresThisWeek.length} this week</span>
          </div>
        </div>

        <div class="card-content">
          <!-- View Tabs -->
          <div class="tabs">
            <button
              class="tab ${this._view === "week" ? "active" : ""}"
              @click=${() => (this._view = "week")}
            >
              Week
            </button>
            <button
              class="tab ${this._view === "rooms" ? "active" : ""}"
              @click=${() => (this._view = "rooms")}
            >
              Rooms
            </button>
          </div>

          <!-- Room Filter -->
          <div class="filter-row">
            <select
              @change=${(e) => (this._selectedRoom = e.target.value)}
              .value=${this._selectedRoom}
            >
              <option value="all">All Rooms</option>
              ${this._rooms.map(
                (room) =>
                  html`<option value=${room.id}>${room.name}</option>`
              )}
            </select>

            <div class="actions">
              <button
                class="icon-btn"
                @click=${() => (this._showAddChore = !this._showAddChore)}
                title="Add Chore"
              >
                <ha-icon icon="mdi:plus"></ha-icon>
              </button>
              <button
                class="icon-btn"
                @click=${() => (this._showAddRoom = !this._showAddRoom)}
                title="Add Room"
              >
                <ha-icon icon="mdi:home-plus"></ha-icon>
              </button>
            </div>
          </div>

          <!-- Add Chore Form -->
          ${this._showAddChore ? this._renderAddChoreForm() : ""}

          <!-- Add Room Form -->
          ${this._showAddRoom ? this._renderAddRoomForm() : ""}

          <!-- Week View -->
          ${this._view === "week" ? this._renderWeekView() : ""}

          <!-- Rooms View -->
          ${this._view === "rooms" ? this._renderRoomsView() : ""}
        </div>
      </ha-card>
    `;
  }

  _renderWeekView() {
    const filteredChores = this._filterChores(this._choresThisWeek);
    const groupedByDay = this._groupChoresByDay(filteredChores);

    if (groupedByDay.length === 0) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:check-circle-outline"></ha-icon>
          <p>No chores due this week!</p>
        </div>
      `;
    }

    return html`
      <div class="week-view">
        ${groupedByDay.map(
          (day) => html`
            <div class="day-group ${day.isPast ? "overdue" : ""} ${day.isToday ? "today" : ""}">
              <div class="day-header">
                <span class="day-name">${this._formatDate(day.date)}</span>
                <span class="day-count">${day.chores.length} chore(s)</span>
              </div>
              <div class="chores-list">
                ${day.chores.map((chore) => this._renderChoreItem(chore, day.isPast))}
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  _renderRoomsView() {
    const rooms = this._rooms;
    if (rooms.length === 0) {
      return html`
        <div class="empty-state">
          <ha-icon icon="mdi:home-outline"></ha-icon>
          <p>No rooms configured yet</p>
        </div>
      `;
    }

    return html`
      <div class="rooms-view">
        ${rooms.map(
          (room) => html`
            <div class="room-card">
              <div class="room-header">
                <ha-icon icon=${room.icon || "mdi:home"}></ha-icon>
                <span>${room.name}</span>
                ${room.is_custom
                  ? html`<span class="badge">Custom</span>`
                  : html`<span class="badge ha">HA Area</span>`}
              </div>
            </div>
          `
        )}
      </div>
    `;
  }

  _renderChoreItem(chore, isOverdue = false) {
    return html`
      <div class="chore-item ${isOverdue ? "overdue" : ""}">
        <div class="chore-checkbox">
          <input
            type="checkbox"
            @change=${() => this._completeChore(chore.id)}
          />
        </div>
        <div class="chore-details">
          <div class="chore-name">${chore.name}</div>
          <div class="chore-meta">
            <span class="chore-room">${chore.room}</span>
            <span class="chore-frequency">${chore.frequency}</span>
          </div>
        </div>
        <div class="chore-actions">
          <button
            class="skip-btn"
            @click=${() => this._skipChore(chore.id)}
            title="Skip to next occurrence"
          >
            <ha-icon icon="mdi:skip-next"></ha-icon>
          </button>
        </div>
      </div>
    `;
  }

  _renderAddChoreForm() {
    return html`
      <form class="add-form" @submit=${this._addChore}>
        <h3>Add New Chore</h3>
        <div class="form-row">
          <input
            type="text"
            name="name"
            placeholder="Chore name"
            required
          />
        </div>
        <div class="form-row">
          <select name="room_id" required>
            <option value="">Select room...</option>
            ${this._rooms.map(
              (room) =>
                html`<option value=${room.id}>${room.name}</option>`
            )}
          </select>
        </div>
        <div class="form-row">
          <select name="frequency" required>
            <option value="daily">Daily</option>
            <option value="weekly" selected>Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div class="form-actions">
          <button type="button" @click=${() => (this._showAddChore = false)}>
            Cancel
          </button>
          <button type="submit" class="primary">Add Chore</button>
        </div>
      </form>
    `;
  }

  _renderAddRoomForm() {
    return html`
      <form class="add-form" @submit=${this._addRoom}>
        <h3>Add Custom Room</h3>
        <div class="form-row">
          <input
            type="text"
            name="name"
            placeholder="Room name"
            required
          />
        </div>
        <div class="form-row">
          <input
            type="text"
            name="icon"
            placeholder="Icon (e.g., mdi:garage)"
            value="mdi:home"
          />
        </div>
        <div class="form-actions">
          <button type="button" @click=${() => (this._showAddRoom = false)}>
            Cancel
          </button>
          <button type="submit" class="primary">Add Room</button>
        </div>
      </form>
    `;
  }

  static get styles() {
    return css`
      :host {
        --primary-color: var(--ha-primary-color, #03a9f4);
        --text-primary: var(--primary-text-color, #212121);
        --text-secondary: var(--secondary-text-color, #727272);
        --divider-color: var(--divider-color, #e0e0e0);
        --overdue-color: #f44336;
        --today-color: var(--primary-color);
      }

      ha-card {
        padding: 0;
      }

      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid var(--divider-color);
      }

      .header-title {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 18px;
        font-weight: 500;
      }

      .header-stats {
        display: flex;
        gap: 16px;
        font-size: 14px;
        color: var(--text-secondary);
      }

      .stat.overdue {
        color: var(--overdue-color);
        font-weight: 500;
      }

      .card-content {
        padding: 16px;
      }

      .tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
      }

      .tab {
        padding: 8px 16px;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
        color: var(--text-secondary);
      }

      .tab.active {
        background: var(--primary-color);
        color: white;
      }

      .filter-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
      }

      .filter-row select {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color, white);
        color: var(--text-primary);
        font-size: 14px;
      }

      .actions {
        display: flex;
        gap: 8px;
      }

      .icon-btn {
        padding: 8px;
        border: none;
        background: transparent;
        cursor: pointer;
        border-radius: 4px;
        color: var(--text-secondary);
      }

      .icon-btn:hover {
        background: var(--divider-color);
      }

      .day-group {
        margin-bottom: 16px;
      }

      .day-group.overdue .day-header {
        color: var(--overdue-color);
      }

      .day-group.today .day-header {
        color: var(--today-color);
        font-weight: 600;
      }

      .day-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 8px 0;
        border-bottom: 1px solid var(--divider-color);
        margin-bottom: 8px;
      }

      .day-name {
        font-weight: 500;
      }

      .day-count {
        font-size: 12px;
        color: var(--text-secondary);
      }

      .chores-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .chore-item {
        display: flex;
        align-items: center;
        padding: 12px;
        background: var(--card-background-color, white);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        gap: 12px;
      }

      .chore-item.overdue {
        border-left: 3px solid var(--overdue-color);
      }

      .chore-checkbox input {
        width: 20px;
        height: 20px;
        cursor: pointer;
      }

      .chore-details {
        flex: 1;
      }

      .chore-name {
        font-weight: 500;
        margin-bottom: 4px;
      }

      .chore-meta {
        display: flex;
        gap: 12px;
        font-size: 12px;
        color: var(--text-secondary);
      }

      .chore-actions {
        display: flex;
        gap: 4px;
      }

      .skip-btn {
        padding: 4px;
        border: none;
        background: transparent;
        cursor: pointer;
        color: var(--text-secondary);
        border-radius: 4px;
      }

      .skip-btn:hover {
        background: var(--divider-color);
      }

      .empty-state {
        text-align: center;
        padding: 32px;
        color: var(--text-secondary);
      }

      .empty-state ha-icon {
        --mdc-icon-size: 48px;
        margin-bottom: 8px;
      }

      .add-form {
        background: var(--secondary-background-color, #f5f5f5);
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
      }

      .add-form h3 {
        margin: 0 0 16px 0;
        font-size: 16px;
      }

      .form-row {
        margin-bottom: 12px;
      }

      .form-row input,
      .form-row select {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        font-size: 14px;
        background: var(--card-background-color, white);
        color: var(--text-primary);
        box-sizing: border-box;
      }

      .form-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
      }

      .form-actions button {
        padding: 8px 16px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
        background: var(--card-background-color, white);
        color: var(--text-primary);
      }

      .form-actions button.primary {
        background: var(--primary-color);
        color: white;
        border-color: var(--primary-color);
      }

      .rooms-view {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: 12px;
      }

      .room-card {
        padding: 16px;
        background: var(--card-background-color, white);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
      }

      .room-header {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        background: var(--divider-color);
        color: var(--text-secondary);
      }

      .badge.ha {
        background: var(--primary-color);
        color: white;
      }

      .loading {
        padding: 32px;
        text-align: center;
        color: var(--text-secondary);
      }
    `;
  }
}

customElements.define("household-tasks-card", HouseholdTasksCard);

// Card Editor
class HouseholdTasksCardEditor extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
    };
  }

  setConfig(config) {
    this._config = config;
  }

  get _show_completed() {
    return this._config?.show_completed || false;
  }

  get _default_room() {
    return this._config?.default_room || "all";
  }

  render() {
    if (!this.hass || !this._config) {
      return html``;
    }

    return html`
      <div class="card-config">
        <ha-formfield label="Show completed chores">
          <ha-switch
            .checked=${this._show_completed}
            @change=${this._valueChanged}
            .configValue=${"show_completed"}
          ></ha-switch>
        </ha-formfield>

        <ha-textfield
          label="Default Room (room ID or 'all')"
          .value=${this._default_room}
          @input=${this._valueChanged}
          .configValue=${"default_room"}
        ></ha-textfield>
      </div>
    `;
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    const value =
      target.configValue === "show_completed" ? target.checked : target.value;

    if (this[`_${target.configValue}`] === value) {
      return;
    }

    const newConfig = {
      ...this._config,
      [target.configValue]: value,
    };

    const event = new CustomEvent("config-changed", {
      detail: { config: newConfig },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  static get styles() {
    return css`
      .card-config {
        padding: 16px;
      }

      ha-formfield {
        display: block;
        margin-bottom: 16px;
      }

      ha-textfield {
        width: 100%;
      }
    `;
  }
}

customElements.define("household-tasks-card-editor", HouseholdTasksCardEditor);

// Register card
window.customCards = window.customCards || [];
window.customCards.push({
  type: "household-tasks-card",
  name: "Household Tasks Card",
  description: "A card for managing household chores and tasks",
  preview: true,
});

console.info(
  "%c HOUSEHOLD-TASKS-CARD %c v1.0.0 ",
  "color: white; background: #03a9f4; font-weight: bold;",
  "color: #03a9f4; background: white; font-weight: bold;"
);
