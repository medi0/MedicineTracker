class MedicineTracker {
    constructor() {
        this.medicines = [];
        this.nextId = 1;
        this.init();
    }
    
    init() {
        this.bindEvents();
        console.log('Medicine Tracker initialized');
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
        console.log('Medicine added:', medicine);
    }
    
    removeMedicine(id) {
        this.medicines = this.medicines.filter(med => med.id !== id);
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
                <button class="delete-btn" onclick="tracker.removeMedicine(${medicine.id})">Remove</button>
            </div>
        `;
        return div;
    }
}

// Initialize tracker when page loads
let tracker;
document.addEventListener('DOMContentLoaded', function() {
    tracker = new MedicineTracker();
});