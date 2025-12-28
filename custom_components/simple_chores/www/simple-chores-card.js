/**
 * Simple Chores Card
 * A custom Lovelace card for managing simple chores
 */

// Try the most direct approach used by working HA cards
let LitElement, html, css;

// Module-level constants
const INIT_RETRY_DELAY = 500; // milliseconds

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
  setTimeout(initCard, INIT_RETRY_DELAY);
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
      // Modal system
      _activeModal: { type: String },
      _modalData: { type: Object },
      // Individual modal states (kept for compatibility)
      _showAddRoomModal: { type: Boolean },
      _showManageRoomsModal: { type: Boolean },
      _showAddChoreModal: { type: Boolean },
      _showEditChoreModal: { type: Boolean },
      _showAllChoresModal: { type: Boolean },
      _showHistoryModal: { type: Boolean },
      _showCompleteChoreModal: { type: Boolean },
      // Form data unified under _formData
      _formData: { type: Object },
      // History data cache
      _historyData: { type: Array },
      // Chore display limits for progressive rendering
      _choreLimits: { type: Object },
      // Loading state for async operations
      _isLoading: { type: Boolean },
    };
  }

  // Constants for timing and limits
  static get constants() {
    return {
      // Timeout delays (milliseconds)
      MODAL_FOCUS_DELAY: 100,
      RETRY_DELAY: 500,

      // Cache TTLs (milliseconds)
      ROOM_CACHE_TTL: 30000,  // 30 seconds
      USER_CACHE_TTL: 60000,  // 1 minute

      // Display limits
      DEFAULT_CHORE_LIMIT: 20,
      MAX_RETRY_ATTEMPTS: 10,
    };
  }

  constructor() {
    super();
    this._selectedRoom = "all";
    // Modal system
    this._activeModal = null;
    this._modalData = {};
    // Individual modal states
    this._showAddRoomModal = false;
    this._showManageRoomsModal = false;
    this._showAddChoreModal = false;
    this._showEditChoreModal = false;
    this._showAllChoresModal = false;
    this._showHistoryModal = false;
    this._showCompleteChoreModal = false;
    // Unified form data
    this._formData = {};
    this._initializeFormData();
    // History data cache
    this._historyData = [];
    // Chore display limits for progressive rendering
    this._choreLimits = {
      dueToday: this.constructor.constants.DEFAULT_CHORE_LIMIT,
      dueNext7Days: this.constructor.constants.DEFAULT_CHORE_LIMIT
    };
    // Loading state
    this._isLoading = false;
    // Performance caching
    this._cache = {
      rooms: { data: null, lastUpdate: 0, ttl: this.constructor.constants.ROOM_CACHE_TTL },
      users: { data: null, lastUpdate: 0, ttl: this.constructor.constants.USER_CACHE_TTL },
      roomLookup: new Map() // Persistent room lookup cache
    };
    // Common household icons
    this._commonIcons = [
      { icon: 'mdi:home', label: 'Home' },
      { icon: 'mdi:bed', label: 'Bedroom' },
      { icon: 'mdi:silverware-fork-knife', label: 'Kitchen' },
      { icon: 'mdi:sofa', label: 'Living Room' },
      { icon: 'mdi:toilet', label: 'Bathroom' },
      { icon: 'mdi:car', label: 'Garage' },
      { icon: 'mdi:gate', label: 'Entrance' },
      { icon: 'mdi:office-building', label: 'Office' },
      { icon: 'mdi:washing-machine', label: 'Laundry' },
      { icon: 'mdi:dog', label: 'Pet Area' },
      { icon: 'mdi:tree', label: 'Garden' },
      { icon: 'mdi:stairs', label: 'Stairs/Hallway' },
    ];

    // Bind keyboard handler for proper removal
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  connectedCallback() {
    super.connectedCallback();
    // Add global keyboard event listener
    document.addEventListener('keydown', this._handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    // Remove keyboard event listener
    document.removeEventListener('keydown', this._handleKeydown);
  }

  _handleKeydown(e) {
    // ESC key - close any open modal
    if (e.key === 'Escape') {
      if (this._showAddRoomModal) {
        this._closeAddRoomModal();
      } else if (this._showManageRoomsModal) {
        this._closeManageRoomsModal();
      } else if (this._showAddChoreModal) {
        this._closeAddChoreModal();
      } else if (this._showEditChoreModal) {
        this._closeEditChoreModal();
      } else if (this._showAllChoresModal) {
        this._closeAllChoresModal();
      } else if (this._showHistoryModal) {
        this._closeHistoryModal();
      } else if (this._showCompleteChoreModal) {
        this._closeCompleteChoreModal();
      }
      return;
    }

    // Enter key - submit forms (only if not already loading)
    if (e.key === 'Enter' && !this._isLoading) {
      // Check if we're in an input field (not textarea)
      const target = e.target;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        e.preventDefault();

        // Determine which modal is open and submit
        if (this._showAddRoomModal) {
          this._submitAddRoom();
        } else if (this._showAddChoreModal) {
          this._submitAddChore();
        } else if (this._showEditChoreModal) {
          this._submitEditChore();
        } else if (this._showCompleteChoreModal) {
          this._submitCompleteChore();
        }
      }
    }
  }

  _initializeFormData() {
    this._formData = {
      room: {
        name: "",
        icon: "mdi:home"
      },
      chore: {
        id: "",
        name: "",
        room: "",
        frequency: "daily",
        dueDate: "",
        assignedTo: ""
      },
      completion: {
        choreId: "",
        choreName: "",
        completedBy: "",
        reassignTo: ""
      }
    };
  }

  // Universal form handler
  _handleFormInput(formType, field, value) {
    if (!this._formData[formType]) {
      this._formData[formType] = {};
    }
    this._formData[formType][field] = value;
    
    // Assignment handling
    // Debug logging removed for production
    
    this.requestUpdate();
  }

  /**
   * Validates a form by checking required fields.
   * @param {string} formType - The type of form ('chore', 'room', 'completion')
   * @param {string[]} requiredFields - Array of field names that must be filled
   * @returns {{valid: boolean, message?: string}} Validation result with error message if invalid
   */
  _validateForm(formType, requiredFields = []) {
    const formData = this._formData[formType];
    if (!formData) {
      return { 
        valid: false, 
        message: "There was an error with the form. Please try refreshing the page." 
      };
    }
    
    const fieldMessages = {
      name: "Please enter a name",
      room: "Please select a room",
      completedBy: "Please select who completed this chore",
      frequency: "Please select how often this chore repeats"
    };
    
    for (const field of requiredFields) {
      const value = formData[field];
      if (!value || (typeof value === 'string' && !value.trim())) {
        const message = fieldMessages[field] || `${this._formatFieldName(field)} is required`;
        return { valid: false, message };
      }
      
      // Additional validation rules
      if (field === 'name' && value.length > 100) {
        return { valid: false, message: "Name is too long. Please use 100 characters or fewer." };
      }
    }
    return { valid: true };
  }

  _formatFieldName(field) {
    return field.replace(/([A-Z])/g, ' $1').toLowerCase().replace(/^./, str => str.toUpperCase());
  }

  // Form reset utility
  _resetForm(formType) {
    if (formType === 'room') {
      this._formData.room = { name: "", icon: "mdi:home" };
    } else if (formType === 'chore') {
      this._formData.chore = {
        id: "",
        name: "",
        room: "",
        frequency: "daily",
        dueDate: "",
        assignedTo: ""
      };
    } else if (formType === 'completion') {
      this._formData.completion = {
        choreId: "",
        choreName: "",
        completedBy: "",
        reassignTo: ""
      };
    }
    this.requestUpdate();
  }

  // Cache management utilities
  _isCacheValid(cacheKey) {
    const cache = this._cache[cacheKey];
    return cache.data !== null && (Date.now() - cache.lastUpdate) < cache.ttl;
  }

  _updateCache(cacheKey, data) {
    this._cache[cacheKey] = {
      ...this._cache[cacheKey],
      data: data,
      lastUpdate: Date.now()
    };
  }

  _invalidateCache(cacheKey) {
    if (this._cache[cacheKey]) {
      this._cache[cacheKey].data = null;
      this._cache[cacheKey].lastUpdate = 0;
    }
    // Also clear room lookup cache when rooms change
    if (cacheKey === 'rooms') {
      this._cache.roomLookup.clear();
    }
  }

  // Consolidated room lookup logic
  _resolveRoomName(chore, rooms = null) {
    // Get rooms if not provided
    if (!rooms) {
      rooms = this._getRooms();
    }

    // Try different property names in order of preference
    let roomName = chore.room_name || chore.room;
    let roomId = chore.room_id || chore.room;

    // If we have a valid room name and it's not a fallback, use it
    if (roomName && roomName !== 'Unknown Room' && roomName !== 'Unknown') {
      return roomName;
    }

    // Otherwise, try to resolve from room ID using cached lookup
    if (roomId) {
      const resolvedName = this._getRoomName(roomId, rooms);
      if (resolvedName !== 'Unknown Room') {
        return resolvedName;
      }
    }

    // Final fallback
    return 'Unknown Room';
  }

  _getRoomIcon(roomId) {
    const rooms = this._getRooms();
    const room = rooms.find(r => r.id === roomId);
    return room?.icon || 'mdi:home';
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
          ${this._renderChoreList(dueThisWeek, "Due in Next 7 Days")}
        </div>
        
        ${this._renderAddRoomModal()}
        ${this._renderManageRoomsModal()}
        ${this._renderAddChoreModal()}
        ${this._renderEditChoreModal()}
        ${this._renderAllChoresModal()}
        ${this._renderHistoryModal()}
        ${this._renderCompleteChoreModal()}
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

    // Performance optimization: limit initial render for large lists
    const limitKey = title.includes('Today') ? 'dueToday' : 'dueNext7Days';
    const currentLimit = this._choreLimits[limitKey];
    const choresToRender = filteredChores.slice(0, currentLimit);
    const hasMore = filteredChores.length > currentLimit;

    return html`
      <div class="section">
        <h3>${title} (${filteredChores.length})</h3>
        ${filteredChores.length === 0 ? html`
          <p class="no-chores">No chores ${title.toLowerCase()}${this._selectedRoom !== 'all' ? ' in this room' : ''}</p>
        ` : html`
          <div class="chore-list">
            ${choresToRender.map(chore => this._renderChore(chore))}
            ${hasMore ? html`
              <button class="load-more-btn" @click=${() => this._loadMoreChores(limitKey, filteredChores.length)}>
                Load ${filteredChores.length - currentLimit} more chores...
              </button>
            ` : ''}
          </div>
        `}
      </div>
    `;
  }


  _renderChore(chore) {

    // Handle different property names from different data sources
    let dueDate = chore.next_due || chore.due_date || chore.date;

    // Fix for Due Today chores - if no specific date, use today's date
    if (!dueDate) {
      dueDate = new Date().toISOString().split('T')[0];
    }

    // Use consolidated room lookup logic
    const roomName = this._resolveRoomName(chore);
    const roomIcon = this._getRoomIcon(chore.room_id);

    // Get assigned user info
    const assignedTo = chore.assigned_to;
    let assignedUserName = null;
    if (assignedTo) {
      const users = this._getUsers();
      const assignedUser = users.find(u => u.id === assignedTo);
      assignedUserName = assignedUser ? assignedUser.name : assignedTo;
    }

    const isOverdue = new Date(dueDate) < new Date().setHours(0,0,0,0);

    return html`
      <div class="chore-item ${isOverdue ? 'overdue' : ''}">
        <div class="chore-info">
          <span class="chore-name">${chore.name}</span>
          <span class="chore-separator">•</span>
          <span class="chore-room">
            <ha-icon icon="${roomIcon}" class="room-icon-inline"></ha-icon>
            ${roomName}
          </span>
          <span class="chore-separator">•</span>
          <span class="chore-due">Due: ${this._formatDate(dueDate)}</span>
          ${assignedUserName ? html`
            <span class="chore-separator">•</span>
            <span class="chore-assigned">👤 ${assignedUserName}</span>
          ` : ''}
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
            @click=${() => this._openCompleteChoreModal(chore)}
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
        
      return processedChore;
    });
    
    return processedChores;
  }

  /**
   * Retrieves the list of Home Assistant users.
   * Uses caching to minimize sensor lookups. Falls back to auth registry if available.
   * @returns {Array<{id: string, name: string}>} Array of user objects
   */
  _getUsers() {
    if (!this.hass) return [];
    
    // Check cache first
    if (this._isCacheValid('users')) {
      return this._cache.users.data;
    }
    
    let users = [];
    
    // Try to get users from sensor attributes first
    const possibleTotalSensors = [
      "sensor.simple_chores_total",
      "sensor.household_tasks_total",
      "sensor.total_chores"
    ];
    
    for (const sensorName of possibleTotalSensors) {
      const sensor = this.hass.states[sensorName];
      if (sensor && sensor.attributes && sensor.attributes.users) {
        users = sensor.attributes.users;
        break;
      }
    }
    
    // Fallback to Home Assistant users from auth registry (if available)
    if (users.length === 0) {
      // Check if we can get users from HA's person entities  
      Object.keys(this.hass.states).forEach(entityId => {
        if (entityId.startsWith('person.')) {
          const person = this.hass.states[entityId];
          users.push({
            id: entityId.replace('person.', ''),
            name: person.attributes.friendly_name || person.attributes.id || entityId.replace('person.', '')
          });
        }
      });
    }
    
    // Final fallback - basic user entries
    if (users.length === 0) {
      users = [{ id: 'user', name: 'Default User' }];
    }
    
    // Update cache
    this._updateCache('users', users);
    
    return users;
  }

  /**
   * Retrieves the list of rooms (both HA Areas and custom rooms).
   * Uses caching to minimize sensor lookups.
   * @returns {Array<{id: string, name: string, icon: string, is_custom: boolean}>} Array of room objects
   */
  _getRooms() {
    if (!this.hass) return [];
    
    // Check cache first
    if (this._isCacheValid('rooms')) {
      return this._cache.rooms.data;
    }
    
    let rooms = [];
    
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
    
    
    // Debug: Check if we have ANY entities from this integration
    const allHouseholdEntities = Object.keys(this.hass.states).filter(key => 
      key.includes('household_tasks') || key.includes('simple_chores')
    );
    
    // Check if calendar has any room data
    const calendar = this.hass.states["calendar.household_tasks"];
    if (calendar && calendar.attributes) {
      
      // Check if calendar has room data in attributes
      if (calendar.attributes.rooms) {
        rooms = calendar.attributes.rooms;
      }
    }
    
    if (rooms.length === 0) {
      const allSensors = [...simpleChoreSensors, ...householdTaskSensors];
      
      // Try both possible sensor names for total sensor
      const possibleTotalSensors = [
        "sensor.total_chores",
        "sensor.simple_chores_total",
        "sensor.household_tasks_total"
      ];
      
      for (const sensorName of possibleTotalSensors) {
        const sensor = this.hass.states[sensorName];
        
        if (sensor) {
          if (sensor.attributes && sensor.attributes.rooms) {
            rooms = sensor.attributes.rooms;
            break;
          }
        }
      }
      
      // Check each sensor for room data (fallback)
      if (rooms.length === 0) {
        for (const sensorName of allSensors) {
          const sensor = this.hass.states[sensorName];
          if (sensor && sensor.attributes) {
            if (sensor.attributes.rooms) {
              // Found rooms in sensor
              rooms = sensor.attributes.rooms;
              break;
            }
          }
        }
      }
    }
    
    // Fallback: Get just Home Assistant areas if sensor data not available
    if (rooms.length === 0) {
      // No rooms found in sensors, falling back to HA areas
      
      rooms = Object.values(this.hass.areas || {}).map(area => ({
        id: `area_${area.area_id}`,  // Match the coordinator's room ID format
        name: area.name || area.area_id
      }));
      
      // Using HA areas fallback
    }
    
    // Update cache
    this._updateCache('rooms', rooms);
    
    return rooms;
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

  /**
   * Opens the Add Room modal and resets the room form.
   * Automatically focuses the room name input field after rendering.
   */
  _openAddRoomModal() {
    this._showAddRoomModal = true;
    this._resetForm('room');

    // Focus first input after modal renders
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('#room-name');
      if (input) input.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  /**
   * Closes the Add Room modal and resets the room form.
   */
  _closeAddRoomModal() {
    this._showAddRoomModal = false;
    this._resetForm('room');
  }

  _handleRoomNameInput(e) {
    this._handleFormInput('room', 'name', e.target.value);
  }

  _handleRoomIconInput(e) {
    this._handleFormInput('room', 'icon', e.target.value);
  }

  _selectIcon(icon) {
    this._handleFormInput('room', 'icon', icon);
  }

  /**
   * Submits the Add Room form.
   * Validates the room name, checks for duplicates, and creates a new custom room.
   * Displays loading state and success/error messages.
   * @returns {Promise<void>}
   */
  async _submitAddRoom() {
    const validation = this._validateForm('room', ['name']);
    if (!validation.valid) {
      this._showToast(validation.message);
      return;
    }

    // Check for duplicate room names
    const roomName = this._formData.room.name.trim();
    const existingRooms = this._getRooms();


    const duplicateRoom = existingRooms.find(room =>
      room.name.toLowerCase() === roomName.toLowerCase()
    );

    if (duplicateRoom) {
      this._showToast(`A room named "${roomName}" already exists`);
      return;
    }

    this._isLoading = true;
    try {
      // Call service to add room
      await this.hass.callService("simple_chores", "add_room", {
        name: roomName,
        icon: this._formData.room.icon || "mdi:home"
      });

  
      // Wait and check if the room data updates
      const checkForRoom = (attempts = 0) => {
        setTimeout(() => {
          const roomsAfter = this._getRooms();
          const foundNewRoom = roomsAfter.find(room =>
            room.name.toLowerCase() === roomName.toLowerCase()
          );


          if (foundNewRoom) {
            this._showToast(`Room "${roomName}" created successfully!`);
            this._closeAddRoomModal();
            this.requestUpdate();
          } else if (attempts < this.constructor.constants.MAX_RETRY_ATTEMPTS) {
            // Try again, up to MAX_RETRY_ATTEMPTS (5 seconds total)
            checkForRoom(attempts + 1);
          } else {
            console.warn(`Simple Chores Card: Room not found after ${this.constructor.constants.MAX_RETRY_ATTEMPTS} attempts`);
            this._showToast(`Room "${roomName}" created, but may require a page refresh to appear`);
            this._closeAddRoomModal();
            this.requestUpdate();
          }
        }, this.constructor.constants.RETRY_DELAY);
      };

      checkForRoom();

      // Invalidate room cache since we added a new room
      this._invalidateCache('rooms');
    } catch (error) {
      console.error("Simple Chores Card: Service call failed:", error);
      this._showToast(`Error creating room: ${error.message}`);
    } finally {
      this._isLoading = false;
    }
  }

  _renderAddRoomModal() {
    if (!this._showAddRoomModal) {
      return html``;
    }

    return html`
      <div class="modal-overlay" @click=${this._closeAddRoomModal}>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="add-room-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="add-room-title">Add Custom Room</h3>
            <button class="close-btn" @click=${this._closeAddRoomModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="room-name">Room Name *</label>
              <input
                id="room-name"
                type="text"
                .value=${this._formData.room.name}
                @input=${this._handleRoomNameInput}
                placeholder="Enter room name..."
                maxlength="50"
              />
            </div>
            <div class="form-group">
              <label>Icon *</label>
              <div class="icon-picker">
                <div class="icon-preview">
                  <ha-icon icon="${this._formData.room.icon || 'mdi:home'}"></ha-icon>
                  <span>${this._formData.room.icon || 'mdi:home'}</span>
                </div>
                <div class="icon-grid">
                  ${this._commonIcons.map(item => html`
                    <button
                      type="button"
                      class="icon-option ${this._formData.room.icon === item.icon ? 'selected' : ''}"
                      @click=${() => this._selectIcon(item.icon)}
                      title="${item.label}"
                    >
                      <ha-icon icon="${item.icon}"></ha-icon>
                      <span class="icon-label">${item.label}</span>
                    </button>
                  `)}
                </div>
                <div class="custom-icon-input">
                  <small>Or enter a custom MDI icon:</small>
                  <input
                    type="text"
                    .value=${this._formData.room.icon}
                    @input=${this._handleRoomIconInput}
                    placeholder="mdi:custom-icon"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeAddRoomModal} ?disabled=${this._isLoading}>Cancel</button>
            <button
              class="submit-btn ${this._isLoading ? 'loading' : ''}"
              @click=${this._submitAddRoom}
              ?disabled=${!this._formData.room.name?.trim() || this._isLoading}>
              ${this._isLoading ? html`<span class="spinner"></span>` : ''}
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

    this._isLoading = true;
    try {
      await this.hass.callService("simple_chores", "remove_room", {
        room_id: roomId
      });

      this._showToast(`Room "${roomName}" deleted successfully!`);
      // Invalidate room cache since we deleted a room
      this._invalidateCache('rooms');
      this.requestUpdate();
    } catch (error) {
      console.error("Simple Chores Card: Failed to delete room:", error);
      this._showToast(`Error deleting room: ${error.message}`);
    } finally {
      this._isLoading = false;
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
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="manage-rooms-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="manage-rooms-title">Manage Custom Rooms</h3>
            <button class="close-btn" @click=${this._closeManageRoomsModal} aria-label="Close dialog">
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
    this._resetForm('chore');

    // Focus first input after modal renders
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('#chore-name');
      if (input) input.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _closeAddChoreModal() {
    this._showAddChoreModal = false;
    this._resetForm('chore');
  }

  _handleChoreNameInput(e) {
    this._handleFormInput('chore', 'name', e.target.value);
  }

  _handleChoreRoomInput(e) {
    this._handleFormInput('chore', 'room', e.target.value);
  }

  _handleChoreFrequencyInput(e) {
    this._handleFormInput('chore', 'frequency', e.target.value);
  }

  _handleChoreDueDateInput(e) {
    this._handleFormInput('chore', 'dueDate', e.target.value);
  }

  _handleChoreAssignedToInput(e) {
    this._handleFormInput('chore', 'assignedTo', e.target.value);
  }


  _renderAddChoreModal() {
    if (!this._showAddChoreModal) {
      return html``;
    }

    const rooms = this._getRooms();

    return html`
      <div class="modal-overlay" @click=${this._closeAddChoreModal}>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="add-chore-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="add-chore-title">Add New Chore</h3>
            <button class="close-btn" @click=${this._closeAddChoreModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="chore-name">Chore Name *</label>
              <input 
                id="chore-name"
                type="text" 
                .value=${this._formData.chore.name}
                @input=${this._handleChoreNameInput}
                placeholder="Enter chore name..."
                maxlength="100"
              />
            </div>
            <div class="form-group">
              <label for="chore-room">
                Room *
                ${this._formData.chore.room ? html`
                  <ha-icon icon="${this._getRoomIcon(this._formData.chore.room)}" class="room-icon-inline"></ha-icon>
                ` : ''}
              </label>
              <select
                id="chore-room"
                .value=${this._formData.chore.room}
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
                .value=${this._formData.chore.frequency}
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
                .value=${this._formData.chore.dueDate}
                @input=${this._handleChoreDueDateInput}
                title="Leave empty to start today"
              />
              <small>Leave empty to start today, or select a future date</small>
            </div>
            <div class="form-group">
              <label for="chore-assigned-to">Assigned To (optional)</label>
              <select 
                id="chore-assigned-to"
                @change=${this._handleChoreAssignedToInput}
              >
                <option value="" ?selected=${!this._formData.chore.assignedTo}>No assignment (anyone can complete)</option>
                ${this._getUsers().map(user => html`
                  <option value=${user.id} ?selected=${this._formData.chore.assignedTo === user.id}>
                    ${user.name}
                  </option>
                `)}
              </select>
              </select>
              <small>Assign this chore to a specific person or leave unassigned</small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeAddChoreModal} ?disabled=${this._isLoading}>Cancel</button>
            <button
              class="submit-btn ${this._isLoading ? 'loading' : ''}"
              @click=${this._submitAddChore}
              ?disabled=${!this._formData.chore.name?.trim() || !this._formData.chore.room?.trim() || this._isLoading}>
              ${this._isLoading ? html`<span class="spinner"></span>` : ''}
              Create Chore
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _editChore(chore) {
    
    // Handle room ID properly - some might be room names instead of IDs
    let roomId = chore.room_id || chore.room || "";
    const rooms = this._getRooms();
    
    // If room_id looks like a name, try to find the actual ID
    if (roomId && !rooms.find(r => r.id === roomId)) {
      const roomByName = rooms.find(r => r.name === roomId);
      if (roomByName) {
        roomId = roomByName.id;
      }
    }
    
    // Open edit modal with chore data
    this._formData.chore = {
      id: chore.id,
      name: chore.name,
      room: roomId,
      frequency: chore.frequency || "daily",
      dueDate: chore.next_due || chore.due_date || "",
      assignedTo: chore.assigned_to || ""
    };
    
    
    // Show the modal and request update
    this._showEditChoreModal = true;
    this.requestUpdate();
    
    // Force update the select elements after modal is shown and focus first input
    setTimeout(() => {
      const roomSelect = this.shadowRoot?.querySelector('#edit-chore-room');
      const assignSelect = this.shadowRoot?.querySelector('#edit-chore-assigned-to');
      const nameInput = this.shadowRoot?.querySelector('#edit-chore-name');

      if (roomSelect) {
        roomSelect.value = this._formData.chore.room;
      }

      if (assignSelect) {
        assignSelect.value = this._formData.chore.assignedTo || "";
      }

      // Focus first input for keyboard navigation
      if (nameInput) nameInput.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _closeEditChoreModal() {
    this._showEditChoreModal = false;
    this._resetForm('chore');
  }

  _handleEditChoreNameInput(e) {
    this._handleFormInput('chore', 'name', e.target.value);
  }

  _handleEditChoreRoomInput(e) {
    this._handleFormInput('chore', 'room', e.target.value);
  }

  _handleEditChoreFrequencyInput(e) {
    this._handleFormInput('chore', 'frequency', e.target.value);
  }

  _handleEditChoreDueDateInput(e) {
    this._handleFormInput('chore', 'dueDate', e.target.value);
  }

  _handleEditChoreAssignedToInput(e) {
    this._handleFormInput('chore', 'assignedTo', e.target.value);
  }

  _handleCompletedByInput(e) {
    this._handleFormInput('completion', 'completedBy', e.target.value);
  }

  _handleReassignToInput(e) {
    this._handleFormInput('completion', 'reassignTo', e.target.value);
  }


  _renderEditChoreModal() {
    if (!this._showEditChoreModal) {
      return html``;
    }

    const rooms = this._getRooms();

    return html`
      <div class="modal-overlay" @click=${this._closeEditChoreModal}>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="edit-chore-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="edit-chore-title">Edit Chore</h3>
            <button class="close-btn" @click=${this._closeEditChoreModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="edit-chore-name">Chore Name *</label>
              <input 
                id="edit-chore-name"
                type="text" 
                .value=${this._formData.chore.name}
                @input=${this._handleEditChoreNameInput}
                placeholder="Enter chore name..."
                maxlength="100"
              />
            </div>
            <div class="form-group">
              <label for="edit-chore-room">
                Room *
                ${this._formData.chore.room ? html`
                  <ha-icon icon="${this._getRoomIcon(this._formData.chore.room)}" class="room-icon-inline"></ha-icon>
                ` : ''}
              </label>
              <select
                id="edit-chore-room"
                .value=${this._formData.chore.room}
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
                .value=${this._formData.chore.frequency}
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
                .value=${this._formData.chore.dueDate}
                @input=${this._handleEditChoreDueDateInput}
              />
            </div>
            <div class="form-group">
              <label for="edit-chore-assigned-to">Assigned To (optional)</label>
              <select 
                id="edit-chore-assigned-to"
                @change=${this._handleEditChoreAssignedToInput}
              >
                <option value="" ?selected=${!this._formData.chore.assignedTo}>No assignment (anyone can complete)</option>
                ${this._getUsers().map(user => html`
                  <option value=${user.id} ?selected=${this._formData.chore.assignedTo === user.id}>
                    ${user.name}
                  </option>
                `)}
              </select>
              <small>Assign this chore to a specific person or leave unassigned</small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeEditChoreModal} ?disabled=${this._isLoading}>Cancel</button>
            <button
              class="submit-btn ${this._isLoading ? 'loading' : ''}"
              @click=${this._submitEditChore}
              ?disabled=${!this._formData.chore.name?.trim() || !this._formData.chore.room?.trim() || this._isLoading}>
              ${this._isLoading ? html`<span class="spinner"></span>` : ''}
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
      return totalChoresSensor.attributes.chores;
    }
    
    // Fallback: try the due chores if the sensor isn't available yet
    const dueToday = this._getDueChores("today");
    const dueThisWeek = this._getDueChores("week");
    
    const fallbackChores = [...dueToday, ...dueThisWeek];
    
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
        <div class="modal-content large-modal" role="dialog" aria-modal="true" aria-labelledby="all-chores-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="all-chores-title">All Active Chores (${allChores.length})</h3>
            <button class="close-btn" @click=${this._closeAllChoresModal} aria-label="Close dialog">
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
                  
                  // Use consolidated room lookup logic
                  const roomName = this._resolveRoomName(chore, rooms);
                  
                  // Get assigned user info
                  const assignedTo = chore.assigned_to;
                  let assignedUserName = null;
                  if (assignedTo) {
                    const users = this._getUsers();
                    const assignedUser = users.find(u => u.id === assignedTo);
                    assignedUserName = assignedUser ? assignedUser.name : assignedTo;
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
                        <span class="chore-separator">•</span>
                        <span class="chore-frequency">${chore.frequency || 'Unknown'}</span>
                        ${assignedUserName ? html`
                          <span class="chore-separator">•</span>
                          <span class="chore-assigned">👤 ${assignedUserName}</span>
                        ` : ''}
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
                          @click=${() => this._openCompleteChoreModalFromAllChores(chore)}
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
    // Use cache for frequent lookups
    if (this._cache.roomLookup.has(roomId)) {
      return this._cache.roomLookup.get(roomId);
    }
    
    const room = rooms.find(r => r.id === roomId);
    const roomName = room ? room.name : 'Unknown Room';
    
    // Cache the result
    this._cache.roomLookup.set(roomId, roomName);
    
    return roomName;
  }

  // Modal action methods that close the all chores modal before performing actions
  _editChoreFromModal(chore) {
    
    // Handle room ID properly - some might be room names instead of IDs
    let roomId = chore.room_id || chore.room || "";
    const rooms = this._getRooms();
    
    // If room_id looks like a name, try to find the actual ID
    if (roomId && !rooms.find(r => r.id === roomId)) {
      const roomByName = rooms.find(r => r.name === roomId);
      if (roomByName) {
        roomId = roomByName.id;
      }
    }
    
    // First populate the edit modal data
    this._formData.chore = {
      id: chore.id,
      name: chore.name,
      room: roomId,
      frequency: chore.frequency || "daily",
      dueDate: chore.next_due || chore.due_date || "",
      assignedTo: chore.assigned_to || ""
    };
    
    
    // Direct modal swap - close one and open the other simultaneously
    this._showAllChoresModal = false;
    this._showEditChoreModal = true;
    this.requestUpdate();
    
    // Force update the select elements after modal is shown
    setTimeout(() => {
      const roomSelect = this.shadowRoot?.querySelector('#edit-chore-room');
      const assignSelect = this.shadowRoot?.querySelector('#edit-chore-assigned-to');
      
      if (roomSelect) {
        roomSelect.value = this._formData.chore.room;
      }
      
      if (assignSelect) {
        assignSelect.value = this._formData.chore.assignedTo || "";
      }
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
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
      return totalChoresSensor.attributes.chores;
    }
    
    // Fallback: try the due chores if the sensor isn't available yet
    const dueToday = this._getDueChores("today");
    const dueThisWeek = this._getDueChores("week");
    
    const fallbackChores = [...dueToday, ...dueThisWeek];
    
    return fallbackChores;
  }

  _openCompleteChoreModal(chore) {
    // Try to get current user ID from Home Assistant context
    let currentUserId = "";
    try {
      // Check if we can get the current user from hass context
      if (this.hass && this.hass.user) {
        currentUserId = this.hass.user.id;
      }
    } catch (e) {
    }

    this._formData.completion = {
      choreId: chore.id,
      choreName: chore.name,
      completedBy: currentUserId, // Default to current user
      reassignTo: chore.assigned_to || "" // Keep current assignment by default
    };
    this._showCompleteChoreModal = true;

    // Focus first select after modal renders
    setTimeout(() => {
      const select = this.shadowRoot.querySelector('#completed-by');
      if (select) select.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _openCompleteChoreModalFromAllChores(chore) {
    // Try to get current user ID
    let currentUserId = "";
    try {
      if (this.hass && this.hass.user) {
        currentUserId = this.hass.user.id;
      }
    } catch (e) {
    }

    this._formData.completion = {
      choreId: chore.id,
      choreName: chore.name,
      completedBy: currentUserId,
      reassignTo: chore.assigned_to || ""
    };
    this._showAllChoresModal = false;
    this._showCompleteChoreModal = true;

    // Focus first select after modal renders
    setTimeout(() => {
      const select = this.shadowRoot.querySelector('#completed-by');
      if (select) select.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _closeCompleteChoreModal() {
    this._showCompleteChoreModal = false;
    this._resetForm('completion');
  }

  _loadMoreChores(limitKey, totalCount) {
    // Update the limit to show all chores - LitElement will re-render safely
    this._choreLimits = {
      ...this._choreLimits,
      [limitKey]: totalCount
    };
  }


  // Service calling methods
  /**
   * Submits the Add Chore form.
   * Validates required fields, creates a new chore with the specified details.
   * Displays loading state and success/error messages.
   * @returns {Promise<void>}
   */
  async _submitAddChore() {
    const validation = this._validateForm('chore', ['name', 'room']);
    if (!validation.valid) {
      this._showToast(validation.message);
      return;
    }

    this._isLoading = true;
    try {
      const choreData = this._formData.chore;
      const serviceData = {
        name: choreData.name.trim(),
        room_id: choreData.room.trim(),
        frequency: choreData.frequency
      };

      // Add due date if provided
      if (choreData.dueDate?.trim()) {
        serviceData.start_date = choreData.dueDate.trim();
      }

      // Add assigned_to if provided
      if (choreData.assignedTo?.trim()) {
        serviceData.assigned_to = choreData.assignedTo.trim();
      }

      await this.hass.callService("simple_chores", "add_chore", serviceData);
      this._showToast("Chore created successfully!");
      this._closeAddChoreModal();
    } catch (error) {
      console.error("Simple Chores Card: Error creating chore:", error);
      this._showToast(this._parseErrorMessage(error, "creating chore"));
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Submits the Edit Chore form.
   * Validates required fields and updates an existing chore with new details.
   * Displays loading state and success/error messages.
   * @returns {Promise<void>}
   */
  async _submitEditChore() {
    const validation = this._validateForm('chore', ['name', 'room']);
    if (!validation.valid) {
      this._showToast(validation.message);
      return;
    }

    this._isLoading = true;
    try {
      const choreData = this._formData.chore;
      const serviceData = {
        chore_id: choreData.id,
        name: choreData.name.trim(),
        room_id: choreData.room.trim(),
        frequency: choreData.frequency
      };

      // Add due date if provided
      if (choreData.dueDate?.trim()) {
        serviceData.next_due = choreData.dueDate.trim();
      }

      // Add assigned_to if provided
      if (choreData.assignedTo?.trim()) {
        serviceData.assigned_to = choreData.assignedTo.trim();
      }

      await this.hass.callService("simple_chores", "update_chore", serviceData);
      this._showToast("Chore updated successfully!");
      this._closeEditChoreModal();
    } catch (error) {
      console.error("Simple Chores Card: Error updating chore:", error);
      this._showToast(this._parseErrorMessage(error, "updating chore"));
    } finally {
      this._isLoading = false;
    }
  }

  async _completeChore(choreId) {
    try {
      await this.hass.callService("simple_chores", "complete_chore", {
        chore_id: choreId
      });
      this._showToast("Chore completed!");
    } catch (error) {
      console.error("Simple Chores Card: Error completing chore:", error);
      this._showToast("Error completing chore. Please try again.");
    }
  }

  /**
   * Submits the Complete Chore form.
   * Marks a chore as complete by the specified user and optionally reassigns it.
   * Displays loading state and success/error messages.
   * @returns {Promise<void>}
   */
  async _submitCompleteChore() {
    const validation = this._validateForm('completion', ['completedBy']);
    if (!validation.valid) {
      this._showToast(validation.message);
      return;
    }

    this._isLoading = true;
    try {
      const completionData = this._formData.completion;
      const serviceData = {
        chore_id: completionData.choreId,
        user_id: completionData.completedBy
      };


      await this.hass.callService("simple_chores", "complete_chore", serviceData);

      // If reassignment is requested, update the chore assignment
      if (completionData.reassignTo !== undefined) {
        const reassignData = {
          chore_id: completionData.choreId,
          assigned_to: completionData.reassignTo || null
        };
        await this.hass.callService("simple_chores", "update_chore", reassignData);
      }

      this._showToast(`Chore "${completionData.choreName}" completed!`);
      this._closeCompleteChoreModal();
    } catch (error) {
      console.error("Simple Chores Card: Error completing chore:", error);
      this._showToast("Error completing chore. Please try again.");
    } finally {
      this._isLoading = false;
    }
  }

  async _getCompletionHistory() {
    try {
      // Try multiple possible sensor names
      const possibleTotalSensors = [
        "sensor.total_chores",
        "sensor.simple_chores_total",
        "sensor.household_tasks_total"
      ];

      for (const sensorName of possibleTotalSensors) {
        const totalChoresSensor = this.hass.states[sensorName];

        if (totalChoresSensor && totalChoresSensor.attributes && totalChoresSensor.attributes.completion_history) {
          const history = totalChoresSensor.attributes.completion_history;

          // Sort by completion date (newest first)
          return history.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
        }
      }

      return [];

    } catch (error) {
      console.error("Simple Chores Card: Failed to get completion history:", error);
      this._showToast("Error loading completion history");
      return [];
    }
  }

  async _openHistoryModal() {
    // Load history data before showing modal
    try {
      this._historyData = await this._getCompletionHistory();
    } catch (error) {
      console.error("Simple Chores Card: Error loading history:", error);
      this._historyData = [];
    }
    this._showHistoryModal = true;
  }

  _closeHistoryModal() {
    this._showHistoryModal = false;
  }

  _renderHistoryModal() {
    if (!this._showHistoryModal) {
      return html``;
    }

    const history = this._historyData || [];

    return html`
      <div class="modal-overlay" @click=${this._closeHistoryModal}>
        <div class="modal-content large-modal" role="dialog" aria-modal="true" aria-labelledby="history-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="history-title">📊 Completion History (${history.length})</h3>
            <button class="close-btn" @click=${this._closeHistoryModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            ${history.length === 0 ? html`
              <div class="no-history">
                <p>No completion history found.</p>
                <p>Complete some chores to see your history here!</p>
              </div>
            ` : html`
              <div class="history-list">
                ${history.map(entry => {
                  const completedDate = new Date(entry.completed_at);
                  const formattedDate = completedDate.toLocaleDateString();
                  const formattedTime = completedDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});

                  return html`
                    <div class="history-item">
                      <div class="history-info">
                        <span class="chore-name">${entry.chore_name}</span>
                        <span class="completed-by">by ${entry.completed_by_name}</span>
                      </div>
                      <div class="completion-details">
                        <span class="completion-date">${formattedDate}</span>
                        <span class="completion-time">${formattedTime}</span>
                      </div>
                    </div>
                  `;
                })}
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeHistoryModal}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderCompleteChoreModal() {
    if (!this._showCompleteChoreModal) {
      return html``;
    }

    const users = this._getUsers();

    return html`
      <div class="modal-overlay" @click=${this._closeCompleteChoreModal}>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="complete-chore-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="complete-chore-title">✓ Complete Chore</h3>
            <button class="close-btn" @click=${this._closeCompleteChoreModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="completion-info">
              <h4>📋 ${this._formData.completion.choreName}</h4>
              <p>Mark this chore as completed and optionally reassign for next time.</p>
            </div>
            
            <div class="form-group">
              <label for="completed-by">Who completed this chore? *</label>
              <select 
                id="completed-by"
                @change=${this._handleCompletedByInput}
              >
                <option value="" ?selected=${!this._formData.completion.completedBy}>Select who completed it...</option>
                ${users.map(user => html`
                  <option value=${user.id} ?selected=${this._formData.completion.completedBy === user.id}>
                    ${user.name}
                  </option>
                `)}
              </select>
            </div>

            <div class="form-group">
              <label for="reassign-to">Reassign for next time (optional)</label>
              <select 
                id="reassign-to"
                @change=${this._handleReassignToInput}
              >
                <option value="" ?selected=${!this._formData.completion.reassignTo}>No specific assignment</option>
                ${users.map(user => html`
                  <option value=${user.id} ?selected=${this._formData.completion.reassignTo === user.id}>
                    ${user.name}
                  </option>
                `)}
              </select>
              <small>Leave as "No specific assignment" or choose someone to assign this chore to for next time</small>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeCompleteChoreModal} ?disabled=${this._isLoading}>Cancel</button>
            <button
              class="submit-btn ${this._isLoading ? 'loading' : ''}"
              @click=${this._submitCompleteChore}
              ?disabled=${!this._formData.completion.completedBy?.trim() || this._isLoading}>
              ${this._isLoading ? html`<span class="spinner"></span>` : ''}
              ✓ Mark Complete
            </button>
          </div>
        </div>
      </div>
    `;
  }

  async _skipChore(choreId) {
    try {
      await this.hass.callService("simple_chores", "skip_chore", {
        chore_id: choreId
      });
      this._showToast("Chore skipped to next occurrence!");
    } catch (error) {
      console.error("Simple Chores Card: Error skipping chore:", error);
      this._showToast("Error skipping chore. Please try again.");
    }
  }

  async _deleteChore(choreId, choreName) {
    if (!confirm(`Are you sure you want to delete "${choreName}"?`)) {
      return;
    }

    this._isLoading = true;
    try {
      await this.hass.callService("simple_chores", "remove_chore", {
        chore_id: choreId
      });
      this._showToast("Chore deleted successfully!");
    } catch (error) {
      console.error("Simple Chores Card: Error deleting chore:", error);
      this._showToast("Error deleting chore. Please try again.");
    } finally {
      this._isLoading = false;
    }
  }

  _parseErrorMessage(error, action) {
    /**
     * Parse error messages to provide specific, actionable feedback.
     * @param {Error} error - The error object
     * @param {string} action - The action being performed (e.g., "creating chore")
     * @returns {string} User-friendly error message
     */
    let message = `Error ${action}. `;

    if (error && error.message) {
      const errorMsg = error.message.toLowerCase();

      // Parse specific error types
      if (errorMsg.includes("does not exist") || errorMsg.includes("not found")) {
        message += "The selected room no longer exists. Please select a different room.";
      } else if (errorMsg.includes("too long")) {
        message += "Name is too long. Please use a shorter name.";
      } else if (errorMsg.includes("empty") || errorMsg.includes("required")) {
        message += "Please fill in all required fields.";
      } else if (errorMsg.includes("invalid") && errorMsg.includes("room")) {
        message += "Invalid room selected. Please choose a valid room.";
      } else if (errorMsg.includes("frequency")) {
        message += "Invalid frequency. Please select a valid frequency.";
      } else {
        // Use the actual error message if it's user-friendly
        message += error.message;
      }
    } else {
      message += "Please try again or check your input.";
    }

    return message;
  }

  _showToast(message) {
    // Simple toast notification
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: var(--primary-color);
      color: white;
      padding: 12px 24px;
      border-radius: 6px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    document.body.appendChild(toast);
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 3000);
  }

  static get styles() {
    return css`
      /* ============================================
         BASE & LAYOUT
         ============================================ */
      :host {
        display: block;
      }

      /* ============================================
         HEADER & CONTROLS
         ============================================ */
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


      /* ============================================
         CONTENT & STATS
         ============================================ */
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

      /* ============================================
         CHORE LISTS & ITEMS
         ============================================ */
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

      /* ============================================
         BUTTONS & ACTIONS
         ============================================ */
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

      /* ============================================
         MODALS & DIALOGS
         ============================================ */
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

      /* ============================================
         FORM ELEMENTS
         ============================================ */
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

      /* Icon Picker Styles */
      .icon-picker {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .icon-preview {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        background: var(--secondary-background-color);
        border-radius: 8px;
      }

      .icon-preview ha-icon {
        --mdc-icon-size: 32px;
        color: var(--primary-color);
      }

      .icon-preview span {
        font-family: monospace;
        font-size: 14px;
        color: var(--secondary-text-color);
      }

      .icon-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(90px, 1fr));
        gap: 8px;
        max-height: 300px;
        overflow-y: auto;
        padding: 8px;
        background: var(--secondary-background-color);
        border-radius: 8px;
      }

      .icon-option {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 12px 8px;
        background: var(--card-background-color);
        border: 2px solid var(--divider-color);
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.2s;
      }

      .icon-option:hover {
        border-color: var(--primary-color);
        transform: translateY(-2px);
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      }

      .icon-option.selected {
        border-color: var(--primary-color);
        background: rgba(var(--primary-color-rgb), 0.1);
      }

      .icon-option ha-icon {
        --mdc-icon-size: 28px;
        color: var(--primary-text-color);
      }

      .icon-option.selected ha-icon {
        color: var(--primary-color);
      }

      .icon-label {
        font-size: 10px;
        text-align: center;
        color: var(--secondary-text-color);
        line-height: 1.2;
      }

      .room-icon-inline {
        --mdc-icon-size: 16px;
        vertical-align: middle;
        margin-left: 6px;
        color: var(--primary-color);
      }

      .custom-icon-input {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .custom-icon-input input {
        padding: 10px;
        border: 2px solid var(--divider-color);
        border-radius: 6px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-family: monospace;
      }

      .custom-icon-input input:focus {
        outline: none;
        border-color: var(--primary-color);
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

      /* Loading spinner styles */
      .spinner {
        display: inline-block;
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 0.8s linear infinite;
        margin-right: 8px;
        vertical-align: middle;
      }

      @keyframes spin {
        to { transform: rotate(360deg); }
      }

      .submit-btn.loading {
        position: relative;
        pointer-events: none;
        opacity: 0.7;
      }

      /* ============================================
         RESPONSIVE DESIGN
         ============================================ */
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