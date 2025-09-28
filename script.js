class MedicineTracker {
    constructor() {
        this.medicines = [];
        this.nextId = 1;
        this.loadFromStorage();
        this.init();
    }
    saveToStorage() {
    try {
        localStorage.setItem('medicines', JSON.stringify(this.medicines));
        localStorage.setItem('nextId', this.nextId.toString());
        console.log('Data saved to storage');
    } catch (error) {
        console.error('Error saving to storage:', error);
    }
}

loadFromStorage() {
    try {
        const savedMedicines = localStorage.getItem('medicines');
        const savedNextId = localStorage.getItem('nextId');
        
        if (savedMedicines) {
            this.medicines = JSON.parse(savedMedicines);
        }
        
        if (savedNextId) {
            this.nextId = parseInt(savedNextId);
        }
        
        console.log('Data loaded from storage');
    } catch (error) {
        console.error('Error loading from storage:', error);
        this.medicines = [];
        this.nextId = 1;
    }
}

    init() {
        this.bindEvents();
        this.renderMedicines();
        this.createManagementButtons();
         // render saved medicines
        console.log('Medicine Tracker initialized');
    }
    
    createManagementButtons() {
        const container = document.querySelector('.medicine-list');
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'management-buttons';
        buttonContainer.innerHTML = `
            <button onclick="tracker.exportData()" class="export-btn">Export Data</button>
            <button onclick="tracker.clearAllData()" class="clear-btn">Clear All</button>
        `;
        container.appendChild(buttonContainer);
    }

    bindEvents() {
        const form = document.getElementById('medicine-form');
        form.addEventListener('submit', (e) => this.handleSubmit(e));
    }
    
    handleSubmit(e) {
        e.preventDefault();
        
        const formData = new FormData(e.target);
        const medicine = {
            id: this.nextId++,
            name: document.getElementById('medicine-name').value.trim(),
            dosage: document.getElementById('dosage').value.trim(),
            frequency: document.getElementById('frequency').value,
            dateAdded: new Date().toISOString(),
            taken: []
        };
        
        if (this.validateMedicine(medicine)) {
            this.addMedicine(medicine);
            this.renderMedicines();
            e.target.reset();
        }
    }
    
    validateMedicine(medicine) {
        if (!medicine.name || !medicine.dosage || !medicine.frequency) {
            alert('Please fill in all fields');
            return false;
        }
        return true;
    }
    
    addMedicine(medicine) {
        this.medicines.push(medicine);
        this.saveToStorage();
        console.log('Medicine added:', medicine);
    }
    
    removeMedicine(id) {
        this.medicines = this.medicines.filter(med => med.id !== id);
        this.saveToStorage();
        this.renderMedicines();
    }
    
    renderMedicines() {
        const container = document.getElementById('medicines-container');
        container.innerHTML = '';
        
        this.medicines.forEach(medicine => {
            const medicineElement = this.createMedicineElement(medicine);
            container.appendChild(medicineElement);
        });
    }
    
    createMedicineElement(medicine) {
        const div = document.createElement('div');
        div.className = 'medicine-item';
        div.innerHTML = `
            <div class="medicine-info">
                <h3>${medicine.name}</h3>
                <p><strong>Dosage:</strong> ${medicine.dosage}</p>
                <p><strong>Frequency:</strong> ${medicine.frequency}</p>
                <p><small>Added: ${new Date(medicine.dateAdded).toLocaleDateString()}</small></p>
            </div>
            <div class="medicine-actions">
                <button class="edit-btn" onclick="tracker.editMedicine(${medicine.id})">Edit</button>
                <button class="delete-btn" onclick="tracker.removeMedicine(${medicine.id})">Remove</button>
            </div>
        `;
        return div;
    }
    editMedicine(id) {
        const medicine = this.medicines.find(med => med.id === id);
        if (medicine) {
            document.getElementById('medicine-name').value = medicine.name;
            document.getElementById('dosage').value = medicine.dosage;
            document.getElementById('frequency').value = medicine.frequency;
            this.removeMedicine(id);
        }
        //remove the medicine
        this.removeMedicine(id);
        //focus on name field
        document.getElementById('medicine-name').focus();
    }
    exportData() {
        const data={
            medicines: this.medicines,
            exportDate: new Date().toISOString(),
            version: '1.0'
        };
        const dataStr = JSON.stringify(data,null,2);
        const dataBlob = new Blob([dataStr],{type:'application/json'});
        const link = document.createElement('a');
        link.href = URL.createObjectURL(dataBlob);
        link.download = `medicine-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
    }
    clearAllData() {
        if(confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            this.medicines = [];
            this.nextId = 1;
            this.saveToStorage();
            this.renderMedicines();
            alert('All data cleared');
        }
    }
}

// Initialize tracker when page loads
let tracker;
document.addEventListener('DOMContentLoaded', function() {
    tracker = new MedicineTracker();
});