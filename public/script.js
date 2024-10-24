// State
let courses = [];
let isRecording = false;
let mediaRecorder;
let audioChunks = [];
let recordingStartTime;

// DOM Elements
const courseList = document.getElementById('course-list');
const addCourseButton = document.getElementById('add-course');
const darkModeToggle = document.getElementById('dark-mode-toggle');

// Event Listeners
document.addEventListener('DOMContentLoaded', initializeApp);
addCourseButton.addEventListener('click', () => showOverlay(createAddCourseForm()));
darkModeToggle.addEventListener('click', toggleDarkMode);

// Initialization
async function initializeApp() {
    await fetchCourses();
    updateLists();
    initializeDarkMode();
}

// API Calls
async function fetchCourses() {
    const response = await fetch('/api/courses');
    courses = await response.json();
    await fetchUnitsAndLectures();
}

async function fetchUnitsAndLectures() {
    for (const course of courses) {
        const unitsResponse = await fetch(`/api/units/${course.id}`);
        course.units = await unitsResponse.json();
        for (const unit of course.units) {
            const lecturesResponse = await fetch(`/api/lectures/${unit.id}`);
            unit.lectures = await lecturesResponse.json();
            for (const lecture of unit.lectures) {
                if (lecture.aiSummary) {
                    lecture.aiSummary = lecture.aiSummary;
                }
            }
        }
    }
}

async function addCourse(name, description) {
    const response = await fetch('/api/courses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
    });
    const newCourse = await response.json();
    courses.push({ ...newCourse, units: [] });
    updateLists();
}

async function addUnit(courseId, name, description) {
    const response = await fetch('/api/units', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description, courseId }),
    });
    const newUnit = await response.json();
    const course = courses.find(c => c.id === courseId);
    if (course) {
        course.units.push({ ...newUnit, lectures: [] });
        updateLists();
    }
}

async function addLecture(courseId, unitId, name) {
    const response = await fetch('/api/lectures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, unitId }),
    });
    const newLecture = await response.json();
    const course = courses.find(c => c.id === courseId);
    if (course) {
        const unit = course.units.find(u => u.id === unitId);
        if (unit) {
            unit.lectures.push(newLecture);
            updateLists();
        }
    }
}

async function deleteAudio(lectureId) {
    await fetch(`/api/lectures/${lectureId}/audio`, { method: "DELETE" });
    const lecture = findLecture(lectureId);
    if (lecture) {
        if (lecture.audio) {
            lecture.audio.pause();
            lecture.audio = null;
        }
        lecture.audioUrl = null;
        updateLists();
    }
}

// UI Updates
function updateLists() {
    courseList.innerHTML = courses.map(createCourseHTML).join('');
    attachGenerateSummaryListeners();
}

function createCourseHTML(course) {
    
    return `
        <li class="course-item">
            <div class="course-header" onclick="toggleCollapse(this.parentElement)">
                <span>${course.name}</span>
                <span class="description">${course.description || ''}</span>
            </div>
            <div class="course-content">
                <button onclick="showOverlay(createAddUnitForm(${course.id}))" class="add-button">
                    <i class="fas fa-plus"></i> Add Unit
                </button>
                <ul class="unit-list">
                    ${course.units.map(unit => createUnitHTML(course.id, unit)).join('')}
                </ul>
            </div>
        </li>
    `;
}

function createUnitHTML(courseId, unit) {
    return `
        <li class="unit-item">
            <div class="unit-header" onclick="toggleCollapse(this.parentElement)">
                <span>${unit.name}</span>
                <span class="description">${unit.description || ''}</span>
            </div>
            <div class="unit-content">
                <button onclick="showOverlay(createAddLectureForm(${courseId}, ${unit.id}))" class="add-button">
                    <i class="fas fa-plus"></i> Add Lecture
                </button>
                <ul class="lecture-list">
                    ${unit.lectures.map(lecture => createLectureHTML(courseId, unit.id, lecture)).join('')}
                </ul>
            </div>
        </li>
    `;
}

function createLectureHTML(courseId, unitId, lecture) {
    return `
      <li class="lecture-item" data-lecture-id="${lecture.id}">
        <span>${lecture.name}</span>
        <button onclick="deleteLecture(${courseId}, ${unitId}, ${lecture.id}, event)" class="delete-button">
            DELETE
        </button>
        <div class="audio-controls">
          ${lecture.audioUrl 
            ? createAudioControlsHTML(lecture.id, lecture.audioUrl) 
            : createRecordButtonHTML(lecture.id)}
        </div>
        <div class="transcript-box ${lecture.transcript ? '' : 'no-transcript'}">
          <div class="transcript-header" onclick="toggleTranscript(this)">
            Transcript
            <span class="toggle-icon">▼</span>
          </div>
          <div class="transcript-content">
            ${lecture.transcript ? lecture.transcript : 'Transcript not available yet.'}
          </div>
        </div>
        <div class="ai-summary-box">
  <div class="ai-summary-header" onclick="toggleAISummary(this)">
    AI Summary
    <span class="toggle-icon">▼</span>
  </div>
  <div class="ai-summary-content">
    <div class="ai-summary-text">${lecture.ai_summary ? marked.parse(lecture.ai_summary) : 'AI summary not available yet.'}</div>
    ${!lecture.ai_summary ? `<button onclick="generateAISummary(${lecture.id})" class="generate-summary-button">Generate Summary</button>` : ''}
  </div>
</div>
        <div class="notes-box">
          <div class="notes-header" onclick="toggleNotes(this)">
            Notes
            <span class="toggle-icon">▼</span>
          </div>
          <div class="notes-content">
            <div class="notes-toolbar">
              <button onclick="formatText('bold', ${lecture.id})"><i class="fas fa-bold"></i></button>
              <button onclick="formatText('italic', ${lecture.id})"><i class="fas fa-italic"></i></button>
              <button onclick="formatText('underline', ${lecture.id})"><i class="fas fa-underline"></i></button>
              <button onclick="formatText('strikethrough', ${lecture.id})"><i class="fas fa-strikethrough"></i></button>
              <button onclick="formatText('orderedList', ${lecture.id})"><i class="fas fa-list-ol"></i></button>
              <button onclick="formatText('unorderedList', ${lecture.id})"><i class="fas fa-list-ul"></i></button>
            </div>
            <div class="notes-edit" contenteditable="true" oninput="updateNotes(${lecture.id}, this)" onkeydown="handleTab(event)">${lecture.notes || ''}</div>
          </div>
        </div>
      </li>
    `;
}
async function deleteCourse(courseId, event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this course?')) {
        try {
            const response = await fetch(`/api/courses/${courseId}`, { method: 'DELETE' });
            if (response.ok) {
                courses = courses.filter(course => course.id !== courseId);
                updateLists();
            } else {
                console.error('Failed to delete course');
            }
        } catch (error) {
            console.error('Error deleting course:', error);
        }
    }
}

async function deleteUnit(courseId, unitId, event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this unit?')) {
        try {
            const response = await fetch(`/api/units/${unitId}`, { method: 'DELETE' });
            if (response.ok) {
                const course = courses.find(c => c.id === courseId);
                if (course) {
                    course.units = course.units.filter(unit => unit.id !== unitId);
                    updateLists();
                }
            } else {
                console.error('Failed to delete unit');
            }
        } catch (error) {
            console.error('Error deleting unit:', error);
        }
    }
}

function toggleAISummary(header) {
    const box = header.closest('.ai-summary-box');
    box.classList.toggle('expanded');
    const icon = header.querySelector('.toggle-icon');
    icon.textContent = box.classList.contains('expanded') ? '▲' : '▼';
}

async function generateAISummary(lectureId) {
    console.log('generateAISummary called for lecture:', lectureId);
    const lecture = findLecture(lectureId);

    const summaryBox = document.querySelector(`.lecture-item[data-lecture-id="${lectureId}"] .ai-summary-box`);
    if (!summaryBox) {
        console.error('Summary box not found for lecture:', lectureId);
        return;
    }

    const summaryText = summaryBox.querySelector('.ai-summary-text');
    const generateButton = summaryBox.querySelector('.generate-summary-button');

    generateButton.disabled = true;
    generateButton.textContent = 'Generating...';
    summaryText.textContent = 'Generating AI summary...';

    try {
        const response = await fetch('/api/lectures/summarize', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ transcript: lecture.transcript }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        console.log('Received summary from server:', data);

        if (!data.summary) {
            throw new Error('No summary received from server');
        }

        summaryText.textContent = data.summary;
        summaryText.style.paddingLeft = '15px';

        // Save the summary to the lecture object and database
        lecture.aiSummary = data.summary;
        await saveLectureSummary(lectureId, data.summary);

        // Remove the generate button
        generateButton.remove();

        // Update the UI
        updateLists();
    } catch (error) {
        console.error('Error generating AI summary:', error);
        summaryText.textContent = `Failed to generate AI summary: ${error.message}. Please try again.`;
        generateButton.disabled = false;
        generateButton.textContent = 'Generate Summary';
    }
}

async function saveLectureSummary(lectureId, summary) {
    try {
        const response = await fetch(`/api/lectures/${lectureId}/summary`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ summary }),
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        console.log('Summary saved successfully:', result);
    } catch (error) {
        console.error('Error saving AI summary:', error);
        throw error;
    }
}

async function deleteLecture(courseId, unitId, lectureId, event) {
    event.stopPropagation();
    if (confirm('Are you sure you want to delete this lecture?')) {
        try {
            const response = await fetch(`/api/lectures/${lectureId}`, { method: 'DELETE' });
            if (response.ok) {
                const course = courses.find(c => c.id === courseId);
                if (course) {
                    const unit = course.units.find(u => u.id === unitId);
                    if (unit) {
                        unit.lectures = unit.lectures.filter(lecture => lecture.id !== lectureId);
                        updateLists();
                    }
                }
            } else {
                console.error('Failed to delete lecture');
            }
        } catch (error) {
            console.error('Error deleting lecture:', error);
        }
    }
}

function createAudioControlsHTML(lectureId, audioUrl) {
    return `
        <audio controls>
            <source src="${audioUrl}" type="audio/mpeg">
            Your browser does not support the audio element.
        </audio>
        <button class="delete" onclick="deleteAudio(${lectureId})">Delete</button>
    `;
}

function createRecordButtonHTML(lectureId) {
    return `
        <button class="record" onclick="toggleRecording(${lectureId})">Record</button>
        <span class="recording-duration" style="display: none;">00:00</span>
        <span class="recording-indicator" style="display: none;">Recording...</span>
    `;
}


// Overlay Functions
function showOverlay(content) {
    const overlay = document.createElement('div');
    overlay.className = 'overlay';
    overlay.innerHTML = `<div class="overlay-content">${content}</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => overlay.classList.add('open'), 10);
}

function closeOverlay() {
    const overlay = document.querySelector('.overlay');
    if (overlay) {
        overlay.classList.remove('open');
        overlay.addEventListener('transitionend', () => overlay.remove(), { once: true });
    }
}

function createAddCourseForm() {
    return `
        <h2>Add New Course</h2>
        <input type="text" id="new-course-name" placeholder="Course name">
        <input type="text" id="new-course-description" placeholder="Course description">
        <div class="form-buttons">
            <button onclick="handleAddCourse()" class="add-button"><i class="fas fa-plus"></i> Add Course</button>
            <button onclick="closeOverlay()" class="cancel-button"><i class="fas fa-times"></i> Cancel</button>
        </div>
    `;
}

function createAddUnitForm(courseId) {
    return `
        <h2>Add New Unit</h2>
        <input type="text" id="new-unit-name" placeholder="Unit name">
        <input type="text" id="new-unit-description" placeholder="Unit description">
        <div class="form-buttons">
            <button onclick="handleAddUnit(${courseId})" class="add-button"><i class="fas fa-plus"></i> Add Unit</button>
            <button onclick="closeOverlay()" class="cancel-button"><i class="fas fa-times"></i> Cancel</button>
        </div>
    `;
}

function createAddLectureForm(courseId, unitId) {
    return `
        <h2>Add New Lecture</h2>
        <input type="text" id="new-lecture-name" placeholder="Lecture name">
        <div class="form-buttons">
            <button onclick="handleAddLecture(${courseId}, ${unitId})" class="add-button"><i class="fas fa-plus"></i> Add Lecture</button>
            <button onclick="closeOverlay()" class="cancel-button"><i class="fas fa-times"></i> Cancel</button>
        </div>
    `;
}

// Event Handlers
function handleAddCourse() {
    const name = document.getElementById('new-course-name').value.trim();
    const description = document.getElementById('new-course-description').value.trim();
    if (name) {
        addCourse(name, description);
        closeOverlay();
    }
}

function handleAddUnit(courseId) {
    const name = document.getElementById('new-unit-name').value.trim();
    const description = document.getElementById('new-unit-description').value.trim();
    if (name) {
        addUnit(courseId, name, description);
        closeOverlay();
    }
}

function handleAddLecture(courseId, unitId) {
    const name = document.getElementById('new-lecture-name').value.trim();
    if (name) {
        addLecture(courseId, unitId, name);
        closeOverlay();
    }
}

function attachGenerateSummaryListeners() {
    const generateButtons = document.querySelectorAll('.generate-summary-button');
    generateButtons.forEach(button => {
        button.addEventListener('click', function() {
            const lectureId = this.getAttribute('data-lecture-id');
            console.log('Generate Summary button clicked for lecture:', lectureId);
            generateAISummary(parseInt(lectureId));
        });
    });
}

function toggleCollapse(element) {
    element.classList.toggle('collapsed');
    const content = element.querySelector('.course-content, .unit-content');
    if (element.classList.contains('collapsed')) {
        content.style.maxHeight = '0';
    } else {
        content.style.maxHeight = 'none'; // Change this line
    }
}

// Audio Recording Functions
function toggleRecording(lectureId) {
    isRecording ? stopRecording(lectureId) : startRecording(lectureId);
}

async function startRecording(lectureId) {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.start();
        isRecording = true;
        recordingStartTime = Date.now();

        mediaRecorder.addEventListener("dataavailable", event => audioChunks.push(event.data));
        mediaRecorder.addEventListener("stop", () => handleRecordingStop(lectureId));

        updateRecordingUI(lectureId, true);
        startRecordingTimer(lectureId);
    } catch (error) {
        console.error('Error starting recording:', error);
    }
}

function stopRecording(lectureId) {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
        isRecording = false;
        updateRecordingUI(lectureId, false);
    }
}

async function handleRecordingStop(lectureId) {
    console.log('Handling recording stop for lecture:', lectureId);
    console.log('Audio chunks:', audioChunks.length);
    
    const audioBlob = new Blob(audioChunks, { type: "audio/mpeg-3" });
    console.log('Audio blob size:', audioBlob.size);
    
    const formData = new FormData();
    formData.append("audio", audioBlob, "recording.mp3");

    try {
        console.log('Sending audio to server...');
        const response = await fetch(`/api/lectures/${lectureId}/audio`, {
            method: "POST",
            body: formData
        });
        console.log('Server response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('Server response data:', data);
        
        const lecture = findLecture(lectureId);
        if (lecture) {
            lecture.audioUrl = data.audioUrl;
            updateLists();
            queueTranscription(lectureId);
        }
    } catch (error) {
        console.error('Error uploading audio:', error);
    }
    
    audioChunks = [];
}

async function queueTranscription(lectureId) {
    try {
      const response = await fetch(`/api/lectures/${lectureId}/transcribe`, {
        method: 'POST',
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      console.log('Transcription completed:', data.transcription);
      
      // Update the lecture object with the new transcription
      const lecture = findLecture(lectureId);
      if (lecture) {
        lecture.transcript = data.transcription;
        updateLists();
      }
    } catch (error) {
      console.error('Error queuing transcription:', error);
    }
  }

function updateRecordingUI(lectureId, isRecording) {
    const lectureItem = document.querySelector(`.lecture-item:has(button[onclick="toggleRecording(${lectureId})"])`);
    if (lectureItem) {
        const recordButton = lectureItem.querySelector('.record');
        const recordingIndicator = lectureItem.querySelector('.recording-indicator');
        const recordingDuration = lectureItem.querySelector('.recording-duration');

        recordButton.textContent = isRecording ? "Stop" : "Record";
        recordingIndicator.style.display = isRecording ? "inline" : "none";
        recordingDuration.style.display = isRecording ? "inline" : "none";
        if (!isRecording) {
            recordingDuration.textContent = "00:00";
        }
    }
}

// Audio Playback Functions
function togglePlayPause(lectureId) {
    const lecture = findLecture(lectureId);
    if (!lecture) return;

    const playPauseButton = event.target;
    const durationElement = playPauseButton.nextElementSibling;
    const waveformCanvas = durationElement.nextElementSibling;

    if (!lecture.audio) {
        lecture.audio = new Audio(lecture.audioUrl);
        lecture.audio.addEventListener('ended', () => {
            playPauseButton.textContent = 'Play';
            updateDurationDisplay(lecture.audio, durationElement);
        });
        lecture.audio.addEventListener('loadedmetadata', () => {
            updateDurationDisplay(lecture.audio, durationElement);
            initializeWaveform(lecture.audio, waveformCanvas);
        });
        lecture.audio.addEventListener('timeupdate', () => {
            updateDurationDisplay(lecture.audio, durationElement);
            updateWaveform(lecture.audio, waveformCanvas);
        });
    }

    if (lecture.audio.paused) {
        lecture.audio.play()
            .then(() => playPauseButton.textContent = 'Pause')
            .catch(error => console.error('Error playing audio:', error));
    } else {
        lecture.audio.pause();
        playPauseButton.textContent = 'Play';
    }
}

function formatDuration(seconds) {
    const minutes = Math.floor(seconds / 60).toString().padStart(2, '0');
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${minutes}:${remainingSeconds}`;
}


function updateAudioProgress(lecture, timelineInput) {
    const progress = (lecture.audio.currentTime / lecture.audio.duration) * 100;
    timelineInput.value = progress;
}

function seekAudio(lectureId, value) {
    const lecture = findLecture(lectureId);
    if (lecture && lecture.audio) {
        const seekTime = (value / 100) * lecture.audio.duration;
        lecture.audio.currentTime = seekTime;
    }
}

// Utility Functions
function findLecture(lectureId) {
    for (const course of courses) {
        for (const unit of course.units) {
            const lecture = unit.lectures.find(l => l.id === lectureId);
            if (lecture) return lecture;
        }
    }
    return null;
}

// Dark Mode
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}

function initializeDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
}

function startRecordingTimer(lectureId) {
    const durationElement = document.querySelector(`.lecture-item:has(button[onclick="toggleRecording(${lectureId})"]) .recording-duration`);
    const updateTimer = () => {
        if (isRecording) {
            const duration = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(duration / 60).toString().padStart(2, '0');
            const seconds = (duration % 60).toString().padStart(2, '0');
            durationElement.textContent = `${minutes}:${seconds}`;
            requestAnimationFrame(updateTimer);
        }
    };
    updateTimer();
}

function updateDurationDisplay(audio, durationElement) {
    const currentTime = formatDuration(audio.currentTime);
    const totalDuration = formatDuration(audio.duration);
    durationElement.textContent = `${currentTime} / ${totalDuration}`;
}

function initializeWaveform(audio, canvas) {
    const context = new AudioContext();
    const source = context.createMediaElementSource(audio);
    const analyser = context.createAnalyser();
    source.connect(analyser);
    analyser.connect(context.destination);

    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const canvasCtx = canvas.getContext('2d');
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);

    function draw() {
        requestAnimationFrame(draw);
        analyser.getByteFrequencyData(dataArray);

        canvasCtx.fillStyle = 'rgb(200, 200, 200)';
        canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

        const barWidth = (canvas.width / bufferLength) * 2.5;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
            const barHeight = dataArray[i] / 2;
            canvasCtx.fillStyle = `rgb(50, 50, ${barHeight + 100})`;
            canvasCtx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
            x += barWidth + 1;
        }
    }

    draw();
}

function updateWaveform(audio, canvas) {
    // This function is called on each timeupdate event
    // The waveform is already being updated in real-time by the draw function in initializeWaveform
    // So we don't need to do anything here
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
    updateDarkModeIcon();
}

function updateDarkModeIcon() {
    const darkModeToggle = document.getElementById('dark-mode-toggle');
    if (document.body.classList.contains('dark-mode')) {
        darkModeToggle.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-moon">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
        `;
    } else {
        darkModeToggle.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-sun">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="3"></line>
                <line x1="12" y1="21" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="3" y2="12"></line>
                <line x1="21" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
        `;
    }
}

function initializeDarkMode() {
    if (localStorage.getItem('darkMode') === 'true') {
        document.body.classList.add('dark-mode');
    }
    updateDarkModeIcon();
}

function toggleTranscript(header) {
    const box = header.closest('.transcript-box');
    box.classList.toggle('expanded');
    const icon = header.querySelector('.toggle-icon');
    icon.textContent = box.classList.contains('expanded') ? '▲' : '▼';
}

function toggleNotes(header) {
    const box = header.closest('.notes-box');
    box.classList.toggle('expanded');
    const icon = header.querySelector('.toggle-icon');
    icon.textContent = box.classList.contains('expanded') ? '▲' : '▼';
    if (box.classList.contains('expanded')) {
        const textarea = box.querySelector('.notes-edit');
        const preview = box.querySelector('.notes-preview');
        preview.innerHTML = marked.parse(textarea.value);
        expandParentContainers(box);
    }
}

function updateNotes(lectureId, editableDiv) {
    const content = editableDiv.innerText;
    const lecture = findLecture(lectureId);
    if (lecture) {
        lecture.notes = content;
        
        // Parse the entire content as markdown
        const renderedContent = marked.parse(content);
        
        // Update the editable div with the rendered HTML
        editableDiv.innerHTML = renderedContent;

        // Restore cursor position to the end
        const range = document.createRange();
        const selection = window.getSelection();
        range.selectNodeContents(editableDiv);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        
        // Save notes to the server
        fetch(`/api/lectures/${lectureId}/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ notes: content }),
        }).catch(error => console.error('Error saving notes:', error));
    }
}

function expandParentContainers(element) {
    let parent = element.closest('.unit-item, .course-item');
    while (parent) {
        if (parent.classList.contains('collapsed')) {
            toggleCollapse(parent);
        }
        parent = parent.parentElement.closest('.unit-item, .course-item');
    }
}

function formatText(command, lectureId) {
    if (command === 'orderedList' || command === 'unorderedList') {
        document.execCommand('insertOrderedList', false, null);
        if (command === 'unorderedList') {
            const selection = window.getSelection();
            const range = selection.getRangeAt(0);
            const list = range.commonAncestorContainer.closest('ol');
            if (list) {
                const ul = document.createElement('ul');
                list.parentNode.replaceChild(ul, list);
                Array.from(list.children).forEach(li => ul.appendChild(li));
            }
        }
    } else {
        document.execCommand(command, false, null);
    }
    const notesEdit = document.querySelector(`.lecture-item:has(button[onclick*="toggleRecording(${lectureId})"]) .notes-edit`);
    updateNotes(lectureId, notesEdit);
}

function handleTab(event) {
    if (event.key === 'Tab') {
        event.preventDefault();
        document.execCommand('insertHTML', false, '&#009');
    }
}

function updateNotes(lectureId, editableDiv) {
    const content = editableDiv.innerHTML;
    const lecture = findLecture(lectureId);
    if (lecture) {
        lecture.notes = content;
        
        // Save notes to the server
        fetch(`/api/lectures/${lectureId}/notes`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ notes: content }),
        }).catch(error => console.error('Error saving notes:', error));
    }
}