import { auth } from "./firebase-config.js";

import { 
    GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

import { 
    getFirestore, collection, addDoc, getDocs, query, where, doc, updateDoc, arrayUnion, setDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";



const db = getFirestore();
const provider = new GoogleAuthProvider();

//  Persistent session ID across all accounts
const sessionId = localStorage.getItem("sessionId") || Math.random().toString(36).substring(2, 10);
localStorage.setItem("sessionId", sessionId); // Set once and keep it

let isUpdating = false; // Lock to prevent multiple UI updates

// Function to update UI after login
async function updateUIForLoggedInUser(user) {
    if (isUpdating) return; // Prevent overlapping updates
    isUpdating = true;

    try {
        document.getElementById("login-btn")?.classList.add("hidden");
        document.getElementById("profile-section")?.classList.remove("hidden");

        if (document.getElementById("profile-img")) {
            document.getElementById("profile-img").src = user.photoURL || "default-profile.png";
        }
        if (document.getElementById("profile-pic")) {
            document.getElementById("profile-pic").src = user.photoURL || "default-profile.png";
        }
        if (document.getElementById("profile-name")) {
            document.getElementById("profile-name").innerText = user.displayName || "No Name";
        }
        if (document.getElementById("profile-email")) {
            document.getElementById("profile-email").innerText = user.email || "No Email";
        }

        await loadUserGroups(user.uid);
        await loadUserAccounts();
    } finally {
        isUpdating = false; // Release the lock
    }
}

// Reset UI after logout
function resetUI() {
    document.getElementById("login-btn")?.classList.remove("hidden");
    document.getElementById("profile-section")?.classList.add("hidden");
    document.getElementById("group-list").innerHTML = "";
}

// Load user’s groups from Firestore
async function loadUserGroups(userId) {
    const userGroupsRef = collection(db, `users/${userId}/groups`);
    const querySnapshot = await getDocs(userGroupsRef);

    document.getElementById("group-list").innerHTML = ""; // Clear previous groups
    querySnapshot.forEach((doc) => {
        let group = doc.data();
        addGroupToUI(doc.id, group.groupName, group.members.length, group.timeCreated, group.groupLink);
    });
}

// Load user’s existing accounts from Firestore for this session
async function loadUserAccounts() {
    const accountsList = document.getElementById("accounts-list");
    if (!accountsList) return; // Guard against null
    accountsList.innerHTML = ""; // Clear the list completely

    const accountsRef = collection(db, "sessions", sessionId, "accounts");
    try {
        const querySnapshot = await getDocs(accountsRef);

        if (querySnapshot.empty) {
            const noAccounts = document.createElement("div");
            noAccounts.classList.add("p-2", "text-gray-500");
            noAccounts.innerText = "No accounts added yet";
            accountsList.appendChild(noAccounts);
        } else {
            querySnapshot.forEach((doc) => {
                const account = doc.data();
                const accountItem = document.createElement("div");
                accountItem.classList.add("p-2", "hover:bg-gray-100", "cursor-pointer", "flex", "items-center");

                const img = document.createElement("img");
                img.src = account.photoURL || "default-profile.png";
                img.classList.add("w-6", "h-6", "rounded-full", "mr-2");
                accountItem.appendChild(img);

                const emailSpan = document.createElement("span");
                emailSpan.innerText = account.email || "Unnamed Account";
                accountItem.appendChild(emailSpan);

                accountItem.onclick = null; // Clear any prior onclick
                accountItem.addEventListener("click", async () => {
                    await switchToAccount(account.email);
                }, { once: true });

                accountsList.appendChild(accountItem);

                if (auth.currentUser && auth.currentUser.email === account.email) {
                    accountItem.classList.add("bg-gray-200");
                }
            });
        }
    } catch (error) {
        console.log("Error loading accounts:", error.message);
    }
}

// Add a new account to the session
async function addAccountToSession(user) {
    const accountsRef = doc(db, "sessions", sessionId, "accounts", user.uid);
    try {
        const accountSnap = await getDoc(accountsRef);
        if (!accountSnap.exists()) {
            await setDoc(accountsRef, {
                email: user.email,
                displayName: user.displayName,
                photoURL: user.photoURL,
                uid: user.uid,
                addedAt: new Date().toISOString()
            });
        }
    } catch (error) {
        console.log("Error adding account to session:", error.message);
    }
}

// Remove an account from the session
async function removeAccountFromSession(userId) {
    const accountRef = doc(db, "sessions", sessionId, "accounts", userId);
    try {
        await deleteDoc(accountRef);
        console.log(`Account with UID ${userId} removed from session`);
    } catch (error) {
        console.log("Error removing account from session:", error.message);
    }
}

// Switch to an account
async function switchToAccount(email) {
    try {
        await signOut(auth);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ login_hint: email });
        const result = await signInWithPopup(auth, provider);
        const user = result.user;
        await updateUIForLoggedInUser(user);
    } catch (error) {
        console.log("Switch Account Error:", error.message);
    }
}

// Add group card to UI
async function addGroupToUI(groupId, groupName, membersCount, timeCreated, groupLink) {
    // Convert ISO timestamp to readable format
    let formattedTime = new Date(timeCreated).toLocaleString();

    // ✅ Fetch latest members count from Firestore
    const groupRef = doc(db, "groups", groupId);
    const groupSnap = await getDoc(groupRef);
    membersCount = groupSnap.exists() ? groupSnap.data().members?.length || 1 : 1;

    let groupCard = document.createElement("div");
    groupCard.classList.add("group-card");

    groupCard.innerHTML = `
        <div class="group-header">
            <span class="group-name">${groupName}</span>
            <div class="group-actions">
                <button class="join-btn">🔗 Join</button>
                <span class="dustbin-icon" style="margin-left : 10px">🗑️</span>
            </div>
        </div>
        <button class="delete-btn" style="display: none;">Leave</button>
        <div class="group-info">
            <div>👥 <span class="member-count">${membersCount}</span> members</span><br><br>
            <span>⏳ ${formattedTime}</span>
        </div>
        <div class="group-link-container" style="display: none;">
            <input type="text" class="group-link-input" value="${groupLink}" readonly>
            <button class="copy-btn">Copy</button>
        </div>
    `;

    document.getElementById("group-list").appendChild(groupCard);

    // ✅ Clicking the group card navigates (excluding buttons)
    groupCard.addEventListener("click", (event) => {
        if (!event.target.classList.contains("join-btn") &&
            !event.target.classList.contains("copy-btn") &&
            !event.target.classList.contains("dustbin-icon") &&
            !event.target.classList.contains("delete-btn")) {
            window.location.href = `/Group/watch.html?group=${groupId}`;
        }
    });

    // ✅ Join button functionality
    let joinBtn = groupCard.querySelector(".join-btn");
    let groupLinkContainer = groupCard.querySelector(".group-link-container");

    joinBtn.addEventListener("click", async (event) => {
        event.preventDefault();
        groupLinkContainer.style.display = "flex"; // Show link input

        const user = auth.currentUser;
        if (!user) {
            alert("Please log in to join the group.");
            return;
        }

        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) {
            alert("Group not found.");
            return;
        }

        let groupData = groupSnap.data();
        let membersArray = groupData.members || [];

        if (!membersArray.includes(user.uid)) {
            // ✅ Add user to Firestore and update count
            membersArray.push(user.uid);
            await updateDoc(groupRef, {
                members: membersArray,
                membersCount: membersArray.length,
            });

            groupCard.querySelector(".member-count").textContent = membersArray.length;
            alert("You have joined the group!");
        }
    });

    // ✅ Copy button functionality
    let copyBtn = groupCard.querySelector(".copy-btn");
    let groupLinkInput = groupCard.querySelector(".group-link-input");

    copyBtn.addEventListener("click", () => {
        groupLinkInput.select();
        document.execCommand("copy");
        copyBtn.innerHTML = "Link Copied";

        setTimeout(() => {
            copyBtn.innerHTML = "Copy";
            groupLinkContainer.style.display = "none";
        }, 2000);
    });

    // ✅ Dustbin button functionality (dulls the group card)
    let dustbinIcon = groupCard.querySelector(".dustbin-icon");
let deleteBtn = groupCard.querySelector(".delete-btn");

// Create dulling effect using ::before
groupCard.style.position = "relative";
groupCard.style.overflow = "hidden";

// Ensure deleteBtn is always fully visible
deleteBtn.style.display = "none";
deleteBtn.style.position = "absolute";
deleteBtn.style.top = "10px";
deleteBtn.style.right = "10px"; 
deleteBtn.style.backgroundColor = "red";
deleteBtn.style.color = "white";
deleteBtn.style.border = "none";
deleteBtn.style.padding = "5px 10px";
deleteBtn.style.cursor = "pointer";
deleteBtn.style.fontWeight = "bold";
deleteBtn.style.borderRadius = "5px";
deleteBtn.style.boxShadow = "0px 2px 5px rgba(0,0,0,0.2)";
deleteBtn.style.zIndex = "10"; // ✅ Ensure it's above the overlay
deleteBtn.style.pointerEvents = "auto";

dustbinIcon.addEventListener("click", () => {
    // ✅ Add dulling effect using a pseudo-element
    groupCard.style.setProperty("--overlay-display", "block");
    deleteBtn.style.display = "block";
});

// ✅ Create the overlay using CSS
const style = document.createElement('style');
style.textContent = `
    .group-card::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.1); /* Semi-transparent dark overlay */
        z-index: 1; /* Below the deleteBtn */
        display: var(--overlay-display, none);
    }
`;
document.head.appendChild(style);

groupCard.classList.add('group-card');


    // ✅ Leave Group functionality
    deleteBtn.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (!user) {
            alert("Please log in first.");
            return;
        }
    
        const groupSnap = await getDoc(groupRef);
        if (!groupSnap.exists()) {
            alert("Group not found.");
            return;
        }
    
        let groupData = groupSnap.data();
        let membersArray = groupData.members || [];
    
        if (membersArray.includes(user.uid)) {
            // ✅ Remove the user from the members array
            membersArray = membersArray.filter(uid => uid !== user.uid);
    
            // ✅ First update Firestore to reflect the removal in the group document
            await updateDoc(groupRef, {
                members: membersArray,
                membersCount: membersArray.length,
            });
    
            // ✅ Remove group from UI for this user
            groupCard.remove();
    
            // ✅ Remove from user's document in Firebase
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);
    
            if (userSnap.exists()) {
                let userGroups = userSnap.data().joinedGroups || [];
                userGroups = userGroups.filter(id => id !== groupId); // Remove group ID
    
                await updateDoc(userRef, {
                    joinedGroups: userGroups
                });
            }
    
            // ✅ Remove from localStorage to prevent reappearing on reload
            let leftGroups = JSON.parse(localStorage.getItem("leftGroups")) || [];
            if (!leftGroups.includes(groupId)) {
                leftGroups.push(groupId);
                localStorage.setItem("leftGroups", JSON.stringify(leftGroups));
            }
    
            // 🚀 If last member, delete the group AFTER updating Firestore
            if (membersArray.length === 0) {
                setTimeout(async () => {
                    await deleteDoc(groupRef);
                    console.log("Group deleted as last member left.");
                }, 100); // Small delay to ensure proper update before deletion
            }
        }
    });
    

    // ✅ Check if the user already left this group and remove it on page load
    let leftGroups = JSON.parse(localStorage.getItem("leftGroups")) || [];
    if (leftGroups.includes(groupId)) {
        groupCard.remove();
    }
}


// Listen for authentication changes
onAuthStateChanged(auth, async (user) => {
    if (user) {
        await addAccountToSession(user);
        await updateUIForLoggedInUser(user);
    } else {
        resetUI();
        await loadUserAccounts(); // Refresh accounts list after logout
    }
});

//  Ensure the DOM is fully loaded before executing script
document.addEventListener("DOMContentLoaded", () => {
    const provider = new GoogleAuthProvider();

    // Login Button Click
    document.getElementById("login-btn")?.addEventListener("click", async () => {
        try {
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            await updateUIForLoggedInUser(user);
        } catch (error) {
            console.log("Login Error:", error.message);
        }
    });

    // Logout Button Click
    document.getElementById("logout-btn")?.addEventListener("click", async () => {
        const user = auth.currentUser;
        if (user) {
            try {
                await removeAccountFromSession(user.uid); // Remove the account from session
                await signOut(auth); // Sign out the user
                console.log("User signed out and removed from session");
                resetUI();
                await loadUserAccounts(); // Refresh the accounts list
            } catch (error) {
                console.log("Logout Error:", error.message);
            }
        } else {
            console.log("No user to log out");
            resetUI();
            await loadUserAccounts(); // Still refresh in case of manual state change
        }
    });

    // Toggle Profile Dropdown
    document.getElementById("profile-img")?.addEventListener("click", (event) => {
        event.stopPropagation();
        document.getElementById("profile-dropdown")?.classList.toggle("hidden");
    });

    // Close Profile Dropdown and Accounts List when clicking outside
    document.addEventListener("click", (event) => {
        const profileSection = document.getElementById("profile-section");
        const dropdown = document.getElementById("profile-dropdown");
        const accountsList = document.getElementById("accounts-list");

        if (profileSection && dropdown && !profileSection.contains(event.target)) {
            dropdown.classList.add("hidden");
            accountsList?.classList.add("hidden"); // Ensures accounts list is closed when profile dropdown closes
        }

        if (accountsList && !accountsList.contains(event.target) && event.target.id !== "accounts-toggle") {
            accountsList.classList.add("hidden"); // Close accounts list when clicking outside
        }
    });

    // Toggle Accounts List
    document.getElementById("accounts-toggle")?.addEventListener("click", (event) => {
        event.stopPropagation(); // Prevents closing when clicking the toggle button
        const accountsList = document.getElementById("accounts-list");
        accountsList?.classList.toggle("hidden");
        if (!accountsList?.classList.contains("hidden")) {
            loadUserAccounts();
        }
    });

    // Add Account Button Click
    document.getElementById("add-account-btn")?.addEventListener("click", async () => {
        const btn = document.getElementById("add-account-btn");
        btn.disabled = true; // Prevent multiple clicks
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ prompt: 'select_account' });
            const result = await signInWithPopup(auth, provider);
            const user = result.user;
            await addAccountToSession(user);
            await updateUIForLoggedInUser(user);
        } catch (error) {
            console.log("Add Account Error:", error.message);
        } finally {
            btn.disabled = false; // Re-enable button
        }
    });
});

// Create Group Function
const createBtn = document.getElementById("create");
createBtn.addEventListener("click", async () => {
    const user = auth.currentUser;

    if (!user) {
        alert("Please log in to create a group.");
        return;
    }

    let groupNameInput = document.getElementById("groupname");
    let groupName = groupNameInput.value.trim();

    if (!groupName) {
        createBtn.innerText = "Enter group name!!";

        setTimeout(() => {
            createBtn.innerText = "Create Group";
        },2000)
        return;
    }

    try {
        // Check if the group already exists
        const groupsRef = collection(db, `users/${user.uid}/groups`);
        const querySnapshot = await getDocs(groupsRef);

        let existingGroup = null;

        querySnapshot.forEach((doc) => {
            if (doc.data().groupName === groupName) {
                existingGroup = doc;
            }
        });

        let groupId, groupLink;

        if (existingGroup) {
            createBtn.innerText = "Group name already exists!!";

            setTimeout(() => {
               createBtn.innerText = "Create Group";
            },2000)
        return;
        } else {
            // ✅ Generate a new group ID
            groupId = Math.random().toString(36).substring(2, 8);
            groupLink = `https://watchnchat.com/group/${groupId}`;

            // ✅ Save group under user collection
            await setDoc(doc(db, `users/${user.uid}/groups`, groupId), {
                groupName,
                groupLink,
                members: [user.uid],
                timeCreated: new Date().toISOString(),
            });

            // ✅ Save group in global groups collection
            await setDoc(doc(db, "groups", groupId), {
                groupName,
                groupLink,
                members: [user.uid],
                timeCreated: new Date().toISOString(),
            });
        }

        // ✅ Set generated link in the input field
        const linkInput = document.getElementById("grouplink");
        if (linkInput) {
            linkInput.value = groupLink;
        }

        // ✅ Reload user groups to reflect changes
        await loadUserGroups(user.uid);

        // ✅ Close modal after 3 seconds
        setTimeout(() => {
            closecreate(); // Close modal (if you have one)
        }, 3000);
    } catch (error) {
        alert("Error creating group: " + error.message);
        console.error("Create Group Error:", error);
    }
});

// ✅ Copy Link Function
document.getElementById("copy-link").addEventListener("click", async () => {
    const linkInput = document.getElementById("grouplink");
    
    if (linkInput && linkInput.value) {
        try {
            await navigator.clipboard.writeText(linkInput.value);
            createBtn.innerText = "Group link copied!!";

            setTimeout(() => {
               createBtn.innerText = "Create Group";
            },2000)
        } catch (error) {
            alert("Failed to copy link: " + error.message);
            console.error("Clipboard Error:", error);
        }
    } else {
        alert("No link available to copy!");
    }
});


// Join Group Function

const joinBtn = document.getElementById("join");
const grpLink = document.getElementById("group-link");
joinBtn.addEventListener("click", async () => {
    const user = auth.currentUser;
    if (!user) {
        alert("Please log in to join a group.");
        return;
    }

    const groupLink = grpLink.value.trim();
    if (!groupLink) {

        joinBtn.innerText = "Enter Group Link!!";

        setTimeout(() => {
            joinBtn.innerText = "Join Group";
        },2000)
        return;
    }

    try {
        // ✅ Extract Group ID from the link
        const match = groupLink.match(/\/group\/([a-z0-9]{6})$/i);
        if (!match) {
            joinBtn.innerText = "Invalid Group Link!!";

            setTimeout(() => {
              joinBtn.innerText = "Join Group";
              grpLink.value = "";
            },2000)
            return;
        }

        const groupId = match[1];
        console.log("Extracted Group ID:", groupId);

        const db = getFirestore();
        const groupRef = doc(db, "groups", groupId);
        const groupSnap = await getDoc(groupRef);

        if (!groupSnap.exists()) {
            joinBtn.innerText = "Group Not Found!!";

            setTimeout(() => {
              joinBtn.innerText = "Join Group";
              grpLink.value = "";
            },2000)
            return;
        }

        // Extract data and ensure `timeCreated` is set
        const groupData = groupSnap.data();
        const timeCreated = groupData.timeCreated || new Date().toISOString(); // Default if missing

        // ✅ Check if the user is already a member
        if (groupData.members?.includes(user.uid)) {
            joinBtn.innerText = "You are already member of this group!!";

            setTimeout(() => {
              joinBtn.innerText = "Join Group";
              grpLink.value = "";
            },2000)
            
            return;
        }

        // ✅ Add user to the group's "members" array in Firestore
        await updateDoc(groupRef, {
            members: arrayUnion(user.uid),
        });

        // ✅ Add the group inside user's subcollection (users/userId/groups/groupId)
        const userGroupRef = doc(db, `users/${user.uid}/groups`, groupId);
        await setDoc(userGroupRef, {
            groupName: groupData.groupName || "Unnamed Group",
            members: (groupData.members?.length || 0) + 1, // Ensure members count
            timeCreated: timeCreated, // Ensure valid timestamp
            groupLink: groupLink
        });

        joinBtn.innerText = "Successfully joined the Group!!";

            setTimeout(() => {
              joinBtn.innerText = "Join Group";
            },2000)

        // ✅ Refresh "Your Groups" section
        await loadUserGroups(user.uid);

        setTimeout(() => {
            closejoin();
          },3000)
    } catch (error) {
        alert("Error joining group: " + error.message);
    }
});
