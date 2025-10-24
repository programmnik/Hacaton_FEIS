#!/usr/bin/env python3
from flask import Flask, render_template, request, jsonify
from PIL import Image, ImageOps
import numpy as np
import os
import tempfile

# Импорт TensorFlow
try:
    from tensorflow.keras.models import load_model
    TF_AVAILABLE = True
    print("TensorFlow доступен")
except ImportError as e:
    print(f"TensorFlow не доступен: {e}")
    TF_AVAILABLE = False

# Пути
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FRONT_SRC_DIR = os.path.join(PROJECT_ROOT, 'Front', 'src')
MODEL_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'emnist_model.h5')

app = Flask(__name__,
            template_folder=os.path.join(FRONT_SRC_DIR, 'templates'),
            static_folder=os.path.join(FRONT_SRC_DIR, 'static'))

app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024

# Загрузка модели
model = None
if TF_AVAILABLE and os.path.exists(MODEL_PATH):
    try:
        print("Загружаем модель EMNIST...")
        model = load_model(MODEL_PATH)
        print("Модель успешно загружена!")
    except Exception as e:
        print(f"Ошибка загрузки модели: {e}")
        model = None
else:
    if not TF_AVAILABLE:
        print("TensorFlow не доступен")
    if not os.path.exists(MODEL_PATH):
        print(f"Модель не найдена по пути: {MODEL_PATH}")

# Разрешенные форматы
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'bmp', 'tiff'}

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def label_to_char(label):
    """Преобразует метку в символ (A-Z)"""
    return chr(label + 65)

def preprocess_image(image_path):
    """Предобработка изображения для модели EMNIST"""
    img = Image.open(image_path).convert("L")

    if np.mean(img) > 127:
        img = ImageOps.invert(img)

    img = img.point(lambda p: p > 128 and 255)
    return img

def segment_characters(pil_img):
    """Сегментация символов на изображении"""
    img_array = np.array(pil_img)

    from scipy.ndimage import label, find_objects

    binary = (img_array > 0).astype(np.uint8)
    labeled_array, num_features = label(binary)
    slices = find_objects(labeled_array)

    boxes = []
    for sl in slices:
        y1, y2 = sl[0].start, sl[0].stop
        x1, x2 = sl[1].start, sl[1].stop
        boxes.append((x1, y1, x2, y2))

    boxes = sorted(boxes, key=lambda b: b[0])
    return boxes

def predict_custom_array(img_array):
    """Предсказание для одного символа"""
    img = Image.fromarray(img_array)

    img.thumbnail((20, 20), Image.Resampling.LANCZOS)

    canvas = Image.new("L", (28, 28), color=0)

    left = (28 - img.width) // 2
    top = (28 - img.height) // 2
    canvas.paste(img, (left, top))

    if np.mean(canvas) > 127:
        canvas = ImageOps.invert(canvas)

    img_array = np.array(canvas).astype("float32") / 255.0
    img_input = np.expand_dims(img_array, axis=0)

    prediction = model.predict(img_input, verbose=0)
    predicted_class = np.argmax(prediction)
    return label_to_char(predicted_class)

def recognize_text(image_path):
    """Основная функция распознавания текста с добавлением пробелов"""
    if model is None:
        return "Ошибка: модель не загружена"
    
    try:
        img = preprocess_image(image_path)
        boxes = segment_characters(img)
        text = ""
        prev_x2 = None
        
        for x1, y1, x2, y2 in boxes:
            # Добавляем пробел если расстояние между символами большое
            if prev_x2 is not None and x1 - prev_x2 > 10:
                text += " "
            
            char_img = img.crop((x1, y1, x2, y2))
            char_array = np.array(char_img)
            symbol = predict_custom_array(char_array)
            text += symbol
            prev_x2 = x2
            
        return text if text else "Не удалось распознать символы"
    
    except Exception as e:
        print(f"Ошибка распознавания: {e}")
        return f"Ошибка распознавания: {str(e)}"

@app.route('/')
def home():
    return render_template('ocr.html')

@app.route('/upload', methods=['POST'])
def upload_file():
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'Файл не выбран'})
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({'success': False, 'error': 'Файл не выбран'})
        
        if file and allowed_file(file.filename):
            # Сохраняем временный файл
            with tempfile.NamedTemporaryFile(delete=False, suffix='.png') as tmp_file:
                file.save(tmp_file.name)
                temp_path = tmp_file.name
            
            try:
                # Распознаем текст с помощью модели EMNIST
                recognized_text = recognize_text(temp_path)
                
                return jsonify({
                    'success': True,
                    'recognized_text': recognized_text,
                    'filename': file.filename
                })
            finally:
                # Удаляем временный файл
                if os.path.exists(temp_path):
                    os.unlink(temp_path)
        
        return jsonify({'success': False, 'error': 'Неподдерживаемый формат файла'})
    
    except Exception as e:
        print(f"Ошибка обработки файла: {e}")
        return jsonify({'success': False, 'error': f'Ошибка обработки: {str(e)}'})

@app.route('/model_status')
def model_status():
    model_loaded = model is not None
    status = "модель загружена" if model_loaded else "модель не загружена"
    
    return jsonify({
        'loaded': model_loaded,
        'status': status,
        'tensorflow_available': TF_AVAILABLE
    })

if __name__ == '__main__':
    print("Запуск ТекстоЛов сервера...")
    print("Папка шаблонов:", app.template_folder)
    print("Папка статики:", app.static_folder)
    print("Модель:", MODEL_PATH)
    print("Сервер: http://localhost:5000")
    print("=" * 50)
    
    if model is None:
        print("ВНИМАНИЕ: Модель не загружена!")
        print("Убедитесь, что:")
        print("1. Файл emnist_model.h5 находится в папке Back")
        print("2. TensorFlow установлен корректно")
        print("3. Модель совместима с текущей версией TensorFlow")
    else:
        print("Система готова к распознаванию текста!")
    
    print("=" * 50)
    
    app.run(debug=True, host='0.0.0.0', port=5000)