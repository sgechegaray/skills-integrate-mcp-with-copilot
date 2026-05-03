document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const messageDiv = document.getElementById("message");

  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const loginMessage = document.getElementById("login-message");
  const registerMessage = document.getElementById("register-message");
  const authContainer = document.getElementById("auth-container");
  const dashboardContainer = document.getElementById("dashboard-container");
  const studentDashboard = document.getElementById("student-dashboard");
  const adminDashboard = document.getElementById("admin-dashboard");
  const userDetails = document.getElementById("user-details");
  const logoutBtn = document.getElementById("logout-btn");
  const emailInput = document.getElementById("email");
  const signupNote = document.getElementById("signup-note");
  const myActivitiesContainer = document.getElementById("my-activities");
  const adminActivitySummary = document.getElementById("admin-activity-summary");

  let authToken = localStorage.getItem("authToken");
  let currentUser = null;

  function getAuthHeaders() {
    return authToken ? { Authorization: `Bearer ${authToken}` } : {};
  }

  function setStatusMessage(target, text, type = "info") {
    target.textContent = text;
    target.className = `message ${type}`;
    target.classList.remove("hidden");
  }

  function clearStatusMessage(target) {
    target.textContent = "";
    target.classList.add("hidden");
  }

  function renderAuthState() {
    const loggedIn = Boolean(currentUser);
    authContainer.classList.toggle("hidden", loggedIn);
    dashboardContainer.classList.toggle("hidden", !loggedIn);
    logoutBtn.classList.toggle("hidden", !loggedIn);

    if (!loggedIn) {
      userDetails.textContent = "";
      studentDashboard.classList.add("hidden");
      adminDashboard.classList.add("hidden");
      emailInput.disabled = false;
      signupNote.textContent = "Log in to use the student or admin dashboard.";
      return;
    }

    userDetails.textContent = `Signed in as ${currentUser.username} (${currentUser.role})`;

    if (currentUser.role === "student") {
      studentDashboard.classList.remove("hidden");
      adminDashboard.classList.add("hidden");
      emailInput.value = currentUser.email;
      emailInput.disabled = true;
      signupNote.textContent = "Your email is prefilled for sign-up.";
    } else {
      studentDashboard.classList.add("hidden");
      adminDashboard.classList.remove("hidden");
      emailInput.disabled = false;
      signupNote.textContent = "As an admin, you may register students by email.";
    }
  }

  async function getActivitiesData() {
    const response = await fetch("/activities");
    if (!response.ok) {
      throw new Error("Failed to load activities");
    }
    return response.json();
  }

  async function fetchActivities() {
    try {
      const activities = await getActivitiesData();
      activitiesList.innerHTML = "";
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft = details.max_participants - details.participants.length;
        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span><button class="delete-btn" data-activity="${name}" data-email="${email}">❌</button></li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      document.querySelectorAll(".delete-btn").forEach((button) => {
        button.addEventListener("click", handleUnregister);
      });

      renderDashboardContents(activities);
    } catch (error) {
      activitiesList.innerHTML =
        "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function renderDashboardContents(activities) {
    if (!currentUser) {
      myActivitiesContainer.innerHTML = "";
      adminActivitySummary.innerHTML = "";
      return;
    }

    if (currentUser.role === "student") {
      const joinedActivities = Object.entries(activities).filter(([, details]) =>
        details.participants.includes(currentUser.email)
      );

      if (joinedActivities.length === 0) {
        myActivitiesContainer.innerHTML = "<p>You have not joined any activities yet.</p>";
      } else {
        myActivitiesContainer.innerHTML = joinedActivities
          .map(
            ([name, details]) =>
              `<div class="activity-card"><h4>${name}</h4><p>${details.description}</p><p><strong>Schedule:</strong> ${details.schedule}</p></div>`
          )
          .join("");
      }
    }

    if (currentUser.role === "admin") {
      adminActivitySummary.innerHTML = Object.entries(activities)
        .map(([name, details]) => {
          const participantList = details.participants.length
            ? `<ul>${details.participants
                .map((email) => `<li>${email}</li>`)
                .join("")}</ul>`
            : "<p><em>No participants yet.</em></p>";
          return `
            <div class="activity-card">
              <h4>${name}</h4>
              <p>${details.description}</p>
              <p><strong>Participants (${details.participants.length}):</strong></p>
              ${participantList}
            </div>`;
        })
        .join("");
    }
  }

  async function loadCurrentUser() {
    if (!authToken) {
      currentUser = null;
      renderAuthState();
      return;
    }

    try {
      const response = await fetch("/users/me", {
        headers: getAuthHeaders(),
      });

      if (!response.ok) {
        throw new Error("Unable to verify session");
      }

      currentUser = await response.json();
    } catch (error) {
      authToken = null;
      localStorage.removeItem("authToken");
      currentUser = null;
      console.warn("Clearing invalid session", error);
    }

    renderAuthState();
  }

  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();

      if (response.ok) {
        setStatusMessage(messageDiv, result.message, "success");
        fetchActivities();
      } else {
        setStatusMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      setStatusMessage(messageDiv, "Failed to unregister. Please try again.", "error");
      console.error("Error unregistering:", error);
    }

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatusMessage(loginMessage);

    const email = document.getElementById("login-email").value;
    const password = document.getElementById("login-password").value;

    try {
      const response = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const result = await response.json();

      if (response.ok) {
        authToken = result.token;
        localStorage.setItem("authToken", authToken);
        currentUser = result.user;
        setStatusMessage(loginMessage, "Login successful.", "success");
        renderAuthState();
        fetchActivities();
      } else {
        setStatusMessage(loginMessage, result.detail || "Login failed.", "error");
      }
    } catch (error) {
      setStatusMessage(loginMessage, "Login failed. Please try again.", "error");
      console.error("Login error:", error);
    }
  });

  registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatusMessage(registerMessage);

    const username = document.getElementById("register-username").value;
    const email = document.getElementById("register-email").value;
    const password = document.getElementById("register-password").value;
    const role = document.getElementById("register-role").value;

    try {
      const response = await fetch("/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, email, password, role }),
      });

      const result = await response.json();
      if (response.ok) {
        setStatusMessage(registerMessage, "Registration successful. Please log in.", "success");
        registerForm.reset();
      } else {
        setStatusMessage(registerMessage, result.detail || "Registration failed.", "error");
      }
    } catch (error) {
      setStatusMessage(registerMessage, "Registration failed. Please try again.", "error");
      console.error("Registration error:", error);
    }
  });

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearStatusMessage(messageDiv);

    const activity = activitySelect.value;
    let email = emailInput.value;
    if (currentUser && currentUser.role === "student") {
      email = currentUser.email;
    }

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: getAuthHeaders(),
        }
      );

      const result = await response.json();
      if (response.ok) {
        setStatusMessage(messageDiv, result.message, "success");
        if (!currentUser || currentUser.role !== "student") {
          signupForm.reset();
        }
        fetchActivities();
      } else {
        setStatusMessage(messageDiv, result.detail || "An error occurred", "error");
      }
    } catch (error) {
      setStatusMessage(messageDiv, "Failed to sign up. Please try again.", "error");
      console.error("Error signing up:", error);
    }

    setTimeout(() => {
      messageDiv.classList.add("hidden");
    }, 5000);
  });

  logoutBtn.addEventListener("click", () => {
    authToken = null;
    currentUser = null;
    localStorage.removeItem("authToken");
    renderAuthState();
    setStatusMessage(messageDiv, "Logged out successfully.", "info");
  });

  loadCurrentUser().then(fetchActivities);
});
