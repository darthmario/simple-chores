/**
 * Simple Chores Card
 * A custom Lovelace card for managing simple chores
 */

// Card version - update this when releasing new versions
// This should match the version in manifest.json
const CARD_VERSION = "1.5.1";

// Try the most direct approach used by working HA cards
let LitElement, html, css;

// Module-level constants
const INIT_RETRY_DELAY = 500; // milliseconds

// Log version on load
console.info(`%c Simple Chores Card v${CARD_VERSION} `, "background: #4CAF50; color: white; font-weight: bold;");

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
      _selectedAssignee: { type: String },
      _showMyChoresOnly: { type: Boolean },
      _currentView: { type: String },
      _calendarMonth: { type: Number },
      _calendarYear: { type: Number },
      _optimisticChoreUpdates: { type: Object },
      // Dropdown states for new header UI
      _showRoomDropdown: { type: Boolean },
      _showAssigneeDropdown: { type: Boolean },
      _activeChoreMenu: { type: String },
      // Modal system
      _activeModal: { type: String },
      _modalData: { type: Object },
      // Individual modal states (kept for compatibility)
      _showAddRoomModal: { type: Boolean },
      _showManageRoomsModal: { type: Boolean },
      _showAddUserModal: { type: Boolean },
      _showManageUsersModal: { type: Boolean },
      _showEditUserModal: { type: Boolean },
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
    this._selectedAssignee = "all";
    this._showMyChoresOnly = false;
    this._currentView = "list";
    const now = new Date();
    this._calendarMonth = now.getMonth();
    this._calendarYear = now.getFullYear();
    this._optimisticChoreUpdates = {};
    // Dropdown states for new header UI
    this._showRoomDropdown = false;
    this._showAssigneeDropdown = false;
    this._activeChoreMenu = null;
    // Modal system
    this._activeModal = null;
    this._modalData = {};
    // Individual modal states
    this._showAddRoomModal = false;
    this._showManageRoomsModal = false;
    this._showAddUserModal = false;
    this._showManageUsersModal = false;
    this._showEditUserModal = false;
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

    this._commonUserAvatars = [
      { icon: 'mdi:account', label: 'Default' },
      { icon: 'mdi:account-child', label: 'Child' },
      { icon: 'mdi:account-tie', label: 'Adult' },
      { icon: 'mdi:face-woman', label: 'Woman' },
      { icon: 'mdi:face-man', label: 'Man' },
      { icon: 'mdi:baby-face', label: 'Baby' },
      { icon: 'mdi:human-male-boy', label: 'Boy' },
      { icon: 'mdi:human-female-girl', label: 'Girl' },
      { icon: 'mdi:account-cowboy-hat', label: 'Custom 1' },
      { icon: 'mdi:account-hard-hat', label: 'Custom 2' },
      { icon: 'mdi:account-heart', label: 'Custom 3' },
      { icon: 'mdi:account-star', label: 'Custom 4' },
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
    // ESC key - close any open dropdown or modal
    if (e.key === 'Escape') {
      // Close dropdowns first
      if (this._showRoomDropdown || this._showAssigneeDropdown || this._activeChoreMenu) {
        this._closeAllDropdowns();
        return;
      }
      // Then close modals
      if (this._showAddRoomModal) {
        this._closeAddRoomModal();
      } else if (this._showManageRoomsModal) {
        this._closeManageRoomsModal();
      } else if (this._showAddUserModal) {
        this._closeAddUserModal();
      } else if (this._showManageUsersModal) {
        this._closeManageUsersModal();
      } else if (this._showEditUserModal) {
        this._closeEditUserModal();
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
        } else if (this._showAddUserModal) {
          this._submitAddUser();
        } else if (this._showEditUserModal) {
          this._submitEditUser();
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
      user: {
        id: "",
        name: "",
        avatar: "mdi:account"
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
    } else if (formType === 'user') {
      this._formData.user = { id: "", name: "", avatar: "mdi:account" };
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

  static getConfigElement() {
    return document.createElement("simple-chores-card-editor");
  }

  setConfig(config) {
    this.config = {
      show_completed: false,
      default_room: "all",
      full_width: false,
      default_view: "list",
      my_chores_default: false,
      title: "Simple Chores",
      hide_stats: false,
      compact_mode: false,
      ...config
    };

    // Apply config to initial state if not already set
    if (this._currentView === "list" && this.config.default_view === "calendar") {
      this._currentView = "calendar";
    }
    if (!this._showMyChoresOnly && this.config.my_chores_default) {
      this._showMyChoresOnly = true;
    }
    if (this._selectedRoom === "all" && this.config.default_room !== "all") {
      this._selectedRoom = this.config.default_room;
    }
  }

  getCardSize() {
    // Return larger size for full-width mode to help HA allocate space
    return this.config?.full_width ? 8 : 6;
  }

  render() {
    if (!this.hass || !this.config) {
      return html``;
    }

    const dueToday = this._getDueChores("today");
    const dueThisWeek = this._getDueChores("week");
    const rooms = this._getRooms();
    const users = this._getUsers();

    const cardClasses = [
      this.config.full_width ? 'full-width' : '',
      this.config.compact_mode ? 'compact' : ''
    ].filter(Boolean).join(' ');

    // Get selected room name for dropdown button
    const selectedRoomName = this._selectedRoom === 'all'
      ? 'All Rooms'
      : (rooms.find(r => r.id === this._selectedRoom)?.name || 'All Rooms');

    // Get selected assignee name for dropdown button
    const selectedAssigneeName = this._getSelectedAssigneeName(users);

    return html`
      <ha-card class="${cardClasses}">
        <div class="card-header" @click=${this._handleHeaderClick}>
          <!-- Top row: Title + Add Chore button -->
          <div class="header-top-row">
            <div class="card-title">${this.config.title}</div>
            <button class="add-chore-btn-primary" @click=${this._openAddChoreModal} title="Add New Chore">
              <ha-icon icon="mdi:plus"></ha-icon>
              <span>Add Chore</span>
            </button>
          </div>

          <!-- Bottom row: Dropdowns + Icon buttons -->
          <div class="header-bottom-row">
            <div class="header-dropdowns">
              <!-- Room Dropdown -->
              <div class="dropdown-container">
                <button
                  class="dropdown-btn"
                  @click=${this._toggleRoomDropdown}
                >
                  <ha-icon icon="mdi:home"></ha-icon>
                  <span>${selectedRoomName}</span>
                  <ha-icon icon="mdi:chevron-down" class="chevron"></ha-icon>
                </button>
                ${this._showRoomDropdown ? html`
                  <div class="dropdown-menu">
                    <div class="dropdown-section">
                      <div
                        class="dropdown-item ${this._selectedRoom === 'all' ? 'active' : ''}"
                        @click=${() => this._selectRoom('all')}
                      >
                        All Rooms
                      </div>
                      ${rooms.map(room => html`
                        <div
                          class="dropdown-item ${this._selectedRoom === room.id ? 'active' : ''}"
                          @click=${() => this._selectRoom(room.id)}
                        >
                          ${room.name}
                        </div>
                      `)}
                    </div>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-section">
                      <div class="dropdown-item action-item" @click=${this._openAddRoomModalFromDropdown}>
                        <ha-icon icon="mdi:plus"></ha-icon>
                        Add Room
                      </div>
                      <div class="dropdown-item action-item" @click=${this._openManageRoomsModalFromDropdown}>
                        <ha-icon icon="mdi:cog"></ha-icon>
                        Manage Rooms
                      </div>
                    </div>
                  </div>
                ` : ''}
              </div>

              <!-- Assignee Dropdown -->
              <div class="dropdown-container">
                <button
                  class="dropdown-btn"
                  @click=${this._toggleAssigneeDropdown}
                >
                  <ha-icon icon="mdi:account"></ha-icon>
                  <span>${selectedAssigneeName}</span>
                  <ha-icon icon="mdi:chevron-down" class="chevron"></ha-icon>
                </button>
                ${this._showAssigneeDropdown ? html`
                  <div class="dropdown-menu">
                    <div class="dropdown-section">
                      <div
                        class="dropdown-item ${this._selectedAssignee === 'all' ? 'active' : ''}"
                        @click=${() => this._selectAssignee('all')}
                      >
                        Anyone
                      </div>
                      <div
                        class="dropdown-item ${this._selectedAssignee === 'mine' ? 'active' : ''}"
                        @click=${() => this._selectAssignee('mine')}
                      >
                        My Chores
                      </div>
                      ${users.map(user => html`
                        <div
                          class="dropdown-item ${this._selectedAssignee === user.id ? 'active' : ''}"
                          @click=${() => this._selectAssignee(user.id)}
                        >
                          ${user.name}
                        </div>
                      `)}
                    </div>
                    <div class="dropdown-divider"></div>
                    <div class="dropdown-section">
                      <div class="dropdown-item action-item" @click=${this._openAddUserModalFromDropdown}>
                        <ha-icon icon="mdi:plus"></ha-icon>
                        Add User
                      </div>
                      <div class="dropdown-item action-item" @click=${this._openManageUsersModalFromDropdown}>
                        <ha-icon icon="mdi:cog"></ha-icon>
                        Manage Users
                      </div>
                    </div>
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- Icon buttons -->
            <div class="header-icon-buttons">
              <button
                class="icon-btn ${this._currentView === 'calendar' ? 'active' : ''}"
                @click=${this._toggleView}
                title="${this._currentView === 'list' ? 'Switch to Calendar View' : 'Switch to List View'}"
              >
                <ha-icon icon="mdi:calendar"></ha-icon>
              </button>
              <button class="icon-btn" @click=${this._openHistoryModal} title="View Completion History">
                <ha-icon icon="mdi:history"></ha-icon>
              </button>
            </div>
          </div>
        </div>

        <div class="card-content" @click=${this._handleContentClick}>
          ${this._currentView === 'list' ? html`
            ${!this.config.hide_stats ? this._renderStats() : ''}
            ${this._renderChoreList(dueToday, "Due Today")}
            ${this._renderChoreList(dueThisWeek, "Due in Next 7 Days")}
          ` : html`
            ${this._renderCalendarView()}
          `}
        </div>

        ${this._renderAddRoomModal()}
        ${this._renderManageRoomsModal()}
        ${this._renderAddUserModal()}
        ${this._renderManageUsersModal()}
        ${this._renderEditUserModal()}
        ${this._renderAddChoreModal()}
        ${this._renderEditChoreModal()}
        ${this._renderAllChoresModal()}
        ${this._renderHistoryModal()}
        ${this._renderCompleteChoreModal()}
      </ha-card>
    `;
  }

  _getSelectedAssigneeName(users) {
    if (this._selectedAssignee === 'all') return 'Anyone';
    if (this._selectedAssignee === 'mine') return 'My Chores';
    const user = users.find(u => u.id === this._selectedAssignee);
    return user ? user.name : 'Anyone';
  }

  _handleHeaderClick(e) {
    // Close dropdowns when clicking outside of them
    if (!e.target.closest('.dropdown-container')) {
      this._closeAllDropdowns();
    }
  }

  _closeAllDropdowns() {
    this._showRoomDropdown = false;
    this._showAssigneeDropdown = false;
    this._activeChoreMenu = null;
  }

  _handleContentClick(e) {
    // Close chore overflow menus when clicking elsewhere
    if (!e.target.closest('.chore-menu-container')) {
      this._activeChoreMenu = null;
    }
  }

  _toggleRoomDropdown(e) {
    e.stopPropagation();
    this._showAssigneeDropdown = false;
    this._activeChoreMenu = null;
    this._showRoomDropdown = !this._showRoomDropdown;
  }

  _toggleAssigneeDropdown(e) {
    e.stopPropagation();
    this._showRoomDropdown = false;
    this._activeChoreMenu = null;
    this._showAssigneeDropdown = !this._showAssigneeDropdown;
  }

  _selectRoom(roomId) {
    this._selectedRoom = roomId;
    this._showRoomDropdown = false;
  }

  _selectAssignee(assigneeId) {
    this._selectedAssignee = assigneeId;
    // Update legacy flag for compatibility
    this._showMyChoresOnly = assigneeId === 'mine';
    this._showAssigneeDropdown = false;
  }

  _openAddRoomModalFromDropdown(e) {
    e.stopPropagation();
    this._showRoomDropdown = false;
    this._openAddRoomModal();
  }

  _openManageRoomsModalFromDropdown(e) {
    e.stopPropagation();
    this._showRoomDropdown = false;
    this._openManageRoomsModal();
  }

  _openAddUserModalFromDropdown(e) {
    e.stopPropagation();
    this._showAssigneeDropdown = false;
    this._openAddUserModal();
  }

  _openManageUsersModalFromDropdown(e) {
    e.stopPropagation();
    this._showAssigneeDropdown = false;
    this._openManageUsersModal();
  }

  _renderStats() {
    const dueToday = this.hass.states[SimpleChoresCard.SENSORS.DUE_TODAY]?.state || "0";
    const overdue = this.hass.states[SimpleChoresCard.SENSORS.OVERDUE]?.state || "0";
    const total = this.hass.states[SimpleChoresCard.SENSORS.TOTAL]?.state || "0";

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
    const roomFiltered = this._filterChoresByRoom(chores);
    const filteredChores = this._filterChoresByUser(roomFiltered);

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


  /**
   * Render a chore card with the compact inline layout.
   * @param {Object} chore - The chore data
   * @param {Object} options - Optional configuration
   * @param {boolean} options.inModal - Whether rendering inside a modal (uses modal-specific handlers)
   * @param {boolean} options.showFrequency - Whether to show the frequency in metadata
   */
  _renderChore(chore, options = {}) {
    const { inModal = false, showFrequency = false } = options;

    // Handle different property names from different data sources
    let dueDate = chore.next_due || chore.due_date || chore.date;

    // Fix for Due Today chores - if no specific date, use today's date
    if (!dueDate) {
      dueDate = new Date().toISOString().split('T')[0];
    }

    // Use consolidated room lookup logic
    const roomName = this._resolveRoomName(chore);

    // Get assigned user info
    const assignedTo = chore.assigned_to;
    let assignedUserName = null;
    if (assignedTo) {
      const users = this._getUsers();
      const assignedUser = users.find(u => u.id === assignedTo);
      assignedUserName = assignedUser ? assignedUser.name : assignedTo;
    }

    const isOverdue = new Date(dueDate) < new Date().setHours(0,0,0,0);
    const isMenuOpen = this._activeChoreMenu === chore.id;

    // Use modal-specific handlers if in modal context
    const completeHandler = inModal
      ? () => this._openCompleteChoreModalFromAllChores(chore)
      : () => this._openCompleteChoreModal(chore);
    const snoozeHandler = inModal
      ? () => this._snoozeChoreFromModal(chore.id)
      : () => this._snoozeChore(chore.id);
    const skipHandler = inModal
      ? () => this._skipChoreFromModal(chore.id)
      : () => this._skipChore(chore.id);
    const editHandler = inModal
      ? () => this._editChoreFromModal(chore)
      : () => this._editChore(chore);
    const deleteHandler = inModal
      ? () => this._deleteChoreFromModal(chore.id, chore.name)
      : () => this._deleteChore(chore.id, chore.name);

    return html`
      <div class="chore-card ${isOverdue ? 'overdue' : ''}">
        <div class="chore-card-content">
          <div class="chore-card-info">
            <div class="chore-card-name">${chore.name}</div>
            <div class="chore-card-meta">
              <span class="chore-meta-item">
                <ha-icon icon="mdi:home" class="meta-icon"></ha-icon>
                ${roomName}
              </span>
              <span class="chore-meta-separator">·</span>
              <span class="chore-meta-item ${isOverdue ? 'overdue-text' : ''}">
                Due: ${this._formatDate(dueDate)}
              </span>
              ${showFrequency ? html`
                <span class="chore-meta-separator">·</span>
                <span class="chore-meta-item">${this._formatFrequency(chore.frequency)}</span>
              ` : ''}
              ${assignedUserName ? html`
                <span class="chore-meta-separator">·</span>
                <span class="chore-meta-item">
                  <ha-icon icon="mdi:account" class="meta-icon"></ha-icon>
                  ${assignedUserName}
                </span>
              ` : ''}
            </div>
          </div>
          <div class="chore-card-actions">
            <button
              class="chore-action-btn complete"
              @click=${completeHandler}
              title="Complete"
            >
              <ha-icon icon="mdi:check"></ha-icon>
            </button>
            <button
              class="chore-action-btn secondary"
              @click=${snoozeHandler}
              title="Snooze 1 day"
            >
              <ha-icon icon="mdi:clock-outline"></ha-icon>
            </button>
            <button
              class="chore-action-btn secondary"
              @click=${skipHandler}
              title="Skip to next"
            >
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </button>
            <div class="chore-menu-container">
              <button
                class="chore-action-btn secondary"
                @click=${(e) => this._toggleChoreMenu(e, chore.id)}
                title="More actions"
              >
                <ha-icon icon="mdi:dots-horizontal"></ha-icon>
              </button>
              ${isMenuOpen ? html`
                <div class="chore-overflow-menu">
                  <div class="overflow-menu-item" @click=${() => { this._activeChoreMenu = null; editHandler(); }}>
                    <ha-icon icon="mdi:pencil"></ha-icon>
                    Edit
                  </div>
                  <div class="overflow-menu-item danger" @click=${() => { this._activeChoreMenu = null; deleteHandler(); }}>
                    <ha-icon icon="mdi:trash-can"></ha-icon>
                    Delete
                  </div>
                </div>
              ` : ''}
            </div>
          </div>
        </div>
      </div>
    `;
  }

  _toggleChoreMenu(e, choreId) {
    e.stopPropagation();
    this._showRoomDropdown = false;
    this._showAssigneeDropdown = false;
    this._activeChoreMenu = this._activeChoreMenu === choreId ? null : choreId;
  }

  /**
   * Calculate the next occurrence date based on frequency.
   * @param {Date} fromDate - The starting date
   * @param {string} frequency - The frequency (daily, weekly, monthly, etc.)
   * @returns {Date|null} - The next occurrence date, or null for one-off chores
   */
  _calculateNextOccurrence(fromDate, frequency) {
    const date = new Date(fromDate);

    switch (frequency) {
      case 'daily':
        date.setDate(date.getDate() + 1);
        break;
      case 'weekly':
        date.setDate(date.getDate() + 7);
        break;
      case 'biweekly':
        date.setDate(date.getDate() + 14);
        break;
      case 'monthly':
        date.setMonth(date.getMonth() + 1);
        break;
      case 'bimonthly':
        date.setMonth(date.getMonth() + 2);
        break;
      case 'quarterly':
        date.setMonth(date.getMonth() + 3);
        break;
      case 'biannual':
        date.setMonth(date.getMonth() + 6);
        break;
      case 'yearly':
        date.setFullYear(date.getFullYear() + 1);
        break;
      case 'once':
        return null; // One-off chores don't recur
      default:
        return null;
    }

    return date;
  }

  /**
   * Generate simulated future occurrences for a chore.
   * @param {Object} chore - The chore object
   * @param {Date} endDate - The end date to generate occurrences until
   * @returns {Array} - Array of simulated occurrence objects
   */
  _generateFutureOccurrences(chore, endDate) {
    const occurrences = [];
    const frequency = chore.frequency;

    // Don't generate for one-off chores
    if (frequency === 'once') {
      return occurrences;
    }

    const startDate = new Date(chore.next_due || chore.due_date);
    let currentDate = this._calculateNextOccurrence(startDate, frequency);

    // Generate up to 12 future occurrences or until endDate
    let count = 0;
    const maxOccurrences = 12;

    while (currentDate && currentDate <= endDate && count < maxOccurrences) {
      occurrences.push({
        ...chore,
        next_due: currentDate.toISOString().split('T')[0],
        isProjected: true, // Flag to indicate this is a simulated occurrence
      });

      currentDate = this._calculateNextOccurrence(currentDate, frequency);
      count++;
    }

    return occurrences;
  }

  _renderCalendarView() {
    const allChores = this._getAllChores();
    const roomFiltered = this._filterChoresByRoom(allChores);
    const filteredChores = this._filterChoresByUser(roomFiltered);

    // Apply optimistic updates
    const choresWithOptimistic = filteredChores.map(chore => {
      if (this._optimisticChoreUpdates[chore.id]) {
        return { ...chore, next_due: this._optimisticChoreUpdates[chore.id] };
      }
      return chore;
    });

    // Get completion history for showing completed chores
    const completionHistory = this._getCompletionHistorySync();

    // Calendar navigation
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Get first and last day of month
    const firstDay = new Date(this._calendarYear, this._calendarMonth, 1);
    const lastDay = new Date(this._calendarYear, this._calendarMonth + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    // Create calendar grid
    const weeks = [];
    let currentWeek = [];

    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      currentWeek.push(null);
    }

    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Add empty cells for remaining days
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    // Calculate end date for projections (3 months ahead)
    const projectionEndDate = new Date(this._calendarYear, this._calendarMonth + 3, 0);

    // Group chores by date (using optimistically updated chores)
    const choresByDate = {};
    choresWithOptimistic.forEach(chore => {
      const dueDate = chore.next_due || chore.due_date;
      if (dueDate) {
        const dateKey = dueDate.split('T')[0]; // Get YYYY-MM-DD part
        if (!choresByDate[dateKey]) {
          choresByDate[dateKey] = [];
        }
        choresByDate[dateKey].push({ ...chore, isCompleted: false, isProjected: false });
      }

      // Generate and add future occurrences
      const futureOccurrences = this._generateFutureOccurrences(chore, projectionEndDate);
      futureOccurrences.forEach(occurrence => {
        const dateKey = occurrence.next_due;
        if (!choresByDate[dateKey]) {
          choresByDate[dateKey] = [];
        }
        choresByDate[dateKey].push({ ...occurrence, isCompleted: false });
      });
    });

    // Group completed chores by completion date
    const completedByDate = {};
    completionHistory.forEach(entry => {
      if (entry.completed_at) {
        const dateKey = entry.completed_at.split('T')[0];
        if (!completedByDate[dateKey]) {
          completedByDate[dateKey] = [];
        }
        completedByDate[dateKey].push({
          ...entry,
          id: entry.chore_id,
          name: entry.chore_name,
          isCompleted: true
        });
      }
    });

    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    return html`
      <div class="calendar-view">
        <div class="calendar-header">
          <button @click=${this._previousMonth} class="calendar-nav-btn">
            <ha-icon icon="mdi:chevron-left"></ha-icon>
          </button>
          <h3>${monthNames[this._calendarMonth]} ${this._calendarYear}</h3>
          <button @click=${this._nextMonth} class="calendar-nav-btn">
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </button>
        </div>

        <div class="calendar-grid">
          ${dayNames.map(day => html`
            <div class="calendar-day-header">${day}</div>
          `)}

          ${weeks.map(week => week.map(day => {
            if (!day) {
              return html`<div class="calendar-cell empty"></div>`;
            }

            const dateStr = `${this._calendarYear}-${String(this._calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const choresOnDate = choresByDate[dateStr] || [];
            const completedOnDate = completedByDate[dateStr] || [];
            const isToday = dateStr === todayStr;
            const isPast = new Date(dateStr) < new Date(todayStr);

            return html`
              <div
                class="calendar-cell ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}"
                data-date="${dateStr}"
                @dragover=${this._handleDragOver}
                @drop=${this._handleDrop}
              >
                <div class="calendar-day-number">${day}</div>
                <div class="calendar-chores">
                  ${choresOnDate.map(chore => {
                    const isProjected = chore.isProjected || false;
                    const isOverdue = isPast && !isProjected;
                    const roomName = chore.room_name || this._getRoomName(chore.room_id) || '';
                    return html`
                      <div
                        class="calendar-chore ${isOverdue ? 'overdue' : ''} ${isProjected ? 'projected' : ''}"
                        draggable="${isProjected ? 'false' : 'true'}"
                        @dragstart=${(e) => isProjected ? e.preventDefault() : this._handleDragStart(e, chore)}
                        @click=${() => isProjected ? null : this._openCompleteChoreModal(chore)}
                        title="${chore.name}${roomName ? ` - ${roomName}` : ''}${isProjected ? ' (Projected)' : ''}"
                      >
                        <span class="calendar-chore-name">${chore.name}</span>
                        ${roomName ? html`<span class="calendar-chore-room">${roomName}</span>` : ''}
                      </div>
                    `;
                  })}
                  ${completedOnDate.map(completed => {
                    const roomName = completed.room_name || '';
                    return html`
                      <div
                        class="calendar-chore completed"
                        title="${completed.name}${roomName ? ` - ${roomName}` : ''} - Completed${completed.completed_by_name ? ` by ${completed.completed_by_name}` : ''}"
                      >
                        <div class="calendar-chore-content">
                          <ha-icon icon="mdi:check" class="completed-icon"></ha-icon>
                          <span class="calendar-chore-name">${completed.name}</span>
                        </div>
                        ${roomName ? html`<span class="calendar-chore-room">${roomName}</span>` : ''}
                      </div>
                    `;
                  })}
                </div>
              </div>
            `;
          }))}
        </div>

        <div class="calendar-legend">
          <span class="legend-item">
            <span class="legend-box today"></span> Today
          </span>
          <span class="legend-item">
            <span class="legend-box overdue"></span> Overdue
          </span>
          <span class="legend-item">
            <span class="legend-box normal"></span> Upcoming
          </span>
          <span class="legend-item">
            <span class="legend-box completed"></span> Completed
          </span>
          <span class="legend-item">
            <span class="legend-box projected"></span> Projected
          </span>
        </div>
      </div>
    `;
  }

  _previousMonth() {
    if (this._calendarMonth === 0) {
      this._calendarMonth = 11;
      this._calendarYear--;
    } else {
      this._calendarMonth--;
    }
  }

  _nextMonth() {
    if (this._calendarMonth === 11) {
      this._calendarMonth = 0;
      this._calendarYear++;
    } else {
      this._calendarMonth++;
    }
  }

  _handleDragStart(e, chore) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('chore', JSON.stringify(chore));
  }

  _handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  async _handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();

    const choreData = e.dataTransfer.getData('chore');
    if (!choreData) return;

    const chore = JSON.parse(choreData);
    const newDateStr = e.currentTarget.dataset.date;

    if (!newDateStr) return;

    // Store original date in case we need to revert
    const originalDate = chore.next_due || chore.due_date;

    // Optimistically update the UI immediately
    this._optimisticChoreUpdates = {
      ...this._optimisticChoreUpdates,
      [chore.id]: newDateStr
    };
    this.requestUpdate();

    // Update chore due date
    try {
      await this.hass.callService("simple_chores", "update_chore", {
        chore_id: chore.id,
        next_due: newDateStr
      });

      // Wait a bit for the state to update, then clear optimistic update
      setTimeout(() => {
        const updates = { ...this._optimisticChoreUpdates };
        delete updates[chore.id];
        this._optimisticChoreUpdates = updates;
        this.requestUpdate();
      }, 1000);

      this._showToast(`${chore.name} rescheduled to ${this._formatDate(newDateStr)}`);
    } catch (error) {
      console.error("Error rescheduling chore:", error);

      // Revert optimistic update on error
      const updates = { ...this._optimisticChoreUpdates };
      delete updates[chore.id];
      this._optimisticChoreUpdates = updates;
      this.requestUpdate();

      this._showToast("Error rescheduling chore. Please try again.");
    }
  }

  // Sensor entity IDs - must match const.py
  static get SENSORS() {
    return {
      DUE_TODAY: "sensor.chores_due_today",
      DUE_NEXT_7_DAYS: "sensor.chores_due_next_7_days",
      OVERDUE: "sensor.overdue_chores",
      TOTAL: "sensor.total_chores",
    };
  }

  _getDueChores(period) {
    if (!this.hass) return [];

    const sensorName = period === "today" ?
      SimpleChoresCard.SENSORS.DUE_TODAY :
      SimpleChoresCard.SENSORS.DUE_NEXT_7_DAYS;

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
      if (sensorName === SimpleChoresCard.SENSORS.DUE_TODAY && !processedChore.next_due) {
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

    // Try to get users from sensor attributes
    const sensor = this.hass.states[SimpleChoresCard.SENSORS.TOTAL];
    if (sensor && sensor.attributes && sensor.attributes.users) {
      users = sensor.attributes.users;
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

      // Get rooms from total sensor
      const sensor = this.hass.states[SimpleChoresCard.SENSORS.TOTAL];
      if (sensor && sensor.attributes && sensor.attributes.rooms) {
        rooms = sensor.attributes.rooms;
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

  /**
   * Formats frequency values for display.
   * @param {string} frequency - The frequency value
   * @returns {string} Formatted frequency label
   */
  _formatFrequency(frequency) {
    const frequencyLabels = {
      once: 'Once',
      daily: 'Daily',
      weekly: 'Weekly',
      biweekly: 'Bi-Weekly',
      monthly: 'Monthly',
      bimonthly: 'Bi-Monthly',
      quarterly: 'Quarterly',
      biannual: 'Bi-Annual',
      yearly: 'Yearly'
    };
    return frequencyLabels[frequency] || frequency || 'Unknown';
  }

  _roomChanged(e) {
    this._selectedRoom = e.target.value;
  }

  _toggleMyChoresFilter() {
    this._showMyChoresOnly = !this._showMyChoresOnly;
  }

  _toggleView() {
    this._currentView = this._currentView === 'list' ? 'calendar' : 'list';
  }

  _filterChoresByUser(chores) {
    // 'all' means show all chores (no filter)
    if (this._selectedAssignee === 'all') return chores;

    // 'mine' means show only chores assigned to the current user
    if (this._selectedAssignee === 'mine') {
      if (!this.hass || !this.hass.user) return chores;
      const currentUserId = this.hass.user.id;
      return chores.filter(chore => chore.assigned_to === currentUserId);
    }

    // Otherwise filter by specific user ID
    return chores.filter(chore => chore.assigned_to === this._selectedAssignee);
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

  _selectUserAvatar(avatar) {
    this._handleFormInput('user', 'avatar', avatar);
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

      // Invalidate cache immediately to force fresh data on next render
      this._invalidateCache('rooms');

      // Wait for coordinator to refresh and sensor to update
      await new Promise(resolve => setTimeout(resolve, 500));

      // Force UI update with fresh data
      this.requestUpdate();
    } catch (error) {
      console.error("Simple Chores Card: Failed to delete room:", error);
      this._showToast(`Error deleting room: ${error.message}`);
    } finally {
      this._isLoading = false;
    }
  }

  // ===== User Management Methods =====

  /**
   * Opens the Add User modal and resets the user form.
   * Automatically focuses the user name input field after rendering.
   */
  _openAddUserModal() {
    this._showAddUserModal = true;
    this._resetForm('user');

    // Focus first input after modal renders
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('#user-name');
      if (input) input.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _closeAddUserModal() {
    this._showAddUserModal = false;
    this._resetForm('user');
  }

  async _submitAddUser() {
    // Validate form
    const validation = this._validateForm('user', ['name']);
    if (!validation.valid) {
      this._showToast(validation.message);
      return;
    }

    if (!this._showAddUserModal) {
      return;
    }

    this._isLoading = true;
    try {
      const serviceData = {
        name: this._formData.user.name.trim(),
        avatar: this._formData.user.avatar || "mdi:account"
      };

      console.log("Simple Chores Card: Calling add_user service with data:", serviceData);
      console.log("Simple Chores Card: Service domain: simple_chores, service: add_user");

      await this.hass.callService("simple_chores", "add_user", serviceData);

      this._showToast(`User "${this._formData.user.name}" added successfully!`);

      // Wait for coordinator to refresh and sensor to update
      await new Promise(resolve => setTimeout(resolve, 500));

      this._invalidateCache('users');
      this._closeAddUserModal();
      this.requestUpdate();
    } catch (error) {
      console.error("Simple Chores Card: Failed to add user:", error);
      console.error("Simple Chores Card: Error details:", JSON.stringify(error, null, 2));
      const message = this._parseErrorMessage(error, 'adding user');
      this._showToast(message);
    } finally {
      this._isLoading = false;
    }
  }

  _openManageUsersModal() {
    this._showManageUsersModal = true;
  }

  _closeManageUsersModal() {
    this._showManageUsersModal = false;
  }

  async _deleteUser(userId, userName) {
    if (!confirm(`Are you sure you want to delete the user "${userName}"? Chores assigned to this user will remain but show the user ID instead.`)) {
      return;
    }

    this._isLoading = true;
    try {
      await this.hass.callService("simple_chores", "remove_user", {
        user_id: userId
      });

      this._showToast(`User "${userName}" deleted successfully!`);

      // Invalidate cache immediately to force fresh data on next render
      this._invalidateCache('users');

      // First update to show loading/optimistic state
      this.requestUpdate();

      // Wait for coordinator to refresh and sensor to update
      await new Promise(resolve => setTimeout(resolve, 800));

      // Invalidate again and update with fresh data from sensor
      this._invalidateCache('users');
      this.requestUpdate();
    } catch (error) {
      console.error("Simple Chores Card: Failed to delete user:", error);
      this._showToast(`Error deleting user: ${error.message}`);
    } finally {
      this._isLoading = false;
    }
  }

  _openEditUserModal(user) {
    this._formData.user = {
      id: user.id,
      name: user.name,
      avatar: user.avatar || "mdi:account"
    };
    this._showEditUserModal = true;

    // Focus first input after modal renders
    setTimeout(() => {
      const input = this.shadowRoot.querySelector('#edit-user-name');
      if (input) input.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _closeEditUserModal() {
    this._showEditUserModal = false;
    this._resetForm('user');
  }

  async _submitEditUser() {
    // Validate form
    const validation = this._validateForm('user', ['id', 'name']);
    if (!validation.valid) {
      this._showToast(validation.message);
      return;
    }

    if (!this._showEditUserModal) {
      return;
    }

    this._isLoading = true;
    try {
      await this.hass.callService("simple_chores", "update_user", {
        user_id: this._formData.user.id,
        name: this._formData.user.name.trim(),
        avatar: this._formData.user.avatar || "mdi:account"
      });

      this._showToast(`User "${this._formData.user.name}" updated successfully!`);

      // Wait for coordinator to refresh and sensor to update
      await new Promise(resolve => setTimeout(resolve, 500));

      this._invalidateCache('users');
      this._closeEditUserModal();
      this.requestUpdate();
    } catch (error) {
      console.error("Simple Chores Card: Failed to update user:", error);
      const message = this._parseErrorMessage(error, 'updating user');
      this._showToast(message);
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

  _renderAddUserModal() {
    if (!this._showAddUserModal) {
      return html``;
    }

    return html`
      <div class="modal-overlay" @click=${this._closeAddUserModal}>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="add-user-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="add-user-title">Add Custom User</h3>
            <button class="close-btn" @click=${this._closeAddUserModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="user-name">Name *</label>
              <input
                type="text"
                id="user-name"
                .value=${this._formData.user.name}
                @input=${(e) => this._handleFormInput('user', 'name', e.target.value)}
                placeholder="Enter user name"
                required
              />
              <small>Name of the user (e.g., "John Doe")</small>
            </div>
            <div class="form-group">
              <label>Avatar Icon</label>
              <div class="icon-picker">
                <div class="icon-preview">
                  <ha-icon icon="${this._formData.user.avatar || 'mdi:account'}"></ha-icon>
                  <span>${this._formData.user.avatar || 'mdi:account'}</span>
                </div>
                <div class="icon-grid">
                  ${this._commonUserAvatars.map(item => html`
                    <button
                      type="button"
                      class="icon-option ${this._formData.user.avatar === item.icon ? 'selected' : ''}"
                      @click=${() => this._selectUserAvatar(item.icon)}
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
                    .value=${this._formData.user.avatar}
                    @input=${(e) => this._handleFormInput('user', 'avatar', e.target.value)}
                    placeholder="mdi:account-custom"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeAddUserModal} ?disabled=${this._isLoading}>Cancel</button>
            <button
              class="submit-btn ${this._isLoading ? 'loading' : ''}"
              @click=${this._submitAddUser}
              ?disabled=${!this._formData.user.name?.trim() || this._isLoading}>
              ${this._isLoading ? html`<span class="spinner"></span>` : ''}
              Add User
            </button>
          </div>
        </div>
      </div>
    `;
  }

  _renderManageUsersModal() {
    if (!this._showManageUsersModal) {
      return html``;
    }

    const users = this._getUsers();
    const customUsers = users.filter(user => user.is_custom);

    return html`
      <div class="modal-overlay" @click=${this._closeManageUsersModal}>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="manage-users-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="manage-users-title">Manage Custom Users</h3>
            <button class="close-btn" @click=${this._closeManageUsersModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            ${customUsers.length === 0 ? html`
              <p class="no-custom-users">No custom users found. Use the + button to add users.</p>
            ` : html`
              <div class="user-list">
                ${customUsers.map(user => html`
                  <div class="user-item">
                    <div class="user-info">
                      <ha-icon icon="${user.avatar || 'mdi:account'}"></ha-icon>
                      <span class="user-name">${user.name}</span>
                    </div>
                    <div class="user-actions">
                      <button
                        class="edit-user-btn"
                        @click=${() => this._openEditUserModal(user)}
                        title="Edit User"
                      >
                        <ha-icon icon="mdi:pencil"></ha-icon>
                      </button>
                      <button
                        class="delete-user-btn"
                        @click=${() => this._deleteUser(user.id, user.name)}
                        title="Delete User"
                      >
                        <ha-icon icon="mdi:delete"></ha-icon>
                      </button>
                    </div>
                  </div>
                `)}
              </div>
            `}
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeManageUsersModal}>Close</button>
          </div>
        </div>
      </div>
    `;
  }

  _renderEditUserModal() {
    if (!this._showEditUserModal) {
      return html``;
    }

    return html`
      <div class="modal-overlay" @click=${this._closeEditUserModal}>
        <div class="modal-content" role="dialog" aria-modal="true" aria-labelledby="edit-user-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="edit-user-title">Edit User</h3>
            <button class="close-btn" @click=${this._closeEditUserModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label for="edit-user-name">Name *</label>
              <input
                type="text"
                id="edit-user-name"
                .value=${this._formData.user.name}
                @input=${(e) => this._handleFormInput('user', 'name', e.target.value)}
                required
              />
            </div>
            <div class="form-group">
              <label>Avatar Icon</label>
              <div class="icon-picker">
                <div class="icon-preview">
                  <ha-icon icon="${this._formData.user.avatar || 'mdi:account'}"></ha-icon>
                  <span>${this._formData.user.avatar || 'mdi:account'}</span>
                </div>
                <div class="icon-grid">
                  ${this._commonUserAvatars.map(item => html`
                    <button
                      type="button"
                      class="icon-option ${this._formData.user.avatar === item.icon ? 'selected' : ''}"
                      @click=${() => this._selectUserAvatar(item.icon)}
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
                    .value=${this._formData.user.avatar}
                    @input=${(e) => this._handleFormInput('user', 'avatar', e.target.value)}
                    placeholder="mdi:account-custom"
                  />
                </div>
              </div>
            </div>
          </div>
          <div class="modal-footer">
            <button class="cancel-btn" @click=${this._closeEditUserModal} ?disabled=${this._isLoading}>Cancel</button>
            <button
              class="submit-btn ${this._isLoading ? 'loading' : ''}"
              @click=${this._submitEditUser}
              ?disabled=${!this._formData.user.name?.trim() || this._isLoading}>
              ${this._isLoading ? html`<span class="spinner"></span>` : ''}
              Update User
            </button>
          </div>
        </div>
      </div>
    `;
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
                <option value="once">Once (one-time only)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-Weekly (Every 2 weeks)</option>
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Bi-Monthly (Every 2 months)</option>
                <option value="quarterly">Quarterly (Every 3 months)</option>
                <option value="biannual">Bi-Annual (Every 6 months)</option>
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
                <option value="once">Once (one-time only)</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="biweekly">Bi-Weekly (Every 2 weeks)</option>
                <option value="monthly">Monthly</option>
                <option value="bimonthly">Bi-Monthly (Every 2 months)</option>
                <option value="quarterly">Quarterly (Every 3 months)</option>
                <option value="biannual">Bi-Annual (Every 6 months)</option>
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
    const totalChoresSensor = this.hass.states[SimpleChoresCard.SENSORS.TOTAL];

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

    const rawChores = this._getAllChores();
    const roomFiltered = this._filterChoresByRoom(rawChores);
    const allChores = this._filterChoresByUser(roomFiltered);

    return html`
      <div class="modal-overlay" @click=${this._closeAllChoresModal}>
        <div class="modal-content large-modal" role="dialog" aria-modal="true" aria-labelledby="all-chores-title" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="all-chores-title">All Active Chores (${allChores.length})</h3>
            <button class="close-btn" @click=${this._closeAllChoresModal} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body" @click=${this._handleContentClick}>
            ${allChores.length === 0 ? html`
              <div class="no-chores">
                <p>No active chores found.</p>
                <p>Create your first chore using the + button in the header!</p>
              </div>
            ` : html`
              <div class="all-chores-list">
                ${allChores.map(chore => this._renderChore(chore, { inModal: true, showFrequency: true }))}
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

  _getRoomName(roomId, rooms = null) {
    // Use cache for frequent lookups
    if (this._cache.roomLookup.has(roomId)) {
      return this._cache.roomLookup.get(roomId);
    }

    // Get rooms if not provided
    const roomList = rooms || this._getRooms();
    const room = roomList.find(r => r.id === roomId);
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

  async _snoozeChoreFromModal(choreId) {
    this._closeAllChoresModal();
    await this._snoozeChore(choreId);
  }

  _openAllChoresModal() {
    this._showAllChoresModal = true;
  }

  _closeAllChoresModal() {
    this._showAllChoresModal = false;
  }

  _getAllChores() {
    // Use the enhanced total_chores sensor which now includes all chore data
    const totalChoresSensor = this.hass.states[SimpleChoresCard.SENSORS.TOTAL];

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

    // Get room name
    const roomName = chore.room_name || this._getRoomName(chore.room_id) || '';

    this._formData.completion = {
      choreId: chore.id,
      choreName: chore.name,
      roomName: roomName,
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

    // Get room name
    const roomName = chore.room_name || this._getRoomName(chore.room_id) || '';

    this._formData.completion = {
      choreId: chore.id,
      choreName: chore.name,
      roomName: roomName,
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

      // If reassignment is requested AND the value has changed, update the chore assignment
      // Only update if reassignTo has an actual value (not empty string)
      if (completionData.reassignTo !== undefined && completionData.reassignTo !== "") {
        const reassignData = {
          chore_id: completionData.choreId,
          assigned_to: completionData.reassignTo
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
      const totalChoresSensor = this.hass.states[SimpleChoresCard.SENSORS.TOTAL];

      if (totalChoresSensor && totalChoresSensor.attributes && totalChoresSensor.attributes.completion_history) {
        const history = totalChoresSensor.attributes.completion_history;
        // Sort by completion date (newest first)
        return history.sort((a, b) => new Date(b.completed_at) - new Date(a.completed_at));
      }

      return [];

    } catch (error) {
      console.error("Simple Chores Card: Failed to get completion history:", error);
      this._showToast("Error loading completion history");
      return [];
    }
  }

  _getCompletionHistorySync() {
    // Synchronous version for calendar rendering
    try {
      const totalChoresSensor = this.hass.states[SimpleChoresCard.SENSORS.TOTAL];

      if (totalChoresSensor && totalChoresSensor.attributes && totalChoresSensor.attributes.completion_history) {
        return totalChoresSensor.attributes.completion_history || [];
      }

      return [];
    } catch (error) {
      console.error("Simple Chores Card: Failed to get completion history sync:", error);
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
              ${this._formData.completion.roomName ? html`
                <p class="completion-room"><ha-icon icon="mdi:home"></ha-icon> ${this._formData.completion.roomName}</p>
              ` : ''}
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

  async _snoozeChore(choreId) {
    try {
      await this.hass.callService("simple_chores", "snooze_chore", {
        chore_id: choreId
      });
      this._showToast("Chore snoozed for 1 day!");
    } catch (error) {
      console.error("Simple Chores Card: Error snoozing chore:", error);
      this._showToast("Error snoozing chore. Please try again.");
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

      /* Full width mode - makes card span entire column width */
      ha-card.full-width {
        grid-column: 1 / -1;
      }

      /* Compact mode - reduced spacing for smaller displays */
      ha-card.compact .card-header {
        padding: 8px 12px;
      }

      ha-card.compact .card-title {
        font-size: 1.1em;
        margin-bottom: 8px;
      }

      ha-card.compact .card-content {
        padding: 8px;
      }

      ha-card.compact .chore-section {
        padding: 8px;
        margin-bottom: 8px;
      }

      ha-card.compact .chore-item {
        padding: 6px 8px;
      }

      ha-card.compact .stats {
        padding: 8px;
        gap: 8px;
      }

      ha-card.compact .stat {
        padding: 6px 10px;
      }

      ha-card.compact .calendar-cell {
        min-height: 60px;
        padding: 2px;
      }

      /* ============================================
         HEADER & CONTROLS (New Gradient Design)
         ============================================ */
      .card-header {
        padding: 16px;
        background: linear-gradient(to right, #06b6d4, #3b82f6);
        color: white;
        border-radius: 12px 12px 0 0;
      }

      .header-top-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }

      .card-title {
        font-size: 1.5em;
        font-weight: 600;
        margin: 0;
      }

      .add-chore-btn-primary {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.2);
        border: none;
        border-radius: 8px;
        padding: 8px 14px;
        color: white;
        font-size: 0.6em;
        font-weight: 500;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .add-chore-btn-primary:hover {
        background: rgba(255, 255, 255, 0.3);
      }

      .add-chore-btn-primary ha-icon {
        --mdc-icon-size: 18px;
      }

      .header-bottom-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .header-dropdowns {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .header-icon-buttons {
        display: flex;
        gap: 6px;
      }

      /* Dropdown styles */
      .dropdown-container {
        position: relative;
      }

      .dropdown-btn {
        display: flex;
        align-items: center;
        gap: 6px;
        background: rgba(255, 255, 255, 0.15);
        border: none;
        border-radius: 8px;
        padding: 6px 12px;
        color: white;
        font-size: 0.6em;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .dropdown-btn:hover {
        background: rgba(255, 255, 255, 0.25);
      }

      .dropdown-btn ha-icon {
        --mdc-icon-size: 18px;
      }

      .dropdown-btn .chevron {
        --mdc-icon-size: 16px;
        opacity: 0.8;
      }

      .dropdown-menu {
        position: absolute;
        top: 100%;
        left: 0;
        margin-top: 4px;
        background: var(--card-background-color);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        min-width: 180px;
        z-index: 100;
        overflow: hidden;
      }

      .dropdown-section {
        padding: 4px 0;
      }

      .dropdown-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        color: var(--primary-text-color);
        font-size: 0.6em;
        cursor: pointer;
        transition: background-color 0.15s;
      }

      .dropdown-item:hover {
        background: var(--secondary-background-color);
      }

      .dropdown-item.active {
        background: rgba(var(--rgb-primary-color), 0.1);
        color: var(--primary-color);
        font-weight: 500;
      }

      .dropdown-item ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }

      .dropdown-item.action-item {
        color: var(--primary-color);
      }

      .dropdown-item.action-item ha-icon {
        color: var(--primary-color);
      }

      .dropdown-divider {
        height: 1px;
        background: var(--divider-color);
        margin: 4px 0;
      }

      /* Icon buttons in header */
      .icon-btn {
        background: rgba(255, 255, 255, 0.1);
        border: none;
        border-radius: 8px;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .icon-btn:hover {
        background: rgba(255, 255, 255, 0.2);
      }

      .icon-btn.active {
        background: rgba(255, 255, 255, 0.3);
      }

      .icon-btn ha-icon {
        --mdc-icon-size: 20px;
      }

      /* Legacy button styles (keep for compatibility) */
      .add-room-btn, .add-chore-btn, .manage-rooms-btn, .history-btn, .my-chores-filter-btn, .view-toggle-btn, .add-user-btn, .manage-users-btn {
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

      .room-selector select {
        padding: 8px 12px;
        border: none;
        border-radius: 8px;
        background: rgba(255, 255, 255, 0.2);
        color: white;
        font-size: 14px;
        cursor: pointer;
      }

      /* ============================================
         CALENDAR VIEW
         ============================================ */
      .calendar-view {
        width: 100%;
        min-height: 400px;
      }

      .calendar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px 0;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--divider-color);
      }

      .calendar-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 500;
      }

      .calendar-nav-btn {
        background: transparent;
        border: 1px solid var(--divider-color);
        border-radius: 50%;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }

      .calendar-nav-btn:hover {
        background: var(--secondary-background-color);
        border-color: var(--primary-color);
      }

      .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 4px;
        margin-bottom: 16px;
      }

      .calendar-day-header {
        text-align: center;
        font-weight: 600;
        padding: 8px;
        color: var(--secondary-text-color);
        font-size: 0.875rem;
      }

      .calendar-cell {
        min-height: 80px;
        min-width: 0;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        padding: 4px;
        background: var(--card-background-color);
        transition: all 0.2s;
        cursor: pointer;
        overflow: hidden;
      }

      .calendar-cell:hover {
        background: var(--secondary-background-color);
        border-color: var(--primary-color);
      }

      .calendar-cell.empty {
        background: transparent;
        border-color: transparent;
        cursor: default;
      }

      .calendar-cell.today {
        background: rgba(var(--rgb-primary-color), 0.1);
        border-color: var(--primary-color);
        border-width: 2px;
      }

      .calendar-cell.past {
        opacity: 0.6;
      }

      .calendar-day-number {
        font-size: 0.875rem;
        font-weight: 500;
        padding: 4px;
        text-align: right;
      }

      .calendar-chores {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin-top: 4px;
      }

      .calendar-chore {
        background: var(--primary-color);
        color: white;
        padding: 4px 6px;
        border-radius: 3px;
        font-size: 0.75rem;
        cursor: grab;
        transition: all 0.2s;
        overflow: hidden;
      }

      .calendar-chore:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      }

      .calendar-chore:active {
        cursor: grabbing;
      }

      .calendar-chore.overdue {
        background: var(--error-color);
      }

      .calendar-chore.completed {
        background: var(--success-color, #4CAF50);
        opacity: 0.7;
        cursor: default;
      }

      .calendar-chore.completed .calendar-chore-name {
        text-decoration: line-through;
      }

      .calendar-chore.completed .completed-icon {
        --mdc-icon-size: 12px;
        flex-shrink: 0;
      }

      .calendar-chore.projected {
        background: var(--primary-color);
        opacity: 0.5;
        border: 1px dashed rgba(255, 255, 255, 0.5);
        cursor: default;
      }

      .calendar-chore.projected:hover {
        transform: none;
        box-shadow: none;
      }

      .calendar-chore-name {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .calendar-chore-room {
        display: block;
        font-size: 0.65rem;
        opacity: 0.85;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        margin-top: 1px;
      }

      .calendar-chore-content {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .calendar-legend {
        display: flex;
        gap: 16px;
        padding: 12px;
        background: var(--secondary-background-color);
        border-radius: 4px;
        flex-wrap: wrap;
      }

      .legend-item {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.875rem;
      }

      .legend-box {
        width: 16px;
        height: 16px;
        border-radius: 3px;
        border: 1px solid var(--divider-color);
      }

      .legend-box.today {
        background: rgba(var(--rgb-primary-color), 0.3);
        border-color: var(--primary-color);
      }

      .legend-box.overdue {
        background: var(--error-color);
      }

      .legend-box.normal {
        background: var(--primary-color);
      }

      .legend-box.completed {
        background: var(--success-color, #4CAF50);
        opacity: 0.7;
      }

      .legend-box.projected {
        background: var(--primary-color);
        opacity: 0.5;
        border-style: dashed;
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
        grid-template-columns: repeat(3, 1fr);
        gap: 12px;
        margin-bottom: 20px;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px 8px;
        background: var(--card-background-color);
        border: 2px solid var(--divider-color);
        border-radius: 12px;
        transition: all 0.2s ease;
        min-height: 70px;
      }

      /* Due Today - Green border */
      .stat.attention {
        border-color: #34d399;
        background: rgba(52, 211, 153, 0.05);
      }

      /* Overdue - Red border */
      .stat.warning {
        border-color: #f87171;
        background: rgba(248, 113, 113, 0.05);
      }

      .stat-value {
        font-size: 1.75em;
        font-weight: 700;
        color: var(--primary-text-color);
        line-height: 1;
      }

      .stat.attention .stat-value {
        color: #10b981;
      }

      .stat.warning .stat-value {
        color: #ef4444;
      }

      .stat-label {
        font-size: 0.75em;
        color: var(--secondary-text-color);
        margin-top: 4px;
        text-align: center;
      }

      /* Active chores - Cyan border */
      .stat.clickable {
        cursor: pointer;
        border-color: #22d3ee;
        background: rgba(34, 211, 238, 0.05);
      }

      .stat.clickable .stat-value {
        color: #06b6d4;
      }

      .stat.clickable:hover {
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
        background: rgba(34, 211, 238, 0.1);
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
         CHORE LISTS & ITEMS (Legacy - kept for compatibility)
         ============================================ */
      .chore-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      /* ============================================
         NEW COMPACT CHORE CARDS
         ============================================ */
      .chore-card {
        background: var(--card-background-color);
        border: 1px solid var(--divider-color);
        border-radius: 12px;
        padding: 12px 16px;
        transition: all 0.2s ease;
      }

      .chore-card:hover {
        box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      }

      .chore-card.overdue {
        border-color: #fecaca;
        background: rgba(254, 202, 202, 0.1);
      }

      .chore-card-content {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
      }

      .chore-card-info {
        flex: 1;
        min-width: 0;
      }

      .chore-card-name {
        font-weight: 500;
        color: var(--primary-text-color);
        font-size: 1em;
        margin-bottom: 4px;
      }

      .chore-card-meta {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 4px;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }

      .chore-meta-item {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }

      .chore-meta-item .meta-icon {
        --mdc-icon-size: 14px;
        opacity: 0.7;
      }

      .chore-meta-separator {
        opacity: 0.5;
      }

      .chore-meta-item.overdue-text {
        color: #ef4444;
        font-weight: 500;
      }

      .chore-card-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }

      .chore-action-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        border: none;
        border-radius: 50%;
        cursor: pointer;
        transition: all 0.15s ease;
      }

      .chore-action-btn.complete {
        width: 36px;
        height: 36px;
        background: #10b981;
        color: white;
        margin-right: 6px;
      }

      .chore-action-btn.complete:hover {
        background: #059669;
        transform: scale(1.05);
      }

      .chore-action-btn.complete ha-icon {
        --mdc-icon-size: 20px;
      }

      .chore-action-btn.secondary {
        width: 32px;
        height: 32px;
        background: transparent;
        color: #9ca3af;
      }

      .chore-action-btn.secondary:hover {
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
      }

      .chore-action-btn.secondary ha-icon {
        --mdc-icon-size: 18px;
      }

      /* Chore overflow menu */
      .chore-menu-container {
        position: relative;
      }

      .chore-overflow-menu {
        position: absolute;
        top: 100%;
        right: 0;
        margin-top: 4px;
        background: var(--card-background-color);
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        min-width: 120px;
        z-index: 50;
        overflow: hidden;
      }

      .overflow-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        color: var(--primary-text-color);
        font-size: 0.9em;
        cursor: pointer;
        transition: background-color 0.15s;
      }

      .overflow-menu-item:hover {
        background: var(--secondary-background-color);
      }

      .overflow-menu-item ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }

      .overflow-menu-item.danger {
        color: #ef4444;
      }

      .overflow-menu-item.danger ha-icon {
        color: #ef4444;
      }

      /* Legacy chore-item styles (kept for All Chores modal) */
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

      .completion-info h4 {
        margin: 0 0 8px 0;
      }

      .completion-room {
        display: flex;
        align-items: center;
        gap: 6px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
        margin: 0 0 12px 0;
      }

      .completion-room ha-icon {
        --mdc-icon-size: 16px;
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

  get _full_width() {
    return this._config?.full_width || false;
  }

  get _default_view() {
    return this._config?.default_view || "list";
  }

  get _my_chores_default() {
    return this._config?.my_chores_default || false;
  }

  get _title() {
    return this._config?.title || "Simple Chores";
  }

  get _hide_stats() {
    return this._config?.hide_stats || false;
  }

  get _compact_mode() {
    return this._config?.compact_mode || false;
  }

  render() {
    if (!this.hass) {
      return html``;
    }

    return html`
      <div class="card-config">
        <div class="section-header">Display Settings</div>

        <div class="option">
          <label class="option-label">Card Title</label>
          <input
            type="text"
            .value=${this._title}
            .configValue=${"title"}
            @input=${this._valueChanged}
            placeholder="Simple Chores"
          />
        </div>

        <div class="option">
          <label class="option-label">Default View</label>
          <select
            .value=${this._default_view}
            .configValue=${"default_view"}
            @change=${this._valueChanged}
          >
            <option value="list" ?selected=${this._default_view === "list"}>List View</option>
            <option value="calendar" ?selected=${this._default_view === "calendar"}>Calendar View</option>
          </select>
        </div>

        <div class="option">
          <ha-formfield label="Full width (spans entire column)">
            <ha-checkbox
              .checked=${this._full_width}
              .configValue=${"full_width"}
              @change=${this._valueChanged}
            ></ha-checkbox>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-formfield label="Compact mode (smaller spacing)">
            <ha-checkbox
              .checked=${this._compact_mode}
              .configValue=${"compact_mode"}
              @change=${this._valueChanged}
            ></ha-checkbox>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-formfield label="Hide stats bar">
            <ha-checkbox
              .checked=${this._hide_stats}
              .configValue=${"hide_stats"}
              @change=${this._valueChanged}
            ></ha-checkbox>
          </ha-formfield>
        </div>

        <div class="section-header">Default Filters</div>

        <div class="option">
          <ha-formfield label="Show only my chores by default">
            <ha-checkbox
              .checked=${this._my_chores_default}
              .configValue=${"my_chores_default"}
              @change=${this._valueChanged}
            ></ha-checkbox>
          </ha-formfield>
        </div>

        <div class="option">
          <ha-formfield label="Show completed one-off chores">
            <ha-checkbox
              .checked=${this._show_completed}
              .configValue=${"show_completed"}
              @change=${this._valueChanged}
            ></ha-checkbox>
          </ha-formfield>
        </div>

        <div class="info">
          <p>
            <strong>Simple Chores Card</strong><br>
            Manage household chores with room filtering, calendar view,
            user assignment, and completion tracking.
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

    // Determine the value based on element type
    const isCheckbox = target.tagName === 'HA-CHECKBOX' || target.type === 'checkbox';
    const newValue = isCheckbox ? target.checked : target.value;

    if (this[`_${configValue}`] === newValue) {
      return;
    }

    if (target.configValue) {
      if (newValue === "" || newValue == null) {
        this._config = { ...this._config };
        delete this._config[target.configValue];
      } else {
        this._config = {
          ...this._config,
          [target.configValue]: newValue,
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
      .section-header {
        font-weight: 500;
        font-size: 0.9em;
        color: var(--primary-color);
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 12px;
        margin-top: 16px;
        padding-bottom: 4px;
        border-bottom: 1px solid var(--divider-color);
      }
      .section-header:first-child {
        margin-top: 0;
      }
      .option {
        margin-bottom: 16px;
      }
      .option-label {
        display: block;
        font-size: 0.9em;
        color: var(--secondary-text-color);
        margin-bottom: 4px;
      }
      .option input[type="text"],
      .option select {
        width: 100%;
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 1em;
        box-sizing: border-box;
      }
      .option input[type="text"]:focus,
      .option select:focus {
        outline: none;
        border-color: var(--primary-color);
      }
      .option select {
        cursor: pointer;
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

  // Register the custom elements (with guard to prevent double registration)
  if (!customElements.get("simple-chores-card")) {
    customElements.define("simple-chores-card", SimpleChoresCard);
    console.info("Simple Chores Card: Registered simple-chores-card");
  } else {
    console.warn("Simple Chores Card: simple-chores-card already registered, skipping");
  }

  if (!customElements.get("simple-chores-card-editor")) {
    customElements.define("simple-chores-card-editor", SimpleChoresCardEditor);
    console.info("Simple Chores Card: Registered simple-chores-card-editor");
  } else {
    console.warn("Simple Chores Card: simple-chores-card-editor already registered, skipping");
  }

  console.info(`Simple Chores Card v${CARD_VERSION}: Registration complete!`);
};

// Start initialization
initCard();

// Wait for customCards to be available and register
(function() {
  let registered = false;

  const registerCard = () => {
    // Prevent duplicate registration
    if (registered) {
      console.warn("Simple Chores Card: Already registered for picker, skipping");
      return;
    }

    // Register with custom card picker - this makes it show up in the visual picker
    window.customCards = window.customCards || [];

    // Check if already in the array
    const alreadyRegistered = window.customCards.some(card => card.type === "simple-chores-card");
    if (!alreadyRegistered) {
      window.customCards.push({
        type: "simple-chores-card",
        name: "Simple Chores Card",
        description: "Manage household chores with room organization and completion tracking",
        preview: true, // This enables preview in card picker
        documentationURL: "https://github.com/darthmario/simple-chores",
      });
    }

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

    registered = true;
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
