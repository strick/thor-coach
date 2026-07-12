// Login page: surface auth-callback errors and carry the intended destination
// (?next=/page.html) through the sign-in round-trip.
const params = new URLSearchParams(location.search);
const msg = document.getElementById("login-msg");

const error = params.get("error");
if (error) {
  msg.textContent = error;
  msg.classList.add("error");
  msg.hidden = false;
} else if (params.has("signedout")) {
  msg.textContent = "Signed out.";
  msg.hidden = false;
}

const next = params.get("next");
if (next && next.startsWith("/") && !next.startsWith("//") && !next.includes("\\")) {
  document.getElementById("ms-btn").href = `/auth/login?next=${encodeURIComponent(next)}`;
}
