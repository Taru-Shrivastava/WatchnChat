import { database } from "../firebase-config.js";
import { ref, set, onValue, push, get, update, remove } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, onSnapshot, writeBatch } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { YOUTUBE_API_KEY } from "../firebase-config.js";

const auth = getAuth();
const db = getFirestore();

const urlParams = new URLSearchParams(window.location.search);
const groupId = urlParams.get("group");
const videoRef = ref(database, `groups/${groupId}/video`);
const chatRef = ref(database, `groups/${groupId}/chat`);
const videoStateRef = ref(database, `groups/${groupId}/videoState`);
const likesRef = ref(database, `groups/${groupId}/recommendedLikes`);
const recommendedVideosRef = ref(database, `groups/${groupId}/recommendedVideos`);


async function fetchGroupName() {
    if (!groupId) return console.error("No group ID found in URL.");
    try {
        const groupSnap = await getDoc(doc(db, "groups", groupId));
        document.getElementById("group-name").innerText = groupSnap.exists() ? groupSnap.data().groupName : "Unknown Group";
    } catch (error) {
        console.error("Error fetching group name:", error);
    }
}

fetchGroupName();

onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const groupSnap = await getDoc(doc(db, "groups", groupId));
            if (!groupSnap.exists()) console.error("🚨 Group not found in Firestore.");
        } catch (error) {
            console.error("❌ Firestore fetch error:", error);
        }
    }
});



let player;
function onYouTubeIframeAPIReady() {
    player = new YT.Player('videoPlayer', {
        events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange
        }
    });
}

function onPlayerReady() {
    console.log("✅ YouTube Player Ready");
    syncVideo();
}

function onPlayerStateChange(event) {
    if (!player) return;
    const videoId = player.getVideoData()?.video_id;
    if (!videoId) return;
    const timestamp = player.getCurrentTime();
    set(videoStateRef, { videoId, isPlaying: event.data === YT.PlayerState.PLAYING, timestamp });
}

function syncVideo() {
    onValue(videoStateRef, (snapshot) => {
        if (!snapshot.exists() || !player) return;
        const state = snapshot.val();
        if (!state.videoId) return;
        
        if (player.getVideoData().video_id !== state.videoId) {
            player.loadVideoById(state.videoId, state.timestamp);
        } else {
            player.seekTo(state.timestamp, true);
            state.isPlaying ? player.playVideo() : player.pauseVideo();
        }
    });
}

// Update Video
function updateVideo() {
    let videoUrl = document.getElementById("video-url").value;
    let videoId = extractVideoId(videoUrl);
    if (videoId) {
        set(videoRef, videoId)
            .then(() => {
                console.log("Video updated in Firebase");
                fetchRecommendedVideos(videoId);
            })
            .catch(error => console.error("Error updating video:", error));
    } else {
        alert("Invalid YouTube URL");
    }
}

// Extract Video ID from URL
function extractVideoId(url) {
    const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

// ✅ Load Chat Messages in Real-Time
onValue(chatRef, (snapshot) => {
    const chatBox = document.getElementById("chat-box");

    snapshot.forEach((child) => {
        const message = child.val();

        // ✅ Ignore old messages if user is returning
        if (message.timestamp < lastExitTimestamp) {
            return; // Skip old messages
        }

        // ✅ Only add message if it's not already displayed
        if (!messageIds.has(child.key)) {
            const div = document.createElement("div");
            div.className = "chat-message";
            div.innerHTML = `<b>${message.user}</b>: ${message.text}`;
            chatBox.appendChild(div);

            messageIds.add(child.key); // ✅ Mark message as displayed
        }
    });

    // ✅ Auto-scroll to latest message
    chatBox.scrollTop = chatBox.scrollHeight;
});

// ✅ Send Message with User Authentication
function sendMessage() {
    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to send messages.");
        return;
    }

    const input = document.getElementById("message");
    let message = input.value.trim();
    if (!message) return;

    push(chatRef, {
        user: user.displayName || "Anonymous",
        text: message,
        timestamp: Date.now(),
    }).then(() => {
        input.value = ""; // ✅ Clear input after send
    }).catch((error) => {
        console.error("Error sending message:", error);
        alert("Failed to send message. Please try again.");
    });
}

// ✅ Track when user leaves the page
window.addEventListener("beforeunload", () => {
    sessionStorage.setItem("lastExitTimestamp", Date.now().toString());
});

// Default Bollywood Movie for New Groups
const defaultBollywoodMovieId = "nZOc_rH-26g";

// Load Video and Fetch Recommendations
onValue(videoRef, async (snapshot) => {
    let videoId = snapshot.exists() ? snapshot.val() : defaultBollywoodMovieId;
    console.log("Loading Video ID:", videoId);

    const videoPlayer = document.getElementById("videoPlayer");
    if (videoPlayer) {
        videoPlayer.src = `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`;
        await fetchRecommendedVideos(videoId);
    } else {
        console.error("Video player iframe not found!");
    }
});

let lastExitTimestamp = parseInt(sessionStorage.getItem("lastExitTimestamp")) || 0;
let messageIds = new Set();


// Fetch Recommended Videos
async function fetchRecommendedVideos(currentVideoId) {
    console.log("Fetching recommendations for Video ID:", currentVideoId);
    const recommendedDiv = document.getElementById("recommended-videos");
    if (!recommendedDiv) {
        console.error("Recommended videos container not found!");
        return;
    }

    recommendedDiv.innerHTML = "<p>Loading recommendations...</p>";

    try {
        // Check Firebase cache first
        const cachedVideosSnap = await get(recommendedVideosRef);
        if (cachedVideosSnap.exists()) {
            const cachedVideos = cachedVideosSnap.val();
            console.log("Using cached recommended videos");
            fetchAndUpdateLikes(cachedVideos);
            return;
        }

        // Get Video Details (Title)
        const videoDetailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${currentVideoId}&key=${YOUTUBE_API_KEY}`;
        console.log("Video Details URL:", videoDetailsUrl);
        const videoDetailsResponse = await fetch(videoDetailsUrl);

        if (!videoDetailsResponse.ok) {
            const errorText = await videoDetailsResponse.text();
            throw new Error(`Video details fetch failed: ${videoDetailsResponse.status} - ${errorText}`);
        }

        const videoDetailsData = await videoDetailsResponse.json();

        if (!videoDetailsData.items || videoDetailsData.items.length === 0) {
            console.warn("Video details not found.");
            recommendedDiv.innerHTML = "<p>Video details unavailable.</p>";
            return;
        }

        const videoTitle = videoDetailsData.items[0].snippet.title;
        console.log("Current Video Title:", videoTitle);

        // Fetch Related Videos
        const searchQuery = encodeURIComponent(videoTitle);
        const recommendationsUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=5&q=${searchQuery}&key=${YOUTUBE_API_KEY}`;
        console.log("Recommendations URL:", recommendationsUrl);

        const response = await fetch(recommendationsUrl);
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Recommendations fetch failed: ${response.status} - ${errorText}`);
        }

        const data = await response.json();

        if (!data.items || data.items.length === 0) {
            console.warn("No recommended videos found.");
            recommendedDiv.innerHTML = "<p>No recommendations available.</p>";
            return;
        }

        // Filter Playable Videos
        let videoIds = data.items.map(video => video.id.videoId);
        let playableVideos = await filterPlayableVideos(videoIds);

        // Remove the current playing video
        playableVideos = playableVideos.filter(video => video.videoId !== currentVideoId);

        // Limit to 5 videos
        let selectedVideos = playableVideos.slice(0, 5);

        // Save to Firebase for caching
        await set(recommendedVideosRef, selectedVideos);

        // Fetch Likes & Sort Videos
        fetchAndUpdateLikes(selectedVideos);
    } catch (error) {
        console.error("Error fetching recommended videos:", error.message);
        recommendedDiv.innerHTML = `<p>Error: ${error.message}</p>`;
        if (error.message.includes("quotaExceeded")) {
            console.log("Quota exceeded, using fallback videos");
            await set(recommendedVideosRef, fallbackVideos);
            fetchAndUpdateLikes(fallbackVideos);
        }
    }
}

// Filter Playable Videos
async function filterPlayableVideos(videoIds) {
    if (videoIds.length === 0) return [];

    const detailsUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,status&id=${videoIds.join(",")}&key=${YOUTUBE_API_KEY}`;
    console.log("Playable Videos URL:", detailsUrl);

    const response = await fetch(detailsUrl);
    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Playable videos fetch failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) return [];

    return data.items
        .filter(video => video.status.embeddable)
        .map(video => ({
            videoId: video.id,
            title: video.snippet.title,
            thumbnail: video.snippet.thumbnails.medium.url
        }));
}

// Fetch Likes & Sort Videos
function fetchAndUpdateLikes(videos) {
    console.log("Listening for like updates...");
    onValue(likesRef, (snapshot) => {
        let updatedLikes = snapshot.exists() ? snapshot.val() : {};
        let videosWithLikes = videos.map(video => ({
            ...video,
            likes: updatedLikes[video.videoId] || 0
        }));
        videosWithLikes.sort((a, b) => b.likes - a.likes);
        displayRecommendedVideos(videosWithLikes);
    }, (error) => {
        console.error("Error listening to likes:", error);
    });
}

// Display Recommended Videos
function displayRecommendedVideos(videos) {
    const recommendedDiv = document.getElementById("recommended-videos");
    if (!recommendedDiv) {
        console.error("Recommended videos container not found!");
        return;
    }

    recommendedDiv.innerHTML = "";
    if (videos.length === 0) {
        recommendedDiv.innerHTML = "<p>No recommended videos available.</p>";
        return;
    }

    videos.forEach(video => {
        const { videoId, title, thumbnail, likes } = video;
        const videoElement = document.createElement("div");
        videoElement.className = "recommended-video";
        videoElement.innerHTML = `
            <img src="${thumbnail}" alt="${title}" style="cursor: pointer;" onclick="window.loadRecommendedVideo('${videoId}')">
            <div>
                <p style="cursor: pointer;" onclick="window.loadRecommendedVideo('${videoId}')">${title}</p>
                <button class="like-button" onclick="window.likeVideo('${videoId}')">
                    👍 <span id="like-count-${videoId}">${likes}</span>
                </button>
            </div>
        `;
        recommendedDiv.appendChild(videoElement);
    });
}

// Like a Recommended Video

async function likeVideo(videoId) {
    const videoLikeRef = ref(database, `groups/${groupId}/recommendedLikes/${videoId}`);

    try {
        const likeSnapshot = await get(videoLikeRef);
        const currentLikeStatus = likeSnapshot.exists() ? likeSnapshot.val() : 0;

        // Toggle like status between 1 (liked) and 0 (unliked)
        const newLikeStatus = currentLikeStatus === 1 ? 0 : 1;

        await set(videoLikeRef, newLikeStatus);
        console.log(`Updated like status for video ${videoId}: ${newLikeStatus}`);

        // Update the UI immediately
        document.getElementById(`like-count-${videoId}`).innerText = newLikeStatus;
    } catch (error) {
        console.error("Error updating like status:", error);
    }
}
// Load a Recommended Video
function loadRecommendedVideo(videoId) {
    set(videoRef, videoId)
        .then(() => console.log("Video updated in Firebase"))
        .catch(error => console.error("Error updating video:", error));
}

// Event Listeners
document.addEventListener("DOMContentLoaded", () => {
    const loadVideoBtn = document.getElementById("loadVideoBtn");
    if (loadVideoBtn) {
        loadVideoBtn.addEventListener("click", window.updateVideo);
    }

    const sendMessageBtn = document.getElementById("sendMessageBtn");
    if (sendMessageBtn) {
        sendMessageBtn.addEventListener("click", window.sendMessage);
    }
});

// Attach functions to `window`
window.loadRecommendedVideo = loadRecommendedVideo;
window.likeVideo = likeVideo;
window.updateVideo = updateVideo;
window.sendMessage = sendMessage;