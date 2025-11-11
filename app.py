#!/usr/bin/env python3
"""
Flask web server for the Discogs Jukebox Label Maker.
"""

import asyncio
import re
import yaml
import os
import tempfile # Added tempfile import
from flask import Flask, render_template, session, request
from flask_socketio import SocketIO

from auto_id_core import (
    ShazamRecognizer,
    DiscogsAPI,
)

app = Flask(__name__)
app.config["SECRET_KEY"] = "secret!"
socketio = SocketIO(app, async_mode="eventlet")

discogs_user_agent = "VinylSingleFinder/1.0"

recognizer = ShazamRecognizer()

api_instances = {}

@app.route("/")
def index():
    return render_template("index.html")

@socketio.on("connect")
def handle_connect():
    print(f"Client connected: {request.sid}")

@socketio.on("disconnect")
def handle_disconnect():
    print(f"Client disconnected: {request.sid}")
    if request.sid in api_instances:
        del api_instances[request.sid]

@socketio.on("set_credentials")
def set_credentials(data):
    """Sets the Discogs API credentials for the current session."""
    token = data.get("token")
    country = data.get("country", "US")
    sid = request.sid

    if not token:
        socketio.emit("error", {"message": "Discogs token is required."}, to=sid)
        return

    discogs_api = DiscogsAPI(discogs_user_agent, token, country)
    if discogs_api.username:
        api_instances[sid] = discogs_api
        socketio.emit("credentials_set", to=sid)
    else:
        socketio.emit("error", {"message": "Invalid Discogs token or user agent."}, to=sid)


@socketio.on("set_folder")
def handle_set_folder(folder_name):
    sid = request.sid
    if sid not in api_instances:
        socketio.emit("error", {"message": "Credentials not set."}, to=sid)
        return
    discogs_api = api_instances[sid]
    folder = discogs_api.get_or_create_folder(folder_name)
    if folder:
        socketio.emit("folder_set", {"folder_name": folder["name"], "folder_id": folder["id"]}, to=sid)
    else:
        socketio.emit("error", {"message": "Could not set folder."}, to=sid)

def do_search(sid, title, artist):
    """Helper function to run in a background task."""
    discogs_api = api_instances.get(sid)
    if not discogs_api:
        socketio.emit("error", {"message": "Credentials not set."}, to=sid)
        return

    if not title or not artist:
        socketio.emit("error", {"message": "Title and artist are required for search."}, to=sid)
        return

    socketio.emit("status", {"message": f"Searching for {title} by {artist}..."}, to=sid)
    releases = discogs_api.search_releases(title, artist)
    socketio.emit("search_results", {"releases": releases}, to=sid)

def do_shazam_and_search(sid, audio_data):
    """Runs the entire shazam and search process in a background thread."""
    audio_file_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".webm") as temp_audio_file:
            temp_audio_file.write(audio_data)
            audio_file_path = temp_audio_file.name

        socketio.emit("status", {"message": "Identifying..."}, to=sid)
        
        # Since this is a new thread, we can create a new event loop with asyncio.run()
        result = asyncio.run(recognizer.recognize(audio_file_path))

        if result.get("status", {}).get("msg") == "Success":
            metadata = result["metadata"]["music"][0]
            raw_title = metadata["title"]
            clean_title = re.sub(r"\s*\(.*?\)", "", raw_title)
            clean_title = re.sub(r"\s*\[.*?\]", "", clean_title)
            title = clean_title.strip()
            artist = metadata["artists"][0]["name"]
            
            socketio.emit("shazam_result", {"title": title, "artist": artist}, to=sid)
            # Call the module-level do_search
            do_search(sid, title, artist)
        else:
            socketio.emit("error", {"message": f"Could not identify song: {result.get('status', {}).get('msg')}"}, to=sid)
    finally:
        if audio_file_path and os.path.exists(audio_file_path):
            os.remove(audio_file_path)

@socketio.on("identify")
def handle_identify(audio_data):
    sid = request.sid
    # Start the entire process in a background task to keep the main thread non-blocking
    socketio.start_background_task(do_shazam_and_search, sid, audio_data)


@socketio.on("search")
def handle_search(data):
    sid = request.sid
    title = data.get("title")
    artist = data.get("artist")
    socketio.start_background_task(do_search, sid, title, artist)

@socketio.on("add_release")
def handle_add_release(data):
    sid = request.sid
    if sid not in api_instances:
        socketio.emit("error", {"message": "Credentials not set."}, to=sid)
        return
    discogs_api = api_instances[sid]
    folder_id = data["folder_id"]
    release_id = data["release_id"]
    slot = data["slot"]

    if discogs_api.add_release_to_folder(folder_id, release_id, slot):
        socketio.emit("release_added", {"release_id": release_id}, to=sid)
    else:
        socketio.emit("error", {"message": "Could not add release."}, to=sid)

if __name__ == "__main__":
    #socketio.run(app, debug=True, host="0.0.0.0", port=5000, ssl_context=('cert.pem', 'key.pem'))
    socketio.run(app, debug=True, host="0.0.0.0", port=8080)
