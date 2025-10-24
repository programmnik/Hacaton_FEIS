class OCRApplication {
    constructor() {
        this.currentFile = null;
        this.initializeElements();
        this.setupEventListeners();
        this.checkSystemStatus();
    }

    initializeElements() {
        // Основные элементы интерфейса
        this.elements = {
            uploadArea: document.getElementById('uploadArea'),
            iconField: document.getElementById('iconField'),
            fileInput: document.getElementById('fileInput'),
            fileName: document.getElementById('fileName'),
            chooseBtn: document.getElementById('chooseBtn'),
            recognizeBtn: document.getElementById('recognizeBtn'),
            resultContainer: document.getElementById('resultContainer'),
            resultText: document.getElementById('resultText'),
            fileNameDisplay: document.getElementById('fileNameDisplay'),
            copyBtn: document.getElementById('copyBtn'),
            systemStatus: document.getElementById('systemStatus')
        };
    }

    setupEventListeners() {
        // Выбор файла через кнопку
        this.elements.chooseBtn.addEventListener('click', () => {
            this.elements.fileInput.click();
        });

        // Обработка выбора файла
        this.elements.fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                this.handleFileSelect(e.target.files[0]);
            }
        });

        // Drag and Drop события
        this.elements.uploadArea.addEventListener('dragover', (e) => this.handleDragOver(e));
        this.elements.uploadArea.addEventListener('dragleave', () => this.handleDragLeave());
        this.elements.uploadArea.addEventListener('drop', (e) => this.handleDrop(e));

        // Кнопка распознавания
        this.elements.recognizeBtn.addEventListener('click', () => this.recognizeText());

        // Кнопка копирования
        this.elements.copyBtn.addEventListener('click', () => this.copyToClipboard());
    }

    handleDragOver(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.add('drag-over');
    }

    handleDragLeave() {
        this.elements.uploadArea.classList.remove('drag-over');
    }

    handleDrop(e) {
        e.preventDefault();
        this.elements.uploadArea.classList.remove('drag-over');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            this.handleFileSelect(files[0]);
        }
    }

    handleFileSelect(file) {
        if (!file) return;

        // Проверка типа файла
        const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/bmp', 'image/tiff'];
        if (!allowedTypes.includes(file.type)) {
            this.showError('Пожалуйста, выберите файл изображения (PNG, JPG, BMP, TIFF)');
            return;
        }

        // Проверка размера файла
        if (file.size > 16 * 1024 * 1024) {
            this.showError('Файл слишком большой. Максимальный размер: 16MB');
            return;
        }

        this.currentFile = file;
        this.displayFilePreview(file);
        this.updateFileInfo(file.name);
        this.enableRecognizeButton();
        this.hideResult();
    }

    displayFilePreview(file) {
        const reader = new FileReader();
        
        reader.onload = (e) => {
            // Создаем элемент изображения для превью
            const img = document.createElement('img');
            img.src = e.target.result;
            img.alt = 'Предпросмотр изображения';
            img.className = 'image-preview';
            
            // Заменяем содержимое области загрузки
            this.elements.uploadArea.innerHTML = '';
            this.elements.uploadArea.appendChild(img);
        };
        
        reader.onerror = () => {
            this.showError('Ошибка чтения файла');
        };
        
        reader.readAsDataURL(file);
    }

    updateFileInfo(filename) {
        this.elements.fileName.textContent = `Выбран файл: ${filename}`;
        this.elements.fileName.style.color = '#4CAF50';
        this.elements.fileNameDisplay.textContent = `Файл: ${filename}`;
    }

    showError(message) {
        this.elements.fileName.textContent = message;
        this.elements.fileName.style.color = '#f44336';
        this.resetFileSelection();
    }

    resetFileSelection() {
        this.currentFile = null;
        this.elements.fileInput.value = '';
        this.disableRecognizeButton();
        this.elements.fileName.textContent = '';
        this.restoreDefaultView();
    }

    restoreDefaultView() {
        this.elements.uploadArea.innerHTML = '';
        this.elements.uploadArea.appendChild(this.elements.iconField.cloneNode(true));
    }

    enableRecognizeButton() {
        this.elements.recognizeBtn.disabled = false;
        this.elements.recognizeBtn.textContent = 'Распознать текст';
    }

    disableRecognizeButton() {
        this.elements.recognizeBtn.disabled = true;
    }

    hideResult() {
        this.elements.resultText.textContent = 'Здесь появится распознанный текст...';
        this.elements.resultText.style.color = '#666';
    }

    showResult(text, filename) {
        this.elements.resultText.textContent = text;
        this.elements.resultText.style.color = '#000';
        this.elements.fileNameDisplay.textContent = `Файл: ${filename}`;
        
        // Прокрутка к результатам
        this.elements.resultContainer.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start' 
        });
    }

    async recognizeText() {
        if (!this.currentFile) {
            this.showNotification('Пожалуйста, сначала выберите файл', 'error');
            return;
        }

        // Показываем состояние загрузки
        this.setRecognizeButtonState('loading');

        try {
            const formData = new FormData();
            formData.append('file', this.currentFile);

            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            const data = await response.json();

            if (data.success) {
                this.showResult(data.recognized_text, data.filename);
                this.showNotification('Текст успешно распознан!', 'success');
            } else {
                this.showError(data.error);
                this.showNotification(`Ошибка: ${data.error}`, 'error');
            }

        } catch (error) {
            console.error('Ошибка сети:', error);
            this.showError('Ошибка сети при загрузке файла');
            this.showNotification('Ошибка сети. Проверьте подключение.', 'error');
        } finally {
            this.setRecognizeButtonState('ready');
        }
    }

    setRecognizeButtonState(state) {
        const btn = this.elements.recognizeBtn;
        
        switch (state) {
            case 'loading':
                btn.textContent = 'Обработка...';
                btn.disabled = true;
                break;
            case 'ready':
                btn.textContent = 'Распознать текст';
                btn.disabled = false;
                break;
        }
    }

    async copyToClipboard() {
        const text = this.elements.resultText.textContent;
        
        if (!text || text === 'Здесь появится распознанный текст...') {
            this.showNotification('Нет текста для копирования', 'error');
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            this.showNotification('Текст скопирован в буфер обмена!', 'success');
        } catch (err) {
            // Fallback для старых браузеров
            const textArea = document.createElement('textarea');
            textArea.value = text;
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand('copy');
            document.body.removeChild(textArea);
            
            this.showNotification('Текст скопирован!', 'success');
        }
    }

    async checkSystemStatus() {
        try {
            const response = await fetch('/model_status');
            const data = await response.json();
            
            this.elements.systemStatus.textContent = data.status;
            
            if (data.engine === 'pillow') {
                this.elements.systemStatus.className = 'status-value status-demo';
            } else {
                this.elements.systemStatus.className = 'status-value status-available';
            }
            
        } catch (error) {
            console.error('Ошибка проверки статуса:', error);
            this.elements.systemStatus.textContent = 'Ошибка проверки';
            this.elements.systemStatus.className = 'status-value status-error';
        }
    }

    showNotification(message, type) {
        // Удаляем существующие уведомления
        const existingNotifications = document.querySelectorAll('.notification');
        existingNotifications.forEach(notification => notification.remove());

        // Создаем новое уведомление
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.textContent = message;

        document.body.appendChild(notification);

        // Автоматическое удаление через 4 секунды
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 4000);
    }
}

// Инициализация приложения когда DOM загружен
document.addEventListener('DOMContentLoaded', () => {
    new OCRApplication();
    
    // Добавляем обработчик для сброса при нажатии на область загрузки
    document.getElementById('uploadArea').addEventListener('click', (e) => {
        if (e.target.classList.contains('image_field')) {
            document.getElementById('fileInput').click();
        }
    });
});