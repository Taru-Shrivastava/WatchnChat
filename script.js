
document.addEventListener("DOMContentLoaded", () => {const createSection = document.getElementById("create-group");
    const overlayCreate = document.getElementById("overlay-create");
    const createButton = document.getElementById("creategroup");
    
    // Open function
    createButton?.addEventListener("click", () => {
        createSection.classList.remove("hidden");
        overlayCreate.classList.remove("hidden");
    });
    
    // Close function
    window.closecreate = () => {
        createSection.classList.add("hidden");
        overlayCreate.classList.add("hidden");
        document.getElementById("groupname").value = "";
        document.getElementById("grouplink").value = "";
    };
    
    // Close when clicking on the overlay
    overlayCreate.addEventListener("click", () => {
        closecreate();
    });
    
    
    const joinSection = document.getElementById("join-group");
    const overlay = document.getElementById("overlay");
    const joinButton = document.getElementById("joingroup");
    
    // Open function
    joinButton?.addEventListener("click", () => {
        joinSection.classList.remove("hidden");
        overlay.classList.remove("hidden");
    });
    
    // Close function
    window.closejoin = () => {

        joinSection.classList.add("hidden");
        overlay.classList.add("hidden");
        document.getElementById("group-link").value = "";
    };
    
    // Close when clicking on the overlay
    overlay.addEventListener("click", () => {
        closejoin();
    });
    
    document.addEventListener("click", function (event) {
        const groupCards = document.querySelectorAll(".group-card");
    
        groupCards.forEach((card) => {
            if (!card.contains(event.target)) {
                // Hide 'Leave' button and 'Copy Link' container when clicking outside
                const leaveBtn = card.querySelector(".delete-btn");
                const linkContainer = card.querySelector(".group-link-container");
    
                if (leaveBtn) leaveBtn.style.display = "none";
                if (linkContainer) linkContainer.style.display = "none";
            }
        });
    });

    function updateButtonText() {
        let createBtn = document.querySelector("#creategroup");
        let joinBtn = document.querySelector("#joingroup");
    
        if (window.innerWidth < 485) {
            createBtn.innerText = "Create";
            joinBtn.innerText = "Join";
        } else {
            createBtn.innerText = "Create Group";
            joinBtn.innerText = "Join Group";
        }
    }
    
    // Run when screen resizes
    window.addEventListener("resize", updateButtonText);
    
    // Run on page load
    updateButtonText();
    
    window.scrollToContainer = scrollToContainer;
    
    function scrollToContainer() {
        const container = document.querySelector('.group-container');
        if (container) {
            container.scrollIntoView({ behavior: 'smooth' });
        }
    }
    
    window.closeprofile = closeprofile;
    function closeprofile(){
        document.getElementById("profile-dropdown").classList.add("hidden");
    }
    
});