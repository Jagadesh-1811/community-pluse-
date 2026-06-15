FROM python:3.12-slim

WORKDIR /opt/render/project/src

COPY backend/requirements.txt ./backend/
RUN pip install --no-cache-dir -r ./backend/requirements.txt

COPY backend/ ./backend/

WORKDIR /opt/render/project/src/backend

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
