FROM python:3.12-slim

WORKDIR /srv

# pandoc — для качественной конвертации формул LaTeX → OMML (родные уравнения Word);
# libreoffice-writer/-math — для серверного экспорта в PDF с формулами
# (fonts-liberation даёт метрически совместимую замену Times New Roman).
# poppler-utils (pdftoppm) — рендер первой страницы пользовательского
# титульника (PDF/DOCX) в картинку для превью и вставки в документ.
RUN apt-get update \
    && apt-get install -y --no-install-recommends pandoc libreoffice-writer libreoffice-math fonts-liberation poppler-utils \
    && rm -rf /var/lib/apt/lists/*

# Заготовка профиля LibreOffice: инициализация занимает секунды, поэтому она
# делается один раз при сборке; pdf.py копирует шаблон для каждой конвертации.
RUN libreoffice --headless --terminate_after_init -env:UserInstallation=file:///opt/lo-profile || true

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8001
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
