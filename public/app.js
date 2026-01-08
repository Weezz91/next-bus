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
const elTowards = document.querySelector("#tblTowards");
const elAway = document.querySelector("#tblAway");
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
  elTowards.innerHTML = "";
  elAway.innerHTML = "";
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

const towards = [];
const away = [];

for (const r of data.results) {
  (isTowards(r) ? towards : away).push(r);
}

elTowards.innerHTML =
  towards.map(rowHtml).join("") ||
  `<tr><td colspan="2" class="muted">Ei lähtöjä juuri nyt</td></tr>`;

elAway.innerHTML =
  away.map(rowHtml).join("") ||
  `<tr><td colspan="2" class="muted">Ei lähtöjä juuri nyt</td></tr>`;

}

elRefresh.addEventListener("click", load);

function normalize(s) {
  return (s || "").toLowerCase();
}

// määrittelee “kohti”-suunnan poikkeussäännöillä
function isTowards(r) {
  const line = r.line;
  const head = normalize(r.headsign);

  // 111/114: kohti Matinkylä (M)
  if (line === "111" || line === "114") {
    return head.includes("matinkyl");
  }

  // 164/164K: kohti Kamppi
  if (line === "164" || line === "164K" || line === "164k") {
    return head.includes("kamppi");
  }

  // muut (jos joskus lisäät) -> oletus “away”
  return false;
}

function rowHtml(r) {
  return `
    <tr>
      <td class="colLine">${r.line}</td>
      <td>
        <strong>${fmtTime(r.time)}</strong> (${minutesUntil(r.time)} min)
        <span class="muted">${r.stopName} • ${r.distanceM} m • ${r.headsign || ""}${r.realtime ? " • realtime" : ""}</span>
      </td>
    </tr>
  `;
}


load();

setInterval(load, 20000);
