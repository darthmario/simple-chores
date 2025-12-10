/**
 * Simple Chores Card
 * A custom Lovelace card for managing simple chores
 */

// Try the most direct approach used by working HA cards
let LitElement, html, css;

// Function to initialize when HA is ready
const initCard = () => {
  // Get LitElement from global or existing elements
  if (window.LitElement) {
    LitElement = window.LitElement;
    html = LitElement.prototype.html;
    css = LitElement.prototype.css;
    console.info("Simple Chores Card: Using window.LitElement");
    defineCards();
    return;
  }

  // Try to get from existing HA cards
  const existingCard = customElements.get("ha-card") || 
                      customElements.get("hui-error-card") ||
                      customElements.get("hui-view");
  
  if (existingCard) {
    LitElement = Object.getPrototypeOf(existingCard);
    html = LitElement.prototype.html;
    css = LitElement.prototype.css;
    console.info("Simple Chores Card: Got LitElement from existing card");
    defineCards();
    return;
  }

  // Wait and try again
  console.warn("Simple Chores Card: Waiting for LitElement...");
  setTimeout(initCard, 500);
};

const defineCards = () => {
  if (!LitElement || !html || !css) {
    console.error("Simple Chores Card: Missing required elements");
    return;
  }

class SimpleChoresCard extends LitElement {
  static get properties() {
    return {
      hass: { type: Object },
      config: { type: Object },
      _selectedRoom: { type: String },
      _showAddRoomModal: { type: Boolean },
      _newRoomName: { type: String },
      _newRoomIcon: { type: String },
      _showAddChoreModal: { type: Boolean },
      _newChoreName: { type: String },
      _newChoreRoom: { type: String },
      _newChoreFrequency: { type: String },
    };
  }

  constructor() {
    super();
    this._selectedRoom = "all";
    this._showAddRoomModal = false;
    this._newRoomName = "";
    this._newRoomIcon = "";
    this._showAddChoreModal = false;
    this._newChoreName = "";
    this._newChoreRoom = "";
    this._newChoreFrequency = "daily";
  }

  static getStubConfig() {
    return {
      type: "custom:simple-chores-card",
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
          <div class="header-controls">
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
            <button class="add-room-btn" @click=${this._openAddRoomModal} title="Add Custom Room">
              <ha-icon icon="mdi:home-plus"></ha-icon>
            </button>
            <button class="add-chore-btn" @click=${this._openAddChoreModal} title="Add New Chore">
              <ha-icon icon="mdi:playlist-plus"></ha-icon>
            </button>
          </div>
        </div>
        
        <div class="card-content">
          ${this._renderStats()}
          ${this._renderChoreList(dueToday, "Due Today")}
          ${this._renderChoreList(dueThisWeek, "Due This Week")}
        </div>
        
        ${this._renderAddRoomModal()}
        ${this._renderAddChoreModal()}
      </ha-card>
    `;
  }

  _renderStats() {
    const dueToday = this.hass.states["sensor.chores_due_today"]?.state || "0";
    const overdue = this.hass.states["sensor.overdue_chores"]?.state || "0";
    const total = this.hass.states["sensor.total_chores"]?.state || "0";
    
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
      "sensor.chores_due_today" : 
      "sensor.chores_due_this_week";
    
    return this.hass.states[sensorName]?.attributes?.chores || [];
  }

  _getRooms() {
    if (!this.hass) return [];
    
    // Debug: Check what sensors exist (check all possible naming patterns)
    const simpleChoreSensors = Object.keys(this.hass.states).filter(key => 
      key.startsWith('sensor.simple_chores')
    );
    const householdTaskSensors = Object.keys(this.hass.states).filter(key => 
      key.startsWith('sensor.household_tasks')
    );
    const choresSensors = Object.keys(this.hass.states).filter(key => 
      key.startsWith('sensor.') && (key.includes('chores') || key.includes('overdue'))
    );
    
    console.log("Simple Chores Card: simple_chores sensors:", simpleChoreSensors);
    console.log("Simple Chores Card: household_tasks sensors:", householdTaskSensors);
    console.log("Simple Chores Card: all chores sensors:", choresSensors);
    
    // Debug: Check if we have ANY entities from this integration
    const allHouseholdEntities = Object.keys(this.hass.states).filter(key => 
      key.includes('household_tasks') || key.includes('simple_chores')
    );
    console.log("Simple Chores Card: All integration entities:", allHouseholdEntities);
    
    // Check if calendar has any room data
    const calendar = this.hass.states["calendar.household_tasks"];
    console.log("Simple Chores Card: Calendar entity:", calendar);
    if (calendar && calendar.attributes) {
      console.log("Simple Chores Card: Calendar attributes:", calendar.attributes);
      
      // Check if calendar has room data in attributes
      if (calendar.attributes.rooms) {
        console.log("Simple Chores Card: Found rooms in calendar:", calendar.attributes.rooms);
        return calendar.attributes.rooms;
      }
    }
    
    const allSensors = [...simpleChoreSensors, ...householdTaskSensors];
    
    // Try both possible sensor names for total sensor
    const possibleTotalSensors = [
      "sensor.total_chores",
      "sensor.simple_chores_total",
      "sensor.household_tasks_total"
    ];
    
    for (const sensorName of possibleTotalSensors) {
      const sensor = this.hass.states[sensorName];
      console.log(`Simple Chores Card: Checking ${sensorName}:`, sensor);
      
      if (sensor) {
        console.log(`Simple Chores Card: ${sensorName} attributes:`, sensor.attributes);
        if (sensor.attributes && sensor.attributes.rooms) {
          console.log(`Simple Chores Card: Found rooms in ${sensorName}:`, sensor.attributes.rooms);
          return sensor.attributes.rooms;
        }
      }
    }
    
    // Check each sensor for room data (fallback)
    for (const sensorName of allSensors) {
      const sensor = this.hass.states[sensorName];
      if (sensor && sensor.attributes) {
        console.log(`Simple Chores Card: ${sensorName} attributes:`, sensor.attributes);
        if (sensor.attributes.rooms) {
          console.log(`Simple Chores Card: Found rooms in ${sensorName}:`, sensor.attributes.rooms);
          return sensor.attributes.rooms;
        }
      }
    }
    
    console.log("Simple Chores Card: No rooms found in any sensor, falling back to HA areas");
    
    // Fallback: Get just Home Assistant areas if sensor data not available
    const areas = Object.values(this.hass.areas || {}).map(area => ({
      id: `area_${area.area_id}`,  // Match the coordinator's room ID format
      name: area.name || area.area_id
    }));
    
    console.log("Simple Chores Card: HA areas fallback:", areas);
    return areas;
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

  _openAddRoomModal() {
    this._showAddRoomModal = true;
    this._newRoomName = "";
    this._newRoomIcon = "mdi:home";
  }

  _closeAddRoomModal() {
    this._showAddRoomModal = false;
    this._newRoomName = "";
    this._newRoomIcon = "";
  }

  _handleRoomNameInput(e) {
    this._newRoomName = e.target.value;
  }

  _handleRoomIconInput(e) {
    this._newRoomIcon = e.target.value;
  }

  _submitAddRoom() {
    if (!this._newRoomName.trim()) {
      this._showToast("Room name is required");
      return;
    }

    // Check for duplicate room names
    const roomName = this._newRoomName.trim();
    const existingRooms = this._getRooms();
    
    console.log("Simple Chores Card: Current rooms:", existingRooms);
    console.log("Simple Chores Card: Trying to create room:", roomName);
    
    const duplicateRoom = existingRooms.find(room => 
      room.name.toLowerCase() === roomName.toLowerCase()
    );

    if (duplicateRoom) {
      this._showToast(`A room named "${roomName}" already exists`);
      return;
    }

    console.log("Simple Chores Card: Calling add_room service with:", {
      name: roomName,
      icon: this._newRoomIcon || "mdi:home"
    });

    this.hass.callService("simple_chores", "add_room", {
      name: roomName,
      icon: this._newRoomIcon || "mdi:home"
    }).then((result) => {
      console.log("Simple Chores Card: Service call succeeded:", result);
      
      // Wait and check if the room data updates
      const checkForRoom = (attempts = 0) => {
        setTimeout(() => {
          const roomsAfter = this._getRooms();
          const foundNewRoom = roomsAfter.find(room => 
            room.name.toLowerCase() === roomName.toLowerCase()
          );
          
          console.log(`Simple Chores Card: Attempt ${attempts + 1} - Rooms count: ${roomsAfter.length}, Found new room:`, foundNewRoom);
          
          if (foundNewRoom) {
            console.log("Simple Chores Card: New room found in data!");
            this._showToast(`Room "${roomName}" created successfully!`);
            this._closeAddRoomModal();
            this.requestUpdate();
          } else if (attempts < 10) {
            // Try again, up to 10 attempts (5 seconds total)
            checkForRoom(attempts + 1);
          } else {
            console.warn("Simple Chores Card: Room not found after 10 attempts");
            this._showToast(`Room "${roomName}" created, but may require a page refresh to appear`);
            this._closeAddRoomModal();
            this.requestUpdate();
          }
        }, 500);
      };
      
      checkForRoom();
    }).catch(error => {
      console.error("Simple Chores Card: Service call failed:", error);
      this._showToast(`Error creating room: ${error.message}`);
    });
  }

  _renderAddRoomModal() {
    if (!this._showAddRoomModal) {
      return html``;
    }

    return html`
      <div class="modal-overlay" @click=${this._closeAddRoomModal}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>Add Custom Room</h3>
            <button class="close-btn" @click=${this._closeAddRoomModal}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="room-name">Room Name *</label>
              <input 
                id="room-name"
                type="text" 
                .value=${this._newRoomName}
                @input=${this._handleRoomNameInput}
                placeholder="Enter room name..."
                maxlength="50"
              />
            </div>
            <div class="form-group">
              <label for="room-icon">Icon (optional)</label>
              <input 
                id="room-icon"
                type="text" 
                .value=${this._newRoomIcon}
                @input=${this._handleRoomIconInput}
                placeholder="mdi:home"
              />
              <small>Use MDI icon names like: mdi:bed, mdi:sofa, mdi:car, etc.</small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeAddRoomModal}>Cancel</button>
            <button class="submit-btn" @click=${this._submitAddRoom} ?disabled=${!this._newRoomName.trim()}>
              Create Room
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _openAddChoreModal() {
    this._showAddChoreModal = true;
    this._newChoreName = "";
    this._newChoreRoom = "";
    this._newChoreFrequency = "daily";
  }

  _closeAddChoreModal() {
    this._showAddChoreModal = false;
    this._newChoreName = "";
    this._newChoreRoom = "";
    this._newChoreFrequency = "daily";
  }

  _handleChoreNameInput(e) {
    this._newChoreName = e.target.value;
  }

  _handleChoreRoomInput(e) {
    this._newChoreRoom = e.target.value;
  }

  _handleChoreFrequencyInput(e) {
    this._newChoreFrequency = e.target.value;
  }


  _submitAddChore() {
    if (!this._newChoreName.trim()) {
      this._showToast("Chore name is required");
      return;
    }

    if (!this._newChoreRoom.trim()) {
      this._showToast("Please select a room");
      return;
    }

    this.hass.callService("simple_chores", "add_chore", {
      name: this._newChoreName.trim(),
      room_id: this._newChoreRoom,
      frequency: this._newChoreFrequency
    }).then(() => {
      this._showToast(`Chore "${this._newChoreName}" created successfully!`);
      this._closeAddChoreModal();
      // Force a refresh of the card data
      this.requestUpdate();
    }).catch(error => {
      this._showToast(`Error creating chore: ${error.message}`);
    });
  }

  _renderAddChoreModal() {
    if (!this._showAddChoreModal) {
      return html``;
    }

    const rooms = this._getRooms();

    return html`
      <div class="modal-overlay" @click=${this._closeAddChoreModal}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>Add New Chore</h3>
            <button class="close-btn" @click=${this._closeAddChoreModal}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="chore-name">Chore Name *</label>
              <input 
                id="chore-name"
                type="text" 
                .value=${this._newChoreName}
                @input=${this._handleChoreNameInput}
                placeholder="Enter chore name..."
                maxlength="100"
              />
            </div>
            <div class="form-group">
              <label for="chore-room">Room *</label>
              <select 
                id="chore-room"
                .value=${this._newChoreRoom}
                @change=${this._handleChoreRoomInput}
              >
                <option value="">Select a room...</option>
                ${rooms.map(room => html`
                  <option value=${room.id}>
                    ${room.name}
                  </option>
                `)}
              </select>
            </div>
            <div class="form-group">
              <label for="chore-frequency">Frequency *</label>
              <select 
                id="chore-frequency"
                .value=${this._newChoreFrequency}
                @change=${this._handleChoreFrequencyInput}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeAddChoreModal}>Cancel</button>
            <button class="submit-btn" @click=${this._submitAddChore} 
                    ?disabled=${!this._newChoreName.trim() || !this._newChoreRoom.trim()}>
              Create Chore
            </button>
          </div>
        </div>
      </div>
    `;
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
      
      .header-controls {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      
      .add-room-btn, .add-chore-btn {
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--text-primary-color);
        cursor: pointer;
        transition: background-color 0.2s;
      }
      
      .add-room-btn:hover, .add-chore-btn:hover {
        background: rgba(255, 255, 255, 0.3);
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

      /* Modal Styles */
      .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        z-index: 999;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
      }
      
      .modal-content {
        background: var(--card-background-color);
        border-radius: 12px;
        max-width: 400px;
        width: 100%;
        max-height: 80vh;
        overflow: auto;
        box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      }
      
      .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 20px 20px 0 20px;
        border-bottom: 1px solid var(--divider-color);
        padding-bottom: 16px;
        margin-bottom: 20px;
      }
      
      .modal-header h3 {
        margin: 0;
        color: var(--primary-text-color);
        font-size: 1.2em;
        font-weight: 500;
      }
      
      .close-btn {
        background: none;
        border: none;
        color: var(--secondary-text-color);
        cursor: pointer;
        border-radius: 50%;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
      }
      
      .close-btn:hover {
        background: var(--secondary-background-color);
      }
      
      .modal-body {
        padding: 0 20px 20px 20px;
      }
      
      .form-group {
        margin-bottom: 20px;
      }
      
      .form-group label {
        display: block;
        margin-bottom: 8px;
        color: var(--primary-text-color);
        font-weight: 500;
        font-size: 14px;
      }
      
      .form-group input, .form-group select, .form-group textarea {
        width: 100%;
        padding: 12px;
        border: 2px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
        box-sizing: border-box;
        transition: border-color 0.2s;
        font-family: inherit;
      }
      
      .form-group input:focus, .form-group select:focus, .form-group textarea:focus {
        outline: none;
        border-color: var(--primary-color);
      }
      
      .form-group textarea {
        resize: vertical;
        min-height: 80px;
      }
      
      .form-group select {
        cursor: pointer;
      }
      
      .form-group small {
        display: block;
        margin-top: 4px;
        color: var(--secondary-text-color);
        font-size: 12px;
      }
      
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        padding: 20px;
        border-top: 1px solid var(--divider-color);
      }
      
      .cancel-btn, .submit-btn {
        padding: 10px 20px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s;
      }
      
      .cancel-btn {
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
      }
      
      .cancel-btn:hover {
        background: var(--divider-color);
      }
      
      .submit-btn {
        background: var(--primary-color);
        color: white;
      }
      
      .submit-btn:hover:not(:disabled) {
        background: var(--dark-primary-color);
      }
      
      .submit-btn:disabled {
        background: var(--disabled-text-color);
        cursor: not-allowed;
        opacity: 0.6;
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
        
        .modal-overlay {
          padding: 10px;
        }
        
        .modal-content {
          max-width: none;
          width: 100%;
        }
      }
    `;
  }
}

// Card Editor for visual picker
class SimpleChoresCardEditor extends LitElement {
  setConfig(config) {
    this._config = config;
  }

  static get properties() {
    return {
      hass: { type: Object },
      _config: { type: Object },
    };
  }

  get _show_completed() {
    return this._config?.show_completed || false;
  }

  get _default_room() {
    return this._config?.default_room || "all";
  }

  render() {
    if (!this.hass) {
      return html``;
    }

    return html`
      <div class="card-config">
        <div class="option">
          <ha-formfield label="Show completed chores">
            <ha-checkbox
              .checked=${this._show_completed}
              .configValue=${"show_completed"}
              @change=${this._valueChanged}
            ></ha-checkbox>
          </ha-formfield>
        </div>
        <div class="option">
          <paper-dropdown-menu
            label="Default room filter"
            .configValue=${"default_room"}
            @value-changed=${this._valueChanged}
          >
            <paper-listbox
              slot="dropdown-content"
              .selected=${["all"].indexOf(this._default_room)}
            >
              <paper-item>All Rooms</paper-item>
            </paper-listbox>
          </paper-dropdown-menu>
        </div>
        <div class="info">
          <p>
            <strong>Simple Chores Card</strong><br>
            A beautiful card for managing your household chores with room filtering,
            completion tracking, and modern design.
          </p>
        </div>
      </div>
    `;
  }

  _valueChanged(ev) {
    if (!this._config || !this.hass) {
      return;
    }
    const target = ev.target;
    const configValue = target.configValue;
    
    if (this[`_${configValue}`] === target.value) {
      return;
    }
    
    if (target.configValue) {
      if (target.value === "" || target.value == null) {
        this._config = { ...this._config };
        delete this._config[target.configValue];
      } else {
        this._config = {
          ...this._config,
          [target.configValue]: target.checked !== undefined ? target.checked : target.value,
        };
      }
    }
    
    const event = new CustomEvent("config-changed", {
      detail: { config: this._config },
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
      .option {
        margin-bottom: 16px;
      }
      .info {
        margin-top: 24px;
        padding: 16px;
        background: var(--secondary-background-color);
        border-radius: 8px;
        border-left: 4px solid var(--primary-color);
      }
      .info p {
        margin: 0;
        color: var(--primary-text-color);
      }
      .info strong {
        color: var(--primary-color);
      }
    `;
  }
}

  // Register the custom elements
  customElements.define("simple-chores-card", SimpleChoresCard);
  customElements.define("simple-chores-card-editor", SimpleChoresCardEditor);
  
  console.info("Simple Chores Card: Successfully registered!");
};

// Start initialization
initCard();

// Wait for customCards to be available and register
(function() {
  const registerCard = () => {
    // Register with custom card picker - this makes it show up in the visual picker
    window.customCards = window.customCards || [];
    window.customCards.push({
      type: "simple-chores-card",
      name: "Simple Chores Card", 
      description: "Manage household chores with room organization and completion tracking",
      preview: true, // This enables preview in card picker
      documentationURL: "https://github.com/darthmario/simple-chores",
    });

    // Also register in the legacy format for broader compatibility  
    if (!window.customCardsRegistry) {
      window.customCardsRegistry = {};
    }
    window.customCardsRegistry["simple-chores-card"] = {
      type: "simple-chores-card",
      name: "Simple Chores Card",
      description: "Manage household chores with room organization and completion tracking",
      preview: true,
    };

    // Register in HA card registry for visual picker
    if (window.customElements && window.customElements.whenDefined) {
      window.customElements.whenDefined('simple-chores-card').then(() => {
        const event = new Event('ll-rebuild', { bubbles: true, composed: true });
        document.dispatchEvent(event);
      });
    }

    console.info("Simple Chores Card registered for visual picker");
  };

  // Register immediately and also after DOM is ready
  registerCard();
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', registerCard);
  }
})();

console.info(
  `%c SIMPLE-CHORES-CARD %c v1.0.0 `,
  "color: orange; font-weight: bold; background: black",
  "color: white; font-weight: bold; background: dimgray"
);