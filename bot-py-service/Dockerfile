FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Install build deps for psycopg2 (binary wheels avoid needing a compiler,
# but gcc/libpq-dev are a safe fallback if a sdist is used).
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copy dependency file and install
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source
COPY . .

# Health endpoint exposed on 8082, Redis consumer + Telegram bots in-process
EXPOSE 8082
CMD ["python", "main.py"]

