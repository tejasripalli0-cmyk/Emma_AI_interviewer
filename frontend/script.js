/* ═══════════════════════════════════════════════════════════
   Emma AI Interviewer — Frontend Logic
   ═══════════════════════════════════════════════════════════ */

// ── CONFIG ─────────────────────────────────────────────────
const BACKEND_BASE_URL = "https://solid-spoon-x5g9rw7v44x6hp5pp-8000.app.github.dev";   // Leave blank — uses same host automatically
const MIN_DURATION = 10 * 60;   // 10 minutes
const MAX_DURATION = 15 * 60;   // 15 minutes

const INTERVIEW_DURATION =
    Math.floor(Math.random() * (MAX_DURATION - MIN_DURATION + 1))
    + MIN_DURATION;

// ── ROLES ──────────────────────────────────────────────────
const ROLES = [
  "AI/ML Engineer",
  "Data Analyst",
  "Data Scientist",
  "Software Developer",
  "Software Engineer",
  "Python Developer",
  "DevOps Engineer",
  "Full Stack Developer",
  "Frontend Developer",
  "Backend Developer",
  "Cloud Engineer",
  "Cybersecurity Analyst"
];

// ── STATE ───────────────────────────────────────────────────
let sessionId         = "";
let initialQuestion   = "";
let currentTranscript = "";
let timerInterval     = null;
let secondsLeft       = INTERVIEW_DURATION;
let questionCount     = 0;
let interviewStarted  = false;
let recognition       = null;
let interviewEnding   = false;
let isListening        = false;
let shouldBeListening  = false;
let isSubmittingAnswer = false;   // guards against double-submit clicks

// Media stream handles — stored so we can actually stop the
// camera/screen-share when the interview ends. Previously these
// streams were requested but never saved, so there was nothing to
// call .stop() on later, which is why the webcam light stayed on.
let webcamStream = null;
let screenStream = null;

/* ══════════════════════════════════════════════════════════
   INIT
══════════════════════════════════════════════════════════ */
document.addEventListener("DOMContentLoaded", () => {
  // Start button
  document.getElementById("startBtn").addEventListener("click", startInterview);

  // Defensive bindings in case the HTML doesn't already wire these up
  // via inline onclick attributes — harmless if it does, since the
  // handlers themselves guard against duplicate/invalid calls.
  const speakBtn = document.getElementById("speakBtn");
  if (speakBtn) speakBtn.addEventListener("click", startListening);

  const submitBtn = document.getElementById("submitBtn");
  if (submitBtn) submitBtn.addEventListener("click", submitCurrentAnswer);

  // Role autocomplete
  document.getElementById("roleInput").addEventListener("input", function () {
    const val = this.value.toLowerCase().trim();
    const dd  = document.getElementById("roleDropdown");
    dd.innerHTML = "";
    if (!val) return;

    const matches = ROLES.filter(r => r.toLowerCase().includes(val));
    matches.forEach(role => {
      const div = document.createElement("div");
      div.className = "role-item";
      div.textContent = role;
      div.onclick = () => {
        document.getElementById("roleInput").value = role;
        dd.innerHTML = "";
      };
      dd.appendChild(div);
    });
  });

  // Close dropdown on outside click
  document.addEventListener("click", (e) => {
    if (!e.target.closest(".field-wrap")) {
      document.getElementById("roleDropdown").innerHTML = "";
    }
  });
});

/* ══════════════════════════════════════════════════════════
   PAGE NAVIGATION
══════════════════════════════════════════════════════════ */
function showPage(id) {
  document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

/* ══════════════════════════════════════════════════════════
   PAGE 1 — FILE UPLOAD + ROLE SELECT
══════════════════════════════════════════════════════════ */
function handleFileSelected() {
  const file = document.getElementById("resumeFile").files[0];
  if (!file) return;

  document.getElementById("uploadLabel").textContent = "Resume uploaded!";
  document.getElementById("fileName").textContent = file.name;
  document.getElementById("filePill").classList.remove("hidden");
}

async function startInterview() {
  const file = document.getElementById("resumeFile").files[0];
  const role = document.getElementById("roleInput").value.trim();

  if (!file) { showToast("Please upload your resume first."); return; }
  if (!role)  { showToast("Please select or type a target role."); return; }

  const btn = document.getElementById("startBtn");
  btn.textContent = "Connecting…";
  btn.disabled = true;

  const formData = new FormData();
  formData.append("resume", file);
  formData.append("role", role);

  try {
    const res = await fetch(`${BACKEND_BASE_URL}/start-interview`, {
        method: "POST",
        body: formData
    });

    if (!res.ok) {
        const errorText = await res.text();
        console.error("Backend Error:", errorText);
        showToast(`Backend Error (${res.status})`);
        btn.textContent = "Begin Interview";
        btn.disabled = false;
        return;
    }

    const data = await res.json();

    sessionId = data.session_id;
    initialQuestion = data.question;

    showPage("checkPage");

} catch (err) {
    console.error(err);
    showToast("Could not reach backend.");
    btn.textContent = "Begin Interview";
    btn.disabled = false;
}
}

/* ══════════════════════════════════════════════════════════
   PAGE 2 — SCREEN SHARE
══════════════════════════════════════════════════════════ */
async function startScreenShare() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

    const dot  = document.querySelector("#shareStatus .status-dot");
    const text = document.getElementById("shareStatusText");
    dot.className  = "status-dot active";
    text.textContent = "Screen sharing active ✓";

    document.getElementById("proceedBtn").classList.remove("hidden");
    document.getElementById("shareBtn").classList.add("hidden");
  } catch (err) {
    showToast("Screen share is required to continue.");
  }
}

function goToHardwarePage() {
  showPage("verificationPage");
}

/* ══════════════════════════════════════════════════════════
   PAGE 3 — HARDWARE CHECK → START
══════════════════════════════════════════════════════════ */
async function initializeLiveInterview() {

    interviewStarted = true;

    showPage("interviewPage");
    await activateWebcam();
    startTimer();

    postMessage("emma", initialQuestion);
    setEmmaStatus("Speaking…");
    toggleSpeakingRing(true);

    speak(initialQuestion, () => {
        toggleSpeakingRing(false);
        setEmmaStatus("Listening to you…");
        autoActivateMic();
    });
}


/* ══════════════════════════════════════════════════════════
   WEBCAM
══════════════════════════════════════════════════════════ */
async function activateWebcam() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    webcamStream = stream;
    document.getElementById("webcam").srcObject = stream;
  } catch {
    console.warn("Webcam unavailable.");
  }
}

function stopAllMediaStreams() {
  if (webcamStream) {
    webcamStream.getTracks().forEach(track => track.stop());
    webcamStream = null;
  }
  const webcamEl = document.getElementById("webcam");
  if (webcamEl) webcamEl.srcObject = null;

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
}

/* ══════════════════════════════════════════════════════════
   TIMER
══════════════════════════════════════════════════════════ */
function startTimer() {
  secondsLeft = INTERVIEW_DURATION;
  timerInterval = setInterval(() => {
    secondsLeft--;
    const m = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
    const s = String(secondsLeft % 60).padStart(2, "0");
    document.getElementById("timerDisplay").textContent = `${m}:${s}`;

    if (secondsLeft <= 0) {

    clearInterval(timerInterval);

    interviewEnding = true;

    showToast("Interview will finish after your current answer.");

    }
  }, 1000);
}

/* ══════════════════════════════════════════════════════════
   SPEECH SYNTHESIS (Emma speaks)
══════════════════════════════════════════════════════════ */
function speak(text, onDone) {
  if (!('speechSynthesis' in window)) { onDone && onDone(); return; }

  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);

  const trySpeak = () => {
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes("Google US English") ||
      v.name.includes("Samantha") ||
      v.name.includes("Zira") ||
      (v.lang === "en-US" && v.name.toLowerCase().includes("female"))
    ) || voices.find(v => v.lang === "en-US") || voices[0];

    if (preferred) utter.voice = preferred;
    utter.rate  = 0.92;
    utter.pitch = 1.1;

    utter.onend = () => { onDone && onDone(); };
    window.speechSynthesis.speak(utter);
  };

  // Voices may not be loaded yet
  if (window.speechSynthesis.getVoices().length > 0) {
    trySpeak();
  } else {
    window.speechSynthesis.onvoiceschanged = trySpeak;
  }
}

/* ══════════════════════════════════════════════════════════
   SPEECH RECOGNITION (User speaks)
══════════════════════════════════════════════════════════ */
function autoActivateMic() {
  shouldBeListening = true;
  showSpeakButton(true);
  setMicStatus("🎤 Your turn — tap below to answer", true);
  setFooterHint("Your turn to speak. Tap the button or it activates in 3 seconds…");

  // Auto-start listening after 3 second grace period
  setTimeout(() => {
    if (!isListening && shouldBeListening) startListening();
  }, 3000);
}

function startListening() {
  if (isListening) return;

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast("Speech recognition not supported. Use Chrome or Edge."); return; }

  recognition = new SR();
  recognition.lang         = "en-US";
  recognition.interimResults = true;
  recognition.continuous    = true;

  isListening = true;
  shouldBeListening = true;
  currentTranscript = "";

  const btn = document.getElementById("speakBtn");
  btn.textContent = "● Recording…";
  btn.classList.add("listening");

  setMicStatus("🔴 Listening… speak now", true);
  setFooterHint("Recording your answer. Click 'Submit Answer' when finished.");
  document.getElementById("submitBtn").classList.remove("hidden");

  recognition.onresult = (e) => {
    const interim = Array.from(e.results)
      .map(r => r[0].transcript)
      .join(" ");

    // Show live interim transcript in chat
    let liveEl = document.getElementById("liveTranscript");
    if (!liveEl) {
      liveEl = document.createElement("div");
      liveEl.id = "liveTranscript";
      liveEl.className = "chat-msg user";
      liveEl.innerHTML = `<span class="sender">You</span><div class="bubble"></div>`;
      document.getElementById("chatBox").appendChild(liveEl);
    }
    liveEl.querySelector(".bubble").textContent = interim;
    scrollChat();

    // FIX: previously this only updated currentTranscript once
    // e.results[...].isFinal became true, which only happens after
    // the browser detects a pause. If Submit was clicked before that
    // pause was detected, currentTranscript still held stale/empty
    // text, causing the false "No answer recorded yet" message even
    // though the user had clearly spoken. Now we keep currentTranscript
    // in sync on every single result event, interim or final.
    currentTranscript = interim;
  };

  recognition.onerror = (e) => {
    console.error("Recognition error:", e.error);
    isListening = false;
    // "no-speech" / "network" errors can fire without a matching
    // onend in some browsers — if we're still supposed to be
    // listening, try to pick back up rather than leaving a dead mic.
    if (shouldBeListening && e.error !== "aborted" && e.error !== "not-allowed") {
      setTimeout(() => {
        if (shouldBeListening && !isListening) startListening();
      }, 500);
    }
  };

  recognition.onend = () => {
    isListening = false;
    const btnEl = document.getElementById("speakBtn");
    btnEl.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg> Tap to Speak`;
    btnEl.classList.remove("listening");

    // Some browsers auto-stop `continuous` recognition after a
    // stretch of silence. If the user hasn't hit Submit yet, restart
    // it automatically so the mic doesn't just die mid-answer.
    if (shouldBeListening) {
      setTimeout(() => {
        if (shouldBeListening && !isListening) startListening();
      }, 300);
    }
  };

  recognition.start();
}

async function submitCurrentAnswer() {

  if (isSubmittingAnswer) return;   // ignore rapid double-clicks
  isSubmittingAnswer = true;

  shouldBeListening = false;

  if (recognition) { recognition.stop(); }

  // FIX: recognition.stop() finalizes the in-progress phrase
  // asynchronously — it can fire one more onresult event *after*
  // this function keeps running. Reading currentTranscript on the
  // very next line (as before) sometimes raced ahead of that final
  // flush. A short pause here lets any trailing words land in
  // currentTranscript before we check it.
  await new Promise(resolve => setTimeout(resolve, 400));

  const answer = currentTranscript.trim();
  if (!answer) {
    showToast("No answer recorded yet — please speak first.");
    isSubmittingAnswer = false;
    return;
  }

  // Remove live interim element
  const live = document.getElementById("liveTranscript");
  if (live) live.remove();

  // Post final user message
  postMessage("user", answer);
  currentTranscript = "";

  showSpeakButton(false);
  document.getElementById("submitBtn").classList.add("hidden");
  setMicStatus("Processing…", false);
  setFooterHint("Emma is preparing the next question…");
  setEmmaStatus("Thinking…");
  questionCount++;

  try {
    const res  = await fetch(`${BACKEND_BASE_URL}/submit-answer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: sessionId, answer })
    });
    const data = await res.json();
    // Finish interview gracefully after current answer
if (interviewEnding) {

    const goodbye =
        "Thank you for attending today's interview. We appreciate your time and effort. Our team will review your responses and get back to you soon. Have a wonderful day!";

    postMessage("emma", goodbye);

    setEmmaStatus("Speaking...");
    toggleSpeakingRing(true);

    speak(goodbye, () => {

        toggleSpeakingRing(false);

        endInterview();

    });

    isSubmittingAnswer = false;
    return;
}

    const next = data.next_question;
    postMessage("emma", next);

    // Update stage badge
    if (data.stage === "TECH") {
      document.getElementById("stageBadge").textContent = "Technical Round";
    }

    setEmmaStatus("Speaking…");
    toggleSpeakingRing(true);

    speak(next, () => {
      toggleSpeakingRing(false);
      setEmmaStatus("Listening to you…");
      isSubmittingAnswer = false;
      autoActivateMic();
    });

  } catch (err) {
    console.error(err);
    showToast("Error contacting backend.");
    setEmmaStatus("Error — retrying…");
    isSubmittingAnswer = false;
  }
}

/* ══════════════════════════════════════════════════════════
   END INTERVIEW
══════════════════════════════════════════════════════════ */
function endInterview() {

    clearInterval(timerInterval);

    interviewStarted = false;
    isListening = false;
    shouldBeListening = false;

    if (recognition) {
        recognition.onresult = null;
        recognition.onerror = null;
        recognition.onend = null;
        recognition.stop();
    }

    window.speechSynthesis.cancel();

    // FIX: webcam (and screen-share) streams were requested but never
    // stored, so there was nothing to stop later — the camera light
    // stayed on after the interview ended. Now both are torn down here.
    stopAllMediaStreams();

    const elapsed = INTERVIEW_DURATION - secondsLeft;
    const m = Math.floor(elapsed / 60);
    const s = elapsed % 60;

    document.getElementById("statQuestions").textContent = questionCount;
    document.getElementById("statDuration").textContent = `${m}m ${s}s`;

    showPage("endPage");
}


/* ══════════════════════════════════════════════════════════
   CHAT HELPERS
══════════════════════════════════════════════════════════ */
function postMessage(who, text) {
  // Remove interim element if present (replacing with final)
  if (who === "user") {
    const live = document.getElementById("liveTranscript");
    if (live) live.remove();
  }

  const el = document.createElement("div");
  el.className = `chat-msg ${who}`;
  el.innerHTML = `
    <span class="sender">${who === "emma" ? "Emma" : "You"}</span>
    <div class="bubble">${escapeHtml(text)}</div>
  `;
  document.getElementById("chatBox").appendChild(el);
  scrollChat();
}

function scrollChat() {
  const box = document.getElementById("chatBox");
  box.scrollTop = box.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

/* ══════════════════════════════════════════════════════════
   UI STATE HELPERS
══════════════════════════════════════════════════════════ */
function setEmmaStatus(txt) {
  document.getElementById("emmaStatus").textContent = txt;
}
function setMicStatus(txt, on) {
  const el = document.getElementById("micStatus");
  el.textContent = txt;
  el.className = "mic-status" + (on ? " on" : "");
}
function setFooterHint(txt) {
  document.getElementById("footerHint").textContent = txt;
}
function toggleSpeakingRing(active) {
  const ring = document.getElementById("emmaSpeaking");
  ring.classList.toggle("active", active);
}
function showSpeakButton(show) {
  document.getElementById("speakBtn").classList.toggle("hidden", !show);
  document.getElementById("footerHint").classList.toggle("hidden", show);
}

function showToast(msg) {
  let toast = document.getElementById("toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "toast";
    Object.assign(toast.style, {
      position: "fixed", bottom: "32px", left: "50%", transform: "translateX(-50%)",
      background: "#1e293b", border: "1px solid rgba(255,255,255,0.12)",
      borderRadius: "10px", padding: "12px 22px",
      color: "#f1f5f9", fontSize: "0.88rem", zIndex: "999",
      boxShadow: "0 8px 24px rgba(0,0,0,0.5)", transition: "opacity 0.3s"
    });
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = "1";
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { toast.style.opacity = "0"; }, 3000);
}