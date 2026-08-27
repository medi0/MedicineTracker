import { Capacitor } from '@capacitor/core';

import { Preferences } from '@capacitor/preferences';

import { LocalNotifications } from '@capacitor/local-notifications';



const STORAGE_KEYS = {

  medicines: 'medicines',

  nextId: 'nextId',

  remindersEnabled: 'remindersEnabled'

};



const DEFAULT_TIMES = {

  once: ['08:00'],

  twice: ['08:00', '20:00'],

  thrice: ['08:00', '14:00', '20:00']

};



const TIME_LABELS = ['Morning', 'Noon', 'Night', 'Time 4', 'Time 5', 'Time 6'];



const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];



const NOTIFICATION_ACTION_TYPE = 'DOSE_REMINDER';



class MedicineTracker {

  static FREQUENCY_LABELS = {

    once: 'Once daily',

    twice: 'Twice daily',

    thrice: 'Three times daily'

  };



  static SCHEDULE_LABELS = {

    daily: 'Every day',

    weekdays: 'Specific weekdays',

    everyN: 'Every N days',

    prn: 'As needed (PRN)'

  };



  constructor() {

    this.medicines = [];

    this.nextId = 1;

    this.editingId = null;

    this.searchQuery = '';

    this.sortMode = 'name-asc';

    this.remindersEnabled = false;

    this.calendarCursor = new Date();

    this.selectedCalDate = null;

    this.isNative = Capacitor.isNativePlatform();

    this._notificationListenersBound = false;

  }



  static async create() {

    const tracker = new MedicineTracker();

    await tracker.loadFromStorage();

    await tracker.init();

    return tracker;

  }



  escapeHtml(text) {

    const div = document.createElement('div');

    div.textContent = text == null ? '' : String(text);

    return div.innerHTML;

  }



  todayKey(date = new Date()) {

    const y = date.getFullYear();

    const m = String(date.getMonth() + 1).padStart(2, '0');

    const d = String(date.getDate()).padStart(2, '0');

    return `${y}-${m}-${d}`;

  }



  parseDateKey(dateKey) {

    const [y, m, d] = dateKey.split('-').map(Number);

    return new Date(y, m - 1, d);

  }



  daysBetween(startKey, endKey) {

    const start = this.parseDateKey(startKey);

    const end = this.parseDateKey(endKey);

    return Math.round((end - start) / 86400000);

  }



  doseKey(date, slot) {

    return `${date}#${slot}`;

  }



  parseDoseAmount(dosage) {

    const match = String(dosage || '').match(/(\d+(\.\d+)?)/);

    return match ? Number(match[1]) : 1;

  }



  isPrn(medicine) {

    return medicine.scheduleType === 'prn';

  }



  isPaused(medicine) {

    return !!medicine.paused;

  }



  isWithinCourse(medicine, dateKey) {

    if (medicine.startDate && dateKey < medicine.startDate) return false;

    if (medicine.endDate && dateKey > medicine.endDate) return false;

    return true;

  }



  isScheduledOnDate(medicine, dateKey) {

    if (this.isPrn(medicine)) return false;

    if (!this.isWithinCourse(medicine, dateKey)) return false;



    const scheduleType = medicine.scheduleType || 'daily';

    if (scheduleType === 'daily') return true;



    if (scheduleType === 'weekdays') {

      const day = this.parseDateKey(dateKey).getDay();

      const weekdays = Array.isArray(medicine.weekdays) ? medicine.weekdays : [0, 1, 2, 3, 4, 5, 6];

      return weekdays.includes(day);

    }



    if (scheduleType === 'everyN') {

      const anchor = medicine.startDate || this.todayKey(this.parseDateKey(medicine.dateAdded));

      const n = Math.max(2, Number(medicine.everyNDays) || 2);

      const diff = this.daysBetween(anchor, dateKey);

      return diff >= 0 && diff % n === 0;

    }



    return true;

  }



  isActiveOnDate(medicine, dateKey) {

    return !this.isPaused(medicine) && (this.isPrn(medicine) || this.isScheduledOnDate(medicine, dateKey));

  }



  getSchedule(medicine) {

    if (this.isPrn(medicine)) return [];

    if (Array.isArray(medicine.times) && medicine.times.length > 0) {

      return medicine.times;

    }

    return DEFAULT_TIMES[medicine.frequency] || DEFAULT_TIMES.once;

  }



  getDueSlots(medicine, dateKey) {

    if (!this.isActiveOnDate(medicine, dateKey) || this.isPrn(medicine)) return [];

    const schedule = this.getSchedule(medicine);

    return schedule.map((time, slot) => ({ time, slot }));

  }



  frequencyLabel(frequency) {

    return MedicineTracker.FREQUENCY_LABELS[frequency] || frequency;

  }



  scheduleTypeLabel(scheduleType) {

    return MedicineTracker.SCHEDULE_LABELS[scheduleType] || scheduleType;

  }



  ensureMedicineShape(med, index = 0) {

    const frequency = DEFAULT_TIMES[med.frequency] ? med.frequency : 'once';

    const scheduleType = ['daily', 'weekdays', 'everyN', 'prn'].includes(med.scheduleType)

      ? med.scheduleType

      : 'daily';

    const times =

      Array.isArray(med.times) && med.times.length

        ? med.times.map(String)

        : [...(DEFAULT_TIMES[frequency] || DEFAULT_TIMES.once)];



    let weekdays = Array.isArray(med.weekdays) ? med.weekdays.map(Number) : [0, 1, 2, 3, 4, 5, 6];

    if (!weekdays.length) weekdays = [0, 1, 2, 3, 4, 5, 6];



    return {

      id: typeof med.id === 'number' ? med.id : index + 1,

      name: String(med.name || '').trim() || 'Unnamed',

      dosage: String(med.dosage || '').trim() || '—',

      strength: med.strength != null ? String(med.strength) : '',

      unit: med.unit || 'mg',

      frequency,

      scheduleType,

      weekdays,

      everyNDays: Math.max(2, Number(med.everyNDays) || 2),

      startDate: med.startDate || '',

      endDate: med.endDate || '',

      paused: !!med.paused,

      times,

      pillCount: med.pillCount == null || med.pillCount === '' ? null : Number(med.pillCount),

      refillAt: med.refillAt == null || med.refillAt === '' ? null : Number(med.refillAt),

      expiryDate: med.expiryDate || '',

      rxInfo: med.rxInfo != null ? String(med.rxInfo) : '',

      dateAdded: med.dateAdded || new Date().toISOString(),

      taken: Array.isArray(med.taken) ? med.taken : [],

      skipped: Array.isArray(med.skipped) ? med.skipped : [],

      skipReasons: med.skipReasons && typeof med.skipReasons === 'object' ? med.skipReasons : {},

      prnLog: Array.isArray(med.prnLog) ? med.prnLog : []

    };

  }



  ensureTakenArray(medicine) {

    if (!Array.isArray(medicine.taken)) medicine.taken = [];

    if (!Array.isArray(medicine.skipped)) medicine.skipped = [];

    if (!medicine.skipReasons || typeof medicine.skipReasons !== 'object') medicine.skipReasons = {};

    if (!Array.isArray(medicine.prnLog)) medicine.prnLog = [];

  }



  isDoseTaken(medicine, date, slot) {

    this.ensureTakenArray(medicine);

    return medicine.taken.includes(this.doseKey(date, slot));

  }



  isDoseSkipped(medicine, date, slot) {

    this.ensureTakenArray(medicine);

    return medicine.skipped.includes(this.doseKey(date, slot));

  }



  isDoseResolved(medicine, date, slot) {

    return this.isDoseTaken(medicine, date, slot) || this.isDoseSkipped(medicine, date, slot);

  }



  countTakenOnDate(medicine, date) {

    return this.getDueSlots(medicine, date).filter(({ slot }) => this.isDoseTaken(medicine, date, slot)).length;

  }



  countPrnOnDate(medicine, date) {

    if (!this.isPrn(medicine)) return 0;

    return medicine.prnLog.filter((entry) => entry.startsWith(date)).length;

  }



  dayAdherence(dateKey) {

    let due = 0;

    let resolved = 0;

    this.medicines.forEach((medicine) => {

      this.getDueSlots(medicine, dateKey).forEach(({ slot }) => {

        due += 1;

        if (this.isDoseResolved(medicine, dateKey, slot)) resolved += 1;

      });

    });

    return { due, taken: resolved, percent: due === 0 ? null : Math.round((resolved / due) * 100) };

  }



  medicineAdherence(medicine, days = 14) {

    let due = 0;

    let resolved = 0;

    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {

      const day = new Date(now);

      day.setDate(now.getDate() - i);

      const key = this.todayKey(day);

      this.getDueSlots(medicine, key).forEach(({ slot }) => {

        due += 1;

        if (this.isDoseResolved(medicine, key, slot)) resolved += 1;

      });

    }

    return { due, resolved, percent: due === 0 ? null : Math.round((resolved / due) * 100) };

  }



  async storageSet(key, value) {

    const str = String(value);

    if (this.isNative) {

      await Preferences.set({ key, value: str });

    } else {

      localStorage.setItem(key, str);

    }

  }



  async storageGet(key) {

    if (this.isNative) {

      const { value } = await Preferences.get({ key });

      return value;

    }

    return localStorage.getItem(key);

  }



  async saveToStorage() {

    try {

      await this.storageSet(STORAGE_KEYS.medicines, JSON.stringify(this.medicines));

      await this.storageSet(STORAGE_KEYS.nextId, String(this.nextId));

      await this.storageSet(STORAGE_KEYS.remindersEnabled, this.remindersEnabled ? '1' : '0');

      if (this.remindersEnabled) {

        await this.rescheduleNotifications();

      } else {

        await this.cancelAllNotifications();

      }

    } catch (error) {

      console.error('Error saving to storage:', error);

    }

  }



  async loadFromStorage() {

    try {

      let savedMedicines = await this.storageGet(STORAGE_KEYS.medicines);

      let savedNextId = await this.storageGet(STORAGE_KEYS.nextId);

      const reminders = await this.storageGet(STORAGE_KEYS.remindersEnabled);



      if (!savedMedicines && typeof localStorage !== 'undefined') {

        const legacyMeds = localStorage.getItem('medicines');

        const legacyId = localStorage.getItem('nextId');

        if (legacyMeds) {

          savedMedicines = legacyMeds;

          savedNextId = legacyId;

          await this.storageSet(STORAGE_KEYS.medicines, legacyMeds);

          if (legacyId) await this.storageSet(STORAGE_KEYS.nextId, legacyId);

        }

      }



      if (savedMedicines) {

        const parsed = JSON.parse(savedMedicines);

        this.medicines = Array.isArray(parsed)

          ? parsed.map((med, i) => this.ensureMedicineShape(med, i))

          : [];

      }



      if (savedNextId) {

        this.nextId = parseInt(savedNextId, 10) || 1;

      } else if (this.medicines.length) {

        this.nextId = this.medicines.reduce((max, med) => Math.max(max, med.id), 0) + 1;

      }



      this.remindersEnabled = reminders === '1';

    } catch (error) {

      console.error('Error loading from storage:', error);

      this.medicines = [];

      this.nextId = 1;

    }

  }



  async init() {

    this.bindEvents();

    await this.setupNotificationListeners();

    this.renderScheduleFields();

    this.renderTimesFields();

    this.renderAll();

    if (this.remindersEnabled) {

      this.rescheduleNotifications().catch(console.error);

    }

  }



  async setupNotificationListeners() {

    if (!this.isNative || this._notificationListenersBound) return;



    try {

      await LocalNotifications.registerActionTypes({

        types: [

          {

            id: NOTIFICATION_ACTION_TYPE,

            actions: [

              { id: 'taken', title: 'Taken' },

              { id: 'snooze10', title: 'Snooze 10m' },

              { id: 'snooze30', title: 'Snooze 30m' }

            ]

          }

        ]

      });



      await LocalNotifications.addListener('localNotificationActionPerformed', (event) => {

        this.handleNotificationAction(event).catch(console.error);

      });



      this._notificationListenersBound = true;

    } catch (error) {

      console.error('notification listeners', error);

    }

  }



  async handleNotificationAction(event) {

    const actionId = event.actionId;

    const extra = event.notification?.extra || {};

    const medicineId = Number(extra.medicineId);

    const slot = Number(extra.slot);

    const date = extra.date || this.todayKey();



    if (!medicineId && extra.type !== 'stock' && extra.type !== 'expiry') return;



    if (actionId === 'taken') {

      const date = this.todayKey();

      const med = this.medicines.find((m) => m.id === medicineId);

      if (med && !this.isDoseTaken(med, date, slot)) {

        await this.toggleDose(medicineId, slot, date, { fromNotification: true });

      }

      return;

    }



    if (actionId === 'snooze10') {

      await this.snoozeDose(medicineId, slot, 10, date);

      return;

    }



    if (actionId === 'snooze30') {

      await this.snoozeDose(medicineId, slot, 30, date);

    }

  }



  bindEvents() {

    document.getElementById('medicine-form').addEventListener('submit', (e) => this.handleSubmit(e));

    document.getElementById('cancel-edit-btn').addEventListener('click', () => this.cancelEdit());

    document.getElementById('export-btn').addEventListener('click', () => this.exportData());

    document.getElementById('clear-btn').addEventListener('click', () => this.clearAllData());

    document.getElementById('import-input').addEventListener('change', (e) => this.importData(e, false));

    document.getElementById('merge-import-input').addEventListener('change', (e) => this.importData(e, true));

    document.getElementById('search-input').addEventListener('input', (e) => {

      this.searchQuery = e.target.value.trim().toLowerCase();

      this.renderMedicines();

    });

    document.getElementById('sort-select').addEventListener('change', (e) => {

      this.sortMode = e.target.value;

      this.renderMedicines();

    });

    document.getElementById('notify-btn').addEventListener('click', () => this.toggleReminders());

    document.getElementById('frequency').addEventListener('change', () => this.renderTimesFields());

    document.getElementById('schedule-type').addEventListener('change', () => this.renderScheduleFields());



    document.querySelectorAll('.tab-btn').forEach((btn) => {

      btn.addEventListener('click', () => this.switchTab(btn.dataset.tab));

    });



    document.getElementById('cal-prev').addEventListener('click', () => {

      this.calendarCursor.setMonth(this.calendarCursor.getMonth() - 1);

      this.renderCalendar();

    });

    document.getElementById('cal-next').addEventListener('click', () => {

      this.calendarCursor.setMonth(this.calendarCursor.getMonth() + 1);

      this.renderCalendar();

    });

  }



  switchTab(tab) {

    document.querySelectorAll('.tab-btn').forEach((btn) => {

      btn.classList.toggle('active', btn.dataset.tab === tab);

    });

    document.querySelectorAll('.tab-panel').forEach((panel) => {

      panel.classList.toggle('active', panel.id === `tab-${tab}`);

    });

    if (tab === 'calendar') this.renderCalendar();

    if (tab === 'reports') this.renderReports();

  }



  slotCountForFrequency(frequency) {

    return (DEFAULT_TIMES[frequency] || DEFAULT_TIMES.once).length;

  }



  renderScheduleFields(existingMedicine) {

    const scheduleType = document.getElementById('schedule-type').value || 'daily';

    const weekdaysFieldset = document.getElementById('weekdays-fieldset');

    const everyNRow = document.getElementById('every-n-row');

    const timesFieldset = document.getElementById('times-fieldset');

    const frequencySelect = document.getElementById('frequency');

    const isPrn = scheduleType === 'prn';



    weekdaysFieldset.hidden = scheduleType !== 'weekdays';

    everyNRow.hidden = scheduleType !== 'everyN';

    timesFieldset.hidden = isPrn;

    const frequencyGroup = document.getElementById('frequency-group');

    if (frequencyGroup) frequencyGroup.hidden = isPrn;

    frequencySelect.required = !isPrn;



    if (scheduleType === 'weekdays' && existingMedicine) {

      const weekdays = existingMedicine.weekdays || [0, 1, 2, 3, 4, 5, 6];

      document.querySelectorAll('.weekday-cb').forEach((cb) => {

        cb.checked = weekdays.includes(Number(cb.value));

      });

    } else if (scheduleType === 'weekdays') {

      document.querySelectorAll('.weekday-cb').forEach((cb) => {

        cb.checked = [1, 2, 3, 4, 5].includes(Number(cb.value));

      });

    }



    if (existingMedicine?.everyNDays) {

      document.getElementById('every-n-days').value = existingMedicine.everyNDays;

    }



    this.renderTimesFields(existingMedicine ? this.getSchedule(existingMedicine) : undefined);

  }



  renderTimesFields(existingTimes) {

    const scheduleType = document.getElementById('schedule-type').value || 'daily';

    if (scheduleType === 'prn') return;



    const frequency = document.getElementById('frequency').value || 'once';

    const count = this.slotCountForFrequency(frequency);

    const defaults = DEFAULT_TIMES[frequency] || DEFAULT_TIMES.once;

    const times = existingTimes && existingTimes.length ? existingTimes : defaults;

    const container = document.getElementById('times-fields');

    container.innerHTML = '';



    for (let i = 0; i < count; i++) {

      const label = TIME_LABELS[i] || `Time ${i + 1}`;

      const row = document.createElement('div');

      row.className = 'time-field-row';

      row.innerHTML = `

        <label class="field-label" for="time-slot-${i}">${label}</label>

        <input type="time" id="time-slot-${i}" value="${this.escapeHtml(times[i] || defaults[i] || '08:00')}" required>

      `;

      container.appendChild(row);

    }

  }



  readTimesFromForm() {

    const scheduleType = document.getElementById('schedule-type').value;

    if (scheduleType === 'prn') return [];



    const frequency = document.getElementById('frequency').value;

    const count = this.slotCountForFrequency(frequency);

    const times = [];

    for (let i = 0; i < count; i++) {

      const el = document.getElementById(`time-slot-${i}`);

      times.push(el && el.value ? el.value : (DEFAULT_TIMES[frequency] || DEFAULT_TIMES.once)[i]);

    }

    return times;

  }



  readWeekdaysFromForm() {

    const selected = [];

    document.querySelectorAll('.weekday-cb:checked').forEach((cb) => selected.push(Number(cb.value)));

    return selected.length ? selected : [0, 1, 2, 3, 4, 5, 6];

  }



  readFormMedicineFields() {

    const name = document.getElementById('medicine-name').value.trim();

    const dosage = document.getElementById('dosage').value.trim();

    const scheduleType = document.getElementById('schedule-type').value;

    const frequency = scheduleType === 'prn' ? 'once' : document.getElementById('frequency').value;

    const strength = document.getElementById('strength').value.trim();

    const unit = document.getElementById('unit').value;

    const pillRaw = document.getElementById('pill-count').value;

    const refillRaw = document.getElementById('refill-at').value;

    const expiryDate = document.getElementById('expiry-date').value;

    const rxInfo = document.getElementById('rx-info').value.trim();

    const startDate = document.getElementById('start-date').value;

    const endDate = document.getElementById('end-date').value;

    const times = this.readTimesFromForm();



    return {

      name,

      dosage,

      scheduleType,

      frequency,

      strength,

      unit,

      times,

      weekdays: this.readWeekdaysFromForm(),

      everyNDays: Math.max(2, Number(document.getElementById('every-n-days').value) || 2),

      startDate,

      endDate,

      pillCount: pillRaw === '' ? null : Number(pillRaw),

      refillAt: refillRaw === '' ? null : Number(refillRaw),

      expiryDate,

      rxInfo

    };

  }



  async handleSubmit(e) {

    e.preventDefault();

    const fields = this.readFormMedicineFields();



    if (!fields.name || !fields.dosage) {

      alert('Please fill in name and dose amount.');

      return;

    }

    if (fields.scheduleType !== 'prn' && !fields.frequency) {

      alert('Please select frequency.');

      return;

    }

    if (fields.scheduleType === 'weekdays' && !fields.weekdays.length) {

      alert('Select at least one weekday.');

      return;

    }

    if (fields.startDate && fields.endDate && fields.endDate < fields.startDate) {

      alert('Course end must be on or after start.');

      return;

    }



    if (this.editingId !== null) {

      const medicine = this.medicines.find((med) => med.id === this.editingId);

      if (medicine) {

        Object.assign(medicine, fields);

        await this.saveToStorage();

      }

      this.cancelEdit();

    } else {

      this.medicines.push(

        this.ensureMedicineShape({

          id: this.nextId++,

          ...fields,

          dateAdded: new Date().toISOString(),

          taken: [],

          skipped: [],

          skipReasons: {},

          prnLog: [],

          paused: false

        })

      );

      await this.saveToStorage();

      e.target.reset();

      this.renderScheduleFields();

      this.renderTimesFields();

    }



    this.renderAll();

  }



  editMedicine(id) {

    const medicine = this.medicines.find((med) => med.id === id);

    if (!medicine) return;



    this.editingId = id;

    document.getElementById('medicine-name').value = medicine.name;

    document.getElementById('dosage').value = medicine.dosage;

    document.getElementById('schedule-type').value = medicine.scheduleType || 'daily';

    document.getElementById('frequency').value = medicine.frequency;

    document.getElementById('strength').value = medicine.strength || '';

    document.getElementById('unit').value = medicine.unit || 'mg';

    document.getElementById('pill-count').value = medicine.pillCount == null ? '' : medicine.pillCount;

    document.getElementById('refill-at').value = medicine.refillAt == null ? '' : medicine.refillAt;

    document.getElementById('expiry-date').value = medicine.expiryDate || '';

    document.getElementById('start-date').value = medicine.startDate || '';

    document.getElementById('end-date').value = medicine.endDate || '';

    document.getElementById('rx-info').value = medicine.rxInfo || '';

    document.getElementById('every-n-days').value = medicine.everyNDays || 2;

    this.renderScheduleFields(medicine);



    document.getElementById('form-heading').textContent = 'Edit Medicine';

    document.getElementById('submit-btn').textContent = 'Update Medicine';

    document.getElementById('cancel-edit-btn').hidden = false;

    this.switchTab('medicines');

    document.getElementById('medicine-name').focus();

  }



  cancelEdit() {

    this.editingId = null;

    document.getElementById('medicine-form').reset();

    document.getElementById('form-heading').textContent = 'Add Medicine';

    document.getElementById('submit-btn').textContent = 'Add Medicine';

    document.getElementById('cancel-edit-btn').hidden = true;

    this.renderScheduleFields();

    this.renderTimesFields();

  }



  async removeMedicine(id) {

    if (!confirm('Remove this medicine?')) return;

    this.medicines = this.medicines.filter((med) => med.id !== id);

    if (this.editingId === id) this.cancelEdit();

    await this.saveToStorage();

    this.renderAll();

  }



  async togglePause(id) {

    const medicine = this.medicines.find((med) => med.id === id);

    if (!medicine) return;

    medicine.paused = !medicine.paused;

    await this.saveToStorage();

    this.renderAll();

  }



  adjustInventory(medicine, delta) {

    if (medicine.pillCount == null || Number.isNaN(medicine.pillCount)) return;

    const amount = this.parseDoseAmount(medicine.dosage) * Math.abs(delta);

    if (delta < 0) {

      medicine.pillCount = Math.max(0, medicine.pillCount - amount);

    } else {

      medicine.pillCount += amount;

    }

  }



  async toggleDose(medicineId, slot, date, options = {}) {

    const medicine = this.medicines.find((med) => med.id === medicineId);

    if (!medicine) return;



    this.ensureTakenArray(medicine);

    const key = this.doseKey(date, slot);

    const takenIndex = medicine.taken.indexOf(key);

    const skippedIndex = medicine.skipped.indexOf(key);



    if (takenIndex === -1) {

      if (skippedIndex !== -1) {

        medicine.skipped.splice(skippedIndex, 1);

        delete medicine.skipReasons[key];

      }

      medicine.taken.push(key);

      this.adjustInventory(medicine, -1);

    } else {

      medicine.taken.splice(takenIndex, 1);

      this.adjustInventory(medicine, 1);

    }



    await this.saveToStorage();

    if (!options.fromNotification) this.renderAll();

    else this.renderAll();

  }



  async skipDose(medicineId, slot, date, reason = '') {

    const medicine = this.medicines.find((med) => med.id === medicineId);

    if (!medicine) return;



    this.ensureTakenArray(medicine);

    const key = this.doseKey(date, slot);

    const takenIndex = medicine.taken.indexOf(key);



    if (takenIndex !== -1) {

      medicine.taken.splice(takenIndex, 1);

      this.adjustInventory(medicine, 1);

    }



    if (!medicine.skipped.includes(key)) {

      medicine.skipped.push(key);

    }

    if (reason.trim()) {

      medicine.skipReasons[key] = reason.trim();

    } else {

      delete medicine.skipReasons[key];

    }



    await this.saveToStorage();

    this.renderAll();

  }



  async unskipDose(medicineId, slot, date) {

    const medicine = this.medicines.find((med) => med.id === medicineId);

    if (!medicine) return;



    this.ensureTakenArray(medicine);

    const key = this.doseKey(date, slot);

    const index = medicine.skipped.indexOf(key);

    if (index !== -1) {

      medicine.skipped.splice(index, 1);

      delete medicine.skipReasons[key];

      await this.saveToStorage();

      this.renderAll();

    }

  }



  async markTakenToday(medicineId) {

    const medicine = this.medicines.find((med) => med.id === medicineId);

    if (!medicine) return;



    const today = this.todayKey();

    const slots = this.getDueSlots(medicine, today);

    const next = slots.find(({ slot }) => !this.isDoseResolved(medicine, today, slot));

    if (!next) return;



    await this.toggleDose(medicineId, next.slot, today);

  }



  async logPrnDose(medicineId, dateKey) {

    const medicine = this.medicines.find((med) => med.id === medicineId);

    if (!medicine || !this.isPrn(medicine)) return;



    this.ensureTakenArray(medicine);

    const now = new Date();

    const stamp = `${dateKey}T${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    medicine.prnLog.push(stamp);

    this.adjustInventory(medicine, -1);

    await this.saveToStorage();

    this.renderAll();

  }



  getFilteredSortedMedicines() {

    let list = [...this.medicines];



    if (this.searchQuery) {

      list = list.filter((med) => {

        const hay = `${med.name} ${med.rxInfo} ${med.strength}`.toLowerCase();

        return hay.includes(this.searchQuery);

      });

    }



    list.sort((a, b) => {

      switch (this.sortMode) {

        case 'name-desc':

          return b.name.localeCompare(a.name);

        case 'date-asc':

          return new Date(a.dateAdded) - new Date(b.dateAdded);

        case 'date-desc':

          return new Date(b.dateAdded) - new Date(a.dateAdded);

        case 'expiry-asc': {

          const ae = a.expiryDate || '9999-99-99';

          const be = b.expiryDate || '9999-99-99';

          return ae.localeCompare(be);

        }

        case 'name-asc':

        default:

          return a.name.localeCompare(b.name);

      }

    });



    return list;

  }



  renderAll() {

    this.renderAdherence();

    this.renderRefillAlerts();

    this.renderToday();

    this.renderMedicines();

    this.renderCalendar();

    this.renderReports();

    this.updateNotifyButton();

  }



  updateNotifyButton() {

    const btn = document.getElementById('notify-btn');

    btn.textContent = this.remindersEnabled ? 'Reminders on (tap to disable)' : 'Enable reminders';

    btn.classList.toggle('is-on', this.remindersEnabled);

  }



  renderAdherence() {

    const summary = document.getElementById('adherence-summary');

    const activeMeds = this.medicines.filter((m) => !this.isPaused(m));

    if (activeMeds.length === 0) {

      summary.textContent = this.medicines.length

        ? 'All medicines are paused.'

        : 'Add medicines to start tracking adherence.';

      return;

    }



    let due = 0;

    let resolved = 0;

    const now = new Date();

    for (let i = 0; i < 7; i++) {

      const day = new Date(now);

      day.setDate(now.getDate() - i);

      const stats = this.dayAdherence(this.todayKey(day));

      due += stats.due;

      resolved += stats.taken;

    }



    let streak = 0;

    for (let i = 0; i < 30; i++) {

      const day = new Date(now);

      day.setDate(now.getDate() - i);

      const stats = this.dayAdherence(this.todayKey(day));

      const complete = stats.due > 0 && stats.taken === stats.due;

      if (complete) streak += 1;

      else if (i === 0) continue;

      else break;

    }



    const percent = due === 0 ? 0 : Math.round((resolved / due) * 100);

    summary.textContent = `This week: ${percent}% (${resolved}/${due}). Streak: ${streak} day${streak === 1 ? '' : 's'}.`;

  }



  renderRefillAlerts() {

    const box = document.getElementById('refill-alerts');

    const alerts = [];

    const today = this.todayKey();



    this.medicines.forEach((med) => {

      if (this.isPaused(med)) return;

      if (med.pillCount != null && med.refillAt != null && med.pillCount <= med.refillAt) {

        alerts.push(`Low stock: ${med.name} (${med.pillCount} left)`);

      }

      if (med.expiryDate && med.expiryDate <= today) {

        alerts.push(`Expired: ${med.name} (${med.expiryDate})`);

      } else if (med.expiryDate) {

        const in30 = new Date();

        in30.setDate(in30.getDate() + 30);

        if (med.expiryDate <= this.todayKey(in30)) {

          alerts.push(`Expiring soon: ${med.name} (${med.expiryDate})`);

        }

      }

    });



    if (!alerts.length) {

      box.hidden = true;

      box.innerHTML = '';

      return;

    }



    box.hidden = false;

    box.innerHTML = alerts.map((a) => `<p class="alert-item">${this.escapeHtml(a)}</p>`).join('');

  }



  buildDoseActionButtons(medicine, slot, dateKey, { compact = false } = {}) {

    const taken = this.isDoseTaken(medicine, dateKey, slot);

    const skipped = this.isDoseSkipped(medicine, dateKey, slot);

    const wrap = document.createElement('div');

    wrap.className = compact ? 'dose-actions compact' : 'dose-actions';



    if (taken) {

      const undoBtn = document.createElement('button');

      undoBtn.type = 'button';

      undoBtn.className = 'taken-btn is-taken';

      undoBtn.textContent = 'Undo';

      undoBtn.addEventListener('click', () => this.toggleDose(medicine.id, slot, dateKey));

      wrap.appendChild(undoBtn);

    } else if (skipped) {

      const unskipBtn = document.createElement('button');

      unskipBtn.type = 'button';

      unskipBtn.className = 'skip-btn is-skipped';

      unskipBtn.textContent = 'Unskip';

      unskipBtn.addEventListener('click', () => this.unskipDose(medicine.id, slot, dateKey));

      wrap.appendChild(unskipBtn);

      const takeBtn = document.createElement('button');

      takeBtn.type = 'button';

      takeBtn.className = 'taken-btn';

      takeBtn.textContent = 'Taken';

      takeBtn.addEventListener('click', () => this.toggleDose(medicine.id, slot, dateKey));

      wrap.appendChild(takeBtn);

    } else {

      const takeBtn = document.createElement('button');

      takeBtn.type = 'button';

      takeBtn.className = 'taken-btn';

      takeBtn.textContent = 'Taken';

      takeBtn.addEventListener('click', () => this.toggleDose(medicine.id, slot, dateKey));

      wrap.appendChild(takeBtn);



      const skipBtn = document.createElement('button');

      skipBtn.type = 'button';

      skipBtn.className = 'skip-btn';

      skipBtn.textContent = 'Skip';

      skipBtn.addEventListener('click', () => {

        const reason = prompt('Skip reason (optional):') ?? '';

        if (reason !== null) this.skipDose(medicine.id, slot, dateKey, reason);

      });

      wrap.appendChild(skipBtn);



      if (dateKey === this.todayKey()) {

        const snoozeBtn = document.createElement('button');

        snoozeBtn.type = 'button';

        snoozeBtn.className = 'snooze-btn';

        snoozeBtn.textContent = 'Snooze';

        snoozeBtn.addEventListener('click', () => this.promptSnooze(medicine.id, slot, dateKey));

        wrap.appendChild(snoozeBtn);

      }

    }



    return wrap;

  }



  async promptSnooze(medicineId, slot, dateKey) {

    const choice = prompt('Snooze for how many minutes? (10 or 30)', '10');

    if (choice === null) return;

    const minutes = Number(choice) === 30 ? 30 : 10;

    await this.snoozeDose(medicineId, slot, minutes, dateKey);

    alert(`Snoozed for ${minutes} minutes.`);

  }



  renderToday() {

    const container = document.getElementById('today-container');

    container.innerHTML = '';



    const activeMeds = this.medicines.filter((m) => !this.isPaused(m));

    if (activeMeds.length === 0) {

      container.innerHTML =

        this.medicines.length === 0

          ? '<p class="empty-state">No medicines yet. Add one in the Medicines tab.</p>'

          : '<p class="empty-state">All medicines are paused.</p>';

      return;

    }



    const today = this.todayKey();

    const rows = [];



    this.medicines.forEach((medicine) => {

      if (this.isPaused(medicine)) return;



      if (this.isPrn(medicine)) {

        rows.push({ type: 'prn', medicine });

        return;

      }



      this.getDueSlots(medicine, today).forEach(({ time, slot }) => {

        rows.push({

          type: 'scheduled',

          medicine,

          time,

          slot,

          taken: this.isDoseTaken(medicine, today, slot),

          skipped: this.isDoseSkipped(medicine, today, slot)

        });

      });

    });



    rows.sort((a, b) => {

      if (a.type === 'prn' && b.type !== 'prn') return 1;

      if (b.type === 'prn' && a.type !== 'prn') return -1;

      if (a.type === 'prn') return a.medicine.name.localeCompare(b.medicine.name);

      return a.time.localeCompare(b.time);

    });



    if (!rows.length) {

      container.innerHTML = '<p class="empty-state">No doses scheduled for today.</p>';

      return;

    }



    rows.forEach((row) => {

      if (row.type === 'prn') {

        const { medicine } = row;

        const count = this.countPrnOnDate(medicine, today);

        const el = document.createElement('div');

        el.className = 'today-item prn-item';

        el.innerHTML = `

          <div class="today-info">

            <strong>${this.escapeHtml(medicine.name)}</strong>

            <span>As needed · ${this.escapeHtml(medicine.dosage)}${

              medicine.strength ? ` · ${this.escapeHtml(medicine.strength)}${this.escapeHtml(medicine.unit)}` : ''

            }</span>

            <span class="prn-count">Logged today: ${count}</span>

          </div>

        `;

        const logBtn = document.createElement('button');

        logBtn.type = 'button';

        logBtn.className = 'taken-btn';

        logBtn.textContent = 'Log dose';

        logBtn.addEventListener('click', () => this.logPrnDose(medicine.id, today));

        el.appendChild(logBtn);

        container.appendChild(el);

        return;

      }



      const { medicine, time, slot, taken, skipped } = row;

      const el = document.createElement('div');

      el.className = `today-item${taken ? ' taken' : ''}${skipped ? ' skipped' : ''}`;

      const skipReason = medicine.skipReasons?.[this.doseKey(today, slot)];

      el.innerHTML = `

        <div class="today-info">

          <strong>${this.escapeHtml(medicine.name)}</strong>

          <span>${this.escapeHtml(time)} · ${this.escapeHtml(medicine.dosage)}${

            medicine.strength ? ` · ${this.escapeHtml(medicine.strength)}${this.escapeHtml(medicine.unit)}` : ''

          }</span>

          ${skipped ? `<span class="skip-reason">Skipped${skipReason ? `: ${this.escapeHtml(skipReason)}` : ''}</span>` : ''}

        </div>

      `;

      el.appendChild(this.buildDoseActionButtons(medicine, slot, today));

      container.appendChild(el);

    });

  }



  formatScheduleMeta(medicine) {

    const parts = [this.scheduleTypeLabel(medicine.scheduleType || 'daily')];

    if (medicine.scheduleType === 'weekdays' && medicine.weekdays?.length) {

      parts.push(medicine.weekdays.map((d) => WEEKDAY_NAMES[d]).join(', '));

    }

    if (medicine.scheduleType === 'everyN') {

      parts.push(`every ${medicine.everyNDays} days`);

    }

    if (medicine.startDate || medicine.endDate) {

      parts.push(`${medicine.startDate || '…'} → ${medicine.endDate || '…'}`);

    }

    return parts.join(' · ');

  }



  renderMedicines() {

    const container = document.getElementById('medicines-container');

    container.innerHTML = '';

    const list = this.getFilteredSortedMedicines();



    if (this.medicines.length === 0) {

      container.innerHTML = '<p class="empty-state">No medicines yet. Use the form above.</p>';

      return;

    }

    if (list.length === 0) {

      container.innerHTML = '<p class="empty-state">No medicines match your search.</p>';

      return;

    }



    const today = this.todayKey();

    list.forEach((medicine) => container.appendChild(this.createMedicineElement(medicine, today)));

  }



  createMedicineElement(medicine, today) {

    const schedule = this.getSchedule(medicine);

    const dueSlots = this.getDueSlots(medicine, today);

    const takenCount = dueSlots.filter(({ slot }) => this.isDoseTaken(medicine, today, slot)).length;

    const total = dueSlots.length;

    const allResolved = total > 0 && dueSlots.every(({ slot }) => this.isDoseResolved(medicine, today, slot));

    const prnCount = this.countPrnOnDate(medicine, today);



    const scheduleText = this.isPrn(medicine)

      ? `<p><strong>Schedule:</strong> As needed (PRN)</p><p><strong>Logged today:</strong> ${prnCount}</p>`

      : `<p><strong>Schedule:</strong> ${schedule

          .map((time, slot) => {

            const done = this.isDoseTaken(medicine, today, slot);

            const skipped = this.isDoseSkipped(medicine, today, slot);

            const cls = done ? 'slot-done' : skipped ? 'slot-skipped' : '';

            const mark = done ? '' : skipped ? ' (skip)' : '';

            return `<span class="slot ${cls}">${this.escapeHtml(time)}${mark}</span>`;

          })

          .join(' ')}</p>`;



    const strengthLine = medicine.strength

      ? `<p><strong>Strength:</strong> ${this.escapeHtml(medicine.strength)} ${this.escapeHtml(medicine.unit)}</p>`

      : '';

    const inventoryLine =

      medicine.pillCount != null

        ? `<p><strong>Inventory:</strong> ${medicine.pillCount}${

            medicine.refillAt != null ? ` (refill at ${medicine.refillAt})` : ''

          }</p>`

        : '';

    const expiryLine = medicine.expiryDate

      ? `<p><strong>Expiry:</strong> ${this.escapeHtml(medicine.expiryDate)}</p>`

      : '';

    const rxLine = medicine.rxInfo ? `<p><strong>Rx:</strong> ${this.escapeHtml(medicine.rxInfo)}</p>` : '';

    const pausedBadge = medicine.paused ? '<span class="paused-badge">Paused</span>' : '';



    const div = document.createElement('div');

    div.className = `medicine-item${medicine.paused ? ' is-paused' : ''}`;

    div.innerHTML = `

      <div class="medicine-info">

        <h3>${this.escapeHtml(medicine.name)} ${pausedBadge}</h3>

        <p><strong>Dose:</strong> ${this.escapeHtml(medicine.dosage)}</p>

        ${strengthLine}

        <p><strong>Pattern:</strong> ${this.escapeHtml(this.formatScheduleMeta(medicine))}</p>

        ${

          !this.isPrn(medicine)

            ? `<p><strong>Frequency:</strong> ${this.escapeHtml(this.frequencyLabel(medicine.frequency))}</p>`

            : ''

        }

        ${scheduleText}

        ${inventoryLine}

        ${expiryLine}

        ${rxLine}

        ${

          !this.isPrn(medicine)

            ? `<p class="today-status"><strong>Today:</strong> ${takenCount}/${total}${allResolved ? ' ✓' : ''}</p>`

            : ''

        }

      </div>

      <div class="medicine-actions">

        ${

          this.isPrn(medicine)

            ? `<button type="button" class="taken-btn" data-action="prn">Log dose</button>`

            : `<button type="button" class="taken-btn${allResolved ? ' is-taken' : ''}" data-action="mark">${

                allResolved ? 'Done' : 'Taken'

              }</button>`

        }

        <button type="button" class="pause-btn" data-action="pause">${medicine.paused ? 'Resume' : 'Pause'}</button>

        <button type="button" class="edit-btn" data-action="edit">Edit</button>

        <button type="button" class="delete-btn" data-action="remove">Remove</button>

      </div>

    `;



    const markBtn = div.querySelector('[data-action="mark"]');

    if (markBtn) {

      markBtn.addEventListener('click', () => {

        if (!allResolved) this.markTakenToday(medicine.id);

      });

    }

    const prnBtn = div.querySelector('[data-action="prn"]');

    if (prnBtn) prnBtn.addEventListener('click', () => this.logPrnDose(medicine.id, today));

    div.querySelector('[data-action="pause"]').addEventListener('click', () => this.togglePause(medicine.id));

    div.querySelector('[data-action="edit"]').addEventListener('click', () => this.editMedicine(medicine.id));

    div.querySelector('[data-action="remove"]').addEventListener('click', () => this.removeMedicine(medicine.id));

    return div;

  }



  renderCalendar() {

    const grid = document.getElementById('calendar-grid');

    const title = document.getElementById('cal-title');

    if (!grid || !title) return;



    const year = this.calendarCursor.getFullYear();

    const month = this.calendarCursor.getMonth();

    title.textContent = this.calendarCursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });



    const first = new Date(year, month, 1);

    const startPad = first.getDay();

    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const today = this.todayKey();



    grid.innerHTML = '';



    for (let i = 0; i < startPad; i++) {

      const empty = document.createElement('div');

      empty.className = 'cal-cell empty';

      grid.appendChild(empty);

    }



    for (let day = 1; day <= daysInMonth; day++) {

      const date = new Date(year, month, day);

      const key = this.todayKey(date);

      const stats = this.dayAdherence(key);

      const cell = document.createElement('button');

      cell.type = 'button';

      cell.className = 'cal-cell';

      if (key === today) cell.classList.add('is-today');

      if (this.selectedCalDate === key) cell.classList.add('is-selected');

      if (stats.percent == null) cell.classList.add('no-data');

      else if (stats.percent === 100) cell.classList.add('full');

      else if (stats.percent > 0) cell.classList.add('partial');

      else cell.classList.add('missed');



      cell.innerHTML = `<span class="cal-day">${day}</span><span class="cal-pct">${

        stats.percent == null ? '–' : `${stats.percent}%`

      }</span>`;

      cell.addEventListener('click', () => {

        this.selectedCalDate = key;

        this.renderCalendar();

        this.renderCalendarDetail(key);

      });

      grid.appendChild(cell);

    }



    if (this.selectedCalDate) {

      this.renderCalendarDetail(this.selectedCalDate);

    } else {

      document.getElementById('calendar-day-detail').innerHTML =

        '<p class="empty-state">Tap a day to see doses.</p>';

    }

  }



  renderCalendarDetail(dateKey) {

    const detail = document.getElementById('calendar-day-detail');

    if (!this.medicines.length) {

      detail.innerHTML = '<p class="empty-state">No medicines.</p>';

      return;

    }



    detail.innerHTML = `<h3>${this.escapeHtml(dateKey)}</h3>`;

    const list = document.createElement('ul');

    list.className = 'day-dose-list';



    let hasItems = false;



    this.medicines.forEach((medicine) => {

      if (this.isPaused(medicine)) return;



      if (this.isPrn(medicine)) {

        const logs = medicine.prnLog.filter((entry) => entry.startsWith(dateKey));

        if (logs.length) {

          hasItems = true;

          logs.forEach((entry) => {

            const li = document.createElement('li');

            li.className = 'taken';

            li.innerHTML = `<strong>${this.escapeHtml(medicine.name)}</strong> PRN — logged ${this.escapeHtml(entry.split('T')[1] || '')}`;

            list.appendChild(li);

          });

        }

        return;

      }



      this.getDueSlots(medicine, dateKey).forEach(({ time, slot }) => {

        hasItems = true;

        const taken = this.isDoseTaken(medicine, dateKey, slot);

        const skipped = this.isDoseSkipped(medicine, dateKey, slot);

        const reason = medicine.skipReasons?.[this.doseKey(dateKey, slot)];

        const li = document.createElement('li');

        li.className = taken ? 'taken' : skipped ? 'skipped' : '';

        li.innerHTML = `

          <div class="cal-dose-row">

            <div class="cal-dose-info">

              <strong>${this.escapeHtml(medicine.name)}</strong> ${this.escapeHtml(time)}

              — ${taken ? 'Taken' : skipped ? `Skipped${reason ? `: ${this.escapeHtml(reason)}` : ''}` : 'Missed/pending'}

            </div>

          </div>

        `;

        li.querySelector('.cal-dose-row').appendChild(

          this.buildDoseActionButtons(medicine, slot, dateKey, { compact: true })

        );

        list.appendChild(li);

      });

    });



    if (!hasItems) {

      detail.innerHTML += '<p class="empty-state">No doses scheduled for this day.</p>';

      return;

    }



    detail.appendChild(list);

  }



  renderReports() {

    const chart = document.getElementById('chart-container');

    const summary = document.getElementById('reports-summary');

    const perMed = document.getElementById('per-med-reports');

    if (!chart) return;



    const days = [];

    const now = new Date();

    for (let i = 13; i >= 0; i--) {

      const day = new Date(now);

      day.setDate(now.getDate() - i);

      const key = this.todayKey(day);

      const stats = this.dayAdherence(key);

      days.push({

        key,

        label: `${day.getMonth() + 1}/${day.getDate()}`,

        percent: stats.percent == null ? 0 : stats.percent,

        due: stats.due,

        taken: stats.taken

      });

    }



    chart.innerHTML = days

      .map((d) => {

        const h = Math.max(4, d.percent);

        return `<div class="chart-bar-wrap" title="${d.key}: ${d.taken}/${d.due}">

          <div class="chart-bar" style="height:${h}%"></div>

          <span class="chart-label">${this.escapeHtml(d.label)}</span>

        </div>`;

      })

      .join('');



    const totalDue = days.reduce((s, d) => s + d.due, 0);

    const totalTaken = days.reduce((s, d) => s + d.taken, 0);

    const pct = totalDue === 0 ? 0 : Math.round((totalTaken / totalDue) * 100);

    summary.textContent =

      totalDue === 0

        ? 'No scheduled doses in this period.'

        : `14-day adherence: ${pct}% (${totalTaken}/${totalDue} doses).`;



    if (perMed) {

      const active = this.medicines.filter((m) => !this.isPaused(m) && !this.isPrn(m));

      if (!active.length) {

        perMed.innerHTML = '<p class="empty-state">No scheduled medicines to report.</p>';

      } else {

        perMed.innerHTML = active

          .map((med) => {

            const stats = this.medicineAdherence(med, 14);

            const label =

              stats.due === 0

                ? 'No doses due in period'

                : `${stats.percent}% (${stats.resolved}/${stats.due})`;

            return `<div class="per-med-row"><span>${this.escapeHtml(med.name)}</span><strong>${label}</strong></div>`;

          })

          .join('');

      }

    }

  }



  exportData() {

    const data = {

      medicines: this.medicines,

      exportDate: new Date().toISOString(),

      version: '3.0'

    };

    const dataStr = JSON.stringify(data, null, 2);

    const dataBlob = new Blob([dataStr], { type: 'application/json' });

    const link = document.createElement('a');

    link.href = URL.createObjectURL(dataBlob);

    link.download = `medicine-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;

    link.click();

    URL.revokeObjectURL(link.href);

  }



  importData(event, merge = false) {

    const file = event.target.files && event.target.files[0];

    event.target.value = '';

    if (!file) return;



    const reader = new FileReader();

    reader.onload = async () => {

      try {

        const data = JSON.parse(reader.result);

        if (!data || !Array.isArray(data.medicines)) {

          alert('Invalid backup file: missing medicines array.');

          return;

        }



        const msg = merge

          ? `Merge ${data.medicines.length} medicine(s) into your current list?`

          : `Import ${data.medicines.length} medicine(s)? This replaces your current list.`;

        if (!confirm(msg)) return;



        const imported = data.medicines.map((med, index) => this.ensureMedicineShape(med, index));



        if (merge) {

          const existingIds = new Set(this.medicines.map((m) => m.id));

          imported.forEach((med) => {

            if (existingIds.has(med.id)) {

              med.id = this.nextId++;

            } else {

              this.nextId = Math.max(this.nextId, med.id + 1);

            }

            this.medicines.push(med);

          });

        } else {

          this.medicines = imported;

          this.nextId = this.medicines.reduce((max, med) => Math.max(max, med.id), 0) + 1;

        }



        this.cancelEdit();

        await this.saveToStorage();

        this.renderAll();

        alert(merge ? 'Merge import successful.' : 'Import successful.');

      } catch (error) {

        console.error(error);

        alert('Could not read that file. Choose a valid JSON backup.');

      }

    };

    reader.readAsText(file);

  }



  async clearAllData() {

    if (!confirm('Clear all data? This cannot be undone.')) return;

    this.medicines = [];

    this.nextId = 1;

    this.cancelEdit();

    await this.saveToStorage();

    await this.cancelAllNotifications();

    this.renderAll();

    alert('All data cleared');

  }



  async toggleReminders() {

    if (this.remindersEnabled) {

      if (!confirm('Disable all dose reminders?')) return;

      this.remindersEnabled = false;

      await this.saveToStorage();

      this.updateNotifyButton();

      return;

    }



    try {

      if (this.isNative) {

        const perm = await LocalNotifications.requestPermissions();

        if (perm.display !== 'granted') {

          alert('Notification permission was not granted.');

          return;

        }

      } else if ('Notification' in window) {

        let permission = Notification.permission;

        if (permission === 'default') {

          permission = await Notification.requestPermission();

        }

        if (permission !== 'granted') {

          alert('Notification permission was not granted.');

          return;

        }

      } else {

        alert('Notifications are not supported in this browser.');

        return;

      }



      this.remindersEnabled = true;

      await this.saveToStorage();

      this.updateNotifyButton();

      alert(

        this.isNative

          ? 'Reminders enabled. Dose alerts will fire even when the app is closed.'

          : 'Reminders enabled in this browser. For background alerts on a phone, build the Android app with Capacitor.'

      );

    } catch (error) {

      console.error(error);

      alert('Could not enable reminders.');

    }

  }



  notificationId(medicineId, slot) {

    return medicineId * 100 + slot + 1;

  }



  snoozeNotificationId(medicineId, slot) {

    return medicineId * 100 + slot + 50;

  }



  stockNotificationId(medicineId) {

    return 900000 + medicineId;

  }



  expiryNotificationId(medicineId) {

    return 910000 + medicineId;

  }



  async cancelAllNotifications() {

    if (!this.isNative) {

      if (this._webReminderTimer) {

        clearInterval(this._webReminderTimer);

        this._webReminderTimer = null;

      }

      return;

    }

    try {

      const pending = await LocalNotifications.getPending();

      if (pending.notifications.length) {

        await LocalNotifications.cancel({ notifications: pending.notifications });

      }

    } catch (error) {

      console.error('cancel notifications', error);

    }

  }



  async snoozeDose(medicineId, slot, minutes, dateKey) {

    const medicine = this.medicines.find((m) => m.id === medicineId);

    if (!medicine || !this.remindersEnabled) return;



    const at = new Date(Date.now() + minutes * 60000);



    if (this.isNative) {

      await LocalNotifications.schedule({

        notifications: [

          {

            id: this.snoozeNotificationId(medicineId, slot),

            title: 'Medicine reminder (snoozed)',

            body: `Time for ${medicine.name} (${medicine.dosage})`,

            schedule: { at, allowWhileIdle: true },

            actionTypeId: NOTIFICATION_ACTION_TYPE,

            extra: { medicineId, slot, date: dateKey || this.todayKey() }

          }

        ]

      });

    } else if ('Notification' in window && Notification.permission === 'granted') {

      setTimeout(() => {

        if (!this.isDoseResolved(medicine, dateKey || this.todayKey(), slot)) {

          new Notification('Medicine reminder (snoozed)', {

            body: `Time for ${medicine.name} (${medicine.dosage})`

          });

        }

      }, minutes * 60000);

    }

  }



  async rescheduleNotifications() {

    if (!this.remindersEnabled) return;



    if (this.isNative) {

      await this.cancelAllNotifications();

      const notifications = [];



      this.medicines.forEach((medicine) => {

        if (this.isPaused(medicine) || this.isPrn(medicine)) return;



        const schedule = this.getSchedule(medicine);

        schedule.forEach((time, slot) => {

          const [hour, minute] = time.split(':').map(Number);

          notifications.push({

            id: this.notificationId(medicine.id, slot),

            title: 'Medicine reminder',

            body: `Time for ${medicine.name} (${medicine.dosage})`,

            schedule: {

              on: { hour, minute },

              allowWhileIdle: true

            },

            actionTypeId: NOTIFICATION_ACTION_TYPE,

            extra: { medicineId: medicine.id, slot, date: this.todayKey() }

          });

        });



        const today = this.todayKey();

        if (medicine.pillCount != null && medicine.refillAt != null && medicine.pillCount <= medicine.refillAt) {

          notifications.push({

            id: this.stockNotificationId(medicine.id),

            title: 'Low medicine stock',

            body: `${medicine.name}: ${medicine.pillCount} left (refill at ${medicine.refillAt})`,

            schedule: { on: { hour: 9, minute: 0 }, allowWhileIdle: true },

            extra: { type: 'stock', medicineId: medicine.id }

          });

        }



        if (medicine.expiryDate) {

          const exp = this.parseDateKey(medicine.expiryDate);

          if (medicine.expiryDate <= today) {

            notifications.push({

              id: this.expiryNotificationId(medicine.id),

              title: 'Medicine expired',

              body: `${medicine.name} expired on ${medicine.expiryDate}`,

              schedule: { on: { hour: 9, minute: 5 }, allowWhileIdle: true },

              extra: { type: 'expiry', medicineId: medicine.id }

            });

          } else {

            notifications.push({

              id: this.expiryNotificationId(medicine.id),

              title: 'Medicine expiring soon',

              body: `${medicine.name} expires on ${medicine.expiryDate}`,

              schedule: { at: new Date(exp.getTime() - 7 * 86400000), allowWhileIdle: true },

              extra: { type: 'expiry', medicineId: medicine.id }

            });

          }

        }

      });



      if (notifications.length) {

        await LocalNotifications.schedule({ notifications });

      }

      return;

    }



    if (this._webReminderTimer) clearInterval(this._webReminderTimer);

    this._webReminderTimer = setInterval(() => this.checkWebReminders(), 60000);

    this.checkStockExpiryWebAlerts();

  }



  checkStockExpiryWebAlerts() {

    if (!this.remindersEnabled || !('Notification' in window) || Notification.permission !== 'granted') return;

    const today = this.todayKey();

    const alertKey = `stock-expiry-alert:${today}`;

    if (sessionStorage.getItem(alertKey)) return;



    const messages = [];

    this.medicines.forEach((med) => {

      if (this.isPaused(med)) return;

      if (med.pillCount != null && med.refillAt != null && med.pillCount <= med.refillAt) {

        messages.push(`Low stock: ${med.name} (${med.pillCount} left)`);

      }

      if (med.expiryDate && med.expiryDate <= today) {

        messages.push(`Expired: ${med.name}`);

      } else if (med.expiryDate) {

        const in7 = new Date();

        in7.setDate(in7.getDate() + 7);

        if (med.expiryDate <= this.todayKey(in7)) {

          messages.push(`Expiring soon: ${med.name}`);

        }

      }

    });



    if (messages.length) {

      new Notification('Medicine alerts', { body: messages.join('; ') });

      sessionStorage.setItem(alertKey, '1');

    }

  }



  checkWebReminders() {

    if (!this.remindersEnabled || !('Notification' in window) || Notification.permission !== 'granted') {

      return;

    }

    const now = new Date();

    const today = this.todayKey();

    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;



    this.medicines.forEach((medicine) => {

      if (this.isPaused(medicine) || this.isPrn(medicine)) return;

      if (!this.isScheduledOnDate(medicine, today)) return;



      this.getSchedule(medicine).forEach((time, slot) => {

        if (time !== currentTime || this.isDoseResolved(medicine, today, slot)) return;

        const notifyKey = `notified:${medicine.id}:${today}:${slot}`;

        if (sessionStorage.getItem(notifyKey)) return;

        new Notification('Medicine reminder', {

          body: `Time for ${medicine.name} (${medicine.dosage}) at ${time}`

        });

        sessionStorage.setItem(notifyKey, '1');

      });

    });



    this.checkStockExpiryWebAlerts();

  }

}



let tracker;

document.addEventListener('DOMContentLoaded', async () => {

  tracker = await MedicineTracker.create();

  window.tracker = tracker;

});

