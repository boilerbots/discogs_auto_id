document.addEventListener("DOMContentLoaded", () => {
    const socket = io();

    // Cookie helper functions
    function setCookie(name, value, days) {
        let expires = "";
        if (days) {
            const date = new Date();
            date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
            expires = "; expires=" + date.toUTCString();
        }
        document.cookie = name + "=" + (value || "")  + expires + "; path=/";
    }

    function getCookie(name) {
        const nameEQ = name + "=";
        const ca = document.cookie.split(';');
        for(let i=0; i < ca.length; i++) {
            let c = ca[i];
            while (c.charAt(0) === ' ') c = c.substring(1, c.length);
            if (c.indexOf(nameEQ) === 0) return c.substring(nameEQ.length, c.length);
        }
        return null;
    }

    const credentialsContainer = document.getElementById("credentials-container");
    const mainAppContainer = document.getElementById("main-app");
    const discogsTokenInput = document.getElementById("discogs-token");
    const discogsCountryInput = document.getElementById("discogs-country");
    const setCredentialsButton = document.getElementById("set-credentials-button");

    const folderNameInput = document.getElementById("folder-name");
    const setFolderButton = document.getElementById("set-folder-button");
    const decrementSlotButton = document.getElementById("decrement-slot");
    const incrementSlotButton = document.getElementById("increment-slot");
    const slotCounterSpan = document.getElementById("slot-counter");
    const statusDiv = document.getElementById("status");
    const startButton = document.getElementById("start-identification-button");
    const resultsList = document.getElementById("results-list");

    const manualSearchContainer = document.getElementById("manual-search-container");
    const manualTitleInput = document.getElementById("manual-title");
    const manualArtistInput = document.getElementById("manual-artist");
    const manualSearchButton = document.getElementById("manual-search-button");

    let folderId = null;
    let slotCounter = 0;
    let mediaRecorder;
    let audioChunks = [];
    let stream;

    // Check for token in cookie on page load
    const savedToken = getCookie("discogs_token");
    if (savedToken) {
        discogsTokenInput.value = savedToken;
    }

    // Event Listeners
    setCredentialsButton.addEventListener("click", () => {
        const token = discogsTokenInput.value.trim();
        const country = discogsCountryInput.value.trim();
        if (token) {
            socket.emit("set_credentials", { token, country });
        }
    });

    folderNameInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            setFolderButton.click();
        }
    });

    setFolderButton.addEventListener("click", () => {
        const folderName = folderNameInput.value.trim();
        if (folderName) {
            socket.emit("set_folder", folderName);
        }
    });

    decrementSlotButton.addEventListener("click", () => {
        if (slotCounter > 0) {
            slotCounter--;
            slotCounterSpan.textContent = slotCounter;
        }
    });

    incrementSlotButton.addEventListener("click", () => {
        slotCounter++;
        slotCounterSpan.textContent = slotCounter;
    });

    startButton.addEventListener("click", async () => {
        startButton.disabled = true;
        resultsList.innerHTML = "";
        manualSearchContainer.style.display = "none";

        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);

            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };

            mediaRecorder.onstop = () => {
                const audioBlob = new Blob(audioChunks, { type: "audio/webm;codecs=opus" });
                socket.emit("identify", audioBlob);
                audioChunks = [];
                statusDiv.textContent = "Processing audio...";
                stream.getTracks().forEach(track => track.stop());
            };

            mediaRecorder.start();
            statusDiv.textContent = "Recording for 10 seconds...";

            setTimeout(() => {
                if (mediaRecorder.state === "recording") {
                    mediaRecorder.stop();
                }
            }, 10000);

        } catch (err) {
            statusDiv.textContent = "Error accessing microphone.";
            console.error("Error accessing microphone:", err);
            if (stream) {
                stream.getTracks().forEach(track => track.stop());
            }
            startButton.disabled = false;
        }
    });

    manualSearchButton.addEventListener("click", () => {
        const title = manualTitleInput.value.trim();
        const artist = manualArtistInput.value.trim();
        if (title && artist) {
            resultsList.innerHTML = "";
            statusDiv.textContent = "Searching...";
            socket.emit("search", { title, artist });
        }
    });

    // Socket.IO Handlers
    socket.on("connect", () => {
        console.log("Connected to server");
    });

    socket.on("credentials_set", () => {
        const token = discogsTokenInput.value.trim();
        setCookie("discogs_token", token, 365); // Save token to cookie for 1 year
        credentialsContainer.style.display = "none";
        mainAppContainer.style.display = "block";
    });

    socket.on("folder_set", (data) => {
        folderId = data.folder_id;
        folderNameInput.disabled = true;
        setFolderButton.disabled = true;
        startButton.disabled = false;
        statusDiv.textContent = `Using folder '${data.folder_name}'.`;
    });

    socket.on("status", (data) => {
        statusDiv.textContent = data.message;
    });

    socket.on("shazam_result", (data) => {
        manualTitleInput.value = data.title;
        manualArtistInput.value = data.artist;
        manualSearchContainer.style.display = "block";
    });

    socket.on("search_results", (data) => {
        resultsList.innerHTML = "";
        if (data.releases && data.releases.length > 0) {
            statusDiv.textContent = `Found ${data.releases.length} releases.`;
            data.releases.forEach(release => {
                const li = document.createElement("li");
                li.innerHTML = `
                    <span>${release.title} (${release.country} - ${release.year})</span>
                    <button class="add-release-button" data-release-id="${release.id}">Add</button>
                `;
                resultsList.appendChild(li);
            });

            document.querySelectorAll(".add-release-button").forEach(button => {
                button.addEventListener("click", (event) => {
                    const releaseId = event.target.getAttribute("data-release-id");
                    socket.emit("add_release", { 
                        folder_id: folderId, 
                        release_id: releaseId, 
                        slot: slotCounter 
                    });
                });
            });
        }/* else {
            resultsList.innerHTML = "<li>No results found.</li>";
            statusDiv.textContent = "No matching releases found.";
        }*/
        startButton.disabled = false;
    });

    socket.on("release_added", (data) => {
        const addedButton = document.querySelector(`.add-release-button[data-release-id="${data.release_id}"]`);
        if (addedButton) {
            addedButton.textContent = "Added";
            addedButton.disabled = true;
        }
        slotCounter++;
        slotCounterSpan.textContent = slotCounter;
        statusDiv.textContent = `Release added to folder.`;
    });

    socket.on("error", (data) => {
        statusDiv.textContent = `Error: ${data.message}`;
        startButton.disabled = false;
    });
});
