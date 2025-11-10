# Use a base image that supports package management (e.g., Debian-based)
FROM ubuntu:24.04

# Install FFmpeg, Python, and its dependencies
RUN apt-get update && apt-get install -y ffmpeg python3 python3-pip python3-venv && rm -rf /var/lib/apt/lists/*

# Set the working directory
WORKDIR /app

RUN python3 -m venv /opt/venv
ENV VIRTUAL_ENV=/opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements.txt and install dependencies
COPY requirements.txt .
RUN pip3 install -r requirements.txt

# Copy the Flask application code
COPY . .

# Expose the port your Flask app listens on (default for Flask is 8080)
EXPOSE 8080

# Define the command to run your Flask application
CMD ["python3", "app.py"]
