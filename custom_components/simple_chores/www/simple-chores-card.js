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
      _showManageRoomsModal: { type: Boolean },
      _showAddChoreModal: { type: Boolean },
      _newChoreName: { type: String },
      _newChoreRoom: { type: String },
      _newChoreFrequency: { type: String },
      _newChoreDueDate: { type: String },
      _showEditChoreModal: { type: Boolean },
      _editChoreId: { type: String },
      _editChoreName: { type: String },
      _editChoreRoom: { type: String },
      _editChoreFrequency: { type: String },
      _editChoreDueDate: { type: String },
      _showAllChoresModal: { type: Boolean },
      _showHistoryModal: { type: Boolean },
    };
  }

  constructor() {
    super();
    this._selectedRoom = "all";
    this._showAddRoomModal = false;
    this._newRoomName = "";
    this._newRoomIcon = "";
    this._showManageRoomsModal = false;
    this._showAddChoreModal = false;
    this._newChoreName = "";
    this._newChoreRoom = "";
    this._newChoreFrequency = "daily";
    this._newChoreDueDate = "";
    this._showEditChoreModal = false;
    this._editChoreId = "";
    this._editChoreName = "";
    this._editChoreRoom = "";
    this._editChoreFrequency = "daily";
    this._editChoreDueDate = "";
    this._showAllChoresModal = false;
    this._showHistoryModal = false;
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
          <div class="card-title">Simple Chores</div>
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
            <button class="manage-rooms-btn" @click=${this._openManageRoomsModal} title="Manage Rooms">
              <ha-icon icon="mdi:cog"></ha-icon>
            </button>
            <button class="history-btn" @click=${this._openHistoryModal} title="View Completion History">
              <ha-icon icon="mdi:history"></ha-icon>
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
        ${this._renderManageRoomsModal()}
        ${this._renderAddChoreModal()}
        ${this._renderEditChoreModal()}
        ${this._renderAllChoresModal()}
        ${this._renderHistoryModal()}
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
        <div class="stat clickable" @click=${this._openAllChoresModal} title="View and manage all active chores">
          <span class="stat-value">${total}</span>
          <span class="stat-label">Active Chores</span>
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
    console.debug("Simple Chores Card: Rendering chore:", chore);
    
    // Handle different property names from different data sources
    const dueDate = chore.next_due || chore.due_date || chore.date;
    
    // For room name, try multiple property names in order
    let roomName = chore.room_name || chore.room || 'Unknown Room';
    
    // If we have room_id but no room_name, try to resolve it from rooms data
    if ((!chore.room_name || chore.room_name === 'Unknown') && chore.room_id) {
      const rooms = this._getRooms();
      const matchingRoom = rooms.find(r => r.id === chore.room_id || r.name === chore.room_id);
      if (matchingRoom) {
        roomName = matchingRoom.name;
      }
    }
    
    const isOverdue = new Date(dueDate) < new Date().setHours(0,0,0,0);
    
    return html`
      <div class="chore-item ${isOverdue ? 'overdue' : ''}">
        <div class="chore-info">
          <span class="chore-name">${chore.name}</span>
          <span class="chore-separator">•</span>
          <span class="chore-room">${roomName}</span>
          <span class="chore-separator">•</span>
          <span class="chore-due">Due: ${this._formatDate(dueDate)}</span>
        </div>
        <div class="chore-actions">
          <button 
            @click=${() => this._editChore(chore)}
            class="action-btn edit-btn"
            title="Edit Chore"
          >
            ✏️ Edit
          </button>
          <button 
            @click=${() => this._deleteChore(chore.id, chore.name)}
            class="action-btn delete-btn"
            title="Delete Chore"
          >
            🗑️ Delete
          </button>
          <button 
            @click=${() => this._completeChore(chore.id)}
            class="action-btn complete-btn"
          >
            ✓ Complete
          </button>
          <button 
            @click=${() => this._skipChore(chore.id)} 
            class="action-btn skip-btn"
          >
            ⏭ Skip
          </button>
        </div>
      </div>
    `;
  }

  _getDueChores(period) {
    if (!this.hass) return [];
    
    const sensorName = period === "today" ? 
      "sensor.chores_due_today" : 
      "sensor.chores_due_this_week";
    
    const chores = this.hass.states[sensorName]?.attributes?.chores || [];
    
    // Debug log to see what we're getting
    console.log(`Simple Chores Card: ${sensorName} raw chores:`, chores);
    
    // Process chores to ensure proper date formatting and properties
    const processedChores = chores.map(chore => {
      // Ensure we have the right property names
      const processedChore = {
        ...chore,
        id: chore.id || chore.chore_id,
        name: chore.name || chore.chore_name,
        room_id: chore.room_id || chore.room,
        room_name: chore.room_name || chore.room, // Use room as fallback for room_name
        next_due: chore.next_due || chore.due_date || chore.date || new Date().toISOString().split('T')[0],
        due_date: chore.next_due || chore.due_date || chore.date || new Date().toISOString().split('T')[0],
        frequency: chore.frequency
      };
      
      // If this chore is in "due today", and we don't have a specific date, assume today
      if (sensorName === "sensor.chores_due_today" && !processedChore.next_due) {
        processedChore.next_due = new Date().toISOString().split('T')[0];
        processedChore.due_date = new Date().toISOString().split('T')[0];
      }
      
      // Debug log for each chore
      console.log(`Simple Chores Card: Processed chore from ${sensorName}:`, processedChore);
      
      return processedChore;
    });
    
    return processedChores;
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
    return chores.filter(chore => {
      // Handle different property names - check both room_id and room
      return chore.room_id === this._selectedRoom || chore.room === this._selectedRoom;
    });
  }

  _formatDate(dateStr) {
    if (!dateStr) return "No Date";
    
    // Handle ISO date format (YYYY-MM-DD)
    let date;
    if (typeof dateStr === 'string' && dateStr.match(/^\d{4}-\d{2}-\d{2}$/)) {
      // ISO date string, create date in local timezone
      const parts = dateStr.split('-');
      date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    } else {
      date = new Date(dateStr);
    }
    
    // Check if date is valid
    if (isNaN(date.getTime())) {
      console.warn("Simple Chores Card: Invalid date:", dateStr);
      return "Invalid Date";
    }
    
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

  _openManageRoomsModal() {
    this._showManageRoomsModal = true;
  }

  _closeManageRoomsModal() {
    this._showManageRoomsModal = false;
  }

  async _deleteRoom(roomId, roomName) {
    if (!confirm(`Are you sure you want to delete the room "${roomName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await this.hass.callService("simple_chores", "remove_room", {
        room_id: roomId
      });
      
      this._showToast(`Room "${roomName}" deleted successfully!`);
      this.requestUpdate();
    } catch (error) {
      console.error("Simple Chores Card: Failed to delete room:", error);
      this._showToast(`Error deleting room: ${error.message}`);
    }
  }

  _renderManageRoomsModal() {
    if (!this._showManageRoomsModal) {
      return html``;
    }

    const rooms = this._getRooms();
    const customRooms = rooms.filter(room => room.is_custom);

    return html`
      <div class="modal-overlay" @click=${this._closeManageRoomsModal}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>Manage Custom Rooms</h3>
            <button class="close-btn" @click=${this._closeManageRoomsModal}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            ${customRooms.length === 0 ? html`
              <p class="no-custom-rooms">No custom rooms found. Use the + button to add rooms.</p>
            ` : html`
              <div class="room-list">
                ${customRooms.map(room => html`
                  <div class="room-item">
                    <div class="room-info">
                      <ha-icon icon="${room.icon || 'mdi:home'}"></ha-icon>
                      <span class="room-name">${room.name}</span>
                    </div>
                    <button 
                      class="delete-room-btn" 
                      @click=${() => this._deleteRoom(room.id, room.name)}
                      title="Delete Room"
                    >
                      <ha-icon icon="mdi:delete"></ha-icon>
                    </button>
                  </div>
                `)}
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeManageRoomsModal}>Close</button>
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
    this._newChoreDueDate = "";
  }

  _closeAddChoreModal() {
    this._showAddChoreModal = false;
    this._newChoreName = "";
    this._newChoreRoom = "";
    this._newChoreFrequency = "daily";
    this._newChoreDueDate = "";
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

  _handleChoreDueDateInput(e) {
    this._newChoreDueDate = e.target.value;
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

    // Prepare service call data
    const serviceData = {
      name: this._newChoreName.trim(),
      room_id: this._newChoreRoom,
      frequency: this._newChoreFrequency
    };

    // Add start_date if provided
    if (this._newChoreDueDate.trim()) {
      serviceData.start_date = this._newChoreDueDate.trim();
    }

    this.hass.callService("simple_chores", "add_chore", serviceData).then(() => {
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
            <div class="form-group">
              <label for="chore-due-date">Due Date (optional)</label>
              <input 
                id="chore-due-date"
                type="date" 
                .value=${this._newChoreDueDate}
                @input=${this._handleChoreDueDateInput}
                title="Leave empty to start today"
              />
              <small>Leave empty to start today, or select a future date</small>
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

  _editChore(chore) {
    console.debug("Simple Chores Card: Editing chore:", chore);
    
    // Open edit modal with chore data
    this._editChoreId = chore.id;
    this._editChoreName = chore.name;
    
    // Handle different property names for room_id
    this._editChoreRoom = chore.room_id || chore.room || "";
    this._editChoreFrequency = chore.frequency || "daily";
    
    // Handle different property names for due date
    this._editChoreDueDate = chore.next_due || chore.due_date || "";
    
    console.debug("Simple Chores Card: Set edit room to:", this._editChoreRoom);
    console.debug("Simple Chores Card: Set edit due date to:", this._editChoreDueDate);
    
    // Force a re-render with the new data before showing the modal
    this.requestUpdate().then(() => {
      this._showEditChoreModal = true;
      // Try to force update the select element after modal is shown
      setTimeout(() => {
        const roomSelect = this.shadowRoot?.querySelector('#edit-chore-room');
        if (roomSelect) {
          roomSelect.value = this._editChoreRoom;
          console.debug("Simple Chores Card: Manually set room select value:", roomSelect.value);
        }
      }, 100);
    });
  }

  _closeEditChoreModal() {
    this._showEditChoreModal = false;
    this._editChoreId = "";
    this._editChoreName = "";
    this._editChoreRoom = "";
    this._editChoreFrequency = "daily";
    this._editChoreDueDate = "";
  }

  _handleEditChoreNameInput(e) {
    this._editChoreName = e.target.value;
  }

  _handleEditChoreRoomInput(e) {
    this._editChoreRoom = e.target.value;
  }

  _handleEditChoreFrequencyInput(e) {
    this._editChoreFrequency = e.target.value;
  }

  _handleEditChoreDueDateInput(e) {
    this._editChoreDueDate = e.target.value;
  }

  _submitEditChore() {
    if (!this._editChoreName.trim()) {
      this._showToast("Chore name is required");
      return;
    }

    if (!this._editChoreRoom.trim()) {
      this._showToast("Please select a room");
      return;
    }

    const serviceData = {
      chore_id: this._editChoreId,
      name: this._editChoreName.trim(),
      room_id: this._editChoreRoom,
      frequency: this._editChoreFrequency
    };
    
    // Only include next_due if a date is provided
    if (this._editChoreDueDate.trim()) {
      serviceData.next_due = this._editChoreDueDate;
    }

    this.hass.callService("simple_chores", "update_chore", serviceData).then(() => {
      this._showToast(`Chore "${this._editChoreName}" updated successfully!`);
      this._closeEditChoreModal();
      this.requestUpdate();
    }).catch(error => {
      this._showToast(`Error updating chore: ${error.message}`);
    });
  }

  _renderEditChoreModal() {
    if (!this._showEditChoreModal) {
      return html``;
    }

    const rooms = this._getRooms();

    return html`
      <div class="modal-overlay" @click=${this._closeEditChoreModal}>
        <div class="modal-content" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>Edit Chore</h3>
            <button class="close-btn" @click=${this._closeEditChoreModal}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="edit-chore-name">Chore Name *</label>
              <input 
                id="edit-chore-name"
                type="text" 
                .value=${this._editChoreName}
                @input=${this._handleEditChoreNameInput}
                placeholder="Enter chore name..."
                maxlength="100"
              />
            </div>
            <div class="form-group">
              <label for="edit-chore-room">Room *</label>
              <select 
                id="edit-chore-room"
                .value=${this._editChoreRoom}
                @change=${this._handleEditChoreRoomInput}
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
              <label for="edit-chore-frequency">Frequency *</label>
              <select 
                id="edit-chore-frequency"
                .value=${this._editChoreFrequency}
                @change=${this._handleEditChoreFrequencyInput}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div class="form-group">
              <label for="edit-chore-due-date">Due Date</label>
              <input 
                id="edit-chore-due-date"
                type="date" 
                .value=${this._editChoreDueDate}
                @input=${this._handleEditChoreDueDateInput}
              />
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeEditChoreModal}>Cancel</button>
            <button class="submit-btn" @click=${this._submitEditChore} 
                    ?disabled=${!this._editChoreName.trim() || !this._editChoreRoom.trim()}>
              Update Chore
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async _deleteChore(choreId, choreName) {
    if (!confirm(`Are you sure you want to delete the chore "${choreName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      await this.hass.callService("simple_chores", "remove_chore", {
        chore_id: choreId
      });
      
      this._showToast(`Chore "${choreName}" deleted successfully!`);
      this.requestUpdate();
    } catch (error) {
      console.error("Simple Chores Card: Failed to delete chore:", error);
      this._showToast(`Error deleting chore: ${error.message}`);
    }
  }

  _openAllChoresModal() {
    this._showAllChoresModal = true;
  }

  _closeAllChoresModal() {
    this._showAllChoresModal = false;
  }

  _getAllChores() {
    // Use the enhanced total_chores sensor which now includes all chore data
    const totalChoresSensor = this.hass.states["sensor.total_chores"];
    
    if (totalChoresSensor && totalChoresSensor.attributes && totalChoresSensor.attributes.chores) {
      console.log("Simple Chores Card: Found all chores in sensor.total_chores:", totalChoresSensor.attributes.chores);
      return totalChoresSensor.attributes.chores;
    }
    
    // Fallback: try the due chores if the sensor isn't available yet
    console.log("Simple Chores Card: sensor.total_chores not available, using fallback...");
    const dueToday = this._getDueChores("today");
    const dueThisWeek = this._getDueChores("week");
    
    const fallbackChores = [...dueToday, ...dueThisWeek];
    console.log("Simple Chores Card: Using fallback chores:", fallbackChores.length);
    
    return fallbackChores;
  }

  _renderAllChoresModal() {
    if (!this._showAllChoresModal) {
      return html``;
    }

    const allChores = this._getAllChores();
    const rooms = this._getRooms();

    return html`
      <div class="modal-overlay" @click=${this._closeAllChoresModal}>
        <div class="modal-content large-modal" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>All Active Chores (${allChores.length})</h3>
            <button class="close-btn" @click=${this._closeAllChoresModal}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            ${allChores.length === 0 ? html`
              <div class="no-chores">
                <p>No active chores found.</p>
                <p>Create your first chore using the + button in the header!</p>
              </div>
            ` : html`
              <div class="all-chores-list">
                ${allChores.map(chore => {
                  const dueDate = chore.next_due || chore.due_date;
                  const roomName = chore.room_name || chore.room || this._getRoomName(chore.room_id || chore.room, rooms) || 'Unknown Room';
                  const isOverdue = new Date(dueDate) < new Date().setHours(0,0,0,0);
                  
                  return html`
                    <div class="chore-item ${isOverdue ? 'overdue' : ''}">
                      <div class="chore-info">
                        <span class="chore-name">${chore.name}</span>
                        <span class="chore-separator">•</span>
                        <span class="chore-room">${roomName}</span>
                        <span class="chore-separator">•</span>
                        <span class="chore-due">Due: ${this._formatDate(dueDate)}</span>
                        <span class="chore-separator">•</span>
                        <span class="chore-frequency">${chore.frequency || 'Unknown'}</span>
                      </div>
                      <div class="chore-actions">
                        <button 
                          @click=${() => this._editChoreFromModal(chore)}
                          class="action-btn edit-btn"
                          title="Edit Chore"
                        >
                          ✏️ Edit
                        </button>
                        <button 
                          @click=${() => this._deleteChoreFromModal(chore.id, chore.name)}
                          class="action-btn delete-btn"
                          title="Delete Chore"
                        >
                          🗑️ Delete
                        </button>
                        <button 
                          @click=${() => this._completeChoreFromModal(chore.id)}
                          class="action-btn complete-btn"
                        >
                          ✓ Complete
                        </button>
                        <button 
                          @click=${() => this._skipChoreFromModal(chore.id)} 
                          class="action-btn skip-btn"
                        >
                          ⏭ Skip
                        </button>
                      </div>
                    </div>
                  `;
                })}
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="submit-btn" @click=${this._closeAllChoresModal}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  _getRoomName(roomId, rooms) {
    const room = rooms.find(r => r.id === roomId);
    return room ? room.name : 'Unknown Room';
  }

  // Modal action methods that close the all chores modal before performing actions
  _editChoreFromModal(chore) {
    console.log("Simple Chores Card: Edit chore from modal:", chore);
    
    // First populate the edit modal data
    this._editChoreId = chore.id;
    this._editChoreName = chore.name;
    
    // Handle different property names for room_id
    this._editChoreRoom = chore.room_id || chore.room || "";
    this._editChoreFrequency = chore.frequency || "daily";
    
    // Handle different property names for due date
    this._editChoreDueDate = chore.next_due || chore.due_date || "";
    
    console.log("Simple Chores Card: Set edit data - room:", this._editChoreRoom, "due:", this._editChoreDueDate);
    
    // Close all chores modal and open edit modal
    this._closeAllChoresModal();
    
    // Use setTimeout to ensure the close happens first
    setTimeout(() => {
      this._showEditChoreModal = true;
      this.requestUpdate();
    }, 50);
  }

  async _deleteChoreFromModal(choreId, choreName) {
    this._closeAllChoresModal();
    await this._deleteChore(choreId, choreName);
  }

  async _completeChoreFromModal(choreId) {
    this._closeAllChoresModal();
    await this._completeChore(choreId);
  }

  async _skipChoreFromModal(choreId) {
    this._closeAllChoresModal();
    await this._skipChore(choreId);
  }

  _openHistoryModal() {
    this._showHistoryModal = true;
  }

  _closeHistoryModal() {
    this._showHistoryModal = false;
  }

  async _getCompletionHistory() {
    try {
      // Get completion history from the total_chores sensor
      const totalChoresSensor = this.hass.states["sensor.simple_chores_total"];
      
      if (totalChoresSensor && totalChoresSensor.attributes && totalChoresSensor.attributes.completion_history) {
        const history = totalChoresSensor.attributes.completion_history;
        console.log("Simple Chores Card: Found completion history:", history);
        
        // Sort by completion date (newest first)
        return history.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
      }
      
      console.log("Simple Chores Card: No completion history found in sensor.simple_chores_total");
      return [];
      
    } catch (error) {
      console.error("Simple Chores Card: Failed to get completion history:", error);
      this._showToast("Error loading completion history");
      return [];
    }
  }

  _formatDateTime(dateTimeString) {
    if (!dateTimeString) return "Unknown Date";
    
    try {
      const date = new Date(dateTimeString);
      if (isNaN(date.getTime())) return "Invalid Date";
      
      return date.toLocaleString();
    } catch (e) {
      return "Invalid Date";
    }
  }

  _renderHistoryModal() {
    if (!this._showHistoryModal) {
      return html``;
    }

    return html`
      <div class="modal-overlay" @click=${this._closeHistoryModal}>
        <div class="modal-content large-modal" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3>Completion History</h3>
            <button class="close-btn" @click=${this._closeHistoryModal}>
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            ${this._renderHistoryContent()}
          </div>
          <div class="modal-footer">
            <button class="submit-btn" @click=${this._closeHistoryModal}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderHistoryContent() {
    return html`
      <div class="history-loading">
        <p>Loading completion history...</p>
        <p><em>Click the refresh button below to load history data.</em></p>
        <button class="submit-btn" @click=${this._loadHistory}>Load History</button>
        <div id="history-list"></div>
      </div>
    `;
  }

  async _loadHistory() {
    const historyContainer = this.shadowRoot?.querySelector('#history-list');
    if (!historyContainer) return;

    historyContainer.innerHTML = '<p>Loading...</p>';
    
    try {
      const history = await this._getCompletionHistory();
      
      if (history.length === 0) {
        historyContainer.innerHTML = `
          <div class="no-history">
            <p><strong>No completion history found.</strong></p>
            <p>History will appear here after you complete some chores!</p>
            <p><em>Note: Only recent completions may be available depending on system configuration.</em></p>
          </div>
        `;
        return;
      }

      const historyHtml = history.map(entry => {
        return `
          <div class="history-item">
            <div class="history-info">
              <span class="history-chore-name">${entry.chore_name || 'Unknown Chore'}</span>
              <span class="history-separator">•</span>
              <span class="history-completed-by">${entry.completed_by_name || 'Unknown User'}</span>
              <span class="history-separator">•</span>
              <span class="history-completed-at">${this._formatDateTime(entry.completed_at)}</span>
            </div>
          </div>
        `;
      }).join('');

      historyContainer.innerHTML = `
        <div class="history-header">
          <h4>Recent Completions (${history.length})</h4>
        </div>
        <div class="history-list">
          ${historyHtml}
        </div>
      `;

    } catch (error) {
      console.error("Simple Chores Card: Error loading history:", error);
      historyContainer.innerHTML = `
        <div class="history-error">
          <p><strong>Error loading completion history.</strong></p>
          <p>This feature requires the Simple Chores integration to store completion history.</p>
          <p><em>Try completing a chore first, then check back here.</em></p>
        </div>
      `;
    }
  }

  static get styles() {
    return css`
      :host {
        display: block;
      }
      
      .card-header {
        padding: 16px;
        border-bottom: 1px solid var(--divider-color);
        background: var(--primary-color);
        color: var(--text-primary-color);
      }
      
      .card-title {
        font-size: 1.4em;
        font-weight: 500;
        margin-bottom: 12px;
        text-align: center;
      }
      
      .header-controls {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        flex-wrap: wrap;
      }
      
      .add-room-btn, .add-chore-btn, .manage-rooms-btn, .history-btn {
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
      
      .add-room-btn:hover, .add-chore-btn:hover, .manage-rooms-btn:hover, .history-btn:hover {
        background: rgba(255, 255, 255, 0.3);
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
      
      .stat.clickable {
        cursor: pointer;
        border: 2px solid var(--primary-color);
        background: rgba(var(--primary-color-rgb), 0.1);
      }
      
      .stat.clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        border-color: var(--primary-color);
        background: rgba(var(--primary-color-rgb), 0.15);
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
        flex-direction: column;
        padding: 16px;
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 8px;
        transition: all 0.2s ease;
        gap: 12px;
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
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .chore-name {
        font-weight: 500;
        color: var(--primary-text-color);
        font-size: 1.1em;
      }
      
      .chore-separator {
        color: var(--secondary-text-color);
        font-weight: bold;
      }
      
      .chore-room {
        font-size: 0.9em;
        color: var(--secondary-text-color);
      }
      
      .chore-due {
        font-size: 0.9em;
        color: var(--accent-color);
        font-weight: 500;
      }
      
      .chore-item.overdue .chore-due {
        color: var(--error-color);
      }
      
      .chore-actions {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      
      .chore-actions mwc-button {
        --mdc-button-height: 36px;
        font-size: 0.9em;
      }
      
      .action-btn {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.85em;
        cursor: pointer;
        transition: all 0.2s;
        white-space: nowrap;
      }
      
      .action-btn:hover {
        background: var(--secondary-background-color);
        border-color: var(--primary-color);
      }
      
      .action-btn.complete-btn {
        background: var(--success-color);
        color: white;
        border-color: var(--success-color);
      }
      
      .action-btn.complete-btn:hover {
        background: var(--success-color);
        opacity: 0.9;
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
      
      .modal-content.large-modal {
        max-width: 800px;
        width: 90%;
        max-height: 90vh;
      }
      
      .all-chores-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 60vh;
        overflow-y: auto;
      }
      
      /* History Styles */
      .history-loading {
        text-align: center;
        padding: 20px;
      }
      
      .history-header h4 {
        margin: 0 0 16px 0;
        color: var(--primary-text-color);
        border-bottom: 2px solid var(--primary-color);
        padding-bottom: 8px;
      }
      
      .history-list {
        max-height: 50vh;
        overflow-y: auto;
      }
      
      .history-item {
        padding: 12px 16px;
        border-bottom: 1px solid var(--divider-color);
        transition: background-color 0.2s;
      }
      
      .history-item:hover {
        background-color: rgba(var(--primary-color-rgb), 0.05);
      }
      
      .history-item:last-child {
        border-bottom: none;
      }
      
      .history-info {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
      }
      
      .history-chore-name {
        font-weight: 500;
        color: var(--primary-text-color);
      }
      
      .history-separator {
        color: var(--secondary-text-color);
        font-weight: bold;
      }
      
      .history-completed-by {
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }
      
      .history-completed-at {
        color: var(--accent-color);
        font-size: 0.85em;
        font-style: italic;
      }
      
      .no-history, .history-error {
        text-align: center;
        padding: 32px;
        color: var(--secondary-text-color);
      }
      
      .no-history p, .history-error p {
        margin: 8px 0;
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