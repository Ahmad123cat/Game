// ===============================================
// CODE FOR: game.js (Client-Side Logic)
// This file runs in the player's browser.
// ===============================================

// 🔑 IMPORTANT: REPLACE THIS with your final LIVE Render Backend URL.
// Example: https://geoguessr-backend-abc123.onrender.com
const BACKEND_API_URL = 'http://localhost:3000'; 


let panorama, miniMap, geocoder;
let actualLoc = null;
let actualCountryName = ""; 
let guessMarker = null;
let actualMarker = null;
let resultLine = null;
let hintCircle = null; 

let roundCount = 1; 
const maxRounds = 5;
let totalGameScore = 0;
let quizQuestionsSolved = 0; 
let currentDifficulty = 'hard'; 

// --- DATA LISTS (These lists can be removed entirely later,
// but for now, we keep them for the quiz logic) ---
const frenchData = [
    { sentence: "Je ___ au parc.", answer: "vais", options: ["vais", "vas", "va", "allons"] },
    { sentence: "Tu ___ à la plage.", answer: "vas", options: ["vas", "vais", "va", "allez"] },
    { sentence: "Il ___ à l'école.", answer: "va", options: ["va", "vas", "vont", "vais"] },
    { sentence: "Nous ___ voyager.", answer: "allons", options: ["allons", "allez", "vont", "vas"] },
    { sentence: "Vous ___ bien ?", answer: "allez", options: ["allez", "allons", "avez", "va"] },
    { sentence: "Ils ___ au stade.", answer: "vont", options: ["vont", "allons", "va", "vas"] }
];

let currentQuestionObj = null;

// --- MENU LOGIC ---
function openNav() { document.getElementById("side-menu").style.width = "250px"; }
function closeNav() { document.getElementById("side-menu").style.width = "0"; }

function startGame(difficulty) {
    currentDifficulty = difficulty;
    document.getElementById('start-screen').style.display = 'none';
    
    // Check if the Google Maps API objects need initialization
    if (!geocoder) {
        geocoder = new google.maps.Geocoder();
        panorama = new google.maps.StreetViewPanorama(
            document.getElementById("pano"), {
                showRoadLabels: false, addressControl: false, disableDefaultUI: true, clickToGo: true, zoom: 0
            }
        );

        miniMap = new google.maps.Map(document.getElementById("mini-map"), {
            center: { lat: 20, lng: 0 },
            zoom: 1,
            disableDefaultUI: true,
            clickableIcons: false
        });

        miniMap.addListener("click", (e) => {
            if (document.getElementById("next-btn").style.display === "block") return;
            if (guessMarker) guessMarker.setMap(null);
            guessMarker = new google.maps.Marker({ position: e.latLng, map: miniMap });
        });
    }

    startNewRound();
}

function changeDifficulty(difficulty) {
    currentDifficulty = difficulty;
    totalGameScore = 0; // Reset score
    roundCount = 1; 
    closeNav(); 
    startNewRound();
}

function restartGame() {
    totalGameScore = 0;
    roundCount = 1;
    document.getElementById("summary-overlay").style.display = "none";
    document.getElementById("start-screen").style.display = "flex";
}

// --- GAME LOGIC ---
function startNewRound() {
    document.getElementById("loader").style.display = "flex";
    document.getElementById("status").innerText = `Round ${roundCount} / ${maxRounds}: Loading location...`;
    document.getElementById("score-bar").style.display = "none";
    
    document.getElementById("guess-btn").style.display = "block";
    document.getElementById("hint-btn").style.display = "block";
    document.getElementById("hint-btn").disabled = false;
    document.getElementById("hint-btn").innerText = "HINT";
    document.getElementById("hint-btn").style.opacity = "1";
    document.getElementById("next-btn").style.display = "none";

    if (guessMarker) guessMarker.setMap(null);
    if (actualMarker) actualMarker.setMap(null);
    if (resultLine) resultLine.setMap(null);
    if (hintCircle) hintCircle.setMap(null);
    
    guessMarker = null;
    hintCircle = null;
    actualCountryName = "";

    miniMap.setCenter({ lat: 20, lng: 0 });
    miniMap.setZoom(1);

    // ⭐️ NEW: Call the backend API to get a location
    fetchLocationFromBackend();
}

// ⭐️ NEW FUNCTION: Fetching data from your server
async function fetchLocationFromBackend() {
    try {
        // This calls the '/game-data' route we put in server.js
        const response = await fetch(`${BACKEND_API_URL}/game-data?difficulty=${currentDifficulty}`);
        
        if (!response.ok) {
            throw new Error(`HTTP error! Status: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Use the location data received from the backend
        const latLng = { lat: data.latitude, lng: data.longitude };
        
        validateLocation(latLng);

    } catch (error) {
        console.error("Error fetching location from backend. Is the server running?", error);
        document.getElementById("status").innerText = "Error: Could not connect to server.";
        // Fallback or game failure logic here
    }
}


function validateLocation(latLng) {
    // We still use the geocoder locally to check for StreetView availability
    const svService = new google.maps.StreetViewService();
    svService.getPanorama({
        location: latLng, radius: 50, source: google.maps.StreetViewSource.OUTDOOR
    }, (data, status) => {
        if (status === "OK") {
            // Reverse geocode to get the country name
            geocoder.geocode({ location: latLng }, (results, geoStatus) => {
                if (geoStatus === "OK" && results[0]) {
                    const countryComponent = results[0].address_components.find(c => c.types.includes("country"));
                    if (countryComponent) {
                        actualLoc = latLng;
                        actualCountryName = countryComponent.long_name;
                        panorama.setPosition(actualLoc);
                        panorama.setPov({ heading: Math.random() * 360, pitch: 0 });
                        document.getElementById("loader").style.display = "none";
                    } else fetchLocationFromBackend(); // Retry if country isn't found
                } else fetchLocationFromBackend(); // Retry if geocoding fails
            });
        } else {
            // If StreetView not available at this spot, ask backend for a new one
            console.log("StreetView not available, fetching new location from backend.");
            fetchLocationFromBackend();
        }
    });
}


// --- HINT, QUIZ, GUESS LOGIC (The rest is largely unchanged) ---
function useHint() {
    if(!actualLoc) return;
    const offsetDistance = Math.random() * 900000; 
    const offsetHeading = Math.random() * 360;
    const circleCenter = google.maps.geometry.spherical.computeOffset(actualLoc, offsetDistance, offsetHeading);

    hintCircle = new google.maps.Circle({
        strokeColor: "#f39c12", strokeOpacity: 0.8, strokeWeight: 2,
        fillColor: "#f1c40f", fillOpacity: 0.20, map: miniMap,
        center: circleCenter, radius: 1000000, clickable: false      
    });
    miniMap.fitBounds(hintCircle.getBounds());
    const btn = document.getElementById("hint-btn");
    btn.disabled = true; btn.style.opacity = "0.5"; btn.innerText = "Used";
}

function handleNextClick() {
    if (roundCount === maxRounds) {
        showSummaryScreen();
    } else if (roundCount % 2 === 0) {
        quizQuestionsSolved = 0;
        setupQuiz();
    } else {
        roundCount++;
        startNewRound();
    }
}

function showSummaryScreen() {
    const starEl = document.getElementById("final-stars");
    const scoreEl = document.getElementById("final-score-val");
    
    let stars = "";
    if (totalGameScore > 22500) stars = "★★★★★";
    else if (totalGameScore > 18000) stars = "★★★★☆";
    else if (totalGameScore > 12000) stars = "★★★☆☆";
    else if (totalGameScore > 5000) stars = "★★☆☆☆";
    else stars = "★☆☆☆☆";

    starEl.innerText = stars;
    scoreEl.innerText = totalGameScore.toLocaleString();
    document.getElementById("summary-overlay").style.display = "flex";
    
    // ⭐️ NEW: Send the final score to the backend
    sendFinalScore(totalGameScore);
}

// ⭐️ NEW FUNCTION: Sending the score to your server
async function sendFinalScore(score) {
    try {
        // You would normally get the player name from a login/input field
        const playerName = "Player_1"; 
        
        const response = await fetch(`${BACKEND_API_URL}/save-score`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ playerName: playerName, score: score })
        });

        if (response.ok) {
            console.log("Score successfully saved on the backend!");
        } else {
            console.error("Failed to save score on the backend.");
        }
    } catch (error) {
        console.error("Error connecting to backend to save score:", error);
    }
}


function setupQuiz() {
    const r = Math.floor(Math.random() * frenchData.length);
    currentQuestionObj = frenchData[r];
    let shuffledOptions = [...currentQuestionObj.options];
    shuffledOptions.sort(() => Math.random() - 0.5);

    document.getElementById("progress-text").innerText = `Question ${quizQuestionsSolved + 1} / 2`;
    document.getElementById("question-text").innerText = currentQuestionObj.sentence;
    document.getElementById("quiz-feedback").innerText = "";

    const grid = document.getElementById("options-grid");
    grid.innerHTML = ""; 

    shuffledOptions.forEach(opt => {
        const btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerText = opt;
        btn.onclick = () => checkAnswer(btn, opt);
        grid.appendChild(btn);
    });
    document.getElementById("quiz-overlay").style.display = "flex";
}

function checkAnswer(btnElement, selectedOption) {
    const feedback = document.getElementById("quiz-feedback");
    if (selectedOption === currentQuestionObj.answer) {
        btnElement.classList.add("correct-btn");
        quizQuestionsSolved++;
        if (quizQuestionsSolved < 2) {
            feedback.style.color = "#27ae60";
            feedback.innerText = "Correct! Next question...";
            setTimeout(() => { setupQuiz(); }, 1000);
        } else {
            feedback.style.color = "#2ecc71";
            feedback.innerText = "CHECKPOINT CLEARED!";
            setTimeout(() => {
                document.getElementById("quiz-overlay").style.display = "none";
                roundCount++;
                startNewRound();
            }, 1500);
        }
    } else {
        btnElement.classList.add("wrong-btn");
        feedback.style.color = "#c0392b";
        feedback.innerText = "Incorrect, try again.";
    }
}

function submitGuess() {
    if (!guessMarker) {
        alert("Click the map to place your pin first!");
        return;
    }
    const distKm = getDistanceFromLatLonInKm(
        actualLoc.lat(), actualLoc.lng(),
        guessMarker.getPosition().lat(), guessMarker.getPosition().lng()
    );

    let score = Math.round(5000 * Math.exp(-distKm / 2000));
    if (distKm < 1) score = 5000;

    totalGameScore += score; // Add to global score

    const scoreBar = document.getElementById("score-bar");
    scoreBar.innerHTML = `
        <div>Location: <span style="color:#2ecc71">${actualCountryName}</span></div>
        <div style="font-size:16px; margin-top:5px;">
            Distance: <b>${Math.round(distKm).toLocaleString()} km</b> | Round Score: <b>${score}</b>
        </div>
        <div style="font-size:14px; margin-top:5px; color: #f1c40f;">Total Score: ${totalGameScore}</div>
    `;
    scoreBar.style.display = "block";

    actualMarker = new google.maps.Marker({
        position: actualLoc, map: miniMap,
        icon: 'http://maps.google.com/mapfiles/ms/icons/green-dot.png'
    });

    resultLine = new google.maps.Polyline({
        path: [guessMarker.getPosition(), actualLoc],
        geodesic: true, strokeColor: '#FF0000', strokeOpacity: 0.8, strokeWeight: 3, map: miniMap
    });

    const bounds = new google.maps.LatLngBounds();
    bounds.extend(guessMarker.getPosition());
    bounds.extend(actualLoc);
    miniMap.fitBounds(bounds);

    document.getElementById("guess-btn").style.display = "none";
    document.getElementById("hint-btn").style.display = "none";
    document.getElementById("next-btn").style.display = "block";
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;  
    var dLat = deg2rad(lat2-lat1);    
    var dLon = deg2rad(lon2-lon1);  
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * Math.sin(dLon/2) * Math.sin(dLon/2);  
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));  
    return R * c;
}
function deg2rad(deg) { return deg * (Math.PI/180) }