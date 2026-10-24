/**
 * Simple Chores Card
 * A custom Lovelace card for managing simple chores
 */

// Card version - update this when releasing new versions
// This should match the version in manifest.json
const CARD_VERSION = "1.9.1";

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
      _allChoresRoomFilter: { type: String },
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
      // Calendar view mode: 'grid' or 'agenda'
      _calendarMode: { type: String },
      // Track card width for responsive behavior
      _cardWidth: { type: Number },
      // Track if user manually overrode calendar mode
      _userOverrodeCalendarMode: { type: Boolean },
      // Statistics dashboard
      _showExpandedStats: { type: Boolean },
      _statsTimePeriod: { type: String },
      // Focus view ("chore book")
      _focusMode: { type: String },
      _userOverrodeFocusMode: { type: Boolean },
      _timeBudget: { type: Number },
      _focusOrder: { type: Array },
      _focusIndex: { type: Number },
      _focusDismissed: { type: Object },
      _focusGetAhead: { type: Boolean },
      _focusTimer: { type: Object },
      _celebration: { type: Object },
      _expandedSteps: { type: Object },
      _stepOptimistic: { type: Object },
      _estimatePromptFor: { type: String },
      _choresData: { type: Object },
    };
  }

  // Constants for timing and limits
  static get constants() {
    return {
      // Timeout delays (milliseconds)
      MODAL_FOCUS_DELAY: 100,
      RETRY_DELAY: 500,
      // How long to keep an optimistic chore update before trusting sensor data
      OPTIMISTIC_UPDATE_DELAY: 1000,

      // Cache TTLs (milliseconds)
      ROOM_CACHE_TTL: 30000,  // 30 seconds
      USER_CACHE_TTL: 60000,  // 1 minute

      // Display limits
      DEFAULT_CHORE_LIMIT: 20,
      MAX_RETRY_ATTEMPTS: 10,

      // Below this card width (px), the calendar switches to agenda view
      AGENDA_VIEW_WIDTH_THRESHOLD: 500,
      // Max projected future occurrences generated per chore for the calendar
      MAX_FUTURE_OCCURRENCES: 12,
      // How many days ahead to search for an anchored weekly occurrence (8 weeks)
      ANCHORED_SEARCH_DAYS: 56,

      // Cards rendered at once in the focus board before a "show more"
      FOCUS_BOARD_LIMIT: 24,

      // Below this card width (px), the focus view shows one card at a time
      // (deck) instead of a grid (board)
      FOCUS_BOARD_WIDTH_THRESHOLD: 500,
      // Time budgets offered by the focus view chips, in minutes
      TIME_BUDGETS: [5, 15, 30],
      // Minute values offered when capturing a missing estimate inline
      QUICK_ESTIMATES: [2, 5, 10, 15, 30, 60],
      // How long the confetti burst stays on screen
      CELEBRATION_MS: 1800,
      CELEBRATION_PARTICLES: 16,
      // How long the Undo button stays up after a completion
      UNDO_TOAST_MS: 10000,
      // How far back the history modal offers Undo
      UNDO_WINDOW_MS: 24 * 60 * 60 * 1000,

      // Statistics dashboard time periods
      STATS_DEFAULT_PERIOD: '4w',
      STATS_PERIODS: {
        '7d': { label: '7 Days', days: 7, groupBy: 'day', labels: 7 },
        '4w': { label: '4 Weeks', days: 28, groupBy: 'week', labels: 4 },
        '3m': { label: '3 Months', days: 90, groupBy: 'month', labels: 3 },
        '1y': { label: '1 Year', days: 365, groupBy: 'month', labels: 12 },
      },
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
    this._allChoresRoomFilter = "all";
    this._returnToAllChoresModal = false;
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
      dueNext7Days: this.constructor.constants.DEFAULT_CHORE_LIMIT,
      allChores: this.constructor.constants.DEFAULT_CHORE_LIMIT,
      focusBoard: this.constructor.constants.FOCUS_BOARD_LIMIT
    };
    // Loading state
    this._isLoading = false;
    // Calendar mode: 'grid' or 'agenda' (auto-detected based on width)
    this._calendarMode = 'grid';
    this._cardWidth = 0;
    this._resizeObserver = null;
    this._userOverrodeCalendarMode = false;
    // Statistics dashboard
    this._showExpandedStats = false;
    this._statsTimePeriod = this.constructor.constants.STATS_DEFAULT_PERIOD;
    // Focus view ("chore book"): deck on phones, board on wall displays
    this._focusMode = 'deck';
    this._userOverrodeFocusMode = false;
    this._timeBudget = null;          // null = any duration
    this._focusOrder = null;          // array of chore ids after a shuffle
    this._focusIndex = 0;
    this._focusDismissed = {};        // chore ids acted on but not yet gone from sensors
    this._focusGetAhead = false;      // pulling from the next 7 days once today is clear
    this._focusTimer = null;
    this._timerInterval = null;
    this._celebration = null;
    this._expandedSteps = {};
    this._stepOptimistic = {};        // "choreId:index" -> expected boolean
    this._estimatePromptFor = null;
    this._touchStart = null;          // deck swipe origin (not reactive)
    // Raw history is fetched over the websocket, not read from an attribute
    this._historyFetchedFor = null;   // total_completions the cache was built for
    this._historyFetchInFlight = false;
    // Chores arrive over the websocket too - see _fetchChores
    this._choresData = this.constructor.emptyChoresData();
    this._choresFetchInFlight = false;
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

    // Track pending timeouts so they can be cancelled on disconnect
    this._pendingTimeouts = new Set();

    // Bind keyboard handler for proper removal
    this._handleKeydown = this._handleKeydown.bind(this);
  }

  /**
   * setTimeout wrapper that tracks the timer ID so pending timers can be
   * cancelled in disconnectedCallback(). The ID is removed from the set
   * automatically when the timer fires.
   * @param {Function} fn - Callback to run
   * @param {number} ms - Delay in milliseconds
   * @returns {number} Timer ID
   */
  _setTimeout(fn, ms) {
    const id = setTimeout(() => {
      this._pendingTimeouts.delete(id);
      fn();
    }, ms);
    this._pendingTimeouts.add(id);
    return id;
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
    // Clean up ResizeObserver
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
    // Cancel any pending timeouts
    for (const id of this._pendingTimeouts) {
      clearTimeout(id);
    }
    this._pendingTimeouts.clear();
    // Stop the focus-view countdown
    this._clearTimerInterval();
  }

  /**
   * Skip re-renders for hass updates that don't affect any entity this card
   * reads. Any internal reactive property change (modals, forms, filters)
   * still triggers a render. The check is conservative: if anything relevant
   * might have changed, we allow the update.
   * @param {Map} changedProps - Changed reactive properties
   * @returns {boolean} Whether the component should re-render
   */
  shouldUpdate(changedProps) {
    // Only gate when hass is the ONLY thing that changed
    if (changedProps.size !== 1 || !changedProps.has('hass')) {
      return true;
    }

    const oldHass = changedProps.get('hass');
    if (!oldHass || !this.hass) {
      return true;
    }

    // Non-state hass data the card reads
    if (oldHass.user !== this.hass.user) return true;
    if (oldHass.areas !== this.hass.areas) return true;

    // Entities the card renders from
    const S = SimpleChoresCard.SENSORS;
    const watchedEntities = [
      S.DUE_TODAY,
      S.DUE_NEXT_7_DAYS,
      S.OVERDUE,
      S.TOTAL,
      "calendar.household_tasks",
    ];

    for (const entityId of watchedEntities) {
      const oldState = oldHass.states[entityId];
      const newState = this.hass.states[entityId];
      if (oldState === newState) continue;
      // Entity appeared/disappeared or its state object was replaced
      if (!oldState || !newState) return true;
      if (oldState.state !== newState.state) return true;
      if (oldState.last_updated !== newState.last_updated) return true;
      if (oldState.attributes !== newState.attributes) return true;
    }

    // Nothing this card displays has changed
    return false;
  }

  firstUpdated() {
    // Set up ResizeObserver for responsive calendar view
    this._setupResizeObserver();
    // Nothing renders until the chore list arrives
    this._fetchChores();
  }

  _setupResizeObserver() {
    if (this._resizeObserver) return;

    this._resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width;
        this._cardWidth = width;
        // Auto-switch calendar mode based on width
        // Under 500px, use agenda view for better readability
        const newMode = width < this.constructor.constants.AGENDA_VIEW_WIDTH_THRESHOLD ? 'agenda' : 'grid';
        if (this._calendarMode !== newMode && !this._userOverrodeCalendarMode) {
          this._calendarMode = newMode;
        }
        // Same idea for the focus view: one card at a time on a phone,
        // a grid of big cards on the wall display
        const newFocusMode =
          width < this.constructor.constants.FOCUS_BOARD_WIDTH_THRESHOLD ? 'deck' : 'board';
        if (this._focusMode !== newFocusMode && !this._userOverrodeFocusMode) {
          this._focusMode = newFocusMode;
        }
      }
    });

    this._resizeObserver.observe(this);
  }

  /** @returns {boolean} Whether any modal is currently open */
  _anyModalOpen() {
    return Boolean(
      this._showAddRoomModal || this._showManageRoomsModal || this._showAddUserModal ||
      this._showManageUsersModal || this._showEditUserModal || this._showAddChoreModal ||
      this._showEditChoreModal || this._showAllChoresModal || this._showHistoryModal ||
      this._showCompleteChoreModal
    );
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

    // Arrow keys step through the focus deck, as long as nothing else has focus
    if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
        this._currentView === 'focus' &&
        this._focusMode === 'deck' &&
        !this._anyModalOpen()) {
      const target = e.target;
      if (target && ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName)) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') {
        this._focusPrev();
      } else {
        const queue = this._getFocusQueue();
        if (this._focusIndex < queue.length - 1) this._focusNext();
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
        assignedTo: "",
        recurrenceType: "interval",
        anchorDaysOfWeek: [],
        anchorType: "day_of_month",
        anchorDayOfMonth: 1,
        anchorWeek: 1,
        anchorWeekday: 1,
        interval: 1,
        estimatedMinutes: "",
        steps: []
      },
      completion: {
        choreId: "",
        choreName: "",
        completedBy: "",
        reassignTo: "",
        originalAssignedTo: ""
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
        assignedTo: "",
        estimatedMinutes: "",
        steps: []
      };
    } else if (formType === 'completion') {
      this._formData.completion = {
        choreId: "",
        choreName: "",
        completedBy: "",
        reassignTo: "",
        originalAssignedTo: ""
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
      focus_layout: "auto",
      transparent: false,
      ...config
    };

    // Apply config to initial state if not already set
    if (this._currentView === "list" && ["calendar", "focus"].includes(this.config.default_view)) {
      this._currentView = this.config.default_view;
    }
    // Pin the focus layout when the dashboard asks for a specific one
    if (["deck", "board"].includes(this.config.focus_layout)) {
      this._focusMode = this.config.focus_layout;
      this._userOverrodeFocusMode = true;
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
      this.config.compact_mode ? 'compact' : '',
      this.config.transparent ? 'transparent' : ''
    ].filter(Boolean).join(' ');

    // Count chores per room for the dropdown
    const allChoresForCounts = this._getAllChores();
    const roomChoreCounts = {};
    for (const chore of allChoresForCounts) {
      const rid = chore.room_id || chore.room;
      if (rid) {
        roomChoreCounts[rid] = (roomChoreCounts[rid] || 0) + 1;
      }
    }
    const roomsWithChores = rooms.filter(r => roomChoreCounts[r.id] > 0);

    // Get selected room name for dropdown button
    const selectedRoomName = this._selectedRoom === 'all'
      ? `All Rooms (${allChoresForCounts.length})`
      : `${rooms.find(r => r.id === this._selectedRoom)?.name || 'All Rooms'} (${roomChoreCounts[this._selectedRoom] || 0})`;

    // Get selected assignee name for dropdown button
    const selectedAssigneeName = this._getSelectedAssigneeName(users);

    const doneToday = this._getDoneTodayCount();
    const streak = this._getStreak();

    return html`
      <ha-card class="${cardClasses}">
        <div class="card-header" @click=${this._handleHeaderClick}>
          <!-- Top row: title and greeting, day ring, Add Chore -->
          <div class="header-top-row">
            <div class="header-title-block">
              <div class="card-title">${this.config.title}</div>
              <div class="card-greeting">
                <span>${this._greetingWord()}. ${this._progressPhrase(doneToday, dueToday.length)}</span>
                ${streak > 1 ? html`
                  <span class="header-streak" title="${streak} days in a row with at least one chore done">
                    <ha-icon icon="mdi:fire"></ha-icon>${streak}
                  </span>
                ` : ''}
              </div>
            </div>
            ${this._renderDayRing(doneToday, dueToday.length)}
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
                        All Rooms (${allChoresForCounts.length})
                      </div>
                      ${roomsWithChores.map(room => html`
                        <div
                          class="dropdown-item ${this._selectedRoom === room.id ? 'active' : ''}"
                          @click=${() => this._selectRoom(room.id)}
                        >
                          ${room.name} (${roomChoreCounts[room.id]})
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
                class="icon-btn ${this._currentView === 'focus' ? 'active' : ''}"
                @click=${() => this._setView('focus')}
                title="${this._currentView === 'focus' ? 'Back to List View' : 'Switch to Focus View'}"
              >
                <ha-icon icon="mdi:cards-outline"></ha-icon>
              </button>
              <button
                class="icon-btn ${this._currentView === 'calendar' ? 'active' : ''}"
                @click=${() => this._setView('calendar')}
                title="${this._currentView === 'calendar' ? 'Back to List View' : 'Switch to Calendar View'}"
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
          ${!this._choresData.loaded ? this._renderLoading() : ''}
          ${this._choresData.loaded && this._currentView === 'focus' ? this._renderFocusView() : ''}
          ${this._choresData.loaded && this._currentView === 'calendar' ? this._renderCalendarView() : ''}
          ${this._choresData.loaded && this._currentView === 'list' ? html`
            ${!this.config.hide_stats ? this._renderStats() : ''}
            ${this._renderChoreList(dueToday, "Due Today")}
            ${this._renderChoreList(dueThisWeek, "Due in Next 7 Days")}
          ` : ''}
          ${this._renderCelebration()}
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

  _renderLoading() {
    return html`
      <div class="chores-loading">
        <span class="spinner"></span>
        <span>Loading chores...</span>
      </div>
    `;
  }

  _getSelectedAssigneeName(users) {
    if (this._selectedAssignee === 'all') return 'Anyone';
    if (this._selectedAssignee === 'mine') return 'My Chores';
    const user = users.find(u => u.id === this._selectedAssignee);
    // Fall back to the raw ID, then 'Anyone', so we never render an empty name
    return (user && user.name) || this._selectedAssignee || 'Anyone';
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

  // --- Header: greeting and day ring ---------------------------------------

  /**
   * The time-of-day half of the header greeting.
   * @param {Date} now - injectable for tests
   */
  _greetingWord(now = new Date()) {
    const hour = now.getHours();
    if (hour < 5) return "Up late";
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    if (hour < 21) return "Good evening";
    return "Winding down";
  }

  /**
   * The progress half of the header greeting: where today stands in a few
   * words, so the card reads like a note on the fridge rather than a status
   * panel.
   */
  _progressPhrase(done, remaining) {
    if (remaining === 0 && done > 0) return "All done, nice.";
    if (remaining === 0) return "Nothing due today.";
    const left = `${remaining} to go`;
    return done > 0 ? `${left}, ${done} done.` : `${left}.`;
  }

  /**
   * A small ring showing chores done today out of those due today. Overdue
   * chores are part of "due today", so the ring only closes when the day is
   * genuinely clear.
   */
  _renderDayRing(done, remaining) {
    const total = done + remaining;
    const fraction = total > 0 ? done / total : 0;
    const radius = 19;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference * (1 - fraction);
    const complete = total > 0 && remaining === 0;

    return html`
      <div
        class="header-ring ${complete ? 'complete' : ''}"
        role="img"
        aria-label="${done} of ${total} chores done today"
        title="${done} of ${total} done today"
      >
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <circle class="ring-track" cx="24" cy="24" r="${radius}"></circle>
          <circle
            class="ring-value"
            cx="24" cy="24" r="${radius}"
            stroke-dasharray="${circumference.toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}"
          ></circle>
        </svg>
        <span class="header-ring-label">${done}/${total}</span>
      </div>
    `;
  }

  /**
   * A critter asleep on a rock, for the "nothing to do" states. Inline SVG so
   * the card stays a single file; colours come from the paper tokens.
   */
  _renderSleepingCritter() {
    return html`
      <svg class="sc-critter" viewBox="0 0 140 84" aria-hidden="true">
        <ellipse cx="70" cy="76" rx="58" ry="6" style="fill: var(--sc-line)"></ellipse>
        <path d="M16 72 Q70 46 124 72 Z" style="fill: var(--sc-ink-muted); opacity: 0.55"></path>
        <g class="critter-body">
          <path d="M38 58 Q20 64 26 74" style="fill: none; stroke: var(--sc-critter); stroke-width: 7; stroke-linecap: round"></path>
          <ellipse cx="70" cy="56" rx="34" ry="18" style="fill: var(--sc-critter)"></ellipse>
          <ellipse cx="74" cy="60" rx="22" ry="10" style="fill: var(--sc-critter-belly)"></ellipse>
          <circle cx="86" cy="35" r="4.5" style="fill: var(--sc-critter)"></circle>
          <circle cx="96" cy="46" r="15" style="fill: var(--sc-critter)"></circle>
          <ellipse cx="101" cy="51" rx="8" ry="5.5" style="fill: var(--sc-critter-belly)"></ellipse>
          <path d="M89 44 q3.5 3 7 0" style="fill: none; stroke: var(--sc-ink); stroke-width: 1.6; stroke-linecap: round"></path>
          <ellipse cx="104" cy="49" rx="2.2" ry="1.6" style="fill: var(--sc-ink)"></ellipse>
        </g>
        <text class="critter-z" x="112" y="30" font-size="11">z</text>
        <text class="critter-z second" x="120" y="22" font-size="14">z</text>
      </svg>
    `;
  }

  _renderStats() {
    const dueToday = this.hass.states[SimpleChoresCard.SENSORS.DUE_TODAY]?.state || "0";
    const overdue = this.hass.states[SimpleChoresCard.SENSORS.OVERDUE]?.state || "0";
    const total = this.hass.states[SimpleChoresCard.SENSORS.TOTAL]?.state || "0";

    return html`
      <div class="stats-container">
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
            <span class="stat-hint">View all<ha-icon icon="mdi:chevron-right"></ha-icon></span>
          </div>
          <button
            class="stats-expand-btn ${this._showExpandedStats ? 'expanded' : ''}"
            @click=${this._toggleExpandedStats}
            title="${this._showExpandedStats ? 'Hide detailed stats' : 'Show detailed stats'}"
          >
            <ha-icon icon="mdi:chevron-down"></ha-icon>
          </button>
        </div>
        ${this._showExpandedStats ? this._renderExpandedStats() : ''}
      </div>
    `;
  }

  _renderExpandedStats() {
    const stats = this._calculateStatsData();

    // Handle empty state
    if (stats.totalCompletions === 0) {
      return this._renderEmptyStats();
    }

    return html`
      <div class="stats-dashboard">
        ${this._renderTimePeriodToggle()}
        ${this._renderCompletionsChart(stats.completionsOverTime)}
        <div class="stats-insights-grid">
          ${this._renderTopChoresInsight(stats.topChores)}
          ${stats.roomStats.length > 0 ? this._renderRoomStatsInsight(stats.roomStats) : ''}
        </div>
        ${stats.userStats.length > 1 ? this._renderUserLeaderboard(stats.userStats) : ''}
      </div>
    `;
  }

  _renderEmptyStats() {
    return html`
      <div class="stats-dashboard">
        <div class="stats-empty">
          <ha-icon icon="mdi:chart-line"></ha-icon>
          <p>No completion history yet.</p>
          <p>Complete some chores to see your statistics!</p>
        </div>
      </div>
    `;
  }

  _renderTimePeriodToggle() {
    const periods = Object.entries(this.constructor.constants.STATS_PERIODS)
      .map(([value, cfg]) => ({ value, label: cfg.label }));

    return html`
      <div class="stats-period-toggle">
        ${periods.map(p => html`
          <button
            class="stats-period-btn ${this._statsTimePeriod === p.value ? 'active' : ''}"
            @click=${() => this._setStatsPeriod(p.value)}
          >
            ${p.label}
          </button>
        `)}
      </div>
    `;
  }

  _renderCompletionsChart(data) {
    const maxCount = Math.max(...data.map(d => d.count), 1);
    const totalInPeriod = data.reduce((sum, d) => sum + d.count, 0);

    return html`
      <div class="stats-section">
        <div class="stats-section-title">
          <ha-icon icon="mdi:chart-bar"></ha-icon>
          <span>Completions Over Time</span>
          <span class="stats-section-total">${totalInPeriod} total</span>
        </div>
        <div class="stats-chart">
          ${data.map(d => {
            const heightPercent = (d.count / maxCount) * 100;
            return html`
              <div class="stats-chart-bar-container">
                <span class="stats-chart-bar-value">${d.count > 0 ? d.count : ''}</span>
                <div
                  class="stats-chart-bar ${d.count === 0 ? 'empty' : ''}"
                  style="height: ${Math.max(heightPercent, 4)}%"
                ></div>
                <span class="stats-chart-bar-label">${d.label}</span>
              </div>
            `;
          })}
        </div>
      </div>
    `;
  }

  _renderTopChoresInsight(topChores) {
    if (topChores.mostCompleted.length === 0) {
      return html`
        <div class="stats-insight-card">
          <h4>Top Chores</h4>
          <p class="stats-no-data">No data yet</p>
        </div>
      `;
    }

    return html`
      <div class="stats-insight-card">
        <h4>Most Completed</h4>
        <ul class="stats-chore-list">
          ${topChores.mostCompleted.map(chore => html`
            <li class="stats-chore-item">
              <span class="stats-chore-name">${chore.name}</span>
              <span class="stats-chore-count">${chore.count}</span>
            </li>
          `)}
        </ul>
      </div>
    `;
  }

  _renderRoomStatsInsight(roomStats) {
    const maxCompletions = Math.max(...roomStats.map(r => r.completions), 1);

    return html`
      <div class="stats-insight-card">
        <h4>Activity by Room</h4>
        ${roomStats.slice(0, 5).map(room => html`
          <div class="stats-horizontal-bar">
            <span class="stats-horizontal-bar-label" title="${room.name}">
              ${room.name}
            </span>
            <div class="stats-horizontal-bar-track">
              <div
                class="stats-horizontal-bar-fill"
                style="width: ${(room.completions / maxCompletions) * 100}%"
              ></div>
            </div>
            <span class="stats-horizontal-bar-value">${room.completions}</span>
          </div>
        `)}
      </div>
    `;
  }

  _renderUserLeaderboard(userStats) {
    const maxCount = Math.max(...userStats.map(u => u.count), 1);

    return html`
      <div class="stats-section">
        <div class="stats-section-title">
          <ha-icon icon="mdi:account-group"></ha-icon>
          <span>User Leaderboard</span>
        </div>
        ${userStats.map((user, index) => html`
          <div class="stats-horizontal-bar ${index === 0 ? 'leader' : ''}">
            <span class="stats-horizontal-bar-label" title="${user.name}">
              ${index === 0 ? html`<ha-icon icon="mdi:trophy" class="leader-icon"></ha-icon>` : ''}
              ${user.name}
            </span>
            <div class="stats-horizontal-bar-track">
              <div
                class="stats-horizontal-bar-fill"
                style="width: ${(user.count / maxCount) * 100}%"
              ></div>
            </div>
            <span class="stats-horizontal-bar-value">${user.count}</span>
          </div>
        `)}
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
          <div class="no-chores">
            ${this._renderSleepingCritter()}
            <p>No chores ${title.toLowerCase()}${this._selectedRoom !== 'all' ? ' in this room' : ''}</p>
          </div>
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
      dueDate = this._toLocalDateStr(new Date());
    }

    // Use consolidated room lookup logic
    const roomName = this._resolveRoomName(chore);

    // Get assigned user info
    const assignedTo = chore.assigned_to;
    let assignedUserName = null;
    if (assignedTo) {
      const users = this._getUsers();
      const assignedUser = users.find(u => u.id === assignedTo);
      // Fall back to the raw ID (guarded truthy above) if the user record
      // is missing or has no name, so we never render "null"/"undefined"
      assignedUserName = (assignedUser && assignedUser.name) || assignedTo;
    }

    const isOverdue = this._parseLocalDate(dueDate) < new Date().setHours(0,0,0,0);
    const isMenuOpen = this._activeChoreMenu === chore.id;
    const estimateMinutes = this._choreMinutes(chore);
    const steps = chore.steps || [];
    const doneSteps = this._countDoneSteps(chore);
    const stepsOpen = steps.length > 0 && this._stepsOpen(chore, doneSteps);
    const stepPercent = steps.length > 0 ? Math.round((doneSteps / steps.length) * 100) : 0;

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
              <span class="chore-meta-separator">·</span>
              ${estimateMinutes !== null ? html`
                <span class="chore-meta-item">
                  <ha-icon icon="mdi:timer-outline" class="meta-icon"></ha-icon>
                  ${this._formatMinutes(estimateMinutes)}
                </span>
              ` : html`
                <button
                  class="chore-meta-estimate"
                  title="No time estimate - this chore can't match a time filter"
                  @click=${(e) => { e.stopPropagation(); this._promptForEstimate(chore.id); }}
                >
                  <ha-icon icon="mdi:timer-plus-outline"></ha-icon>
                  No estimate
                </button>
              `}
              ${assignedUserName ? html`
                <span class="chore-meta-separator">·</span>
                <span class="chore-meta-item">
                  <ha-icon icon="mdi:account" class="meta-icon"></ha-icon>
                  ${assignedUserName}
                </span>
              ` : ''}
              ${steps.length > 0 ? html`
                <span class="chore-meta-separator">·</span>
                <button
                  class="chore-meta-steps ${stepsOpen ? 'open' : ''}"
                  title="${stepsOpen ? 'Hide steps' : 'Show steps'}"
                  aria-expanded=${stepsOpen}
                  @click=${(e) => { e.stopPropagation(); this._toggleStepsExpanded(chore); }}
                >
                  <ha-icon icon="${stepsOpen ? 'mdi:chevron-up' : 'mdi:format-list-checks'}"></ha-icon>
                  ${doneSteps}/${steps.length} steps
                </button>
              ` : ''}
            </div>
            ${steps.length > 0 && doneSteps > 0 && !stepsOpen ? html`
              <div class="focus-steps-bar chore-steps-bar" title="${doneSteps} of ${steps.length} steps done">
                <div class="focus-steps-fill" style="width: ${stepPercent}%"></div>
              </div>
            ` : ''}
            ${this._estimatePromptFor === chore.id ? html`
              <div class="chore-estimate-row" @click=${(e) => e.stopPropagation()}>
                <span class="chore-estimate-label">How long does this take?</span>
                ${this._renderEstimatePrompt(chore)}
              </div>
            ` : ''}
            ${stepsOpen ? html`
              <div class="chore-steps" @click=${(e) => e.stopPropagation()}>
                ${this._renderSteps(chore, steps, doneSteps)}
              </div>
            ` : ''}
          </div>
          <div class="chore-card-actions">
            <button
              class="chore-action-btn complete ${this._celebration && this._celebration.id === chore.id ? 'done' : ''}"
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
    const date = this._parseLocalDate(fromDate);

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
   * Get nth weekday of a month
   * @param {number} year - Year
   * @param {number} month - Month (0-11)
   * @param {number} weekday - Day of week (0=Sun, 6=Sat)
   * @param {number} n - Which occurrence (1=first, 2=second, ..., 5=last)
   * @returns {Date|null}
   */
  _getNthWeekdayOfMonth(year, month, weekday, n) {
    if (n === 5) {
      // "Last" occurrence - start from end of month
      const lastDay = new Date(year, month + 1, 0);
      for (let d = lastDay.getDate(); d >= 1; d--) {
        const testDate = new Date(year, month, d);
        if (testDate.getDay() === weekday) {
          return testDate;
        }
      }
      return null;
    }

    // Nth occurrence from start
    let count = 0;
    for (let d = 1; d <= 31; d++) {
      const testDate = new Date(year, month, d);
      if (testDate.getMonth() !== month) break;
      if (testDate.getDay() === weekday) {
        count++;
        if (count === n) {
          return testDate;
        }
      }
    }
    return null;
  }

  /**
   * Calculate next occurrence for a chore considering anchored recurrence
   * @param {Object} chore - The chore object with recurrence settings
   * @param {Date} fromDate - Calculate next occurrence after this date
   * @returns {Date|null}
   */
  /**
   * Parse a date string to a local Date object (avoiding UTC interpretation)
   * @param {Date|string} dateInput - Date object or YYYY-MM-DD string
   * @returns {Date}
   */
  _parseLocalDate(dateInput) {
    if (dateInput instanceof Date) {
      return new Date(dateInput.getFullYear(), dateInput.getMonth(), dateInput.getDate());
    }
    // Parse YYYY-MM-DD as local date, not UTC
    const parts = String(dateInput).split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }

  _toLocalDateStr(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  _calculateNextOccurrenceForChore(chore, fromDate) {
    const recurrenceType = chore.recurrence_type || 'interval';
    const frequency = chore.frequency;

    if (frequency === 'once') {
      return null;
    }

    // For interval-based recurrence, use simple calculation
    if (recurrenceType !== 'anchored') {
      return this._calculateNextOccurrence(fromDate, frequency);
    }

    // Anchored recurrence - parse as local date to avoid timezone issues
    const date = this._parseLocalDate(fromDate);
    const isWeekly = ['weekly', 'biweekly'].includes(frequency);
    const isMonthlyPlus = ['monthly', 'bimonthly', 'quarterly', 'biannual', 'yearly'].includes(frequency);

    if (isWeekly && chore.anchor_days_of_week?.length > 0) {
      // Weekly anchored - find next matching day
      const anchorDays = [...chore.anchor_days_of_week].sort((a, b) => a - b);
      const weeksInterval = frequency === 'biweekly' ? 2 : 1;

      // Start searching from next day
      const searchDate = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

      // Search up to 8 weeks ahead
      for (let i = 0; i < this.constructor.constants.ANCHORED_SEARCH_DAYS; i++) {
        const dayOfWeek = searchDate.getDay();
        if (anchorDays.includes(dayOfWeek)) {
          // Check if this is within the correct week interval
          const daysDiff = Math.round((searchDate - date) / (1000 * 60 * 60 * 24));
          const weeksDiff = Math.floor(daysDiff / 7);
          if (weeksDiff % weeksInterval === 0 || daysDiff < 7) {
            return searchDate;
          }
        }
        searchDate.setDate(searchDate.getDate() + 1);
      }
      return null;
    }

    if (isMonthlyPlus) {
      const anchorType = chore.anchor_type || 'day_of_month';
      let monthsInterval = 1;
      switch (frequency) {
        case 'bimonthly': monthsInterval = 2; break;
        case 'quarterly': monthsInterval = 3; break;
        case 'biannual': monthsInterval = 6; break;
        case 'yearly': monthsInterval = 12; break;
      }

      if (anchorType === 'day_of_month') {
        const anchorDay = chore.anchor_day_of_month || 1;
        let year = date.getFullYear();
        let month = date.getMonth();

        // Check if we can still hit the anchor day this month
        const thisMonthAnchor = new Date(year, month, Math.min(anchorDay, new Date(year, month + 1, 0).getDate()));
        if (thisMonthAnchor > date) {
          return thisMonthAnchor;
        }

        // Move to next interval
        month += monthsInterval;
        if (month > 11) {
          year += Math.floor(month / 12);
          month = month % 12;
        }

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        return new Date(year, month, Math.min(anchorDay, daysInMonth));
      }

      if (anchorType === 'week_pattern') {
        const anchorWeek = chore.anchor_week || 1;
        const anchorWeekday = chore.anchor_weekday ?? 1;
        let year = date.getFullYear();
        let month = date.getMonth();

        // Check this month first
        const thisMonthDate = this._getNthWeekdayOfMonth(year, month, anchorWeekday, anchorWeek);
        if (thisMonthDate && thisMonthDate > date) {
          return thisMonthDate;
        }

        // Move to next interval
        month += monthsInterval;
        if (month > 11) {
          year += Math.floor(month / 12);
          month = month % 12;
        }

        return this._getNthWeekdayOfMonth(year, month, anchorWeekday, anchorWeek);
      }
    }

    // Fallback to interval-based
    return this._calculateNextOccurrence(fromDate, frequency);
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

    const startDate = this._parseLocalDate(chore.next_due || chore.due_date);
    let currentDate = this._calculateNextOccurrenceForChore(chore, startDate);

    // Generate future occurrences up to the configured cap or until endDate
    let count = 0;
    const maxOccurrences = this.constructor.constants.MAX_FUTURE_OCCURRENCES;

    while (currentDate && currentDate <= endDate && count < maxOccurrences) {
      occurrences.push({
        ...chore,
        next_due: this._toLocalDateStr(currentDate),
        isProjected: true, // Flag to indicate this is a simulated occurrence
      });

      currentDate = this._calculateNextOccurrenceForChore(chore, currentDate);
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
    const todayStr = this._toLocalDateStr(today);

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
          <button
            @click=${this._toggleCalendarMode}
            class="calendar-mode-btn"
            title="${this._calendarMode === 'grid' ? 'Switch to Agenda View' : 'Switch to Grid View'}"
          >
            <ha-icon icon="${this._calendarMode === 'grid' ? 'mdi:view-agenda' : 'mdi:calendar-month'}"></ha-icon>
          </button>
        </div>

        ${this._calendarMode === 'agenda'
          ? this._renderAgendaContent(choresByDate, completedByDate, todayStr, daysInMonth)
          : this._renderGridContent(weeks, dayNames, choresByDate, completedByDate, todayStr)
        }

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

  _toggleCalendarMode() {
    this._calendarMode = this._calendarMode === 'grid' ? 'agenda' : 'grid';
    this._userOverrodeCalendarMode = true;
  }

  _renderGridContent(weeks, dayNames, choresByDate, completedByDate, todayStr) {
    return html`
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
          const isPast = this._parseLocalDate(dateStr) < this._parseLocalDate(todayStr);

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
                      ${!isProjected ? html`
                        <button
                          class="calendar-chore-edit"
                          @click=${(e) => { e.stopPropagation(); this._editChore(chore); }}
                          title="Edit chore"
                        >
                          <ha-icon icon="mdi:pencil"></ha-icon>
                        </button>
                      ` : ''}
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
    `;
  }

  _renderAgendaContent(choresByDate, completedByDate, todayStr, daysInMonth) {
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const today = this._parseLocalDate(todayStr);

    // Build array of all days in the month
    const allDays = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${this._calendarYear}-${String(this._calendarMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const choresOnDate = choresByDate[dateStr] || [];
      const completedOnDate = completedByDate[dateStr] || [];

      const dateObj = this._parseLocalDate(dateStr);
      const isPast = dateObj < today;
      const isToday = dateStr === todayStr;
      const dayOfWeek = dayNames[dateObj.getDay()];

      allDays.push({
        day,
        dateStr,
        dayOfWeek,
        isToday,
        isPast,
        chores: choresOnDate,
        completed: completedOnDate,
        hasContent: choresOnDate.length > 0 || completedOnDate.length > 0
      });
    }

    // Filter to only show days with content
    const daysWithContent = allDays.filter(d => d.hasContent);

    if (daysWithContent.length === 0) {
      return html`
        <div class="agenda-view">
          <div class="agenda-empty">No chores scheduled this month</div>
        </div>
      `;
    }

    return html`
      <div class="agenda-view">
        ${daysWithContent.map(dayData => html`
          <div class="agenda-day ${dayData.isToday ? 'today' : ''} ${dayData.isPast ? 'past' : ''}">
            <div class="agenda-day-header">
              <span class="agenda-day-name">${dayData.dayOfWeek}</span>
              <span class="agenda-day-date">${dayData.day}</span>
              ${dayData.isToday ? html`<span class="agenda-today-badge">Today</span>` : ''}
            </div>
            <div class="agenda-chores">
                ${dayData.chores.map(chore => {
                  const isProjected = chore.isProjected || false;
                  const isOverdue = dayData.isPast && !isProjected;
                  const roomName = chore.room_name || this._getRoomName(chore.room_id) || '';
                  return html`
                    <div
                      class="agenda-chore ${isOverdue ? 'overdue' : ''} ${isProjected ? 'projected' : ''}"
                      @click=${() => isProjected ? null : this._openCompleteChoreModal(chore)}
                    >
                      <div class="agenda-chore-indicator ${isOverdue ? 'overdue' : ''} ${isProjected ? 'projected' : ''}"></div>
                      <div class="agenda-chore-content">
                        <span class="agenda-chore-name">${chore.name}</span>
                        ${roomName ? html`<span class="agenda-chore-room">${roomName}</span>` : ''}
                        ${!isProjected && (chore.steps || []).length > 0 ? html`
                          <span class="agenda-chore-steps">
                            <ha-icon icon="mdi:format-list-checks"></ha-icon>
                            ${this._countDoneSteps(chore)}/${chore.steps.length}
                          </span>
                        ` : ''}
                        ${isProjected ? html`<span class="agenda-chore-projected-badge">Projected</span>` : ''}
                      </div>
                      ${!isProjected ? html`
                        <button class="agenda-chore-edit" @click=${(e) => { e.stopPropagation(); this._editChore(chore); }} title="Edit">
                          <ha-icon icon="mdi:pencil"></ha-icon>
                        </button>
                        <button class="agenda-chore-complete" @click=${(e) => { e.stopPropagation(); this._openCompleteChoreModal(chore); }} title="Complete">
                          <ha-icon icon="mdi:check"></ha-icon>
                        </button>
                      ` : ''}
                    </div>
                  `;
                })}
                ${dayData.completed.map(completed => {
                  const roomName = completed.room_name || '';
                  return html`
                    <div class="agenda-chore completed">
                      <div class="agenda-chore-indicator completed"></div>
                      <div class="agenda-chore-content">
                        <span class="agenda-chore-name">${completed.name}</span>
                        ${roomName ? html`<span class="agenda-chore-room">${roomName}</span>` : ''}
                        ${completed.completed_by_name ? html`<span class="agenda-chore-by">by ${completed.completed_by_name}</span>` : ''}
                      </div>
                      <ha-icon icon="mdi:check-circle" class="agenda-completed-icon"></ha-icon>
                    </div>
                  `;
                })}
            </div>
          </div>
        `)}
      </div>
    `;
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
      this._setTimeout(() => {
        const updates = { ...this._optimisticChoreUpdates };
        delete updates[chore.id];
        this._optimisticChoreUpdates = updates;
        this.requestUpdate();
      }, this.constructor.constants.OPTIMISTIC_UPDATE_DELAY);

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

  /** The shape _choresData holds before anything has loaded. */
  static emptyChoresData() {
    return {
      revision: null,
      loaded: false,
      chores: [],
      byId: new Map(),
      dueToday: [],
      dueThisWeek: [],
      overdue: [],
    };
  }

  /**
   * Fetch the chore list over the websocket.
   *
   * Chores are no longer published as state attributes: the list is pushed to
   * every connected client on every update, and it outgrew Home Assistant's
   * 16 KB attribute limit at around 60 chores. The sensor carries a `revision`
   * digest instead, and we re-fetch whenever it moves.
   * @param {boolean} force - Fetch even when the revision looks current
   */
  async _fetchChores(force = false) {
    if (!this.hass) return;

    const revision = this.hass.states?.[SimpleChoresCard.SENSORS.TOTAL]?.attributes?.revision ?? null;
    if (!force && this._choresData.loaded && this._choresData.revision === revision) {
      return;
    }
    if (this._choresFetchInFlight) return;

    this._choresFetchInFlight = true;
    try {
      const result = await this.hass.callWS({ type: "simple_chores/chores" });
      const chores = (result?.chores || []).map(chore => this._normalizeChore(chore));
      this._choresData = {
        revision: result?.revision ?? revision,
        loaded: true,
        chores,
        byId: new Map(chores.map(chore => [chore.id, chore])),
        // Sent as ID lists: an overdue chore is in three of these, and
        // repeating the whole record three times is what caused the problem
        dueToday: result?.due_today || [],
        dueThisWeek: result?.due_this_week || [],
        overdue: result?.overdue || [],
      };
    } catch (error) {
      console.error("Simple Chores Card: Failed to fetch chores:", error);
      // Keep whatever we already had rather than blanking the card, but stop
      // showing the loading state so the user sees something actionable
      this._choresData = { ...this._choresData, loaded: true };
    } finally {
      this._choresFetchInFlight = false;
    }
  }

  /**
   * Fill in the aliases and defaults the render paths expect. The wire format
   * omits empty fields, so this is where they come back as usable values.
   */
  _normalizeChore(chore) {
    const nextDue = chore.next_due || chore.due_date || this._toLocalDateStr(new Date());
    return {
      ...chore,
      next_due: nextDue,
      due_date: nextDue,
      days_overdue: Number(chore.days_overdue) || 0,
    };
  }

  /**
   * Chores in a due window, resolved from the ID lists the backend sent.
   * @param {string} period - 'today' (includes overdue) or 'week'
   */
  _getDueChores(period) {
    const { byId, dueToday, dueThisWeek } = this._choresData;
    const ids = period === "today" ? dueToday : dueThisWeek;
    return ids.map(id => byId.get(id)).filter(Boolean);
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

  /**
   * Switch to a view, or back to the list if it's already showing.
   * @param {string} view - 'list', 'calendar' or 'focus'
   */
  _setView(view) {
    const next = this._currentView === view ? 'list' : view;
    if (next !== 'focus') {
      // Don't leave a countdown running for a card nobody is looking at
      this._stopTimer();
    }
    this._currentView = next;
    this._closeAllDropdowns();
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

  // ============================================
  // FOCUS VIEW ("CHORE BOOK")
  //
  // One thing on screen at a time instead of a list, filtered by how long
  // you have, with a shuffle for when picking is the hard part. Deck layout
  // on phones, board layout on a wall display.
  // ============================================

  /**
   * Drop optimistic focus-view state once the sensors have caught up.
   * Runs after render so we never mutate state mid-render.
   */
  updated(changedProps) {
    if (!this.hass) return;

    // No-ops unless the revision digest says our copy is stale
    this._fetchChores();

    // The calendar and history modal are the only things needing raw entries.
    // _fetchHistory no-ops unless the completion count has moved on.
    if (this._currentView === 'calendar' || this._showHistoryModal) {
      this._fetchHistory();
    }

    if (!changedProps.has('hass')) return;

    // A chore stays "dismissed" only while the sensor still reports it as due
    const dismissedIds = Object.keys(this._focusDismissed);
    if (dismissedIds.length) {
      const live = new Set(this._getRawFocusChores().map(c => c.id));
      const stillDismissed = {};
      for (const id of dismissedIds) {
        if (live.has(id)) stillDismissed[id] = true;
      }
      if (Object.keys(stillDismissed).length !== dismissedIds.length) {
        this._focusDismissed = stillDismissed;
      }
    }

    // A step tick stays optimistic only until the backend reports the same value
    const optimisticKeys = Object.keys(this._stepOptimistic);
    if (optimisticKeys.length) {
      const byId = new Map(this._getRawFocusChores().map(c => [c.id, c]));
      const pending = {};
      for (const key of optimisticKeys) {
        const separator = key.lastIndexOf(':');
        const choreId = key.slice(0, separator);
        const index = Number(key.slice(separator + 1));
        const chore = byId.get(choreId);
        // Keep the optimistic value until the real one agrees (or the chore is gone)
        if (chore && (chore.step_progress || []).includes(index) !== this._stepOptimistic[key]) {
          pending[key] = this._stepOptimistic[key];
        }
      }
      if (Object.keys(pending).length !== optimisticKeys.length) {
        this._stepOptimistic = pending;
      }
    }
  }

  /**
   * Chores eligible for the focus view before any filtering.
   * "Due today" already includes overdue chores (the coordinator adds them to
   * both), so it's the whole of what needs doing now.
   * @returns {Array<Object>}
   */
  _getRawFocusChores() {
    const source = this._focusGetAhead
      ? [...this._getDueChores('today'), ...this._getDueChores('week')]
      : this._getDueChores('today');

    const seen = new Set();
    const unique = [];
    for (const chore of source) {
      if (!chore || !chore.id || seen.has(chore.id)) continue;
      seen.add(chore.id);
      unique.push(chore);
    }
    return unique;
  }

  /**
   * Focus chores after the header's room/assignee filters and any local
   * dismissals, but before the time budget.
   * @returns {Array<Object>}
   */
  _getFocusPool() {
    const byRoom = this._filterChoresByRoom(this._getRawFocusChores());
    const byUser = this._filterChoresByUser(byRoom);
    return byUser.filter(chore => !this._focusDismissed[chore.id]);
  }

  /**
   * The ordered list the deck steps through / the board lays out.
   * @returns {Array<Object>}
   */
  _getFocusQueue() {
    const sorted = this._sortFocusChores(this._filterChoresByTimeBudget(this._getFocusPool()));
    if (!this._focusOrder) {
      return sorted;
    }
    // Preserve a shuffle; anything new since the shuffle keeps its natural
    // place at the end rather than landing in raw sensor order
    const rank = new Map(this._focusOrder.map((id, index) => [id, index]));
    return [...sorted].sort((a, b) => {
      const ra = rank.has(a.id) ? rank.get(a.id) : Number.MAX_SAFE_INTEGER;
      const rb = rank.has(b.id) ? rank.get(b.id) : Number.MAX_SAFE_INTEGER;
      return ra - rb;
    });
  }

  /**
   * Most overdue first, then quickest first so a short window surfaces wins.
   * @param {Array<Object>} chores
   * @returns {Array<Object>}
   */
  _sortFocusChores(chores) {
    return [...chores].sort((a, b) => {
      const overdueA = Number(a.days_overdue) || 0;
      const overdueB = Number(b.days_overdue) || 0;
      if (overdueA !== overdueB) return overdueB - overdueA;

      const minutesA = this._choreMinutes(a);
      const minutesB = this._choreMinutes(b);
      if (minutesA !== minutesB) {
        return (minutesA ?? Number.MAX_SAFE_INTEGER) - (minutesB ?? Number.MAX_SAFE_INTEGER);
      }
      return String(a.name || '').localeCompare(String(b.name || ''));
    });
  }

  /**
   * Chores with no estimate are excluded from a budget on purpose - we can't
   * promise an unmeasured chore fits in five minutes.
   */
  _filterChoresByTimeBudget(chores) {
    if (!this._timeBudget) return chores;
    return chores.filter(chore => {
      const minutes = this._choreMinutes(chore);
      return minutes !== null && minutes <= this._timeBudget;
    });
  }

  /**
   * @returns {number|null} Estimated minutes, or null when unset/invalid
   */
  _choreMinutes(chore) {
    const minutes = Number(chore?.estimated_minutes);
    return Number.isFinite(minutes) && minutes > 0 ? minutes : null;
  }

  _formatMinutes(minutes) {
    if (minutes < 60) return `${minutes} min`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest === 0 ? `${hours} hr` : `${hours} hr ${rest} min`;
  }

  _formatClock(totalSeconds) {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  }

  /** Completions recorded today, used for the "x of y done" ring. */
  _getDoneTodayCount() {
    return this._getStats()?.done_today || 0;
  }

  /**
   * Consecutive days ending today with at least one completion, computed by
   * the backend (see statistics.py).
   * @returns {number}
   */
  _getStreak() {
    return this._getStats()?.streak_days || 0;
  }

  // --- Focus view controls -------------------------------------------------

  _setTimeBudget(minutes) {
    this._timeBudget = minutes;
    this._focusIndex = 0;
    this._stopTimer();
  }

  _toggleFocusMode() {
    this._focusMode = this._focusMode === 'deck' ? 'board' : 'deck';
    this._userOverrodeFocusMode = true;
  }

  _focusPrev() {
    this._focusIndex = Math.max(0, this._focusIndex - 1);
    this._stopTimer();
  }

  _focusNext() {
    this._focusIndex = this._focusIndex + 1;
    this._stopTimer();
  }

  _focusStartGetAhead() {
    this._focusGetAhead = true;
    this._focusIndex = 0;
  }

  /** Deal a fresh random order - the answer to "I can't decide what to do". */
  _focusShuffle() {
    const queue = this._getFocusQueue();
    if (queue.length <= 1) return;

    const currentId = queue[this._clampFocusIndex(queue)]?.id;
    const ids = queue.map(chore => chore.id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    // Landing on the card you were already looking at doesn't feel like a shuffle
    if (ids.length > 1 && ids[0] === currentId) {
      [ids[0], ids[1]] = [ids[1], ids[0]];
    }

    this._focusOrder = ids;
    this._focusIndex = 0;
    this._stopTimer();
  }

  _clampFocusIndex(queue) {
    if (queue.length === 0) return 0;
    return Math.min(Math.max(this._focusIndex, 0), queue.length - 1);
  }

  _dismissFromFocus(choreId) {
    this._focusDismissed = { ...this._focusDismissed, [choreId]: true };
  }

  _restoreToFocus(choreId) {
    const remaining = { ...this._focusDismissed };
    delete remaining[choreId];
    this._focusDismissed = remaining;
  }

  /**
   * Run a focus action optimistically: the card leaves immediately and comes
   * back only if the service call fails.
   */
  async _focusAction(chore, service, data, successMessage) {
    this._stopTimer(chore.id);
    this._dismissFromFocus(chore.id);
    if (service === "complete_chore" || service === "skip_chore") {
      this._forgetStepsExpanded(chore.id);
    }
    try {
      await this.hass.callService("simple_chores", service, { chore_id: chore.id, ...data });
      if (successMessage) this._showToast(successMessage);
      return true;
    } catch (error) {
      console.error(`Simple Chores Card: Error calling ${service}:`, error);
      this._restoreToFocus(chore.id);
      this._showToast("That didn't save. Please try again.");
      return false;
    }
  }

  async _focusComplete(chore) {
    this._celebrate(chore.id);
    const userId = this.hass?.user?.id;
    const ok = await this._focusAction(chore, "complete_chore", userId ? { user_id: userId } : {}, null);
    if (ok) this._offerUndo(chore);
    return ok;
  }

  // --- Undo ----------------------------------------------------------------

  /**
   * A toast with an Undo button, shown after every completion. Undoing calls
   * the backend, which drops the history entry and puts the chore back where
   * it was (due date, checklist, one-off flag), so nothing derived from
   * history is left counting a tap that shouldn't have happened.
   */
  _offerUndo(chore) {
    this._showToast(`"${chore.name}" done`, {
      action: { text: "Undo", onAction: () => this._undoCompletion(chore) },
    });
  }

  async _undoCompletion(chore) {
    try {
      await this.hass.callService("simple_chores", "undo_completion", { chore_id: chore.id });
      this._celebration = null;
      this._restoreToFocus(chore.id);
      this._showToast(`"${chore.name}" is back on the list`);
    } catch (error) {
      console.error("Simple Chores Card: Error undoing completion:", error);
      this._showToast("Couldn't undo that. Please try again.");
    }
  }

  /**
   * Undo one specific completion from the history modal, then re-fetch so
   * the list reflects it.
   */
  async _undoHistoryEntry(entry) {
    try {
      await this.hass.callService("simple_chores", "undo_completion", { history_id: entry.id });
      this._showToast(`"${entry.chore_name}" is back on the list`);
      await this._fetchHistory(true);
    } catch (error) {
      console.error("Simple Chores Card: Error undoing completion:", error);
      this._showToast("Couldn't undo that. Please try again.");
    }
  }

  /** Whether the history modal should offer Undo for an entry. */
  _canUndoEntry(entry, now = Date.now()) {
    if (!entry || !entry.id || !entry.completed_at) return false;
    const completedAt = new Date(entry.completed_at).getTime();
    if (Number.isNaN(completedAt)) return false;
    return now - completedAt <= this.constructor.constants.UNDO_WINDOW_MS;
  }

  _focusSnooze(chore) {
    return this._focusAction(chore, "snooze_chore", {}, `"${chore.name}" moved to tomorrow`);
  }

  _focusSkip(chore) {
    return this._focusAction(chore, "skip_chore", {}, `"${chore.name}" skipped to next time`);
  }

  // --- Micro-steps ---------------------------------------------------------

  /**
   * Whether a step reads as done, preferring a pending local tick over the
   * last value the sensors reported.
   */
  _stepIsDone(chore, index) {
    const key = `${chore.id}:${index}`;
    if (key in this._stepOptimistic) return this._stepOptimistic[key];
    return (chore.step_progress || []).includes(index);
  }

  _countDoneSteps(chore) {
    const steps = chore.steps || [];
    return steps.reduce((total, _step, index) => total + (this._stepIsDone(chore, index) ? 1 : 0), 0);
  }

  async _toggleStep(chore, index) {
    const key = `${chore.id}:${index}`;
    const next = !this._stepIsDone(chore, index);
    this._stepOptimistic = { ...this._stepOptimistic, [key]: next };

    try {
      await this.hass.callService("simple_chores", "toggle_chore_step", {
        chore_id: chore.id,
        step_index: index,
        completed: next,
      });
    } catch (error) {
      console.error("Simple Chores Card: Error toggling step:", error);
      const rolledBack = { ...this._stepOptimistic };
      delete rolledBack[key];
      this._stepOptimistic = rolledBack;
      this._showToast("Couldn't save that step. Please try again.");
    }
  }

  /**
   * Whether a chore's checklist is showing. An explicit tap wins; otherwise
   * the checklist opens itself once any step is ticked, so a part-done chore
   * reads as part-done from across the room without anyone tapping it.
   */
  _stepsOpen(chore, doneSteps = this._countDoneSteps(chore)) {
    const explicit = this._expandedSteps[chore.id];
    if (explicit !== undefined) return explicit;
    return doneSteps > 0;
  }

  _toggleStepsExpanded(chore) {
    this._expandedSteps = { ...this._expandedSteps, [chore.id]: !this._stepsOpen(chore) };
  }

  /**
   * Drop any explicit open/closed choice for a chore. Called when the chore
   * is completed or skipped, since the backend clears its progress then and
   * a fresh checklist should fall back to the "open once started" rule.
   */
  _forgetStepsExpanded(choreId) {
    if (!(choreId in this._expandedSteps)) return;
    const next = { ...this._expandedSteps };
    delete next[choreId];
    this._expandedSteps = next;
  }

  // --- Inline estimate capture --------------------------------------------

  _promptForEstimate(choreId) {
    this._estimatePromptFor = this._estimatePromptFor === choreId ? null : choreId;
  }

  async _setEstimate(chore, minutes) {
    this._estimatePromptFor = null;
    try {
      await this.hass.callService("simple_chores", "update_chore", {
        chore_id: chore.id,
        estimated_minutes: minutes,
      });
      this._showToast(`"${chore.name}" takes about ${this._formatMinutes(minutes)}`);
    } catch (error) {
      console.error("Simple Chores Card: Error saving estimate:", error);
      this._showToast("Couldn't save that estimate. Please try again.");
    }
  }

  // --- Timer ---------------------------------------------------------------

  _clearTimerInterval() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
  }

  _startTimer(chore) {
    const minutes = this._choreMinutes(chore);
    if (!minutes) return;

    this._clearTimerInterval();
    const total = minutes * 60;
    // Track an absolute end time so a backgrounded tab doesn't drift
    this._focusTimer = {
      choreId: chore.id,
      total,
      remaining: total,
      endsAt: Date.now() + total * 1000,
      finished: false,
    };
    this._timerInterval = setInterval(() => this._tickTimer(), 1000);
  }

  _tickTimer() {
    if (!this._focusTimer) {
      this._clearTimerInterval();
      return;
    }
    const remaining = Math.max(0, Math.round((this._focusTimer.endsAt - Date.now()) / 1000));
    const finished = remaining === 0;
    this._focusTimer = { ...this._focusTimer, remaining, finished };
    if (finished) this._clearTimerInterval();
  }

  /**
   * @param {string} [choreId] - Only stop if the timer belongs to this chore
   */
  _stopTimer(choreId) {
    if (choreId && this._focusTimer && this._focusTimer.choreId !== choreId) return;
    this._clearTimerInterval();
    this._focusTimer = null;
  }

  _toggleTimer(chore) {
    if (this._focusTimer && this._focusTimer.choreId === chore.id) {
      this._stopTimer(chore.id);
    } else {
      this._startTimer(chore);
    }
  }

  // --- Celebration ---------------------------------------------------------

  _celebrate(choreId) {
    const { CELEBRATION_PARTICLES, CELEBRATION_MS } = this.constructor.constants;
    // Theme tokens resolve inside the shadow root, so the burst matches the
    // dashboard's palette instead of a fixed rainbow
    const colors = ['var(--sc-accent)', 'var(--sc-success)', 'var(--sc-warning)', 'var(--sc-accent-dark)', '#f6cd8d', '#9fb0c2'];

    // Randomise once, not on every re-render, so the burst doesn't jitter
    const particles = Array.from({ length: CELEBRATION_PARTICLES }, (_unused, i) => ({
      left: Math.round(Math.random() * 100),
      delay: Math.round(Math.random() * 220),
      drift: Math.round((Math.random() - 0.5) * 140),
      duration: 900 + Math.round(Math.random() * 500),
      color: colors[i % colors.length],
    }));

    this._celebration = { id: choreId, particles };
    this._setTimeout(() => { this._celebration = null; }, CELEBRATION_MS);
  }

  // --- Swipe ---------------------------------------------------------------

  _handleDeckTouchStart(e) {
    // Let buttons handle their own taps
    if (e.target && e.target.closest && e.target.closest('button')) {
      this._touchStart = null;
      return;
    }
    const touch = e.changedTouches && e.changedTouches[0];
    this._touchStart = touch ? { x: touch.clientX, y: touch.clientY } : null;
  }

  _handleDeckTouchEnd(e) {
    const start = this._touchStart;
    this._touchStart = null;
    if (!start) return;

    const touch = e.changedTouches && e.changedTouches[0];
    if (!touch) return;

    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    // Require a decisive horizontal swipe so scrolling doesn't complete chores
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

    const queue = this._getFocusQueue();
    const chore = queue[this._clampFocusIndex(queue)];
    if (!chore) return;

    if (dx > 0) {
      this._focusComplete(chore);
    } else {
      this._focusSnooze(chore);
    }
  }

  // --- Focus view rendering ------------------------------------------------

  _renderFocusView() {
    const pool = this._getFocusPool();
    const queue = this._getFocusQueue();

    return html`
      <div class="focus-view">
        ${this._renderFocusToolbar(pool)}
        ${this._renderFocusProgress(queue)}
        ${queue.length === 0
          ? this._renderFocusEmpty(pool)
          : (this._focusMode === 'board' ? this._renderFocusBoard(queue) : this._renderFocusDeck(queue))}
      </div>
    `;
  }

  _renderFocusToolbar(pool) {
    const { TIME_BUDGETS } = this.constructor.constants;
    const chipIcons = { 5: 'mdi:flash', 15: 'mdi:clock-outline', 30: 'mdi:arm-flex' };

    const countWithin = (budget) => pool.filter(chore => {
      const minutes = this._choreMinutes(chore);
      return minutes !== null && minutes <= budget;
    }).length;

    return html`
      <div class="focus-toolbar">
        <div class="focus-chips" role="group" aria-label="How much time do you have?">
          ${TIME_BUDGETS.map(budget => {
            const count = countWithin(budget);
            const active = this._timeBudget === budget;
            return html`
              <button
                class="focus-chip ${active ? 'active' : ''}"
                ?disabled=${count === 0 && !active}
                aria-pressed=${active}
                @click=${() => this._setTimeBudget(budget)}
                title="Chores that take ${budget} minutes or less"
              >
                <ha-icon icon="${chipIcons[budget] || 'mdi:clock-outline'}"></ha-icon>
                <span>${budget}m</span>
                <span class="focus-chip-count">${count}</span>
              </button>
            `;
          })}
          <button
            class="focus-chip ${this._timeBudget === null ? 'active' : ''}"
            aria-pressed=${this._timeBudget === null}
            @click=${() => this._setTimeBudget(null)}
            title="No time limit"
          >
            <span>Anything</span>
            <span class="focus-chip-count">${pool.length}</span>
          </button>
        </div>

        <div class="focus-toolbar-actions">
          <button class="focus-icon-btn" @click=${this._focusShuffle} title="Pick one for me">
            <ha-icon icon="mdi:shuffle-variant"></ha-icon>
          </button>
          <button
            class="focus-icon-btn"
            @click=${this._toggleFocusMode}
            title="${this._focusMode === 'deck' ? 'Show everything as a board' : 'Show one at a time'}"
          >
            <ha-icon icon="${this._focusMode === 'deck' ? 'mdi:view-grid-outline' : 'mdi:cards-outline'}"></ha-icon>
          </button>
        </div>
      </div>
    `;
  }

  _renderFocusProgress(queue) {
    const done = this._getDoneTodayCount();
    const total = done + queue.length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    const streak = this._getStreak();

    return html`
      <div class="focus-progress">
        <div class="focus-progress-label">
          <span><strong>${done}</strong> of ${total} done today</span>
          ${streak > 1 ? html`
            <span class="focus-streak" title="${streak} days in a row with at least one chore done">
              <ha-icon icon="mdi:fire"></ha-icon>${streak} day streak
            </span>
          ` : ''}
        </div>
        <div
          class="focus-progress-track"
          role="progressbar"
          aria-valuenow=${done}
          aria-valuemin="0"
          aria-valuemax=${total}
          aria-label="Chores done today"
        >
          <div class="focus-progress-fill" style="width: ${percent}%"></div>
        </div>
      </div>
    `;
  }

  _renderFocusDeck(queue) {
    const index = this._clampFocusIndex(queue);
    const chore = queue[index];

    return html`
      <div
        class="focus-deck"
        @touchstart=${this._handleDeckTouchStart}
        @touchend=${this._handleDeckTouchEnd}
      >
        <div class="focus-deck-position">
          <button class="focus-nav-btn" ?disabled=${index === 0} @click=${this._focusPrev} title="Previous chore">
            <ha-icon icon="mdi:chevron-left"></ha-icon>
          </button>
          <span>${index + 1} of ${queue.length}</span>
          <button
            class="focus-nav-btn"
            ?disabled=${index >= queue.length - 1}
            @click=${this._focusNext}
            title="Next chore"
          >
            <ha-icon icon="mdi:chevron-right"></ha-icon>
          </button>
        </div>

        ${this._renderFocusCard(chore, { expanded: true })}

        <div class="focus-deck-actions">
          <button class="focus-action later" @click=${() => this._focusSnooze(chore)}>
            <ha-icon icon="mdi:sleep"></ha-icon>
            <span>Later</span>
          </button>
          <button class="focus-action skip" @click=${() => this._focusSkip(chore)}>
            <ha-icon icon="mdi:skip-next"></ha-icon>
            <span>Skip</span>
          </button>
          <button class="focus-action done" @click=${() => this._focusComplete(chore)}>
            <ha-icon icon="mdi:check-bold"></ha-icon>
            <span>Done</span>
          </button>
        </div>

        <div class="focus-hint">Swipe right when it's done, left for later</div>
      </div>
    `;
  }

  _renderFocusBoard(queue) {
    // A wall display renders every card at once, so cap it - 100+ chore cards
    // with four buttons each is a lot of DOM for a tablet
    const limit = this._choreLimits.focusBoard;
    const shown = queue.slice(0, limit);
    const remaining = queue.length - shown.length;

    return html`
      <div class="focus-board">
        ${shown.map(chore => this._renderFocusCard(chore, { expanded: false }))}
      </div>
      ${remaining > 0 ? html`
        <button class="load-more-btn" @click=${() => this._loadMoreChores('focusBoard', queue.length)}>
          Show ${remaining} more
        </button>
      ` : ''}
    `;
  }

  /**
   * A single chore card.
   * @param {Object} chore
   * @param {Object} options
   * @param {boolean} options.expanded - Deck layout: bigger, steps always open,
   *   and the action buttons live outside the card
   */
  _renderFocusCard(chore, { expanded = false } = {}) {
    if (!chore) return '';

    const minutes = this._choreMinutes(chore);
    const steps = chore.steps || [];
    const doneSteps = this._countDoneSteps(chore);
    const roomName = this._resolveRoomName(chore);
    const roomIcon = this._getRoomIcon(chore.room_id || chore.room);
    const overdueDays = Number(chore.days_overdue) || 0;
    const timerRunning = this._focusTimer && this._focusTimer.choreId === chore.id;
    const stepsOpen = expanded || this._stepsOpen(chore, doneSteps);

    return html`
      <div class="focus-card ${expanded ? 'expanded' : 'compact'} ${overdueDays > 0 ? 'overdue' : ''}">
        <div class="focus-card-room">
          <ha-icon icon="${roomIcon}"></ha-icon>
          <span>${roomName}</span>
          ${overdueDays > 0 ? html`
            <span class="focus-overdue-badge">
              ${overdueDays} day${overdueDays === 1 ? '' : 's'} late
            </span>
          ` : ''}
        </div>

        <div class="focus-card-name">${chore.name}</div>

        <div class="focus-card-time">
          ${minutes !== null ? html`
            <button
              class="focus-time-chip ${timerRunning ? 'running' : ''}"
              @click=${() => this._toggleTimer(chore)}
              title="${timerRunning ? 'Stop the timer' : `Start a ${this._formatMinutes(minutes)} timer`}"
            >
              <ha-icon icon="${timerRunning ? 'mdi:stop' : 'mdi:timer-outline'}"></ha-icon>
              <span>${this._formatMinutes(minutes)}</span>
            </button>
          ` : this._renderEstimatePrompt(chore)}
          ${steps.length > 0 && !expanded ? html`
            <button class="focus-steps-toggle" @click=${() => this._toggleStepsExpanded(chore)}>
              <ha-icon icon="${stepsOpen ? 'mdi:chevron-up' : 'mdi:format-list-checks'}"></ha-icon>
              <span>${doneSteps}/${steps.length}</span>
            </button>
          ` : ''}
        </div>

        ${timerRunning ? this._renderTimerRing() : ''}
        ${stepsOpen && steps.length > 0 ? this._renderSteps(chore, steps, doneSteps) : ''}

        ${expanded ? '' : html`
          <div class="focus-card-actions">
            <button class="focus-mini-btn" @click=${() => this._focusSnooze(chore)} title="Later">
              <ha-icon icon="mdi:sleep"></ha-icon>
            </button>
            <button class="focus-mini-btn" @click=${() => this._focusSkip(chore)} title="Skip to next time">
              <ha-icon icon="mdi:skip-next"></ha-icon>
            </button>
            <button class="focus-mini-btn done" @click=${() => this._focusComplete(chore)} title="Done">
              <ha-icon icon="mdi:check-bold"></ha-icon>
            </button>
          </div>
        `}
      </div>
    `;
  }

  _renderSteps(chore, steps, doneSteps) {
    const percent = steps.length > 0 ? Math.round((doneSteps / steps.length) * 100) : 0;

    return html`
      <div class="focus-steps">
        <div class="focus-steps-bar">
          <div class="focus-steps-fill" style="width: ${percent}%"></div>
        </div>
        <ul class="focus-step-list">
          ${steps.map((step, index) => {
            const done = this._stepIsDone(chore, index);
            return html`
              <li>
                <button
                  class="focus-step ${done ? 'done' : ''}"
                  role="checkbox"
                  aria-checked=${done}
                  @click=${() => this._toggleStep(chore, index)}
                >
                  <ha-icon icon="${done ? 'mdi:check-circle' : 'mdi:circle-outline'}"></ha-icon>
                  <span>${step}</span>
                </button>
              </li>
            `;
          })}
        </ul>
      </div>
    `;
  }

  /**
   * Chores with no estimate can't be matched to a time budget, so offer to
   * capture one right here rather than sending people to the edit form.
   */
  _renderEstimatePrompt(chore) {
    if (this._estimatePromptFor !== chore.id) {
      return html`
        <button class="focus-time-chip unset" @click=${() => this._promptForEstimate(chore.id)}>
          <ha-icon icon="mdi:timer-plus-outline"></ha-icon>
          <span>How long?</span>
        </button>
      `;
    }

    return html`
      <div class="focus-estimate-picker">
        ${this.constructor.constants.QUICK_ESTIMATES.map(minutes => html`
          <button class="focus-estimate-btn" @click=${() => this._setEstimate(chore, minutes)}>
            ${minutes}m
          </button>
        `)}
        <button class="focus-estimate-btn cancel" @click=${() => this._promptForEstimate(chore.id)}>
          <ha-icon icon="mdi:close"></ha-icon>
        </button>
      </div>
    `;
  }

  _renderTimerRing() {
    const timer = this._focusTimer;
    if (!timer) return '';

    const radius = 26;
    const circumference = 2 * Math.PI * radius;
    const fraction = timer.total > 0 ? timer.remaining / timer.total : 0;

    return html`
      <div class="focus-timer ${timer.finished ? 'finished' : ''}">
        <svg viewBox="0 0 64 64" class="focus-timer-ring" aria-hidden="true">
          <circle class="ring-track" cx="32" cy="32" r="${radius}"></circle>
          <circle
            class="ring-value"
            cx="32"
            cy="32"
            r="${radius}"
            stroke-dasharray="${circumference}"
            stroke-dashoffset="${circumference * (1 - fraction)}"
          ></circle>
        </svg>
        <span class="focus-timer-text">
          ${timer.finished ? "Time's up!" : this._formatClock(timer.remaining)}
        </span>
      </div>
    `;
  }

  _renderFocusEmpty(pool) {
    // Filtered everything out rather than actually being finished
    if (this._timeBudget !== null && pool.length > 0) {
      const unestimated = pool.filter(chore => this._choreMinutes(chore) === null).length;
      return html`
        <div class="focus-empty">
          <ha-icon icon="mdi:timer-sand-empty"></ha-icon>
          <h3>Nothing that quick right now</h3>
          <p>
            ${unestimated === pool.length
              ? html`None of your remaining chores have a time estimate yet. Tap <em>How long?</em> on a card and this filter starts working.`
              : html`${pool.length} chore${pool.length === 1 ? '' : 's'} left, but ${pool.length === 1 ? 'it takes' : 'they all take'} longer than ${this._timeBudget} minutes.`}
          </p>
          <button class="focus-empty-btn" @click=${() => this._setTimeBudget(null)}>Show anything</button>
        </div>
      `;
    }

    if (!this._focusGetAhead) {
      return html`
        <div class="focus-empty done">
          ${this._renderSleepingCritter()}
          <h3>All caught up</h3>
          <p>Nothing else is due today.</p>
          <button class="focus-empty-btn" @click=${this._focusStartGetAhead}>Get ahead on this week</button>
        </div>
      `;
    }

    return html`
      <div class="focus-empty done">
        ${this._renderSleepingCritter()}
        <h3>Nothing left this week either</h3>
        <p>Genuinely nothing to do. Go sit down.</p>
      </div>
    `;
  }

  _renderCelebration() {
    if (!this._celebration) return '';

    return html`
      <div class="focus-confetti" aria-hidden="true">
        ${this._celebration.particles.map(particle => html`
          <span style="left: ${particle.left}%; background: ${particle.color}; animation-delay: ${particle.delay}ms; animation-duration: ${particle.duration}ms; --drift: ${particle.drift}px"></span>
        `)}
      </div>
    `;
  }

  _completeChore(choreId) {
    this.hass.callService("simple_chores", "complete_chore", {
      chore_id: choreId
    }).then(() => {
      this._celebrate(choreId);
      const chore = this._choresData.byId.get(choreId);
      this._offerUndo({ id: choreId, name: chore ? chore.name : "Chore" });
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
    this._setTimeout(() => {
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
        this._setTimeout(() => {
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

  /**
   * Renders the shared modal wrapper: overlay (click to close), dialog
   * container with aria attributes and click propagation stopped, and a
   * header with title + close button.
   * @param {string} titleId - id used for the h3 and aria-labelledby
   * @param {string|Object} title - Title content (string or lit template)
   * @param {Function} onClose - Handler for overlay click and close button
   * @param {Object} body - lit template placed inside .modal-body
   * @param {Object} [options]
   * @param {string} [options.contentClass] - Extra class(es) on .modal-content
   * @param {Object} [options.footer] - lit template for .modal-footer
   * @param {Function} [options.onBodyClick] - Optional click handler on .modal-body
   * @returns {Object} lit template
   */
  _renderModalShell(titleId, title, onClose, body, options = {}) {
    const { contentClass = "", footer = null, onBodyClick = null } = options;
    return html`
      <div class="modal-overlay" @click=${onClose}>
        <div class="modal-content${contentClass ? ` ${contentClass}` : ''}" role="dialog" aria-modal="true" aria-labelledby="${titleId}" @click=${(e) => e.stopPropagation()}>
          <div class="modal-header">
            <h3 id="${titleId}">${title}</h3>
            <button class="close-btn" @click=${onClose} aria-label="Close dialog">
              <ha-icon icon="mdi:close"></ha-icon>
            </button>
          </div>
          <div class="modal-body" @click=${onBodyClick}>
            ${body}
          </div>
          ${footer !== null ? html`<div class="modal-footer">${footer}</div>` : ''}
        </div>
      </div>
    `;
  }

  _renderAddRoomModal() {
    if (!this._showAddRoomModal) {
      return html``;
    }

    const body = html`
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
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeAddRoomModal} ?disabled=${this._isLoading}>Cancel</button>
      <button
        class="submit-btn ${this._isLoading ? 'loading' : ''}"
        @click=${this._submitAddRoom}
        ?disabled=${!this._formData.room.name?.trim() || this._isLoading}>
        ${this._isLoading ? html`<span class="spinner"></span>` : ''}
        Create Room
      </button>
    `;

    return this._renderModalShell("add-room-title", "Add Custom Room", this._closeAddRoomModal, body, { footer });
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
      await new Promise(resolve => this._setTimeout(resolve, 500));

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
    this._setTimeout(() => {
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
      await new Promise(resolve => this._setTimeout(resolve, 500));

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
      await new Promise(resolve => this._setTimeout(resolve, 800));

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
    this._setTimeout(() => {
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
      await new Promise(resolve => this._setTimeout(resolve, 500));

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

    const body = html`
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
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeManageRoomsModal}>Close</button>
    `;

    return this._renderModalShell("manage-rooms-title", "Manage Custom Rooms", this._closeManageRoomsModal, body, { footer });
  }

  _openAddChoreModal(preselectedRoom) {
    this._showAddChoreModal = true;
    this._resetForm('chore');
    if (typeof preselectedRoom === 'string' && preselectedRoom) {
      this._formData = {
        ...this._formData,
        chore: { ...this._formData.chore, room: preselectedRoom },
      };
    }

    // Focus first input after modal renders
    this._setTimeout(() => {
      const input = this.shadowRoot.querySelector('#chore-name');
      if (input) input.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _closeAddChoreModal() {
    this._showAddChoreModal = false;
    this._resetForm('chore');
    if (this._returnToAllChoresModal) {
      this._returnToAllChoresModal = false;
      this._showAllChoresModal = true;
    }
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

  /**
   * @param {string|number} raw - Raw form value
   * @returns {number|null} Whole minutes, or null when blank/invalid
   */
  _parseEstimatedMinutes(raw) {
    if (raw === "" || raw === null || raw === undefined) return null;
    const minutes = Math.round(Number(raw));
    if (!Number.isFinite(minutes) || minutes < 1) return null;
    return Math.min(minutes, 480);
  }

  /** Drop blank rows so an empty step field doesn't become an empty step. */
  _cleanSteps(steps) {
    return (steps || []).map(step => String(step).trim()).filter(Boolean);
  }

  _handleEstimatedMinutesInput(e) {
    this._handleFormInput('chore', 'estimatedMinutes', e.target.value);
  }

  _handleStepInput(index, value) {
    const steps = [...(this._formData.chore.steps || [])];
    steps[index] = value;
    this._handleFormInput('chore', 'steps', steps);
  }

  _addStepField() {
    const steps = [...(this._formData.chore.steps || [])];
    if (steps.length >= 12) {
      this._showToast("12 steps is the limit - consider splitting this into two chores.");
      return;
    }
    steps.push("");
    this._handleFormInput('chore', 'steps', steps);

    // Focus the field we just added
    this._setTimeout(() => {
      const inputs = this.shadowRoot.querySelectorAll('.step-input');
      const last = inputs[inputs.length - 1];
      if (last) last.focus();
    }, this.constructor.constants.MODAL_FOCUS_DELAY);
  }

  _removeStepField(index) {
    const steps = [...(this._formData.chore.steps || [])];
    steps.splice(index, 1);
    this._handleFormInput('chore', 'steps', steps);
  }

  /**
   * The two focus-view fields, shared by the Add and Edit Chore modals.
   * Both are optional: without them a chore just doesn't take part in the
   * time-budget filter or show a checklist.
   */
  _renderFocusFields() {
    const steps = this._formData.chore.steps || [];

    return html`
      <div class="form-group">
        <label for="chore-minutes">How long does it take? (optional)</label>
        <input
          id="chore-minutes"
          type="number"
          min="1"
          max="480"
          .value=${this._formData.chore.estimatedMinutes ?? ""}
          @input=${this._handleEstimatedMinutesInput}
          placeholder="e.g. 5"
        />
        <small>Powers the focus view's "I have 5 minutes" filter and its timer</small>
      </div>
      <div class="form-group">
        <label>Steps (optional)</label>
        ${steps.length > 0 ? html`
          <div class="step-editor">
            ${steps.map((step, index) => html`
              <div class="step-row">
                <span class="step-number">${index + 1}</span>
                <input
                  class="step-input"
                  type="text"
                  maxlength="100"
                  .value=${step}
                  @input=${(e) => this._handleStepInput(index, e.target.value)}
                  placeholder="e.g. Clear the counter"
                />
                <button
                  type="button"
                  class="step-remove"
                  @click=${() => this._removeStepField(index)}
                  title="Remove this step"
                >
                  <ha-icon icon="mdi:close"></ha-icon>
                </button>
              </div>
            `)}
          </div>
        ` : ''}
        <button type="button" class="step-add" @click=${this._addStepField}>
          <ha-icon icon="mdi:plus"></ha-icon>
          Add step
        </button>
        <small>Break it into small pieces so starting is easier</small>
      </div>
    `;
  }

  _handleRecurrenceTypeChange(e) {
    this._handleFormInput('chore', 'recurrenceType', e.target.value);
    this.requestUpdate();
  }

  _handleAnchorDayToggle(day) {
    const currentDays = [...(this._formData.chore.anchorDaysOfWeek || [])];
    const index = currentDays.indexOf(day);
    if (index >= 0) {
      currentDays.splice(index, 1);
    } else {
      currentDays.push(day);
      currentDays.sort((a, b) => a - b);
    }
    this._handleFormInput('chore', 'anchorDaysOfWeek', currentDays);
    this.requestUpdate();
  }

  _handleAnchorTypeChange(e) {
    this._handleFormInput('chore', 'anchorType', e.target.value);
    this.requestUpdate();
  }

  _handleAnchorDayOfMonthChange(e) {
    this._handleFormInput('chore', 'anchorDayOfMonth', parseInt(e.target.value, 10));
  }

  _handleAnchorWeekChange(e) {
    this._handleFormInput('chore', 'anchorWeek', parseInt(e.target.value, 10));
  }

  _handleAnchorWeekdayChange(e) {
    this._handleFormInput('chore', 'anchorWeekday', parseInt(e.target.value, 10));
  }

  _handleIntervalChange(e) {
    this._handleFormInput('chore', 'interval', parseInt(e.target.value, 10) || 1);
  }

  _renderRecurrenceOptions(prefix) {
    const frequency = this._formData.chore.frequency;
    const recurrenceType = this._formData.chore.recurrenceType || 'interval';

    // Only show recurrence options for frequencies where it makes sense
    const showRecurrence = ['weekly', 'biweekly', 'monthly', 'bimonthly', 'quarterly', 'biannual', 'yearly'].includes(frequency);

    if (!showRecurrence) {
      return html``;
    }

    const isWeekly = ['weekly', 'biweekly'].includes(frequency);
    const isMonthlyPlus = ['monthly', 'bimonthly', 'quarterly', 'biannual', 'yearly'].includes(frequency);

    const weekdays = [
      { value: 0, label: 'Sun' },
      { value: 1, label: 'Mon' },
      { value: 2, label: 'Tue' },
      { value: 3, label: 'Wed' },
      { value: 4, label: 'Thu' },
      { value: 5, label: 'Fri' },
      { value: 6, label: 'Sat' }
    ];

    const weekdaysFull = [
      { value: 0, label: 'Sunday' },
      { value: 1, label: 'Monday' },
      { value: 2, label: 'Tuesday' },
      { value: 3, label: 'Wednesday' },
      { value: 4, label: 'Thursday' },
      { value: 5, label: 'Friday' },
      { value: 6, label: 'Saturday' }
    ];

    const weekOrdinals = [
      { value: 1, label: 'First' },
      { value: 2, label: 'Second' },
      { value: 3, label: 'Third' },
      { value: 4, label: 'Fourth' },
      { value: 5, label: 'Last' }
    ];

    return html`
      <div class="form-group recurrence-section">
        <label>Recurrence Pattern</label>
        <div class="recurrence-type-toggle">
          <label class="radio-label">
            <input
              type="radio"
              name="${prefix}-recurrence-type"
              value="interval"
              ?checked=${recurrenceType === 'interval'}
              @change=${this._handleRecurrenceTypeChange}
            />
            <span>From completion date</span>
          </label>
          <label class="radio-label">
            <input
              type="radio"
              name="${prefix}-recurrence-type"
              value="anchored"
              ?checked=${recurrenceType === 'anchored'}
              @change=${this._handleRecurrenceTypeChange}
            />
            <span>On specific days</span>
          </label>
        </div>
        <small class="recurrence-help">
          ${recurrenceType === 'interval'
            ? 'Next occurrence calculated from when the chore is completed'
            : 'Always occurs on the same day(s) regardless of completion date'}
        </small>

        ${recurrenceType === 'anchored' ? html`
          <div class="anchor-options">
            ${isWeekly ? html`
              <div class="weekday-picker">
                <label>Select days:</label>
                <div class="weekday-buttons">
                  ${weekdays.map(day => html`
                    <button
                      type="button"
                      class="weekday-btn ${(this._formData.chore.anchorDaysOfWeek || []).includes(day.value) ? 'selected' : ''}"
                      @click=${() => this._handleAnchorDayToggle(day.value)}
                    >
                      ${day.label}
                    </button>
                  `)}
                </div>
              </div>
            ` : ''}

            ${isMonthlyPlus ? html`
              <div class="monthly-options">
                <label>Occurs on:</label>
                <div class="anchor-type-select">
                  <label class="radio-label">
                    <input
                      type="radio"
                      name="${prefix}-anchor-type"
                      value="day_of_month"
                      ?checked=${this._formData.chore.anchorType === 'day_of_month'}
                      @change=${this._handleAnchorTypeChange}
                    />
                    <span>Day of month</span>
                  </label>
                  <label class="radio-label">
                    <input
                      type="radio"
                      name="${prefix}-anchor-type"
                      value="week_pattern"
                      ?checked=${this._formData.chore.anchorType === 'week_pattern'}
                      @change=${this._handleAnchorTypeChange}
                    />
                    <span>Week pattern</span>
                  </label>
                </div>

                ${this._formData.chore.anchorType === 'day_of_month' ? html`
                  <div class="day-of-month-picker">
                    <label>Day:</label>
                    <select
                      @change=${this._handleAnchorDayOfMonthChange}
                      .value=${String(this._formData.chore.anchorDayOfMonth || 1)}
                    >
                      ${Array.from({length: 31}, (_, i) => i + 1).map(day => html`
                        <option value=${day} ?selected=${this._formData.chore.anchorDayOfMonth === day}>${day}</option>
                      `)}
                    </select>
                    <small>If month has fewer days, uses last day of month</small>
                  </div>
                ` : html`
                  <div class="week-pattern-picker">
                    <div class="pattern-row">
                      <select
                        @change=${this._handleAnchorWeekChange}
                        .value=${String(this._formData.chore.anchorWeek || 1)}
                      >
                        ${weekOrdinals.map(ord => html`
                          <option value=${ord.value} ?selected=${this._formData.chore.anchorWeek === ord.value}>${ord.label}</option>
                        `)}
                      </select>
                      <select
                        @change=${this._handleAnchorWeekdayChange}
                        .value=${String(this._formData.chore.anchorWeekday || 1)}
                      >
                        ${weekdaysFull.map(day => html`
                          <option value=${day.value} ?selected=${this._formData.chore.anchorWeekday === day.value}>${day.label}</option>
                        `)}
                      </select>
                    </div>
                    <small>e.g., "Second Tuesday" of each month</small>
                  </div>
                `}
              </div>
            ` : ''}
          </div>
        ` : ''}
      </div>
    `;
  }

  _renderAddUserModal() {
    if (!this._showAddUserModal) {
      return html``;
    }

    const body = html`
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
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeAddUserModal} ?disabled=${this._isLoading}>Cancel</button>
      <button
        class="submit-btn ${this._isLoading ? 'loading' : ''}"
        @click=${this._submitAddUser}
        ?disabled=${!this._formData.user.name?.trim() || this._isLoading}>
        ${this._isLoading ? html`<span class="spinner"></span>` : ''}
        Add User
      </button>
    `;

    return this._renderModalShell("add-user-title", "Add Custom User", this._closeAddUserModal, body, { footer });
  }

  _renderManageUsersModal() {
    if (!this._showManageUsersModal) {
      return html``;
    }

    const users = this._getUsers();
    const customUsers = users.filter(user => user.is_custom);

    const body = html`
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
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeManageUsersModal}>Close</button>
    `;

    return this._renderModalShell("manage-users-title", "Manage Custom Users", this._closeManageUsersModal, body, { footer });
  }

  _renderEditUserModal() {
    if (!this._showEditUserModal) {
      return html``;
    }

    const body = html`
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
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeEditUserModal} ?disabled=${this._isLoading}>Cancel</button>
      <button
        class="submit-btn ${this._isLoading ? 'loading' : ''}"
        @click=${this._submitEditUser}
        ?disabled=${!this._formData.user.name?.trim() || this._isLoading}>
        ${this._isLoading ? html`<span class="spinner"></span>` : ''}
        Update User
      </button>
    `;

    return this._renderModalShell("edit-user-title", "Edit User", this._closeEditUserModal, body, { footer });
  }

  _renderAddChoreModal() {
    if (!this._showAddChoreModal) {
      return html``;
    }

    const rooms = this._getRooms();

    const body = html`
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
            ${this._renderRecurrenceOptions('add')}
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
            ${this._renderFocusFields()}
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeAddChoreModal} ?disabled=${this._isLoading}>Cancel</button>
      <button
        class="submit-btn ${this._isLoading ? 'loading' : ''}"
        @click=${this._submitAddChore}
        ?disabled=${!this._formData.chore.name?.trim() || !this._formData.chore.room?.trim() || this._isLoading}>
        ${this._isLoading ? html`<span class="spinner"></span>` : ''}
        Create Chore
      </button>
    `;

    return this._renderModalShell("add-chore-title", "Add New Chore", this._closeAddChoreModal, body, { footer });
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
      assignedTo: chore.assigned_to || "",
      recurrenceType: chore.recurrence_type || "interval",
      anchorDaysOfWeek: chore.anchor_days_of_week || [],
      anchorType: chore.anchor_type || "day_of_month",
      anchorDayOfMonth: chore.anchor_day_of_month || 1,
      anchorWeek: chore.anchor_week || 1,
      anchorWeekday: chore.anchor_weekday || 1,
      interval: chore.interval || 1,
      estimatedMinutes: chore.estimated_minutes ?? "",
      steps: [...(chore.steps || [])]
    };


    // Show the modal and request update
    this._showEditChoreModal = true;
    this.requestUpdate();

    // Force update the select elements after modal is shown and focus first input
    this._setTimeout(() => {
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

    const body = html`
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
            ${this._renderRecurrenceOptions('edit')}
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
            ${this._renderFocusFields()}
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeEditChoreModal} ?disabled=${this._isLoading}>Cancel</button>
      <button
        class="submit-btn ${this._isLoading ? 'loading' : ''}"
        @click=${this._submitEditChore}
        ?disabled=${!this._formData.chore.name?.trim() || !this._formData.chore.room?.trim() || this._isLoading}>
        ${this._isLoading ? html`<span class="spinner"></span>` : ''}
        Update Chore
      </button>
    `;

    return this._renderModalShell("edit-chore-title", "Edit Chore", this._closeEditChoreModal, body, { footer });
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
    this._allChoresRoomFilter = "all";
    this._showAllChoresModal = true;
  }

  _closeAllChoresModal() {
    this._showAllChoresModal = false;
  }

  _getAllChores() {
    return this._choresData.chores;
  }

  _renderAllChoresModal() {
    if (!this._showAllChoresModal) {
      return html``;
    }

    const rawChores = this._getAllChores();

    // Count chores per room
    const roomChoreCounts = {};
    for (const chore of rawChores) {
      const rid = chore.room_id || chore.room;
      if (rid) {
        roomChoreCounts[rid] = (roomChoreCounts[rid] || 0) + 1;
      }
    }

    // Get rooms that have chores
    const allRooms = this._getRooms();
    const roomsWithChores = allRooms.filter(r => roomChoreCounts[r.id] > 0);

    // Apply room filter
    const roomFiltered = this._allChoresRoomFilter === 'all'
      ? rawChores
      : rawChores.filter(c => (c.room_id || c.room) === this._allChoresRoomFilter);
    const allChores = this._filterChoresByUser(roomFiltered);

    // Current filter label
    const filterRoom = roomsWithChores.find(r => r.id === this._allChoresRoomFilter);
    const filterLabel = this._allChoresRoomFilter === 'all'
      ? `All Rooms (${rawChores.length})`
      : `${filterRoom?.name || 'Unknown'} (${roomChoreCounts[this._allChoresRoomFilter] || 0})`;

    const body = html`
            <div class="all-chores-toolbar">
              <select
                class="room-filter-select"
                .value=${this._allChoresRoomFilter}
                @change=${(e) => { this._allChoresRoomFilter = e.target.value; }}
              >
                <option value="all">All Rooms (${rawChores.length})</option>
                ${roomsWithChores.map(room => html`
                  <option value="${room.id}">
                    ${room.name} (${roomChoreCounts[room.id]})
                  </option>
                `)}
              </select>
              <button class="add-chore-btn-toolbar" @click=${this._addChoreFromAllChoresModal}>
                <ha-icon icon="mdi:plus"></ha-icon>
                <span>Add Chore</span>
              </button>
            </div>
            ${allChores.length === 0 ? html`
              <div class="no-chores">
                <p>No active chores found${this._allChoresRoomFilter !== 'all' ? ' in this room' : ''}.</p>
                <p>Create a chore using the Add Chore button above!</p>
              </div>
            ` : html`
              <div class="all-chores-list">
                ${allChores.slice(0, this._choreLimits.allChores).map(chore =>
                  this._renderChore(chore, { inModal: true, showFrequency: true })
                )}
                ${allChores.length > this._choreLimits.allChores ? html`
                  <button
                    class="load-more-btn"
                    @click=${() => this._loadMoreChores('allChores', allChores.length)}
                  >
                    Load ${allChores.length - this._choreLimits.allChores} more chores...
                  </button>
                ` : ''}
              </div>
            `}
    `;

    const footer = html`
      <button class="submit-btn" @click=${this._closeAllChoresModal}>Close</button>
    `;

    return this._renderModalShell(
      "all-chores-title",
      html`All Active Chores (${allChores.length})`,
      this._closeAllChoresModal,
      body,
      {
        contentClass: "large-modal",
        footer,
        onBodyClick: this._handleContentClick,
      }
    );
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

  _addChoreFromAllChoresModal() {
    const preselectedRoom = this._allChoresRoomFilter !== 'all' ? this._allChoresRoomFilter : "";
    this._returnToAllChoresModal = true;
    this._closeAllChoresModal();
    this._openAddChoreModal(preselectedRoom);
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
      assignedTo: chore.assigned_to || "",
      recurrenceType: chore.recurrence_type || "interval",
      anchorDaysOfWeek: chore.anchor_days_of_week || [],
      anchorType: chore.anchor_type || "day_of_month",
      anchorDayOfMonth: chore.anchor_day_of_month || 1,
      anchorWeek: chore.anchor_week || 1,
      anchorWeekday: chore.anchor_weekday || 1,
      interval: chore.interval || 1,
      estimatedMinutes: chore.estimated_minutes ?? "",
      steps: [...(chore.steps || [])]
    };


    // Direct modal swap - close one and open the other simultaneously
    this._showAllChoresModal = false;
    this._showEditChoreModal = true;
    this.requestUpdate();

    // Force update the select elements after modal is shown
    this._setTimeout(() => {
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
      reassignTo: chore.assigned_to || "", // Keep current assignment by default
      originalAssignedTo: chore.assigned_to || ""
    };
    this._showCompleteChoreModal = true;

    // Focus first select after modal renders
    this._setTimeout(() => {
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
      reassignTo: chore.assigned_to || "",
      originalAssignedTo: chore.assigned_to || ""
    };
    this._showAllChoresModal = false;
    this._showCompleteChoreModal = true;

    // Focus first select after modal renders
    this._setTimeout(() => {
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

      // Add recurrence fields
      serviceData.recurrence_type = choreData.recurrenceType || 'interval';
      if (choreData.recurrenceType === 'anchored') {
        // Weekly anchored - days of week
        if (['weekly', 'biweekly'].includes(choreData.frequency) && choreData.anchorDaysOfWeek?.length > 0) {
          serviceData.anchor_days_of_week = choreData.anchorDaysOfWeek;
        }
        // Monthly+ anchored - anchor type and related fields
        if (['monthly', 'bimonthly', 'quarterly', 'biannual', 'yearly'].includes(choreData.frequency)) {
          serviceData.anchor_type = choreData.anchorType || 'day_of_month';
          if (choreData.anchorType === 'day_of_month') {
            serviceData.anchor_day_of_month = choreData.anchorDayOfMonth || 1;
          } else if (choreData.anchorType === 'week_pattern') {
            serviceData.anchor_week = choreData.anchorWeek || 1;
            serviceData.anchor_weekday = choreData.anchorWeekday || 1;
          }
        }
      }

      // Focus view fields - only sent when actually filled in
      const minutes = this._parseEstimatedMinutes(choreData.estimatedMinutes);
      if (minutes !== null) {
        serviceData.estimated_minutes = minutes;
      }
      const steps = this._cleanSteps(choreData.steps);
      if (steps.length > 0) {
        serviceData.steps = steps;
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

      // Always include assigned_to: a non-empty value assigns, an empty
      // string explicitly clears the assignment (omitting it would leave
      // the previous assignment unchanged on the backend).
      serviceData.assigned_to = choreData.assignedTo?.trim() || "";

      // Add recurrence fields
      serviceData.recurrence_type = choreData.recurrenceType || 'interval';
      if (choreData.recurrenceType === 'anchored') {
        // Weekly anchored - days of week
        if (['weekly', 'biweekly'].includes(choreData.frequency) && choreData.anchorDaysOfWeek?.length > 0) {
          serviceData.anchor_days_of_week = choreData.anchorDaysOfWeek;
        }
        // Monthly+ anchored - anchor type and related fields
        if (['monthly', 'bimonthly', 'quarterly', 'biannual', 'yearly'].includes(choreData.frequency)) {
          serviceData.anchor_type = choreData.anchorType || 'day_of_month';
          if (choreData.anchorType === 'day_of_month') {
            serviceData.anchor_day_of_month = choreData.anchorDayOfMonth || 1;
          } else if (choreData.anchorType === 'week_pattern') {
            serviceData.anchor_week = choreData.anchorWeek || 1;
            serviceData.anchor_weekday = choreData.anchorWeekday || 1;
          }
        }
      }

      // Focus view fields - always sent so clearing them sticks
      // (0 clears an estimate, [] clears the steps)
      serviceData.estimated_minutes = this._parseEstimatedMinutes(choreData.estimatedMinutes) ?? 0;
      serviceData.steps = this._cleanSteps(choreData.steps);

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
      this._forgetStepsExpanded(completionData.choreId);
      this._celebrate(completionData.choreId);
      this._offerUndo({ id: completionData.choreId, name: completionData.choreName });

      // If the assignment selection changed, update the chore assignment.
      // An empty string explicitly clears the assignment on the backend.
      if (completionData.reassignTo !== undefined &&
          completionData.reassignTo !== completionData.originalAssignedTo) {
        const reassignData = {
          chore_id: completionData.choreId,
          assigned_to: completionData.reassignTo || ""
        };
        await this.hass.callService("simple_chores", "update_chore", reassignData);
      }

      this._closeCompleteChoreModal();
    } catch (error) {
      console.error("Simple Chores Card: Error completing chore:", error);
      this._showToast("Error completing chore. Please try again.");
    } finally {
      this._isLoading = false;
    }
  }


  /**
   * Fetch raw completion history over the websocket.
   *
   * History is no longer published as a state attribute - it grew without
   * bound and pushed sensor.total_chores past the recorder's 16 KB limit. Only
   * the calendar and the history modal need raw entries, so they're fetched on
   * demand and re-fetched when the completion count changes.
   * @param {boolean} force - Fetch even if the cache looks current
   */
  async _fetchHistory(force = false) {
    if (!this.hass) return;

    const knownCount = this._getStats()?.total_completions ?? null;
    if (!force && this._historyFetchedFor !== null && this._historyFetchedFor === knownCount) {
      return;
    }
    if (this._historyFetchInFlight) return;

    this._historyFetchInFlight = true;
    try {
      const result = await this.hass.callWS({ type: "simple_chores/history" });
      const history = (result && result.history) || [];
      // Newest first, matching what the history modal expects
      this._historyData = [...history].sort(
        (a, b) => new Date(b.completed_at) - new Date(a.completed_at)
      );
      this._historyFetchedFor = knownCount;
    } catch (error) {
      console.error("Simple Chores Card: Failed to fetch completion history:", error);
      this._historyData = this._historyData || [];
    } finally {
      this._historyFetchInFlight = false;
    }
  }

  async _getCompletionHistory() {
    await this._fetchHistory(true);
    return this._historyData || [];
  }

  /**
   * Whatever history has already been fetched. Render paths use this; it may
   * be empty on first paint until _fetchHistory resolves.
   */
  _getCompletionHistorySync() {
    return this._historyData || [];
  }

  // ============================================
  // STATISTICS DASHBOARD METHODS
  // ============================================


  /**
   * Read the precomputed statistics attribute.
   * @returns {Object|null}
   */
  _getStats() {
    const sensor = this.hass?.states?.[SimpleChoresCard.SENSORS.TOTAL];
    return sensor?.attributes?.statistics || null;
  }

  /**
   * Map the backend's statistics attribute onto the shapes the stats
   * dashboard renders from. These used to be derived here from raw history.
   */
  _calculateStatsData() {
    const stats = this._getStats();
    if (!stats) {
      return {
        completionsOverTime: [],
        topChores: { mostCompleted: [], leastCompleted: [] },
        roomStats: [],
        userStats: [],
        totalCompletions: 0,
      };
    }

    const { STATS_PERIODS, STATS_DEFAULT_PERIOD } = this.constructor.constants;
    const period = STATS_PERIODS[this._statsTimePeriod] || STATS_PERIODS[STATS_DEFAULT_PERIOD];
    const buckets = (stats.by_period || {})[this._statsTimePeriod] || [];

    return {
      completionsOverTime: this._formatPeriodBuckets(buckets, period.groupBy),
      topChores: {
        mostCompleted: stats.top_chores?.most_completed || [],
        leastCompleted: stats.top_chores?.least_completed || [],
      },
      roomStats: stats.by_room || [],
      userStats: stats.by_user || [],
      totalCompletions: stats.total_completions || 0,
    };
  }

  /**
   * Turn {start, count} buckets into the {label, count} pairs the chart wants.
   * Labels are formatted here so date formatting stays on the client.
   * @param {Array<{start: string, count: number}>} buckets - Oldest first
   * @param {string} groupBy - 'day' | 'week' | 'month'
   */
  _formatPeriodBuckets(buckets, groupBy) {
    return buckets.map((bucket, index) => {
      const date = this._parseLocalDate(bucket.start);
      let label;
      if (groupBy === 'day') {
        label = date.toLocaleDateString('en-US', { weekday: 'short' });
      } else if (groupBy === 'week') {
        label = `W${index + 1}`;
      } else {
        label = date.toLocaleDateString('en-US', { month: 'short' });
      }
      return { label, count: bucket.count || 0, start: bucket.start };
    });
  }







  _toggleExpandedStats() {
    this._showExpandedStats = !this._showExpandedStats;
  }

  _setStatsPeriod(period) {
    this._statsTimePeriod = period;
    this.requestUpdate();
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

    const body = html`
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
                        <span class="completed-by">by ${entry.completed_by_name || entry.completed_by || 'Unknown'}</span>
                      </div>
                      <div class="completion-details">
                        <span class="completion-date">${formattedDate}</span>
                        <span class="completion-time">${formattedTime}</span>
                        ${this._canUndoEntry(entry) ? html`
                          <button
                            class="history-undo-btn"
                            title="Undo this completion and put the chore back"
                            @click=${() => this._undoHistoryEntry(entry)}
                          >
                            <ha-icon icon="mdi:undo-variant"></ha-icon>
                            Undo
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  `;
                })}
              </div>
            `}
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeHistoryModal}>Close</button>
    `;

    return this._renderModalShell(
      "history-title",
      html`📊 Completion History (${history.length})`,
      this._closeHistoryModal,
      body,
      { contentClass: "large-modal", footer }
    );
  }

  _renderCompleteChoreModal() {
    if (!this._showCompleteChoreModal) {
      return html``;
    }

    const users = this._getUsers();
    // Look the chore up fresh so the steps reflect the latest ticks, not a
    // snapshot from when the modal opened
    const chore = this._choresData.byId.get(this._formData.completion.choreId);
    const steps = (chore && chore.steps) || [];
    const doneSteps = chore ? this._countDoneSteps(chore) : 0;

    const body = html`
            <div class="completion-info">
              <h4>📋 ${this._formData.completion.choreName}</h4>
              ${this._formData.completion.roomName ? html`
                <p class="completion-room"><ha-icon icon="mdi:home"></ha-icon> ${this._formData.completion.roomName}</p>
              ` : ''}
              <p>Mark this chore as completed and optionally reassign for next time.</p>
            </div>

            ${steps.length > 0 ? html`
              <div class="completion-steps">
                <div class="completion-steps-title">
                  <ha-icon icon="mdi:format-list-checks"></ha-icon>
                  <span>${doneSteps} of ${steps.length} steps ticked</span>
                </div>
                <ul class="completion-step-list">
                  ${steps.map((step, index) => {
                    const done = this._stepIsDone(chore, index);
                    return html`
                      <li class="${done ? 'done' : ''}">
                        <ha-icon icon="${done ? 'mdi:check-circle' : 'mdi:circle-outline'}"></ha-icon>
                        <span>${step}</span>
                      </li>
                    `;
                  })}
                </ul>
                <small>Completing clears the checklist for next time.</small>
              </div>
            ` : ''}
            
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
    `;

    const footer = html`
      <button class="cancel-btn" @click=${this._closeCompleteChoreModal} ?disabled=${this._isLoading}>Cancel</button>
      <button
        class="submit-btn ${this._isLoading ? 'loading' : ''}"
        @click=${this._submitCompleteChore}
        ?disabled=${!this._formData.completion.completedBy?.trim() || this._isLoading}>
        ${this._isLoading ? html`<span class="spinner"></span>` : ''}
        ✓ Mark Complete
      </button>
    `;

    return this._renderModalShell("complete-chore-title", "✓ Complete Chore", this._closeCompleteChoreModal, body, { footer });
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

  /**
   * Simple toast notification. Pass `action` ({ text, onAction }) for a
   * button inside the toast, like Undo after a completion; such toasts stay
   * up longer so there is time to react.
   */
  _showToast(message, { action = null, duration = null } = {}) {
    const toast = document.createElement('div');
    toast.className = 'simple-chores-toast';
    toast.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      display: flex;
      align-items: center;
      gap: 16px;
      background: var(--primary-color);
      color: var(--text-primary-color, white);
      padding: 12px 24px;
      border-radius: 999px;
      z-index: 10000;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    `;
    const text = document.createElement('span');
    text.textContent = message;
    toast.appendChild(text);

    const remove = () => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    };

    if (action && typeof action.onAction === 'function') {
      const button = document.createElement('button');
      button.textContent = action.text || 'Undo';
      button.style.cssText = `
        border: none;
        border-radius: 999px;
        padding: 6px 14px;
        background: rgba(255, 255, 255, 0.22);
        color: inherit;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      `;
      button.addEventListener('click', () => {
        remove();
        action.onAction();
      });
      toast.appendChild(button);
    }

    document.body.appendChild(toast);
    // Intentionally NOT tracked in _pendingTimeouts: the toast element lives
    // on document.body and outlives this card, so its removal timer must
    // still fire even if the card is disconnected.
    setTimeout(remove, duration || (action ? this.constructor.constants.UNDO_TOAST_MS : 3000));
  }

  static get styles() {
    return css`
      /* ============================================
         BASE & LAYOUT
         ============================================ */
      :host {
        display: block;

        /* Paper skin tokens. Each resolves from the active Home Assistant
           theme and falls back to the Headwaters palette, so the card picks
           up a themed dashboard (fonts, cream cards, terracotta) with no
           config, and still looks coherent on a stock theme. */
        --sc-ink: var(--primary-text-color, #274740);
        --sc-ink-soft: var(--secondary-text-color, #4d6a5e);
        --sc-ink-muted: var(--disabled-text-color, #9bb3a4);
        --sc-accent: var(--primary-color, #de6a2f);
        --sc-accent-dark: var(--dark-primary-color, #b9531f);
        --sc-accent-rgb: var(--rgb-primary-color, 222, 106, 47);
        --sc-on-accent: var(--text-primary-color, #fdf4e6);
        --sc-success: var(--success-color, #4d7c6a);
        --sc-success-rgb: var(--rgb-success-color, 77, 124, 106);
        --sc-danger: var(--error-color, #b9531f);
        --sc-danger-rgb: var(--rgb-error-color, 185, 83, 31);
        --sc-warning: var(--warning-color, #efa95c);
        --sc-surface: var(--ha-card-background, var(--card-background-color, #fffdf6));
        --sc-paper: var(--secondary-background-color, #f4efe2);
        --sc-line: var(--divider-color, rgba(46, 90, 79, 0.1));
        --sc-radius: var(--ha-card-border-radius, 12px);
        --sc-shadow: var(--ha-card-box-shadow, 0 2px 8px rgba(0, 0, 0, 0.08));
        --sc-heading-font: var(--ha-font-family-heading, var(--ha-font-family-body, inherit));
        --sc-critter: #b9743a;
        --sc-critter-belly: #f1cf9b;
      }

      /* Transparent mode, for a panel dashboard with a scene behind it. The
         card itself disappears and every row, tile and control floats as its
         own piece of translucent paper, the way the Headwaters wall card
         lays out its home screen. Text that sits straight on the scene uses
         the scene's ink, which the scene script lightens at night. */
      ha-card.transparent {
        background: transparent;
        box-shadow: none;
        border: none;
        --sc-paper: var(--sc-surface);
      }

      ha-card.transparent .card-header {
        border-bottom: none;
      }

      ha-card.transparent .card-title,
      ha-card.transparent .section h3,
      ha-card.transparent .header-ring-label {
        color: var(--hw-scene-ink, var(--sc-ink));
      }

      ha-card.transparent .card-greeting {
        color: var(--hw-scene-ink-soft, var(--sc-ink-soft));
      }

      ha-card.transparent .header-ring .ring-track {
        stroke: rgba(255, 255, 255, 0.55);
      }

      ha-card.transparent .chore-card,
      ha-card.transparent .stat,
      ha-card.transparent .stats-expand-btn,
      ha-card.transparent .stats-dashboard,
      ha-card.transparent .no-chores,
      ha-card.transparent .load-more-btn,
      ha-card.transparent .dropdown-btn,
      ha-card.transparent .icon-btn,
      ha-card.transparent .focus-chip,
      ha-card.transparent .focus-icon-btn,
      ha-card.transparent .focus-progress,
      ha-card.transparent .focus-card,
      ha-card.transparent .focus-empty,
      ha-card.transparent .calendar-view {
        background: var(--sc-surface);
        box-shadow: var(--sc-shadow);
        backdrop-filter: blur(8px);
        -webkit-backdrop-filter: blur(8px);
      }

      ha-card.transparent .focus-progress {
        padding: 12px 16px;
        border-radius: 18px;
      }

      ha-card.transparent .focus-empty,
      ha-card.transparent .calendar-view,
      ha-card.transparent .stats-dashboard {
        border-radius: 18px;
        padding: 16px;
      }

      ha-card.transparent .chore-card:hover,
      ha-card.transparent .focus-card.overdue {
        border-color: transparent;
      }

      ha-card.transparent .focus-card.overdue {
        box-shadow: var(--sc-shadow), inset 0 0 0 2px var(--sc-danger);
      }

      ha-card.transparent .chore-steps,
      ha-card.transparent .focus-steps-bar,
      ha-card.transparent .focus-progress-track {
        background: rgba(var(--sc-accent-rgb), 0.1);
      }

      /* States the floating-paper rule above would otherwise flatten. A
         tint alone would be mostly scene, so layer it over the surface. */
      ha-card.transparent .focus-chip.active,
      ha-card.transparent .icon-btn.active {
        background: var(--sc-accent);
      }

      ha-card.transparent .icon-btn:hover,
      ha-card.transparent .dropdown-btn:hover,
      ha-card.transparent .stat.attention {
        background: linear-gradient(rgba(var(--sc-accent-rgb), 0.16), rgba(var(--sc-accent-rgb), 0.16)), var(--sc-surface);
      }

      ha-card.transparent .stat.warning,
      ha-card.transparent .chore-card.overdue {
        background: linear-gradient(rgba(var(--sc-danger-rgb), 0.14), rgba(var(--sc-danger-rgb), 0.14)), var(--sc-surface);
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
        padding: 16px 16px 12px;
        background: transparent;
        color: var(--sc-ink);
        border-bottom: 1px solid var(--sc-line);
      }

      .header-top-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }

      .header-title-block {
        flex: 1;
        min-width: 0;
      }

      .card-title {
        font-family: var(--sc-heading-font);
        font-size: 1.5em;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.15;
        margin: 0;
      }

      .card-greeting {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 8px;
        margin-top: 3px;
        font-size: 0.9em;
        font-weight: 600;
        color: var(--sc-ink-soft);
      }

      .header-streak {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgba(var(--sc-accent-rgb), 0.14);
        color: var(--sc-accent-dark);
        font-size: 0.85em;
        font-weight: 700;
      }

      .header-streak ha-icon {
        --mdc-icon-size: 14px;
      }

      /* Day ring: done today out of due today */
      .header-ring {
        position: relative;
        width: 48px;
        height: 48px;
        flex-shrink: 0;
      }

      .header-ring svg {
        width: 100%;
        height: 100%;
        transform: rotate(-90deg);
      }

      .header-ring .ring-track {
        fill: none;
        stroke: var(--sc-paper);
        stroke-width: 5;
      }

      .header-ring .ring-value {
        fill: none;
        stroke: var(--sc-success);
        stroke-width: 5;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.4s ease;
      }

      .header-ring.complete .ring-value {
        stroke: var(--sc-accent);
      }

      .header-ring-label {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: var(--sc-heading-font);
        font-size: 0.8em;
        font-weight: 700;
        color: var(--sc-ink);
      }

      .add-chore-btn-primary {
        display: flex;
        align-items: center;
        gap: 6px;
        background: var(--sc-accent);
        border: none;
        border-radius: 999px;
        padding: 9px 16px;
        color: var(--sc-on-accent);
        font-size: 0.8em;
        font-weight: 700;
        cursor: pointer;
        transition: background-color 0.2s, transform 0.15s;
      }

      .add-chore-btn-primary:hover {
        background: var(--sc-accent-dark);
        transform: translateY(-1px);
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
        background: var(--sc-paper);
        border: 1px solid var(--sc-line);
        border-radius: 999px;
        padding: 7px 12px;
        color: var(--sc-ink);
        font-size: 0.8em;
        font-weight: 700;
        cursor: pointer;
        transition: background-color 0.2s;
      }

      .dropdown-btn:hover {
        background: rgba(var(--sc-accent-rgb), 0.14);
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
        background: var(--sc-paper);
        border: 1px solid var(--sc-line);
        border-radius: 999px;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--sc-ink-soft);
        cursor: pointer;
        transition: background-color 0.2s, color 0.2s;
      }

      .icon-btn:hover {
        background: rgba(var(--sc-accent-rgb), 0.14);
        color: var(--sc-accent-dark);
      }

      .icon-btn.active {
        background: var(--sc-accent);
        color: var(--sc-on-accent);
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
        gap: 12px;
        padding: 16px 0;
        margin-bottom: 16px;
        border-bottom: 1px solid var(--divider-color);
      }

      .calendar-header h3 {
        margin: 0;
        font-size: 1.25rem;
        font-weight: 500;
        flex: 1;
        text-align: center;
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
        position: relative;
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

      .calendar-chore-edit {
        position: absolute;
        top: 2px;
        right: 2px;
        width: 18px;
        height: 18px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        opacity: 0;
        transition: opacity 0.2s, transform 0.2s;
        z-index: 1;
      }

      .calendar-chore:hover .calendar-chore-edit {
        opacity: 1;
      }

      .calendar-chore-edit:hover {
        transform: scale(1.15);
        background: var(--primary-color);
        color: var(--text-primary-color);
      }

      .calendar-chore-edit ha-icon {
        --mdc-icon-size: 12px;
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

      /* Calendar mode toggle button */
      .calendar-mode-btn {
        background: transparent;
        border: none;
        color: inherit;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 4px;
        margin-left: auto;
        opacity: 0.8;
        transition: opacity 0.2s, background 0.2s;
      }

      .calendar-mode-btn:hover {
        opacity: 1;
        background: rgba(255, 255, 255, 0.1);
      }

      .calendar-mode-btn ha-icon {
        --mdc-icon-size: 20px;
      }

      /* Agenda view styles */
      .agenda-view {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 8px 0;
      }

      .agenda-empty {
        text-align: center;
        padding: 32px 16px;
        color: var(--secondary-text-color, #888);
        font-style: italic;
      }

      .agenda-day {
        display: flex;
        flex-direction: column;
        background: var(--card-background-color, #fff);
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid var(--divider-color, #e0e0e0);
        box-sizing: border-box;
      }

      .agenda-day.today {
        border-color: var(--sc-accent);
        box-shadow: 0 0 0 1px var(--sc-accent);
      }

      .agenda-day.past {
        opacity: 0.7;
      }

      .agenda-day-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: var(--secondary-background-color, #fafafa);
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        min-height: 40px;
        box-sizing: border-box;
      }

      .agenda-day-name {
        font-weight: 500;
        font-size: 0.9rem;
        color: var(--primary-text-color, #212121);
      }

      .agenda-day-date {
        color: var(--secondary-text-color, #888);
        font-size: 0.85rem;
      }

      .agenda-today-badge {
        background: var(--sc-accent);
        color: var(--text-primary-color, #fff);
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.7rem;
        font-weight: 500;
        margin-left: auto;
      }

      .agenda-chores {
        display: flex;
        flex-direction: column;
        width: 100%;
        box-sizing: border-box;
        background: var(--card-background-color, #fff);
      }

      .agenda-chore {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-bottom: 1px solid var(--divider-color, #e0e0e0);
        cursor: pointer;
        transition: background 0.2s;
        color: var(--primary-text-color, #212121);
        box-sizing: border-box;
        width: 100%;
        min-height: 48px;
        background: var(--card-background-color, #fff);
      }

      .agenda-chore:last-child {
        border-bottom: none;
      }

      .agenda-chore:hover {
        background: rgba(3, 169, 244, 0.05);
      }

      .agenda-chore.projected {
        opacity: 0.6;
        cursor: default;
      }

      .agenda-chore.projected:hover {
        background: transparent;
      }

      .agenda-chore-indicator {
        width: 4px;
        height: 32px;
        border-radius: 2px;
        background: var(--sc-accent);
        flex-shrink: 0;
      }

      .agenda-chore-indicator.overdue {
        background: var(--error-color, #db4437);
      }

      .agenda-chore-indicator.projected {
        background: var(--sc-accent);
        opacity: 0.5;
      }

      .agenda-chore-indicator.completed {
        background: var(--success-color, #4CAF50);
      }

      .agenda-chore-content {
        flex: 1 1 auto;
        min-width: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
        overflow: hidden;
      }

      .agenda-chore-name {
        display: block;
        font-size: 0.95rem;
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        color: var(--primary-text-color, #212121);
      }

      .agenda-chore.completed .agenda-chore-name {
        text-decoration: line-through;
        opacity: 0.7;
      }

      .agenda-chore-room {
        display: block;
        font-size: 0.8rem;
        color: var(--secondary-text-color, #888);
      }

      .agenda-chore-by {
        display: block;
        font-size: 0.75rem;
        color: var(--secondary-text-color, #888);
        font-style: italic;
      }

      .agenda-chore-projected-badge {
        display: inline-block;
        background: var(--sc-accent);
        color: var(--text-primary-color, #fff);
        padding: 1px 6px;
        border-radius: 8px;
        font-size: 0.65rem;
        opacity: 0.7;
      }

      .agenda-chore-edit,
      .agenda-chore-complete {
        background: var(--sc-accent);
        border: none;
        color: var(--text-primary-color, #fff);
        width: 32px;
        height: 32px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        flex-shrink: 0;
      }

      .agenda-chore-edit {
        background: var(--secondary-background-color, #fafafa);
        color: var(--primary-text-color, #212121);
        margin-right: 8px;
      }

      .agenda-chore-edit:hover,
      .agenda-chore-complete:hover {
        transform: scale(1.1);
        box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      }

      .agenda-chore-edit ha-icon,
      .agenda-chore-complete ha-icon {
        --mdc-icon-size: 18px;
      }

      .agenda-completed-icon {
        color: var(--success-color, #4CAF50);
        --mdc-icon-size: 24px;
        flex-shrink: 0;
      }

      .agenda-no-chores {
        padding: 12px;
        color: var(--secondary-text-color, #888);
        font-style: italic;
        font-size: 0.85rem;
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
        position: relative;
        padding: 16px;
      }

      .stats-container {
        margin-bottom: 20px;
      }

      .stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr) auto;
        gap: 12px;
        align-items: center;
      }

      .stat {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 12px 8px;
        background: var(--sc-paper);
        border: 2px solid transparent;
        border-radius: 14px;
        transition: all 0.2s ease;
        min-height: 70px;
      }

      /* Due Today - accent */
      .stat.attention {
        background: rgba(var(--sc-accent-rgb), 0.12);
      }

      /* Overdue - danger ink */
      .stat.warning {
        background: rgba(var(--sc-danger-rgb), 0.12);
      }

      .stat-value {
        font-family: var(--sc-heading-font);
        font-size: 1.75em;
        font-weight: 700;
        color: var(--sc-ink);
        line-height: 1;
      }

      .stat.attention .stat-value {
        color: var(--sc-accent-dark);
      }

      .stat.warning .stat-value {
        color: var(--sc-danger);
      }

      .stat-label {
        font-size: 0.75em;
        font-weight: 600;
        color: var(--sc-ink-soft);
        margin-top: 4px;
        text-align: center;
      }

      /* Active chores - opens the All Chores modal, and says so */
      .stat.clickable {
        cursor: pointer;
        border-color: rgba(var(--sc-success-rgb), 0.45);
      }

      .stat.clickable .stat-value {
        color: var(--sc-success);
      }

      .stat-hint {
        display: inline-flex;
        align-items: center;
        margin-top: 4px;
        font-size: 0.72em;
        font-weight: 700;
        color: var(--sc-success);
      }

      .stat-hint ha-icon {
        --mdc-icon-size: 14px;
      }

      .stat.clickable:hover {
        transform: translateY(-2px);
        box-shadow: var(--sc-shadow);
        border-color: var(--sc-success);
      }

      /* Statistics Dashboard Expand Button */
      .stats-expand-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 36px;
        height: 36px;
        border: none;
        background: var(--secondary-background-color, #f5f5f5);
        color: var(--secondary-text-color);
        cursor: pointer;
        border-radius: 50%;
        transition: all 0.2s;
      }

      .stats-expand-btn:hover {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }

      .stats-expand-btn ha-icon {
        --mdc-icon-size: 20px;
        transition: transform 0.3s ease;
      }

      .stats-expand-btn.expanded ha-icon {
        transform: rotate(180deg);
      }

      /* Statistics Dashboard Container */
      .stats-dashboard {
        margin-top: 16px;
        padding: 16px;
        background: var(--secondary-background-color, #f5f5f5);
        border-radius: 12px;
      }

      /* Time Period Toggle */
      .stats-period-toggle {
        display: flex;
        gap: 4px;
        margin-bottom: 16px;
        background: var(--card-background-color, #fff);
        padding: 4px;
        border-radius: 8px;
      }

      .stats-period-btn {
        flex: 1;
        padding: 8px 12px;
        border: none;
        background: transparent;
        color: var(--secondary-text-color);
        font-size: 0.85em;
        font-weight: 500;
        cursor: pointer;
        border-radius: 6px;
        transition: all 0.2s;
      }

      .stats-period-btn.active {
        background: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }

      .stats-period-btn:hover:not(.active) {
        background: var(--divider-color);
      }

      /* Stats Sections */
      .stats-section {
        margin-bottom: 20px;
      }

      .stats-section:last-child {
        margin-bottom: 0;
      }

      .stats-section-title {
        font-size: 0.9em;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-bottom: 12px;
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .stats-section-title ha-icon {
        --mdc-icon-size: 18px;
        color: var(--primary-color);
      }

      .stats-section-total {
        margin-left: auto;
        font-weight: 400;
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }

      /* Bar Chart */
      .stats-chart {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        height: 120px;
        padding: 8px 0;
        gap: 4px;
        background: var(--card-background-color, #fff);
        border-radius: 8px;
        padding: 12px;
      }

      .stats-chart-bar-container {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        height: 100%;
        min-width: 0;
      }

      .stats-chart-bar-value {
        font-size: 0.75em;
        font-weight: 600;
        color: var(--primary-text-color);
        margin-bottom: 4px;
        min-height: 16px;
      }

      .stats-chart-bar {
        width: 100%;
        max-width: 40px;
        background: var(--sc-accent);
        border-radius: 4px 4px 0 0;
        transition: height 0.3s ease;
        min-height: 4px;
      }

      .stats-chart-bar.empty {
        background: var(--divider-color);
      }

      .stats-chart-bar-label {
        font-size: 0.7em;
        color: var(--secondary-text-color);
        margin-top: 4px;
        text-align: center;
        white-space: nowrap;
      }

      /* Insights Grid */
      .stats-insights-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 12px;
        margin-bottom: 16px;
      }

      .stats-insight-card {
        background: var(--card-background-color, #fff);
        border-radius: 8px;
        padding: 12px;
      }

      .stats-insight-card h4 {
        font-size: 0.85em;
        font-weight: 600;
        color: var(--secondary-text-color);
        margin: 0 0 10px 0;
      }

      .stats-no-data {
        color: var(--secondary-text-color);
        font-size: 0.85em;
        font-style: italic;
      }

      /* Chore List in Stats */
      .stats-chore-list {
        list-style: none;
        padding: 0;
        margin: 0;
      }

      .stats-chore-item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 0;
        border-bottom: 1px solid var(--divider-color);
      }

      .stats-chore-item:last-child {
        border-bottom: none;
      }

      .stats-chore-name {
        font-size: 0.85em;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        margin-right: 8px;
      }

      .stats-chore-count {
        font-size: 0.8em;
        font-weight: 600;
        color: var(--primary-color);
        background: rgba(3, 169, 244, 0.1);
        padding: 2px 8px;
        border-radius: 12px;
        flex-shrink: 0;
      }

      /* Horizontal Bar Charts */
      .stats-horizontal-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }

      .stats-horizontal-bar:last-child {
        margin-bottom: 0;
      }

      .stats-horizontal-bar-label {
        flex: 0 0 80px;
        font-size: 0.8em;
        color: var(--primary-text-color);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        display: flex;
        align-items: center;
        gap: 4px;
      }

      .stats-horizontal-bar-track {
        flex: 1;
        height: 8px;
        background: var(--divider-color);
        border-radius: 4px;
        overflow: hidden;
      }

      .stats-horizontal-bar-fill {
        height: 100%;
        background: var(--sc-accent);
        border-radius: 4px;
        transition: width 0.3s ease;
      }

      .stats-horizontal-bar-value {
        flex: 0 0 32px;
        text-align: right;
        font-size: 0.8em;
        font-weight: 600;
        color: var(--primary-text-color);
      }

      .stats-horizontal-bar.leader .stats-horizontal-bar-fill {
        background: var(--sc-warning);
      }

      .leader-icon {
        --mdc-icon-size: 14px;
        color: var(--sc-warning);
      }

      /* Empty State */
      .stats-empty {
        text-align: center;
        padding: 24px;
        color: var(--secondary-text-color);
      }

      .stats-empty ha-icon {
        --mdc-icon-size: 48px;
        opacity: 0.5;
        margin-bottom: 8px;
        display: block;
      }

      .stats-empty p {
        margin: 4px 0;
        font-size: 0.9em;
      }

      .section {
        margin-bottom: 24px;
      }
      
      .section h3 {
        margin: 0 0 10px 0;
        font-family: var(--sc-heading-font);
        font-size: 1.15em;
        font-weight: 700;
        letter-spacing: -0.01em;
        color: var(--sc-ink);
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
        background: var(--sc-paper);
        border: 1px solid transparent;
        border-radius: 14px;
        padding: 12px 16px;
        transition: all 0.2s ease;
      }

      .chore-card:hover {
        border-color: var(--sc-line);
        box-shadow: var(--sc-shadow);
      }

      .chore-card.overdue {
        background: rgba(var(--sc-danger-rgb), 0.1);
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
        color: var(--sc-danger);
        font-weight: 700;
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

      /* The round check circle: empty until tapped, like a paper checklist */
      .chore-action-btn.complete {
        width: 36px;
        height: 36px;
        background: transparent;
        border: 2.5px solid var(--sc-ink-muted);
        color: var(--sc-ink-soft);
        margin-right: 6px;
      }

      /* A faint check so the circle reads as a checkbox on a touch screen,
         where there is no hover to reveal it */
      .chore-action-btn.complete ha-icon {
        opacity: 0.45;
      }

      .chore-action-btn.complete:hover {
        border-color: var(--sc-success);
        color: var(--sc-success);
        transform: scale(1.05);
      }

      .chore-action-btn.complete:hover ha-icon,
      .chore-action-btn.complete.done ha-icon {
        opacity: 1;
      }

      .chore-action-btn.complete.done {
        border-color: var(--sc-success);
        background: var(--sc-success);
        color: var(--sc-on-accent);
        animation: sc-pop 0.25s ease-out;
      }

      @keyframes sc-pop {
        0% { transform: scale(0.8); }
        60% { transform: scale(1.15); }
        100% { transform: scale(1); }
      }

      .chore-action-btn.complete ha-icon {
        --mdc-icon-size: 20px;
      }

      .chore-action-btn.secondary {
        width: 32px;
        height: 32px;
        background: transparent;
        color: var(--sc-ink-soft);
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
        color: var(--sc-danger);
      }

      .overflow-menu-item.danger ha-icon {
        color: var(--sc-danger);
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
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        text-align: center;
        color: var(--sc-ink-soft);
        font-weight: 600;
        padding: 20px 16px 22px;
        background: var(--sc-paper);
        border-radius: 14px;
      }

      .no-chores p {
        margin: 0;
      }

      /* --- The sleeping critter (empty states) --- */
      .sc-critter {
        width: 140px;
        height: 84px;
        overflow: visible;
      }

      .sc-critter .critter-body {
        animation: sc-breathe 3.2s ease-in-out infinite;
        transform-origin: 70px 62px;
      }

      .sc-critter .critter-z {
        font-family: var(--sc-heading-font);
        font-weight: 700;
        fill: var(--sc-ink-muted);
        animation: sc-zz 3.2s ease-in-out infinite;
        opacity: 0;
      }

      .sc-critter .critter-z.second {
        animation-delay: 1.1s;
      }

      @keyframes sc-breathe {
        0%, 100% { transform: scaleY(1); }
        50% { transform: scaleY(1.04); }
      }

      @keyframes sc-zz {
        0% { opacity: 0; transform: translate(0, 0); }
        30% { opacity: 1; }
        100% { opacity: 0; transform: translate(6px, -14px); }
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
      
      .all-chores-toolbar {
        display: flex;
        gap: 8px;
        align-items: center;
        margin-bottom: 12px;
      }
      .room-filter-select {
        flex: 1;
        padding: 8px 12px;
        border: 1px solid var(--divider-color, #e0e0e0);
        border-radius: 8px;
        background: var(--card-background-color, #fff);
        color: var(--primary-text-color, #333);
        font-size: 14px;
        cursor: pointer;
        appearance: auto;
      }
      .add-chore-btn-toolbar {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 8px 14px;
        border: none;
        border-radius: 8px;
        background: var(--sc-accent);
        color: white;
        font-size: 14px;
        cursor: pointer;
        white-space: nowrap;
      }
      .add-chore-btn-toolbar:hover {
        opacity: 0.9;
      }
      .all-chores-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
        max-height: 55vh;
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

      .history-undo-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        margin-left: 8px;
        padding: 3px 10px;
        border: 1px solid var(--sc-line);
        border-radius: 999px;
        background: transparent;
        color: var(--sc-ink-soft);
        font-size: 0.85em;
        font-family: inherit;
        cursor: pointer;
      }

      .history-undo-btn:hover {
        border-color: var(--sc-accent);
        color: var(--sc-accent-dark);
      }

      .history-undo-btn ha-icon {
        --mdc-icon-size: 16px;
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

      /* Recurrence Section Styles */
      .recurrence-section {
        background: var(--secondary-background-color);
        padding: 16px;
        border-radius: 8px;
        margin-top: 8px;
      }

      .recurrence-type-toggle {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 8px;
      }

      .radio-label {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 14px;
      }

      .radio-label input[type="radio"] {
        accent-color: var(--primary-color);
        width: 16px;
        height: 16px;
      }

      .recurrence-help {
        display: block;
        margin-bottom: 12px;
        color: var(--secondary-text-color);
        font-size: 12px;
        font-style: italic;
      }

      .anchor-options {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid var(--divider-color);
      }

      .weekday-picker label,
      .monthly-options label {
        display: block;
        margin-bottom: 8px;
        font-size: 13px;
        font-weight: 500;
      }

      .weekday-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }

      .weekday-btn {
        min-width: 40px;
        padding: 8px 4px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.2s ease;
      }

      .weekday-btn:hover {
        border-color: var(--primary-color);
      }

      .weekday-btn.selected {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: white;
      }

      .anchor-type-select {
        display: flex;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 12px;
      }

      .day-of-month-picker,
      .week-pattern-picker {
        margin-top: 8px;
      }

      .day-of-month-picker label,
      .week-pattern-picker label {
        margin-right: 8px;
      }

      .day-of-month-picker select,
      .week-pattern-picker select {
        padding: 8px 12px;
        border: 1px solid var(--divider-color);
        border-radius: 4px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 14px;
      }

      .pattern-row {
        display: flex;
        gap: 8px;
        align-items: center;
        flex-wrap: wrap;
      }

      .pattern-row select {
        flex: 1;
        min-width: 100px;
      }

      .day-of-month-picker small,
      .week-pattern-picker small {
        display: block;
        margin-top: 6px;
        color: var(--secondary-text-color);
        font-size: 11px;
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

      /* ============================================
         STEP EDITOR (Add / Edit Chore modals)
         ============================================ */
      .step-editor {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 8px;
      }

      .step-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .step-number {
        flex-shrink: 0;
        width: 22px;
        height: 22px;
        line-height: 22px;
        border-radius: 50%;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font-size: 0.8em;
        text-align: center;
      }

      .step-input {
        flex: 1;
        min-width: 0;
      }

      .step-remove {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--secondary-text-color);
        cursor: pointer;
      }

      .step-remove:hover {
        background: var(--secondary-background-color);
        color: var(--sc-danger);
      }

      .step-remove ha-icon {
        --mdc-icon-size: 18px;
      }

      .step-add {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 1px dashed var(--divider-color);
        border-radius: 8px;
        background: transparent;
        color: var(--primary-color);
        font-size: 0.9em;
        font-weight: 600;
        cursor: pointer;
      }

      .step-add:hover {
        border-color: var(--primary-color);
      }

      .step-add ha-icon {
        --mdc-icon-size: 16px;
      }

      .chore-meta-estimate {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 8px;
        border: 1px dashed var(--sc-warning);
        border-radius: 999px;
        background: transparent;
        color: var(--sc-warning);
        font-size: inherit;
        font-family: inherit;
        cursor: pointer;
        vertical-align: middle;
      }

      .chore-meta-estimate:hover {
        background: rgba(var(--sc-accent-rgb), 0.12);
      }

      .chore-meta-estimate ha-icon {
        --mdc-icon-size: 14px;
      }

      .chore-estimate-row {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-top: 8px;
      }

      .chore-estimate-label {
        font-size: 0.85em;
        color: var(--secondary-text-color);
      }

      /* --- Steps in list rows --- */
      .chore-meta-steps {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 8px;
        border: 1px solid var(--divider-color, rgba(0, 0, 0, 0.12));
        border-radius: 999px;
        background: transparent;
        color: var(--secondary-text-color);
        font-size: inherit;
        font-family: inherit;
        cursor: pointer;
        vertical-align: middle;
      }

      .chore-meta-steps:hover,
      .chore-meta-steps.open {
        border-color: var(--sc-success);
        color: var(--sc-success);
      }

      .chore-meta-steps ha-icon {
        --mdc-icon-size: 14px;
      }

      .chore-steps-bar {
        margin-top: 6px;
        max-width: 240px;
      }

      .chore-steps {
        margin-top: 8px;
        padding: 8px 10px;
        border-radius: 8px;
        background: var(--secondary-background-color);
      }

      .chore-steps .focus-steps-bar {
        background: var(--card-background-color, #fff);
      }

      .chore-steps .focus-step {
        padding: 6px;
        font-size: 0.95em;
      }

      .chore-steps .focus-step:hover {
        background: var(--card-background-color, #fff);
      }

      /* --- Steps in the Complete Chore modal --- */
      .completion-steps {
        margin: 0 0 16px;
        padding: 10px 12px;
        border-radius: 8px;
        background: var(--secondary-background-color);
      }

      .completion-steps-title {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.9em;
        font-weight: 500;
        color: var(--primary-text-color);
        margin-bottom: 6px;
      }

      .completion-steps-title ha-icon {
        --mdc-icon-size: 18px;
        color: var(--sc-success);
      }

      .completion-step-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }

      .completion-step-list li {
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--primary-text-color);
      }

      .completion-step-list li ha-icon {
        --mdc-icon-size: 18px;
        color: var(--secondary-text-color);
      }

      .completion-step-list li.done {
        color: var(--secondary-text-color);
        text-decoration: line-through;
      }

      .completion-step-list li.done ha-icon {
        color: var(--sc-success);
      }

      .completion-steps small {
        display: block;
        margin-top: 8px;
        color: var(--secondary-text-color);
      }

      .agenda-chore-steps {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }

      .agenda-chore-steps ha-icon {
        --mdc-icon-size: 14px;
      }

      .chores-loading {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 10px;
        padding: 40px 20px;
        color: var(--secondary-text-color);
      }

      /* ============================================
         FOCUS VIEW ("CHORE BOOK")
         ============================================ */
      .focus-view {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      /* --- Toolbar: time budget chips --- */
      .focus-toolbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
      }

      .focus-chips {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
      }

      .focus-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 14px;
        border: 2px solid var(--divider-color);
        border-radius: 999px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.95em;
        font-weight: 600;
        cursor: pointer;
        transition: border-color 0.15s, background-color 0.15s, color 0.15s;
      }

      .focus-chip:hover:not(:disabled) {
        border-color: var(--primary-color);
      }

      .focus-chip.active {
        background: var(--sc-accent);
        border-color: transparent;
        color: var(--sc-on-accent);
      }

      .focus-chip:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      .focus-chip ha-icon {
        --mdc-icon-size: 18px;
      }

      .focus-chip-count {
        min-width: 20px;
        padding: 0 6px;
        border-radius: 999px;
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        font-size: 0.85em;
        text-align: center;
      }

      .focus-chip.active .focus-chip-count {
        background: rgba(255, 255, 255, 0.25);
        color: white;
      }

      .focus-toolbar-actions {
        display: flex;
        gap: 8px;
      }

      .focus-icon-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border: 2px solid var(--divider-color);
        border-radius: 12px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        cursor: pointer;
        transition: border-color 0.15s, transform 0.15s;
      }

      .focus-icon-btn:hover {
        border-color: var(--primary-color);
        transform: translateY(-1px);
      }

      /* --- Progress + streak --- */
      .focus-progress {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .focus-progress-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 12px;
        font-size: 0.95em;
        color: var(--secondary-text-color);
      }

      .focus-progress-label strong {
        color: var(--primary-text-color);
        font-size: 1.15em;
      }

      .focus-streak {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 999px;
        background: rgba(var(--sc-accent-rgb), 0.15);
        color: var(--sc-accent-dark);
        font-weight: 600;
        white-space: nowrap;
      }

      .focus-streak ha-icon {
        --mdc-icon-size: 16px;
      }

      .focus-progress-track {
        height: 8px;
        border-radius: 999px;
        background: var(--secondary-background-color);
        overflow: hidden;
      }

      .focus-progress-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--sc-success);
        transition: width 0.4s ease;
      }

      /* --- Deck layout (one card at a time) --- */
      .focus-deck {
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: 14px;
      }

      .focus-deck-position {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 14px;
        color: var(--secondary-text-color);
        font-size: 0.9em;
      }

      .focus-nav-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 34px;
        height: 34px;
        border: none;
        border-radius: 50%;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        cursor: pointer;
      }

      .focus-nav-btn:disabled {
        opacity: 0.3;
        cursor: not-allowed;
      }

      /* --- Board layout (grid of cards) --- */
      .focus-board {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
        gap: 12px;
      }

      /* --- The card itself --- */
      .focus-card {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 16px;
        border: 2px solid transparent;
        border-radius: 18px;
        background: var(--sc-paper);
        box-shadow: var(--sc-shadow);
      }

      .focus-card.expanded {
        gap: 14px;
        padding: 24px;
        min-height: 210px;
        justify-content: flex-start;
      }

      .focus-card.overdue {
        border-color: var(--sc-danger);
      }

      .focus-card-room {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 0.8em;
        font-weight: 700;
        letter-spacing: 0.06em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }

      .focus-card-room ha-icon {
        --mdc-icon-size: 16px;
      }

      .focus-overdue-badge {
        margin-left: auto;
        padding: 2px 8px;
        border-radius: 999px;
        background: var(--sc-danger);
        color: white;
        font-size: 0.9em;
        letter-spacing: 0;
        text-transform: none;
        white-space: nowrap;
      }

      .focus-card-name {
        font-size: 1.25em;
        font-weight: 600;
        line-height: 1.3;
        color: var(--primary-text-color);
      }

      .focus-card.expanded .focus-card-name {
        font-size: 1.8em;
      }

      .focus-card-time {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      .focus-time-chip,
      .focus-steps-toggle {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border: none;
        border-radius: 999px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font-size: 0.9em;
        font-weight: 600;
        cursor: pointer;
      }

      .focus-time-chip.running {
        background: var(--sc-danger);
        color: white;
      }

      .focus-time-chip.unset {
        background: transparent;
        border: 1px dashed var(--divider-color);
        color: var(--secondary-text-color);
        font-weight: 500;
      }

      .focus-time-chip ha-icon,
      .focus-steps-toggle ha-icon {
        --mdc-icon-size: 16px;
      }

      /* --- Inline "how long does this take?" capture --- */
      .focus-estimate-picker {
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .focus-estimate-btn {
        min-width: 40px;
        padding: 6px 10px;
        border: 2px solid var(--divider-color);
        border-radius: 8px;
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font-size: 0.9em;
        font-weight: 600;
        cursor: pointer;
      }

      .focus-estimate-btn:hover {
        border-color: var(--primary-color);
      }

      .focus-estimate-btn.cancel {
        min-width: 0;
        border: none;
        color: var(--secondary-text-color);
      }

      .focus-estimate-btn ha-icon {
        --mdc-icon-size: 16px;
      }

      /* --- Micro-steps --- */
      .focus-steps {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .focus-steps-bar {
        height: 4px;
        border-radius: 999px;
        background: var(--secondary-background-color);
        overflow: hidden;
      }

      .focus-steps-fill {
        height: 100%;
        border-radius: 999px;
        background: var(--sc-success);
        transition: width 0.3s ease;
      }

      .focus-step-list {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: 2px;
      }

      .focus-step {
        display: flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        padding: 8px 6px;
        border: none;
        border-radius: 8px;
        background: transparent;
        color: var(--primary-text-color);
        font-size: 1em;
        text-align: left;
        cursor: pointer;
      }

      .focus-step:hover {
        background: var(--secondary-background-color);
      }

      .focus-step ha-icon {
        --mdc-icon-size: 22px;
        flex-shrink: 0;
        color: var(--secondary-text-color);
      }

      .focus-step.done ha-icon {
        color: var(--sc-success);
      }

      .focus-step.done span {
        text-decoration: line-through;
        color: var(--secondary-text-color);
      }

      /* --- Timer ring --- */
      .focus-timer {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      .focus-timer-ring {
        width: 64px;
        height: 64px;
        flex-shrink: 0;
        transform: rotate(-90deg);
      }

      .focus-timer-ring .ring-track,
      .focus-timer-ring .ring-value {
        fill: none;
        stroke-width: 6;
        stroke-linecap: round;
      }

      .focus-timer-ring .ring-track {
        stroke: var(--secondary-background-color);
      }

      .focus-timer-ring .ring-value {
        stroke: var(--sc-accent);
        transition: stroke-dashoffset 1s linear;
      }

      .focus-timer.finished .ring-value {
        stroke: var(--sc-danger);
      }

      .focus-timer-text {
        font-size: 1.6em;
        font-weight: 700;
        font-variant-numeric: tabular-nums;
        color: var(--primary-text-color);
      }

      .focus-timer.finished .focus-timer-text {
        color: var(--sc-danger);
      }

      /* --- Actions --- */
      .focus-deck-actions {
        display: grid;
        grid-template-columns: 1fr 1fr 1.4fr;
        gap: 10px;
      }

      .focus-action {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 4px;
        min-height: 64px;
        padding: 10px;
        border: none;
        border-radius: 14px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        font-size: 0.95em;
        font-weight: 600;
        cursor: pointer;
        transition: transform 0.12s;
      }

      .focus-action:active {
        transform: scale(0.97);
      }

      .focus-action ha-icon {
        --mdc-icon-size: 26px;
      }

      .focus-action.done {
        background: var(--sc-success);
        color: white;
      }

      .focus-card-actions {
        display: flex;
        gap: 8px;
        margin-top: auto;
        padding-top: 4px;
      }

      .focus-mini-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 1;
        min-height: 44px;
        border: none;
        border-radius: 10px;
        background: var(--secondary-background-color);
        color: var(--primary-text-color);
        cursor: pointer;
      }

      .focus-mini-btn.done {
        flex: 1.6;
        background: var(--sc-success);
        color: white;
      }

      .focus-mini-btn ha-icon {
        --mdc-icon-size: 22px;
      }

      .focus-hint {
        text-align: center;
        font-size: 0.8em;
        color: var(--secondary-text-color);
      }

      /* Swipe hints are meaningless without a touchscreen */
      @media (hover: hover) and (pointer: fine) {
        .focus-hint {
          display: none;
        }
      }

      /* --- Empty states --- */
      .focus-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 40px 20px;
        text-align: center;
        color: var(--secondary-text-color);
      }

      .focus-empty ha-icon {
        --mdc-icon-size: 56px;
        color: var(--divider-color);
      }

      .focus-empty.done ha-icon {
        color: var(--sc-success);
      }

      .focus-empty h3 {
        margin: 0;
        color: var(--primary-text-color);
      }

      .focus-empty p {
        margin: 0;
        max-width: 34ch;
      }

      .focus-empty-btn {
        margin-top: 8px;
        padding: 10px 18px;
        border: 2px solid var(--primary-color);
        border-radius: 10px;
        background: transparent;
        color: var(--primary-color);
        font-size: 0.95em;
        font-weight: 600;
        cursor: pointer;
      }

      /* --- Confetti --- */
      .focus-confetti {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        overflow: hidden;
        pointer-events: none;
        z-index: 5;
      }

      .focus-confetti span {
        position: absolute;
        top: -12px;
        width: 9px;
        height: 9px;
        border-radius: 2px;
        opacity: 0;
        animation-name: focus-confetti-fall;
        animation-timing-function: ease-in;
        animation-fill-mode: forwards;
      }

      @keyframes focus-confetti-fall {
        0% {
          opacity: 1;
          transform: translate(0, 0) rotate(0deg);
        }
        100% {
          opacity: 0;
          transform: translate(var(--drift, 0px), 320px) rotate(540deg);
        }
      }

      @media (prefers-reduced-motion: reduce) {
        .focus-confetti {
          display: none;
        }
        .focus-progress-fill,
        .focus-steps-fill,
        .focus-timer-ring .ring-value,
        .focus-action,
        .focus-icon-btn {
          transition: none;
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

  get _focus_layout() {
    return this._config?.focus_layout || "auto";
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

  get _transparent() {
    return this._config?.transparent || false;
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
            <option value="focus" ?selected=${this._default_view === "focus"}>Focus View (chore book)</option>
          </select>
        </div>

        <div class="option">
          <label class="option-label">Focus View Layout</label>
          <select
            .value=${this._focus_layout}
            .configValue=${"focus_layout"}
            @change=${this._valueChanged}
          >
            <option value="auto" ?selected=${this._focus_layout === "auto"}>Auto (deck on phones, board on displays)</option>
            <option value="deck" ?selected=${this._focus_layout === "deck"}>Always deck (one at a time)</option>
            <option value="board" ?selected=${this._focus_layout === "board"}>Always board (grid)</option>
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

        <div class="option">
          <ha-formfield label="Transparent card (for a panel with a scene behind it)">
            <ha-checkbox
              .checked=${this._transparent}
              .configValue=${"transparent"}
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
            user assignment, and completion tracking.<br><br>
            <strong>Focus View</strong> shows one chore at a time, filtered by
            how much time you have, with a shuffle for when choosing is the
            hard part. Add a time estimate and steps to a chore to get the
            most out of it.
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
        description: "Manage household chores with room organization, a focus view, and completion tracking",
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
      description: "Manage household chores with room organization, a focus view, and completion tracking",
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
