/**
 * Simple Chores Card
 * A custom Lovelace card for managing simple chores
 */

const LitElement = Object.getPrototypeOf(
  customElements.get("ha-panel-lovelace")
);
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

class SimpleChoresCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _selectedRoom: { type: String },
    };
  }

  constructor() {
    super();
    this._selectedRoom = "all";
  }

  static getStubConfig() {
    return {
      show_completed: false,
      default_room: "all"
    };
  }

  setConfig(config) {
    this.config = {
      show_completed: false,
      default_room: "all",
      ...config
    };
  }

  getCardSize() {
    return 6;
  }

  render() {
    if (!this.hass || !this.config) {
      return html``;
    }

    const dueToday = this._getDueChores("today");
    const dueThisWeek = this._getDueChores("week");
    const rooms = this._getRooms();

    return html`
      <ha-card>
        <div class="card-header">
          <div class="name">Simple Chores</div>
          <div class="room-selector">
            <select @change=${this._roomChanged}>
              <option value="all" ?selected=${this._selectedRoom === "all"}>All Rooms</option>
              ${rooms.map(room => html`
                <option value=${room.id} ?selected=${this._selectedRoom === room.id}>
                  ${room.name}
                </option>
              `)}
            </select>
          </div>
        </div>
        
        <div class="card-content">
          ${this._renderStats()}
          ${this._renderChoreList(dueToday, "Due Today")}
          ${this._renderChoreList(dueThisWeek, "Due This Week")}
        </div>
      </ha-card>
    `;
  }

  _renderStats() {
    const dueToday = this.hass.states["sensor.simple_chores_due_today"]?.state || "0";
    const overdue = this.hass.states["sensor.simple_chores_overdue"]?.state || "0";
    const total = this.hass.states["sensor.simple_chores_total"]?.state || "0";
    
    return html`
      <div class="stats">
        <div class="stat ${parseInt(dueToday) > 0 ? 'attention' : ''}">
          <span class="stat-value">${dueToday}</span>
          <span class="stat-label">Due Today</span>
        </div>
        <div class="stat ${parseInt(overdue) > 0 ? 'warning' : ''}">
          <span class="stat-value">${overdue}</span>
          <span class="stat-label">Overdue</span>
        </div>
        <div class="stat">
          <span class="stat-value">${total}</span>
          <span class="stat-label">Total Chores</span>
        </div>
      </div>
    `;
  }

  _renderChoreList(chores, title) {
    const filteredChores = this._filterChoresByRoom(chores);
    
    return html`
      <div class="section">
        <h3>${title} (${filteredChores.length})</h3>
        ${filteredChores.length === 0 ? html`
          <p class="no-chores">No chores ${title.toLowerCase()}${this._selectedRoom !== 'all' ? ' in this room' : ''}</p>
        ` : html`
          <div class="chore-list">
            ${filteredChores.map(chore => this._renderChore(chore))}
          </div>
        `}
      </div>
    `;
  }

  _renderChore(chore) {
    const isOverdue = new Date(chore.next_due) < new Date().setHours(0,0,0,0);
    
    return html`
      <div class="chore-item ${isOverdue ? 'overdue' : ''}">
        <div class="chore-info">
          <span class="chore-name">${chore.name}</span>
          <span class="chore-room">${chore.room_name || 'Unknown Room'}</span>
          <span class="chore-due">Due: ${this._formatDate(chore.next_due)}</span>
        </div>
        <div class="chore-actions">
          <mwc-button 
            @click=${() => this._completeChore(chore.id)}
            class="complete-btn"
          >
            ✓ Complete
          </mwc-button>
          <mwc-button 
            @click=${() => this._skipChore(chore.id)} 
            outlined
            class="skip-btn"
          >
            ⏭ Skip
          </mwc-button>
        </div>
      </div>
    `;
  }

  _getDueChores(period) {
    if (!this.hass) return [];
    
    const sensorName = period === "today" ? 
      "sensor.simple_chores_due_today" : 
      "sensor.simple_chores_due_this_week";
    
    return this.hass.states[sensorName]?.attributes?.chores || [];
  }

  _getRooms() {
    if (!this.hass) return [];
    return this.hass.states["sensor.simple_chores_total"]?.attributes?.rooms || [];
  }

  _filterChoresByRoom(chores) {
    if (this._selectedRoom === "all") return chores;
    return chores.filter(chore => chore.room_id === this._selectedRoom);
  }

  _formatDate(dateStr) {
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) return "Today";
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    if (date.toDateString() === tomorrow.toDateString()) return "Tomorrow";
    
    return date.toLocaleDateString();
  }

  _roomChanged(e) {
    this._selectedRoom = e.target.value;
  }

  _completeChore(choreId) {
    this.hass.callService("simple_chores", "complete_chore", {
      chore_id: choreId
    }).then(() => {
      this._showToast("Chore completed!");
    });
  }

  _skipChore(choreId) {
    this.hass.callService("simple_chores", "skip_chore", {
      chore_id: choreId
    }).then(() => {
      this._showToast("Chore skipped to next occurrence");
    });
  }

  _showToast(message) {
    const event = new CustomEvent("hass-notification", {
      detail: { message },
      bubbles: true,
      composed: true,
    });
    this.dispatchEvent(event);
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }
      
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        border-bottom: 1px solid var(--divider-color);
        background: var(--primary-color);
        color: var(--text-primary-color);
      }
      
      .name {
        font-size: 1.2em;
        font-weight: 500;
      }
      
      .room-selector select {
        padding: 8px 12px;
        border: none;
        border-radius: 4px;
        background: rgba(255, 255, 255, 0.2);
        color: var(--text-primary-color);
        font-size: 14px;
      }
      
      .card-content {
        padding: 16px;
      }
      
      .stats {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
        gap: 12px;
        margin-bottom: 24px;
      }
      
      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 16px;
        background: var(--card-background-color);
        border: 2px solid var(--divider-color);
        border-radius: 12px;
        transition: all 0.2s ease;
      }
      
      .stat.attention {
        border-color: var(--warning-color);
        background: rgba(var(--warning-color-rgb), 0.1);
      }
      
      .stat.warning {
        border-color: var(--error-color);
        background: rgba(var(--error-color-rgb), 0.1);
      }
      
      .stat-value {
        font-size: 2em;
        font-weight: bold;
        color: var(--primary-color);
      }
      
      .stat.attention .stat-value {
        color: var(--warning-color);
      }
      
      .stat.warning .stat-value {
        color: var(--error-color);
      }
      
      .stat-label {
        font-size: 0.9em;
        color: var(--secondary-text-color);
        margin-top: 4px;
      }
      
      .section {
        margin-bottom: 24px;
      }
      
      .section h3 {
        margin: 0 0 12px 0;
        font-size: 1.1em;
        font-weight: 500;
        color: var(--primary-text-color);
        padding-bottom: 8px;
        border-bottom: 2px solid var(--primary-color);
      }
      
      .chore-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      
      .chore-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 16px;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        transition: all 0.2s ease;
      }
      
      .chore-item:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
        transform: translateY(-1px);
      }
      
      .chore-item.overdue {
        border-color: var(--error-color);
        background: rgba(var(--error-color-rgb), 0.05);
      }
      
      .chore-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        gap: 4px;
      }
      
      .chore-name {
        font-weight: 500;
        color: var(--primary-text-color);
        font-size: 1.1em;
      }
      
      .chore-room {
        font-size: 0.9em;
        color: var(--secondary-text-color);
      }
      
      .chore-due {
        font-size: 0.85em;
        color: var(--accent-color);
        font-weight: 500;
      }
      
      .chore-item.overdue .chore-due {
        color: var(--error-color);
      }
      
      .chore-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      
      .chore-actions mwc-button {
        --mdc-button-height: 36px;
        font-size: 0.9em;
      }
      
      .complete-btn {
        --mdc-theme-primary: var(--success-color);
      }
      
      .skip-btn {
        --mdc-theme-primary: var(--warning-color);
      }
      
      .no-chores {
        text-align: center;
        color: var(--secondary-text-color);
        font-style: italic;
        padding: 32px;
        background: var(--card-background-color);
        border: 1px dashed var(--divider-color);
        border-radius: 8px;
      }

      @media (max-width: 600px) {
        .chore-item {
          flex-direction: column;
          align-items: stretch;
          gap: 12px;
        }
        
        .chore-actions {
          justify-content: center;
        }
        
        .stats {
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
        }
      }
    `;
  }
}

customElements.define("simple-chores-card", SimpleChoresCard);

// Register with HACS/custom cards
window.customCards = window.customCards || [];
window.customCards.push({
  type: "simple-chores-card",
  name: "Simple Chores Card",
  description: "A beautiful card for managing simple chores",
  preview: true,
});

console.info(
  `%c SIMPLE-CHORES-CARD %c v1.0.0 `,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);