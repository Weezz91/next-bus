const themeBtn = document.getElementById("themeToggle");

// Apply saved theme
const savedTheme = localStorage.getItem("theme");
if (savedTheme === "dark") {
  document.body.classList.add("dark");
  themeBtn.textContent = "☀️";
}

themeBtn?.addEventListener("click", () => {
  document.body.classList.toggle("dark");
  const isDark = document.body.classList.contains("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
  themeBtn.textContent = isDark ? "☀️" : "🌙";
});

const elAddress = document.querySelector("#address");
const elRadius = document.querySelector("#radius");
const elRefresh = document.querySelector("#refresh");
const elList = document.querySelector("#list");
const elStatus = document.querySelector("#status");
const elMeta = document.querySelector("#meta");

function fmtTime(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString("fi-FI", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function minutesUntil(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  return Math.max(0, Math.round(ms / 60000));
}

async function load() {
  elStatus.textContent = "Loading…";
  elList.innerHTML = "";
  elMeta.textContent = "";

  const url = new URL("/api/next", window.location.origin);
  url.searchParams.set("address", elAddress.value.trim());
  url.searchParams.set("radius", String(Number(elRadius.value || 700)));

  const res = await fetch(url);
  const data = await res.json();

  if (!res.ok) {
    elStatus.textContent = data?.error || "Failed";
    return;
  }

  elMeta.textContent = `Address used: ${data.addressUsed} • radius ${data.radius}m`;

  if (!data.results.length) {
    elStatus.textContent = "No matching departures found nearby right now.";
    return;
  }

  elStatus.textContent = `Updated ${new Date().toLocaleTimeString()}`;

  for (const r of data.results) {
    const li = document.createElement("li");
    li.className = "row";
    li.innerHTML = `
      <div class="line">${r.line}</div>
      <div class="main">
        <div><strong>${fmtTime(r.time)}</strong> (${minutesUntil(r.time)} min)</div>
        <div class="muted">${r.stopName} • ${r.distanceM} m • ${r.headsign}${r.realtime ? " • realtime" : ""}</div>
      </div>
    `;
    elList.appendChild(li);
  }
}

elRefresh.addEventListener("click", load);

load();
setInterval(load, 20000);